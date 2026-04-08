# Lessons

- Create `tasks/todo.md` and keep it updated before starting non-trivial project work in this repo.
- Review or create `tasks/lessons.md` at the start of the session when working in this repo.
- When a user asks to verify that a launcher "really runs" and not just that a server opens, prove the runtime path with a live functional invocation, not only a process check or browser-visible page.
- On macOS, verify bundled Tauri apps via `open TeamForge.app` or Finder/LaunchServices, not by directly executing `TeamForge.app/Contents/MacOS/...`; direct binary launch can crash inside AppKit registration even when the bundle itself is healthy.
- When the user wants org structure or department mapping, prefer an in-app editable workflow over a one-off manual mapping outside the product.
- When adding a new provider integration, match the existing Settings UX and explicitly name the exact credential type the user must paste; generic "token" fields are too ambiguous.
- When surfacing third-party API failures in the app, preserve structured details like the exact missing scope instead of collapsing everything into a generic error string.
- When the user is mapping people to roles and departments, default to a visual roster-and-drop workflow; dense dropdowns are the wrong interaction model for org assignment.
