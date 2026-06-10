#!/bin/bash
# Phase 2 Wave 3: 16 gh issue create commands
# Singleton Paperclip constraint applied everywhere.
# Paperclip = single shared instance (one port-based runtime) serving multiple orgs in the Thoughtseed ecosystem.
# TeamForge is operator surface only (bridge B). No per-org instances, no Tauri sidecar conversion.
# Run after the Phase 1 batch. Use the same milestone.

set -euo pipefail

MILESTONE="v0.3 UX & Ecosystem Intelligence Overhaul (Vault-first + Organizational Flow + Singleton Paperclip)"

echo "Creating Phase 2 Wave 3 issues (16 tasks) for $MILESTONE ..."

# T-2P2-W3-001
gh issue create \
  --title "T-2P2-W3-001 | Top-bar persistent bridge health strip (4 bridges + embedding freshness; Paperclip marked singleton)" \
  --body '**Task ID:** T-2P2-W3-001
**Phase:** 2
**Wave:** 3
**Swarm:** bridge-visibility
**Area:** frontend
**Primary owner agent:** copilot
**Owner role:** copilot
**Est Hours:** 2
**Dependencies:** ["T-005","T-019","T-023"]

### Deliverable
Persistent top-bar strip showing health/status for Vault, singleton Paperclip, TeamForge/Cloudflare, Hermes + embedding freshness indicators.

### Acceptance
Strip always visible, accurate, updates live. Paperclip explicitly labeled "singleton shared instance (one port for all orgs)".

### Validation
Screenshots in light/dark, manual status changes, reduced-motion compliant.

### Dependencies
Load: `creative-frontend-orchestrator`, `design-system`, `tauri-core`.

### Execution Envelope
Worktree: p2-w3-bridge-visibility/T-2P2-W3-001
**Singleton Paperclip constraint:** Must surface "one shared instance for the entire Thoughtseed ecosystem".

### Completion Protocol
Screenshots + logs + note that constraint is visible in UI.' \
  --label "phase:p2,wave:w3,swarm:bridge-visibility,area:frontend,owner:copilot,bridge:paperclip,vault,cloudflare,hermes" \
  --milestone "$MILESTONE"

# T-2P2-W3-002
gh issue create \
  --title "T-2P2-W3-002 | Bridge detail drawer (singleton Paperclip status + actions)" \
  --body '**Task ID:** T-2P2-W3-002
**Phase:** 2
**Wave:** 3
**Swarm:** bridge-visibility
**Area:** frontend
**Primary owner agent:** copilot
**Owner role:** copilot
**Est Hours:** 2.5
**Dependencies:** ["T-2P2-W3-001"]

### Deliverable
Clickable drawer for each bridge. For Paperclip: status, last sync, errors, quick actions (start/status/health/stop on the singleton), with explicit "shared across all orgs" note.

### Acceptance
Drawer opens from strip, shows accurate data for the one singleton Paperclip instance, actions work without regression.

### Validation
Screenshots, action tests, multiple-org context visible.

### Dependencies
Load: `creative-frontend-orchestrator`, tauri clusters.

### Execution Envelope
Worktree: p2-w3-bridge-visibility/T-2P2-W3-002
**Hard constraint:** Paperclip drawer must never imply per-org instances.

### Completion Protocol
Evidence + constraint note in comments.' \
  --label "phase:p2,wave:w3,swarm:bridge-visibility,area:frontend,owner:copilot,bridge:paperclip" \
  --milestone "$MILESTONE"

# T-2P2-W3-003
gh issue create \
  --title "T-2P2-W3-003 | Vault Intelligence rail extended with freshness + ownership badges (embeddings)" \
  --body '**Task ID:** T-2P2-W3-003
**Phase:** 2
**Wave:** 3
**Swarm:** organizational-flow
**Area:** frontend
**Primary owner agent:** codex
**Owner role:** codex
**Est Hours:** 2
**Dependencies:** ["T-018","T-021"]

### Deliverable
Extend the Vault Intelligence rail (from Phase 2 Wave 2) with embedding freshness timestamps and ownership badges across Overview and other surfaces.

### Acceptance
Rail shows semantic matches + freshness + badges. Consistent with T-004 contract.

### Validation
Screenshots, interaction tests.

### Dependencies
Load: `creative-frontend-orchestrator`, `design-system`.

### Execution Envelope
Worktree: p2-w3-organizational-flow/T-2P2-W3-003

### Completion Protocol
Evidence.' \
  --label "phase:p2,wave:w3,swarm:organizational-flow,area:frontend,owner:codex,bridge:vault" \
  --milestone "$MILESTONE"

# T-2P2-W3-004
gh issue create \
  --title "T-2P2-W3-004 | Paperclip approvals rail from the singleton instance (shared across orgs)" \
  --body '**Task ID:** T-2P2-W3-004
