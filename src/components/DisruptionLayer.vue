<script setup lang="ts">
import { computed, onMounted, onUnmounted, toRaw, watch } from 'vue';
import * as L from 'leaflet';
import type { Disruption, DisruptionGeometry, DisruptionLevel } from '../api/moco';

const props = defineProps<{
    disruptions: (Disruption & DisruptionGeometry)[];
    map: L.Map;
}>();

// color by impact on passengers (see DisruptionLevel), construction work is dashed:
const LEVEL_STYLES: Record<DisruptionLevel, string> = {
    0: '#9e9e9e', // information / ended
    1: '#ffc400', // delays / changes
    2: '#008080', // fewer trains
    3: '#e3000f', // no trains
};
const PANE = 'disruptions';

const layerGroup = L.layerGroup();

// below stations and trains (overlayPane: 400), so these stay clickable:
function getPane(map: L.Map) {
    if (!map.getPane(PANE)) map.createPane(PANE).style.zIndex = '350';
    return PANE;
}

function createPopup(disruption: Disruption) {
    const content = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = disruption.title;
    const link = document.createElement('a');
    link.href = '#/newsticker?disruption=' + encodeURIComponent(disruption.id);
    link.textContent = 'Details im Newsticker';
    content.append(title, document.createElement('br'), link);
    return content;
}

function render() {
    const map = toRaw(props.map);
    const pane = getPane(map);
    layerGroup.clearLayers();

    // most severe last, so it is on top of others on the same line section:
    const disruptions = [...props.disruptions].sort((a, b) => a.level - b.level);

    for (const disruption of disruptions) {
        const popup = createPopup(disruption);
        const color = LEVEL_STYLES[disruption.level];

        for (const lineSection of disruption.lineSections) {
            L.polyline(lineSection, {
                pane,
                color,
                weight: 16,
                opacity: 0.7,
                // round caps would fill the gaps:
                ...(disruption.isConstruction ? { dashArray: '16 12', lineCap: 'butt' } : {}),
            })
                .bindPopup(popup)
                .addTo(layerGroup);
        }

        for (const stop of disruption.stops) {
            L.circleMarker(stop.coordinates, {
                pane,
                radius: 12,
                weight: 4,
                color,
                opacity: 0.8,
                fillColor: color,
                fillOpacity: 0.2,
                ...(disruption.isConstruction ? { dashArray: '6 4' } : {}),
            })
                .bindPopup(popup)
                .bindTooltip(stop.name)
                .addTo(layerGroup);
        }
    }
}

// disruptions are re-fetched every minute - only redraw (and close open popups) on actual changes:
const signature = computed(() =>
    JSON.stringify(
        props.disruptions.map(({ id, title, stops, lineSections, level, isConstruction }) => [
            id,
            title,
            stops,
            lineSections,
            level,
            isConstruction,
        ]),
    ),
);
watch(signature, render);

onMounted(() => {
    render();
    layerGroup.addTo(toRaw(props.map));
});

onUnmounted(() => {
    layerGroup.remove();
});
</script>

<template>
    <div style="display: none"></div>
</template>
