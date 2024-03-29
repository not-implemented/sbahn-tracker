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
let historyPath;
let estimatedPath;

// ignore clicks when dragged the map directly at a mapMarkerSvgNode:
let handleClick = false;
let mapMoveHandler = () => (handleClick = false);

const isSelected = computed(() => {
    return options.trains.includes(props.train.id);
});

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

    historyPath = L.polyline([], {
        color: '#406fff',
        weight: 3,
        keyboard: false,
        interactive: false,
    });
    historyPath.setLatLngs(props.train.historyPath);
    if (isSelected.value) historyPath.addTo(props.map);

    estimatedPath = L.polyline([], {
        color: '#406fff',
        weight: 5,
        dashArray: '2 10',
        keyboard: false,
        interactive: false,
    });
    estimatedPath.setLatLngs(props.train.estimatedPath);
    if (isSelected.value) estimatedPath.addTo(props.map);
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

watch(
    () => props.train.historyPath[props.train.historyPath.length - 1],
    () => {
        historyPath.setLatLngs(props.train.historyPath);
    },
);

watch(
    () => props.train.estimatedPath,
    () => {
        estimatedPath.setLatLngs(props.train.estimatedPath);
    },
);

watch(
    () => isSelected.value,
    () => {
        if (isSelected.value) historyPath.addTo(props.map);
        else historyPath.remove();

        if (isSelected.value) estimatedPath.addTo(props.map);
        else estimatedPath.remove();
    },
);

onUnmounted(() => {
    toRaw(props.map).off('movestart', mapMoveHandler);

    mapMarker.remove();
    historyPath.remove();
    estimatedPath.remove();
});

function onMapMarkerClick(event) {
    if (!handleClick) return;
    if (!event.ctrlKey && !event.metaKey) options.trains.length = 0;

    let idx = options.trains.indexOf(props.train.id);
    if (idx === -1) options.trains.push(props.train.id);
    else options.trains.splice(idx, 1);

    //this.updateUrl();
}

const typeText = computed(() => {
    let models = [...new Set(props.train.vehicles.map((v) => v.model))];
    models = models.length === 1 ? models : models.filter((model) => model !== null);
    let model = models.length === 1 ? models[0] : '!!!';

    let typeText = null;
    if (!props.train.hasGpsCordinates || model === null) {
        typeText = '???';
    } else if (model !== '423') {
        typeText = model;
    }

    return typeText;
});
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
            <defs>
                <radialGradient id="gradient-green">
                    <stop stop-color="#33ff6d" offset=".05" />
                    <stop stop-color="#04d461" offset=".9" />
                </radialGradient>
                <radialGradient id="gradient-yellow">
                    <stop stop-color="#ffe060" offset=".2" />
                    <stop stop-color="#fac412" offset=".9" />
                </radialGradient>
                <radialGradient id="gradient-red">
                    <stop stop-color="#ee665f" offset=".2" />
                    <stop stop-color="#df413a" offset=".9" />
                </radialGradient>
            </defs>
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
                    <!--
                    // Berechnung Kreisabschnitt:
                    let angle = 120 * Math.PI / 180, center = 5, fullRadius = 3, strokeWidth = 0.3, radius = fullRadius - strokeWidth / 2;
                    let deltaX = radius * Math.sin(angle / 2), deltaY = radius * Math.cos(angle / 2);
                    console.log('M ' + (center - deltaX) + ' ' + (center + deltaY) + ' A ' + radius + ' ' + radius + ' 0 0 0 ' + (center + deltaX) + ' ' + (center + deltaY));
                    -->
                    <path
                        class="type"
                        :class="{ show: typeText !== null }"
                        d="M 2.5318 6.425 A 2.85 2.85 0 0 0 7.4682 6.425"
                    />
                    <text
                        class="type-text"
                        x="3.7"
                        y="7.6"
                        textLength="2.6"
                        lengthAdjust="spacingAndGlyphs"
                    >
                        {{ typeText }}
                    </text>
                    <circle
                        class="state"
                        :class="{
                            driving: train.state === 'DRIVING',
                            stopped: train.state === 'STOPPED',
                            boarding: train.state === 'BOARDING',
                        }"
                        cy="3"
                        cx="5"
                        r="0.5"
                    />
                    <path
                        ref="heading"
                        class="heading"
                        :class="{ 'is-unknown': train.heading === null }"
                        d="m 8,3.5 A 3.3 3.3 0 0 1 8,6.5 l 2,-1.5 z"
                        transform="rotate(0, 0, 0)"
                    />
                </g>
                <text
                    class="name"
                    :style="`fill: ${train.line.textColor}`"
                    x="2.7"
                    y="6.2"
                    textLength="4.6"
                    lengthAdjust="spacingAndGlyphs"
                >
                    {{ train.line.name }}
                </text>
                <g
                    class="delay-container"
                    :class="{ show: train.currentStationDepartureDelay >= 180000 }"
                >
                    <rect class="badge" x="5.9" y="1.1" width="4" height="2.4" rx="0.75" />
                    <text
                        class="delay"
                        x="7.9"
                        y="2.5"
                        dominant-baseline="middle"
                        text-anchor="middle"
                    >
                        {{ '+' + Math.round(train.currentStationDepartureDelay / 60000) }}
                    </text>
                </g>
                <g class="outdated-container" :class="{ show: train.lastUpdateMinutes >= 3 }">
                    <rect class="badge" x="1.2" y="1.1" width="2.8" height="2.4" rx="0.75" />
                    <g class="outdated" transform="translate(1.5, 1.2) scale(0.045)">
                        <path
                            d="M42 2l-17.18 17.18 17.18 17.18v-34.36zm-32.45 7l-2.55 2.54 12.73 12.73-17.73 17.73h35.45l4 4 2.55-2.55-34.45-34.45z"
                        />
                        <path d="M0 0h48v48h-48z" fill="none" />
                    </g>
                </g>
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
.train-marker .type {
    stroke: none;
}
.train-marker .type.show {
    fill: #fffc;
}
.train-marker .type-text {
    font: bold 1.3px sans-serif;
    fill: #333;
    stroke: none;
}
.train-marker .state {
    stroke-width: 0.1;
    stroke-opacity: 0.85;
}
.train-marker .state.driving {
    fill: url(#gradient-green);
    stroke: #02da53;
}
.train-marker .state.boarding {
    fill: url(#gradient-yellow);
    stroke: #eab600;
}
.train-marker .state.stopped {
    fill: url(#gradient-red);
    stroke: #da251d;
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
.train-marker .badge {
    fill: #ffffff;
    stroke: none;
    stroke-width: 0.2;
}
.train-marker .delay-container {
    display: none;
}
.train-marker .delay-container.show {
    display: unset;
}
.train-marker .delay {
    font: bold 1.6px sans-serif;
    fill: #df3333;
    stroke: none;
}
.train-marker .outdated-container {
    display: none;
}
.train-marker .outdated-container.show {
    display: unset;
}
.train-marker .outdated {
    fill: #7f7f7f;
}
</style>
