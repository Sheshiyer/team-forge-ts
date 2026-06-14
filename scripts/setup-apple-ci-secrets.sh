#!/usr/bin/env bash
#
# TeamForge — GitHub Actions release secrets setup / rotation
#
# Populates the seven secrets the release pipeline (.github/workflows/release.yml)
# requires for signed + notarized DMG builds and OTA updater bundles.
#
#   1. APPLE_TEAM_ID                          (identifier — Developer ID team)
#   2. APPLE_SIGNING_IDENTITY                 (identifier — cert subject string)
#   3. APPLE_CERTIFICATE                      (base64 of Developer ID .p12)
#   4. APPLE_CERTIFICATE_PASSWORD             (.p12 export password)
#   5. APPLE_ID                               (Apple developer-account email)
#   6. APPLE_PASSWORD                         (app-specific notarization pw)
#   7. TAURI_SIGNING_PRIVATE_KEY_PASSWORD     (minisign key pw — usually empty)
#
# Rotation cadence:
#   - APPLE_CERTIFICATE: every ~5 years (Developer ID Application cert expiry)
#   - APPLE_PASSWORD:    on any Apple ID password change, or every 6-12 months
#   - APPLE_ID:          rarely (only if account email changes)
#   - Others:            only when the underlying secret actually rotates
#
# Press ENTER at any prompt to SKIP that secret (useful for single-cred rotation).
#
# Values are piped to `gh secret set` via stdin — no shell history, no `ps`-visible
# args, no echoing to stdout. Passwords use silent `read -rs`.

set -euo pipefail
set +x

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# --- Preconditions ---
if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: gh CLI not found. Install: brew install gh" >&2
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: gh not authenticated. Run: gh auth login" >&2
  exit 1
fi

REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
USER="$(gh api user --jq .login)"

echo "================================================================"
echo "  TeamForge release secrets — setup / rotation"
echo "================================================================"
echo "  Repo: ${REPO}"
echo "  User: ${USER}"
echo ""
echo "  ENTER on any prompt to skip that secret."
echo "----------------------------------------------------------------"

skipped=0
set_count=0

set_secret() {
  local name="$1" value="$2"
  if printf '%s' "$value" | gh secret set "$name" >/dev/null 2>&1; then
    echo "   ✓ ${name} set"
    set_count=$((set_count + 1))
  else
    echo "   ✗ ${name} FAILED" >&2
    return 1
  fi
}

skip() {
  echo "   - $1 skipped"
  skipped=$((skipped + 1))
}

# 1. APPLE_TEAM_ID
echo ""
echo "1/7  APPLE_TEAM_ID"
echo "     10-char Apple Developer team ID (e.g., BS6SZR4929)."
read -rp "     Value (ENTER to skip): " VAL
if [ -n "$VAL" ]; then set_secret APPLE_TEAM_ID "$VAL"; else skip APPLE_TEAM_ID; fi

# 2. APPLE_SIGNING_IDENTITY
echo ""
echo "2/7  APPLE_SIGNING_IDENTITY"
echo "     Full cert subject — e.g.: Developer ID Application: Thoughtseed Private Limited (BS6SZR4929)"
echo "     Find with: security find-identity -v -p codesigning | grep 'Developer ID Application'"
read -rp "     Value (ENTER to skip): " VAL
if [ -n "$VAL" ]; then set_secret APPLE_SIGNING_IDENTITY "$VAL"; else skip APPLE_SIGNING_IDENTITY; fi

# 3. APPLE_CERTIFICATE
echo ""
echo "3/7  APPLE_CERTIFICATE"
echo "     Path to the Developer ID Application .p12 file exported from Keychain Access."
echo "     (Keychain Access → My Certificates → right-click cert → Export → .p12)"
read -rp "     Path to .p12 (ENTER to skip): " P12_PATH
if [ -n "$P12_PATH" ]; then
  P12_PATH="${P12_PATH/#\~/$HOME}"
  if [ ! -f "$P12_PATH" ]; then
    echo "   ✗ File not found: $P12_PATH" >&2
    exit 1
  fi
  base64 -i "$P12_PATH" | gh secret set APPLE_CERTIFICATE >/dev/null 2>&1 \
    && { echo "   ✓ APPLE_CERTIFICATE set"; set_count=$((set_count + 1)); } \
    || { echo "   ✗ APPLE_CERTIFICATE FAILED" >&2; exit 1; }
  echo "   ℹ  Delete the .p12 after this script finishes: rm '$P12_PATH'"
else
  skip APPLE_CERTIFICATE
fi

# 4. APPLE_CERTIFICATE_PASSWORD
echo ""
echo "4/7  APPLE_CERTIFICATE_PASSWORD"
echo "     The password set when exporting the .p12."
read -rsp "     Password (ENTER to skip): " VAL; echo
if [ -n "$VAL" ]; then set_secret APPLE_CERTIFICATE_PASSWORD "$VAL"; else skip APPLE_CERTIFICATE_PASSWORD; fi
unset VAL

# 5. APPLE_ID
echo ""
echo "5/7  APPLE_ID"
echo "     Apple developer-account email."
read -rp "     Email (ENTER to skip): " VAL
if [ -n "$VAL" ]; then set_secret APPLE_ID "$VAL"; else skip APPLE_ID; fi

# 6. APPLE_PASSWORD
echo ""
echo "6/7  APPLE_PASSWORD"
echo "     App-specific password from appleid.apple.com (format: xxxx-xxxx-xxxx-xxxx)."
echo "     NOT your Apple account password. Generate: Sign-In & Security → App-Specific Passwords"
read -rsp "     Password (ENTER to skip): " VAL; echo
if [ -n "$VAL" ]; then set_secret APPLE_PASSWORD "$VAL"; else skip APPLE_PASSWORD; fi
unset VAL

# 7. TAURI_SIGNING_PRIVATE_KEY_PASSWORD
echo ""
echo "7/7  TAURI_SIGNING_PRIVATE_KEY_PASSWORD"
echo "     Password for the Tauri updater minisign private key."
echo "     Test if your key needs one:"
echo "       echo test > /tmp/t && TAURI_SIGNING_PRIVATE_KEY_PASSWORD='' \\"
echo "         pnpm exec tauri signer sign --private-key-path ~/.tauri/<your-key> /tmp/t"
echo "     If that succeeds, the key has no password — type 'empty' below."
read -rsp "     Password ('empty' for none, ENTER to skip): " VAL; echo
if [ "$VAL" = "empty" ]; then
  printf '' | gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD >/dev/null 2>&1 \
    && { echo "   ✓ TAURI_SIGNING_PRIVATE_KEY_PASSWORD set (empty)"; set_count=$((set_count + 1)); } \
    || { echo "   ✗ FAILED" >&2; exit 1; }
elif [ -n "$VAL" ]; then
  set_secret TAURI_SIGNING_PRIVATE_KEY_PASSWORD "$VAL"
else
  skip TAURI_SIGNING_PRIVATE_KEY_PASSWORD
fi
unset VAL

# --- Summary ---
echo ""
echo "================================================================"
echo "  Set: ${set_count} · Skipped: ${skipped}"
echo "----------------------------------------------------------------"
gh secret list | grep -E "^(APPLE_|TAURI_|CLOUDFLARE_|TF_)" || true
echo "================================================================"
echo ""
echo "  Test the pipeline:"
echo "    gh workflow run 'Build & Release' --ref main && gh run watch"
echo ""
echo "  Or push a release tag:"
echo "    git tag v0.X.Y && git push origin v0.X.Y"
echo "================================================================"
