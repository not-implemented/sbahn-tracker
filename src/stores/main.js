//@ts-check
import { ref, computed, toRaw, reactive, inject, provide } from 'vue';

const MAIN_STORE_KEY = 'store';

export default function createMainStore(options) {
    const vehicleInfos = reactive([]);
    const lines = reactive({});
    const trains = reactive({});
    const vehicles = reactive({});
    const stations = reactive({});

    // Log
    const messages = reactive([]);

    // Newsticker
    const news = reactive([]);

    // Debug
    const trainEvents = reactive([]);

    // Stats
    const messagesReceived = ref(0);
    const bytesReceived = ref(0);
    const messagesSent = ref(0);
    const bytesSent = ref(0);

    const filteredTrains = computed(() => {
        return Object.values(trains)
            .filter((train) => options.lines.length === 0 || options.lines.includes(train.line.id))
            .filter(
                (train) =>
                    options.direction.length === 0 ||
                    (!!train.number &&
                        options.direction.includes(train.number % 2 === 1 ? 'east' : 'west')),
            )
            .filter(
                (train) =>
                    !options.outdated ||
                    train.vehicles.some((vehicle) => {
                        if (vehicle.id === null) return false;
                        const vehicleInfo = toRaw(vehicleInfos[vehicle.id]) || { isModern: null };
                        return vehicleInfo.isModern === null;
                    }),
            )
            .filter(
                (train) =>
                    !options.tagged ||
                    train.vehicles.some((vehicle) => {
                        if (vehicle.id === null) return false;
                        const vehicleInfo = toRaw(vehicleInfos[vehicle.id]) || { isTagged: true };
                        return vehicleInfo.isTagged;
                    }),
            )
            .sort((train1, train2) => {
                let result = Number(train1.line.id === 0) - Number(train2.line.id === 0);
                if (result == 0) result = train1.line.id - train2.line.id;
                // gerade Zugnummern Richtung Westen, ungerade Richtung Osten:
                if (result == 0) result = (train1.number % 2) - (train2.number % 2);
                if (result == 0) result = train1.number - train2.number;
                return result;
            });
    });

    function refreshLastUpdateMinutes(trainId, client) {
        if (trains[trainId]) {
            trains[trainId].lastUpdateMinutes = Math.floor(
                (Date.now() - client.clientTimeDiff - trains[trainId].lastUpdate) /
                    1000 /
                    60,
            );
        }
    }

    const store = reactive({
        vehicleInfos,
        lines,
        trains,
        vehicles,
        stations,
        messages,
        news,
        trainEvents,
        messagesReceived,
        bytesReceived,
        messagesSent,
        bytesSent,
        filteredTrains,
        refreshLastUpdateMinutes,
    });

    provide(MAIN_STORE_KEY, store);

    return store;
}

export function useStore() {
    return inject(MAIN_STORE_KEY);
}
