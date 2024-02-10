//@ts-check
import { ref, shallowReactive, shallowReadonly, reactive, inject, provide } from "vue";

const MAIN_STORE_KEY = 'store';

export default function createMainStore() {
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
        refreshLastUpdateMinutes,
    });

    provide(MAIN_STORE_KEY, store);

    return store;
}

export function useStore() {
    return inject(MAIN_STORE_KEY);
}
