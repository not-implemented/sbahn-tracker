<script setup>
import { computed, ref, onMounted, onUnmounted, watch, watchEffect, toRaw } from 'vue';
import * as L from 'leaflet';
import { useOptionsStore } from '../stores/options';

const defaultCoordinates = [47.9052567, 11.3084582]; // Starnberger See als "Fallback"

const props = defineProps({
    map: {
        type: Object,
        required: true,
    },

    train: {
        type: Object,
        required: true,
    },
});

const options = useOptionsStore();
const svg = ref();
const heading = ref();
let mapMarker;

// ignore clicks when dragged the map directly at a mapMarkerSvgNode:
let handleClick = false;
let mapMoveHandler = () => (handleClick = false);

onMounted(() => {
    mapMarker = L.marker([0, 0], {
        icon: L.divIcon({
            html: svg.value,
            className: 'train-marker',
            iconSize: [50, 50],
            iconAnchor: [25, 25],
        }),
        opacity: 0.75,
        keyboard: false,
        interactive: false,
    });

    mapMarker.setLatLng(toRaw(props.train.coordinates) || defaultCoordinates);
    mapMarker.addTo(toRaw(props.map));

    toRaw(props.map).on('movestart', mapMoveHandler);
});

watch(
    () => props.train.coordinates,
    () => {
        mapMarker.setLatLng(toRaw(props.train.coordinates) || defaultCoordinates);
    },
);

watchEffect(() => {
    if (!svg.value || !heading.value) return;

    let viewBox = svg.value.viewBox.baseVal;
    heading.value.transform.baseVal
        .getItem(0)
        .setRotate(props.train.heading || 0, viewBox.width / 2, viewBox.height / 2);
});

onUnmounted(() => {
    toRaw(props.map).off('movestart', mapMoveHandler);

    mapMarker.remove();
});

function onMapMarkerClick(event) {
    if (!handleClick) return;
    if (!event.ctrlKey && !event.metaKey) options.trains.length = 0;

    let idx = options.trains.indexOf(props.train.id);
    if (idx === -1) options.trains.push(props.train.id);
    else options.trains.splice(idx, 1);

    //this.updateUrl();
}

const isSelected = computed(() => {
    return options.trains.includes(props.train.id);
});

// TODO: train.historyPath
// TODO: train.estimatedPath
</script>

<template>
    <div style="display: none">
        <svg
            ref="svg"
            :class="[isSelected ? 'is-selected' : null]"
            viewBox="0 0 10 10"
            version="1.1"
            xmlns="http://www.w3.org/2000/svg"
        >
            <!-- mouseover/mouseout: As "pointer-events: visiblePainted" only works in SVG, we can't use Leaflet's "riseOnHover" feature here -->
            <g
                :class="['container', !train.isActive ? 'inactive' : null]"
                @click="onMapMarkerClick"
                @mousedown="handleClick = true"
                @mouseover="mapMarker.setZIndexOffset(250)"
                @mouseout="mapMarker.setZIndexOffset(0)"
            >
                <g class="marker" :style="`fill: ${train.line.color}`">
                    <circle cy="5" cx="5" r="3" />
                    <path
                        ref="heading"
                        class="heading"
                        :class="{ 'is-unknown': train.heading === null }"
                        d="m 8,3.5 c 0.5692502,0.3737847 0.6334476,2.5249143 0,3 l 2,-1.5 z"
                        transform="rotate(0, 0, 0)"
                    />
                    <circle
                        v-if="!train.hasGpsCordinates"
                        class="no-gps-cordinates"
                        cy="2.5"
                        cx="5"
                        r="1"
                    />
                </g>
                <text
                    class="name"
                    :style="`fill: ${train.line.textColor}`"
                    x="2.8"
                    y="6.2"
                    textLength="4.5"
                    lengthAdjust="spacingAndGlyphs"
                >
                    {{ train.line.name }}
                </text>
            </g>
        </svg>
    </div>
</template>

<style scoped>
.train-marker .container {
    cursor: pointer;
    pointer-events: visiblePainted;
}
.train-marker .container.inactive {
    transform: scale(0.7);
    transform-origin: center;
    opacity: 0.6;
}
.train-marker .marker {
    stroke: #ffffff;
    stroke-width: 0.3;
}
.train-marker .no-gps-cordinates {
    fill: #ff4f4f;
}
.train-marker .no-gps-cordinates.hide {
    display: none;
}
.train-marker .is-selected .marker {
    stroke: #406fff;
}
.train-marker .heading.is-unknown {
    display: none;
}
.train-marker .name {
    font: bold 3px sans-serif;
}
</style>
