const WebSocket = window && window.WebSocket || require('websocket').w3cwebsocket;

export default class SBahnClient {
    constructor(apiKey, log) {
        this._apiKey = apiKey;
        this._log = log;
        this._callbacks = {};

        this._isActive = false;
        this._socket = null;
        this._pingInterval = null;
        this._reconnectDelay = null;

        this.clientTimeDiff = null;

        this._stats = {
            messagesReceived: 0,
            bytesReceived: 0,
            messagesSent: 0,
            bytesSent: 0,
        };
    }

    onReconnect(callback) {
        this._onReconnectCallback = callback;
    }

    onStatsUpdate(callback) {
        this._onStatsUpdateCallback = callback;
    }

    on(source, callback) {
        this._sendSubscribe(source);
        this._callbacks[source] = callback;
    }

    remove(source) {
        this._send('DEL ' + source);

        delete this._callbacks[source];
    }

    connect() {
        if (this._isActive) return;

        this._isActive = true;
        this._connect();
    }

    _sendSubscribe(source) {
        if (source === 'trajectory') {
            this._send('BBOX -9999999 -9999999 9999999 9999999 14 tenant=sbm');
        } else {
            this._send('GET ' + source);
            this._send('SUB ' + source);
        }
    }

    _send(message) {
        if (!this._isActive) return;
        if (!this._socket || this._socket.readyState !== 1) return;

        this._socket.send(message);
        this._stats.messagesSent++;
        this._stats.bytesSent += message.length;
        if (this._onStatsUpdateCallback) this._onStatsUpdateCallback(this._stats);
    }

    close() {
        if (!this._isActive) return;

        this._isActive = false;
        if (this._socket) this._socket.close();
        if (this._reconnectDelay) clearTimeout(this._reconnectDelay);
    }

    _connect() {
        this._socket = new WebSocket('wss://api.geops.io/realtime-ws/v1/?key=' + this._apiKey);

        this._socket.onopen = () => {
            this._onReconnectCallback();

            Object.keys(this._callbacks).forEach(source => {
                this._sendSubscribe(source);
            });

            this._pingInterval = setTimeout(() => this._send('PING'), 10000);
        };

        this._socket.onclose = () => {
            if (this._pingInterval) clearTimeout(this._pingInterval);

            this._socket = null;

            if (this._isActive) {
                this._log.info('WebSocket connection closed - reconnecting');
                this._reconnectDelay = setTimeout(() => this._connect(), 100);
            }
        };

        this._socket.onmessage = (event) => {
            this._stats.messagesReceived++;
            this._stats.bytesReceived += event.data.length;
            if (this._onStatsUpdateCallback) this._onStatsUpdateCallback(this._stats);

            let message = null;
            try {
                message = JSON.parse(event.data);
            } catch (err) {
                this._log.warn('Ignored invalid JSON in WebSocket message: ' + err.message, event.data);
                return;
            }

            // minimal client time difference:
            let timeDiff = Date.now() - message.timestamp;
            this.clientTimeDiff = this.clientTimeDiff !== null ? Math.min(timeDiff, this.clientTimeDiff) : timeDiff;

            if (message.client_reference !== null && message.client_reference !== '') {
                this._log.info('client_reference is not null in WebSocket message', message);
            }

            if (message.source === 'websocket') {
                // ignoring messages: content: {status: "open"} and "content": "PONG"
            } else if (this._callbacks.hasOwnProperty(message.source)) {
                this._callbacks[message.source](message.content);
            } else {
                this._log.warn(`Unknown source "${message.source}" in WebSocket message`, message);
            }
        };
    }
}
