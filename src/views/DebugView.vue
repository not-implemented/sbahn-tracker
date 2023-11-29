<script setup>
import { useStore } from '../stores/main';

const store = useStore();

const clear = () => {
    store.trainEvents = [];
};
</script>

<template>
    <div id="page-debug" class="page">
        <div id="train-events">
            <table>
                <thead>
                    <tr>
                        <th colspan="10" style="text-align: right">
                            <button id="clear-train-events" @click="clear">Leeren</button>
                        </th>
                    </tr>

                    <tr>
                        <th class="is-number">event-time</th>
                        <th class="is-number">aimed-time-offset</th>
                        <th>state</th>
                        <th>event</th>
                        <th>ride-state</th>
                        <th class="is-number">train-number</th>
                        <th class="is-number">original-train-number</th>
                        <th>stop-point-ds100</th>
                        <th class="is-number" title="position-correction">pos-corr</th>
                        <th class="is-number">transmitting-vehicle</th>
                    </tr>
                </thead>

                <tbody>
                    <tr v-for="(trainEvent, index) in store.trainEvents" :key="index">
                        <td class="event-timestamp is-number" :title="'Delay: ' + trainEvent.delay">
                            {{ new Date(trainEvent.event_timestamp).toLocaleTimeString() }}
                        </td>
                        <td class="aimed-time-offset is-number">
                            {{ trainEvent.aimed_time_offset }}
                        </td>
                        <td class="state">{{ trainEvent.state }}</td>
                        <td class="event">{{ trainEvent.event }}</td>
                        <td class="ride-state">{{ trainEvent.ride_state }}</td>
                        <td class="train-number is-number">{{ trainEvent.train_number }}</td>
                        <td class="original-train-number is-number">
                            {{ trainEvent.original_train_number }}
                        </td>
                        <td class="stop-point-ds100">{{ trainEvent.stop_point_ds100 }}</td>
                        <td class="position-correction is-number">
                            {{ trainEvent.postion_correction }}
                        </td>
                        <td class="transmitting-vehicle is-number">
                            {{ trainEvent.transmitting_vehicle }}
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>

<style scoped>
/* debug window */
#train-events {
    padding: 0.6rem 0.7rem;
    background: #fff;
    overflow: auto;
}
table {
    border-collapse: collapse;
    border-spacing: 0;
    width: 100%;
    border: 0;
    background: #fff;
}
th,
td {
    vertical-align: top;
    padding: 0.3rem 0.4rem;
    text-align: left;
    font-size: 1.2rem;
    line-height: 1.5;
}
th {
    font-weight: bold;
    border-bottom: 0.1rem solid #c0c0c0;
}
tbody tr {
    background: #f0f0f0;
}
tbody tr:nth-child(odd) {
    background: #fff;
}
table .is-number {
    text-align: right;
}
/* /debug window */
</style>
