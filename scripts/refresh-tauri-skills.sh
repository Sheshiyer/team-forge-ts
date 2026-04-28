#!/usr/bin/env bash
set -euo pipefail

REPO_SOURCE="dchuk/claude-code-tauri-skills"

echo "Refreshing Tauri skills from ${REPO_SOURCE}..."
npx skills add "${REPO_SOURCE}" -y -g
echo "Restart Codex to load the refreshed Tauri skills into a new session."
