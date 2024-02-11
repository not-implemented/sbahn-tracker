<script setup>
import { onMounted, onUnmounted, computed, watch, toRaw } from 'vue';
import * as L from 'leaflet';
import { useOptionsStore } from '../stores/options';

const props = defineProps({
    station: {
        type: Object,
        required: true,
    },

    map: {
        type: Object,
        required: true,
    },
});

const options = useOptionsStore();
let stationMarker;

const isSelected = computed(() => {
    return '' + props.station.id === options.station;
});

onMounted(() => {
    stationMarker = L.circleMarker([0, 0], {
        radius: 6,
        weight: 2,
        color: '#000',
        opacity: 0.6,
        fillColor: isSelected.value ? '#406fff' : '#fff',
        fillOpacity: 0.6,
    });

    if (props.station.coordinates) {
        stationMarker.setLatLng(toRaw(props.station.coordinates));
    }

    stationMarker.on('click', () => {
        options.station = props.station.id;
    });

    stationMarker.addTo(toRaw(props.map));
});

watch(
    () => props.station.coordinates,
    () => {
        stationMarker.setLatLng(toRaw(props.station.coordinates));
    },
);

watch(
    () => isSelected.value,
    () => {
        stationMarker.setStyle({ fillColor: isSelected.value ? '#406fff' : '#fff' });
    },
);

onUnmounted(() => {
    stationMarker.remove();
});
</script>

<template>
    <div style="display: none"></div>
</template>
