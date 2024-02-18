# S-Bahn München Live

A Vue.js implementation of S-Bahn München Live with realtime data from geOps.

## Installation

```sh
$ npm install
```

## Usage

### Serving the app for local development

```sh
$ npm run dev
```

When using Docker, a local instance will be available via `http://localhost:8080/`

```sh
$ docker-compose up --build
```

### Building a distribution version

```sh
$ npm run build
```

This task will create a distribution version of the project
inside your local `dist/` folder

When using docker, run
```sh
$ docker-compose -f docker-compose.dist.yaml up --build
```
