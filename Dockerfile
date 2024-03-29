FROM node:20
WORKDIR /app/
COPY package.json package-lock.json /app/
RUN npm ci
# separate install files from source code for efficient docker caching
COPY index.html vite.config.js .env /app/
COPY src/ /app/src/

ENTRYPOINT [ "npm", "run", "dev", "--", "--host" ]
