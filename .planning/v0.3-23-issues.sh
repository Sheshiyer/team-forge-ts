#!/bin/bash
# Full 23-issue creation script for v0.3 UX & Ecosystem Intelligence Overhaul
# Generated per swarm-architect runbooks/plan-to-github.md + templates/github-issue-template.md
# Singleton Paperclip constraint applied everywhere: ONE shared Paperclip instance (port-based) for the entire Thoughtseed ecosystem. Multiple orgs are handled inside that single running instance. TeamForge is the operator surface (bridge B) — do NOT convert to Tauri sidecar or per-org model.
# Run after: gh auth login && gh repo set-default Sheshiyer/team-forge-ts
# Then: bash .planning/v0.3-23-issues.sh
# Milestone must exist first.

set -euo pipefail

MILESTONE="v0.3 UX & Ecosystem Intelligence Overhaul (Vault-first + Organizational Flow + Singleton Paperclip)"

echo "Creating issues for $MILESTONE ..."
echo "Constraint: Paperclip is a singleton shared service (one instance on a port serving multiple orgs)."

# T-001
gh issue create \
  --title "T-001 | Tauri capability audit and narrowing (shell, fs, dialog, notification, process, updater)" \
  --body '**Task ID:** T-001
**Phase:** 1
**Wave:** 1
**Swarm:** tauri-security
**Area:** backend
**Primary owner agent:** copilot
**Owner role:** copilot
**Est Hours:** 2
**Dependencies:** []

### Deliverable
Audit current `capabilities/default.json` (blanket "shell:allow-execute" + "shell:allow-open") and replace with minimal scoped permissions only.

### Acceptance
`tauri capability list` after changes shows no blanket shell execute/open. Only narrow permissions actually required.

### Validation
- `tauri capability list` (before/after)
- `cargo check`
- Manual test of Paperclip launch script (start/status/health/stop), vault-parity script, notifications, updater, dialog (dev + packaged)
- Full diff + screenshots

### Dependencies
Load these skill-clusters first: `configuring-tauri-capabilities`, `configuring-tauri-permissions`, `configuring-tauri-scopes`, `tauri-core`.

### Execution Envelope
- Branch/Worktree: `p1-w1-tauri-security/T-001` (one owner, one worktree)
- Lock-zone files: `src-tauri/capabilities/default.json`, `src-tauri/tauri.conf.json`
- Current live state: blanket permissions present. Scripts for Paperclip and vault parity are bundled as resources.
- **CRITICAL CONSTRAINT (singleton Paperclip):** Paperclip is a **single shared instance** running on a fixed port (e.g. 3101 + adapter). It serves **multiple organizations** in the Thoughtseed ecosystem. Do **not** treat as per-org or convert to Tauri sidecar. TeamForge communicates via the existing launch script + adapter (bridge B per CLAUDE.md). Preserve the babysitter/PID reuse logic.

### Completion Protocol
Comment with: summary, validation evidence (capability list + cargo check + test logs + diff + screenshots), linked PR, deviations, handoff to T-002. Note that the singleton Paperclip model was respected.' \
  --label "phase:p1,wave:w1,swarm:tauri-security,area:backend,owner:copilot,bridge:vault,paperclip" \
  --milestone "$MILESTONE"

# T-002
gh issue create \
  --title "T-002 | Narrow shell permission for the singleton Paperclip launch script + adapter only" \
  --body '**Task ID:** T-002
**Phase:** 1
**Wave:** 1
**Swarm:** tauri-security
**Area:** backend
**Primary owner agent:** copilot
**Owner role:** copilot
**Est Hours:** 2
**Dependencies:** ["T-001"]

### Deliverable
Replace broad shell:allow-execute/allow-open with a dedicated narrow capability (or scoped allowlist) that only permits the exact known Paperclip launch script (`scripts/launch-thoughtseed-paperclip.sh`) and its adapter, with allowed actions (start/status/health/stop) and known ports.

### Acceptance
TeamForge can still control the existing singleton Paperclip instance exactly as before, but no other arbitrary shell execution is possible from the main window.

### Validation
- `tauri capability list`
- Launch script still works for the shared singleton (multiple orgs via one instance, babysitter PID reuse preserved)
- Dev + packaged build test
- No regression in bridge B communication

### Dependencies
Load: `tauri-core`, `configuring-tauri-*` spokes.

