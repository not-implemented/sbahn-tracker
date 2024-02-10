<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';

defineOptions({
    inheritAttrs: true,
});

const props = defineProps({
    to: {
        type: Object,
        required: true,
    },
});

const route = useRoute();
const toWithParams = computed(() => ({ ...props.to, query: { ...route.query, ...props.to.query }}));
</script>

<template>
    <RouterLink :to="toWithParams">
        <slot />
    </RouterLink>
</template>
