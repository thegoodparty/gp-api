# Stage 1: Install dependencies and build application
FROM public.ecr.aws/docker/library/node:22-alpine AS builder

RUN apk add --no-cache \
  libc6-compat \
  openssl

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./

# Copy application source files, including Prisma in src/
COPY api/ ./api

# DO AN LS 
RUN ls -la

RUN npm install

# Generate Prisma client
RUN npx prisma generate --schema=./api/prisma/schema/schema.prisma

# Build the application (output in /dist)
RUN npm run build

# Stage 2: Create a minimal runtime image
FROM public.ecr.aws/docker/library/node:22-alpine

RUN apk add --no-cache \
  libc6-compat \
  openssl

WORKDIR /app

# Copy only necessary files to the runtime image
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/api/dist ./dist
COPY --from=builder /app/api/prisma/schema ./api/prisma/schema

# Expose the application port
# EXPOSE 3000

# Start the application
CMD ["node", "dist/main.js"]
