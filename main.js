import './modules/polyfills.js';
import Utils from './modules/utils.js';
import SBahnClient from './modules/client.js';
import Stations from './modules/stations.js';

class SBahnGui {
    constructor() {
        this.lines = new Map();
        this.trains = new Map();
        this.nextImplicitTrainId = 1001; // for split trains - should not overlap with official train_ids (which are very big)
        this.vehicles = new Map();
        this.vehicleInfos = new Map();
        this.stations = new Map(Object.entries(Stations));

        // navigation:
        this.page = null;
        this.options = {
            lines: [],
            trains: [],
            direction: [],
            lastSeen: []
        };

        this.initMap();
        this.initNavigation();
        this.loadVehicleInfos();

        this.client = new SBahnClient('put-api-key-here', console);
        this.client.on('station', event => this.onStationEvent(event));
        this.client.on('trajectory', event => this.onTrajectoryEvent(event));
        this.client.on('deleted_vehicles', event => this.onDeletedVehiclesEvent(event));
        this.client.onReconnect(() => this.onReconnectEvent());
        this.client.connect();

        this.reconnectSyncTimeout = null;
    }

    initMap() {
        this.map = L.map('map').setView([48.137187, 11.575501], 11);

        L.tileLayer('https://a.tile.openstreetmap.de/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/">OpenStreetMap</a>, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>',
            maxZoom: 18,
        }).addTo(this.map);

