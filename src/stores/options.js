// @ts-check
import { useRoute, useRouter } from 'vue-router';
import { computed, inject, nextTick, provide, reactive, ref, toRaw, watch } from 'vue';

const OPTIONS_STORE_KEY = 'options-store';

function createRouteArray(router, key, type) {
    const data = ref([]);
    let justUpdated = false;
    const asNumber = type === 'number';

    watch(data, (newVal) => {
        justUpdated = true;
        if (newVal.length === 0) {
            const newQuery = {
                ...router.currentRoute.value.query
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
                }
            });
        }
        nextTick(() => {
            justUpdated = false;
        });
    }, { deep: true });

    watch(() => router.currentRoute.value.query[key], (newVal) => {
        if (justUpdated) return;
        if (newVal) {
            data.value = toRaw(newVal).split(',').map(_ => (asNumber ? Number(_) : _));
        } else {
            data.value = [];
        }
    });

    return data;
}

function createRouteBoolean(router, key) {
    return computed({
        get: () => {
            return !!router.currentRoute.value.query[key] ?? false;
        },
        set: (val) => {
            if (val) {
                router.push({
                    ...router.currentRoute.value,
                    query: {
                        ...router.currentRoute.value.query,
                        [key]: null,
                    }
                });
            } else {
                const newQuery = {
                    ...router.currentRoute.value.query
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

    const store = reactive({
        lines,
        trains,
        direction,
        outdated,
        tagged,
    });

    provide(OPTIONS_STORE_KEY, store);

    return store;
}

export function useOptionsStore() {
    return inject(OPTIONS_STORE_KEY);
}
