<script setup>
import { computed, toRef, watch, onMounted, onUnmounted } from 'vue';
import { useOptionsStore } from '../stores/options';
import LineLogo from './LineLogo.vue';

const props = defineProps({
    station: {
        type: Object,
        required: true,
    },
});

const options = useOptionsStore();
const station = toRef(props, 'station');

const departures = computed(() => {
    return Object.values(station.value.departures).sort((departure1, departure2) => {
        let result = 0;
        if (result === 0) result = departure1.estimatedTime - departure2.estimatedTime;
        return result;
    });
});

function formatTime(timestamp) {
    if (timestamp === null) return '';
    return new Date(timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function selectTrain(trainId) {
    options.trains = [trainId];
}

function closeStation() {
    options.station = null;
}

watch(station, (newStation, oldStation) => {
    oldStation?.enableDepartureUpdates(false);
    newStation?.enableDepartureUpdates(true);
});
onMounted(() => station.value?.enableDepartureUpdates(true));
onUnmounted(() => station.value?.enableDepartureUpdates(false));
</script>

<template>
    <div class="station">
        <div class="station-name">
            <div>Abfahrt {{ station.name }}</div>
            <a class="action-link" href="" @click.prevent="closeStation">×</a>
        </div>

        <table class="sbahn-departures">
            <thead>
                <tr>
                    <th>Linie</th>
                    <th>Ziel</th>
                    <th class="platform"><div>Gleis</div></th>
                    <th class="trainType">
                        <div><span>A</span> <span>B</span> <span>C</span></div>
                    </th>
                    <th>in Min</th>
                    <th>Plan</th>
                </tr>
            </thead>

            <tbody id="sbahn-departures">
                <tr
                    v-for="departure in departures"
                    :key="departure.id"
                    class="sbahn-departure-entry"
                    :class="{
                        'has-realtime': departure.hasRealtime,
                        'is-cancelled': departure.isCancelled,
                    }"
                >
                    <td><LineLogo :line="departure.line" /></td>
                    <td class="destination">
                        <a href="" @click.prevent="selectTrain(departure.trainId)">{{
                            departure.destination
                        }}</a>
                    </td>
                    <td class="platform">{{ departure.platform }}</td>
                    <td class="trainType" :data-train-type="departure.trainType">
                        <span class="vehicle-1"></span><span class="vehicle-2"></span
                        ><span class="vehicle-3"></span>
                    </td>
                    <td class="minutes">
                        {{ departure.state === 'BOARDING' ? '🚉' : departure.minutes }}
                    </td>
                    <td>
                        <span class="aimed-time">{{ formatTime(departure.aimedTime) }}</span
                        ><span class="delay">{{
                            departure.minutesDelay !== 0
                                ? `${departure.minutesDelay >= 0 ? '+' : ''}${
                                      departure.minutesDelay
                                  }`
                                : ''
                        }}</span>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<style scoped>
.station {
    margin: 0.6rem 0.8rem;
    border-radius: 0.6rem;
    background: #fff;
    box-shadow: 0 0.1rem 0.3rem 0 rgba(0, 0, 0, 0.15);
}
.station-name {
    display: flex;
    justify-content: space-between;
    padding: 0.6rem 0.7rem;
    font-size: 1.5rem;
    font-weight: bold;
    line-height: 1;
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

.sbahn-departures {
    width: 100%;
    border-collapse: collapse;
    background-color: #000080;
    color: #fff;
    white-space: nowrap;
    line-height: 1;
}
.sbahn-departures thead {
    background-color: #ffff00;
    color: #333;
    font-size: 1.5rem;
    text-align: left;
}
.sbahn-departures thead th {
    padding: 0.5rem 0.25rem 0.2rem;
    font-weight: normal;
}
.sbahn-departures th.platform {
    position: relative;
}
.sbahn-departures th.platform div {
    position: absolute;
    right: 0.25rem;
    top: 0.5rem;
}
.sbahn-departures th.trainType div {
    display: flex;
    justify-content: space-around;
    width: 5.25rem;
}

.sbahn-departures td {
    padding: 0.25rem 0.25rem;
}
.sbahn-departure-entry {
    font-size: 2rem;
}
.sbahn-departure-entry.is-cancelled {
    text-decoration: line-through;
    text-decoration-thickness: 0.25rem;
    text-decoration-color: red;
}
.sbahn-departure-entry .destination,
.sbahn-departure-entry .minutes {
    font-weight: bold;
}
.sbahn-departure-entry .destination {
    max-width: 17.5rem;
    overflow: hidden;
    text-overflow: ellipsis;
}
.sbahn-departure-entry .destination a {
    color: inherit;
    text-decoration: none;
}
.sbahn-departure-entry .platform {
    text-align: right;
    padding-right: 0.75rem;
}
.sbahn-departure-entry:not(.has-realtime) .minutes::after {
    display: inline-block;
    content: '?';
    font-size: 1.5rem;
    padding-left: 0.25rem;
    padding-top: 0.3rem;
    vertical-align: top;
    color: #e43737;
}
.sbahn-departure-entry .trainType[data-train-type] span {
    display: inline-block;
    margin: 0 0.1rem;
    padding: 0 0.8rem;
    height: 1rem;
    border-bottom: 0.15rem solid #fff;
}
.sbahn-departure-entry .trainType[data-train-type='1'] span.vehicle-1,
.sbahn-departure-entry .trainType[data-train-type='2'] span.vehicle-1,
.sbahn-departure-entry .trainType[data-train-type='3'] span.vehicle-1,
.sbahn-departure-entry .trainType[data-train-type='2'] span.vehicle-2,
.sbahn-departure-entry .trainType[data-train-type='3'] span.vehicle-2,
.sbahn-departure-entry .trainType[data-train-type='3'] span.vehicle-3 {
    background: #fff;
    border-top-left-radius: 0.5rem;
    border-top-right-radius: 0.5rem;
}

.sbahn-departure-entry .aimed-time {
    font-size: 1.25rem;
}
.sbahn-departure-entry .delay:not(:empty) {
    padding-left: 0.25rem;
    font-size: 1rem;
    color: #e43737;
}
</style>
