<?php

$config = require 'config.php';

$db = new PDO($config->dsn, $config->user, $config->password);
$db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_OBJ);

$vehicleInfos = $db->query('SELECT model, `number`, isModern, hasWiFi, isTagged FROM vehicle_info')->fetchAll();

foreach ($vehicleInfos as $vehicleInfo) {
    if ($vehicleInfo->isModern !== null) $vehicleInfo->isModern = (bool) $vehicleInfo->isModern;
    if ($vehicleInfo->hasWiFi !== null) $vehicleInfo->hasWiFi = (bool) $vehicleInfo->hasWiFi;
    $vehicleInfo->isTagged = (bool) $vehicleInfo->isTagged;
}

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
echo json_encode($vehicleInfos);
