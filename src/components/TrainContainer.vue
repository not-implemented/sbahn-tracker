<script setup>
import { computed, toRef, ref, watch, toRaw } from 'vue';
import { useStore } from '../stores/main';
import { useOptionsStore } from '../stores/options';
import LineLogo from './LineLogo.vue';

const props = defineProps({
    train: {
        type: Object,
        required: true,
    },
});

const store = useStore();
const options = useOptionsStore();
const train = toRef(props, 'train');

function getStationName(stationId, emptyName) {
    if (stationId === null) return emptyName || '';
    const station = store.stations[stationId];
    return (station && station.name) || stationId;
}

const trainNumber = computed(() => {
    return train.value.number && !train.value.numberIsNormal
        ? '(' + train.value.number + ')'
        : train.value.number || '';
});

const headerStyle = computed(() => {
    // alpha 12.5%
    return `background-color: ${train.value.line.color}20;`;
});

const progress = computed(() => {
    function calcDistance(coords1, coords2) {
        const deg2rad = (number) => (number / 180) * Math.PI;
        coords1 = coords1.map(deg2rad);
        coords2 = coords2.map(deg2rad);

        let distanceRadian = Math.acos(
            Math.sin(coords1[0]) * Math.sin(coords2[0]) +
                Math.cos(coords1[0]) * Math.cos(coords2[0]) * Math.cos(coords2[1] - coords1[1]),
        );
        let distanceSm = (distanceRadian / Math.PI) * 180 * 60;
        let distanceKm = distanceSm * 1.853248777; // Seemeile bezogen auf den mittleren Erdradius von 6371 km

        return distanceKm;
    }

    if (train.value.state === 'BOARDING') return 0;
    if (train.value.coordinates === null) return 0;

    let currentStation = store.stations[train.value.currentStationId];
    let nextStation = store.stations[train.value.nextStationId];

    if (!currentStation || !currentStation.coordinates) return 0;
    if (!nextStation || !nextStation.coordinates) return 0;

    let distanceToCurrent = calcDistance(train.value.coordinates, currentStation.coordinates);
    let distanceToNext = calcDistance(train.value.coordinates, nextStation.coordinates);

    return (distanceToCurrent / (distanceToCurrent + distanceToNext)) * 100;
});

const progressBarStyle = computed(() => {
    return `width: ${progress.value}%`;
});

function toggleSelect() {
    const idx = options.trains.indexOf(train.value.id);
    if (idx === -1) options.trains.push(train.value.id);
    else options.trains.splice(idx, 1);
}

function selectStation(stationId) {
    options.station = stationId;
}

const isSelected = computed(() => {
    return options.trains.includes(train.value.id);
});

