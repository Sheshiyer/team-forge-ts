# Ops Fabric v0.3.0 Completion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the still-open 20-issue `Ops Fabric v0.3.0 — TeamForge ↔ Paperclip Unification` milestone by separating already-landed foundation work from genuinely missing implementation and then finishing the remaining backend/integration slices before cutting `v0.1.20`.

**Architecture:** Build on the existing local `ops_events` and `agent_feed` foundation in the Tauri app instead of redoing the data model. First run an issue-audit and closure pass for milestones already represented in code, then finish the missing Paperclip export/snapshot/dispatch layers, then add signal intelligence and outcome tracking on top of the same canonical feed.

**Tech Stack:** Rust/Tauri, SQLite (`sqlx`), GitHub CLI (`gh`), Node scripts, existing TeamForge scheduler/sync engines, local docs/contracts.

---

## Milestone Audit Snapshot

### Likely Ready For Verification + Closure

- `#20` Define canonical `ops_event` schema
  - Evidence:
    - `src-tauri/migrations/001_initial.sql`
    - `src-tauri/src/ops/mod.rs`
    - `docs/architecture/contracts/ops-event-schema-contract.md`
- `#21` Deterministic `sync_key` generation
  - Evidence:
    - `src-tauri/src/ops/mod.rs`
    - tests in `src-tauri/src/ops/mod.rs`
- `#23` Periodic Huly sync in background scheduler
  - Evidence:
    - `src-tauri/src/sync/scheduler.rs`
    - `docs/runbooks/huly-sync-cadence.md`
- `#24` Slack delta sync with cursor checkpoints
  - Evidence:
    - `src-tauri/src/slack/sync.rs`
    - `src-tauri/src/commands/mod.rs`
- `#25` Cross-platform identity map
  - Evidence:
    - `src-tauri/migrations/001_initial.sql`
    - `src-tauri/src/db/queries.rs`
    - `src-tauri/src/commands/mod.rs`
- `#27` Dedicated `agent_feed` projection
  - Evidence:
    - `src-tauri/migrations/001_initial.sql`
    - `src-tauri/src/db/queries.rs`
    - `docs/architecture/contracts/agent-feed-schema-contract.md`
- `#28` TeamForge `agent_feed` export API
  - Evidence:
    - `src-tauri/src/commands/mod.rs`
    - `docs/architecture/contracts/agent-feed-export-contract.md`

### Landed During Final Milestone Closeout

- `#22` Persist Slack activity to SQLite for durable analytics and feed export
  - Evidence:
    - `src-tauri/src/db/queries.rs`
    - `src-tauri/src/commands/mod.rs`
    - `src-tauri/src/slack/sync.rs`
  - Closeout note:
    - user-facing Slack analytics paths now read persisted SQLite activity instead of depending on transient live fetches
- `#26` Identity-match confidence + manual override controls
  - Evidence:
    - `src-tauri/src/db/queries.rs`
    - `src-tauri/src/commands/mod.rs`
    - `src/hooks/useInvoke.ts`
    - `src/pages/Settings.tsx`
  - Closeout note:
    - operator-facing review queue, target employee selection, override actor capture, and override-reason input are now wired to the canonical backend override path

### Implemented In Canonical Paperclip Repo, Needs Milestone Bookkeeping

- `#29` Build `ts-paperclip` TeamForge sync ingestion script
- `#30` Persist immutable dated feed snapshots into vault
- `#31` Enrich `paperclip-sync` dispatch with TeamForge feed context
- `#32` Implement role-specific `agent_feed` slices
- `#33` Inject role-specific feed slices into `agent-prompt-assembler`
- `#34` Add signal-to-owner routing rules
- `#35` Add severity scoring pipeline
- `#36` Add dedupe windows / cooldown suppression
- `#37` Add ingestion health metrics
- `#38` Implement unified data quality checks / drift detection
- `#39` Add closed-loop action outcome tracking

Verification repo and evidence source:

- sibling canonical repo: `../tryambakamnoesis-paperclip`
- key implementation files:
  - `scripts/teamforge-sync.sh`
  - `scripts/paperclip-sync.sh`
  - `scripts/agent-prompt-assembler.sh`
  - `scripts/paperclip-cycle.sh`
  - `scripts/dispatch-task.sh`
  - `scripts/task-registry.sh`
  - `memory/teamforge-ops-feed.md`

---

### Task 1: Milestone Audit And Closure Pass

**Files:**
- Modify: `tasks/todo.md`
- Modify: `docs/plans/2026-04-18-ops-fabric-v0.3.0-completion.md`
- Inspect: `src-tauri/migrations/001_initial.sql`
- Inspect: `src-tauri/src/ops/mod.rs`
- Inspect: `src-tauri/src/slack/sync.rs`
- Inspect: `src-tauri/src/sync/scheduler.rs`
- Inspect: `src-tauri/src/db/queries.rs`
- Inspect: `src-tauri/src/commands/mod.rs`
- Inspect: `docs/architecture/contracts/ops-event-schema-contract.md`
- Inspect: `docs/architecture/contracts/agent-feed-schema-contract.md`
- Inspect: `docs/architecture/contracts/agent-feed-export-contract.md`

