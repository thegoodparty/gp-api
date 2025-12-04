# Use the public.ecr.aws BuildKit image
FROM public.ecr.aws/vend/moby/buildkit:buildx-stable-1 AS buildkit

# Stage 1: Install dependencies and build application
FROM public.ecr.aws/docker/library/node:22.12.0-alpine AS builder

RUN apk add --no-cache \
  libc6-compat \
  openssl

WORKDIR /app

# Install dependencies  
COPY package.json package-lock.json tsconfig.json tsconfig.build.json tsconfig.seed.json newrelic.js ./

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
# Skip migrations if using placeholder DATABASE_URL (for preview environments)
RUN if [ "$DATABASE_URL" != "postgresql://placeholder:placeholder@localhost:5432/placeholder" ]; then \
      echo "Cache bust: $CACHEBUST" && npx prisma migrate deploy --schema=prisma/schema; \
    else \
      echo "Skipping migrations during build (will run on container startup)"; \
    fi

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

# Copy seed and src for tsx runtime seeding (preview environments only)
RUN echo "Cache bust: $CACHEBUST - copying seed and src for preview seeding"
COPY --from=builder /app/seed ./seed
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Expose the application port
# EXPOSE 3000

# Set the NODE_ENV to production
ENV NODE_ENV=production

# Copy New Relic configuration
COPY --from=builder /app/newrelic.js ./

# Copy entrypoint script
COPY deploy/docker-entrypoint.sh ./
RUN chmod +x ./docker-entrypoint.sh

# Start the application
ENTRYPOINT ["./docker-entrypoint.sh"]
