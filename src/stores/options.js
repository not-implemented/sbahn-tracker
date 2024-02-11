// @ts-check
import { useRouter } from 'vue-router';
import { computed, inject, nextTick, provide, reactive, ref, toRaw, watch } from 'vue';

const OPTIONS_STORE_KEY = 'options-store';

function createRouteArray(router, key, type) {
    const data = ref([]);
    let justUpdated = false;
    const asNumber = type === 'number';

    watch(
        data,
        (newVal) => {
            justUpdated = true;
            if (newVal.length === 0) {
                const newQuery = {
                    ...router.currentRoute.value.query,
                };
                delete newQuery[key];
                router.push({
                    ...router.currentRoute.value,
                    query: newQuery,
                });
            } else {
                router.push({
                    ...router.currentRoute.value,
                    query: {
                        ...router.currentRoute.value.query,
                        [key]: toRaw(newVal).join(','),
                    },
                });
            }
            nextTick(() => {
                justUpdated = false;
            });
        },
        { deep: true },
    );

    watch(
        () => router.currentRoute.value.query[key],
        (newVal) => {
            if (justUpdated) return;
            if (newVal) {
                data.value = toRaw(newVal)
                    .split(',')
                    .map((_) => (asNumber ? Number(_) : _));
            } else {
                data.value = [];
            }
        },
    );

    return data;
}

function createRouteString(router, key) {
    return computed({
        get: () => {
            return router.currentRoute.value.query[key];
        },
        set: (val) => {
            if (val) {
                router.push({
                    ...router.currentRoute.value,
                    query: {
                        ...router.currentRoute.value.query,
                        [key]: val,
                    },
                });
            } else {
                const newQuery = {
                    ...router.currentRoute.value.query,
                };
                delete newQuery[key];
                router.push({
                    ...router.currentRoute.value,
                    query: newQuery,
                });
            }
        },
    });
}

function createRouteBoolean(router, key) {
    return computed({
        get: () => {
            return key in router.currentRoute.value.query;
        },
        set: (val) => {
            if (val) {
                router.push({
                    ...router.currentRoute.value,
                    query: {
                        ...router.currentRoute.value.query,
                        [key]: null,
                    },
                });
            } else {
                const newQuery = {
                    ...router.currentRoute.value.query,
                };
                delete newQuery[key];
                router.push({
                    ...router.currentRoute.value,
                    query: newQuery,
                });
            }
        },
    });
}

export default function createOptionsStore() {
    const router = useRouter();

    const lines = createRouteArray(router, 'lines', 'number');
    const trains = createRouteArray(router, 'trains');
    const direction = createRouteArray(router, 'direction');
    const outdated = createRouteBoolean(router, 'isOutdated');
    const tagged = createRouteBoolean(router, 'isTagged');
    const station = createRouteString(router, 'station');

    router.beforeResolve((to, from) => {
        if (to.name !== 'map') {
            const toTrains = to.query.trains?.length ?? 0;
            const fromTrains = from.query.trains?.length ?? 0;
            if (toTrains > fromTrains) {
                return { ...to, name: 'map' };
            }
        }
    });

    const store = reactive({
        lines,
        trains,
        direction,
        outdated,
        tagged,
        station,
    });

    provide(OPTIONS_STORE_KEY, store);

    return store;
}

export function useOptionsStore() {
    return inject(OPTIONS_STORE_KEY);
}