**Phase:** 2
**Wave:** 3
**Swarm:** bridge-visibility
**Area:** frontend
**Primary owner agent:** codex
**Owner role:** codex
**Est Hours:** 2
**Dependencies:** ["T-2P2-W3-002"]

### Deliverable
Approvals rail pulling from the single shared Paperclip instance (bridge B). Clearly labeled "singleton shared across all orgs".

### Acceptance
Real approvals from the one running instance appear correctly in Overview + Inbox.

### Validation
Test with actual singleton Paperclip data + screenshots.

### Dependencies
Load: `creative-frontend-orchestrator`.

### Execution Envelope
Worktree: p2-w3-bridge-visibility/T-2P2-W3-004
**Constraint:** Explicitly document and display that this is the one instance for the whole ecosystem.

### Completion Protocol
Evidence + constraint callout.' \
  --label "phase:p2,wave:w3,swarm:bridge-visibility,area:frontend,owner:codex,bridge:paperclip" \
  --milestone "$MILESTONE"

# T-2P2-W3-005
gh issue create \
  --title "T-2P2-W3-005 | Hermes critical items rail (ranked by vault embeddings)" \
  --body '**Task ID:** T-2P2-W3-005
**Phase:** 2
**Wave:** 3
**Swarm:** organizational-flow
**Area:** frontend
**Primary owner agent:** copilot
**Owner role:** copilot
**Est Hours:** 1.5
**Dependencies:** ["T-009","T-2P2-W3-003"]

### Deliverable
Hermes (bridge D) critical items rail, relevance-ranked using vault embeddings.

### Acceptance
High-signal items surface with embedding scores.

### Validation
Test + screenshots.

### Dependencies
Load relevant clusters.

### Execution Envelope
Worktree: p2-w3-organizational-flow/T-2P2-W3-005

### Completion Protocol
Evidence.' \
  --label "phase:p2,wave:w3,swarm:organizational-flow,area:frontend,owner:copilot,bridge:hermes,vault" \
  --milestone "$MILESTONE"

# T-2P2-W3-006
gh issue create \
  --title "T-2P2-W3-006 | Cloudflare Worker health + last-deploy surface (bridge C)" \
  --body '**Task ID:** T-2P2-W3-006
**Phase:** 2
**Wave:** 3
**Swarm:** bridge-visibility
**Area:** frontend
**Primary owner agent:** copilot
**Owner role:** copilot
**Est Hours:** 1.5
**Dependencies:** ["T-005"]

### Deliverable
Surface for Cloudflare Worker (TeamForge API) health and last deploy info.

### Acceptance
Accurate deploy time + health visible.

### Validation
Test against real worker.

### Dependencies
Load tauri + web clusters.

### Execution Envelope
Worktree: p2-w3-bridge-visibility/T-2P2-W3-006

### Completion Protocol
Evidence.' \
  --label "phase:p2,wave:w3,swarm:bridge-visibility,area:frontend,owner:copilot,bridge:cloudflare" \
  --milestone "$MILESTONE"

# T-2P2-W3-007
gh issue create \
  --title "T-2P2-W3-007 | \"Test All Bridges\" action wired to singleton Paperclip + full contract suite" \
  --body '**Task ID:** T-2P2-W3-007
**Phase:** 2
**Wave:** 3
**Swarm:** bridge-visibility
**Area:** frontend
**Primary owner agent:** copilot
**Owner role:** copilot
**Est Hours:** 2
**Dependencies:** ["T-023","T-2P2-W3-001"]

### Deliverable
Extend the Settings "Test All Bridges" (T-023) into a reusable action that confirms the singleton Paperclip is healthy along with other bridges.

### Acceptance
Action runs full suite, surfaces "singleton shared instance" status clearly.

### Validation
Full test run + screenshots.

### Dependencies
Load tauri + verification clusters.

### Execution Envelope
Worktree: p2-w3-bridge-visibility/T-2P2-W3-007
**Constraint:** Result must state "Paperclip: singleton shared instance for whole ecosystem - healthy".

### Completion Protocol
Evidence + constraint verification.' \
  --label "phase:p2,wave:w3,swarm:bridge-visibility,area:frontend,owner:copilot,bridge:paperclip,vault,cloudflare,hermes" \
  --milestone "$MILESTONE"

# T-2P2-W3-008
gh issue create \
  --title "T-2P2-W3-008 | Global shortcut to open bridge health drawer" \
  --body '**Task ID:** T-2P2-W3-008
**Phase:** 2
**Wave:** 3
**Swarm:** tauri-primitives
**Area:** backend
**Primary owner agent:** copilot
**Owner role:** copilot
**Est Hours:** 1
**Dependencies:** ["T-011","T-2P2-W3-002"]

