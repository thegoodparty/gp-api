#!/bin/sh
set -e

# Run migrations on startup if DATABASE_URL is set and not a placeholder
if [ -n "$DATABASE_URL" ] && [ "$DATABASE_URL" != "postgresql://placeholder:placeholder@localhost:5432/placeholder" ]; then
  echo "Running Prisma migrations..."
  npx prisma migrate deploy --schema=prisma/schema
  echo "Migrations completed."

  if [ "$IS_PREVIEW" = "true" ]; then
    echo "Preview environment detected. Running seed..."
    if npx tsx seed/seed.ts; then
      echo "Seed completed successfully."
    else
      echo "WARNING: Seed failed with exit code $?. Continuing with app startup..."
    fi
  fi
else
  echo "DATABASE_URL not set or is placeholder, skipping migrations."
fi

# For preview environments, start app in background, sync content, then wait
if [ "$IS_PREVIEW" = "true" ]; then
  echo "Starting application in background for content sync..."
  node -r ./newrelic.js dist/src/main &
  APP_PID=$!
  
  echo "Waiting for app to be healthy..."
  for i in $(seq 1 30); do
    if curl -s http://localhost:${PORT:-80}/v1/health > /dev/null 2>&1; then
      echo "App is healthy. Running content sync..."
      if curl -s -X POST http://localhost:${PORT:-80}/v1/content/sync > /dev/null 2>&1; then
        echo "Content sync completed."
      else
        echo "WARNING: Content sync failed. Continuing..."
      fi
      break
    fi
    echo "Waiting for app... ($i/30)"
    sleep 2
  done
  
  echo "Waiting on application process..."
  wait $APP_PID
else
  # For non-preview environments, start normally
  exec node -r ./newrelic.js dist/src/main
fi

