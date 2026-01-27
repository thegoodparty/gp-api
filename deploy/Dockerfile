FROM node:22-alpine3.23

RUN apk add --no-cache \
  libc6-compat \
  openssl \
  curl

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps

COPY node_modules/.prisma ./node_modules/.prisma
COPY dist ./dist
COPY prisma ./prisma

# Copy seed and src for tsx runtime seeding (preview environments only)
COPY seed ./seed
COPY src ./src
COPY tsconfig.json ./

ENV NODE_ENV=production

# Copy New Relic configuration and entrypoint
COPY newrelic.js ./
COPY deploy/docker-entrypoint.sh ./
RUN chmod +x ./docker-entrypoint.sh

ENTRYPOINT ["./docker-entrypoint.sh"]
