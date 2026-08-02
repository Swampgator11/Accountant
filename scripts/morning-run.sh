#!/usr/bin/env bash
# Daily morning categorization against your connected QuickBooks company.
# Schedule with cron, e.g. every day at 7:00 local:
#   0 7 * * * /path/to/Accountant/scripts/morning-run.sh >> /tmp/accountant-morning.log 2>&1
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env.local}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$ENV_FILE"
  set +a
fi

BASE_URL="${APP_BASE_URL:-http://localhost:3000}"
SECRET="${CRON_SECRET:-}"

if [[ -z "$SECRET" ]]; then
  echo "CRON_SECRET is not set. Add it to .env.local first." >&2
  exit 1
fi

curl -sS -X POST \
  -H "Authorization: Bearer ${SECRET}" \
  -H "Accept: application/json" \
  "${BASE_URL}/api/morning/run"
echo