### Execution Envelope
- Worktree: `p1-w1-tauri-security/T-002`
- Lock zones: capabilities + launch script + adapter
- **Hard constraint (singleton Paperclip):** ONE instance for the whole Thoughtseed ecosystem. Multiple orgs handled inside that one running Paperclip (per user clarification). Do not migrate to Tauri sidecar or per-org model. Reference CLAUDE.md bridge B.

### Completion Protocol
Same as T-001 + explicit note that the singleton model was respected with no sidecar conversion.' \
  --label "phase:p1,wave:w1,swarm:tauri-security,area:backend,owner:copilot,bridge:paperclip" \
  --milestone "$MILESTONE"

# T-003
gh issue create \
  --title "T-003 | Lock final CSP for vault, embeddings, Paperclip (singleton), Cloudflare, Hermes" \
  --body '**Task ID:** T-003
**Phase:** 1
**Wave:** 1
**Swarm:** tauri-security
**Area:** backend
**Primary owner agent:** copilot
**Owner role:** copilot
**Est Hours:** 1.5
**Dependencies:** ["T-001"]

### Deliverable
Tighten `tauri.conf.json` CSP to explicitly allow only the known local ports for the singleton Paperclip adapter, vault parity, Cloudflare Worker, and Hermes while keeping everything else locked.

### Acceptance
CSP allows exactly the required endpoints for the singleton Paperclip (one instance) + other bridges. No broad connect-src.

### Validation
CSP diff, manual bridge tests (Paperclip singleton confirmed), `cargo check`.

### Dependencies
Load `configuring-tauri-csp`, `tauri-core`.

### Execution Envelope
Worktree: p1-w1-tauri-security/T-003. Lock: tauri.conf.json.
**Singleton Paperclip note:** Only the one shared instance ports are allowed.

### Completion Protocol
Evidence + note singleton Paperclip constraint respected.' \
  --label "phase:p1,wave:w1,swarm:tauri-security,area:backend,owner:copilot,bridge:paperclip,cloudflare,hermes,vault" \
  --milestone "$MILESTONE"

# T-004
gh issue create \
  --title "T-004 | Define layered organizational model (Vault Intelligence → Registry/Mapping → Live Ops) + ownership badge contract" \
  --body '**Task ID:** T-004
**Phase:** 1
**Wave:** 1
**Swarm:** organizational-flow
**Area:** frontend
**Primary owner agent:** codex
**Owner role:** codex
**Est Hours:** 3
**Dependencies:** []

### Deliverable
Document the 3-layer model per CLAUDE.md (vault-first) and define reusable ownership badge contract (who owns the data surface).

### Acceptance
Clear contract + visual spec for badges that will be used across all surfaces.

### Validation
Reviewed doc + badge component skeleton.

### Dependencies
Load: `creative-frontend-orchestrator`, `design-system`, `design-core`.

### Execution Envelope
Worktree: p1-w1-organizational-flow/T-004. Reference CLAUDE.md explicitly.

### Completion Protocol
Doc + skeleton + evidence.' \
  --label "phase:p1,wave:w1,swarm:organizational-flow,area:frontend,owner:codex" \
  --milestone "$MILESTONE"

# T-005
gh issue create \
  --title "T-005 | Bridge health contract + events (4 bridges + vault embedding freshness) with singleton Paperclip" \
  --body '**Task ID:** T-005
**Phase:** 1
**Wave:** 1
**Swarm:** bridge-visibility
**Area:** backend
**Primary owner agent:** copilot
**Owner role:** copilot
**Est Hours:** 2
**Dependencies:** ["T-004"]

### Deliverable
Define health contract for all 4 bridges. Explicitly model Paperclip as singleton shared instance (one port, multiple orgs).

### Acceptance
Contract includes freshness for embeddings + singleton status for Paperclip.

### Validation
Contract reviewed + first event emission.

### Dependencies
Load relevant tauri + agentic-ops clusters.

### Execution Envelope
Worktree p1-w1-bridge-visibility/T-005.
**Singleton Paperclip constraint:** ONE instance for whole ecosystem.

### Completion Protocol
Contract + evidence. Note singleton model.' \
  --label "phase:p1,wave:w1,swarm:bridge-visibility,area:backend,owner:copilot,bridge:paperclip,vault,cloudflare,hermes" \
  --milestone "$MILESTONE"

# T-006
gh issue create \
  --title "T-006 | NVIDIA embedding pipeline for thoughtseed-labs vault (index + semantic search/similarity/clustering contract) — vault-first" \
  --body '**Task ID:** T-006
