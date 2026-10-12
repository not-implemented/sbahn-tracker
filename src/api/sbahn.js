export default class SBahnClient {
    constructor(apiKey, log) {
        this._apiKey = apiKey;
        this._log = log;
        this._callbacks = {};

        this._isActive = false;
        this._socket = null;
        this._pingInterval = null;
        this._pongTimeout = null;
        this._connectTimeout = null;
        this._reconnectDelay = null;
        this._failedAttempts = 0;
        this._lastMessageAt = 0;
        this._hiddenAt = null;
        this._onLifecycleEvent = (event) => this._handleLifecycleEvent(event);

        this.clientTimeDiff = null;
        this._resetClientTimeDiff = false;

        this._stats = {
            connectionStatus: 'closed',
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

    removeSilent(source) {
        delete this._callbacks[source];
    }

    serverNow() {
        return Date.now() - (this.clientTimeDiff ?? 0);
    }

    connect() {
        if (this._isActive) return;

        this._isActive = true;
        this._addLifecycleListeners();
        this._connect();
    }

    _sendSubscribe(source) {
        if (source === 'trajectory') {
            this._send('BBOX -9999999 -9999999 9999999 9999999 14 tenant=sbm');
        } else if (source === 'deleted_vehicles') {
            // implicitly subscribed on server side
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
        this._removeLifecycleListeners();
        if (this._reconnectDelay) clearTimeout(this._reconnectDelay);
        this._reconnectDelay = null;
        this._abandonSocket('client closed');
    }

    _addLifecycleListeners() {
        if (typeof document === 'undefined') return;
        document.addEventListener('visibilitychange', this._onLifecycleEvent);
        window.addEventListener('pageshow', this._onLifecycleEvent);
        window.addEventListener('online', this._onLifecycleEvent);
        navigator.connection?.addEventListener?.('change', this._onLifecycleEvent);
    }

    _removeLifecycleListeners() {
        if (typeof document === 'undefined') return;
        document.removeEventListener('visibilitychange', this._onLifecycleEvent);
        window.removeEventListener('pageshow', this._onLifecycleEvent);
        window.removeEventListener('online', this._onLifecycleEvent);
        navigator.connection?.removeEventListener?.('change', this._onLifecycleEvent);
    }

    _handleLifecycleEvent(event) {
        if (!this._isActive) return;

        if (event.type === 'visibilitychange' && document.visibilityState === 'hidden') {
            this._hiddenAt = Date.now();
            return;
        }
        if (document.visibilityState === 'hidden') return;

        const hiddenFor = this._hiddenAt !== null ? Date.now() - this._hiddenAt : 0;
        this._hiddenAt = null;

        // Bei Netzwechsel oder längerem Standby ist die TCP-Verbindung meist tot (NAT-Timeout etc.)
        // - nicht erst auf den Ping-Timeout warten, sondern direkt neu verbinden:
        const networkChanged = event.type === 'online' || event.type === 'change';
        if (networkChanged || hiddenFor > 30000 || (event.type === 'pageshow' && event.persisted)) {
            this._log.info(`WebSocket reconnect after ${event.type} (hidden for ${hiddenFor} ms)`);
            this._reconnectNow();
            return;
        }

        if (!this._socket) {
            // Reconnect-Delay läuft evtl. noch mit Backoff - sofort neu versuchen:
            this._reconnectNow();
        } else if (this._socket.readyState === 1 && Date.now() - this._lastMessageAt > 2000) {
            // Kurz versteckt - Verbindung mit schnellem Ping prüfen:
            this._ping(1500);
        }
    }

    _reconnectNow() {
        if (this._reconnectDelay) clearTimeout(this._reconnectDelay);
        this._reconnectDelay = null;
        this._failedAttempts = 0;
        if (this._socket) {
            this._abandonSocket('forced reconnect');
        } else {
            this._connect();
        }
    }

    _ping(timeout) {
        if (!this._socket || this._socket.readyState !== 1) return;
        if (this._pongTimeout) return; // Ping läuft bereits

        this._send('PING');
        this._updateConnectionStatus('ping-wait');

        this._pongTimeout = setTimeout(() => {
            this._pongTimeout = null;
            this._abandonSocket('ping timeout');
        }, timeout);
    }

    /**
     * Gibt die aktuelle Socket sofort auf, ohne auf `onclose` zu warten: `close()` auf einer toten
     * Verbindung startet nur den Closing-Handshake, `onclose` kommt dann evtl. erst nach 60+ Sekunden.
     */
    _abandonSocket(reason) {
        const socket = this._socket;
        if (!socket) return;

        this._log.info('WebSocket abandoned: ' + reason);
        socket.onopen = socket.onclose = socket.onmessage = socket.onerror = null;
        try {
            socket.close();
        } catch {
            // ignore
        }
        this._handleClosed(socket);
    }

    _handleClosed(socket) {
        if (socket !== this._socket) return; // veraltete Socket

        if (this._pingInterval) clearInterval(this._pingInterval);
        this._pingInterval = null;
        if (this._pongTimeout) clearTimeout(this._pongTimeout);
        this._pongTimeout = null;
        if (this._connectTimeout) clearTimeout(this._connectTimeout);
        this._connectTimeout = null;

        this._socket = null;
        this._updateConnectionStatus('closed');

        if (this._isActive && !this._reconnectDelay) {
            // Backoff, damit es offline nicht in einer Schleife läuft:
            const delays = [100, 1000, 3000];
            const delay = delays[Math.min(this._failedAttempts, delays.length - 1)];
            this._failedAttempts++;
            this._log.info(`WebSocket connection closed - reconnecting in ${delay} ms`);
            this._reconnectDelay = setTimeout(() => {
                this._reconnectDelay = null;
                this._connect();
            }, delay);
        }
    }

    _updateConnectionStatus(connectionStatus) {
        this._stats.connectionStatus = connectionStatus;
        if (this._onStatsUpdateCallback) this._onStatsUpdateCallback(this._stats);
    }

    _connect() {
        if (!this._isActive || this._socket) return;

        const socket = new WebSocket('wss://api.geops.io/realtime-ws/v1/?key=' + this._apiKey);
        this._socket = socket;
        this._updateConnectionStatus('connecting');

        // Ohne Timeout hängt der Verbindungsaufbau evtl. sehr lange (z. B. Netz nach Standby noch nicht da).
        // Bei wiederholten Fehlschlägen länger warten, damit es auch bei schlechter Verbindung klappt:
        const connectTimeouts = [5000, 10000, 20000, 30000];
        const connectTimeout =
            connectTimeouts[Math.min(this._failedAttempts, connectTimeouts.length - 1)];
        this._connectTimeout = setTimeout(() => {
            this._connectTimeout = null;
            this._abandonSocket(`connect timeout (${connectTimeout} ms)`);
        }, connectTimeout);

        socket.onopen = () => {
            if (this._connectTimeout) clearTimeout(this._connectTimeout);
            this._connectTimeout = null;
            this._failedAttempts = 0;
            this._lastMessageAt = Date.now();

            this._updateConnectionStatus('open');
            // client clock may have jumped in the meantime (e.g. standby) - re-measure, but keep the
            // old value until the first message arrives:
            this._resetClientTimeDiff = true;
            this._onReconnectCallback();

            Object.keys(this._callbacks).forEach((source) => {
                this._sendSubscribe(source);
            });

            this._pingInterval = setInterval(() => this._ping(2000), 10000);
        };

        socket.onclose = () => this._handleClosed(socket);

        socket.onmessage = (event) => {
            this._lastMessageAt = Date.now();
            this._stats.messagesReceived++;
            this._stats.bytesReceived += event.data.length;
            if (this._onStatsUpdateCallback) this._onStatsUpdateCallback(this._stats);

            let message = null;
            try {
                message = JSON.parse(event.data);
            } catch (err) {
                this._log.warn(
                    'Ignored invalid JSON in WebSocket message: ' + err.message,
                    event.data,
                );
                return;
            }

            // minimal client time difference (= clock offset + minimal network latency):
            const timeDiff = Date.now() - message.timestamp;
            if (Number.isFinite(timeDiff)) {
                this.clientTimeDiff =
                    this.clientTimeDiff !== null && !this._resetClientTimeDiff
                        ? Math.min(timeDiff, this.clientTimeDiff)
                        : timeDiff;
                this._resetClientTimeDiff = false;
            }

            if (message.client_reference !== null && message.client_reference !== '') {
                this._log.info('client_reference is not null in WebSocket message', message);
            }

            if (message.source === 'websocket') {
                if (message.content === 'PONG') {
                    if (this._pongTimeout) clearTimeout(this._pongTimeout);
                    this._pongTimeout = null;
                    this._updateConnectionStatus('open');
                }

                // ignoring messages: content: {status: "open"}
            } else if (this._callbacks[message.source]) {
                this._callbacks[message.source](message.content);
            } else {
                this._log.warn(`Unknown source "${message.source}" in WebSocket message`, message);
            }
        };
    }
}
