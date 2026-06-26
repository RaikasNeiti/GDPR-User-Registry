#!/bin/sh
set -e

# Simple Vault fetcher for dev: retrieves Postgres creds and exports env vars
# Required env: VAULT_ADDR, VAULT_TOKEN (or set VAULT_SECRET_PATH and use approle etc.)

if [ -z "$VAULT_ADDR" ]; then
  echo "VAULT_ADDR must be set (eg. http://host.docker.internal:8200)" >&2
  exit 1
fi

if [ -z "$VAULT_TOKEN" ]; then
  echo "VAULT_TOKEN must be set for this quick dev flow" >&2
  exit 1
fi

SECRET_PATH=${VAULT_SECRET_PATH:-secret/data/postgres}
echo "Fetching DB credentials from Vault path: $SECRET_PATH"

RESP=$(curl -k -s --fail \
  --header "X-Vault-Token: $VAULT_TOKEN" \
  "$VAULT_ADDR/v1/$SECRET_PATH") || {
  echo "Failed to fetch secret from Vault" >&2
  echo "$RESP" >&2
  exit 1
}

USER=$(echo "$RESP" | jq -r '.data.data.username')
PASS=$(echo "$RESP" | jq -r '.data.data.password')

if [ -z "$USER" ] || [ -z "$PASS" ] || [ "$USER" = "null" ] || [ "$PASS" = "null" ]; then
  echo "Vault secret did not contain username/password at $SECRET_PATH" >&2
  echo "$RESP" >&2
  exit 1
fi

HOST=${PGHOST:-db}
DB=${PGDATABASE:-gdpr}
DB_PORT=${PGPORT:-5432}

export PGUSER="$USER"
export PGPASSWORD="$PASS"
export PGHOST="$HOST"
export PGDATABASE="$DB"
export PGPORT="$DB_PORT"

export DATABASE_URL="postgres://$USER:$PASS@$HOST:$DB_PORT/$DB"
echo "Injected DATABASE_URL for $PGUSER@$PGHOST:$DB_PORT/$PGDATABASE"
# Run the existing wait script and then the server
exec sh -c "node wait-for-postgres.js && node server.js"
