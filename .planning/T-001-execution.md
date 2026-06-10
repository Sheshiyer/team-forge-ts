# T-001 Execution: Exact File Edits + Verification Commands (Safe Worktree Flow)

## Pre-flight (run these first, outside the worktree if possible)
git fetch origin
git worktree add -b p1-w1-tauri-security/T-001 ../team-forge-ts-T-001
cd ../team-forge-ts-T-001
# Load clusters in your context (creative-frontend-orchestrator not needed for pure backend T-001; focus on tauri ones)
# Read CLAUDE.md, the launch script, and this file.

## Current live state (from audit on 2026-06-08)
# capabilities/default.json (14 lines):
# {
#   "identifier": "default",
#   "description": "Default capability for the main window",
#   "windows": ["main"],
#   "permissions": [
#     "core:default",
#     "dialog:default",
#     "shell:allow-execute",
#     "shell:allow-open",
#     "notification:default",
#     "process:default",
#     "updater:default"
#   ]
# }

# tauri.conf.json has local-only CSP + bundle.resources for the two scripts.
# Paperclip launch goes through scripts/launch-thoughtseed-paperclip.sh (singleton babysitter + adapter on fixed port).
# Hard constraint: ONE Paperclip instance for all orgs. Preserve launch script behavior exactly.

## Exact proposed edit for capabilities/default.json (T-001 deliverable)
# Replace the entire permissions array with a narrow set + a new scoped capability reference.
# We will create ONE new narrow capability file for the singleton Paperclip launch.

# Step 1: Create the narrow capability file (new file)
# Target path in worktree: src-tauri/capabilities/paperclip-singleton.json

cat > src-tauri/capabilities/paperclip-singleton.json << 'EOF'
{
  "identifier": "paperclip-singleton",
  "description": "Narrow capability for the singleton shared Paperclip instance (one instance for the entire Thoughtseed ecosystem, multiple orgs inside it). Only allows the known launch script with discrete actions. No per-org or sidecar conversion.",
  "windows": ["main"],
  "permissions": [
    "shell:allow-execute",
    {
      "identifier": "shell:execute",
      "allow": [
        {
          "name": "launch-thoughtseed-paperclip",
          "cmd": "$HOME/.config/teamforge/scripts/launch-thoughtseed-paperclip.sh",
          "args": ["start", "status", "health", "stop"]
        }
      ]
    }
  ]
}
EOF

# Note: The exact cmd path may need adjustment for packaged bundle (use the resource path or a small wrapper command). For T-001 we start with the narrowest possible allowlist on the known script. Adjust in T-002 if needed.

# Step 2: Edit src-tauri/capabilities/default.json (use precise replace)
# Old permissions block (exact string):
OLD_PERMS='  "permissions": [
    "core:default",
    "dialog:default",
    "shell:allow-execute",
    "shell:allow-open",
    "notification:default",
    "process:default",
    "updater:default"
  ]'

# New permissions block (narrowed, references the singleton capability):
NEW_PERMS='  "permissions": [
    "core:default",
    "dialog:default",
    "notification:default",
    "process:default",
    "updater:default",
    "paperclip-singleton"
  ]'

# Apply the edit (you can use sed or your editor; example with sed for reproducibility):
sed -i '' "s|$OLD_PERMS|$NEW_PERMS|" src-tauri/capabilities/default.json

# Also remove the now-unnecessary broad shell plugin config if present in tauri.conf.json (T-001 may leave it; tighten in T-002 if it becomes dead).
# For T-001 we only touch capabilities/default.json + the new narrow file.

## Verification commands (run in the worktree, capture all output)
cd src-tauri

echo "=== BEFORE (should show broad shell) ===" > /tmp/T001-evidence.txt
tauri capability list >> /tmp/T001-evidence.txt 2>&1 || true

echo "=== cargo check ===" >> /tmp/T001-evidence.txt
cargo check 2>&1 | tee -a /tmp/T001-evidence.txt

echo "=== AFTER capability list (narrow only) ===" >> /tmp/T001-evidence.txt
tauri capability list >> /tmp/T001-evidence.txt 2>&1 || true

# Test the launch script still works for the singleton (from the app or directly)
echo "=== Paperclip singleton launch test (start/status/health/stop) ===" >> /tmp/T001-evidence.txt
bash ../scripts/launch-thoughtseed-paperclip.sh status >> /tmp/T001-evidence.txt 2>&1 || true
# (Do the full start/stop cycle only if safe in your env; capture PID reuse to prove singleton)

echo "=== Diff of changes ===" >> /tmp/T001-evidence.txt
git diff --no-color >> /tmp/T001-evidence.txt

echo "=== Screenshots note ===" >> /tmp/T001-evidence.txt
echo "Take screenshots of: capability list before/after, app launch with Paperclip control, packaged build test (if done)." >> /tmp/T001-evidence.txt

cat /tmp/T001-evidence.txt

# Final evidence bundle location: copy /tmp/T001-evidence.txt to the issue comment or .planning/T001-evidence-$(date +%s).txt

## Completion checklist (only mark T-001 complete when all are true)
# [ ] capability list shows no blanket shell:allow-execute / allow-open
# [ ] cargo check clean
# [ ] Paperclip launch script (the singleton) still functions exactly as before (babysitter PID reuse, one instance for multiple orgs)
# [ ] Evidence file contains before/after, diff, logs, and note "singleton Paperclip model preserved — no sidecar or per-org change"
# [ ] Screenshots attached
# [ ] Comment posted on the GitHub issue for T-001 with the evidence
# [ ] Handoff note for T-002 (narrow the actual script path in the capability if the bundle resource path differs)

## Rollback (if anything breaks)
git checkout -- src-tauri/capabilities/default.json
rm -f src-tauri/capabilities/paperclip-singleton.json
cargo check

## Next after T-001 complete
# cd back to main repo, create worktree for T-002, run its steps (will further tighten the paperclip-singleton.json allowlist based on actual bundle paths).