        L.control.scale({ imperial: false }).addTo(this.map);

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
        function parseStrList(str) {
            return str ? str.split(',').filter(value => value !== '') : [];
        }
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
                if (name === 'direction' || name === 'lastSeen') this.options[name] = parseStrList(params.get(name));
                else this.options[name] = parseIdList(params.get(name));
            });

            if (this.updateUrl(null, null, true)) return; // triggers onhashchange again, if url was not canonical

            document.querySelectorAll('#nav > a').forEach(linkNode => {
                linkNode.classList.toggle('is-active', linkNode.getAttribute('href') === '#' + this.page);
            });
            document.querySelectorAll('main > .page').forEach(pageNode => {
                pageNode.classList.toggle('is-active', pageNode.id === 'page-' + this.page);
            });

            this.onFilterSelectionChange();
            this.onLineSelectionChange();
            this.onTrainSelectionChange();
            if (this.page === 'map') this.map.invalidateSize();
        };
        window.dispatchEvent(new HashChangeEvent('hashchange'));

        // handle navigation clicks internally to preserve options in hash url:
        document.querySelectorAll('nav#nav a').forEach(linkNode => {
            linkNode.addEventListener('click', (event) => {
                event.preventDefault();
                this.updateUrl(linkNode.getAttribute('href').replace(/^#/, ''));
            });
        });

        this.initFilter();
    }

    updateUrl(newPage, newOptions, replaceState) {
        this.page = newPage || this.page;

        let params = new URLSearchParams();
        Object.keys(this.options).forEach(name => {
            if (newOptions && newOptions.hasOwnProperty(name)) this.options[name] = newOptions[name];
            if (this.options[name].length) params.set(name, this.options[name].join(','));
        });

        params = params.toString().replace(/%2C/g, ',');
        let hashUrl = '#' + this.page + (params ? '?' + params : '');

        if (location.hash !== hashUrl) {
            if (replaceState) history.replaceState(null, '', hashUrl);
            else history.pushState(null, '', hashUrl);

            window.dispatchEvent(new HashChangeEvent('hashchange'));
            return true;
        }
        return false;
    }

    loadVehicleInfos() {
        fetch('vehicle-info.php').then(response => response.json()).then(data => {
            this.vehicleInfos.clear();
            for (let vehicleInfo of data) {
                // Bahn-Prüfziffer mit https://de.wikipedia.org/wiki/Luhn-Algorithmus berechnen:
                let id = '94800' + vehicleInfo.model + vehicleInfo.number;
                let checksum = [...id].reverse().reduce((sum, digit, i) => {
                    digit = parseInt(digit, 10);
                    if (i % 2 === 0) digit *= 2;
                    if (digit > 9) digit -= 9;
                    return sum + digit;
                }, 0);
                checksum = (1000 - checksum) % 10;
                this.vehicleInfos.set(parseInt(id + checksum, 10), vehicleInfo);
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
            station.coordinates = [...event.geometry.coordinates].reverse();
        }
    }

    onTrajectoryEvent(event) {
        if (!event) return; // "content": null seems to happen on bigger server problems

        let rawTrain = event.properties;
        let train = this.trains.get(rawTrain.train_id);

        if (!train) {
            train = { id: rawTrain.train_id, _changed: new Set(['isNew']) };
            this.createTrainGui(train);
            this.trains.set(train.id, train);
        } else {
            train._changed.clear();
        }
        let originalTrain = { ...train };

        function set(obj, attribute, newValue) {
            if (obj[attribute] === newValue) return;
            obj[attribute] = newValue;
            obj._changed.add(attribute);
        }

        let targets = rawTrain.calls_stack; // Zuglauf (Liste aller anzufahrenden Stationen)
        let currentIdx = targets ? targets.indexOf(rawTrain.stop_point_ds100) : -1;

        set(train, 'line', this.handleLine(rawTrain.line));
        set(train, 'number', rawTrain.train_number || rawTrain.original_train_number);
        set(train, 'numberIsNormal', !!rawTrain.train_number);
        set(train, 'destination', targets && targets.length > 0 ? targets[targets.length - 1] : null);
        set(train, 'state', rawTrain.state === 'DRIVING' && ['AN', 'TF', 'SB'].includes(rawTrain.event) ? 'STOPPED' : rawTrain.state);
        set(train, 'currentStation', rawTrain.stop_point_ds100 || null);
        set(train, 'prevStation', currentIdx !== -1 && currentIdx > 0 ? targets[currentIdx - 1] : null);
        set(train, 'nextStation', currentIdx !== -1 && currentIdx + 1 < targets.length ? targets[currentIdx + 1] : null);
        set(train, 'isActive', true);
        set(train, 'isSynced', true); // for consistent reconnects

        if (rawTrain.raw_coordinates) {
            set(train, 'coordinates', [rawTrain.raw_coordinates[1], rawTrain.raw_coordinates[0]]);
            set(train, 'hasGpsCordinates', true);
        } else if (event.geometry.coordinates) {
            let coords = event.geometry.coordinates[0];
            set(train, 'coordinates', [coords[1], coords[0]]);
            set(train, 'hasGpsCordinates', false);
        } else {
            set(train, 'coordinates', null);
            set(train, 'hasGpsCordinates', false);
        }

        set(train, 'progress', this.calcProgress(train));
        let headingRadian = rawTrain.time_intervals && rawTrain.time_intervals[0][2] || null;
        set(train, 'heading', headingRadian !== null ? - headingRadian / Math.PI * 180 : null);
        set(train, 'estimatedPath', event.geometry.coordinates && event.geometry.coordinates.map(coords => [coords[1], coords[0]]) || []);
        set(train, 'lastUpdate', rawTrain.event_timestamp);

        train.historyPath = train.historyPath || [];
        if (train.coordinates !== null) {
            train.historyPath.push(train.coordinates);
            if (train.historyPath.length > 1000) {
                train.historyPath.shift(); // ring-buffer
            }
        }

        let vehicles = this.parseVehicles(rawTrain, originalTrain);
        this.handleTrainSplitJoin(train, vehicles, originalTrain);

        if (this.options.trains.includes(train.id)) {
            console.log(rawTrain);

            this.logTrainEvent(rawTrain);
        }

        if (['isNew', 'line', 'number'].some(attr => train._changed.has(attr))) {
            this.onTrainsUpdate();
        }

        this.onTrainUpdate(train);
    }

    onDeletedVehiclesEvent(event) {
        if (!event) return; // "content": null is sent on initial subscribe

        let train = this.trains.get(event);
        if (!train) return;

        if (train.hasGpsCordinates) {
            // Züge mit Echtzeitdaten (und Fahrzeuginfos) nicht löschen, nur markieren:
            train.isActive = false;
            this.onTrainUpdate(train);
        } else {
            // Züge, die nur aus dem Fahrplan berechnet sind, direkt löschen (wird sonst
            // auch nicht durch Kupplungslogik aufgeräumt):
            this.trains.delete(train.id);
            this.cleanupTrainGui(train);
        }
    }

    onReconnectEvent() {
        // Nach einem Reconnect ist der Stand der Züge evtl. inkonsistent - deshalb ein implizites
        // deletedVehiclesEvent generieren für Züge, die nicht innerhalb von 5 Sekunden wieder gepusht
        // werden:
        this.trains.forEach(train => train.isSynced = false);

        if (this.reconnectSyncTimeout) clearTimeout(this.reconnectSyncTimeout);
        this.reconnectSyncTimeout = setTimeout(() => {
            this.reconnectSyncTimeout = null;
            this.trains.forEach(train => {
                if (!train.isSynced) this.onDeletedVehiclesEvent(train.id);
            });
        }, 5000);
    }

    parseVehicles(rawTrain, originalTrain) {
        let vehicles = [], isIncompleteRake = false;

        if (rawTrain.rake !== null) {
            let waggons = rawTrain.rake.split(';');

            while (waggons.length > 0) {
                let refWaggon, isReverse = null;

                // Manchmal werden für ein Fahrzeug (Kurzzug) alle 4 Waggons gepusht (die anderen 3 als "0"), manchmal nur einer.
                // Dies wird hier unterschieden - die Fahrzeugrichtung "isReverse" kann bei einzelnem Waggon leider nicht bestimmt werden:
                if (waggons.length >= 4 && waggons.slice(0, 4).filter(waggon => waggon === '0').length >= 3) {
                    let vehicleWaggons = waggons.splice(0, 4);
                    isReverse = vehicleWaggons[0] === '0';
                    refWaggon = vehicleWaggons[isReverse ? vehicleWaggons.length - 1 : 0];
                } else {
                    refWaggon = waggons.shift();
                }

                if (refWaggon === '0') {
                    // Bug: Manchmal kennt ein Fahrzeug ein anderes gekuppeltes Fahrzeug nicht vollständig, so dass statt 4 Waggons
                    // nur eine "0" geschickt wird - z.B.: "948004232062;0;0;0;0;0;0;948004231817;0". Die anderen Fahrzeuge
                    // kennen allerdings normalerweise die vollständige Wagenreihung. Da abwechselnd gepushed wird, wird dann z.T.
                    // bei jedem Push auch eine neue train_id generiert, da scheinbar auch die train_id-Generierung serverseitig
                    // an der Wagenreihung hängt. Dies wird hier im Nachgang versucht zu korrigieren.
                    // TODO: 0;0;0;948004232047;0;0 => Langzug mit 2 unbekannten Fahrzeugen
                    //this.log('Fahrzeug ' + rawTrain.transmitting_vehicle + ': Wagenreihung unvollständig: ' + rawTrain.rake);
                    isIncompleteRake = true;
                    vehicles.push({ id: null, model: null, number: '???', isReverse: null });
                } else {
                    vehicles.push({ id: parseInt(refWaggon, 10), model: refWaggon.substr(-7, 3), number: refWaggon.substr(-4, 3), isReverse });
                }
            }
        } else if (rawTrain.transmitting_vehicle) {
            // fallback if rake is not known:
            //this.log('Fahrzeug ' + rawTrain.transmitting_vehicle + ': Wagenreihung unbekannt');
            let refWaggon = rawTrain.transmitting_vehicle;
            vehicles = [{ id: parseInt(refWaggon, 10), model: refWaggon.substr(-7, 3), number: refWaggon.substr(-4, 3), isReverse: null }];
            isIncompleteRake = true;
        } else {
            // unknown transmitting_vehicle (if has_realtime = false):
            vehicles = [{ id: null, model: null, number: '???', isReverse: null }];
            isIncompleteRake = true;
        }

        if (isIncompleteRake) {
            // Workaround für o.g. Bug: Wenn alle bekannten Fahrzeuge zum selben vorigen Zug gehören, dessen Fahrzeuge/Reihenfolge
            // komplett übernehmen (dadurch werden auch die selben vehicle-Objekte der unbekannten Fahrzeuge übernommen,
            // so dass später keine sinnlosen Kuppelaktionen mit "neuem/alten" unbekannten Fahrzeug generiert werden):
            let prevTrain = null;
            let usePrevTrain = vehicles.every(newVehicle => {
                if (newVehicle.id === null) return true;
                let vehicle = this.vehicles.get(newVehicle.id);
                if (!vehicle) return false;
                if (prevTrain === null) prevTrain = vehicle.currentTrain;
                if (vehicle.currentTrain === prevTrain) return true;
                return false;
            });

            if (prevTrain === null && originalTrain.vehicles) {
                if (originalTrain.vehicles.every(vehicle => vehicle.id === null)) {
                    // Wenn alle Fahrzeuge des Zugs unbekannt sind, und auch die des vorigen, per train_id verknüpften Zugs,
                    // dann dessen Fahrzeuge übernehmen:
                    prevTrain = originalTrain;
                }
            }

            if (prevTrain && usePrevTrain) {
                vehicles = [...prevTrain.vehicles];
                //this.log('Fahrzeug ' + rawTrain.transmitting_vehicle + ': Wagenreihung korrigiert auf ' + vehicles.map(v => v.number).join('+'));
            }
        }

        // map to existing vehicle objects (or use the new ones):
        vehicles = vehicles.map(newVehicle => {
            let vehicle = this.vehicles.get(newVehicle.id);
            if (!vehicle) {
                vehicle = newVehicle;
                if (vehicle.id !== null) this.vehicles.set(vehicle.id, vehicle);
            } else {
                vehicle.model = newVehicle.model;
                vehicle.number = newVehicle.number;
                vehicle.isReverse = newVehicle.isReverse;
            }
            return vehicle;
        });

        return vehicles;
    }

    handleTrainSplitJoin(train, vehicles, originalTrain) {
        let actions = [];
        train.vehicles = train.vehicles || [];

        let removedVehicles = train.vehicles.filter(vehicle => !vehicles.includes(vehicle));
        if (removedVehicles.length > 0) {
            let splittedTrain = { ...originalTrain, id: this.nextImplicitTrainId++, _changed: new Set(['isNew']), vehicles: removedVehicles };
            splittedTrain.vehicles.forEach(vehicle => vehicle.currentTrain = splittedTrain);
            train.vehicles = train.vehicles.filter(vehicle => vehicles.includes(vehicle));

            actions.push({
                type: 'split',
                vehicles: [...train.vehicles],
                vehiclesMoved: [...splittedTrain.vehicles]
            });

            if (splittedTrain.vehicles.some(vehicle => vehicle.id !== null)) {
                this.createTrainGui(splittedTrain);
                this.trains.set(splittedTrain.id, splittedTrain);
                this.onTrainUpdate(splittedTrain);
                this.onTrainsUpdate();
            }

            train._changed.add('vehicles');
        }

        let addedVehicles = vehicles.filter(vehicle => vehicle.currentTrain !== train);
        if (addedVehicles.length > 0) {
            let oldTrains = new Set();
            addedVehicles.forEach(vehicle => vehicle.currentTrain && oldTrains.add(vehicle.currentTrain));

            oldTrains.forEach(oldTrain => {
                let movedVehicles = oldTrain.vehicles.filter(vehicle => addedVehicles.includes(vehicle));
                oldTrain.vehicles = oldTrain.vehicles.filter(vehicle => !movedVehicles.includes(vehicle));

                actions.push({
                    type: 'split',
                    vehicles: [...oldTrain.vehicles],
                    vehiclesMoved: [...movedVehicles]
                });

                if (oldTrain.vehicles.some(vehicle => vehicle.id !== null)) {
                    this.onTrainUpdate(oldTrain);
                } else {
                    this.trains.delete(oldTrain.id);
                    this.cleanupTrainGui(oldTrain);
                }

                actions.push({
                    type: 'join',
                    vehicles: [...train.vehicles],
                    vehiclesMoved: [...movedVehicles]
                });

                train.vehicles = train.vehicles.concat(movedVehicles);
                movedVehicles.forEach(vehicle => vehicle.currentTrain = train);
            });

            let newVehicles = addedVehicles.filter(vehicle => vehicle.currentTrain !== train);

            actions.push({
                type: 'join',
                vehicles: [...train.vehicles],
                vehiclesMoved: [...newVehicles]
            });

            train.vehicles = train.vehicles.concat(newVehicles);
            newVehicles.forEach(vehicle => vehicle.currentTrain = train);

            train._changed.add('vehicles');
        }

        train.vehicles = vehicles; // reassign for correct (original) order

        actions.forEach(action => {
            if (action.vehicles.length === 0 || action.vehiclesMoved.length === 0) return;

            this.log(
                this.getStationName(train.currentStation, '(Unbekannt)') + ': ' +
                'Fahrzeug ' + action.vehiclesMoved.map(v => v.number).join('+') + ' wurde ' +
                (action.type === 'split' ? 'von' : 'an') + ' ' +
                'Fahrzeug ' + action.vehicles.map(v => v.number).join('+') + ' ' +
                (action.type === 'split' ? 'abgekuppelt' : 'angekuppelt')
            );
        });
    }

    calcProgress(train) {
        if (train.state === 'BOARDING') return 0;
        if (train.coordinates === null) return 0;

        let currentStation = this.stations.get(train.currentStation);
        let nextStation = this.stations.get(train.nextStation);

        if (!currentStation || !currentStation.coordinates) return 0;
        if (!nextStation || !nextStation.coordinates) return 0;

        let distanceToCurrent = this.calcDistance(train.coordinates, currentStation.coordinates);
        let distanceToNext = this.calcDistance(train.coordinates, nextStation.coordinates);

        return distanceToCurrent / (distanceToCurrent + distanceToNext) * 100;
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
            mapMoveHandler: null,
            historyPath: L.polyline([], {
                color: '#406fff',
                weight: 3,
                keyboard: false,
                interactive: false
            }),
            estimatedPath: L.polyline([], {
                color: '#406fff',
                weight: 5,
                dashArray: '2 10',
                keyboard: false,
                interactive: false
            }),
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
            if (!container.handleClick) return;
            if (!event.ctrlKey && !event.metaKey) this.options.trains = [];

            let idx = this.options.trains.indexOf(train.id);
            if (idx === -1) this.options.trains.push(train.id);
            else this.options.trains.splice(idx, 1);

            this.updateUrl();
        });

        // ignore clicks when dragged the map directly at a mapMarkerSvgNode:
        container.addEventListener('mousedown', () => container.handleClick = true);
        train._gui.mapMoveHandler = () => container.handleClick = false;
        this.map.on('movestart', train._gui.mapMoveHandler);

        // As "pointer-events: visiblePainted" only works in SVG, we can't use Leaflet's "riseOnHover" feature here:
        container.addEventListener('mouseover', () => train._gui.mapMarker.setZIndexOffset(250));
        container.addEventListener('mouseout', () => train._gui.mapMarker.setZIndexOffset(0));
    }

    cleanupTrainGui(train) {
        if (train._gui.node.parentNode) train._gui.node.parentNode.removeChild(train._gui.node);
        train._gui.mapMarker.remove();
        this.map.off('movestart', train._gui.mapMoveHandler);
        train._gui.historyPath.remove();
        train._gui.estimatedPath.remove();
        clearInterval(train._gui.refreshInterval);
        if (train._gui.selectedNode.parentNode) train._gui.selectedNode.parentNode.removeChild(train._gui.selectedNode);

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

            if (train._gui.isVisible && this.options.direction.length > 0) {
                train._gui.isVisible = !!train.number && this.options.direction.includes(train.number % 2 === 1 ? 'east' : 'west');
            }

            if (train._gui.isVisible && this.options.lastSeen.length > 0) {
                train._gui.isVisible = train.vehicles.some(vehicle => {
                    if (vehicle.id === null) return false;
                    let vehicleInfo = this.vehicleInfos.get(vehicle.id);
                    if (!vehicleInfo) vehicleInfo = { isOutdated: true };
                    return this.options.lastSeen.includes(vehicleInfo.isOutdated ? 'outdated' : 'current');
                });
            }

            if (train._gui.isVisible) train._gui.mapMarker.addTo(this.map);
            else train._gui.mapMarker.remove();
        });

        Utils.syncDomNodeList(this.trains, document.getElementById('trains'), train => train._gui.node, train => train._gui.isVisible);

        this.onTrainSelectionChange();
    }

    onTrainUpdate(train) {
        this.updateTrainContainer(train, train._gui.node);
        this.updateTrainContainer(train, train._gui.selectedNode);

        train._gui.mapMarker.setLatLng(train.coordinates || [47.9052567, 11.3084582]); // Starnberger See als "Fallback"

        let svgNode = train._gui.mapMarkerSvgNode;
        svgNode.querySelector('.name').textContent = train.line.name;
        svgNode.querySelector('.marker').style.fill = train.line.color;
        svgNode.querySelector('.name').style.fill = train.line.textColor;

        svgNode.querySelector('.container').classList.toggle('inactive', !train.isActive);
        svgNode.querySelector('.no-gps-cordinates').classList.toggle('hide', train.hasGpsCordinates);

        let headingNode = svgNode.querySelector('.heading'), viewBox = svgNode.viewBox.baseVal;
        headingNode.transform.baseVal.getItem(0).setRotate(train.heading || 0, viewBox.width / 2, viewBox.height / 2);
        headingNode.classList.toggle('is-unknown', train.heading === null);

        train._gui.historyPath.setLatLngs(train.historyPath);
        train._gui.estimatedPath.setLatLngs(train.estimatedPath);

        this.refreshTrain(train);
    }

    updateTrainContainer(train, trainNode) {
        trainNode.classList.toggle('train-driving', train.state === 'DRIVING');
        trainNode.classList.toggle('train-stopped', train.state === 'STOPPED');
        trainNode.classList.toggle('train-boarding', train.state === 'BOARDING');
        trainNode.classList.toggle('train-inactive', !train.isActive);
        trainNode.classList.toggle('train-sided', train.line.id === 0);

        let lineLogoNode = trainNode.querySelector('.line-logo');
        Utils.setText(lineLogoNode, train.line.name);
        lineLogoNode.style.backgroundColor = train.line.color;
        lineLogoNode.style.color = train.line.textColor;
        trainNode.querySelector('.train-header').style.backgroundColor = train.line.color + '20'; // alpha 12.5%

        Utils.setText(trainNode.querySelector('.destination'), this.getStationName(train.destination, 'Nicht einsteigen'));
        Utils.setText(trainNode.querySelector('.train-number'), train.number && !train.numberIsNormal ? '(' + train.number + ')' : (train.number || ''));
        Utils.setText(trainNode.querySelector('.station-prev .strip'), this.getStationName(train.prevStation));
        Utils.setText(trainNode.querySelector('.station-current .strip'), this.getStationName(train.currentStation));
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
            vehicleNode.classList.toggle('is-outdated', !!(vehicleInfo && vehicleInfo.isOutdated));
            vehicleNode.classList.toggle('has-wifi', !!(vehicleInfo && vehicleInfo.hasWiFi === true));
            vehicleNode.classList.toggle('has-no-wifi', !!(vehicleInfo && vehicleInfo.hasWiFi === false));

            vehicleNode = vehicleNode.nextElementSibling;
        });
        while (vehicleNode) {
            let nextNode = vehicleNode.nextElementSibling;
            vehiclesNode.removeChild(vehicleNode);
            vehicleNode = nextNode;
        }

        if (['line', 'number', 'destination', 'state', 'currentStation'].some(attr => train._changed.has(attr))) {
            if (!train._changed.has('isNew')) {
                trainNode.classList.toggle('changed', true);
                setTimeout(() => trainNode.classList.toggle('changed', false), 1500);
            }
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

            if (train._gui.isSelected && train._gui.isVisible) train._gui.historyPath.addTo(this.map);
            else train._gui.historyPath.remove();

            if (train._gui.isSelected && train._gui.isVisible) train._gui.estimatedPath.addTo(this.map);
            else train._gui.estimatedPath.remove();
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

    log(text) {
        let messageNode = Utils.getTemplate('message');
        messageNode.querySelector('.time').textContent = (new Date()).toLocaleTimeString();
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

        if (rawLine.id === 9 && rawLine.color === '#ffffff') {
            // Farben für S20 (ID 9) werden vertauscht gepushed - workaround:
            let color = rawLine.text_color;
            rawLine.text_color = rawLine.color;
            rawLine.color = color;
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

    initFilter() {
        ['direction', 'lastSeen'].forEach(filter => {
            let filterNode = document.getElementById(filter);
            filterNode.querySelectorAll('input').forEach(node => {
                node.addEventListener('change', () => {
                    this.updateUrl(null, {
                        [filter]: [...filterNode.querySelectorAll('input:checked')].map(node => node.value)
                    });
                });
            });
        });
    }

    onFilterSelectionChange() {
        ['direction', 'lastSeen'].forEach(filter => {
            let filterNode = document.getElementById(filter);
            filterNode.querySelectorAll('input').forEach(node => {
                node.checked = this.options[filter].includes(node.value);
            });
            filterNode.classList.toggle('select-all', this.options[filter].length === 0);
        });
    }
}

window.sBahnGui = new SBahnGui();
