FROM node:20 as build-env
WORKDIR /app/
COPY package.json package-lock.json /app/
RUN npm ci
# separate install files from source code for efficient docker caching
COPY index.html vite.config.js .env /app/
COPY src/ /app/src/
RUN npm run build

FROM php:8-apache

COPY --from=build-env /app/dist/ /var/www/html/
COPY public/assets/ /var/www/html/assets/
