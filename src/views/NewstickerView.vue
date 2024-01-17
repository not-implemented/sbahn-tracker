<script setup>
import { useStore } from '../stores/main';
import LineLogo from '../components/LineLogo.vue';

const store = useStore();

const formatTime = (updated) => {
    const time = new Date(updated);
    const now = new Date();

    const isSameDay =
        time.getDate() === now.getDate() &&
        time.getMonth() === now.getMonth() &&
        time.getFullYear() === now.getFullYear();

    const timeFormat = isSameDay
        ? { hour: 'numeric', minute: 'numeric' }
        : { day: '2-digit', month: '2-digit', hour: 'numeric', minute: 'numeric' };

    return time.toLocaleTimeString(undefined, timeFormat);
};
</script>

<template>
    <div id="page-newsticker" class="page">
        <div id="newsticker">
            <div v-for="(newsMessage, i) in store.news" :key="i" class="news-message">
                <div class="news-header">
                    <span class="time">{{ formatTime(newsMessage.updated) }}</span>
                    <span class="lines">
                        <LineLogo v-for="(line, j) in newsMessage.lines" :key="j" :line="line" />
                    </span>
                </div>

                <h3 class="title">{{ newsMessage.title }}</h3>
                <div class="content" v-html="newsMessage.content" />
            </div>
        </div>
    </div>
</template>

<style scoped>
/* news messages */
#newsticker {
    padding: 4rem;
}
#newsticker:empty {
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
}
#newsticker:empty::after {
    flex: 0 0 auto;
    font-size: 1.8rem;
    line-height: 1;
    color: #606060;
    content: 'Keine Störungen bekannt :-)';
}
.news-message {
    max-width: 60rem;
    margin: 1rem auto;
    padding-bottom: 1rem;
    border-bottom: 0.1rem #333 solid;
}
.news-message .time {
    font-style: italic;
}
.news-message .line-logo {
    margin-left: 0.5rem;
    vertical-align: text-bottom;
}
.news-message .title {
    margin: 0.8rem 0;
}
/* /news messages */
</style>
