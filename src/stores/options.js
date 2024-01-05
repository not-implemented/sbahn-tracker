import { defineStore } from 'pinia';

export const useOptionsStore = defineStore('options', {
    state: () => ({
        lines: [],
        trains: [],
        direction: [],
        outdated: false,
        tagged: false,
    }),
});
