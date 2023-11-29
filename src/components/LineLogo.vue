<script setup>
defineProps({
    line: {
        type: Object,
        required: true,
    },
});
</script>

<template>
    <span
        class="line-logo"
        :style="`background-color: ${line.color}; color: ${line.textColor || line.text_color}`"
    >
        {{ line.name }}
    </span>
</template>

<style scoped>
.line-logo {
    display: inline-block;
    min-width: 3.5rem;
    padding: 0.5rem 0.4rem 0.4rem;
    border-radius: 0.6rem;
    font-size: 1.5rem;
    line-height: 1;
    font-weight: bold;
    text-align: center;
}
</style>