**Step 1: Build the closure checklist**

- For issues `#20`, `#21`, `#23`, `#24`, `#25`, `#27`, `#28`, record:
  - exact acceptance evidence
  - exact verifying command
  - exact gap if closure is blocked

**Step 2: Run issue-specific verification commands**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
pnpm build
gh issue view 20 --json number,title,body,url
gh issue view 21 --json number,title,body,url
gh issue view 23 --json number,title,body,url
gh issue view 24 --json number,title,body,url
gh issue view 25 --json number,title,body,url
gh issue view 27 --json number,title,body,url
gh issue view 28 --json number,title,body,url
```

Expected:
- tests/build pass
- each issue body can be mapped to existing code/contracts without hand-waving

**Step 3: Close or comment with evidence**

Run, issue by issue:

```bash
gh issue comment <issue> --body "<evidence summary>"
gh issue close <issue> --comment "<closure summary>"
```

Expected:
- only issues with explicit evidence are closed
- partial issues stay open with a gap note

**Step 4: Commit audit artifacts**

```bash
git add tasks/todo.md docs/plans/2026-04-18-ops-fabric-v0.3.0-completion.md
git commit -m "docs: audit ops fabric milestone status"
```

---

### Task 2: Finish Durable Slack Analytics Gap (`#22`)

**Files:**
- Inspect: `src/pages/Comms.tsx`
- Inspect: `src/pages/Insights.tsx`
- Inspect: `src-tauri/src/commands/mod.rs`
- Inspect: `src-tauri/src/db/queries.rs`
- Test: `src-tauri/src/db/queries.rs`

**Step 1: Write the failing regression test**

- Add a query/command test proving Slack-backed analytics continue to work from persisted rows without a live Slack fetch dependency.

**Step 2: Run test to verify it fails**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml slack -- --nocapture
```

Expected:
- failure shows the missing durable-read path

**Step 3: Implement the minimal durable-read fix**

- Route remaining Slack analytics reads through persisted SQLite state only.
- Remove any command path that silently depends on live Slack API availability for analytics/history.

**Step 4: Run tests/build**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
pnpm build
```

Expected:
- pass

**Step 5: Commit**

```bash
git add src/pages/Comms.tsx src/pages/Insights.tsx src-tauri/src/commands/mod.rs src-tauri/src/db/queries.rs
git commit -m "fix(ops): make slack analytics fully durable"
```

---

### Task 3: Finish Identity Review + Override Operator Surface (`#26`)

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/hooks/useInvoke.ts`
- Modify: `src/pages/Team.tsx`
- Modify: `src/pages/Settings.tsx`
- Modify: `src-tauri/src/commands/mod.rs`
- Test: `src-tauri/src/commands/mod.rs`

**Step 1: Write the failing backend/UI contract test**

- Add a command-level test for `get_identity_review_queue` + `set_identity_override`.

**Step 2: Run the test to verify it fails or exposes the missing UI path**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml identity -- --nocapture
```

Expected:
- either missing command coverage or missing frontend wiring is obvious

**Step 3: Implement minimal operator UI**

- Expose the identity review queue in a real page section.
- Add explicit override controls tied to `set_identity_override`.
- Show confidence, match method, override actor, and override reason.

**Step 4: Verify**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
pnpm build
```

Expected:
- pass

**Step 5: Commit**

```bash
git add src/lib/types.ts src/hooks/useInvoke.ts src/pages/Team.tsx src/pages/Settings.tsx src-tauri/src/commands/mod.rs
git commit -m "feat(ops): add identity review override controls"
```

---

### Task 4: Build Paperclip Ingestion Script (`#29`)

**Files:**
- Create: `scripts/teamforge-paperclip-sync.mjs`
- Modify: `package.json`
- Modify: `docs/architecture/contracts/agent-feed-export-contract.md`
- Inspect: `src-tauri/src/commands/mod.rs`

**Step 1: Write the failing script contract**

- Define CLI flags:
  - `--since-cursor`
  - `--limit`
  - `--output`
- Script must call TeamForge export and emit deterministic JSON for Paperclip.

**Step 2: Run script in dry mode and verify failure**

Run:

```bash
node scripts/teamforge-paperclip-sync.mjs --help
```

Expected:
- command missing before implementation

**Step 3: Implement minimal ingestion script**

- Pull `export_agent_feed_snapshot`
- normalize result
- optionally write JSON output

**Step 4: Verify**

Run:

```bash
node scripts/teamforge-paperclip-sync.mjs --help
pnpm build
```

Expected:
- help output works
- build still passes

**Step 5: Commit**

