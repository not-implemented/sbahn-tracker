import SBahnClient from './modules/client.js';

class SBahnGui {
    constructor() {
        this.filteredLines = [];

        this.lines = {};
        this.linesNode = document.getElementById('lines');

        this.trains = {};
        this.trainsNode = document.getElementById('trains');

        this.waggons = {};

        this.client = new SBahnClient('5cc87b12d7c5370001c1d655306122aa0a4743c489b497cb1afbec9b');

        this.client.onTrainUpdate = (trainInfo) => {
            let trainId = trainInfo.train_id;
            let train = this.trains[trainId];

            if (!train) {
                train = {
                    node: this.createTrainContainer(),
                    updateInterval: setInterval(() => this.updateTrain(train), 1000),
                    vehicles: {}
                };
                this.trains[trainId] = train;
            }

            let stations = trainInfo.calls_stack;

            train.line = trainInfo.line || { id: 99, name: 'S?', color: '#777', text_color: '#fff' };
            train.destination = stations && stations.length > 0 ? stations[stations.length - 1] : 'Nicht einsteigen';
            train.number = trainInfo.train_number || train.number || null;
            train.numberIsOld = train.number && !trainInfo.train_number;
            train.state = trainInfo.state;
            train.prevStation = trainInfo.stop_point_ds100 || train.prevStation || null;
            train.prevStationIsOld = train.prevStation && !trainInfo.stop_point_ds100;
            let pos = stations ? stations.indexOf(trainInfo.stop_point_ds100) : -1;
            train.nextStation = pos !== -1 && stations[pos + 1] ? stations[pos + 1] : null;

            let prevTrainOfWaggon = this.waggons[trainInfo.vehicle_number];
            if (prevTrainOfWaggon && prevTrainOfWaggon !== train) {
                prevTrainOfWaggon.vehicles[trainInfo.vehicle_number] = false;
                this.updateTrainContainer(prevTrainOfWaggon);
            }
            this.waggons[trainInfo.vehicle_number] = train;
            train.vehicles[trainInfo.vehicle_number] = true;

            train.deleted = false;
            train.lastUpdate = Date.now() - trainInfo.time_since_update;

            this.updateTrainContainer(train);
            this.updateLines(train);
        };

        document.getElementById('cleanupTrains').addEventListener('click', () => this.cleanupTrains());

        this.client.connect();
    }

    createTrainContainer() {
        let trainNode = createEl('div', 'train');

        let headerNode = createEl('div', 'header');
        headerNode.appendChild(createEl('span', 'lineLogo'));
        headerNode.appendChild(createEl('span', 'destination'));
        headerNode.appendChild(createEl('span', 'number'));
        trainNode.appendChild(headerNode);

        let stateNode = createEl('div', 'state');
        stateNode.appendChild(createEl('div', 'light'));
        trainNode.appendChild(stateNode);

        let bodyNode = createEl('div', 'body');
        let stationNode = createEl('div', 'station');
        stationNode.appendChild(createEl('div', 'prev'));
        stationNode.appendChild(createEl('div', 'next'));
        bodyNode.appendChild(stationNode);
        bodyNode.appendChild(createEl('div', 'vehicle'));
        trainNode.appendChild(bodyNode);

        trainNode.appendChild(createEl('div', 'lastUpdate'));

        return trainNode;
    }

    updateTrainContainer(train) {
        train.node.querySelector('.lineLogo').innerText = train.line.name;
        train.node.querySelector('.lineLogo').style.backgroundColor = train.line.color;
        train.node.querySelector('.lineLogo').style.color = train.line.text_color;
        train.node.querySelector('.destination').innerText = train.destination;
        train.node.querySelector('.number').innerText = (train.numberIsOld ? 'Zuletzt: ' : '') + (train.number || '');
        if (train.state === 'DRIVING') {
            train.node.querySelector('.state').classList.add('driving');
            train.node.querySelector('.station').classList.add('driving');
        } else {
            train.node.querySelector('.state').classList.remove('driving');
            train.node.querySelector('.station').classList.remove('driving');
        }
        train.node.querySelector('.station .prev').innerText = (train.prevStationIsOld ? 'Zuletzt: ' : '') + (train.prevStation || '');
        train.node.querySelector('.station .next').innerText = train.nextStation;
        train.node.querySelector('.vehicle').innerText = '';

        let hasWaggons = false;
        Object.keys(train.vehicles).forEach((vehicleId) => {
            let waggonNode = createEl('span', 'waggon');
            waggonNode.innerText = vehicleId;
            if (!train.vehicles[vehicleId]) waggonNode.classList.add('deleted');
            else hasWaggons = true;
            train.node.querySelector('.vehicle').appendChild(waggonNode);
        });
        if (!hasWaggons) {
            train.deleted = true;
            train.node.classList.add('deleted');
        } else {
            train.deleted = false;
            train.node.classList.remove('deleted');
        }

        this.updateTrain(train);
        this.updateTrains();
    }