### Deliverable
Global shortcut that directly opens the bridge health drawer (with singleton Paperclip status).

### Acceptance
Shortcut works from anywhere, drawer opens with correct data.

### Validation
Shortcut test + screenshot.

### Dependencies
Load tauri global shortcut clusters.

### Execution Envelope
Worktree: p2-w3-tauri-primitives/T-2P2-W3-008

### Completion Protocol
Evidence.' \
  --label "phase:p2,wave:w3,swarm:tauri-primitives,area:backend,owner:copilot,bridge:paperclip" \
  --milestone "$MILESTONE"

# T-2P2-W3-009
gh issue create \
  --title "T-2P2-W3-009 | Native notification on bridge degradation (singleton Paperclip language)" \
  --body '**Task ID:** T-2P2-W3-009
**Phase:** 2
**Wave:** 3
**Swarm:** unified-notifications
**Area:** backend
**Primary owner agent:** copilot
**Owner role:** copilot
**Est Hours:** 1.5
**Dependencies:** ["T-009","T-2P2-W3-007"]

### Deliverable
Notifications for bridge degradation, using correct singleton language for Paperclip.

### Acceptance
Notification fires on simulated degradation and uses "singleton shared instance" phrasing.

### Validation
Notification test + log.

### Dependencies
Load unified-notifications clusters.

### Execution Envelope
Worktree: p2-w3-unified-notifications/T-2P2-W3-009

### Completion Protocol
Evidence + phrasing check.' \
  --label "phase:p2,wave:w3,swarm:unified-notifications,area:backend,owner:copilot,bridge:paperclip" \
  --milestone "$MILESTONE"

# T-2P2-W3-010
gh issue create \
  --title "T-2P2-W3-010 | Dynamic tray with per-bridge status (Paperclip = \"singleton shared\")" \
  --body '**Task ID:** T-2P2-W3-010
**Phase:** 2
**Wave:** 3
**Swarm:** tauri-primitives
**Area:** backend
**Primary owner agent:** copilot
**Owner role:** copilot
**Est Hours:** 2
**Dependencies:** ["T-008","T-2P2-W3-001"]

### Deliverable
Extend dynamic tray to show per-bridge status, with Paperclip explicitly "singleton shared instance".

### Acceptance
Tray menu reflects live singleton status + top vault items.

### Validation
Tray screenshots + interaction.

### Dependencies
Load tauri tray clusters.

### Execution Envelope
Worktree: p2-w3-tauri-primitives/T-2P2-W3-010
**Constraint:** Tray text must use the exact singleton phrasing.

### Completion Protocol
Evidence + constraint check.' \
  --label "phase:p2,wave:w3,swarm:tauri-primitives,area:backend,owner:copilot,bridge:paperclip,vault" \
  --milestone "$MILESTONE"

# T-2P2-W3-011
gh issue create \
  --title "T-2P2-W3-011 | Settings bridge configuration + embedding model selector (singleton Paperclip section)" \
  --body '**Task ID:** T-2P2-W3-011
**Phase:** 2
**Wave:** 3
**Swarm:** organizational-flow
**Area:** frontend
**Primary owner agent:** codex
**Owner role:** codex
**Est Hours:** 2
**Dependencies:** ["T-023","T-2P2-W3-007"]

### Deliverable
Settings section for all bridges + embedding model choice. Dedicated callout for the singleton Paperclip configuration.

### Acceptance
UI allows re-auth/test per bridge and shows the one-instance model clearly.

### Validation
Screenshots + config change test.

### Dependencies
Load creative-frontend-orchestrator + tauri.

### Execution Envelope
Worktree: p2-w3-organizational-flow/T-2P2-W3-011

### Completion Protocol
Evidence.' \
  --label "phase:p2,wave:w3,swarm:organizational-flow,area:frontend,owner:codex,bridge:paperclip,vault,cloudflare,hermes" \
  --milestone "$MILESTONE"

# T-2P2-W3-012
gh issue create \
  --title "T-2P2-W3-012 | Command palette bridge commands + vault search (singleton status visible)" \
  --body '**Task ID:** T-2P2-W3-012
**Phase:** 2
**Wave:** 3
**Swarm:** organizational-flow
**Area:** frontend
**Primary owner agent:** codex
**Owner role:** codex
**Est Hours:** 2
**Dependencies:** ["T-020","T-2P2-W3-007"]

### Deliverable
Command palette entries for "bridge: status", "bridge: test", "vault: search". Results for Paperclip must display singleton shared status.

### Acceptance
Commands work, singleton phrasing appears in results.

### Validation
Palette test + screenshot.

### Dependencies
Load creative-frontend-orchestrator.

