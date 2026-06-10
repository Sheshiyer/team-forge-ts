#!/usr/bin/env bash
set -euo pipefail

DEFAULT_PAPERCLIP_ROOT="/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/thoughtseed-paperclip"
PAPERCLIP_ROOT="${THOUGHTSEED_PAPERCLIP_ROOT:-${PAPERCLIP_ROOT:-$DEFAULT_PAPERCLIP_ROOT}}"
ACTION="${1:-start}"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

require_file() {
  local path="$1"
  [[ -f "$path" ]] || fail "Required file missing: $path"
}

is_pid_alive() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

require_file "$PAPERCLIP_ROOT/package.json"
require_file "$PAPERCLIP_ROOT/scripts/paperclip-core.sh"
require_file "$PAPERCLIP_ROOT/scripts/babysitter.sh"
require_file "$PAPERCLIP_ROOT/scripts/health-check.sh"
require_file "$PAPERCLIP_ROOT/scripts/forge-aura-adapter/adapter.sh"

cd "$PAPERCLIP_ROOT"

PID_FILE="$PAPERCLIP_ROOT/.thoughtseed/babysitter.pid"

case "$ACTION" in
  start)
    if [[ -f "$PID_FILE" ]]; then
      existing_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
      if is_pid_alive "$existing_pid"; then
        echo "Thoughtseed Paperclip babysitter already running (PID $existing_pid)."
        ./scripts/paperclip-core.sh start
        ./scripts/babysitter.sh status
        exec ./scripts/forge-aura-adapter/adapter.sh start
      fi
    fi

    ./scripts/paperclip-core.sh start
    ./scripts/babysitter.sh start
    exec ./scripts/forge-aura-adapter/adapter.sh start
    ;;
  status)
    ./scripts/paperclip-core.sh status
    ./scripts/babysitter.sh status
    exec ./scripts/forge-aura-adapter/adapter.sh status
    ;;
  health)
    ./scripts/paperclip-core.sh status
    ./scripts/health-check.sh
    exec ./scripts/forge-aura-adapter/adapter.sh status
    ;;
  stop)
    ./scripts/forge-aura-adapter/adapter.sh stop
    ./scripts/paperclip-core.sh stop
    exec ./scripts/babysitter.sh stop
    ;;
  *)
    fail "Unsupported action '$ACTION'. Use: start | status | health | stop"
    ;;
esac
