<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useStore } from '../stores/main';
import { fetchHistoricDisruptions } from '../api/moco';
import LineLogo from '../components/LineLogo.vue';

type Disruption = {
    id: string;
    title: string;
    lineNames: string[];
    content: string;
    publishedAt: string;
    affectedStart: string;
    affectedEnd: string;
};

const store: {
    lines: { name: string }[];
    news: Disruption[];
} = useStore();

// a disruption linked from the map (#/newsticker?disruption=ID) - scroll to it and highlight it:
const route = useRoute();
const newsticker = useTemplateRef<HTMLElement>('newsticker');
const highlightedId = computed(() =>
    typeof route.query.disruption === 'string' ? route.query.disruption : null,
);
let scrolledToId: string | null = null;

// only scroll once per link, not again on every poll:
function scrollToHighlighted() {
    if (!highlightedId.value || highlightedId.value === scrolledToId) return;
    const element = newsticker.value?.querySelector(
        `[data-disruption-id="${CSS.escape(highlightedId.value)}"]`,
    );
    if (!element?.isConnected) return;
    element.scrollIntoView({ block: 'start', behavior: 'smooth' });
    scrolledToId = highlightedId.value;
}

watch(highlightedId, () => (scrolledToId = null));
watch([highlightedId, () => store.news], scrollToHighlighted, { flush: 'post' });
onActivated(scrollToHighlighted);

const showHistoric = ref(false);
const historicNews = ref<Disruption[]>([]);
const historicStatus = ref<'idle' | 'loading' | 'error' | 'done'>('idle');
const historicEnd = useTemplateRef<HTMLElement>('historicEnd');
let historicBefore: number | undefined;
let historicAbortController: AbortController | null = null;

function loadMoreHistoric() {
    if (historicStatus.value === 'loading' || historicStatus.value === 'done') return;

    historicAbortController = new AbortController();
    historicStatus.value = 'loading';
    fetchHistoricDisruptions(historicBefore, historicAbortController.signal)
        .then(({ disruptions, nextBefore }: { disruptions: Disruption[]; nextBefore: number }) => {
            const knownIds = new Set(historicNews.value.map((disruption) => disruption.id));
            historicNews.value.push(...disruptions.filter(({ id }) => !knownIds.has(id)));
            historicBefore = nextBefore;
            historicStatus.value = nextBefore > 0 ? 'idle' : 'done';
            checkHistoricEnd();
        })
        .catch((err: Error) => {
            if (err.name === 'AbortError') return;
            console.warn('Loading historic disruptions failed', err);
            historicStatus.value = 'error';
        });
}

let historicEndObserver: IntersectionObserver | null = null;

function checkHistoricEnd() {
    nextTick(() => {
        if (!historicEnd.value) return;

        historicEndObserver ??= new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) loadMoreHistoric();
            },
            { root: historicEnd.value.closest('.site-main'), rootMargin: '0px 0px 100% 0px' },
        );
        historicEndObserver.disconnect();
        historicEndObserver.observe(historicEnd.value);
    });
}

watch(showHistoric, (show) => {
    historicAbortController?.abort();
    historicNews.value = [];
    historicBefore = undefined;
    historicStatus.value = 'idle';
    if (show) checkHistoricEnd();
    else historicEndObserver?.disconnect();
});

// disruptions which are no longer current have just ended:
watch(
    () => store.news,
    (news, oldNews) => {
        if (!showHistoric.value) return;
        const currentIds = new Set(news.map(({ id }) => id));
        const knownIds = new Set(historicNews.value.map(({ id }) => id));
        historicNews.value.unshift(
            ...oldNews.filter(({ id }) => !currentIds.has(id) && !knownIds.has(id)),
        );
    },
);

onBeforeUnmount(() => historicEndObserver?.disconnect());

const sections = computed(() => [
    { key: 'current', title: null, messages: store.news },
    ...(showHistoric.value
        ? [{ key: 'historic', title: 'Vergangene Störungen', messages: historicNews.value }]
        : []),
]);

