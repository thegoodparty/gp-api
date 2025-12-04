#!/bin/sh
set -e

# Run migrations on startup if DATABASE_URL is set and not a placeholder
if [ -n "$DATABASE_URL" ] && [ "$DATABASE_URL" != "postgresql://placeholder:placeholder@localhost:5432/placeholder" ]; then
  echo "Running Prisma migrations..."
  npx prisma migrate deploy --schema=prisma/schema
  echo "Migrations completed."

  if [ "$IS_PREVIEW" = "true" ]; then
    echo "Preview environment detected. Running seed..."
    node dist/seed/seed.js
    echo "Seed completed."
  fi
else
  echo "DATABASE_URL not set or is placeholder, skipping migrations."
fi

# Start the application
exec node -r ./newrelic.js dist/src/main

