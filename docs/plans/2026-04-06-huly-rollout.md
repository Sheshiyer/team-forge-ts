# Thoughtseed Huly Rollout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the audited Huly workspace into the integrated Thoughtseed operating system in three controlled phases, while keeping TeamForge aligned with the live data model.

**Architecture:** The rollout starts with source-of-truth documentation and workspace normalization, then creates the missing data foundation, then seeds operational modules, and only after that deepens TeamForge dashboards against the new entities. Live Huly mutation should stay deliberate and reversible until the workspace model is stable.

**Tech Stack:** Markdown docs, GitHub issues, TeamForge React frontend, Tauri Rust backend, Huly REST/JSON-RPC integration, SQLite cache.

---

### Task 1: Publish the source-of-truth system design

**Files:**
- Create: `docs/huly-system-design.md`
- Modify: `README.md`
- Modify: `tasks/todo.md`

**Step 1: Create the system design document**

Write the complete Huly operating model into `docs/huly-system-design.md` with:

- foundation objects
- operating modules
- delivery flows
- roadmap
- success metrics

**Step 2: Add architecture diagrams**

Add Mermaid diagrams for:

- cross-system data flow
- entity relations
- rollout phases

**Step 3: Link the document from the README**

Add a `System Design` section in `README.md` linking:

- `docs/huly-system-design.md`
- this rollout plan

**Step 4: Record progress in `tasks/todo.md`**

Append a new rollout section documenting what shipped in this slice.

**Step 5: Verify**

Run:

```bash
pnpm build
```

Expected:

- build completes successfully
- README and docs changes do not break the frontend build

### Task 2: Prepare the workspace normalization runbook

**Files:**
- Create: `docs/runbooks/huly-workspace-normalization.md`
- Modify: `docs/huly-system-design.md`
- Modify: `docs/plans/2026-04-06-huly-rollout.md`

**Step 1: Define the exact normalization order**

Document the live Huly cleanup sequence:

1. rename projects
2. create missing projects
3. redistribute issues
4. replace default department structure
5. create channels
6. resolve duplicate people
7. rename or archive placeholder docs

Runbook path:

- `docs/runbooks/huly-workspace-normalization.md`

**Step 2: Mark each step against GitHub issues**

Map:

- `#18` workspace baseline
- `#16` audit tracker

**Step 3: Define rollback expectations**

Document which steps are safe to retry and which should be checkpointed manually.

**Step 4: Sync the issue when tooling is available**

Post or link the runbook into `#18` once GitHub CLI or connector access is available in the active environment.

### Task 3: Implement Huly write-paths in TeamForge

**Files:**
- Modify: `src-tauri/src/huly/client.rs`
- Modify: `src-tauri/src/huly/types.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src/hooks/useInvoke.ts`
- Modify: relevant pages under `src/pages/`

**Step 1: Add generic create/update helpers**

Extend the Huly client beyond `find_all` so the app can safely create and update:

- enums
- classes
- tags
- relation objects
- departments and channels

**Step 2: Add explicit typed commands**

Expose narrow Tauri commands instead of a generic mutation pipe:

- `create_huly_enum`
- `create_huly_class`
- `create_huly_tag_hierarchy`
- `normalize_workspace_baseline`

**Step 3: Add dry-run and reporting support**

Every mutation command should report:

- intended action
- created or updated object ids
- warnings
- failures

**Step 4: Verify**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
pnpm build
```

### Task 4: Execute foundation data creation

**Files:**
- Modify: `src-tauri/src/huly/client.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src/lib/types.ts`
- Modify: rollout docs as needed

**Step 1: Create enums**

Create the 9 enum types from `docs/huly-system-design.md`.

**Step 2: Create classes**

Create:

- `Client`
- `Smart_Home_Device`
- `Client_Resource`
- `Knowledge_Article`
- `Sprint`

**Step 3: Create tag hierarchies**

Create:

- `PROJECT_TYPE`
- `CLIENT`
- `TECH_STACK`
- `PHASE`

**Step 4: Create relations**

Create the 8 core relations and verify each in Huly.

### Task 5: Seed operational modules

**Files:**
- Modify: `docs/huly-system-design.md`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/huly/client.rs`

**Step 1: Seed HR**

Create:

- departments
- team-role mapping
- holidays
- leave setup

**Step 2: Seed delivery structures**

Create:

- first sprint per active stream
- onboarding template project
- starter board cards

**Step 3: Seed knowledge and training**

Create:

- first knowledge articles
- onboarding track
- smart home track
- PM-developer track

### Task 6: Bring TeamForge up to the new model

**Files:**
- Modify: `src/pages/Projects.tsx`
- Modify: `src/pages/Sprints.tsx`
- Modify: `src/pages/Team.tsx`
- Modify: `src/pages/Boards.tsx`
- Modify: `src/pages/Insights.tsx`
- Create or modify additional pages required by issues `#5` through `#15`

**Step 1: Add dashboards backed by real foundation entities**

Do not fake these with hardcoded placeholders.

**Step 2: Add workflow views**

Support:

- onboarding
- training compliance
- client dashboard
- device registry

**Step 3: Verify**

Run:

```bash
pnpm build
pnpm tauri build --bundles app
```

### Task 7: Close the rollout loop

**Files:**
- Modify: `tasks/todo.md`
- Modify: `README.md`
- Modify: issue trackers through `gh issue`

**Step 1: Update status docs**

Record what shipped, what is blocked, and what remains.

**Step 2: Sync GitHub issue state**

Close or update issues only after verification evidence exists.

**Step 3: Final verification**

Run the exact commands required by the completed slice and capture the outcome before making success claims.

## Immediate Execution Order

1. Task 1 now
2. Task 2 next
3. Task 3 before any live Huly mutation
4. Task 4 after write-path verification
5. Task 5 after foundation is stable
6. Task 6 after live workspace data is trustworthy
7. Task 7 continuously at phase boundaries
