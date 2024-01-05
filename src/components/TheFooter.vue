<script setup>
import { useStore } from '../stores/main';

const store = useStore();

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(i > 0 ? decimals : 0) + ' ' + sizes[i];
}
</script>

<template>
    <footer class="site-footer">
        Live-Data from <a href="https://geops.ch/">geOps</a> — Made with 🥨 in Munich

        <div class="stats">
            In: {{ store.messagesReceived }} ({{ formatBytes(store.bytesReceived) }}), Out:
            {{ store.messagesSent }} ({{ formatBytes(store.bytesSent) }})
        </div>
    </footer>
</template>

<style scoped>
/* SITE FOOTER: Copyright and stuff */
.site-footer {
    padding: 0.6rem 0.8rem;
    background: #f0f0f0;
    box-shadow: 0 -0.1rem 0.3rem 0 rgba(0, 0, 0, 0.3);
    text-align: center;
    z-index: 1;
}
.site-footer .stats {
    float: right;
}
</style>