**Phase:** 1
**Wave:** 1
**Swarm:** vault-embeddings
**Area:** backend
**Primary owner agent:** gemini
**Owner role:** gemini
**Est Hours:** 4
**Dependencies:** []

### Deliverable
Build NVIDIA embedding index on thoughtseed-labs vault (high-value families first: project-brief.md, client-profile.md, onboarding, etc.). Define semantic contract.

### Acceptance
Index exists, basic semantic search/similarity works, contract defined.

### Validation
Index stats, sample queries, contract doc.

### Dependencies
Load embedding/vault clusters. Vault-first per user direction.

### Execution Envelope
Worktree: p1-w1-vault-embeddings/T-006. CLAUDE.md vault = documents only.

### Completion Protocol
Evidence + contract.' \
  --label "phase:p1,wave:w1,swarm:vault-embeddings,area:backend,owner:gemini,bridge:vault" \
  --milestone "$MILESTONE"

# T-007
gh issue create \
  --title "T-007 | Expose vault embeddings to TeamForge via narrow Tauri invoke surface + TS types" \
  --body '**Task ID:** T-007
**Phase:** 1
**Wave:** 1
**Swarm:** vault-embeddings
**Area:** backend
**Primary owner agent:** copilot
**Owner role:** copilot
**Est Hours:** 2
**Dependencies:** ["T-006"]

### Deliverable
Narrow Tauri command(s) that expose embedding search/similarity from the vault index to the frontend. TS types.

### Acceptance
Frontend can call the narrow surface and get results without broad permissions.

### Validation
Invoke test + type check.

### Dependencies
Load tauri-core.

### Execution Envelope
Worktree p1-w1-vault-embeddings/T-007. Lock narrow commands.

### Completion Protocol
Surface + types + evidence.' \
  --label "phase:p1,wave:w1,swarm:vault-embeddings,area:backend,owner:copilot,bridge:vault" \
  --milestone "$MILESTONE"

# T-008
gh issue create \
  --title "T-008 | Dynamic tray menu with vault intelligence + ecosystem signals (singleton Paperclip)" \
  --body '**Task ID:** T-008
**Phase:** 1
**Wave:** 1
**Swarm:** tauri-primitives
**Area:** backend
**Primary owner agent:** copilot
**Owner role:** copilot
**Est Hours:** 2
**Dependencies:** ["T-007"]

### Deliverable
First-cut dynamic tray showing vault semantic items + bridge signals. Paperclip shown as singleton.

### Acceptance
Tray reflects embeddings + singleton Paperclip status.

### Validation
Manual tray test + screenshots.

### Dependencies
Load tauri tray clusters.

### Execution Envelope
Worktree p1-w1-tauri-primitives/T-008.
**Singleton Paperclip:** one instance status only.

### Completion Protocol
Evidence + note constraint.' \
  --label "phase:p1,wave:w1,swarm:tauri-primitives,area:backend,owner:copilot,bridge:paperclip,vault" \
  --milestone "$MILESTONE"

# T-009
gh issue create \
  --title "T-009 | Native OS notifications for high-signal ecosystem events (leveraging embeddings for relevance, singleton Paperclip)" \
  --body '**Task ID:** T-009
**Phase:** 1
**Wave:** 1
**Swarm:** unified-notifications
**Area:** backend
**Primary owner agent:** copilot
**Owner role:** copilot
**Est Hours:** 2
**Dependencies:** ["T-005"]

### Deliverable
High-signal notifications powered by vault embeddings. Paperclip events from the singleton instance.

### Acceptance
Notifications fire for relevant events without spamming.

### Validation
Test notifications + embedding relevance.

### Dependencies
Load unified-notifications-ops.

### Execution Envelope
Worktree p1-w1-unified-notifications/T-009.
**Singleton Paperclip constraint applied.**

### Completion Protocol
Logs + screenshots + constraint note.' \
  --label "phase:p1,wave:w1,swarm:unified-notifications,area:backend,owner:copilot,bridge:paperclip,vault" \
  --milestone "$MILESTONE"

# T-010
gh issue create \
  --title "T-010 | Updater banner + progress dialog with ecosystem/bridge context (singleton Paperclip)" \
  --body '**Task ID:** T-010
**Phase:** 1
**Wave:** 1
**Swarm:** tauri-primitives
**Area:** backend
**Primary owner agent:** copilot
**Owner role:** copilot
**Est Hours:** 1.5
**Dependencies:** ["T-001"]

