import './modules/polyfills.js';
import Utils from './modules/utils.js';
import SBahnClient from './modules/client.js';
import Stations from './modules/stations.js';

class SBahnGui {
    constructor() {
        this.lines = new Map();
        this.trains = new Map();
        this.vehicles = new Map();
        this.vehicleInfos = new Map();
        this.stations = new Map(Object.entries(Stations));

        // navigation:
        this.page = null;
        this.options = {
            lines: [],
            trains: []
        };

        this.initMap();
        this.initNavigation();
        this.loadVehicleInfos();

        this.client = new SBahnClient('put-api-key-here', console);
        this.client.on('station', event => this.onStationEvent(event));
        this.client.on('trajectory', event => this.onTrajectoryEvent(event));
        this.client.connect();
    }

    initMap() {
        this.map = L.map('map').setView([48.137187, 11.575501], 11);

        L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token={accessToken}', {
            attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
            maxZoom: 18,
            id: 'mapbox/streets-v11',
            tileSize: 512,
            zoomOffset: -1,
            accessToken: 'pk.eyJ1Ijoibm90LWltcGxlbWVudGVkIiwiYSI6ImNrN3Mxc3BicDA5OTczbnBjaWp3aG9vbGwifQ.QXUwqP4R70UpPPxzNfewEA'
        }).addTo(this.map);

        // Lama easter egg:
        L.marker([-16.6073271, -65.4916048], {
            icon: L.icon({
                iconUrl: 'img/lama.svg',
                iconSize: [50, 53],
                iconAnchor: [25, 25]
            })
        }).addTo(this.map);
    }

    initNavigation() {
        function parseIdList(str) {
            return str ? str.split(',').map(id => parseInt(id, 10)).filter(id => id >= 0) : [];
        }

        window.onhashchange = () => {
            let [page, params] = location.hash.split('?');
            page = page.replace(/^#/, '');
            params = new URLSearchParams(params);

            if (!document.getElementById('page-' + page)) page = document.querySelector('main').dataset.defaultPage;
            this.page = page;

            Object.keys(this.options).forEach(name => {
                this.options[name] = parseIdList(params.get(name));
            });

            if (this.updateUrl()) return; // triggers onhashchange again, if url was not canonical

            document.querySelectorAll('main > .page').forEach(pageNode => {
                pageNode.classList.toggle('is-active', pageNode.id === 'page-' + this.page);
            });

            this.onLineSelectionChange();
            this.onTrainSelectionChange();
            if (this.page === 'map') this.map.invalidateSize();
        };
        window.onhashchange();

        // handle navigation clicks internally to preserve options in hash url:
        document.querySelectorAll('nav#nav a').forEach(linkNode => {
            linkNode.addEventListener('click', (event) => {
                event.preventDefault();
                this.updateUrl(linkNode.getAttribute('href').replace(/^#/, ''));
            });
        });
    }

    updateUrl(newPage, newOptions) {
        this.page = newPage || this.page;

        let params = new URLSearchParams();
        Object.keys(this.options).forEach(name => {
            if (newOptions && newOptions.hasOwnProperty(name)) this.options[name] = newOptions[name];
            if (this.options[name].length) params.set(name, this.options[name].join(','));
        });

        params = params.toString().replace(/%2C/g, ',');
        let hashUrl = '#' + this.page + (params ? '?' + params : '');

        if (location.hash !== hashUrl) {
            location.hash = hashUrl;
            return true;
        }
        return false;
    }

    loadVehicleInfos() {
        fetch('vehicle-info.php').then(response => response.json()).then(data => {
            this.vehicleInfos.clear();
            for (let vehicleInfo of data) {
                // Bahn-Prüfziffer mit https://de.wikipedia.org/wiki/Luhn-Algorithmus berechnen:
                let checksum = [...vehicleInfo.model, ...vehicleInfo.number].reverse().reduce((sum, digit, i) => {
                    digit = parseInt(digit, 10);
                    if (i % 2 === 0) digit *= 2;
                    if (digit > 9) digit -= 9;
                    return sum + digit;
                }, 0);
                let id = parseInt('94800' + vehicleInfo.model + vehicleInfo.number + ((1000 - checksum) % 10), 10);
                this.vehicleInfos.set(id, vehicleInfo);
            }

            this.trains.forEach(train => this.onTrainUpdate(train));
        });
    }

    onStationEvent(event) {
        if (!this.stationsById) {
            this.stationsById = new Map([...this.stations.entries()].map(([, station]) => [station.id, station]));
        }

        let station = this.stationsById.get(event.properties.uic);
        if (station) {
            station.coordinates = event.geometry.coordinates.reverse();
        }
    }

    onTrajectoryEvent(event) {
        let rawTrain = event.properties;
        let train = this.trains.get(rawTrain.train_id);

        if (!train) {
            train = { id: rawTrain.train_id };
            this.createTrainGui(train);
            this.trains.set(train.id, train);
        }

        let stations = rawTrain.calls_stack;

        train.line = this.handleLine(rawTrain.line);
        train.destination = stations && stations.length > 0 ? stations[stations.length - 1] : null;
        train.number = rawTrain.train_number;
        train.state = rawTrain.state;
        train.prevStation = rawTrain.stop_point_ds100;
        let pos = stations ? stations.indexOf(rawTrain.stop_point_ds100) : -1;
        train.nextStation = pos !== -1 && stations[pos + 1] ? stations[pos + 1] : null;
        train.coordinates = rawTrain.raw_coordinates.reverse();
        train.progress = this.calcProgress(train);

        train.heading = null;
        if (rawTrain.time_intervals) {
            let heading = rawTrain.time_intervals[0][2];
            if (heading) {
                train.heading = - heading / Math.PI * 180;
            }
        }

        let vehicles;
        if (rawTrain.rake !== null) {
            vehicles = rawTrain.rake.split(';').chunk(4).map(vehicle => {
                let isReverse = vehicle[0] === '0';
                let refWaggon = vehicle[isReverse ? 3 : 0];
                // folgender Fall trat auf - war eigentlich ein Langzug (vermutlich Bug): rake: "948004232062;0;0;0;0;0;0;948004231817;0"
                if (!refWaggon) return { id: null, number: vehicle[0] || '???', isReverse: null };
                return { id: parseInt(refWaggon, 10), number: refWaggon.substr(-4, 3), isReverse };
            });
        } else {
            // fallback if rake is not known:
            vehicles = [{ id: parseInt(rawTrain.transmitting_vehicle, 10), number: rawTrain.vehicle_number, isReverse: null }];
        }

        train.vehicles = train.vehicles || [];
        train.vehicles = vehicles.map(newVehicle => {
            let vehicle = this.vehicles.get(newVehicle.id);
            if (!vehicle) {
                vehicle = newVehicle;
                if (vehicle.id !== null) this.vehicles.set(vehicle.id, vehicle);
            } else {
                vehicle.number = newVehicle.number;
                vehicle.isReverse = newVehicle.isReverse;
            }

            let prevTrainOfVehicle = vehicle.currentTrain;
            if (prevTrainOfVehicle && prevTrainOfVehicle !== train) {
                let pos = prevTrainOfVehicle.vehicles.findIndex(v => v.id === vehicle.id);
                if (pos !== -1) prevTrainOfVehicle.vehicles.splice(pos, 1);

                let deletePrevTrain = !prevTrainOfVehicle.vehicles.some(v => v.id !== null);

                if (!deletePrevTrain) {
                    this.onTrainUpdate(prevTrainOfVehicle);
                } else {
                    this.trains.delete(prevTrainOfVehicle.id);
                    this.cleanupTrainGui(prevTrainOfVehicle);
                }

                let actions = [];
                if (!deletePrevTrain) actions.push('von Wagen ' + prevTrainOfVehicle.vehicles.map(v => v.number).join('+') + ' abgekuppelt');
                if (train.vehicles.length > 0) actions.push('an Wagen ' + train.vehicles.map(v => v.number).join('+') + ' angekuppelt');

                if (actions.length > 0) {
                    this.log((new Date()).toLocaleTimeString(), `${this.getStationName(train.prevStation, '(Unbekannt)')}: Wagen ${vehicle.number} wurde ${actions.join(' und ')}`);
                }
            }

            vehicle.currentTrain = train;
            if (train.vehicles.findIndex(v => v.id === vehicle.id) === -1) train.vehicles.push(vehicle);
            return vehicle;
        });

        train.lastUpdate = rawTrain.event_timestamp;

        if (this.options.trains.includes(train.id)) {
            console.log(rawTrain);

            this.logTrainEvent(rawTrain);

            this.map.setView(train.coordinates);
            var circle = L.circle(train.coordinates, {
                color: train.line.color,
                fillColor: train.line.color,
                fillOpacity: 0.5,
                radius: 10
            }).addTo(this.map);

            let latlng = event.geometry.coordinates.map(coord => [coord[1], coord[0]]);
            var polyline = L.polyline(latlng, {color: 'red'}).addTo(this.map);
        }

        this.onTrainsUpdate();
        this.onTrainUpdate(train);
    }

    calcProgress(train) {
        if (train.state !== 'DRIVING') return 0;

        let prevStation = this.stations.get(train.prevStation);
        let nextStation = this.stations.get(train.nextStation);

        if (!prevStation || !prevStation.coordinates) return 0;
        if (!nextStation || !nextStation.coordinates) return 0;

        let distanceToPrev = this.calcDistance(train.coordinates, prevStation.coordinates);
        let distanceToNext = this.calcDistance(train.coordinates, nextStation.coordinates);

        return distanceToPrev / (distanceToPrev + distanceToNext) * 100;
    }

    calcDistance(coords1, coords2) {
        const deg2rad = number => number / 180 * Math.PI;
        coords1 = coords1.map(deg2rad);
        coords2 = coords2.map(deg2rad);

        let distanceRadian = Math.acos(
            Math.sin(coords1[0]) * Math.sin(coords2[0]) +
            Math.cos(coords1[0]) * Math.cos(coords2[0]) * Math.cos(coords2[1] - coords1[1])
        );
        let distanceSm = distanceRadian / Math.PI * 180 * 60;
        let distanceKm = distanceSm * 1.853248777; // Seemeile bezogen auf den mittleren Erdradius von 6371 km

        return distanceKm;
    }

    createTrainGui(train) {
        let mapMarkerSvgNode = Utils.getTemplate('train-marker');

        train._gui = {
            node: Utils.getTemplate('train'),
            mapMarker: L.marker([0, 0], {
                icon: L.divIcon({
                    html: mapMarkerSvgNode,
                    className: 'train-marker',
                    iconSize: [50, 50],
                    iconAnchor: [25, 25]
                }),
                opacity: 0.75,
                keyboard: false,
                interactive: false
            }),
            mapMarkerSvgNode,
            refreshInterval: setInterval(() => this.refreshTrain(train), 1000),
            isVisible: true,
            isSelected: false,
            selectedNode: Utils.getTemplate('train')
        };

        let selectLink = train._gui.node.querySelector('.action-link');
        selectLink.textContent = 'ℹ';
        selectLink.href = '#map?trains=' + train.id;
        selectLink.addEventListener('click', event => {
            event.preventDefault();
            this.updateUrl('map', { trains: [train.id] });
        });

        let deselectLink = train._gui.selectedNode.querySelector('.action-link');
        deselectLink.textContent = '×';
        deselectLink.href = '#map';
        deselectLink.addEventListener('click', event => {
            event.preventDefault();

            let idx = this.options.trains.indexOf(train.id);
            if (idx !== -1) this.options.trains.splice(idx, 1);

            this.updateUrl();
        });

        let container = train._gui.mapMarkerSvgNode.querySelector('.container');
        container.addEventListener('click', event => {
            if (!event.ctrlKey) this.options.trains = [];

            let idx = this.options.trains.indexOf(train.id);
            if (idx === -1) this.options.trains.push(train.id);
            else this.options.trains.splice(idx, 1);

            this.updateUrl();
        });

        // As "pointer-events: visiblePainted" only works in SVG, we can't use Leaflet's "riseOnHover" feature here:
        container.addEventListener('mouseover', () => train._gui.mapMarker.setZIndexOffset(250));
        container.addEventListener('mouseout', () => train._gui.mapMarker.setZIndexOffset(0));
    }

    cleanupTrainGui(train) {
        if (train._gui.node.parentNode) train._gui.node.parentNode.removeChild(train._gui.node);
        train._gui.mapMarker.remove();
        clearInterval(train._gui.refreshInterval);

        train._gui = null;
    }

    onTrainsUpdate() {
        this.trains = new Map([...this.trains.entries()].sort(([, train1], [, train2]) => {
            let result = (train1.line.id === 0) - (train2.line.id === 0);
            if (result == 0) result = train1.line.id - train2.line.id;
            // gerade Zugnummern Richtung Westen, ungerade Richtung Osten:
            if (result == 0) result = train1.number % 2 - train2.number % 2;
            if (result == 0) result = train1.number - train2.number;
            return result;
        }));

        this.trains.forEach(train => {
            train._gui.isVisible = this.options.lines.length === 0 || this.options.lines.includes(train.line.id);

            if (train._gui.isVisible) train._gui.mapMarker.addTo(this.map);
            else train._gui.mapMarker.remove();
        });

        Utils.syncDomNodeList(this.trains, document.getElementById('trains'), train => train._gui.node, train => train._gui.isVisible);

        this.onTrainSelectionChange();
    }

    onTrainUpdate(train) {
        this.updateTrainContainer(train, train._gui.node);
        this.updateTrainContainer(train, train._gui.selectedNode);

        train._gui.mapMarker.setLatLng(train.coordinates);

        let svgNode = train._gui.mapMarkerSvgNode;
        svgNode.querySelector('.name').textContent = train.line.name;
        svgNode.querySelector('.marker').style.fill = train.line.color;
        svgNode.querySelector('.name').style.fill = train.line.textColor;

        let headingNode = svgNode.querySelector('.heading'), viewBox = svgNode.viewBox.baseVal;
        headingNode.transform.baseVal.getItem(0).setRotate(train.heading || 0, viewBox.width / 2, viewBox.height / 2);
        headingNode.classList.toggle('is-unknown', train.heading === null);

        this.refreshTrain(train);
    }

    updateTrainContainer(train, trainNode) {
        trainNode.classList.toggle('train-stopped', train.state !== 'DRIVING');
        trainNode.classList.toggle('train-sided', train.line.id === 0);

        let lineLogoNode = trainNode.querySelector('.line-logo');
        Utils.setText(lineLogoNode, train.line.name);
        lineLogoNode.style.backgroundColor = train.line.color;
        lineLogoNode.style.color = train.line.textColor;
        trainNode.querySelector('.train-header').style.backgroundColor = train.line.color + '20'; // alpha 12.5%

        Utils.setText(trainNode.querySelector('.destination'), this.getStationName(train.destination, 'Nicht einsteigen'));
        Utils.setText(trainNode.querySelector('.train-number'), train.number || '');
        Utils.setText(trainNode.querySelector('.station-prev .strip'), this.getStationName(train.prevStation));
        Utils.setText(trainNode.querySelector('.station-next .strip'), this.getStationName(train.nextStation));
        trainNode.querySelector('.progress .bar').style.width = train.progress + '%';

        let vehiclesNode = trainNode.querySelector('.vehicles');
        let vehicleNode = vehiclesNode.firstElementChild;
        train.vehicles.forEach(vehicle => {
            if (!vehicleNode) vehicleNode = vehiclesNode.appendChild(Utils.getTemplate('vehicle'));
            Utils.setText(vehicleNode, vehicle.number);
            vehicleNode.classList.toggle('is-forward', vehicle.isReverse === false);
            vehicleNode.classList.toggle('is-reverse', vehicle.isReverse === true);

            let vehicleInfo = this.vehicleInfos.get(vehicle.id);
            vehicleNode.classList.toggle('is-modern', !!(vehicleInfo && vehicleInfo.isModern === true));
            vehicleNode.classList.toggle('is-classic', !!(vehicleInfo && vehicleInfo.isModern === false));

            vehicleNode = vehicleNode.nextElementSibling;
        });
        while (vehicleNode) {
            let nextNode = vehicleNode.nextElementSibling;
            vehiclesNode.removeChild(vehicleNode);
            vehicleNode = nextNode;
        }
    }

    getStationName(abbrev, emptyName) {
        if (abbrev === null) return emptyName || '';

        let station = this.stations.get(abbrev);
        return station && station.name || abbrev;
    }

    refreshTrain(train) {
        let minutes = Math.floor((Date.now() - this.client.clientTimeDiff - train.lastUpdate) / 1000 / 60);
        let lastUpdateText = minutes >= 1 ? 'Keine Info seit ' + minutes + 'min' : '';

        Utils.setText(train._gui.node.querySelector('.last-update'), lastUpdateText);
        Utils.setText(train._gui.selectedNode.querySelector('.last-update'), lastUpdateText);
    }

    onTrainSelectionChange() {
        document.querySelector('#train-details').classList.toggle('is-active', this.options.trains.length > 0);

        this.trains.forEach(train => {
            train._gui.isSelected = this.options.trains.includes(train.id);
            train._gui.mapMarkerSvgNode.classList.toggle('is-selected', train._gui.isSelected);
        });

        Utils.syncDomNodeList(this.trains, document.getElementById('selected-trains'), train => train._gui.selectedNode, train => train._gui.isSelected);
    }

    logTrainEvent(trainEvent) {
        let trainEventNode = Utils.getTemplate('train-event');
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

    log(time, text) {
        let messageNode = Utils.getTemplate('message');
        messageNode.querySelector('.time').textContent = time;
        messageNode.querySelector('.text').textContent = text;
        document.getElementById('log').appendChild(messageNode);
    }

    handleLine(rawLine) {
        if (!rawLine) rawLine = { id: 0, name: 'S?', color: '#808080', text_color: '#ffffff' };

        let line = this.lines.get(rawLine.id);
        if (!line) {
            line = { id: rawLine.id };
            this.createLineGui(line);
            this.lines.set(line.id, line);

            this.onLinesUpdate();
        }

        line.name = rawLine.name;
        line.color = rawLine.color;
        line.textColor = rawLine.text_color;

        this.onLineUpdate(line);

        return line;
    }

    createLineGui(line) {
        line._gui = {
            node: Utils.getTemplate('line')
        };

        let checkboxNode = line._gui.node.querySelector('input');
        checkboxNode.value = line.id;
        checkboxNode.addEventListener('change', () => {
            this.updateUrl(null, {
                lines: [...document.querySelectorAll('#lines input:checked')].map(node => parseInt(node.value, 10))
            });
        });
    }

    onLinesUpdate() {
        this.lines = new Map([...this.lines.entries()].sort(([, line1], [, line2]) => {
            let result = (line1.id === 0) - (line2.id === 0);
            if (result === 0) result = line1.id - line2.id;
            return result;
        }));

        Utils.syncDomNodeList(this.lines, document.getElementById('lines'), train => train._gui.node);
        this.onLineSelectionChange(true);
    }

    onLineUpdate(line) {
        let lineLogoNode = line._gui.node.querySelector('.line-logo');
        Utils.setText(lineLogoNode, line.name);
        lineLogoNode.style.backgroundColor = line.color;
        lineLogoNode.style.color = line.textColor;
    }

    onLineSelectionChange(skipTrainsUpdate) {
        let linesNode = document.getElementById('lines');
        linesNode.querySelectorAll('input').forEach(node => {
            node.checked = this.options.lines.includes(parseInt(node.value, 10));
        });
        linesNode.classList.toggle('select-all', this.options.lines.length === 0);

        if (!skipTrainsUpdate) this.onTrainsUpdate();
    }
}

new SBahnGui();
