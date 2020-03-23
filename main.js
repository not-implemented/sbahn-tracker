import './modules/polyfills.js';
import SBahnClient from './modules/client.js';
import Stations from './modules/stations.js';

class SBahnGui {
    constructor() {
        this.lines = new Map();
        this.trains = new Map();
        this.trackTrainId = null;
        this.vehicles = {};
        this.vehicleInfos = {};

        this.filteredLines = [];

        this.initMap();
        this.initNavigation();
        this.loadVehicleInfos();

        this.client = new SBahnClient('5cc87b12d7c5370001c1d655306122aa0a4743c489b497cb1afbec9b', console);
        this.client.on('trajectory', event => this.onTrajectoryEvent(event));
        this.client.connect();
    }

    initMap() {
        this.map = L.map('map').setView([48.137222222222, 11.575277777778], 13);

        L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token={accessToken}', {
            attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
            maxZoom: 18,
            id: 'mapbox/streets-v11',
            tileSize: 512,
            zoomOffset: -1,
            accessToken: 'pk.eyJ1Ijoibm90LWltcGxlbWVudGVkIiwiYSI6ImNrN3Mxc3BicDA5OTczbnBjaWp3aG9vbGwifQ.QXUwqP4R70UpPPxzNfewEA'
        }).addTo(this.map);
    }

    initNavigation() {
        let syncHash = () => {
            document.querySelectorAll('main > .page').forEach(pageNode => {
                pageNode.classList.toggle('is-active', false);
            });

            if (location.hash === '#map' || location.hash.startsWith('#train/')) {
                document.querySelector('#page-map').classList.toggle('is-active', true);

                if (this.trains.has(this.trackTrainId)) {
                    let train = this.trains.get(this.trackTrainId);
                    train.mapMarkerSvgNode.querySelector('.main').style.stroke = '#fff';
                }

                if (location.hash.startsWith('#train/')) {
                    this.trackTrainId = parseInt(location.hash.replace('#train/', ''));
                } else {
                    this.trackTrainId = null;
                }
                document.querySelector('#train-details').classList.toggle('is-active', !!this.trackTrainId);

                if (this.trains.has(this.trackTrainId)) {
                    let train = this.trains.get(this.trackTrainId);
                    let trainNode = document.querySelector('#train-details .train');
                    this.updateTrainContainer(train, trainNode);
                    document.querySelector('#train-events tbody').textContent = '';
                    train.mapMarkerSvgNode.querySelector('.main').style.stroke = '#f00';
                }

                this.map.invalidateSize();
            } else {
                document.querySelector('#page-list').classList.toggle('is-active', true);
            }
        };
        window.onhashchange = syncHash;
        syncHash();
    }

    loadVehicleInfos() {
        fetch('vehicle-info.php').then(response => response.json()).then(data => {
            this.vehicleInfos = {};
            data.forEach(vehicleInfo => {
                if (vehicleInfo.model !== '423') return;
                this.vehicleInfos[vehicleInfo.number] = vehicleInfo;
            });

            this.trains.forEach(train => this.updateTrainContainer(train));
        });
    }

    onTrajectoryEvent(event) {
        let trainInfo = event.properties;
        let trainId = trainInfo.train_id;
        let train = this.trains.get(trainId);

        if (!train) {
            train = {
                id: trainId,
                node: document.importNode(document.querySelector('template#train').content.firstElementChild, true),
                updateInterval: setInterval(() => this.updateTrain(train), 1000),
                vehicles: []
            };

            let detailsLink = train.node.querySelector('.details');
            detailsLink.href = detailsLink.href.replace('{id}', trainId);

            this.trains.set(trainId, train);
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

        let vehicles;
        if (trainInfo.rake !== null) {
            vehicles = trainInfo.rake.split(';').chunk(4).map(vehicle => {
                let isReverse = vehicle[0] === '0';
                let refWaggon = vehicle[isReverse ? 3 : 0];
                return { number: refWaggon.substr(-4, 3), isReverse };
            });
        } else {
            vehicles = [{ number: trainInfo.vehicle_number, isReverse: null }];
            console.log('rake is null - using vehicle_number', trainInfo);
        }

        vehicles.forEach(vehicle => {
            let prevTrainOfVehicle = this.vehicles[vehicle.number];
            if (prevTrainOfVehicle && prevTrainOfVehicle !== train) {
                let pos = prevTrainOfVehicle.vehicles.findIndex(v => v.number === vehicle.number);
                if (pos !== -1) prevTrainOfVehicle.vehicles.splice(pos, 1);

                // merge info from previous train:
                if (train.line.id === 99) {
                    train.line = prevTrainOfVehicle.line;
                    train.lineIsOld = true;
                }
                if (!train.number) {
                    train.number = prevTrainOfVehicle.number;
                    train.numberIsOld = true;
                }
                if (!train.prevStation) {
                    train.prevStation = prevTrainOfVehicle.prevStation;
                    train.prevStationIsOld = true;
                }

                let deletePrevTrain = prevTrainOfVehicle.vehicles.length === 0;

                if (!deletePrevTrain) {
                    this.updateTrainContainer(prevTrainOfVehicle);
                } else {
                    this.trains.delete(prevTrainOfVehicle.id);
                    if (prevTrainOfVehicle.updateInterval) clearInterval(prevTrainOfVehicle.updateInterval);
                    if (prevTrainOfVehicle.node.parentNode) prevTrainOfVehicle.node.parentNode.removeChild(prevTrainOfVehicle.node);
                    prevTrainOfVehicle.node = null;
                    if (prevTrainOfVehicle.mapMarker) prevTrainOfVehicle.mapMarker.remove();
                    prevTrainOfVehicle.mapMarker = null;
                    prevTrainOfVehicle.mapMarkerSvgNode = null;
                }

                let actions = [];
                if (!deletePrevTrain) actions.push('von Wagen ' + prevTrainOfVehicle.vehicles.map(v => v.number).join('+') + ' abgekuppelt');
                if (train.vehicles.length > 0) actions.push('an Wagen ' + train.vehicles.map(v => v.number).join('+') + ' angekuppelt');

                if (actions.length > 0) {
                    this.log(`${(new Date()).toLocaleTimeString()}: ${Stations[train.prevStation] || train.prevStation || ''}: Wagen ${vehicle.number} wurde ${actions.join(' und ')}`);
                }
            }

            this.vehicles[vehicle.number] = train;
            if (train.vehicles.findIndex(v => v.number === vehicle.number) === -1) train.vehicles.push(vehicle.number);
        });
        train.vehicles = vehicles; // for correct order

        train.lastUpdate = Date.now() - trainInfo.time_since_update;

        if (train.id === this.trackTrainId) {
            console.log(trainInfo);

            let trainNode = document.querySelector('#train-details .train');

            this.updateTrainContainer(train, trainNode);
            this.logTrainEvent(trainInfo);

            this.map.setView([trainInfo.raw_coordinates[1], trainInfo.raw_coordinates[0]]);

            var circle = L.circle([trainInfo.raw_coordinates[1], trainInfo.raw_coordinates[0]], {
                color: train.line.color,
                fillColor: train.line.color,
                fillOpacity: 0.5,
                radius: 10
            }).addTo(this.map);

            let latlng = event.geometry.coordinates.map(coord => [coord[1], coord[0]]);
            var polyline = L.polyline(latlng, {color: 'red'}).addTo(this.map);
        }

        if (!train.mapMarker) {
            train.mapMarkerSvgNode = document.importNode(document.querySelector('template#train-marker').content.firstElementChild, true);
            train.mapMarker = L.marker([trainInfo.raw_coordinates[1], trainInfo.raw_coordinates[0]], {
                icon: L.divIcon({
                    html: train.mapMarkerSvgNode,
                    className: '',
                    iconSize: [50, 50],
                    iconAnchor: [25, 25]
                }),
                opacity: 0.75
            }).addTo(this.map).on('click', (event) => {
                location.hash = '#train/' + train.id;
            });
        } else {
            train.mapMarker.setLatLng(L.latLng(trainInfo.raw_coordinates[1], trainInfo.raw_coordinates[0]));
        }
        train.mapMarkerSvgNode.querySelector('.main').style.fill = train.line.color;
        train.mapMarkerSvgNode.querySelector('text').style.fill = train.line.text_color;
        train.mapMarkerSvgNode.querySelector('text').textContent = train.line.name;

        if (trainInfo.time_intervals) {
            let direction = trainInfo.time_intervals[0][2];
            if (direction) {
                direction = - direction / Math.PI * 180;
                train.mapMarkerSvgNode.querySelector('path').transform.baseVal.getItem(0).setRotate(direction, 5, 5);
                train.mapMarkerSvgNode.querySelector('path').style.display = null;
            } else {
                train.mapMarkerSvgNode.querySelector('path').style.display = 'none';
            }
        }

        this.updateTrainContainer(train);
        this.updateLines(train);
    }

    updateTrainContainer(train, trainNode) {
        trainNode = trainNode || train.node;
        let lineLogo = trainNode.querySelector('.line-logo');
        let trainNumber = trainNode.querySelector('.train-number');
        let stationPrev = trainNode.querySelector('.station-prev');
        let stationNext = trainNode.querySelector('.station-next');
        let trainHeader = trainNode.querySelector('.train-header');
        let vehiclesNode = trainNode.querySelector('.vehicles');

        setText(lineLogo, train.line.name);
        lineLogo.style.backgroundColor = train.line.color;
        lineLogo.style.color = train.line.text_color;
        trainHeader.style.backgroundColor = train.line.color + '20'; /* alpha 12.5% */

        setText(trainNode.querySelector('.destination'), Stations[train.destination] || train.destination);
        setText(trainNumber, train.number || '');

        trainNode.classList.toggle('train-stopped', train.state !== 'DRIVING');
        trainNode.classList.toggle('train-sided', train.lineIsOld || train.line.id === 99);

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

        let vehicleNode = vehiclesNode.firstElementChild;
        train.vehicles.forEach((vehicle) => {
            if (!vehicleNode) {
                vehicleNode = createEl('li', 'vehicle');
                vehiclesNode.appendChild(vehicleNode);
            }
            setText(vehicleNode, vehicle.number);
            vehicleNode.classList.toggle('is-reverse', vehicle.isReverse);

            let vehicleInfo = this.vehicleInfos[vehicle.number];
            vehicleNode.classList.toggle('is-modern', !!(vehicleInfo && vehicleInfo.isModern === true));
            vehicleNode.classList.toggle('is-classic', !!(vehicleInfo && vehicleInfo.isModern === false));

            vehicleNode = vehicleNode.nextElementSibling;
        });
        while (vehicleNode) {
            let nextNode = vehicleNode.nextElementSibling;
            vehiclesNode.removeChild(vehicleNode);
            vehicleNode = nextNode;
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

    logTrainEvent(trainEvent) {
        let trainEventNode = document.importNode(document.querySelector('template#train-event').content.firstElementChild, true);
        trainEventNode.querySelector('.event-timestamp').textContent = (new Date(trainEvent.event_timestamp)).toLocaleTimeString();
        trainEventNode.querySelector('.event-timestamp').title = 'Delay: ' + trainEvent.delay;
        trainEventNode.querySelector('.aimed-time-offset').textContent = trainEvent.aimed_time_offset;
        trainEventNode.querySelector('.state').textContent = trainEvent.state;
        trainEventNode.querySelector('.event').textContent = trainEvent.event;
        trainEventNode.querySelector('.ride-state').textContent = trainEvent.ride_state;
        trainEventNode.querySelector('.train-number').textContent = trainEvent.train_number;
        trainEventNode.querySelector('.original-train-number').textContent = trainEvent.original_train_number;
        trainEventNode.querySelector('.stop-point-ds100').textContent = trainEvent.stop_point_ds100;
        trainEventNode.querySelector('.position-correction').textContent = trainEvent.position_correction;
        trainEventNode.querySelector('.transmitting-vehicle').textContent = trainEvent.transmitting_vehicle;
        document.querySelector('#train-events tbody').appendChild(trainEventNode);
    }

    /**
     * Intelligent reordering/inserting/removing of DOM nodes with minimal changes to DOM
     */
    updateTrains() {
        let trainsNode = document.getElementById('trains');
        let previousSibling = null;

        this.trains = new Map([...this.trains.entries()].sort(([, train1], [, train2]) => {
            let res = train1.lineIsOld - train2.lineIsOld;
            if (res == 0) res = train1.line.id - train2.line.id;
            // gerade Zugnummern Richtung Westen, ungerade Richtung Osten:
            if (res == 0) res = train1.number % 2 - train2.number % 2;
            if (res == 0) res = train1.number - train2.number;
            return res;
        }));

        this.trains.forEach(train => {
            if (this.filteredLines.length > 0 && !this.filteredLines.includes(train.line.id)) {
                if (train.node.parentNode) train.node.parentNode.removeChild(train.node);
            } else {
                if (train.node.parentNode) {
                    if (train.node.previousSibling !== previousSibling) {
                        train.node.parentNode.removeChild(train.node);
                    }
                }

                if (!train.node.parentNode) {
                    let refNode = previousSibling ? previousSibling.nextSibling : trainsNode.firstChild;
                    trainsNode.insertBefore(train.node, refNode);
                }
                previousSibling = train.node;
            }
        });
    }

    log(message) {
        let logNode = document.getElementById('log');
        let messageNode = createEl('div', 'message');
        messageNode.textContent = message;
        logNode.appendChild(messageNode);
    }

    updateLines(train) {
        let linesNode = document.getElementById('lines');
        let lineId = train.line.id;

        if (!this.lines.has(lineId)) {
            this.lines.set(lineId, {
                id: lineId,
                node: this.createLineContainer(train.line)
            });

            this.lines = new Map([...this.lines.entries()].sort(([, line1], [, line2]) => {
                return line1.id - line2.id;
            }));
        }

        let previousSibling = null;

        this.lines.forEach(line => {
            if (!line.node.parentNode) {
                let refNode = previousSibling ? previousSibling.nextSibling : linesNode.firstChild;
                linesNode.insertBefore(line.node, refNode);
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
        let linesNode = document.getElementById('lines');

        this.filteredLines = [];
        linesNode.querySelectorAll('input:checked').forEach((node => {
            this.filteredLines.push(parseInt(node.value, 10));
        }));

        linesNode.classList.toggle('selectAll', this.filteredLines.length === 0);

        this.updateTrains();
    }
}

function createEl(name, className) {
    let node = document.createElement(name);
    if (className) node.classList.add(className);
    return node;
}

function setText(node, text) {
    text = '' + text;
    if (node.textContent !== text) node.textContent = text;
}

new SBahnGui();
