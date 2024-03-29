<script setup>
import { ref, computed, onMounted, onUnmounted, onActivated, watch } from 'vue';
import { useStore } from '../stores/main';
import { useOptionsStore } from '../stores/options';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import areas from '../constants/areas';
import MapMarker from '../components/MapMarker.vue';
import StationMarker from '../components/StationMarker.vue';
import TrainContainer from '../components/TrainContainer.vue';
import StationContainer from '../components/StationContainer.vue';

const store = useStore();
const options = useOptionsStore();
const div = ref();
const map = ref();
let positionWatchId;

onMounted(() => {
    map.value = L.map(div.value).setView([48.137187, 11.575501], 11);

    map.value.attributionControl.setPrefix('<a href="https://leafletjs.com/">Leaflet</a>');

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
        positionWatchId = navigator.geolocation.watchPosition(
            (position) => {
                positionMarker.setLatLng([position.coords.latitude, position.coords.longitude]);
            },
            null,
            { enableHighAccuracy: true },
        );
    }
});

onUnmounted(() => {
    if (positionWatchId) {
        navigator.geolocation.clearWatch(positionWatchId);
    }
});

const selectedTrains = computed(() => {
    return Object.values(store.trains).filter((train) => options.trains.includes(train.id));
});

const selectedStation = computed(() => {
    return (options.station && store.stations[options.station]) ?? null;
});

const sidebarOpen = computed(() => {
    return selectedTrains.value.length > 0 || selectedStation.value;
});

// size of map will change when sidebar opens/closes - we have to notify Leaflet:
watch(sidebarOpen, () => map.value.invalidateSize(), { flush: 'post' });
onMounted(() => map.value.invalidateSize());
onActivated(() => map.value.invalidateSize());
</script>

<template>
    <div id="page-map" class="page">
        <div id="map" ref="div" />

        <div v-if="map">
            <MapMarker
                v-for="train in store.filteredTrains"
                :key="train.id"
                :map="map"
                :train="train"
            />
        </div>

        <div v-if="map">
            <StationMarker
                v-for="station in store.stations"
                :key="station.id"
                :station="station"
                :map="map"
            />
        </div>

        <div id="train-details" :class="[sidebarOpen ? 'is-active' : null]">
            <StationContainer v-if="selectedStation" :station="selectedStation" />

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
#map.leaflet-container {
    font-size: 12px;
}
/* /details of train */
</style>
