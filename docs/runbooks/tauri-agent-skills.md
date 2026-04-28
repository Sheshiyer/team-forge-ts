# Tauri Agent Skills

TeamForge uses the community Tauri skill bundle from
`dchuk/claude-code-tauri-skills` as the reusable workflow reference for Tauri
app work.

## Refresh The Installed Suite

Run the repo-local wrapper instead of memorizing the raw install command:

```bash
pnpm skills:tauri:refresh
```

This wraps:

```bash
npx skills add dchuk/claude-code-tauri-skills -y -g
```

After refresh, restart Codex so a new session can discover the newly installed
skills.

## List The Installed Tauri Skills

```bash
pnpm skills:tauri:list
```

The list script reads the repo manifest at `config/tauri-skill-suite.txt`, then
checks those exact skill names in `AGENT_SKILLS_HOME` when set, otherwise in
the default global store at `~/.agents/skills`.

In this workstation setup:

- Codex home resolves to `~/.codex`
- `~/.codex/skills` points at `~/.claude/skills`
- the installed Tauri skill suite currently lands in `~/.agents/skills`

## Skill Names To Reference

Use these skill names directly in implementation prompts and workflow notes:

| Workflow | Skill Names |
| --- | --- |
| Project bootstrap | `setting-up-tauri-projects`, `configuring-tauri-apps` |
| Frontend and Rust IPC | `calling-rust-from-tauri-frontend`, `calling-frontend-from-tauri-rust`, `listening-to-tauri-events`, `understanding-tauri-ipc` |
| Security and authority | `configuring-tauri-capabilities`, `configuring-tauri-permissions`, `configuring-tauri-scopes`, `configuring-tauri-csp`, `understanding-tauri-runtime-authority` |
| Sidecars and resources | `embedding-tauri-sidecars`, `running-nodejs-sidecar-in-tauri`, `managing-tauri-app-resources` |
| Debug and test | `debugging-tauri-apps`, `testing-tauri-apps`, `updating-tauri-dependencies` |
| Build and release | `building-tauri-with-github-actions`, `signing-tauri-apps`, `distributing-tauri-for-macos` |

## Workflow Usage

Reference the skills by name when the task touches those surfaces:

- Use `building-tauri-with-github-actions` before editing
  `.github/workflows/release.yml` or any Tauri packaging workflow.
- For TeamForge release validation, treat `.github/workflows/release.yml` as
  the canonical OTA signing and publication path; local `cargo tauri build`
  checks bundle integrity, but updater signing is expected to run in CI unless
  the local signing key is intentionally configured.
- Use `configuring-tauri-capabilities`,
  `configuring-tauri-permissions`, and `configuring-tauri-scopes` before
  changing `src-tauri/capabilities` or command exposure.
- Use `testing-tauri-apps` when adding or changing Tauri IPC flows, shell
  integration, or native resource handling.
- Use `debugging-tauri-apps` first when a problem only reproduces inside the
  desktop shell and not in the browser-only React app.
- Use `embedding-tauri-sidecars` and `running-nodejs-sidecar-in-tauri` before
  changing TeamForge sidecar launch behavior.

## Verification

Expected local checks:

```bash
pnpm skills:tauri:list
pnpm skills:tauri:refresh
```

The current manifest for `dchuk/claude-code-tauri-skills` contains 39 skills.
