<script setup>
import { computed } from 'vue';
import { useStore } from '../stores/main';
import { useOptionsStore } from '../stores/options';
import LineLogo from './LineLogo.vue';

const store = useStore();
const options = useOptionsStore();

const newsCount = computed(() => store.news?.messages?.length);

const sortedLines = computed(() =>
    Object.values(store.lines).sort((line1, line2) => {
        let result = (line1.id === 0) - (line2.id === 0);
        if (result === 0) result = line1.id - line2.id;
        return result;
    }),
);
</script>

<template>
    <header class="site-header">
        <h1>
            <a href="#">
                <img src="../assets/images/s-bahn-logo.svg" alt="S" class="logo" height="30px" />
                Bahn München <span>Live</span>
            </a>
        </h1>

        <nav id="nav">
            <RouterLink class="nav-list" active-class="is-active" :to="{ name: 'list' }">
                <span class="text">Liste</span>
            </RouterLink>
            {{ ' ' }}
            <RouterLink class="nav-map" active-class="is-active" :to="{ name: 'map' }">
                <span class="text">Karte</span>
            </RouterLink>
            {{ ' ' }}
            <RouterLink
                :class="['nav-newsticker', newsCount > 0 ? 'has-badge' : null]"
                active-class="is-active"
                :to="{ name: 'newsticker' }"
            >
                <span class="text">Newsticker</span>
                <span class="badge">{{ newsCount }}</span>
            </RouterLink>
            {{ ' ' }}
            <RouterLink class="nav-debug" active-class="is-active" :to="{ name: 'debug' }">
                <span class="text">Debug</span>
            </RouterLink>
        </nav>

        <nav id="filter">
            <h3>Filter</h3>
            {{ ' ' }}
            <div id="lines" :class="[options.lines.length === 0 ? 'select-all' : null]">
                <label v-for="line in sortedLines" :key="line.id" class="line">
                    <input v-model="options.lines" type="checkbox" :value="line.id" />
                    <LineLogo :line="line" />
                    {{ ' ' }}
                </label>
            </div>
            {{ ' ' }}
            <div id="direction" class="filter">
                <label>
                    <input v-model="options.direction" value="west" type="checkbox" />
                    <span title="Fahrtrichtung nach Westen (auf Stammstrecke)">⬅️</span>
                    {{ ' ' }}
                </label>
                <label>
                    <input v-model="options.direction" value="east" type="checkbox" />
                    <span title="Fahrtrichtung nach Osten (auf Stammstrecke)">➡️</span>
                    {{ ' ' }}
                </label>
            </div>
            {{ ' ' }}
            <div id="isTagged" class="filter">
                <label>
                    <input v-model="options.tagged" value="yes" type="checkbox" />
                    <span title="Züge mit markierten Fahrzeugen">🔔</span>
                </label>
            </div>
        </nav>
    </header>
</template>

<style scoped>
/* SITE HEADER: fixed element on top */
.site-header {
    flex: 0 0 auto;
    padding: 0.3rem 1.6rem 0.2rem;
    /*border-bottom: .1rem solid #a0a0a0;*/
    border-bottom: 0.1rem solid #c0c0c0;
    background: linear-gradient(to bottom, #fff, #f0f0f0);
    box-shadow: 0 0.1rem 0.3rem 0 rgba(0, 0, 0, 0.3);
    z-index: 1;

    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    grid-gap: 0.6rem;
    gap: 0.6rem;
}
.site-header .logo {
    height: 3rem;
    vertical-align: text-bottom;
}
.site-header h1 {
    flex: 0 0 auto;
    margin: 0.3rem 0;
    font-size: 2.4rem;
    line-height: 1;
}
.site-header h1 a,
.site-header h1 a:hover,
.site-header h1 a:active {
    color: #333;
    text-decoration: none;
}
.site-header h1 span {
    font-size: 0.75em;
    font-weight: normal;
    text-transform: uppercase;
    color: #a0a0a0;
}
/* train line filter */
#nav > a {
    display: inline-block;
    min-width: 3.2rem;
    margin: 0.3rem 0;
    padding: 0.4rem 0.7rem 0.3rem;
    border: 0.1rem solid rgba(0, 111, 53, 0.35);
    border-radius: 0.6rem;
    font-size: 1.5rem;
    line-height: 1;
    font-weight: bold;
    text-decoration: none;
    text-align: center;
    transition:
        border 0.2s ease-in-out,
        background 0.2s ease-in-out;
    white-space: nowrap;
    position: relative;
}
#nav > a.is-active,
#nav > a:hover,
#nav > a:active {
    background: rgba(0, 111, 53, 0.15);
    border-color: rgba(0, 111, 53, 0.5);
}
#nav a::before {
    display: inline-block;
    height: 1.2rem;
    width: 1rem;
    margin: 0;
    vertical-align: top;
}
#nav .nav-list::before {
    content: url(../assets/images/icon-list.svg);
}
#nav .nav-map::before {
    content: url(../assets/images/icon-map.svg);
}
#nav .nav-newsticker::before {
    content: url(../assets/images/icon-newsticker.svg);
}
#nav .nav-debug::before {
    content: url(../assets/images/icon-debug.svg);
}
@media (min-width: 27em) {
    #nav a::before {
        margin-right: 0.3rem;
    }
}
#nav span.text {
    display: none;
}
@media (min-width: 27em) {
    #nav span.text {
        display: inline-block;
    }
}
#nav > a .badge {
    display: none;
    position: absolute;
    top: -0.6rem;
    right: -1.1rem;
    background: red;
    border-radius: 3rem;
    color: #fff;
    font-size: 1.1rem;
    min-width: 2rem;
    padding: 0.2rem;
    text-align: center;
}
#nav > a.has-badge .badge {
    display: block;
}
#filter {
    flex: 0 1 auto;
    margin: 0.3rem 0;
}
#filter > a:hover,
#filter > a:active {
    color: #fff;
}
#filter .filter {
    display: inline-block;
    margin: 0.6rem 0;
}
#filter h3 {
    display: inline-block;
    margin: 0 0.6rem 0 0;
    font-size: 0.75em;
    font-weight: normal;
    text-transform: uppercase;
    color: #a0a0a0;
}
#lines {
    display: inline-block;
}
.line input {
    display: none;
}
#lines .line-logo {
    opacity: 0.15;
    cursor: pointer;
    transition: opacity ease-in-out 0.15s;
}
#lines input:checked ~ .line-logo,
#lines.select-all .line-logo {
    opacity: 1;
}
.filter {
    display: inline-block;
    border-left: #a0a0a0 0.1rem solid;
    padding-left: 0.6rem;
}
.filter input {
    display: none;
}
.filter span {
    display: inline-block;
    min-width: 3.5rem;
    padding: 0.5rem 0.4rem 0.4rem;
    border-radius: 0.6rem;
    font-size: 1.5rem;
    line-height: 1;
    font-weight: bold;
    text-align: center;
    background: #e7e7e7 center/contain no-repeat;
    opacity: 0.15;
    cursor: pointer;
    transition: opacity ease-in-out 0.15s;
}
.filter input:checked ~ span,
.filter.select-all span {
    opacity: 1;
}
/* /train line filter */
/* /SITE HEADER */
</style>
