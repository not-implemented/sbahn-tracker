<script setup>
import { computed } from 'vue';
import { useStore } from '../stores/main';
import { useOptionsStore } from '../stores/options';
import TrainContainer from '../components/TrainContainer.vue';

const store = useStore();
const options = useOptionsStore();

const trains = computed(() => {
    return Object.values(store.trains)
        .filter((train) => options.lines.length === 0 || options.lines.includes(train.line.id))
        .sort((train1, train2) => {
            let result = (train1.line.id === 0) - (train2.line.id === 0);
            if (result == 0) result = train1.line.id - train2.line.id;
            // gerade Zugnummern Richtung Westen, ungerade Richtung Osten:
            if (result == 0) result = (train1.number % 2) - (train2.number % 2);
            if (result == 0) result = train1.number - train2.number;
            return result;
        });
});
</script>

<template>
    <div id="page-list" class="page">
        <ul id="trains">
            <TrainContainer v-for="train in trains" :key="train.id" :train="train" />
        </ul>

        <ul id="log">
            <li v-for="(message, index) in store.messages" :key="index" class="message">
                <span class="time">{{ message.time }}</span>
                <span class="text">{{ message.text }}</span>
            </li>
        </ul>
    </div>
</template>

<style scoped>
/* list of train cards */
#page-list {
    padding: 1.2rem 0.8rem;
}
#trains {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(16.5rem, 1fr));
    grid-auto-rows: 14rem;
    grid-gap: 0.6rem 0.8rem;
    gap: 0.6rem 0.8rem;

    margin: 0;
    padding-left: 0;
    list-style: none;
}
@media (min-width: 30em) {
    #trains {
        grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
    }
}
/* /list of train cards */

/* train cards loading */
#trains:empty {
    height: calc(100% - 4.2rem);
    margin: 0;
    padding: 0;
    display: flex;
    justify-content: center;
    align-items: center;
}
#trains:empty::before {
    content: url(../assets/images/s-bahn-logo.svg);
    flex: 0 0 4.5rem;
    animation: beatinglogo 1s infinite;
}
#trains:empty::after {
    content: 'Loading...';
    flex: 0 0 auto;
    font-size: 1.8rem;
    line-height: 1;
    color: #606060;
    text-transform: uppercase;
    transition: color 0.1s ease;
    animation: beatingtext 1s infinite;
}
@keyframes beatinglogo {
    0% {
        transform: scale(0.75);
    }

    20% {
        transform: scale(1);
    }

    40% {
        transform: scale(0.75);
    }

    60% {
        transform: scale(1);
    }

    80% {
        transform: scale(0.75);
    }

    100% {
        transform: scale(0.75);
    }
}
@keyframes beatingtext {
    0% {
        color: #606060;
    }

    20% {
        color: #333;
    }

    40% {
        color: #606060;
    }

    60% {
        color: #333;
    }

    80% {
        color: #606060;
    }

    100% {
        color: #606060;
    }
}
/* /train cards loading */

/* LOG MESSAGES */
#log {
    max-height: 40vh;
    margin: 2.4rem -0.8rem -1.2rem;
    padding: 0.9rem 1.6rem 0.3rem;
    border-top: 0.1rem solid #c0c0c0;
    color: #606060;
    overflow-y: auto;

    background: #e0e0e0;
    box-shadow: 0 0.1rem 0.3rem 0 rgba(0, 0, 0, 0.3);

    list-style: none;
}
#log:empty {
    display: none;
}
#log .message {
    margin-bottom: 0.6rem;
}
#log .message .time {
    font-weight: bold;
}
/* /LOG MESSAGES */
</style>
