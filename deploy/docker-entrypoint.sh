#!/bin/sh
set -e

if [ -z "$DB_HOST" ] || [ -z "$DB_PASSWORD" ] || [ -z "$DB_USER" ] || [ -z "$DB_NAME" ]; then
  echo "One or more required DB environment variables are not set"
  exit 1
fi

if [ -z "$VOTER_DB_HOST" ] || [ -z "$VOTER_DB_PASSWORD" ] || [ -z "$VOTER_DB_USER" ] || [ -z "$VOTER_DB_NAME" ]; then
  echo "One or more required VOTER_DB environment variables are not set"
  exit 1
fi

export DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:5432/$DB_NAME"
export VOTER_DATASTORE="postgresql://$VOTER_DB_USER:$VOTER_DB_PASSWORD@$VOTER_DB_HOST:5432/$VOTER_DB_NAME"

# Run migrations on startup if DATABASE_URL is set and not a placeholder
if [ -n "$DATABASE_URL" ] && [ "$DATABASE_URL" != "postgresql://placeholder:placeholder@localhost:5432/placeholder" ]; then
  echo "Waiting for database to be ready..."
  
  # Retry logic for database connection (important for Aurora Serverless v2 which takes time to initialize)
  MAX_RETRIES=30
  RETRY_COUNT=0
  
  while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    echo "Attempting database connection (attempt $((RETRY_COUNT + 1))/$MAX_RETRIES)..."
    
    if npx prisma migrate deploy --schema=prisma/schema 2>&1; then
      echo "✅ Migrations completed successfully."
      break
    else
      RETRY_COUNT=$((RETRY_COUNT + 1))
      if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
        echo "⏳ Database not ready yet. Waiting 10 seconds before retry..."
        sleep 10
      else
        echo "❌ ERROR: Failed to connect to database after $MAX_RETRIES attempts."
        exit 1
      fi
    fi
  done

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
      if curl -s http://localhost:${PORT:-80}/v1/content/sync > /dev/null 2>&1; then
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

