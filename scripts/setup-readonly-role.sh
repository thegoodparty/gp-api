#!/bin/bash
set -euo pipefail

VALID_ENVS=("dev" "qa" "prod")

if [[ $# -ne 1 ]] || [[ ! " ${VALID_ENVS[*]} " =~ " $1 " ]]; then
  echo "Usage: $0 <dev|qa|prod>"
  exit 1
fi

ENV="$1"

SECRET_NAME="GP_API_$(echo "$ENV" | tr '[:lower:]' '[:upper:]')"
SSM_PARAM="/gp-api-${ENV}/readonly-password"

echo "Fetching readonly password from SSM parameter ${SSM_PARAM}..."
READONLY_PW=$(aws ssm get-parameter --name "$SSM_PARAM" --with-decryption --query 'Parameter.Value' --output text 2>/dev/null) || true

if [[ -z "$READONLY_PW" || "$READONLY_PW" == "None" ]]; then
  echo "Error: SSM parameter ${SSM_PARAM} not found."
  echo "Create it first:"
  echo "  aws ssm put-parameter --name '${SSM_PARAM}' --type SecureString --value '<password>'"
  exit 1
fi

echo "Fetching master DB password from Secrets Manager (${SECRET_NAME})..."
SECRET_JSON=$(aws secretsmanager get-secret-value --secret-id "$SECRET_NAME" --query SecretString --output text)
DB_PASSWORD=$(echo "$SECRET_JSON" | jq -r '.DB_PASSWORD')

if [[ -z "$DB_PASSWORD" || "$DB_PASSWORD" == "null" ]]; then
  echo "Error: DB_PASSWORD not found in ${SECRET_NAME}."
  exit 1
fi

case "$ENV" in
  dev)  CLUSTER_ID="gp-api-db" ;;
  qa)   CLUSTER_ID="gp-api-db-qa" ;;
  prod) CLUSTER_ID="gp-api-db-prod" ;;
esac

echo "Looking up cluster endpoint for ${CLUSTER_ID}..."
DB_HOST=$(aws rds describe-db-clusters --db-cluster-identifier "$CLUSTER_ID" --query 'DBClusters[0].Endpoint' --output text)

if [[ -z "$DB_HOST" || "$DB_HOST" == "None" ]]; then
  echo "Error: Could not find endpoint for cluster ${CLUSTER_ID}."
  exit 1
fi

echo "Connecting to ${DB_HOST} as gpuser..."
echo ""

PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U gpuser -d gpdb \
  -v ON_ERROR_STOP=1 \
  -v readonly_pw="$READONLY_PW" \
  <<'SQL'
\o /dev/null
SELECT set_config('app.readonly_pw', :'readonly_pw', false);
\o

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'readonly_role') THEN
    CREATE ROLE readonly_role NOLOGIN;
    RAISE NOTICE 'Created role: readonly_role';
  ELSE
    RAISE NOTICE 'Role readonly_role already exists, skipping';
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'readonly_user') THEN
    EXECUTE format('CREATE ROLE readonly_user WITH LOGIN PASSWORD %L INHERIT', current_setting('app.readonly_pw'));
    RAISE NOTICE 'Created user: readonly_user';
  ELSE
    EXECUTE format('ALTER ROLE readonly_user WITH PASSWORD %L', current_setting('app.readonly_pw'));
    RAISE NOTICE 'User readonly_user already exists, updated password';
  END IF;
END $$;

\o /dev/null
SELECT set_config('app.readonly_pw', '', false);
\o

GRANT CONNECT ON DATABASE gpdb TO readonly_role;
GRANT USAGE ON SCHEMA public TO readonly_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_role;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO readonly_role;

ALTER DEFAULT PRIVILEGES FOR ROLE gpuser IN SCHEMA public
  GRANT SELECT ON TABLES TO readonly_role;
ALTER DEFAULT PRIVILEGES FOR ROLE gpuser IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO readonly_role;

GRANT readonly_role TO readonly_user;

\echo ''
\echo 'Readonly role setup complete.'
SQL
