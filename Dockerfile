FROM php:8-apache

COPY img /var/www/html/img
COPY modules /var/www/html/modules
COPY index.html main.js s-bahn-tracker.css vehicle-info.php config.php* /var/www/html/
