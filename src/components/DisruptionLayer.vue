<script setup lang="ts">
import { computed, onMounted, onUnmounted, toRaw, watch } from 'vue';
import * as L from 'leaflet';

type Disruption = {
    id: string;
    title: string;
    stops?: { name: string; coordinates: L.LatLngTuple }[];
    lineSections?: L.LatLngTuple[][];
    isConstruction?: boolean;
};

const props = defineProps<{
    disruptions: Disruption[];
    map: L.Map;
}>();

const COLOR = '#e3000f';
const CONSTRUCTION_COLOR = '#ffd000';
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

    for (const disruption of props.disruptions) {
        const popup = createPopup(disruption);
        const color = disruption.isConstruction ? CONSTRUCTION_COLOR : COLOR;

        for (const lineSection of disruption.lineSections ?? []) {
            L.polyline(lineSection, { pane, color, weight: 16, opacity: 0.7 })
                .bindPopup(popup)
                .addTo(layerGroup);
        }

        for (const stop of disruption.stops ?? []) {
            L.circleMarker(stop.coordinates, {
                pane,
                radius: 12,
                weight: 4,
                color,
                opacity: 0.8,
                fillColor: color,
                fillOpacity: 0.2,
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
        props.disruptions.map(({ id, title, stops, lineSections, isConstruction }) => [
            id,
            title,
            stops,
            lineSections,
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
