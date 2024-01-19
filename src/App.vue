<script setup>
import { useSBahn } from './composables/useSBahn';
import TheHeader from './components/TheHeader.vue';
import TheFooter from './components/TheFooter.vue';

useSBahn();
</script>

<template>
    <TheHeader />

    <main class="site-main">
        <RouterView v-slot="{ Component }">
            <KeepAlive>
                <component :is="Component" />
            </KeepAlive>
        </RouterView>
        <TheFooter />
    </main>
</template>

<style>
/* DEFAULTS */
*,
*:before,
*:after {
    box-sizing: inherit;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    font-kerning: auto;
}
@-ms-viewport {
    width: extend-to-zoom;
    zoom: 1;
}
html {
    box-sizing: border-box;
    font-size: 40%;
    font-family: sans-serif;
    -ms-text-size-adjust: 100%;
    -webkit-text-size-adjust: 100%;
    height: 100%;
}
@media (min-width: 22.875em) {
    html {
        font-size: 50%;
    }
}
@media (min-width: 28.75em) {
    html {
        font-size: 62.5%;
    }
}
body {
    height: 100%;
    margin: 0;
    padding: 0;
    font: 1.2rem/1.5 sans-serif;
    font-variant-numeric: tabular-nums;
    background: #fff;
    color: #333;
}
#app {
    display: flex;
    flex-direction: column;
    height: 100%;
}
a {
    color: #006f35;
}
a:hover,
a:active {
    color: #003d1e;
}
.strip {
    display: block;
    width: auto;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
/* /DEFAULTS */

/* SITE MAIN: main content, displays train cards and site footer */
.site-main {
    flex: 1 1 auto;
    position: relative;
    overflow-y: scroll;
    background: #d0d0d0;
    -webkit-overflow-scrolling: touch;
    overflow-scrolling: touch;

    display: flex;
    flex-direction: column;
}
.site-main .page {
    display: block;
    flex: 1 0 auto;
    z-index: 0;
}
</style>
