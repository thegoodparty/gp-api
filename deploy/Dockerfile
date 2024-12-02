# Use the public.ecr.aws BuildKit image
FROM public.ecr.aws/vend/moby/buildkit:buildx-stable-1 AS buildkit

# Stage 1: Install dependencies and build application
FROM public.ecr.aws/docker/library/node:22-alpine AS builder

RUN apk add --no-cache \
  libc6-compat \
  openssl

WORKDIR /app

ARG CACHEBUST

# Install dependencies
COPY package.json package-lock.json tsconfig.json tsconfig.build.json ./

# Copy application source files, prisma files, and seed data
COPY src/ ./src
COPY prisma/ ./prisma

RUN npm install

# Optionally bust the cache to force a rebuild of the following steps
# ARG CACHEBUST

# Set the docker build args into environment variables on runner.
ARG STAGE
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

# Note: the CodeBuild project must be configured to be on the VPC.
# Run the migrations for the database
RUN npm run migrate:deploy

# Generate Prisma client
RUN npm run generate

# Build the application (output in /dist)
RUN npm run build

# Stage 2: Create a minimal runtime image
FROM public.ecr.aws/docker/library/node:22-alpine

RUN apk add --no-cache \
  libc6-compat \
  openssl

WORKDIR /app

# DO AN LS 
RUN echo "Initial ls of /app"
RUN ls -la

# Copy only necessary files to the runtime image
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

RUN echo "Final ls of /app"
# DO AN LS 
RUN ls -la

RUN echo "Final ls of /app/dist"

# DO AN LS 
RUN ls -la /app/dist

# Expose the application port
# EXPOSE 3000

# Start the application
CMD ["node", "dist/main.js"]
