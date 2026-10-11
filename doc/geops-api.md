S-Bahn München Live - Internals
===============================

Dokumentation der WebSocket-Schnittstelle unter wss://api.geops.io/realtime-ws/v1/

Zu jeder Event-Quelle kann der aktuelle Stand abgerufen, sowie auf zukünftige Events subscribed werden, z.B.:

```
GET trajectory
SUB trajectory
```


Event-Quelle "trajectory"
-------------------------

Echtzeit-Events aller aktiven S-Bahnen im Fuhrpark. Züge, die in Bewegung sind, senden in der Regel etwa alle 10 Sek
ein Event. Züge die stehen, seltener. Züge auf dem Abstellgleis senden irgendwann meist gar keine Events mehr (vermutlich
wenn der Lokführer den Zug - oder zumindest das Info-System - "runterfährt"). Die jetzt wieder im Einsatz befindlichen
Züge der Baureihe 420 haben die Technik noch nicht eingebaut - diese tauchen überhaupt nicht auf (sind auch in der
offiziellen Echtzeitmap nicht zu sehen).

### content.properties

- **train_id** (uint64): Eindeutige Zug-ID (Beispiel: 140477388333184)
    - Ein Zug behält dieselbe ID, solange er in dieser Fahrzeug-Konstellation unterwegs ist, auch wenn er die Richtung ändert, oder auf's Abstellgleis fährt
    - Nur bei Kuppelvorgängen werden neue IDs vergeben
- **timestamp** (double): Timestamp in ms, zu dem das Event am Server verarbeitet wurde (Beispiel: 1584365038813.984)
- **event_timestamp** (double): Timestamp in ms, wann das Event im Fahrzeug ausgelöst wurde - Auflösung scheinbar nur sekundengenau (Beispiel: 1584365037000.0)
- **delay** (float): Zeit in Sekunden, bis das Event aus dem Fahrzeug am Server verarbeitet wurde (etwa die Differenz zwischen event_timestamp und timestamp) (Beispiel: 1.759718)
- **time_since_update** (int|null): Millisekunden seit dem letzten Event für diesen Zug (Differenz event_timestamp zu letztem Event) - *null* wenn erstes Event (Beispiel: 10000)
- **aimed_time_offset** (float|null): Aktuelle Verspätung in Sekunden - *null* wenn ohne Fahrplan unterwegs (Beispiel: 26.0)
    - Wird nur bei Ankunft neu berechnet, ungut bei Stationen mit "Puffer", da ein "Aufholen" erst ab der nächsten Station erkennbar ist
    - kann negativ sein (v.a. an Endstationen wenn Abfahrt in der Zukunft liegt)