### Deliverable
Updater UX that surfaces bridge health (including singleton Paperclip) during updates.

### Acceptance
Banner shows context without breaking update flow.

### Validation
Update simulation + screenshots.

### Dependencies
Load tauri updater clusters.

### Execution Envelope
Worktree p1-w1-tauri-primitives/T-010.
**Singleton Paperclip note in UI.**

### Completion Protocol
Evidence + constraint note.' \
  --label "phase:p1,wave:w1,swarm:tauri-primitives,area:backend,owner:copilot,bridge:paperclip" \
  --milestone "$MILESTONE"

# T-011
gh issue create \
  --title "T-011 | Global shortcut + embedding-aware floating Quick Capture window skeleton" \
  --body '**Task ID:** T-011
**Phase:** 1
**Wave:** 1
**Swarm:** tauri-primitives
**Area:** backend
**Primary owner agent:** copilot
**Owner role:** copilot
**Est Hours:** 2
**Dependencies:** ["T-007"]

### Deliverable
Global shortcut opens floating capture that can use vault embeddings for suggestions.

### Acceptance
Shortcut works, skeleton window appears, basic embedding hook.

### Validation
Shortcut test + window screenshot.

### Dependencies
Load tauri global shortcut + creative-frontend-orchestrator.

### Execution Envelope
Worktree p1-w1-tauri-primitives/T-011.

### Completion Protocol
Evidence.' \
  --label "phase:p1,wave:w1,swarm:tauri-primitives,area:backend,owner:copilot" \
  --milestone "$MILESTONE"

# T-012
gh issue create \
  --title "T-012 | Phase 1 contracts + layered organizational model documentation (CLAUDE.md aligned, singleton Paperclip)" \
  --body '**Task ID:** T-012
**Phase:** 1
**Wave:** 1
**Swarm:** organizational-flow
**Area:** docs
**Primary owner agent:** codex
**Owner role:** codex
**Est Hours:** 2
**Dependencies:** ["T-004","T-005"]

### Deliverable
Phase 1 contract bundle + updated layered model doc explicitly calling out singleton Paperclip as the one shared instance for all orgs.

### Acceptance
Docs are reviewable and reference CLAUDE.md + singleton constraint.

### Validation
Docs reviewed.

### Dependencies
Load design + agentic clusters.

### Execution Envelope
Worktree p1-w1-organizational-flow/T-012.

### Completion Protocol
Docs committed + evidence.' \
  --label "phase:p1,wave:w1,swarm:organizational-flow,area:docs,owner:codex" \
  --milestone "$MILESTONE"

# T-013
gh issue create \
  --title "T-013 | GitHub milestone + label taxonomy + first issue batch creation (this batch, singleton Paperclip)" \
  --body '**Task ID:** T-013
**Phase:** 1
**Wave:** 1
**Swarm:** planning
**Area:** ops
**Primary owner agent:** copilot
**Owner role:** copilot
**Est Hours:** 1
**Dependencies:** []

### Deliverable
Milestone + labels created. This batch of 23 issues filed with singleton Paperclip constraint in every relevant body.

### Acceptance
All 23 issues exist with correct labels and the constraint text.

### Validation
gh issue list + labels.

### Dependencies
None.

### Execution Envelope
Worktree p1-w1-planning/T-013.

### Completion Protocol
Link to milestone + evidence.' \
  --label "phase:p1,wave:w1,swarm:planning,area:ops,owner:copilot" \
  --milestone "$MILESTONE"

# T-014
gh issue create \
  --title "T-014 | Wave 1 validation gate execution + evidence bundle" \
  --body '**Task ID:** T-014
**Phase:** 1
**Wave:** 1
**Swarm:** verification
**Area:** ops
**Primary owner agent:** copilot
**Owner role:** copilot
**Est Hours:** 2
**Dependencies:** ["T-001","T-002","T-003","T-007","T-012"]

### Deliverable
Run full Wave 1 validation gate. Collect evidence bundle. Confirm singleton Paperclip model preserved.

### Acceptance
All Wave 1 tasks have passing evidence. Gate report created.

### Validation
Gate report + all prior evidence.

### Dependencies
Load verification-gates.

### Execution Envelope
Worktree p1-w1-verification/T-014.

### Completion Protocol
Gate report + bundle.' \
  --label "phase:p1,wave:w1,swarm:verification,area:ops,owner:copilot" \
  --milestone "$MILESTONE"

