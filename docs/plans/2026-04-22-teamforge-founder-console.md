# TeamForge Founder Console, Vault, and Paperclip Integration Plan

**Goal:** Make TeamForge the shared founder and agent control plane, not only an integration dashboard for GitHub, Huly, Clockify, and Slack. The native Tauri shell should also own local vault access, local Paperclip launch actions, and first-sync bootstrap into the Cloudflare-backed TeamForge control plane.

**Status:** Architecture/design plan for the next implementation pass.

---

## 1. Product Framing

TeamForge should be treated as the central operating surface for both co-founders and the internal agents.

That means:

- Cloudflare-backed TeamForge owns the shared company/project graph
- the desktop app owns machine-specific local access and launcher controls
- the UI should expose first-sync setup inside TeamForge itself, not through hidden env vars or external scripts

The main mistake to avoid is collapsing TeamForge back into a narrow sync dashboard. It needs to be the control surface that joins:

- cloud project identity
- issue and project sync status
- local Obsidian vault access
- local Paperclip runtime actions
- agent/operator workflows

---

## 2. Canonical Ownership Split

### Shared canonical state: Cloudflare Worker + D1

Cloudflare-backed TeamForge should remain the canonical owner of:

- project identity
- project and repo mappings
- active project issue feed
- sync mappings and sync audit state
- vault-derived structured records after ingestion and normalization
- agent-facing company/project context needed by both co-founders

### Local per-machine state: Tauri settings

The desktop app should own only machine-specific configuration such as:

- absolute local vault root path
- local Paperclip launcher script path
- local Paperclip working directory
- local Paperclip UI URL when it points to a local service
- optional local workspace roots under `/Volumes/...`

### Local projection/cache: SQLite

The embedded SQLite database should continue to act as:

- offline cache
- projection of Cloudflare-owned state
- storage for local settings and last-known sync metadata

It should not become the canonical shared system of record.

### Critical rule

Do not sync absolute local filesystem paths into Cloudflare as shared canonical state.

Both co-founders should see the same TeamForge project graph and issue/control-plane data, but each machine can point to different local vault and launcher paths.

---

## 3. First-Time Sync Model

The first sync should be explicit and operator-driven from the app.

### Recommended flow

1. Founder opens `Settings`.
2. Founder selects the local vault directory from the native file picker.
3. TeamForge validates the vault structure and shows what it found.
4. Founder configures the Paperclip launcher target and local UI URL.
5. Founder runs a `Sync Vault to TeamForge` action.
6. Tauri reads local vault content, normalizes it, and pushes structured payloads to the Cloudflare control plane.
7. TeamForge refreshes the local cache/projection and updates issue/project views from canonical cloud state.

### Why this flow

- it makes the first-time bootstrap visible and repeatable
- it removes dependence on hidden environment variables for core product setup
- it keeps local read access local while still centralizing the normalized output in Cloudflare

---

## 4. Local Settings Model

The current generic `settings` table is already sufficient for persistence, so the next pass can reuse `get_settings` and `save_setting` for plain values while adding explicit native action commands.

### Proposed keys

- `local_vault_root`
  - absolute path selected by the founder
- `local_vault_last_validated_at`
  - last successful validation timestamp
- `local_vault_validation_summary`
  - short cached status string for Settings
- `paperclip_script_path`
  - absolute path to the launcher script or executable
- `paperclip_working_dir`
  - optional working directory for the launcher
- `paperclip_ui_url`
  - local or remote URL to open the Paperclip UI
- `paperclip_last_launch_at`
  - last successful launch timestamp
- `local_workspace_root`
  - optional root under `/Volumes/...` for related local project context

### Precedence for vault resolution

The app should move from implicit-only resolution to explicit-first resolution:

1. `local_vault_root` from Settings
2. existing env var fallback:
   - `TEAMFORGE_VAULT_ROOT`
   - `THOUGHTSEED_VAULT_ROOT`
   - `OBSIDIAN_VAULT_ROOT`
3. current Obsidian config heuristic fallback

This preserves current behavior while making the product setup deterministic.

---

## 5. Native Tauri Commands

The frontend should not directly assemble shell behavior. Tauri should expose explicit commands for the required native actions.

### Commands to add

- `pick_vault_directory() -> Result<Option<String>, String>`
  - opens a native folder picker and returns the selected path
- `validate_vault_directory(path: String) -> Result<VaultValidationResult, String>`
  - confirms required folders/files exist and reports discovered signals
- `get_local_workspace_status() -> Result<LocalWorkspaceStatus, String>`
  - returns current local vault and Paperclip readiness for Settings
- `launch_paperclip_script() -> Result<LaunchResult, String>`
  - launches the configured Paperclip instance target using a constrained native path
- `open_paperclip_ui() -> Result<(), String>`
  - opens the configured Paperclip UI URL
- `sync_local_vault_to_teamforge() -> Result<LocalVaultSyncReport, String>`
  - runs the local read and Cloudflare push path, then refreshes local projections

