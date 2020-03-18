const WebSocket = window && window.WebSocket || require('websocket').w3cwebsocket;

export default class SBahnClient {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.callbacks = {};

        this.isActive = false;
        this.socket = null;
        this.reconnectDelay = null;

        this.clientTimeDiff = 0;
    }

    on(source, callback) {
        if (this.socket && this.socket.readyState === 1) {
            this.socket.send('GET ' + source);
            this.socket.send('SUB ' + source);
        }

        this.callbacks[source] = callback;
    }

    remove(source) {
        if (this.socket && this.socket.readyState === 1) {
            this.socket.send('DEL ' + source);
        }

        delete this.callbacks[source];
    }

    connect() {
        if (this.isActive) return;

        this.isActive = true;
        this._connect();
    }

    close() {
        if (!this.isActive) return;

        this.isActive = false;
        if (this.socket) this.socket.close();
        if (this.reconnectDelay) clearTimeout(this.reconnectDelay);
    }

    _connect() {
        this.socket = new WebSocket('wss://api.geops.io/realtime-ws/v1/?key=' + this.apiKey);

        this.socket.onopen = () => {
            Object.keys(this.callbacks).forEach(source => {
                this.socket.send('GET ' + source);
                this.socket.send('SUB ' + source);
            });
        };

        this.socket.onclose = () => {
            this.socket = null;

            if (this.isActive) {
                this.reconnectDelay = setTimeout(() => this._connect(), 100);
            }
        };

        this.socket.onmessage = (event) => {
            let message = null;
            try {
                message = JSON.parse(event.data);
            } catch (err) {
                console.warn('Ignored invalid JSON in WebSocket message: ' + err.message, event.data);
                return;
            }

            this.clientTimeDiff = Date.now() - message.timestamp;

            if (message.source === 'websocket') {
                // ignoring message: content: {status: "open"}
                // TODO: implement ping/pong
            } else if (this.callbacks.hasOwnProperty(message.source)) {
                this.callbacks[message.source](message.content);
            } else {
                console.warn(`Unknown source "${message.source}" in WebSocket message`, event.data);
            }
        };
    }
}