- **line**: Objekt mit Infos zur Bahn-Linie - kann *null* sein
    - **id** (uint): ID (Beispiel: 2)
    - **name** (string): Name (Beispiel: S2)
    - **color** (string): HTML-Farbe für Hintergrund (Beispiel: #8bbd4d)
    - **text_color** (string): HTML-Farbe für Text (Beispiel: #ffffff)
    - **stroke** (string): HTML-Farbe für Rahmen - entspricht scheinbar immer der Hintergrundfarbe (Beispiel: #8bbd4d)
- **train_number** (uint|null): Zugnummer - interne Nummer der Fahrt (Beispiel: 6674)
    - *null*, wenn unbekannt (z.B. bei Fahrtende / "Nicht einsteigen")
    - 1\. Stelle: 6=Normalnummern, 8=Taktverstärker und abends, wenn 6 nicht mehr reicht
    - 2\. Stelle: S-Bahn-Linie
    - Die S1 zwischen Neufahrn und Flughafen wird nummernmäßig wie eine S9 behandelt
    - gerade Nummern Richtung Westen, ungerade Richtung Osten
    - Die erste Zugnummer beginnt ab 3 Uhr am Ostbahnhof, dass heißt, der erste Zug, der im 20-Minuten-Takt am Ostbahnhof nach 3 Uhr ankommen würde, bekommt die 1.
- **original_train_number** (uint|null): Scheint die vorherige "train_number" zu sein, wenn die Fahrt abgeschlossen ist (Beispiel: 6674)
- **stop_point_ds100** (string): Letzte Haltestelle (Kürzel) - *null*, wenn unbekannt (z.B. bei Fahrtende / "Nicht einsteigen") (Beispiel: MHT)
- **calls_stack** (array[string, ...]): Array aller anzufahrenden Stationen (Kürzel) - *null*, wenn unbekannt (z.B. bei Fahrtende / "Nicht einsteigen")
- **event** (string): Event-Typ:
    - FA: Fahrt
    - AN: Angehalten
    - AF: Abfahrt
    - TF: Türen freigegeben
    - SB: Steht bereit zum Boarding
    - ZT: Zugtaufe
- **state** (string):
    - BOARDING: Türen offen
    - DRIVING: Türen zu
    - *null*: ???
- **ride_state** (string):
    - K: Normale Fahrt?
    - X: Rangierfahrt/Leerfahrt? Wird aber manchmal von einem Fahrzeug im Verbund gepushed (von hinteren Fahrzeug), während der andere "K" pusht
    - Z: Ziel erreicht/Leerfahrt? Wird an Endstation gepushed, aber auch bei Leerfahrt
    - ... insgesamt ziemlich unklar
- **transmitting_vehicle** (string): Vollständige Fahrzeugnummer des aktuell pushenden Fahrzeugs (Beispiel: 948004231445)
    - siehe https://de.wikipedia.org/wiki/UIC-Kennzeichnung_der_Triebfahrzeuge
    - 94 = Bauartcode: Elektrischer Triebzug mit weniger als 190 km/h
    - 80 = Ländercode: Deutschland
    - 0423 = Baureihe
    - 144 = Fahrzeugnummer
    - 5 = Prüfziffer (nach Luhn-Algorithmus)
- **vehicle_number** (string): Reine Fahrzeugnummer des pushenden Fahrzeugs (Beispiel: 144)
- **raw_coordinates** (array[lon, lat]): Geogr. Breite/Länge - Position zum Zeitpunkt des event_timestamp (Beispiel: [11.780573806573102, 48.100563853952934])
- **position_correction** (int): Bezieht sich auf die raw_coordinates:
    - 0: Unkorrigierte Werte (GPS-Messung)
    - 1: Erratener Wert (z.B. bei GPS-Ausfall)
    - 2: Auf die Strecke gesnappte GPS-Position
    - 3: Auf's Gleis gesnappte GPS-Position
- **rake** (string|null): Wagenreihung (Beispiel: "948004231445;0;0;0;0;0;0;948004233540")
    - Jeder Kurzzug besteht aus 4 Wagen - eine Seite hat eine um 500 höhere Wagennummer, die beiden mittleren Wagen
      haben jeweils die Nummer des angrenzenden Endwagens, jedoch die Baureihe 433 statt 423
    - Außer dem "Hauptwagen" werden hier alle Waggons mit "0" dargestellt
    - Kann *null* sein - u.a. manchmal kurz nach Kuppelvorgängen - wird aber relativ schnell befüllt
- **time_intervals** (array): Array mit Infos zur Interpolation, vermutlich als Keyframes-Definition, vermutlich auf den mitgepushten "LineString" bezogen. Ein Eintrag hat folgende Werte:
    - Timestamp in ms (double): Vermutlich zeitlicher Bezug des Keyframes
    - Wert zwischen 0 und 1 (float): Vermutlich prozentualer Bezug des Keyframes
    - Wert zwischen ca. -3 und +3 (double|null): Vermutlich Fahrtrichtung als Bogenmaß - *null* wenn unbekannt
    - Beispiel:  
    [1584373611002.26, 0, 0.06996005619603879],  
    [1584373646015.713, 0.25, 0.5999996954801623],  
    [1584373681029.167, 0.5, 0.6504038545615419],  
    [1584373716042.6199, 0.75, 0.3239544714481012],  
    [1584373751056.074, 1, 0.18236347274847],  
    [253402300800000, 1, 0.18236347274847]  

### content.geometry

- **type** (string):
    - LineString: In "coordinates" ist eine Poly-Line aus Geo-Koordinaten definiert
    - ...?
- **coordinates** (array[array[lon, lat]]): Array mit Geo-Koordinaten
    - Gibt die zukünftige Strecke an bis fast zur nächsten Haltestelle - diese kann vermutlich
      mit den time_intervals interpoliert werden
    - Beispiel:  
    [11.6633382983764, 48.1260354948852],  
    [11.6633382983764, 48.1260354948852]


Event-Quelle "trajectory_schematic"
-----------------------------------

TODO - Wie "trajectory", aber mit Daten/Koordinaten für den schematischen Netzplan.


Event-Quelle "full_trajectory_\[Train-ID]"
------------------------------------------

TODO


Event-Quelle "full_trajectory_schematic_\[Train-ID]"
------------------------------------------

TODO


Event-Quelle "stopsequence_\[Train-ID]"
---------------------------------------

TODO


Event-Quelle "stopsequence_schematic_\[Train-ID]"
-------------------------------------------------

TODO


Event-Quelle "deleted_vehicles"
-------------------------------

Wird geschickt, wenn ein Zug aus der Liste wieder entfernt werden soll, weil die Fahrt zu Ende ist
oder der Zug durch eine neue train_id ersetzt wurde. Dies scheint teilweise pauschal nach 2 Minuten
Inaktivität zu passieren. Die selbe train_id kann aber auch danach wieder als trajectory-Event gepusht
werden, wenn sie wieder aktiv wird.

**content** (uint64|null): train_id - Eindeutige Zug-ID (Beispiel: 140477388333184). Beim initialen
Subscribe wird das Event mit "null" gesendet.


Event-Quelle "deleted_vehicles_schematic"
-----------------------------------------

TODO


Event-Quelle "stations"
-----------------------

TODO


Event-Quelle "stations_schematic"
---------------------------------

TODO


Event-Quelle "station \[ID]"
----------------------------

TODO


Event-Quelle "station_schematic \[ID]"
--------------------------------------

TODO


Event-Quelle "timetable_\[Station-ID]"
--------------------------------------

TODO


Event-Quelle "timetable_\[Station-ID]_schematic"
------------------------------------------------

TODO


Event-Quelle "sbm_newsticker"
-----------------------------

Veraltet: Wird seit Anfang 2026 nicht mehr aktualisiert (letzte Meldung vom 11.02.2026). Störungsmeldungen
kommen jetzt aus der MOCO API (siehe unten).


Event-Quelle "extra_geoms"
--------------------------

TODO


Event-Quelle "healthcheck"
--------------------------

TODO


Event-Quelle "healthcheck_schematic"
------------------------------------

TODO


MOCO API (Störungsmeldungen)
============================

REST-Schnittstelle unter `https://api.geops.io/moco3/v1/s-bahn-munchen/export/` - wird von der offiziellen
Live-Map (s-bahn-muenchen-live.de) für Störungen verwendet. Die offizielle Map schickt einen eigenen `key` mit, die
API prüft ihn aber nicht (Stand 10/2026): Ohne Key oder mit ungültigem Key kommen dieselben Daten.

Es gibt anscheinend keine Push-Updates?
Wir pollen deshalb; die Antworten werden vom API-Gateway gecacht (`X-Tyk-Cached-Response`). CORS ist für alle
Origins freigegeben.

Das zugrundeliegende OpenAPI-Schema ist öffentlich: `https://moco.geops.io/api/schema/` (Pfad `/api/v2/{tenant}/export/`,
Tenant `s-bahn-munchen`). Ein einzelnes Situation-Objekt gibt es unter `.../export/[Situation-ID]`.

### Query-Parameter

- **publicNow** (bool, default false): Nur aktuell veröffentlichte Meldungen. Liefert sonst Historie. `false` deaktiviert nur den Filter, liefert also nicht das Gegenteil
- **publicAt** / **publicBefore** / **publicAfter** (ISO-Datum): Veröffentlichungszeitraum filtern
- **affectedAt** (ISO-Datum): Nur Meldungen, deren Gültigkeitszeitraum diesen Zeitpunkt enthält
- **timeintervalBefore** / **timeintervalAfter** (ISO-Datum): Laut Schema vorhanden, filtern aber (Stand 10/2026) nicht
- **limit** (int, 1-300, default 200) / **offset** (int, default 0): Pagination - siehe `totalCount`
- **graph** (string, kommasepariert): Graph für Geometrien - ohne Angabe kommen alle. Bei der S-Bahn gibt es:
    - `tralis100_sbm`: Geografische Koordinaten in EPSG:3857 (Web Mercator, Meter) - für Leaflet per
      `L.CRS.EPSG3857.unproject()` umrechnen
    - `tralis_schematic_sbm`: Koordinaten im schematischen Netzplan (keine echten Positionen)
- **includeGeoms** / **includeStops** / **includeLines** (bool, default true): Geometrien, betroffene Haltestellen bzw.
  Linien mitliefern
- **hasGeoms** (bool): Nur Meldungen mit/ohne Geometrie
- **simplify** (int, default 0): Geometrien vereinfachen
- **bbox** (4 Floats: min_x, min_y, max_x, max_y), **bbox_srid** (default 3857), **bbox_graph** (default `osm`):
  Räumlicher Filter
- **contentLarge** (default true) / **contentMedium** / **contentSmall** (default false): Textvarianten - bei der
  S-Bahn ist nur `contentLarge` befüllt
- **de** (default true) / **en** / **fr** / **it** (default false): Sprachen
- **isEdited** (bool): unklar - mit `true` kommt aktuell nichts zurück

Ungültige Werte liefern HTTP 400 mit Details (z.B. `limit` > 300), unbekannte Parameter werden ignoriert.
Sortierung ist immer nach einem internen Startdatum aufsteigend - ungefähr `affectedTimeIntervalsStart`, aber nicht
exakt (benachbarte Einträge sind teils um einige Stunden vertauscht). Ein `ordering`-Parameter existiert nur im alten
v1-Endpunkt (`/api/v1/export/publication/`), der aber immer die komplette Historie liefert (> 16 MB).

### paginatedSituations.results[]

- **id** (string): Situation-ID (Beispiel: "6616212")
- **title** (string): Überschrift
- **publicationLineNames** (array[string]): Betroffene Linien - teils "S 1", teils "S1", auch Regional- und Fernzüge
  (z.B. "RE 9", "ICE 60")
- **publicationStopNames** (array[string]): Betroffene Haltestellen
- **affectedTimeIntervalsStart** / **affectedTimeIntervalsEnd** (ISO-Datum): Gültigkeitszeitraum der Störung
- **publicationWindowsStart** / **publicationWindowsEnd** (ISO-Datum): Veröffentlichungszeitraum
- **reasons** (array): Grund, z.B. `{name: "CONSTRUCTION"}`, `TECHNICAL_PROBLEM_RAILWAY_SECTION`
- **publications** (array): Bisher immer genau ein Eintrag mit:
    - **serviceCondition**: z.B. DISRUPTION, MAJOR_DELAYS, DISCONTINUED_OPERATION, TRIP_CANCELLATION, STOP_MOVED,
      IRREGULAR_TRAFFIC, REPLACEMENT_RIDE
    - **severity**: bisher immer UNDEFINED
    - **textualContentLarge.de**: `summary`, `description` (HTML) - `reason`, `consequence`, `durationText`,
      `recommendation` sind bisher immer leer
    - **publicationStops** (wenn `includeStops`): Betroffene Haltestellen mit `name` und
      `geometry[].geom` (`Point`) je Graph
    - **publicationLines** (wenn `includeLines`): `lines[]` mit `name` und `geometry[].geom` (`MultiLineString`) je
      Graph - der betroffene Streckenabschnitt. Nicht jede Meldung hat Geometrien (z.B. Störungen im Gesamtnetz)
    - **images**, **infoLinks**: bisher immer leer