    updateTrain(train) {
        let seconds = Math.floor((Date.now() - train.lastUpdate) / 1000);
        let infoText = '';

        if (!train.deleted && seconds > 30) {
            let minutes = Math.floor(seconds / 60);
            seconds -= minutes * 60;
            infoText = 'Keine Info seit ' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
        }

        train.node.querySelector('.lastUpdate').innerText = infoText;
    }

    /**
     * Intelligent reordering/inserting/removing of DOM nodes with minimal changes to DOM
     */
    updateTrains() {
        let previousSibling = null;

        Object.keys(this.trains).sort((id1, id2) => {
            let res = this.trains[id1].line.id - this.trains[id2].line.id;
            // gerade Zugnummern Richtung Westen, ungerade Richtung Osten:
            if (res == 0) res = this.trains[id1].number % 2 - this.trains[id2].number % 2;
            if (res == 0) res = this.trains[id1].number - this.trains[id2].number;
            return res;
        }).forEach((id) => {
            let train = this.trains[id];

            if (this.filteredLines.length > 0 && !this.filteredLines.includes(train.line.id)) {
                if (train.node.parentNode) train.node.parentNode.removeChild(train.node);
            } else {
                if (train.node.parentNode) {
                    if (train.node.previousSibling !== previousSibling) {
                        train.node.parentNode.removeChild(train.node);
                    }
                }

                if (!train.node.parentNode) {
                    let refNode = previousSibling ? previousSibling.nextSibling : this.trainsNode.firstChild;
                    this.trainsNode.insertBefore(train.node, refNode);
                }
                previousSibling = train.node;
            }
        });
    }

    cleanupTrains() {
        Object.keys(this.trains).forEach((id) => {
            let train = this.trains[id];

            if (train.deleted) {
                delete this.trains[id];
                if (train.updateInterval) clearInterval(train.updateInterval);
                if (train.node.parentNode) train.node.parentNode.removeChild(train.node);
                train.node = null;
            }
        });
    }

    updateLines(train) {
        let lineId = train.line.id;
        let line = this.lines[lineId];

        if (!line) {
            line = {
                node: this.createLineContainer(train.line),
            };
            this.lines[lineId] = line;
        }

        let previousSibling = null;

        Object.keys(this.lines).sort((id1, id2) => {
            return id1 - id2;
        }).forEach((id) => {
            let line = this.lines[id];

            if (!line.node.parentNode) {
                let refNode = previousSibling ? previousSibling.nextSibling : this.linesNode.firstChild;
                this.linesNode.insertBefore(line.node, refNode);
            }
            previousSibling = line.node;
        });

        this.updateLineFilter();
    }

    createLineContainer(line) {
        let lineNode = createEl('label', 'line');

        let checkboxNode = createEl('input');
        checkboxNode.type = 'checkbox';
        checkboxNode.value = line.id;
        checkboxNode.addEventListener('change', () => this.updateLineFilter());
        lineNode.appendChild(checkboxNode);

        let lineLogoNode = createEl('span', 'lineLogo');
        lineLogoNode.textContent = line.name;
        lineLogoNode.style.backgroundColor = line.color;
        lineLogoNode.style.color = line.text_color;
        lineNode.appendChild(lineLogoNode);

        return lineNode;
    }

    updateLineFilter() {
        this.filteredLines = [];
        this.linesNode.querySelectorAll('input:checked').forEach((node => {
            this.filteredLines.push(parseInt(node.value, 10));
        }));

        if (this.filteredLines.length === 0) {
            this.linesNode.classList.add('selectAll');
        } else {
            this.linesNode.classList.remove('selectAll');
        }

        this.updateTrains();
    }
}

function createEl(name, className) {
    let node = document.createElement(name);
    if (className) node.classList.add(className);
    return node;
}

new SBahnGui();