# T-015
gh issue create \
  --title "T-015 | Phase 1 memory capture (OpenViking-ready) + wave-close handoff packet" \
  --body '**Task ID:** T-015
**Phase:** 1
**Wave:** 1
**Swarm:** memory
**Area:** ops
**Primary owner agent:** codex
**Owner role:** codex
**Est Hours:** 1.5
**Dependencies:** ["T-014"]

### Deliverable
Memory capture of Phase 1 (including singleton Paperclip decision) + handoff packet for Wave 2.

### Acceptance
Capture committed, handoff packet ready.

### Validation
Capture reviewed.

### Dependencies
Load memory-capture playbook.

### Execution Envelope
Worktree p1-w1-memory/T-015.

### Completion Protocol
Capture + packet + note on constraint.' \
  --label "phase:p1,wave:w1,swarm:memory,area:ops,owner:codex" \
  --milestone "$MILESTONE"

# T-016
gh issue create \
  --title "T-016 | Vault embedding index on high-value note families (project briefs, client profiles, onboarding flows per CLAUDE.md) — vault-first" \
  --body '**Task ID:** T-016
**Phase:** 1
**Wave:** 1
**Swarm:** vault-embeddings
**Area:** backend
**Primary owner agent:** gemini
**Owner role:** gemini
**Est Hours:** 3
**Dependencies:** ["T-006"]

### Deliverable
Embeddings indexed on the exact high-value families listed in CLAUDE.md. Singleton Paperclip not directly involved.

### Acceptance
Index covers the families, basic queries return sensible results.

### Validation
Index report + sample results.

### Dependencies
Load vault embedding tools.

### Execution Envelope
Worktree p1-w1-vault-embeddings/T-016. Vault = documents only.

### Completion Protocol
Report + evidence.' \
  --label "phase:p1,wave:w1,swarm:vault-embeddings,area:backend,owner:gemini,bridge:vault" \
  --milestone "$MILESTONE"

# T-017
gh issue create \
  --title "T-017 | Semantic search API contract + implementation for TeamForge consumption" \
  --body '**Task ID:** T-017
**Phase:** 1
**Wave:** 1
**Swarm:** vault-embeddings
**Area:** backend
**Primary owner agent:** copilot
**Owner role:** copilot
**Est Hours:** 2
**Dependencies:** ["T-007","T-016"]

### Deliverable
Contract + implementation of the narrow surface for semantic search.

### Acceptance
Contract + working narrow API.

### Validation
Contract review + integration test.

### Dependencies
Load tauri + vault clusters.

### Execution Envelope
Worktree p1-w1-vault-embeddings/T-017.

### Completion Protocol
Contract + test evidence.' \
  --label "phase:p1,wave:w1,swarm:vault-embeddings,area:backend,owner:copilot,bridge:vault" \
  --milestone "$MILESTONE"

# T-018
gh issue create \
  --title "T-018 | Reusable ownership badge component (LCARS style)" \
  --body '**Task ID:** T-018
**Phase:** 1
**Wave:** 1
**Swarm:** organizational-flow
**Area:** frontend
**Primary owner agent:** codex
**Owner role:** codex
**Est Hours:** 2
**Dependencies:** ["T-004"]

### Deliverable
Reusable ownership badge component per the contract from T-004.

### Acceptance
Component renders correctly with ownership data.

### Validation
Storybook or test render + screenshots.

### Dependencies
Load creative-frontend-orchestrator + design-system.

### Execution Envelope
Worktree p1-w1-organizational-flow/T-018.

### Completion Protocol
Component + evidence.' \
  --label "phase:p1,wave:w1,swarm:organizational-flow,area:frontend,owner:codex" \
  --milestone "$MILESTONE"

# T-019
gh issue create \
  --title "T-019 | Bridge health surface in top bar (singleton Paperclip status visible)" \
  --body '**Task ID:** T-019
**Phase:** 1
**Wave:** 1
**Swarm:** bridge-visibility
**Area:** frontend
**Primary owner agent:** copilot
**Owner role:** copilot
**Est Hours:** 2
**Dependencies:** ["T-005","T-018"]

### Deliverable
Top bar surface showing health for all 4 bridges, with Paperclip explicitly marked as singleton shared instance.

### Acceptance
UI shows accurate singleton status + other bridges.

### Validation
Screenshots + manual toggle test.

### Dependencies
Load creative-frontend-orchestrator.

### Execution Envelope
Worktree p1-w1-bridge-visibility/T-019.
**Singleton Paperclip constraint must be visible in the surface.**

