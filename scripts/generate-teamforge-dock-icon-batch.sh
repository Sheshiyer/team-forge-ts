#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROMPT_DIR="${REPO_ROOT}/design-assets/teamforge/icons/prompts"
STAMP="${1:-$(date +%Y%m%d-%H%M%S)}"
OUTPUT_DIR="${TEAMFORGE_ICON_OUTPUT_DIR:-$HOME/Downloads/teamforge-dock-icon-batch-${STAMP}}"
MODEL="${TEAMFORGE_ICON_MODEL:-fal-nano-banana-2}"

mkdir -p "${OUTPUT_DIR}"

if [[ ! -d "${PROMPT_DIR}" ]]; then
  echo "Prompt directory not found: ${PROMPT_DIR}" >&2
  exit 1
fi

echo "Generating TeamForge dock icon batch with ${MODEL}"
echo "Output directory: ${OUTPUT_DIR}"

for prompt_file in "${PROMPT_DIR}"/dock-icon-variant-*.txt; do
  if [[ ! -f "${prompt_file}" ]]; then
    echo "No prompt files found in ${PROMPT_DIR}" >&2
    exit 1
  fi

  name="$(basename "${prompt_file}" .txt)"
  output_file="${OUTPUT_DIR}/${name}.png"
  prompt_text="$(cat "${prompt_file}")"

  cp "${prompt_file}" "${OUTPUT_DIR}/${name}.txt"

  bun run ~/.claude/skills/Art/Tools/Generate.ts \
    --model "${MODEL}" \
    --prompt "${prompt_text}" \
    --size 1K \
    --aspect-ratio 1:1 \
    --output "${output_file}"
done

python3 "${SCRIPT_DIR}/review-teamforge-dock-icons.py" "${OUTPUT_DIR}"

echo "Batch complete"
echo "Review board: ${OUTPUT_DIR}/teamforge-dock-icon-review-board.png"
echo "Preview the variants in Finder/Preview before promoting any winner into the repo."
