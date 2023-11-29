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
});
