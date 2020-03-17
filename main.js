import SBahnClient from './modules/client.js';
import Stations from './modules/stations.js';

class SBahnGui {
    constructor() {
        this.filteredLines = [];

        this.lines = {};
        this.linesNode = document.getElementById('lines');

        this.trains = {};
        this.trainsNode = document.getElementById('trains');

        this.trackTrainId = null;

        this.logNode = document.getElementById('log');

        this.waggons = {};

        this.vehicleInfos = {};

        fetch('vehicle-info.php').then(response => response.json()).then(data => {
            this.vehicleInfos = {};
            data.forEach(vehicleInfo => {
                if (vehicleInfo.model !== '423') return;
                this.vehicleInfos[vehicleInfo.number] = vehicleInfo;
            });

            Object.values(this.trains).forEach(train => this.updateTrainContainer(train));
        });

        this.map = L.map('map').setView([48.137222222222, 11.575277777778], 13);

        L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token={accessToken}', {
            attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
            maxZoom: 18,
            id: 'mapbox/streets-v11',
            tileSize: 512,
            zoomOffset: -1,
            accessToken: 'pk.eyJ1Ijoibm90LWltcGxlbWVudGVkIiwiYSI6ImNrN3Mxc3BicDA5OTczbnBjaWp3aG9vbGwifQ.QXUwqP4R70UpPPxzNfewEA'
        }).addTo(this.map);

        let syncHash = () => {
            let pageTrainsNode = document.getElementById('page-trains');
            let pageTrainNode = document.getElementById('page-train');

            pageTrainsNode.classList.toggle('active', false);
            pageTrainNode.classList.toggle('active', false);

            if (location.hash.startsWith('#train/')) {
                pageTrainNode.classList.toggle('active', true);
                this.trackTrainId = parseInt(location.hash.replace('#train/', ''));
                this.map.invalidateSize();
            } else {
                pageTrainsNode.classList.toggle('active', true);
            }
        };
        window.onhashchange = syncHash;
        syncHash();

        this.client = new SBahnClient('put-api-key-here');

        this.client.onTrainUpdate = (trainInfo, geometry) => {
            let trainId = trainInfo.train_id;
            let train = this.trains[trainId];

            if (!train) {
                train = {
                    id: trainId,
                    node: document.importNode(document.querySelector('template#train').content.firstElementChild, true),
                    updateInterval: setInterval(() => this.updateTrain(train), 1000),
                    vehicles: []
                };

                let detailsLink = train.node.querySelector('.details');
                detailsLink.href = detailsLink.href.replace('{id}', trainId);

                this.trains[trainId] = train;
            }

            let stations = trainInfo.calls_stack;

            train.line = trainInfo.line || train.line || { id: 99, name: 'S?', color: '#777', text_color: '#fff' };
            train.lineIsOld = !trainInfo.line && train.line.id != 99;
            train.destination = stations && stations.length > 0 ? stations[stations.length - 1] : 'Nicht einsteigen';
            train.number = trainInfo.train_number || train.number || null;
            train.numberIsOld = train.number && !trainInfo.train_number;
            train.state = trainInfo.state;
            train.prevStation = trainInfo.stop_point_ds100 || train.prevStation || null;
            train.prevStationIsOld = train.prevStation && !trainInfo.stop_point_ds100;
            let pos = stations ? stations.indexOf(trainInfo.stop_point_ds100) : -1;
            train.nextStation = pos !== -1 && stations[pos + 1] ? stations[pos + 1] : null;

            let vehicleNumbers = [trainInfo.vehicle_number];
            if (trainInfo.rake) {
                vehicleNumbers = trainInfo.rake.split(';').filter(num => num !== '0').map(num => num.substr(-4, 3));
            } else {
                console.log('rake is null - using vehicle_number', trainInfo);
            }

            vehicleNumbers.forEach(vehicleNumber => {
                let prevTrainOfWaggon = this.waggons[vehicleNumber];
                if (prevTrainOfWaggon && prevTrainOfWaggon !== train) {
                    let pos = prevTrainOfWaggon.vehicles.indexOf(vehicleNumber);
                    if (pos !== -1) prevTrainOfWaggon.vehicles.splice(pos, 1);

                    // merge info from previous train:
                    if (train.line.id === 99) {
                        train.line = prevTrainOfWaggon.line;
                        train.lineIsOld = true;
                    }
                    if (!train.number) {
                        train.number = prevTrainOfWaggon.number;
                        train.numberIsOld = true;
                    }
                    if (!train.prevStation) {
                        train.prevStation = prevTrainOfWaggon.prevStation;
                        train.prevStationIsOld = true;
                    }

                    let deletePrevTrain = prevTrainOfWaggon.vehicles.length === 0;

                    if (!deletePrevTrain) {
                        this.updateTrainContainer(prevTrainOfWaggon);
                    } else {
                        delete this.trains[prevTrainOfWaggon.id];
                        if (prevTrainOfWaggon.updateInterval) clearInterval(prevTrainOfWaggon.updateInterval);
                        if (prevTrainOfWaggon.node.parentNode) prevTrainOfWaggon.node.parentNode.removeChild(prevTrainOfWaggon.node);
                        prevTrainOfWaggon.node = null;
                    }

                    let actions = [];
                    if (!deletePrevTrain) actions.push('von Wagen ' + prevTrainOfWaggon.vehicles.join('+') + ' abgekuppelt');
                    if (train.vehicles.length > 0) actions.push('an Wagen ' + train.vehicles.join('+') + ' angekuppelt');

                    if (actions.length > 0) {
                        this.log(`${(new Date()).toLocaleTimeString()}: ${Stations[train.prevStation] || train.prevStation || ''}: Wagen ${vehicleNumber} wurde ${actions.join(' und ')}`);
                    }
                }

                this.waggons[vehicleNumber] = train;
                if (!train.vehicles.includes(vehicleNumber)) train.vehicles.push(vehicleNumber);
            });
            if (trainInfo.rake) train.vehicles = vehicleNumbers; // for correct order

            train.lastUpdate = Date.now() - trainInfo.time_since_update;

            if (train.id === this.trackTrainId) {
                console.log(trainInfo);

                let trNode = createEl('tr');
                let ts = (new Date(trainInfo.timestamp));
                trNode.appendChild(createTextEl('td', ts.toLocaleTimeString() + '.' + String(ts.getMilliseconds()).padStart(3, '0')));
                let eventTs = (new Date(trainInfo.event_timestamp));
                trNode.appendChild(createTextEl('td', eventTs.toLocaleTimeString() + '.' + String(eventTs.getMilliseconds()).padStart(3, '0')));
                trNode.appendChild(createTextEl('td', trainInfo.time_since_update));
                trNode.appendChild(createTextEl('td', trainInfo.aimed_time_offset));
                trNode.appendChild(createTextEl('td', trainInfo.delay));
                trNode.appendChild(createTextEl('td', trainInfo.state));
                trNode.appendChild(createTextEl('td', trainInfo.event));
                trNode.appendChild(createTextEl('td', trainInfo.ride_state));
                trNode.appendChild(createTextEl('td', trainInfo.train_number));
                trNode.appendChild(createTextEl('td', trainInfo.stop_point_ds100));
                trNode.appendChild(createTextEl('td', trainInfo.position_correction));
                trNode.appendChild(createTextEl('td', trainInfo.transmitting_vehicle));
                document.querySelector('#train-events tbody').appendChild(trNode);

                this.map.setView([trainInfo.raw_coordinates[1], trainInfo.raw_coordinates[0]]);

                var circle = L.circle([trainInfo.raw_coordinates[1], trainInfo.raw_coordinates[0]], {
                    color: train.line.color,
                    fillColor: train.line.color,
                    fillOpacity: 0.5,
                    radius: 10
                }).addTo(this.map);

                let latlng = geometry.coordinates.map(coord => [coord[1], coord[0]]);
                var polyline = L.polyline(latlng, {color: 'red'}).addTo(this.map);
            }

            this.updateTrainContainer(train);
            this.updateLines(train);
        };

        this.client.connect();
    }

    updateTrainContainer(train) {
        let lineLogo = train.node.querySelector('.line-logo');
        let trainNumber = train.node.querySelector('.train-number');
        let stationPrev = train.node.querySelector('.station-prev');
        let stationNext = train.node.querySelector('.station-next');
        let trainHeader = train.node.querySelector('.train-header');
        let waggonsNode = train.node.querySelector('.waggons');

        setText(lineLogo, train.line.name);
        lineLogo.style.backgroundColor = train.line.color;
        lineLogo.style.color = train.line.text_color;
        trainHeader.style.backgroundColor = train.line.color + '20'; /* alpha 12.5% */

        setText(train.node.querySelector('.destination'), Stations[train.destination] || train.destination);
        setText(trainNumber, train.number || '');

        train.node.classList.toggle('train-stopped', train.state !== 'DRIVING');
        train.node.classList.toggle('train-sided', train.lineIsOld || train.line.id === 99);

        if (train.prevStation === train.destination) {
            setText(stationPrev, '');
        } else {
            if (!stationPrev.querySelector('.strip')) {
                stationPrev.appendChild(createEl('span', 'strip'));
            }
            setText(stationPrev.querySelector('.strip'), Stations[train.prevStation] || train.prevStation || '');
        }

        if (train.nextStation === train.destination) {
            setText(stationNext, '');
        } else {
            if (!stationNext.querySelector('.strip')) {
                stationNext.appendChild(createEl('span', 'strip'));
            }
            setText(stationNext.querySelector('.strip'), Stations[train.nextStation] || train.nextStation || '');
        }

        let waggonNode = waggonsNode.firstElementChild;
        train.vehicles.forEach((vehicleId) => {
            if (!waggonNode) {
                waggonNode = createEl('li', 'waggon');
                waggonsNode.appendChild(waggonNode);
            }
            setText(waggonNode, vehicleId);

            let vehicleInfo = this.vehicleInfos[vehicleId];
            waggonNode.classList.toggle('is-modern', !!(vehicleInfo && vehicleInfo.isModern === true));
            waggonNode.classList.toggle('is-classic', !!(vehicleInfo && vehicleInfo.isModern === false));

            waggonNode = waggonNode.nextElementSibling;
        });
        while (waggonNode) {
            let nextNode = waggonNode.nextElementSibling;
            waggonsNode.removeChild(waggonNode);
            waggonNode = nextNode;
        }

        trainHeader.classList.toggle('is-old', train.lineIsOld);
        stationPrev.classList.toggle('is-old', train.prevStationIsOld);
        trainNumber.classList.toggle('is-old', train.numberIsOld);

        this.updateTrain(train);
        this.updateTrains();
    }

    updateTrain(train) {
        let seconds = Math.floor((Date.now() - train.lastUpdate) / 1000);
        let infoText = '';

        if (seconds > 30) {
            let minutes = Math.floor(seconds / 60);
            seconds -= minutes * 60;
            infoText = 'Keine Info seit ' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
        }

        setText(train.node.querySelector('.lastUpdate'), infoText);
    }

    /**
     * Intelligent reordering/inserting/removing of DOM nodes with minimal changes to DOM
     */
    updateTrains() {
        let previousSibling = null;

        Object.keys(this.trains).sort((id1, id2) => {
            let res = this.trains[id1].lineIsOld - this.trains[id2].lineIsOld;
            if (res == 0) res = this.trains[id1].line.id - this.trains[id2].line.id;
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

    log(message) {
        let messageNode = createEl('div', 'message');
        messageNode.textContent = message;
        this.logNode.appendChild(messageNode);
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
        let lineNode = document.importNode(document.querySelector('template#line').content.firstElementChild, true);

        let checkboxNode = lineNode.querySelector('input');
        checkboxNode.value = line.id;
        checkboxNode.addEventListener('change', () => this.updateLineFilter());

        let lineLogoNode = lineNode.querySelector('.line-logo');
        lineLogoNode.textContent = line.name;
        lineLogoNode.style.backgroundColor = line.color;
        lineLogoNode.style.color = line.text_color;

        return lineNode;
    }

    updateLineFilter() {
        this.filteredLines = [];
        this.linesNode.querySelectorAll('input:checked').forEach((node => {
            this.filteredLines.push(parseInt(node.value, 10));
        }));

        this.linesNode.classList.toggle('selectAll', this.filteredLines.length === 0);

        this.updateTrains();
    }
}

function createEl(name, className) {
    let node = document.createElement(name);
    if (className) node.classList.add(className);
    return node;
}

function createTextEl(name, text) {
    let node = document.createElement(name);
    node.textContent = text;
    return node;
}

function setText(node, text) {
    text = '' + text;
    if (node.textContent !== text) node.textContent = text;
}

new SBahnGui();
