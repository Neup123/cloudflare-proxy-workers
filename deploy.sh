#!/usr/bin/env bash
# פריסת ה־Workers ל־Cloudflare דרך ה־API (בלי wrangler).
# שימוש:  CLOUDFLARE_API_TOKEN=<token> ./deploy.sh [name ...]
# בלי ארגומנטים — פורס את כל השירותים בטבלה.
set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is not set — use the secure entry flow, never paste a token in chat}"

ACCOUNT_ID="e2191ccc8c3d5f1732e8564d37e4903a"

declare -A TARGETS=(
  [coolify]="https://chgr.duckdns.org:1004"
  [n8n]="https://n8n.chgr.duckdns.org:1004"
  [mcp]="https://mcp.chgr.duckdns.org:1004"
)

NAMES=("${@:-${!TARGETS[@]}}")

for name in "${NAMES[@]}"; do
  origin="${TARGETS[$name]:-}"
  if [ -z "$origin" ]; then
    echo "unknown service: $name" >&2
    exit 1
  fi
  meta="$(jq -nc --arg o "$origin" '{main_module: "worker.js", bindings: [{type: "plain_text", name: "TARGET_ORIGIN", text: $o}]}')"
  echo "== deploying $name -> $origin"
  curl -sS -X PUT "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/scripts/${name}" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -F "metadata=${meta};type=application/json" \
    -F "script=@worker.js;type=application/javascript+module"
  echo
  echo "live at: https://${name}.neuprni.workers.dev"
done
