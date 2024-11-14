FROM node:18-bullseye-slim

WORKDIR /app/

COPY package*.json /app
RUN npm ci

# COPY dist /app
COPY . /app
RUN npm run build

ENTRYPOINT ["node", "/app/dist/main.js"]