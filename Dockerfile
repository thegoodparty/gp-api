FROM node:22-alpine

WORKDIR /app/

COPY src/package*.json /app
RUN npm ci

# COPY dist /app
COPY src /app

# run npm run build in the /src directory
WORKDIR /app/src
RUN npm run build

WORKDIR /app/
COPY dist /app/dist

ENTRYPOINT ["node", "dist/main.js"]