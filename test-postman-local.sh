#!/bin/bash

load_env_file() {
  if [ -f .env ]; then
    echo "Loading environment variables from .env file..."
    while IFS='=' read -r key value; do
      key=$(echo "$key" | xargs)
      value=$(echo "$value" | xargs)
      if [[ ! "$key" =~ ^# && -n "$key" ]]; then
        export "$key=$value"
      fi
    done < <(grep -v '^#' .env | grep -v '^$')
  else
    echo "Warning: .env file not found"
  fi
}

resolve_target_env() {
  TARGET_ENV="${1:-dev}"
  case "$TARGET_ENV" in
    dev)
      POSTMAN_ENV_NAME="gp-api-dev"
      ;;
    qa)
      POSTMAN_ENV_NAME="gp-api-qa"
      ;;
    localhost)
      POSTMAN_ENV_NAME="localhost"
      ;;
    *)
      echo "Skipping Postman tests for unknown environment: $TARGET_ENV. Valid options: dev, qa, localhost"
      exit 0
      ;;
  esac
}

require_env_var() {
  local var_name="$1"
  local error_message="$2"
  if [ -z "${!var_name:-}" ]; then
    echo "$error_message"
    exit 1
  fi
}

prepare_directories() {
  mkdir -p postman
  mkdir -p newman
}

fetch_collections() {
  echo "Fetching collections from Postman workspace..."
  COLLECTIONS_JSON=$(curl -s -H "X-Api-Key: ${POSTMAN_API_KEY}" \
    "https://api.getpostman.com/collections?workspace=${POSTMAN_WORKSPACE_ID}")

  echo "$COLLECTIONS_JSON" | jq -e . >/dev/null || (echo "Invalid JSON response" && exit 1)

  echo "$COLLECTIONS_JSON" | jq -r '.collections[].uid' > postman/collection_uids.txt

  COUNT=$(wc -l < postman/collection_uids.txt | tr -d ' ')
  echo "Found $COUNT collections"

  if [ "$COUNT" = "0" ]; then
    echo "No collections found in workspace ${POSTMAN_WORKSPACE_ID}"
    exit 1
  fi

  echo "Downloading collections..."
  while read -r COLLECTION_UID; do
    COL_JSON=$(curl -s -H "X-Api-Key: ${POSTMAN_API_KEY}" \
      "https://api.getpostman.com/collections/${COLLECTION_UID}")
    NAME=$(echo "$COL_JSON" | jq -r '.collection.info.name' | tr ' /' '__')
    echo "$COL_JSON" > "postman/${NAME}.collection.json"
    echo "  - Downloaded: ${NAME}"
  done < postman/collection_uids.txt
}

download_environment() {
  echo "Fetching environment: $POSTMAN_ENV_NAME"
  ENVS_JSON=$(curl -s -H "X-Api-Key: ${POSTMAN_API_KEY}" \
    "https://api.getpostman.com/environments?workspace=${POSTMAN_WORKSPACE_ID}")

  ENVIRONMENT_UID=$(echo "$ENVS_JSON" | jq -r --arg n "$POSTMAN_ENV_NAME" '.environments[] | select(.name==$n) | {uid, updatedAt} | "\(.updatedAt)|\(.uid)"' | sort -r | head -n1 | cut -d'|' -f2)

  if [ -z "$ENVIRONMENT_UID" ] || [ "$ENVIRONMENT_UID" = "null" ]; then
    echo "No Postman environment named '$POSTMAN_ENV_NAME' found in workspace."
    echo "Available environments:"
    echo "$ENVS_JSON" | jq -r '.environments[].name' | sort -u
    exit 1
  fi

  ENV_COUNT=$(echo "$ENVS_JSON" | jq -r --arg n "$POSTMAN_ENV_NAME" '[.environments[] | select(.name==$n)] | length')
  if [ "$ENV_COUNT" -gt 1 ]; then
    echo "Warning: Found $ENV_COUNT environments named '$POSTMAN_ENV_NAME'. Using the most recently updated one."
  fi

  curl -s -H "X-Api-Key: ${POSTMAN_API_KEY}" \
    "https://api.getpostman.com/environments/${ENVIRONMENT_UID}" \
    -o "postman/${TARGET_ENV}.environment.json"

  echo "Environment downloaded: postman/${TARGET_ENV}.environment.json"
}

