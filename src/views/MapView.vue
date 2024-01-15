<script setup>
import { ref, computed, onMounted, onUnmounted, toRaw } from 'vue';
import { useStore } from '../stores/main';
import { useOptionsStore } from '../stores/options';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import areas from '../constants/areas';
import MapMarker from '../components/MapMarker.vue';
import TrainContainer from '../components/TrainContainer.vue';

const store = useStore();
const options = useOptionsStore();
const div = ref();
const map = ref();
let positionWatchId;

onMounted(() => {
    map.value = L.map(div.value).setView([48.137187, 11.575501], 11);

    L.tileLayer('https://a.tile.openstreetmap.de/{z}/{x}/{y}.png', {
        attribution:
            '© <a href="https://www.openstreetmap.org/">OpenStreetMap</a>, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>',
        maxZoom: 18,
    }).addTo(map.value);

    L.control.scale({ imperial: false }).addTo(map.value);

    const positionMarker = L.circleMarker([0, 0]).addTo(map.value);

    areas.forEach((area) => {
        L.polygon([area.polygon], {
            fill: false,
            weight: 2,
            color: '#28ad47',
            dashArray: '2 10',
        }).addTo(map.value);
    });

    // Lama easter egg:
    L.marker([-16.6073271, -65.4916048], {
        icon: L.icon({
            iconUrl: '../assets/images/lama.svg',
            iconSize: [50, 53],
            iconAnchor: [25, 25],
        }),
    }).addTo(map.value);

    if (navigator.geolocation) {
        positionWatchId = navigator.geolocation.watchPosition((position) => {
            positionMarker.setLatLng([position.coords.latitude, position.coords.longitude]);
        });
    }
});

onUnmounted(() => {
    if (positionWatchId) {
        navigator.geolocation.clearWatch(positionWatchId);
    }
});

const trains = computed(() => {
    return Object.values(store.trains)
        .filter((train) => options.lines.length === 0 || options.lines.includes(train.line.id))
        .filter(
            (train) =>
                options.direction.length === 0 ||
                (!!train.number &&
                    options.direction.includes(train.number % 2 === 1 ? 'east' : 'west')),
        )
        .filter(
            (train) =>
                !options.tagged ||
                train.vehicles.some((vehicle) => {
                    if (vehicle.id === null) return false;
                    const vehicleInfo = toRaw(store.vehicleInfos[vehicle.id]) || { isTagged: true };
                    return vehicleInfo.isTagged;
                }),
        )
        .sort((train1, train2) => {
            let result = (train1.line.id === 0) - (train2.line.id === 0);
            if (result == 0) result = train1.line.id - train2.line.id;
            // gerade Zugnummern Richtung Westen, ungerade Richtung Osten:
            if (result == 0) result = (train1.number % 2) - (train2.number % 2);
            if (result == 0) result = train1.number - train2.number;
            return result;
        });
});

const selectedTrains = computed(() => {
    return Object.values(store.trains).filter((train) => options.trains.includes(train.id));
});

// TODO: if train-details become empty, the map needs to be refit
</script>

<template>
    <div id="page-map" class="page">
        <div id="map" ref="div" />

        <div v-if="map">
            <MapMarker v-for="train in trains" :key="train.id" :map="map" :train="train" />
        </div>

        <div id="train-details" :class="[selectedTrains.length > 0 ? 'is-active' : null]">
            <ul id="selected-trains">
                <TrainContainer v-for="train in selectedTrains" :key="train.id" :train="train" />
            </ul>
        </div>
    </div>
</template>

<style scoped>
/* details of train */
#page-map {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    overflow: auto;
}
@media (orientation: landscape) and (min-width: 27em) {
    #page-map {
        flex-direction: row;
    }
}

#train-details {
    display: none;
    flex: 1 0 25%;
    overflow: auto;
    z-index: -1;
}
#train-details.is-active {
    display: block;
}
#selected-trains {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(17.5rem, 1fr));
    grid-auto-rows: 1fr;
    grid-gap: 0.6rem 0.8rem;
    gap: 0.6rem 0.8rem;

    margin: 0;
    padding: 0.6rem 0.8rem;
    list-style: none;
}
#map {
    flex: 1 0 75%;
    box-shadow: 0 0 0.6rem 0.3rem rgba(0, 0, 0, 0.15);
}
/* /details of train */
</style>
