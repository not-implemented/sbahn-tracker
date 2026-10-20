import * as L from 'leaflet';

const MOCO_URL = 'https://api.geops.io/moco3/v1/s-bahn-munchen/export/';
// geographic coordinates (EPSG:3857) - "tralis_schematic_sbm" would be the schematic network plan:
const MAP_GRAPH = 'tralis100_sbm';

// impact on passengers (not the cause - construction work can be anything from 1 to 3):
// 0: only information or the disruption has ended ("Endmeldung")
// 1: trains run, but delayed or changed (diversion, adjusted timetable, skipped stops)
// 2: fewer trains, e.g. "Ausfall des 10-Minuten-Takts", or a general disruption
// 3: no trains at all (possibly replacement buses)
export type DisruptionLevel = 0 | 1 | 2 | 3;

export type Disruption = {
    id: string;
    title: string;
    level: DisruptionLevel;
    isConstruction: boolean;
    lineNames: string[];
    publishedAt: string;
    affectedStart: string;
    affectedEnd: string;
    content: string;
};

export type DisruptionGeometry = {
    stops: { name: string; coordinates: L.LatLngTuple }[];
    lineSections: L.LatLngTuple[][];
};

type MocoGeometry = {
    graph: string;
    geom: GeoJSON.Geometry;
};

type MocoPublication = {
    serviceCondition: string;
    serviceConditionGroup: string;
    textualContentLarge?: {
        de?: { description?: string; consequence?: string; recommendation?: string };
    };
    // only with includeStops / includeLines:
    publicationStops: { name: string; geometry: MocoGeometry[] }[];
    publicationLines: { lines: { name: string; geometry: MocoGeometry[] }[] }[];
};

type MocoSituation = {
    id: string;
    title: string;
    reasons: { name: string }[] | null;
    publicationLineNames: string[];
    publicationWindowsStart: string;
    publicationWindowsEnd: string | null;
    affectedTimeIntervalsStart: string;
    affectedTimeIntervalsEnd: string;
    publications: MocoPublication[];
};

// current disruptions, including the affected stops and line sections for the map
export async function fetchDisruptions(
    signal?: AbortSignal,
): Promise<(Disruption & DisruptionGeometry)[]> {
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
export async function fetchHistoricDisruptions(
    before: number | undefined,
    signal?: AbortSignal,
): Promise<{ disruptions: Disruption[]; nextBefore: number }> {
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

async function fetchExport(
    params: Record<string, string>,
    signal?: AbortSignal,
): Promise<{ totalCount: number; results: MocoSituation[] }> {
    const searchParams = new URLSearchParams({
        // affected stops and line sections incl. geometry - only needed for the map (current disruptions)
        // e.g. for disruption: "S 2 Markt Schwaben ↔ Erding: Haltausfälle St. Koloman und Aufhausen"
        // stops would include 'St Koloman' and 'Aufhausen(b Erding)
        includeStops: 'false',
        includeLines: 'false',
        ...params,
    });

    const response = await fetch(MOCO_URL + '?' + searchParams, { signal });
    if (!response.ok) throw new Error(`MOCO API responded with HTTP ${response.status}`);

    const data = await response.json();
    return data.paginatedSituations;
}

function parseDisruption(disruption: MocoSituation): Disruption {
    const texts = disruption.publications.map((publication) => publication.textualContentLarge?.de);

    return {
        id: disruption.id,
        title: disruption.title,
        level: getLevel(disruption),
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

// "severity" is always UNDEFINED, so the service condition is the only indicator of the impact.
// The generic DISRUPTION mostly means "Verspätungen und Teilausfälle", not a closed line.
const SERVICE_CONDITION_LEVELS: Record<string, DisruptionLevel> = {
    DISCONTINUED_OPERATION: 3,
    REPLACEMENT_RIDE: 3,
    TRIP_CANCELLATION: 2,
    LIMITED_OPERATION: 2,
    DISRUPTION: 2,
    MAJOR_DELAYS: 1,
    IRREGULAR_TRAFFIC: 1,
    DIVERTED: 1,
    STOP_MOVED: 1,
};

function getLevel(disruption: MocoSituation): DisruptionLevel {
    // Once a disruption has ended, the message is still published for ~15 minutes, with a new title
    // and text, but the service condition of the actual disruption.
    // ("... beendet" in the title is not the end though - usually there are still follow-up delays.)
    if (/^\W*Endmeldung/i.test(disruption.title)) return 0;

    const levels = disruption.publications.map(
        ({ serviceCondition, serviceConditionGroup }) =>
            SERVICE_CONDITION_LEVELS[serviceCondition] ??
            (serviceConditionGroup === 'INFORMATION' ? 0 : 2),
    );
    return Math.max(0, ...levels) as DisruptionLevel;
}

// affected stops (points) and line sections (polylines), as [lat, lng]
function parseGeometry(disruption: MocoSituation): DisruptionGeometry {
    const getGeoms = (geometries: MocoGeometry[]) =>
        geometries.filter(({ graph }) => graph === MAP_GRAPH).map(({ geom }) => geom);

    const stops = disruption.publications.flatMap((publication) =>
        publication.publicationStops.flatMap((stop) =>
            getGeoms(stop.geometry).flatMap((geom) =>
                geom.type === 'Point'
                    ? [{ name: stop.name, coordinates: toLatLng(geom.coordinates) }]
                    : [],
            ),
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

function toLatLng([x, y]: GeoJSON.Position): L.LatLngTuple {
    const latLng = L.CRS.EPSG3857.unproject(L.point(x, y));
    return [latLng.lat, latLng.lng];
}