function formatTime(timestamp) {
    if (timestamp === null) return '';
    return new Date(timestamp).toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatDuration(duration) {
    let isNegative = duration < 0;
    duration = Math.round(Math.abs(duration / 1000));

    let minutes = Math.floor(duration / 60);
    let seconds = duration - minutes * 60;
    let durationStr = minutes + ':' + (seconds < 10 ? '0' : '') + seconds;

    return (isNegative ? '-' : '') + durationStr;
}

const trainClass = computed(() => {
    return [
        'train',
        train.value.state === 'DRIVING' ? 'train-driving' : null,
        train.value.state === 'STOPPED' ? 'train-stopped' : null,
        train.value.state === 'BOARDING' ? 'train-boarding' : null,
        !train.value.isActive ? 'train-inactive' : null,
        train.value.line.id === 0 ? 'train-sided' : null,
        showChanged.value ? 'changed' : null,
    ];
});

const vehicleClass = (vehicle) => {
    const vehicleInfo = toRaw(store.vehicleInfos[vehicle.id]) || {};
    return [
        'vehicle',
        vehicle.isReverse !== null ? (vehicle.isReverse ? 'is-reverse' : 'is-forward') : null,
        vehicleInfo.isModern === true ? 'is-modern' : null,
        vehicleInfo.isModern === false ? 'is-classic' : null,
        vehicleInfo.isTagged ? 'is-tagged' : null,
        vehicleInfo.hasWiFi === true ? 'has-wifi' : null,
        vehicleInfo.hasWiFi === false ? 'has-no-wifi' : null,
    ];
};

const lastUpdateText = computed(() => {
    return train.value.lastUpdateMinutes >= 1
        ? 'Keine Info seit ' + train.value.lastUpdateMinutes + 'min'
        : '';
});

const showChanged = ref(false);
watch(
    [
        () => train.value.line?.id,
        () => train.value.number,
        () => train.value.destinationId,
        () => train.value.state,
        () => train.value.currentStationId,
    ],
    () => {
        showChanged.value = true;
        setTimeout(() => (showChanged.value = false), 1500);
    },
);
</script>

<template>
    <li :class="trainClass">
        <header :style="headerStyle" class="train-header">
            <div class="train-line">
                <LineLogo :line="train.line" />
            </div>

            <h2 class="destination">
                <a href="" @click.prevent="selectStation(train.destinationId)">{{
                    getStationName(train.destinationId, 'Nicht einsteigen')
                }}</a>
            </h2>
        </header>

        <main class="train-main">
            <ul class="stations">
                <li class="station-prev">
                    <span class="strip">
                        <span class="time"></span>
                        <span class="delay"></span>
                        <span class="name">
                            {{ getStationName(train.prevStationId) }}
                        </span>
                    </span>
                </li>

                <li class="station-current">
                    <span class="strip">
                        <span class="time">
                            {{ formatTime(train.currentStationDepartureTime) }}
                        </span>
                        {{ ' ' }}
                        <span v-if="train.currentStationDepartureDelay" class="delay">
                            {{ '(+' + formatDuration(train.currentStationDepartureDelay) + ')' }}
                        </span>
                        {{ ' ' }}
                        <span class="name">
                            <a href="" @click.prevent="selectStation(train.currentStationId)">{{
                                getStationName(train.currentStationId)
                            }}</a>
                        </span>
                    </span>
                </li>

                <li class="station-next">
                    <span class="strip">
                        <span class="time">
                            {{ formatTime(train.nextStationDepartureTime) }}
                        </span>
                        {{ ' ' }}
                        <span v-if="train.nextStationDepartureDelay" class="delay">
                            {{ '(+' + formatDuration(train.nextStationDepartureDelay) + ')' }}
                        </span>
                        {{ ' ' }}
                        <span class="name">
                            <a href="" @click.prevent="selectStation(train.nextStationId)">{{
                                getStationName(train.nextStationId)
                            }}</a>
                        </span>
                    </span>
                </li>
            </ul>

            <div class="progress">
                <div class="bar" :style="progressBarStyle" />
            </div>
        </main>

        <aside class="train-aside">
            <span class="train-number" title="Zugnummer">{{ trainNumber }}</span>

            <div class="vehicles-wrapper">
                <ul class="vehicles">
                    <li
                        v-for="(vehicle, index) in train.vehicles"
                        :key="index"
                        :class="vehicleClass(vehicle)"
                    >
                        <span class="number" title="Fahrzeugnummer">{{ vehicle.number }}</span>
                    </li>
                </ul>
                <span class="train-model" title="Baureihe">{{
                    'BR ' + [...new Set(train.vehicles.map((v) => v.model ?? '???'))].join(', ')
                }}</span>
            </div>

            <a class="action-link" href="" @click.prevent="toggleSelect">
                {{ isSelected ? '×' : 'ℹ' }}
            </a>
        </aside>

        <div class="last-update">{{ lastUpdateText }}</div>
    </li>
</template>

<style scoped>
/* train card item */
.train {
    position: relative;
    border-radius: 0.6rem;
    background: #fff;
    box-shadow: 0 0.1rem 0.3rem 0 rgba(0, 0, 0, 0.15);

    display: flex;
    flex-direction: column;
    transition: background-color 0.5s ease-in;
}
.train-inactive {
    opacity: 0.5;
}
:not(.train-sided) + .train-sided,
.train-sided + :not(.train-sided) {
    grid-column-start: 1;
}
.train.changed {
    background-color: #ffec86;
    transition: none;
}
/* line-number and destination */
.train-header {
    order: 3;
    flex: 0 0 auto;
    padding: 0.6rem 0.7rem;
    border-radius: 0 0 0.6rem 0.6rem;
    background: #e0e0e0;

    display: flex;
    align-items: center;
}
.train-line {
    flex: 0 0 4rem;
}
.destination {
    flex: 1 1 auto;
    display: inline-block;
    font-size: 1.5rem;
    line-height: 1;
    width: auto;
    max-width: 100%;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.destination a {
    color: inherit;
    text-decoration: none;
}
/* /line-number and destination */
/* list of prev, current and next station */
.train-main {
    position: relative;
    order: 2;
    flex: 1 0 auto;
    padding: 0.6rem 0.7rem;

    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: stretch;
}
.stations {
    flex: 0 0 auto;
    position: relative;
    padding-left: 0;
    list-style: none;
    color: #606060;
}
[class^='station-'] {
    padding: 0 0 0 4rem;
}
.stations .time {
    font-size: smaller;
    color: #a0a0a0;
}
.stations .delay {
    font-size: smaller;
    color: #df3333;
}
.stations .name a {
    color: inherit;
    text-decoration: none;
}
.station-prev {
    display: none; /* TODO */
}
.station-current {
    position: relative;
    margin-top: 0.9rem;
    margin-bottom: 1.2rem;
}
.station-current:empty {
    margin-bottom: 0;
}
.station-current:empty::after {
    content: 'Endhaltestelle';
    color: #a0a0a0;
}
.station-next {
    margin-bottom: 0.6rem;
}
.progress {
    position: absolute;
    left: 0;
    top: 50%;
    width: 4.8rem;
    height: 0.6rem;
    margin: 0;
    transform: rotate(90deg);
    background-color: #bdd9f3;
}
.progress .bar {
    width: 0;
    height: 100%;
    background-color: #2b68a1;
}
.progress .bar::after {
    content: '';
    display: block;
    height: 1.8rem;
    border-right: 0.3rem solid #2b68a1;
    transform: translateY(calc(-100% + 0.6rem));
}
.train-boarding .station-current .name {
    font-weight: bold;
}
/* /list of prev, current and next station */
/* train infos like number and vehicles */
.train-aside {
    order: 1;
    flex: 0 0 auto;
    padding: 0.6rem 0.7rem 0.5rem;
    border-bottom: 0.1rem solid #e0e0e0;

    display: flex;
    align-items: center;
}
.train .train-number {
    flex: 0 0 4rem;
    display: inline-block;
    margin: 0;
    font-size: 0.75em;
    line-height: 1.5rem;
    text-transform: uppercase;
    text-align: center;
    color: #a0a0a0;
}
.vehicles-wrapper {
    flex: 1 1 auto;
    margin: -0.1rem 0.3rem -0.2rem -0.3rem;
    padding-left: 0.3rem;
    padding-bottom: 0.3rem;
    font-size: 0;
    white-space: nowrap;
    overflow: hidden;
    background:
        linear-gradient(90deg, #c0c0c0 40%, transparent 40%) repeat-x left bottom / 1rem 0.2rem,
        linear-gradient(90deg, #cfcfcf 0%, #cfcfcf 100%) repeat-x left 0 bottom 0.2rem / 100% 0.1rem;
    animation: train-driving 1s infinite linear paused;
}
.train-driving .vehicles-wrapper {
    animation-play-state: running;
}
@keyframes train-driving {
    0% {
        background-position-x: 0;
    }
    100% {
        background-position-x: 1rem;
    }
}
.vehicles {
    display: inline-block;
    margin: 0;
    padding: 0;
    list-style: none;
}
.vehicle {
    position: relative;
    display: inline-block;
    background: #c0c0c0;
    margin: 0 0.1rem;
    padding: 0 0.8rem;
    border-radius: 0.2rem;
    font-size: 0.9rem;
    line-height: 1.5rem;
    font-weight: bold;
}
.vehicle:first-child {
    padding-left: 1.2rem;
    border-top-left-radius: 0.9rem;
}
.vehicle:last-child {
    padding-right: 0.8rem;
    border-top-right-radius: 0.45rem;
}
.vehicle.is-forward::before {
    content: '‹';
    position: absolute;
    left: 0.3rem;
    font-size: 1.2rem;
    line-height: 1.4rem;
    font-weight: bold;
}
.vehicle.is-forward:first-child::before {
    left: 0.6rem;
}
.vehicle.is-reverse::after {
    content: '›';
    position: absolute;
    right: 0.3rem;
    font-size: 1.2rem;
    line-height: 1.4rem;
    font-weight: bold;
}
.vehicle.is-classic {
    box-shadow: inset 0 -0.3rem 0 0 #d78a5b;
}
.vehicle.is-modern {
    box-shadow: inset 0 -0.3rem 0 0 #8ca9ee;
}
.vehicle.is-tagged {
    background-color: #e7e7e7;
}
.vehicle.has-wifi,
.vehicle.has-no-wifi {
    background-repeat: no-repeat;
    background-position: -1rem 0;
    background-size: 80% 80%;
}
.vehicle.has-wifi {
    background-image: url(../assets/images/wifi.svg);
}
.vehicle.has-no-wifi {
    background-image: url(../assets/images/wifi-no.svg);
}
.train-model {
    display: inline-block;
    margin-left: 0.3rem;
    font-size: 0.9rem;
    line-height: 1.5rem;
    color: #a0a0a0;
}
.action-link {
    font-size: 1.5rem;
    line-height: 1.3rem;
    width: 1em;
    height: 1em;
    text-align: center;
    text-decoration: none;
    border: 0.1rem solid rgba(0, 111, 53, 0.35);
    border-radius: 50%;
    transition:
        border 0.2s ease-in-out,
        background 0.2s ease-in-out;
}
.action-link:hover,
.action-link:active {
    background: rgba(0, 111, 53, 0.15);
    border-color: rgba(0, 111, 53, 0.5);
}
/* /train infos like number and vehicles */

/* error message */
.last-update {
    position: absolute;
    bottom: 0.2rem;
    right: 0.4rem;
    font-size: 0.9rem;
    line-height: 1;
    color: #df3333;
}
.last-update:not(:empty) {
    background: url(../assets/images/no-signal.svg) right / contain no-repeat;
    padding-right: 10px;
}
/* /error message */
</style>
