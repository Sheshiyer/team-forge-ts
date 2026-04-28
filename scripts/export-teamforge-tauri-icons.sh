#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: export-teamforge-tauri-icons.sh <approved-master-png>" >&2
  exit 1
fi

SOURCE_PNG="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ICON_DIR="${REPO_ROOT}/src-tauri/icons"
ICONSET_DIR="${ICON_DIR}/teamforge.iconset"

if [[ ! -f "${SOURCE_PNG}" ]]; then
  echo "Source PNG not found: ${SOURCE_PNG}" >&2
  exit 1
fi

mkdir -p "${ICON_DIR}"
rm -rf "${ICONSET_DIR}"
mkdir -p "${ICONSET_DIR}"

sips -z 32 32 "${SOURCE_PNG}" --out "${ICON_DIR}/32x32.png" >/dev/null
sips -z 128 128 "${SOURCE_PNG}" --out "${ICON_DIR}/128x128.png" >/dev/null
sips -z 256 256 "${SOURCE_PNG}" --out "${ICON_DIR}/128x128@2x.png" >/dev/null

sips -z 16 16 "${SOURCE_PNG}" --out "${ICONSET_DIR}/icon_16x16.png" >/dev/null
sips -z 32 32 "${SOURCE_PNG}" --out "${ICONSET_DIR}/icon_16x16@2x.png" >/dev/null
sips -z 32 32 "${SOURCE_PNG}" --out "${ICONSET_DIR}/icon_32x32.png" >/dev/null
sips -z 64 64 "${SOURCE_PNG}" --out "${ICONSET_DIR}/icon_32x32@2x.png" >/dev/null
sips -z 128 128 "${SOURCE_PNG}" --out "${ICONSET_DIR}/icon_128x128.png" >/dev/null
sips -z 256 256 "${SOURCE_PNG}" --out "${ICONSET_DIR}/icon_128x128@2x.png" >/dev/null
sips -z 256 256 "${SOURCE_PNG}" --out "${ICONSET_DIR}/icon_256x256.png" >/dev/null
sips -z 512 512 "${SOURCE_PNG}" --out "${ICONSET_DIR}/icon_256x256@2x.png" >/dev/null
sips -z 512 512 "${SOURCE_PNG}" --out "${ICONSET_DIR}/icon_512x512.png" >/dev/null
sips -z 1024 1024 "${SOURCE_PNG}" --out "${ICONSET_DIR}/icon_512x512@2x.png" >/dev/null

python3 - <<'PY' "${ICON_DIR}" "${ICONSET_DIR}"
from pathlib import Path
import sys
from PIL import Image

icon_dir = Path(sys.argv[1])
iconset_dir = Path(sys.argv[2])

pngs = [
    icon_dir / "32x32.png",
    icon_dir / "128x128.png",
    icon_dir / "128x128@2x.png",
    *sorted(iconset_dir.glob("*.png")),
]

for path in pngs:
    image = Image.open(path).convert("RGBA")
    image.save(path, format="PNG")
PY

iconutil -c icns "${ICONSET_DIR}" -o "${ICON_DIR}/icon.icns"

python3 - <<'PY' "${SOURCE_PNG}" "${ICON_DIR}/icon.ico"
from pathlib import Path
import sys
from PIL import Image

src = Path(sys.argv[1])
dst = Path(sys.argv[2])
image = Image.open(src).convert("RGBA")
image.save(dst, format="ICO", sizes=[(16, 16), (32, 32), (64, 64), (128, 128), (256, 256)])
PY

rm -rf "${ICONSET_DIR}"

echo "Exported TeamForge Tauri icons from ${SOURCE_PNG}"
echo "Updated: ${ICON_DIR}/32x32.png"
echo "Updated: ${ICON_DIR}/128x128.png"
echo "Updated: ${ICON_DIR}/128x128@2x.png"
echo "Updated: ${ICON_DIR}/icon.icns"
echo "Updated: ${ICON_DIR}/icon.ico"
