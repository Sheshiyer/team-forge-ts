# T-001 Discoveries — Tauri capability narrowing (singleton Paperclip)

## Build / capability wiring

1. **Capability identifiers are not permissions.** Putting `"paperclip-singleton"` in `default.json` `permissions` fails `cargo check` with `Permission paperclip-singleton not found`. Separate capability files that share `"windows": ["main"]` are merged automatically — no cross-reference needed.

2. **Scoped shell syntax.** The object key must be `"identifier": "shell:allow-execute"` (or `shell:allow-spawn`), not `shell:execute`. A bare `"shell:allow-execute"` string alongside a scoped object is redundant; use only the scoped object.

3. **`tauri capability list` unavailable.** `@tauri-apps/cli` v2 in this repo exposes `tauri capability new` only — no `list` subcommand. Effective capability state is verified via `cargo check` + inspecting `src-tauri/capabilities/*.json`.

## Runtime / security model gaps (follow-up tasks)

4. **Rust `ShellExt` bypasses capability scope.** `app_handle.shell().command(...)` and `.shell().open(...)` in `src-tauri/src/commands/mod.rs` create processes directly without ACL validation. Capability narrowing currently affects JS `@tauri-apps/plugin-shell` IPC only. True least-privilege requires follow-up: migrate Rust launch paths to scoped IPC or equivalent enforcement.

5. **Remaining shell needs not yet scoped.** Rust still invokes:
   - `node` (runtime version check, Paperclip adapter spawn)
   - `bash` (Hermes dispatcher, poller, Paperclip script via interpreter)
   - `teamforge-vault-parity.mjs` via node
   - `shell().open()` for Paperclip UI URLs and other external links

   `default.json` no longer grants blanket `shell:allow-open` / `shell:allow-execute`. Frontend JS shell calls would be denied; Rust paths still work until T-002+ scopes these binaries.

6. **`shell:allow-open` removed.** `open_paperclip_ui` and other `shell().open` Rust call sites still work (Rust passes `None` scope to `open::open`). If the app later exposes open-via-JS, a narrow `shell:allow-open` scope (http/https only) will be needed in a dedicated capability.

7. **Scoped `cmd` vs actual launch paths.** Paperclip launch from Rust resolves full filesystem paths (`resolve_default_paperclip_launcher_path`) and may use `bash` as interpreter with the script as an argument — not the scoped name `launch-thoughtseed-paperclip` used by JS `Command.create`. Scoped capability is correct for bundled resource name `launch-thoughtseed-paperclip.sh`; Rust path alignment is a later hardening item.

## Singleton constraint

8. **Singleton preserved.** `scripts/launch-thoughtseed-paperclip.sh` start → status (PID 66674) → stop cycle succeeded. One babysitter instance; no per-org sidecar or Tauri sidecar conversion. Stale loop-runner PID (43192) is pre-existing supervisor state, unrelated to T-001.

## Evidence gaps

9. **Screenshots not captured in agent run.** Manual screenshots recommended: capability JSON before/after, Settings → Paperclip controls, optional packaged app smoke.
