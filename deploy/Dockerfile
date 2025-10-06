# Use the public.ecr.aws BuildKit image
FROM public.ecr.aws/vend/moby/buildkit:buildx-stable-1 AS buildkit

# Stage 1: Install dependencies and build application
FROM public.ecr.aws/docker/library/node:22.12.0-alpine AS builder

RUN apk add --no-cache \
  libc6-compat \
  openssl

WORKDIR /app

# Install dependencies  
COPY package.json package-lock.json tsconfig.json tsconfig.build.json newrelic.js ./

# Copy application source files, prisma files, and seed data
COPY src/ ./src
COPY prisma/ ./prisma
COPY seed/ ./seed

RUN npm ci --legacy-peer-deps

# Optionally bust the cache to force a rebuild of the following steps
ARG CACHEBUST
ENV CACHEBUST=${CACHEBUST:-1}

# Set the docker build args into environment variables on runner.
ARG STAGE
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

# Note: the CodeBuild project must be configured to be on the VPC.
# Force cache bust for these commands by echoing CACHEBUST
RUN echo "Cache bust: $CACHEBUST" && npx prisma migrate deploy --schema=prisma/schema

# Force cache bust for Prisma client generation
RUN echo "Cache bust: $CACHEBUST" && npx prisma generate --schema=prisma/schema

# Build the application (output in /dist)
RUN echo "Cache bust: $CACHEBUST" && npm run build

# Stage 2: Create a minimal runtime image
FROM public.ecr.aws/docker/library/node:22.12.0-alpine

RUN apk add --no-cache \
  libc6-compat \
  openssl

WORKDIR /app

ARG CACHEBUST
ENV CACHEBUST=${CACHEBUST:-1}

# Copy package files for production dependencies
RUN echo "Cache bust: $CACHEBUST - copying package.json and package-lock.json"
COPY package.json package-lock.json ./
RUN echo "Package files copied at: $(date)"
# Install only production dependencies
RUN echo "Cache bust: $CACHEBUST" && npm ci --omit=dev --legacy-peer-deps

# Copy only necessary files to the runtime image
RUN echo "Cache bust: $CACHEBUST - copying .prisma"
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

RUN echo "Cache bust: $CACHEBUST - copying dist"
COPY --from=builder /app/dist ./dist

RUN echo "Cache bust: $CACHEBUST - copying prisma"
COPY --from=builder /app/prisma ./prisma

RUN echo "Cache bust: $CACHEBUST - copying seed"
COPY --from=builder /app/seed ./seed

# Expose the application port
# EXPOSE 3000

# Set the NODE_ENV to production
ENV NODE_ENV=production

# Copy New Relic configuration
COPY --from=builder /app/newrelic.js ./

# Start the application
# Note: -r newrelic (not -r ./newrelic.js) loads the newrelic module,
# which then automatically loads config from newrelic.js
CMD ["node", "-r", "newrelic", "dist/src/main"]
