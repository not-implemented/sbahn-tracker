export default class SBahnClient {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.onTrainUpdate = () => {};
    }

    connect() {
        this.socket = new WebSocket('wss://api.geops.io/realtime-ws/v1/?key=' + this.apiKey);

        this.socket.onerror = () => {
            console.log('WebSocket Connection Error');
        };

        this.socket.onopen = () => {
            console.log('WebSocket Client Connected');

            this.socket.send('GET trajectory');
            this.socket.send('SUB trajectory');

            // TODO:
            //this.socket.send('GET newsticker');
            //this.socket.send('GET station');
            //GET full_trajectory_schematic_140292529036984
            //GET stopsequence_schematic_140292529036984
        };

        this.socket.onclose = () => {
            console.log('WebSocket Client Closed');

            setTimeout(() => this.connect(), 1000);
        };

        this.socket.onmessage = (ev) => {
            let message = JSON.parse(ev.data);

            if (message.source === 'websocket') {
                // ignore
            } else if (message.source === 'trajectory') {
                this.onTrainUpdate(message.content.properties);
            } else {
                console.log('Unknown source in WebSocket message: ', ev.data);
            }
        };
    }
}
