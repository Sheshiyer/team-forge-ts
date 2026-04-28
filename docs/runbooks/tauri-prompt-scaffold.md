# Tauri Prompt Scaffold

Use this runbook when you want Codex to explicitly apply the repo-pinned Tauri
skill suite together with TeamForge's local process rules, lessons, and docs.

## Full Scaffold

```md
Use the repo-pinned Tauri skill workflow for this task.

Before doing any implementation:
1. Read `tasks/lessons.md` and apply the relevant lessons.
2. Read `tasks/todo.md`, then update it with a fresh checkable plan before non-trivial work.
3. Read `docs/runbooks/tauri-agent-skills.md` and `config/tauri-skill-suite.txt`, then open the `SKILL.md` files for the exact Tauri skills you selected.
4. Read any relevant repo docs for this area, especially `docs/plans/*`, runbooks, and related architecture notes.
5. If `.context/*` or any GSD-specific artifacts exist in this repo/session, read the relevant ones too. If they do not exist, say that briefly and continue without blocking.

Tauri skill requirement:
- Explicitly choose the exact Tauri skills you are using from the pinned suite and say why.
- If no implementation-specific Tauri skill actually fits the task, say that explicitly instead of inventing one.
- Do not use generic Tauri advice when a matching installed skill exists.
- Prefer the smallest set of relevant skills for the task.

Skill routing:
- IPC / commands / frontend-Rust bridge:
  `calling-rust-from-tauri-frontend`, `calling-frontend-from-tauri-rust`, `listening-to-tauri-events`, `understanding-tauri-ipc`
- Capabilities / permissions / authority:
  `configuring-tauri-capabilities`, `configuring-tauri-permissions`, `configuring-tauri-scopes`, `understanding-tauri-runtime-authority`, `configuring-tauri-csp`
- Sidecars / local processes / resources:
  `embedding-tauri-sidecars`, `running-nodejs-sidecar-in-tauri`, `managing-tauri-app-resources`
- Debugging / verification:
  `debugging-tauri-apps`, `testing-tauri-apps`, `updating-tauri-dependencies`
- Build / release / signing:
  `building-tauri-with-github-actions`, `signing-tauri-apps`, `distributing-tauri-for-macos`

Execution rules:
- Follow the repo’s AGENTS workflow and lessons, not just the task text.
- Keep changes minimal and root-cause oriented.
- Do not invent new abstractions if the existing TeamForge patterns already solve it.
- If the requested Tauri skills are not available in the current session, say that explicitly and fall back to the repo Tauri runbook; if they were just installed, note that Codex restart is required.
- If the task changes shape or a blocker appears, stop and re-plan in `tasks/todo.md` instead of pushing through stale assumptions.
- Verify before calling the work done.
- If I correct you during the task, update `tasks/lessons.md` with the new lesson.

For this task:
- Goal: [describe the end state]
- Scope: [route / feature / files / subsystem]
- Constraints: [product, UX, architecture, security, release, etc.]
- Verification: [commands to run, behaviors to prove, screenshots if needed]
- Deliverable: [code change, review, fix, doc, release step, etc.]

Response format I want from you:
1. Briefly state which Tauri skills and repo docs you are using.
2. Summarize the plan you added to `tasks/todo.md`.
3. Implement the change.
4. Verify it with concrete commands or runtime proof.
5. End with a concise summary, risks, and any follow-up.
```

## Short Scaffold

```md
Use the pinned Tauri skills for this task. First read `tasks/lessons.md`, `tasks/todo.md`, `docs/runbooks/tauri-agent-skills.md`, `config/tauri-skill-suite.txt`, the `SKILL.md` files for the exact Tauri skills you selected, and any relevant `docs/plans/*`. If `.context/*` or GSD artifacts exist, use them; if not, note that and continue.

Explicitly name the Tauri skills you selected and why. If no implementation-specific Tauri skill applies, say that explicitly instead of forcing one. If those skills are not available in the current session, say that and fall back to the repo runbook. Update `tasks/todo.md` before non-trivial work, re-plan there if blockers appear, verify before done, and update `tasks/lessons.md` if I correct you.

Task:
[insert task]

Verification:
[insert required proof]
```

## Notes

- This scaffold assumes the Tauri skill bundle from
  `dchuk/claude-code-tauri-skills` has already been installed.
- Repo-specific install and verification commands live in
  `docs/runbooks/tauri-agent-skills.md`.
- The pinned 39-skill manifest lives at `config/tauri-skill-suite.txt`.
