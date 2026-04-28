#!/usr/bin/env bash
set -euo pipefail

STORE_ROOT="${AGENT_SKILLS_HOME:-$HOME/.agents/skills}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST_FILE="${SCRIPT_DIR}/../config/tauri-skill-suite.txt"

if [[ ! -d "${STORE_ROOT}" ]]; then
  echo "Agent skills store not found: ${STORE_ROOT}" >&2
  exit 1
fi

if [[ ! -f "${MANIFEST_FILE}" ]]; then
  echo "Tauri skill manifest not found: ${MANIFEST_FILE}" >&2
  exit 1
fi

echo "# Tauri skills from ${STORE_ROOT}"

missing=0
total=0

while IFS= read -r skill_name; do
  [[ -z "${skill_name}" ]] && continue
  total=$((total + 1))
  if [[ -d "${STORE_ROOT}/${skill_name}" ]]; then
    echo "${skill_name}"
  else
    echo "MISSING ${skill_name}" >&2
    missing=$((missing + 1))
  fi
done < "${MANIFEST_FILE}"

echo "# Verified ${total} manifest skills"

if [[ "${missing}" -gt 0 ]]; then
  echo "# Missing ${missing} manifest skills" >&2
  exit 1
fi
