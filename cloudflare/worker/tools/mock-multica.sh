#!/usr/bin/env bash
# Mock MultiCA dispatcher for Phase 3 smoke testing.
# Polls the Worker for a specific run_id, calls Paperclip standup, then
# posts the result back to /v1/commands/runs/:id/result with a signed
# MULTICA_CALLBACK_SHARED_SECRET HMAC.
#
# Usage:
#   export MULTICA_CALLBACK_SHARED_SECRET=...
#   export PAPERCLIP_BASE_URL=http://127.0.0.1:3100
#   export PAPERCLIP_AGENT_TOKEN=test-token-1
#   export WORKER_BASE_URL=https://teamforge-api.sheshnarayan-iyer.workers.dev
#   export WORKER_INTERNAL_SECRET=...   # for the Worker GET auth
#   ./mock-multica.sh <run_id> <agent_id> <correlation_id>

set -euo pipefail

RUN_ID="${1:?run_id required}"
AGENT_ID="${2:?agent_id required}"
CORRELATION_ID="${3:?correlation_id required}"

: "${MULTICA_CALLBACK_SHARED_SECRET:?required}"
: "${PAPERCLIP_BASE_URL:?required}"
: "${PAPERCLIP_AGENT_TOKEN:?required}"
: "${WORKER_BASE_URL:?required}"
: "${WORKER_INTERNAL_SECRET:?required}"

echo "[mock-multica] dispatching run=$RUN_ID agent=$AGENT_ID correlation=$CORRELATION_ID"

# 1) in_progress callback to advance state
IN_PROG_BODY="{\"run_id\":\"$RUN_ID\",\"correlation_id\":\"$CORRELATION_ID\",\"state\":\"in_progress\"}"
IN_PROG_SIG=$(printf '%s' "$IN_PROG_BODY" | openssl dgst -sha256 -hmac "$MULTICA_CALLBACK_SHARED_SECRET" | awk '{print $2}')
curl -s -X POST "$WORKER_BASE_URL/v1/commands/runs/$RUN_ID/result" \
  -H "content-type: application/json" \
  -H "X-MultiCA-Signature: $IN_PROG_SIG" \
  -d "$IN_PROG_BODY" > /dev/null
echo "[mock-multica] sent in_progress"

# 2) Call Paperclip
PAPERCLIP_BODY="{\"correlation_id\":\"$CORRELATION_ID\",\"scope\":{},\"requester\":{\"kind\":\"multica_service\",\"identity\":\"mock-multica\"}}"
PAPERCLIP_RESP=$(curl -s -X POST "$PAPERCLIP_BASE_URL/api/agents/$AGENT_ID/standup" \
  -H "content-type: application/json" \
  -H "authorization: Bearer $PAPERCLIP_AGENT_TOKEN" \
  -d "$PAPERCLIP_BODY")
echo "[mock-multica] paperclip response: $PAPERCLIP_RESP"

# 3) Extract data, post succeeded callback
RESULT_JSON=$(echo "$PAPERCLIP_RESP" | python3 -c 'import json,sys; r=json.load(sys.stdin); print(json.dumps(r.get("data", {})))')
SUCC_BODY="{\"run_id\":\"$RUN_ID\",\"correlation_id\":\"$CORRELATION_ID\",\"state\":\"succeeded\",\"result\":$RESULT_JSON}"
SUCC_SIG=$(printf '%s' "$SUCC_BODY" | openssl dgst -sha256 -hmac "$MULTICA_CALLBACK_SHARED_SECRET" | awk '{print $2}')
curl -s -X POST "$WORKER_BASE_URL/v1/commands/runs/$RUN_ID/result" \
  -H "content-type: application/json" \
  -H "X-MultiCA-Signature: $SUCC_SIG" \
  -d "$SUCC_BODY"
echo ""
echo "[mock-multica] sent succeeded"