### Execution Envelope
Worktree: p2-w3-organizational-flow/T-2P2-W3-012

### Completion Protocol
Evidence.' \
  --label "phase:p2,wave:w3,swarm:organizational-flow,area:frontend,owner:codex,bridge:paperclip,vault" \
  --milestone "$MILESTONE"

# T-2P2-W3-013
gh issue create \
  --title "T-2P2-W3-013 | Before/after screenshot validation for bridge surfaces (reduced-motion)" \
  --body '**Task ID:** T-2P2-W3-013
**Phase:** 2
**Wave:** 3
**Swarm:** verification
**Area:** frontend
**Primary owner agent:** codex
**Owner role:** codex
**Est Hours:** 1.5
**Dependencies:** ["T-2P2-W3-001","T-2P2-W3-002","T-2P2-W3-010"]

### Deliverable
Before/after screenshots for all new bridge UI surfaces. Must pass reduced-motion + perf checks.

### Acceptance
Screenshots committed, motion preferences respected.

### Validation
Review against creative-frontend-orchestrator guidelines.

### Dependencies
Load `creative-frontend-orchestrator`, `web-perf`.

### Execution Envelope
Worktree: p2-w3-verification/T-2P2-W3-013

### Completion Protocol
Screenshots + accessibility notes.' \
  --label "phase:p2,wave:w3,swarm:verification,area:frontend,owner:codex" \
  --milestone "$MILESTONE"

# T-2P2-W3-014
gh issue create \
  --title "T-2P2-W3-014 | Performance budget check on new bridge UI elements" \
  --body '**Task ID:** T-2P2-W3-014
**Phase:** 2
**Wave:** 3
**Swarm:** verification
**Area:** frontend
**Primary owner agent:** codex
**Owner role:** codex
**Est Hours:** 1
**Dependencies:** ["T-2P2-W3-013"]

### Deliverable
Run web-perf audit on the new bridge strip, drawer, tray, etc. Fix any budget violations.

### Acceptance
All new elements under defined performance budget (LCP, etc.).

### Validation
Perf report + before/after metrics.

### Dependencies
Load `web-perf`.

### Execution Envelope
Worktree: p2-w3-verification/T-2P2-W3-014

### Completion Protocol
Perf report.' \
  --label "phase:p2,wave:w3,swarm:verification,area:frontend,owner:codex" \
  --milestone "$MILESTONE"

# T-2P2-W3-015
gh issue create \
  --title "T-2P2-W3-015 | Wave 3 validation gate (bridges visible + singleton Paperclip model verified)" \
  --body '**Task ID:** T-2P2-W3-015
**Phase:** 2
**Wave:** 3
**Swarm:** verification
**Area:** ops
**Primary owner agent:** copilot
**Owner role:** copilot
**Est Hours:** 2
**Dependencies:** ["T-2P2-W3-007","T-2P2-W3-013","T-2P2-W3-014"]

### Deliverable
Full Wave 3 gate: all bridges visible/actionable, CLAUDE.md ownership respected, singleton Paperclip architecture explicitly verified in UI and code.

### Acceptance
Gate passes with evidence bundle including singleton confirmation.

### Validation
Gate report + all prior evidence.

### Dependencies
Load `verification-gates`.

### Execution Envelope
Worktree: p2-w3-verification/T-2P2-W3-015

### Completion Protocol
Gate report + bundle with constraint proof.' \
  --label "phase:p2,wave:w3,swarm:verification,area:ops,owner:copilot" \
  --milestone "$MILESTONE"

# T-2P2-W3-016
gh issue create \
  --title "T-2P2-W3-016 | Wave 3 memory capture + handoff to Phase 3 (record singleton Paperclip architecture)" \
  --body '**Task ID:** T-2P2-W3-016
**Phase:** 2
**Wave:** 3
**Swarm:** memory
**Area:** ops
**Primary owner agent:** codex
**Owner role:** codex
**Est Hours:** 1.5
**Dependencies:** ["T-2P2-W3-015"]

### Deliverable
Memory capture of Wave 3 + handoff packet for Phase 3. Must record the singleton Paperclip decision as permanent architecture.

### Acceptance
Capture committed, handoff packet includes the constraint and why it was chosen.

### Validation
Capture reviewed.

### Dependencies
Load memory-capture playbook.

### Execution Envelope
Worktree: p2-w3-memory/T-2P2-W3-016

### Completion Protocol
Capture + packet + explicit architecture record.' \
  --label "phase:p2,wave:w3,swarm:memory,area:ops,owner:codex" \
  --milestone "$MILESTONE"

echo "Phase 2 Wave 3 16 issues created with singleton Paperclip constraint applied."
echo "Next: Run T-001 if not done, then proceed to these when dependencies clear."
