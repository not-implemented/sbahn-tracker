import { defineStore } from 'pinia';

export const useStore = defineStore('main', {
    state: () => ({
        vehicleInfos: {},

        lines: {},
        trains: {},
        vehicles: {},
        stations: {},

        // Log
        messages: [],

        // Newsticker
        news: [],

        // Debug
        trainEvents: [],

        // Stats
        messagesReceived: 0,
        bytesReceived: 0,
        messagesSent: 0,
        bytesSent: 0,
    }),
    actions: {
        refreshLastUpdateMinutes(trainId, client) {
            if (this.trains[trainId]) {
                this.trains[trainId].lastUpdateMinutes = Math.floor(
                    (Date.now() - client.clientTimeDiff - this.trains[trainId].lastUpdate) /
                        1000 /
                        60,
                );
            }
        },
    },
});
