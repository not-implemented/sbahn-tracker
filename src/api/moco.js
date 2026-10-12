import * as L from 'leaflet';

const MOCO_URL = 'https://api.geops.io/moco3/v1/s-bahn-munchen/export/';
// geographic coordinates (EPSG:3857) - "tralis_schematic_sbm" would be the schematic network plan:
const MAP_GRAPH = 'tralis100_sbm';

// current disruptions, including the affected stops and line sections for the map
export async function fetchDisruptions(signal) {
    const { results } = await fetchExport(
        {
            publicNow: 'true',
            includeStops: 'true',
            includeLines: 'true',
            graph: MAP_GRAPH,
        },
        signal,
    );
    return results.map((disruption) => ({
        ...parseDisruption(disruption),
        ...parseGeometry(disruption),
    }));
}

// The API always sorts ascending by an internal start date (roughly the affected start, not exactly)
// and has no filter for "publication has ended" -> page
// backwards from the end of the complete list and drop the ones which are still (or not yet) published.
// New disruptions shift the page boundaries only towards the end, so this can lead to duplicates
// (to be filtered by the caller), but never skips one.
const HISTORIC_PAGE_SIZE = 20;

// Returns the disruptions (newest first) and the `before` for the next page - 0 if there are no more.
export async function fetchHistoricDisruptions(before, signal) {
    before ??= (await fetchExport({ limit: '1' }, signal)).totalCount;
    if (before <= 0) return { disruptions: [], nextBefore: 0 };

    const offset = Math.max(before - HISTORIC_PAGE_SIZE, 0);
    const { results } = await fetchExport(
        { limit: String(before - offset), offset: String(offset) },
        signal,
    );

    const now = new Date();
    const disruptions = results
        .filter(
            (disruption) =>
                disruption.publicationWindowsEnd &&
                new Date(disruption.publicationWindowsEnd) < now,
        )
        .reverse()
        .map(parseDisruption);

    return { disruptions, nextBefore: offset };
}

async function fetchExport(params, signal) {
    params = new URLSearchParams({
        // affected stops and line sections incl. geometry - only needed for the map (current disruptions)
        // e.g. for disruption: "S 2 Markt Schwaben ↔ Erding: Haltausfälle St. Koloman und Aufhausen"
        // stops would include 'St Koloman' and 'Aufhausen(b Erding)
        includeStops: 'false',
        includeLines: 'false',
        ...params,
    });

    const response = await fetch(MOCO_URL + '?' + params, { signal });
    if (!response.ok) throw new Error(`MOCO API responded with HTTP ${response.status}`);

    const data = await response.json();
    return data.paginatedSituations;
}

function parseDisruption(disruption) {
    const texts = disruption.publications.map((publication) => publication.textualContentLarge?.de);

    return {
        id: disruption.id,
        title: disruption.title,
        isConstruction: (disruption.reasons ?? []).some(({ name }) => name === 'CONSTRUCTION'),
        // line names sometimes include spaced ('S 1' vs 'S1')
        lineNames: [
            ...new Set(disruption.publicationLineNames.map((name) => name.replace(/\s+/g, ''))),
        ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
        publishedAt: disruption.publicationWindowsStart,
        affectedStart: disruption.affectedTimeIntervalsStart,
        affectedEnd: disruption.affectedTimeIntervalsEnd,
        content: texts
            .flatMap((text) =>
                text ? [text.description, text.consequence, text.recommendation] : [],
            )
            .filter(Boolean)
            .join(''),
    };
}

// affected stops (points) and line sections (polylines), as [lat, lng]
function parseGeometry(disruption) {
    const getGeoms = (geometries) =>
        geometries.filter(({ graph }) => graph === MAP_GRAPH).map(({ geom }) => geom);

    const stops = disruption.publications.flatMap((publication) =>
        publication.publicationStops.flatMap((stop) =>
            getGeoms(stop.geometry)
                .filter((geom) => geom.type === 'Point')
                .map((geom) => ({ name: stop.name, coordinates: toLatLng(geom.coordinates) })),
        ),
    );

    const lineSections = disruption.publications.flatMap((publication) =>
        publication.publicationLines.flatMap(({ lines }) =>
            lines.flatMap((line) =>
                getGeoms(line.geometry).flatMap((geom) => {
                    if (geom.type === 'LineString') return [geom.coordinates.map(toLatLng)];
                    if (geom.type === 'MultiLineString') {
                        return geom.coordinates.map((coordinates) => coordinates.map(toLatLng));
                    }
                    return [];
                }),
            ),
        ),
    );

    return { stops, lineSections };
}

function toLatLng([x, y]) {
    const latLng = L.CRS.EPSG3857.unproject(L.point(x, y));
    return [latLng.lat, latLng.lng];
}
