import { toRaw } from 'vue';
import createMainStore from '../stores/main';
import createOptionsStore from '../stores/options';
import SBahnClient from '../api/sbahn';
import areas from '../constants/areas';
import Stations from '../constants/stations';
import * as L from 'leaflet';

const API_KEY = import.meta.env.VITE_SBAHN_API_KEY;

export function useSBahn() {
    let nextImplicitTrainId = 1001; // for split trains - should not overlap with official train_ids (which are very big)

    // Initial state
    const options = createOptionsStore();
    const store = createMainStore(options);

    // stations
    store.stations = Object.values(Stations).reduce((stations, station) => {
        stations[station.id] = initStation(station);
        return stations;
    }, {});

    // Events
    const client = new SBahnClient(API_KEY, console);
    client.on('station', (event) => onStationEvent(event));
    client.on('trajectory', (event) => onTrajectoryEvent(event));
    client.on('deleted_vehicles', (event) => onDeletedVehiclesEvent(event));
    client.on('sbm_newsticker', (event) => onNewstickerEvent(event));
    client.onReconnect(() => onReconnectEvent());
    client.onStatsUpdate((stats) => {
        for (const key in stats) {
            store[key] = stats[key];
        }
    });
    client.connect();
    let reconnectSyncTimeout = null;

    loadVehicleInfos();

    function loadVehicleInfos() {
        fetch('https://sbahn.not-implemented.de/vehicle-info.php')
            .then((response) => response.json())
            .then((data) => {
                store.vehicleInfos.length = 0;

                for (const vehicleInfo of data) {
                    // Bahn-Prüfziffer mit https://de.wikipedia.org/wiki/Luhn-Algorithmus berechnen:
                    const id = '94800' + vehicleInfo.model + vehicleInfo.number;
                    let checksum = [...id].reverse().reduce((sum, digit, i) => {
                        digit = parseInt(digit, 10);
                        if (i % 2 === 0) digit *= 2;
                        if (digit > 9) digit -= 9;
                        return sum + digit;
                    }, 0);
                    checksum = (1000 - checksum) % 10;
                    store.vehicleInfos[parseInt(id + checksum, 10)] = vehicleInfo;
                }

                //this.trains.forEach(train => this.onTrainUpdate(train));
            });
    }

    function onStationEvent(event) {
        let station = store.stations[event.properties.uic];

        if (!station) {
            if (event.properties.isRailReplacement) return; // SEV Bushaltestellen

            station = initStation({
                id: event.properties.uic,
                name: event.properties.name,
            });
            store.stations[station.id] = station;
        }

        station.coordinates = convertCoordinates(event.geometry.coordinates);
    }

    function initStation(station) {
        station.departures = {};
        station.enableDepartureUpdates = (enable) => {
            if (enable) {
                client.on('timetable_' + station.id, (event) => onTimetableEvent(event, station));
            } else {
                client.remove('timetable_' + station.id);

                Object.values(station.departures).forEach((departure) => {
                    if (departure.updateInterval) clearInterval(departure.updateInterval);
                    delete station.departures[departure.id];
                });
            }
        };

        return station;
    }

    function onTrajectoryEvent(event) {
        if (!event) return; // "content": null seems to happen on bigger server problems

        const rawTrain = event.properties;
        let train = store.trains[rawTrain.train_id];

        let isNew = false;
        if (!train) {
            isNew = true;
            train = { id: rawTrain.train_id };
            // this.createTrainGui(train);
            store.trains[train.id] = train;
        }

        const originalTrain = { ...train };

        if (isNew || !train.isActive) {
            // we have to subscribe separately for each train for the stop points:
            client.on('stopsequence_' + train.id, (event) => onStopSequenceEvent(event));
        }

        train.line = handleLine(rawTrain.line);
        train.number = rawTrain.train_number || rawTrain.original_train_number;
        train.numberIsNormal = !!rawTrain.train_number;
        if (train.destinationId === undefined) train.destinationId = null; // filled by onStopSequenceEvent()
        train.state =
            rawTrain.state === 'DRIVING' && ['AN', 'TF', 'SB'].includes(rawTrain.event)
                ? 'STOPPED'
                : rawTrain.state;
        if (train.currentStationId === undefined) train.currentStationId = null; // filled by onStopSequenceEvent()
        if (train.currentStationDepartureTime === undefined)
            train.currentStationDepartureTime = null; // filled by onStopSequenceEvent()
        if (train.currentStationDepartureDelay === undefined)
            train.currentStationDepartureDelay = null; // filled by onStopSequenceEvent()
        if (train.prevStationId === undefined) train.prevStationId = null; // filled by onStopSequenceEvent()
        if (train.nextStationId === undefined) train.nextStationId = null; // filled by onStopSequenceEvent()
        if (train.nextStationDepartureTime === undefined) train.nextStationDepartureTime = null; // filled by onStopSequenceEvent()
        if (train.nextStationDepartureDelay === undefined) train.nextStationDepartureDelay = null; // filled by onStopSequenceEvent()
        train.isActive = true;
        train.isSynced = true; // for consistent reconnects

        if (rawTrain.raw_coordinates) {
            train.coordinates = [rawTrain.raw_coordinates[1], rawTrain.raw_coordinates[0]];
            train.hasGpsCordinates = true;
        } else if (event.geometry.coordinates) {
            train.coordinates = convertCoordinates(event.geometry.coordinates[0]);
            train.hasGpsCordinates = false;
        } else {
            train.coordinates = null;
            train.hasGpsCordinates = false;
        }

        const headingRadian = (rawTrain.time_intervals && rawTrain.time_intervals[0][2]) || null;
        train.heading = headingRadian !== null ? (-headingRadian / Math.PI) * 180 : null;
        train.estimatedPath =
            (event.geometry.coordinates &&
                event.geometry.coordinates.map((coords) => convertCoordinates(coords))) ||
            [];
        train.lastUpdate = rawTrain.event_timestamp;

        train.historyPath = train.historyPath || [];
        if (train.coordinates !== null) {
            train.historyPath.push(train.coordinates);
            if (train.historyPath.length > 1000) {
                train.historyPath.shift(); // ring-buffer
            }
        }

        const vehicles = parseVehicles(rawTrain, originalTrain);
        handleTrainSplitJoin(train, vehicles, originalTrain);

        let newAreaId = null;
        if (train.coordinates !== null) {
            areas.forEach((area, areaId) => {
                if (pointInPolygon(train.coordinates, area.polygon)) newAreaId = areaId;
            });
        }

        if (newAreaId !== train.areaId) {
            let action = 'ist in unbekanntem Gebiet unterwegs!';

            if (train.areaId !== null && train.areaId !== undefined)
                action = 'verlässt ' + areas[train.areaId].name;
            if (newAreaId !== null) {
                if (areas[newAreaId].isUsual && train.areaId === undefined) {
                    action = null;
                } else if (
                    !areas[newAreaId].isUsual ||
                    train.areaId === null ||
                    train.areaId === undefined
                ) {
                    action = 'erreicht ' + areas[newAreaId].name;
                }
            }

            if (action !== null)
                log('Fahrzeug ' + train.vehicles.map((v) => v.number).join('+') + ' ' + action);

            train.areaId = newAreaId;
        }

        if (options.trains.includes(train.id)) {
            console.log(rawTrain);

            logTrainEvent(rawTrain);
        }

        if (!train.refreshInterval) {
            train.refreshInterval = setInterval(
                () => store.refreshLastUpdateMinutes(train.id, client),
                1000,
            );
        }

        store.refreshLastUpdateMinutes(train.id, client);

        /*
        if (['isNew', 'line', 'number'].some(attr => train._changed.has(attr))) {
            this.onTrainsUpdate();
        }

        this.onTrainUpdate(train);
        */
    }

    function convertCoordinates(coords) {
        let latLng = L.CRS.EPSG3857.unproject(L.point(coords[0], coords[1]));
        return [latLng.lat, latLng.lng];
    }

    function onStopSequenceEvent(event) {
        if (!event) return; // "content": null happens sometimes

        // Es kann mehrere Ziele/Zugläufe pro Zug geben (z.B. Freising + Flughafen) - aktuell verarbeiten
        // wir nur den ersten Eintrag:
        const route = event[0];
        const train = store.trains[route.id];
        if (!train) return;
        // train._changed.clear();

        let stations = route.stations; // Zuglauf (Liste aller anzufahrenden Stationen)
        let currentIdx = stations
            ? stations.findIndex(
                  (station) =>
                      !['LEAVING', 'STOP_CANCELLED', 'JOURNEY_CANCELLED'].includes(station.state),
              )
            : -1;

        if (currentIdx > 0 && stations[currentIdx].state !== 'BOARDING') {
            currentIdx--; // wenn unterwegs, letzte "LEAVING"-Station als current setzen
        }

        let destinationIdx = stations
            ? stations.findLastIndex(
                  (station) => !['STOP_CANCELLED', 'JOURNEY_CANCELLED'].includes(station.state),
              )
            : -1;

        train.destinationId = destinationIdx !== -1 ? stations[destinationIdx].stationId : null;
        train.currentStationId = currentIdx !== -1 ? stations[currentIdx].stationId : null;
        train.currentStationDepartureTime =
            currentIdx !== -1 ? stations[currentIdx].aimedDepartureTime : null;
        train.currentStationDepartureDelay =
            currentIdx !== -1 ? stations[currentIdx].departureDelay : null;
        train.prevStationId =
            currentIdx !== -1 && currentIdx > 0 ? stations[currentIdx - 1].stationId : null;
        train.nextStationId =
            currentIdx !== -1 && currentIdx + 1 < stations.length
                ? stations[currentIdx + 1].stationId
                : null;
        train.nextStationDepartureTime =
            currentIdx !== -1 && currentIdx + 1 < stations.length
                ? stations[currentIdx + 1].aimedArrivalTime
                : null;
        train.nextStationDepartureDelay =
            currentIdx !== -1 && currentIdx + 1 < stations.length
                ? stations[currentIdx + 1].arrivalDelay
                : null;

        if (options.trains.includes(train.id)) {
            console.log(event);
        }

        // if (train._changed.size > 0) this.onTrainUpdate(train);
    }

    function onDeletedVehiclesEvent(event) {
        if (!event) return; // "content": null is sent on initial subscribe

        const train = store.trains[event];
        if (!train) return;
        if (!train.isActive) return;

        // "silent" remove as workaround for server side bug: do not explicitly unsubscribe
        // "stopsequence" events after a deleted_vehicles event - sometimes this unsubscribes
        // all trajectory events:
        client.removeSilent('stopsequence_' + train.id);

        if (train.hasGpsCordinates) {
            // Züge mit Echtzeitdaten (und Fahrzeuginfos) nicht löschen, nur markieren:
            train.isActive = false;
            // this.onTrainUpdate(train);
        } else {
            // Züge, die nur aus dem Fahrplan berechnet sind, direkt löschen (wird sonst
            // auch nicht durch Kupplungslogik aufgeräumt):
            delete store.trains[train.id];
            clearInterval(train.refreshInterval);
            // this.cleanupTrainGui(train);
        }
    }

    function onNewstickerEvent(event) {
        store.news = event.messages.reverse();
    }

    function onTimetableEvent(event, station) {
        station = store.stations[station.id]; // to fix reactivity

        let departure = station.departures[event.call_id];
        if (!departure) {
            departure = { id: event.call_id };
            station.departures[departure.id] = departure;
        }
        departure.trainId = event.train_id;
        departure.line = event.line;
        departure.destination = event.to[0];
        departure.platform = event.platform;
        departure.trainType = event.train_type;
        departure.direction = event.train_number % 2 === 1 ? 'east' : 'west';
        departure.aimedTime = event.ris_aimed_time;
        departure.estimatedTime = event.time;
        departure.estimatedRisTime = event.ris_estimated_time;
        departure.state = event.state;
        departure.isCancelled =
            event.state === 'STOP_CANCELLED' || event.state === 'JOURNEY_CANCELLED';
        departure.hasRealtime = event.has_realtime_journey;
        departure.isSynced = true; // for consistent reconnects

        for (const change of event.changes ?? []) {
            if (change.old_to && change.new_to) {
                departure.destination = change.new_to;
                departure.originalDestination = change.old_to;
            }
        }

        if (departure.state === 'LEAVING') {
            if (departure.updateInterval) clearInterval(departure.updateInterval);
            delete station.departures[departure.id];
            return;
        }

        function updateTime() {
            departure = store.stations[station.id].departures[departure.id]; // to fix reactivity

            let now = Date.now();
            departure.minutes = Math.floor((departure.estimatedTime - now) / 60000);
            departure.minutesRis =
                departure.estimatedRisTime !== null
                    ? Math.floor((departure.estimatedRisTime - now) / 60000)
                    : null;
            departure.minutesDelay = Math.floor(
                (departure.estimatedTime - departure.aimedTime) / 60000,
            );

            if ((departure.isCancelled && departure.minutes < -5) || departure.minutes < -15) {
                if (departure.updateInterval) clearInterval(departure.updateInterval);
                delete station.departures[departure.id];
            }
        }
        if (!departure.updateInterval) departure.updateInterval = setInterval(updateTime, 1000);
        updateTime();
    }

    function onReconnectEvent() {
        // Nach einem Reconnect ist der Stand der Züge evtl. inkonsistent - deshalb ein implizites
        // deletedVehiclesEvent generieren für Züge, die nicht innerhalb von 5 Sekunden wieder gepusht
        // werden:
        for (const train of Object.values(store.trains)) {
            train.isSynced = false;
        }

        // Selbiges für die Abfahrtstafeln:
        for (const station of Object.values(store.stations)) {
            for (const departure of Object.values(station.departures)) {
                departure.isSynced = false;
            }
        }

        if (reconnectSyncTimeout) clearTimeout(reconnectSyncTimeout);
        reconnectSyncTimeout = setTimeout(() => {
            reconnectSyncTimeout = null;
            for (const train of Object.values(store.trains)) {
                if (!train.isSynced) onDeletedVehiclesEvent(train.id);
            }

            for (const station of Object.values(store.stations)) {
                for (const departure of Object.values(station.departures)) {
                    if (!departure.isSynced) {
                        if (departure.updateInterval) clearInterval(departure.updateInterval);
                        delete station.departures[departure.id];
                    }
                }
            }
        }, 5000);
    }

    function parseVehicles(rawTrain, originalTrain) {
        let vehicles = [],
            isIncompleteRake = false,
            rake = rawTrain.original_rake || rawTrain.rake;

        if (rake !== null) {
            let waggons = rake.split(';');
            let vehicleCount = waggons.filter((waggon) => waggon !== '0').length;
            let waggonsPerVehicle =
                waggons.length % vehicleCount === 0 ? waggons.length / vehicleCount : null;

            while (waggons.length > 0) {
                let refWaggon,
                    isReverse = null;

                // Manchmal werden für ein Fahrzeug (Kurzzug) alle 4 Waggons (BR 423) gepusht (die anderen 3 als "0"), manchmal nur einer.
                // Dies wird hier unterschieden - die Fahrzeugrichtung "isReverse" kann bei einzelnem Waggon leider nicht bestimmt werden.
                // Das gilt für "original_rake" - in "rake" wird dies normalisiert auf 4 Waggons pro Fahrzeug, allerdings ist dann die
                // Fahrzeugrichtung nicht mehr bestimmbar. Deshalb verwenden wir "original_rake", wenn verfügbar.
                if (waggonsPerVehicle !== null && waggonsPerVehicle !== 1) {
                    let vehicleWaggons = waggons.splice(0, waggonsPerVehicle);
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
                    //this.log('Fahrzeug ' + rawTrain.transmitting_vehicle + ': Wagenreihung unvollständig: ' + rake);
                    isIncompleteRake = true;
                    vehicles.push({
                        id: null,
                        model: null,
                        number: '???',
                        isReverse: null,
                    });
                } else if (refWaggon === '948004230009' || refWaggon === '948000000000') {
                    // Bug: Manchmal kennt ein Fahrzeug seine Nummer selbst nicht korrekt und wird als "000" inkl. korrekter Prüfziffer
                    // gepusht. Vermutlich ist da im Fahrzeug die Config verlorengegangen und "000" ist die Standardeinstellung. Es
                    // sind Fahrzeuge oft mehrere Tage unterwegs, bis dies korrigiert wird. In diesem Fall kann aber "isReverse"
                    // bestimmt werden:
                    isIncompleteRake = true;
                    vehicles.push({
                        id: null,
                        model: refWaggon.substr(-7, 3),
                        number: '???',
                        isReverse,
                    });
                } else {
                    vehicles.push({
                        id: parseInt(refWaggon, 10),
                        model: refWaggon.substr(-7, 3),
                        number: refWaggon.substr(-4, 3),
                        isReverse,
                    });
                }
            }
        } else if (rawTrain.transmitting_vehicle) {
            // fallback if rake is not known:
            //this.log('Fahrzeug ' + rawTrain.transmitting_vehicle + ': Wagenreihung unbekannt');
            let refWaggon = rawTrain.transmitting_vehicle;
            vehicles = [
                {
                    id: parseInt(refWaggon, 10),
                    model: refWaggon.substr(-7, 3),
                    number: refWaggon.substr(-4, 3),
                    isReverse: null,
                },
            ];
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
            let usePrevTrain = vehicles.every((newVehicle) => {
                if (newVehicle.id === null) return true;
                let vehicle = store.vehicles[newVehicle.id];
                if (!vehicle) return false;
                if (prevTrain === null) prevTrain = vehicle.currentTrain;
                if (vehicle.currentTrain === prevTrain) return true;
                return false;
            });

            if (prevTrain === null && originalTrain.vehicles) {
                if (originalTrain.vehicles.every((vehicle) => vehicle.id === null)) {
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
        vehicles = vehicles.map((newVehicle) => {
            let vehicle = store.vehicles[newVehicle.id];
            if (!vehicle) {
                vehicle = newVehicle;
                if (vehicle.id !== null) store.vehicles[vehicle.id] = vehicle;
            } else {
                vehicle.model = newVehicle.model;
                vehicle.number = newVehicle.number;
                vehicle.isReverse = newVehicle.isReverse;
            }
            return vehicle;
        });

        return vehicles;
    }

    function handleTrainSplitJoin(train, vehicles, originalTrain) {
        const actions = [];
        train.vehicles = train.vehicles || [];

        let removedVehicles = train.vehicles.filter((vehicle) => !vehicles.includes(vehicle));
        if (removedVehicles.length > 0) {
            let splittedTrain = {
                ...originalTrain,
                id: 'split_' + nextImplicitTrainId++,
                isActive: false,
                // _changed: new Set(['isNew']),
                vehicles: removedVehicles,
            };
            splittedTrain.vehicles.forEach((vehicle) => (vehicle.currentTrain = splittedTrain));
            train.vehicles = train.vehicles.filter((vehicle) => vehicles.includes(vehicle));

            actions.push({
                type: 'split',
                vehicles: [...train.vehicles],
                vehiclesMoved: [...splittedTrain.vehicles],
            });

            if (splittedTrain.vehicles.some((vehicle) => vehicle.id !== null)) {
                // this.createTrainGui(splittedTrain);
                store.trains[splittedTrain.id] = splittedTrain;
                splittedTrain.refreshInterval = setInterval(
                    () => store.refreshLastUpdateMinutes(splittedTrain.id, client),
                    1000,
                );
                // this.onTrainUpdate(splittedTrain);
                // this.onTrainsUpdate();
            }

            // train._changed.add('vehicles');
        }

        let addedVehicles = vehicles.filter(
            (vehicle) => toRaw(vehicle.currentTrain) !== toRaw(train),
        );
        if (addedVehicles.length > 0) {
            const oldTrains = new Set();
            addedVehicles.forEach(
                (vehicle) => vehicle.currentTrain && oldTrains.add(vehicle.currentTrain),
            );

            oldTrains.forEach((oldTrain) => {
                let movedVehicles = oldTrain.vehicles.filter((vehicle) =>
                    addedVehicles.includes(vehicle),
                );
                oldTrain.vehicles = oldTrain.vehicles.filter(
                    (vehicle) => !movedVehicles.includes(vehicle),
                );

                actions.push({
                    type: 'split',
                    vehicles: [...oldTrain.vehicles],
                    vehiclesMoved: [...movedVehicles],
                });

                if (oldTrain.vehicles.some((vehicle) => vehicle.id !== null)) {
                    // this.onTrainUpdate(oldTrain);
                } else {
                    delete store.trains[oldTrain.id];
                    clearInterval(oldTrain.refreshInterval);
                    // this.cleanupTrainGui(oldTrain);
                }

                actions.push({
                    type: 'join',
                    vehicles: [...train.vehicles],
                    vehiclesMoved: [...movedVehicles],
                });

                train.vehicles = train.vehicles.concat(movedVehicles);
                movedVehicles.forEach((vehicle) => (vehicle.currentTrain = train));
            });

            let newVehicles = addedVehicles.filter(
                (vehicle) => toRaw(vehicle.currentTrain) !== toRaw(train),
            );

            actions.push({
                type: 'join',
                vehicles: [...train.vehicles],
                vehiclesMoved: [...newVehicles],
            });

            train.vehicles = train.vehicles.concat(newVehicles);
            newVehicles.forEach((vehicle) => (vehicle.currentTrain = train));

            // train._changed.add('vehicles');
        }

        train.vehicles = vehicles; // reassign for correct (original) order

        actions.forEach((action) => {
            if (action.vehicles.length === 0 || action.vehiclesMoved.length === 0) return;

            log(
                getStationName(train.currentStationId, '(Unbekannt)') +
                    ': ' +
                    'Fahrzeug ' +
                    action.vehiclesMoved.map((v) => v.number).join('+') +
                    ' wurde ' +
                    (action.type === 'split' ? 'von' : 'an') +
                    ' ' +
                    'Fahrzeug ' +
                    action.vehicles.map((v) => v.number).join('+') +
                    ' ' +
                    (action.type === 'split' ? 'abgekuppelt' : 'angekuppelt'),
            );
        });
    }

    function getStationName(stationId, emptyName) {
        if (stationId === null) return emptyName || '';
        const station = store.stations[stationId];
        return (station && station.name) || stationId;
    }

    function logTrainEvent(trainEvent) {
        store.trainEvents.push({
            event_timestamp: trainEvent.event_timestamp,
            delay: trainEvent.delay,
            aimed_time_offset: trainEvent.aimed_time_offset,
            state: trainEvent.state,
            event: trainEvent.event,
            ride_state: trainEvent.ride_state,
            train_number: trainEvent.train_number,
            original_train_number: trainEvent.original_train_number,
            stop_point_ds100: trainEvent.stop_point_ds100,
            position_correction: trainEvent.position_correction,
            transmitting_vehicle: trainEvent.transmitting_vehicle,
        });
    }

    function log(text) {
        store.messages.push({
            time: new Date().toLocaleTimeString(),
            text,
        });
    }

    function handleLine(rawLine) {
        if (!rawLine) {
            rawLine = {
                id: 0,
                name: 'S?',
                color: '#808080',
                text_color: '#ffffff',
            };
        }

        let line = store.lines[rawLine.id];
        if (!line) {
            line = { id: rawLine.id };
            // this.createLineGui(line);
            store.lines[line.id] = line;
            // this.onLinesUpdate();
        }

        if (rawLine.id === 9 && rawLine.color === '#ffffff') {
            // Farben für S20 (ID 9) werden vertauscht gepushed - workaround:
            const color = rawLine.text_color;
            rawLine.text_color = rawLine.color;
            rawLine.color = color;
        }

        line.name = rawLine.name;
        line.color = rawLine.color;
        line.textColor = rawLine.text_color;

        // this.onLineUpdate(line);

        return line;
    }

    window.sbahn = {
        store,
        options,
    };
}

function pointInPolygon(point, polygon) {
    const x = point[0];
    const y = point[1];
    let inside = false;
    const len = polygon.length;

    for (let i = 0, j = len - 1; i < len; j = i++) {
        const xi = polygon[i][0];
        const yi = polygon[i][1];
        const xj = polygon[j][0];
        const yj = polygon[j][1];

        const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

        if (intersect) inside = !inside;
    }

    return inside;
}
