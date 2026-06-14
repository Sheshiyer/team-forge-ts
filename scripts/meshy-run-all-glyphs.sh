#!/usr/bin/env bash
#
# Run scripts/meshy-image-to-3d.mjs against all 9 cortex glyph plates,
# sequentially (Meshy queues / rate-limits parallel submissions).
# Logs to .meshy-run.log; final GLBs land in src/assets/3d/.
set -uo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

GLYPH_DIR="design/assets/v3-command-cortex/glyphs"
LOG=".meshy-run.log"
: > "$LOG"

# kind → output filename map (mission → mission-nucleus.glb; others → node-<kind>.glb)
declare -a KINDS=(mission client project agent human issue memory approval routine)
declare -a OUTS=(mission-nucleus.glb node-client.glb node-project.glb node-agent.glb node-human.glb node-issue.glb node-memory.glb node-approval.glb node-routine.glb)

start=$(date +%s)
for i in "${!KINDS[@]}"; do
  kind="${KINDS[$i]}"
  out="${OUTS[$i]}"
  src="$GLYPH_DIR/$kind.png"
  printf '\n==== [%d/9] %s → %s ====\n' "$((i+1))" "$kind" "$out" | tee -a "$LOG"
  if [ ! -f "$src" ]; then
    echo "  MISSING SOURCE: $src — skipping" | tee -a "$LOG"
    continue
  fi
  if node scripts/meshy-image-to-3d.mjs "$kind" "$src" "$out" 2>&1 | tee -a "$LOG"; then
    echo "  OK $kind" | tee -a "$LOG"
  else
    echo "  FAIL $kind — continuing with remaining" | tee -a "$LOG"
  fi
done
end=$(date +%s)
echo "" | tee -a "$LOG"
echo "Total wall: $((end - start))s" | tee -a "$LOG"
echo "GLBs:" | tee -a "$LOG"
ls -la src/assets/3d/ 2>/dev/null | grep -E '\.glb$' | tee -a "$LOG" || true
