<?php

$config = require 'config.php';

$db = new PDO($config->dsn, $config->user, $config->password);
$db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_OBJ);

$vehicleInfos = $db->query('SELECT model, `number`, isModern, IF(`lastSeenAt` < \'2021-02-22\', 1, 0) AS isOutdated FROM vehicle_info')->fetchAll();

foreach ($vehicleInfos as $vehicleInfo) {
    if ($vehicleInfo->isModern !== null) $vehicleInfo->isModern = (bool) $vehicleInfo->isModern;
    $vehicleInfo->isOutdated = (bool) $vehicleInfo->isOutdated;
}

header('Content-Type: application/json');
echo json_encode($vehicleInfos);
