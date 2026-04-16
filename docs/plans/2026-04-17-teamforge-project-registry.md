# TeamForge Project Registry Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a canonical TeamForge-owned project registry that can link GitHub repos, Huly projects, and external project artifacts before full bidirectional sync is built.

**Architecture:** Introduce TeamForge-first SQLite tables for project identity plus explicit GitHub, Huly, and artifact link records. Expose the project graph through Tauri commands so the UI can move from repo-centric settings to a real cross-tool project registry.

**Tech Stack:** Rust, Tauri commands, SQLx/SQLite, React/TypeScript types

---

### Task 1: Add TeamForge project graph storage

**Files:**
- Modify: `src-tauri/migrations/001_initial.sql`
- Modify: `src-tauri/src/db/models.rs`
- Test: `src-tauri/src/db/queries.rs`

**Step 1: Write failing DB tests**

Add tests for:
- upserting a TeamForge project graph with:
  - one canonical project
  - two linked GitHub repos
  - one linked Huly project
  - multiple linked artifacts
- replacing the graph removes stale links/artifacts that are no longer present

**Step 2: Run test to verify it fails**

Run:
```bash
cargo test --manifest-path src-tauri/Cargo.toml teamforge_project_graph
```

Expected:
- compilation or test failure because the TeamForge project graph tables/functions do not exist yet

**Step 3: Add schema + Rust models**

Add:
- `teamforge_projects`
- `teamforge_project_github_repos`
- `teamforge_project_huly_links`
- `teamforge_project_artifacts`

Add matching Rust models and assembled graph view structs.

**Step 4: Run the targeted tests again**

Run:
```bash
cargo test --manifest-path src-tauri/Cargo.toml teamforge_project_graph
```

Expected:
- tests still fail until query logic is implemented

### Task 2: Add query-layer graph read/write support

**Files:**
- Modify: `src-tauri/src/db/queries.rs`
- Test: `src-tauri/src/db/queries.rs`

**Step 1: Write query API surface**

Add query helpers for:
- upserting a canonical TeamForge project
- replacing linked GitHub repos for a project
- replacing linked Huly links for a project
- replacing linked artifacts for a project
- loading assembled TeamForge project graphs

**Step 2: Implement transactional graph replace**

Use one transaction so project + links update atomically and stale rows are removed safely.

**Step 3: Run targeted tests**

Run:
```bash
cargo test --manifest-path src-tauri/Cargo.toml teamforge_project_graph
```

Expected:
- all new TeamForge graph tests pass

### Task 3: Expose TeamForge project registry through Tauri

**Files:**
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/types.ts`
- Modify: `src/hooks/useInvoke.ts`

**Step 1: Write failing command tests or minimal compile surface checks**

Add command-facing structs for:
- reading TeamForge project graphs
- saving a TeamForge project graph

**Step 2: Implement command handlers**

Add:
- `get_teamforge_projects`
- `save_teamforge_project`

These commands should operate on the canonical registry only, without changing GitHub/Huly sync behavior yet.

**Step 3: Register commands and TypeScript invoke surface**

Expose the new commands through the Tauri invoke handler and TypeScript API types.

**Step 4: Run backend verification**

Run:
```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected:
- full Rust test suite passes

### Task 4: Verify first-slice integrity

**Files:**
- Modify: `tasks/todo.md`

**Step 1: Run final verification**

Run:
```bash
cargo test --manifest-path src-tauri/Cargo.toml
pnpm build
```

Expected:
- Rust tests pass
- frontend build remains green after new API types/hooks

**Step 2: Document what remains out of scope**

Call out that this slice does **not** yet implement:
- live bidirectional GitHub <-> Huly writes
- conflict resolution UI
- retry queue / sync journal
- registry UI editor

**Step 3: Commit**

```bash
git add src-tauri/migrations/001_initial.sql src-tauri/src/db/models.rs src-tauri/src/db/queries.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs src/lib/types.ts src/hooks/useInvoke.ts tasks/todo.md docs/plans/2026-04-17-teamforge-project-registry.md
git commit -m "feat(projects): add canonical TeamForge project registry"
```