### Tauri v2 implementation notes

- register every command in `tauri::generate_handler![...]`
- return `Result<..., String>` or a serializable error type
- keep async commands on owned types
- add any missing capabilities before using a new plugin surface

### Folder picker recommendation

Use `tauri-plugin-dialog` for the vault directory picker.

Reason:

- it is the cleanest Tauri-native UX for a founder-facing Settings flow
- it avoids requiring the user to paste long `/Volumes/...` paths by hand
- it keeps the UI intent clear and matches the rest of the native shell

If the dialog plugin is not desirable for this pass, `rfd` can be a fallback, but the preferred path is the Tauri dialog plugin.

---

## 6. Settings UX

The current `Settings.tsx` already carries integration credentials and sync actions. It should gain one new section rather than spawning a separate onboarding surface.

### New section: `Local Workspace`

This section should show:

- `Vault Directory`
  - current path
  - validation badge
  - `Choose Folder` button
  - `Validate Vault` button
- `Paperclip Launcher`
  - script/executable path
  - working directory
  - `Launch Paperclip` button
- `Paperclip UI`
  - configured URL
  - `Open Paperclip UI` button
- `Founder Sync`
  - `Sync Vault to TeamForge` button
  - last sync status
  - short status line for cloud/project refresh

### UX behavior

- show readiness state, not just raw fields
- make local/native actions explicit buttons
- keep the existing integration token sections intact
- avoid turning local setup into a hidden developer-only workflow

### Nice-to-have follow-up

Add a smaller launcher strip outside Settings later, but keep the first implementation in Settings where configuration already lives.

---

## 7. Paperclip Launch Model

Paperclip should be treated as a local companion runtime that TeamForge can launch and open, not as a free-form arbitrary shell terminal.

### Recommended model

Store structured launcher inputs:

- launcher target path
- optional working directory
- optional argument list
- UI URL

Then expose only explicit actions:

- launch
- open UI

### Guardrails

- validate the script/executable path before launch
- fail with a readable error if the path does not exist
- avoid a generic unbounded "run whatever command the user typed" surface in the first pass
- log launch attempts and last-known outcome

This keeps the feature useful without turning the Settings page into an arbitrary shell execution surface.

---

## 8. Vault Ingestion Model

`src-tauri/src/vault.rs` already proves TeamForge can read the local vault. The next step is to formalize and broaden that behavior.

### Immediate change

Refactor vault root resolution so it first consults Settings and then falls back to the existing env-var and Obsidian heuristics.

### Sync direction

The intended flow should be:

- local vault files
- Tauri normalization layer
- Cloudflare Worker ingest endpoint
- D1 canonical records
- local SQLite projection refresh

### Why this matters

This gives the company a single source of truth while still allowing native local access to raw source notes.

---

## 9. Cloudflare Sync Boundary

Cloudflare should receive normalized structured payloads, not raw machine-specific configuration.

### Safe to sync

- project and client metadata derived from the vault
- team/person records derived from the vault
- project-to-repo or project-to-context mappings
- sync timestamps and sync status
- issue/project enrichment metadata

### Keep local only

- `/Volumes/...` paths
- local Obsidian vault absolute paths
- local launcher script paths
- local dev URLs that are machine-specific unless intentionally shared

---

## 10. Implementation Sequence

### Phase 1: Local settings and launch actions

- add settings keys
- add local workspace status command
- add vault picker
- add Paperclip launch/open commands
- add Settings UI section

### Phase 2: Vault validation and explicit resolution

- move vault resolution to explicit-first precedence
- add vault validation result model
- show validation status in Settings

### Phase 3: Cloudflare ingest bridge

- add the local vault sync command
- send normalized records to the Worker
- refresh local projections after successful ingest

### Phase 4: Operational polish

- improved launch error states
- last-run telemetry in the UI
- optional quick actions outside Settings

---

## 11. Acceptance Criteria

This slice is complete when:

- TeamForge no longer depends on hidden env vars as the primary vault setup path
- a founder can choose a vault directory from the app
- the app can validate that directory and report usable status
- the app can launch the configured Paperclip instance target
- the app can open the configured Paperclip UI
- the app can sync local vault-derived structured data into the Cloudflare control plane
- both co-founders see the same cloud-owned project and issue state while keeping their own local paths private

---

## 12. Existing Repo Seams To Reuse

- `src-tauri/src/vault.rs`
  - current local vault resolution and parsing logic
- `src-tauri/src/lib.rs`
  - Tauri plugin initialization and command registration
- `src-tauri/src/commands/mod.rs`
  - settings persistence and new native command entry points
- `src/pages/Settings.tsx`
  - existing operator-facing integration settings surface
- `src/hooks/useInvoke.ts`
  - stable invoke layer for new frontend actions

The next implementation pass should build on those seams instead of inventing a parallel configuration path.
