#!/usr/bin/env bash
#
# Crop the 9 individual node glyphs from the V3 mockup
# 03-node-path-language.png so each one can be fed to the Meshy AI
# image-to-3D pipeline. Outputs to design/assets/v3-command-cortex/glyphs/.
#
# Uses macOS-native `sips`. Run from any working directory.
#
# Usage:  bash scripts/crop-cortex-glyphs.sh
set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO_ROOT/design/assets/v3-command-cortex/03-node-path-language.png"
OUT="$REPO_ROOT/design/assets/v3-command-cortex/glyphs"

if [ ! -f "$SRC" ]; then
  echo "ERROR: source not found: $SRC" >&2
  exit 1
fi

mkdir -p "$OUT"

# Source image: 1536 wide × 1024 tall
# Each line: kind  height  width  offsetY  offsetX
# (sips: --cropToHeightWidth H W --cropOffset Y X)
read -r -d '' SPECS <<'EOF' || true
client      360 360  30   80
mission     440 460  60  540
human       360 360  40 1130
project     320 320 310  120
issue       340 340 300 1100
agent       340 340 540  110
memory      340 340 540 1110
approval    280 320 600  430
routine     280 320 600  790
EOF

set +e
while IFS= read -r line; do
  [ -z "$line" ] && continue
  set -- $line
  kind=$1; h=$2; w=$3; y=$4; x=$5
  out_file="$OUT/$kind.png"
  printf "  → %-10s  crop %4d×%-4d @ (%4d,%4d)  → %s\n" "$kind" "$w" "$h" "$x" "$y" "$(basename "$out_file")"
  sips --cropToHeightWidth "$h" "$w" --cropOffset "$y" "$x" "$SRC" --out "$out_file" >/dev/null
done <<< "$SPECS"
set -e

echo ""
echo "Done. Crops written to: $OUT"
ls -la "$OUT" | grep -v "^total" | grep -v "^d"