download_globals() {
  echo "Fetching Postman globals..."
  GLOBALS_JSON=$(curl -s -H "X-Api-Key: ${POSTMAN_API_KEY}" \
    "https://api.getpostman.com/workspaces/${POSTMAN_WORKSPACE_ID}")

  GLOBALS_UID=$(echo "$GLOBALS_JSON" | jq -r '.workspace.globals.id // empty')

  GLOBALS_FLAG=""
  if [ -n "$GLOBALS_UID" ]; then
    curl -s -H "X-Api-Key: ${POSTMAN_API_KEY}" \
      "https://api.getpostman.com/environments/${GLOBALS_UID}" \
      -o "postman/globals.json"
    echo "Globals downloaded: postman/globals.json"
    GLOBALS_FLAG="-g postman/globals.json"
  else
    echo "No globals found in workspace"
  fi
}

ensure_newman() {
  if ! command -v newman &> /dev/null; then
    echo "Newman not found. Installing globally..."
    npm i -g newman newman-reporter-htmlextra
  fi
}

run_newman_tests() {
  echo ""
  echo "Running Newman tests..."
  ENV_FILE="postman/${TARGET_ENV}.environment.json"

  if [ ! -f "$ENV_FILE" ]; then
    echo "Error: Environment file not found: $ENV_FILE"
    exit 1
  fi

  echo "Using environment file: $ENV_FILE"

  FAILED_COLLECTIONS=0
  TOTAL_COLLECTIONS=0

  for COL in postman/*.collection.json; do
    BASENAME=$(basename "$COL" .collection.json)
    TOTAL_COLLECTIONS=$((TOTAL_COLLECTIONS + 1))
    echo "=========================================="
    echo "Running collection: $BASENAME"
    echo "Newman command: newman run $COL -e $ENV_FILE $GLOBALS_FLAG"
    echo "=========================================="

    if newman run "$COL" \
      -e "$ENV_FILE" \
      $GLOBALS_FLAG \
      --reporters cli,htmlextra,junit \
      --reporter-htmlextra-export "newman/${BASENAME}.html" \
      --reporter-junit-export "newman/${BASENAME}.xml" \
      --timeout-request 120000 \
      --delay-request 50 \
      --env-var "apiToken=${API_TOKEN:-}"; then
      echo "✅ Collection passed: $BASENAME"
    else
      echo "❌ Collection failed: $BASENAME"
      FAILED_COLLECTIONS=$((FAILED_COLLECTIONS + 1))
    fi
    echo ""
  done

  echo ""
  echo "========================================"
  echo "Test Summary"
  echo "========================================"
  echo "Total collections: $TOTAL_COLLECTIONS"
  echo "Passed: $((TOTAL_COLLECTIONS - FAILED_COLLECTIONS))"
  echo "Failed: $FAILED_COLLECTIONS"
  echo ""
  echo "Reports available in: newman/"

  if [ "$FAILED_COLLECTIONS" -gt 0 ]; then
    echo "❌ Some collections failed"
    exit 1
  else
    echo "✅ All collections passed!"
    exit 0
  fi
}

main() {
  resolve_target_env "$1"
  echo "Testing Postman collections for environment: $TARGET_ENV (Postman env: $POSTMAN_ENV_NAME)"
  require_env_var POSTMAN_API_KEY "Error: POSTMAN_API_KEY environment variable not set"
  require_env_var POSTMAN_WORKSPACE_ID "Error: POSTMAN_WORKSPACE_ID environment variable not set"
  prepare_directories
  fetch_collections
  download_environment
  download_globals
  ensure_newman
  run_newman_tests
}

load_env_file
set -euo pipefail
main "${1:-dev}"