### Completion Protocol
Screenshots + evidence + constraint note.' \
  --label "phase:p1,wave:w1,swarm:bridge-visibility,area:frontend,owner:copilot,bridge:paperclip,vault,cloudflare,hermes" \
  --milestone "$MILESTONE"

# T-020
gh issue create \
  --title "T-020 | Command palette extension skeleton for vault semantic search" \
  --body '**Task ID:** T-020
**Phase:** 1
**Wave:** 1
**Swarm:** organizational-flow
**Area:** frontend
**Primary owner agent:** codex
**Owner role:** codex
**Est Hours:** 2
**Dependencies:** ["T-007","T-017"]

### Deliverable
Command palette skeleton that can invoke vault semantic search.

### Acceptance
Palette opens, basic semantic search entry works.

### Validation
Manual test + screenshot.

### Dependencies
Load creative-frontend-orchestrator.

### Execution Envelope
Worktree p1-w1-organizational-flow/T-020.

### Completion Protocol
Evidence.' \
  --label "phase:p1,wave:w1,swarm:organizational-flow,area:frontend,owner:codex,bridge:vault" \
  --milestone "$MILESTONE"

# T-021
gh issue create \
  --title "T-021 | Overview \"Vault Intelligence rail\" skeleton (embeddings-powered)" \
  --body '**Task ID:** T-021
**Phase:** 1
**Wave:** 1
**Swarm:** organizational-flow
**Area:** frontend
**Primary owner agent:** codex
**Owner role:** codex
**Est Hours:** 2.5
**Dependencies:** ["T-007","T-018"]

### Deliverable
Skeleton for the Vault Intelligence rail in Overview, using embeddings, ownership badges, and bridge context (singleton Paperclip status).

### Acceptance
Rail renders with sample embedding results + badges.

### Validation
Screenshot + basic interaction test.

### Dependencies
Load creative-frontend-orchestrator + design-system.

### Execution Envelope
Worktree p1-w1-organizational-flow/T-021.

### Completion Protocol
Evidence.' \
  --label "phase:p1,wave:w1,swarm:organizational-flow,area:frontend,owner:codex,bridge:vault,paperclip" \
  --milestone "$MILESTONE"

# T-022
gh issue create \
  --title "T-022 | Inbox embedding-powered smart routing suggestions skeleton" \
  --body '**Task ID:** T-022
**Phase:** 1
**Wave:** 1
**Swarm:** organizational-flow
**Area:** frontend
**Primary owner agent:** codex
**Owner role:** codex
**Est Hours:** 2
**Dependencies:** ["T-007","T-021"]

### Deliverable
Skeleton for Inbox smart routing suggestions powered by vault embeddings.

### Acceptance
Suggestions appear based on embedding similarity.

### Validation
Test with sample data + screenshot.

### Dependencies
Load creative-frontend-orchestrator.

### Execution Envelope
Worktree p1-w1-organizational-flow/T-022.

### Completion Protocol
Evidence.' \
  --label "phase:p1,wave:w1,swarm:organizational-flow,area:frontend,owner:codex,bridge:vault" \
  --milestone "$MILESTONE"

# T-023
gh issue create \
  --title "T-023 | Settings \"Test All Bridges\" button with embedding health (singleton Paperclip status)" \
  --body '**Task ID:** T-023
**Phase:** 1
**Wave:** 1
**Swarm:** bridge-visibility
**Area:** frontend
**Primary owner agent:** copilot
**Owner role:** copilot
**Est Hours:** 2
**Dependencies:** ["T-005","T-019"]

### Deliverable
Settings button that tests all bridges and surfaces results, explicitly showing Paperclip as the singleton shared instance.

### Acceptance
Button triggers tests, results include singleton status + embedding health.

### Validation
Test run + screenshot.

### Dependencies
Load creative-frontend-orchestrator + tauri clusters.

### Execution Envelope
Worktree p1-w1-bridge-visibility/T-023.
**Singleton Paperclip constraint must be surfaced.**

### Completion Protocol
Evidence + constraint note in UI.' \
  --label "phase:p1,wave:w1,swarm:bridge-visibility,area:frontend,owner:copilot,bridge:paperclip,vault,cloudflare,hermes" \
  --milestone "$MILESTONE"

echo "All 23 issues created with singleton Paperclip constraint applied everywhere."
echo "Next: Create worktree for T-001, then run the T-001 execution steps from .planning/T-001-execution.md"