const locale = 'de-DE';
const timeFormat = { hour: 'numeric', minute: 'numeric' } as const;
const timeFormatter = new Intl.DateTimeFormat(locale, timeFormat);
const dateFormatter = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    ...timeFormat,
});
const yearFormatter = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...timeFormat,
});

const getFormatter = (times: Date[]) => {
    const now = new Date();
    if (times.every((time) => time.toDateString() === now.toDateString())) return timeFormatter;
    if (times.every((time) => time.getFullYear() === now.getFullYear())) return dateFormatter;
    return yearFormatter;
};

const formatTimeRange = (newsMessage: { affectedStart?: string; affectedEnd?: string }) => {
    if (!newsMessage.affectedStart) return '?';

    const start = new Date(newsMessage.affectedStart);
    if (!newsMessage.affectedEnd) return 'ab ' + getFormatter([start]).format(start);

    const end = new Date(newsMessage.affectedEnd);
    return getFormatter([start, end]).formatRange(start, end);
};

const getLine = (name: string) =>
    Object.values(store.lines).find((line) => line.name === name) ?? {
        name,
        color: '#808080',
        textColor: '#ffffff',
    };
</script>

<template>
    <div id="page-newsticker" class="page">
        <div id="newsticker" ref="newsticker">
            <label class="show-historic">
                <input v-model="showHistoric" type="checkbox" />
                Vergangene Störungen anzeigen
            </label>

            <p v-if="store.news.length === 0" class="notice">Keine Störungen bekannt :-)</p>

            <template v-for="section in sections" :key="section.key">
                <h2 v-if="section.title" class="section-title">{{ section.title }}</h2>

                <div
                    v-for="newsMessage in section.messages"
                    :key="newsMessage.id"
                    :class="[
                        'news-message',
                        {
                            'is-historic': section.key === 'historic',
                            'is-highlighted':
                                section.key === 'current' && newsMessage.id === highlightedId,
                        },
                    ]"
                    :data-disruption-id="section.key === 'current' ? newsMessage.id : null"
                >
                    <div class="news-header">
                        <span class="time">{{ formatTimeRange(newsMessage) }}</span>
                        <span class="lines">
                            <LineLogo
                                v-for="lineName in newsMessage.lineNames"
                                :key="lineName"
                                :line="getLine(lineName)"
                            />
                        </span>
                    </div>

                    <h3 class="title">{{ newsMessage.title }}</h3>
                    <!-- eslint-disable vue/no-v-html -->
                    <div class="content" v-html="newsMessage.content" />
                    <!-- eslint-enable -->
                </div>
            </template>

            <template v-if="showHistoric">
                <p v-if="historicStatus === 'loading'" class="notice">
                    Lade vergangene Störungen …
                </p>
                <p v-else-if="historicStatus === 'error'" class="notice">
                    Vergangene Störungen konnten nicht geladen werden.
                    <button type="button" @click="loadMoreHistoric">Erneut versuchen</button>
                </p>
                <p v-else-if="historicStatus === 'done'" class="notice">
                    Keine weiteren Störungen vorhanden.
                </p>
                <div ref="historicEnd" />
            </template>
        </div>
    </div>
</template>

<style scoped>
/* news messages */
#newsticker {
    padding: 4rem;
}
.show-historic {
    display: block;
    max-width: 60rem;
    margin: 0 auto 2rem;
    text-align: right;
    color: #606060;
    cursor: pointer;
}
.notice {
    margin: 4rem 0;
    font-size: 1.8rem;
    line-height: 1;
    color: #606060;
    text-align: center;
}
.section-title {
    max-width: 60rem;
    margin: 4rem auto 1rem;
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
.news-message.is-historic {
    opacity: 0.6;
}
.news-message.is-highlighted {
    scroll-margin-top: 2rem;
    background-color: rgba(227, 0, 15, 0.08);
    box-shadow: 0 0 0 1rem rgba(227, 0, 15, 0.08);
}
/* /news messages */
</style>
