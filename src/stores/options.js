import { defineStore } from 'pinia';

export const useOptionsStore = defineStore('options', {
    state: () => ({
        lines: [],
        trains: [],
        direction: [],
        tagged: false,
    }),
});