```bash
git add scripts/teamforge-paperclip-sync.mjs package.json docs/architecture/contracts/agent-feed-export-contract.md
git commit -m "feat(ops): add paperclip feed ingestion script"
```

---

### Task 5: Persist Immutable Feed Snapshots (`#30`)

**Files:**
- Create: `scripts/export-agent-feed-snapshot.mjs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `docs/architecture/contracts/agent-feed-export-contract.md`
- Modify: `docs/engagement-playbook.md`

**Step 1: Define snapshot location and naming**

- Use deterministic dated filenames.
- Record exact vault path contract in docs.

**Step 2: Implement snapshot writer**

- Build on `export_agent_feed_snapshot`.
- Write immutable JSON snapshot files to the configured vault/export path.

**Step 3: Verify**

Run:

```bash
node scripts/export-agent-feed-snapshot.mjs --help
pnpm build
```

Expected:
- script exists and documents path contract

**Step 4: Commit**

```bash
git add scripts/export-agent-feed-snapshot.mjs src-tauri/src/commands/mod.rs docs/architecture/contracts/agent-feed-export-contract.md docs/engagement-playbook.md
git commit -m "feat(ops): persist immutable agent feed snapshots"
```

---

### Task 6: Add Paperclip Feed Context And Role Slices (`#31`, `#32`, `#33`)

**Files:**
- Modify: `src-tauri/src/db/models.rs`
- Modify: `src-tauri/src/db/queries.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `docs/architecture/contracts/agent-feed-schema-contract.md`
- Modify: `scripts/teamforge-paperclip-sync.mjs`

**Step 1: Add slice semantics in the data/export layer**

- Define role-specific slices for `Jarvis`, `Clawd`, `Sentinel`, `Sage`.

**Step 2: Add tests for slice filtering**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml agent_feed -- --nocapture
```

Expected:
- new tests fail before implementation

**Step 3: Implement slice-aware export**

- add owner/severity/event-type filtering helpers
- include slice metadata in export payloads

**Step 4: Verify**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
pnpm build
```

**Step 5: Commit**

```bash
git add src-tauri/src/db/models.rs src-tauri/src/db/queries.rs src-tauri/src/commands/mod.rs docs/architecture/contracts/agent-feed-schema-contract.md scripts/teamforge-paperclip-sync.mjs
git commit -m "feat(ops): add paperclip role feed slices"
```

---

### Task 7: Add Signal Routing, Severity, Dedupe, Metrics, Drift, Outcomes (`#34`–`#39`)

**Files:**
- Modify: `src-tauri/src/db/models.rs`
- Modify: `src-tauri/src/db/queries.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/sync/alerts.rs`
- Modify: `src-tauri/src/sync/scheduler.rs`
- Modify: `docs/architecture/contracts/ops-event-schema-contract.md`
- Modify: `docs/architecture/contracts/agent-feed-schema-contract.md`

**Step 1: Add failing tests for severity + dedupe + routing**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml ops -- --nocapture
```

Expected:
- missing routing/severity/dedupe behavior is explicit

**Step 2: Implement severity scoring + owner routing**

- derive severity from event type + drift/lag + failure class
- add owner routing rules

**Step 3: Implement dedupe/cooldown**

- add suppression windows for repeated alert classes

**Step 4: Implement health metrics + drift checks**

- expose lag/failure/coverage metrics
- expose data quality/drift summaries

**Step 5: Implement closed-loop outcomes**

- store intervention outcome/status against routed events/actions

**Step 6: Verify**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
pnpm build
```

**Step 7: Commit**

```bash
git add src-tauri/src/db/models.rs src-tauri/src/db/queries.rs src-tauri/src/commands/mod.rs src-tauri/src/sync/alerts.rs src-tauri/src/sync/scheduler.rs docs/architecture/contracts/ops-event-schema-contract.md docs/architecture/contracts/agent-feed-schema-contract.md
git commit -m "feat(ops): finish signal intelligence and outcomes"
```

---

### Task 8: Milestone Closure And Release Prep

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `sidecar/package.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/Cargo.lock`
- Modify: `tasks/todo.md`

**Step 1: Confirm milestone state**

Run:

```bash
gh issue list --state open --milestone "Ops Fabric v0.3.0 — TeamForge ↔ Paperclip Unification" --limit 50
```

Expected:
- zero open issues in the milestone

**Step 2: Cut the version bump only after milestone closure**

- bump metadata to `0.1.20`
- add changelog entry

**Step 3: Final verification**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
pnpm build
```

Expected:
- pass

**Step 4: Commit and push**

```bash
git add CHANGELOG.md package.json sidecar/package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json src-tauri/Cargo.lock tasks/todo.md
git commit -m "chore(release): prepare 0.1.20 ops fabric milestone cut"
git push origin main
```

---

Plan complete and saved to `docs/plans/2026-04-18-ops-fabric-v0.3.0-completion.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Because you have not authorized subagents in this thread, I am keeping execution local unless you explicitly want delegation.
