import { createRouter, createWebHashHistory } from 'vue-router';
import ListView from './views/ListView.vue';
import MapView from './views/MapView.vue';
import NewstickerView from './views/NewstickerView.vue';
import DebugView from './views/DebugView.vue';

export default createRouter({
    history: createWebHashHistory(),
    routes: [
        {
            name: 'list',
            path: '/list',
            component: ListView,
        },
        {
            name: 'map',
            path: '/map',
            component: MapView,
        },
        {
            name: 'newsticker',
            path: '/newsticker',
            component: NewstickerView,
        },
        {
            name: 'debug',
            path: '/debug',
            component: DebugView,
        },
        {
            name: 'NotFound',
            path: '/:pathMatch(.*)*',
            redirect: () => ({ name: 'list' }),
        },
    ],
});
