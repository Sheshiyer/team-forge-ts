# Lessons

- Create `tasks/todo.md` and keep it updated before starting non-trivial project work in this repo.
- Review or create `tasks/lessons.md` at the start of the session when working in this repo.
- When a user asks to verify that a launcher "really runs" and not just that a server opens, prove the runtime path with a live functional invocation, not only a process check or browser-visible page.
- On macOS, verify bundled Tauri apps via `open TeamForge.app` or Finder/LaunchServices, not by directly executing `TeamForge.app/Contents/MacOS/...`; direct binary launch can crash inside AppKit registration even when the bundle itself is healthy.
- When the user wants org structure or department mapping, prefer an in-app editable workflow over a one-off manual mapping outside the product.
- When adding a new provider integration, match the existing Settings UX and explicitly name the exact credential type the user must paste; generic "token" fields are too ambiguous.
- When surfacing third-party API failures in the app, preserve structured details like the exact missing scope instead of collapsing everything into a generic error string.
- When the user is mapping people to roles and departments, default to a visual roster-and-drop workflow; dense dropdowns are the wrong interaction model for org assignment.
- When ignore/exclusion controls affect synced people, do not rely only on email addresses; provide a roster-based selector because Huly-sourced people may not have usable email fields.
- For Team data, a reduced number of live API calls is not enough; the page needs a persistent SQLite-backed cache and must render from cached data instead of blocking on Huly availability.
- When a page uses `useInvoke`, do not put the returned object directly into effect dependencies; stabilize the invoke surface first or the page can get stuck in a re-render / refresh loop that looks like endless loading.
- Huly workspaces do not always expose every class used by optional modules; Team-facing `find_all` calls for HR data must degrade gracefully on `404 INVALID CLASS NAME` instead of failing the whole snapshot refresh.
- When the Team page already shows leave and holiday data, users expect to manage local leave and yearly holiday tracking directly there; do not hide that workflow in a separate screen or depend on optional Huly HR modules for basic editing.
- For LCARS screens, avoid generic dashboard cards and boxed admin panels; build the interface from segmented rails, bands, strips, and console sections that feel native to the Star Trek shell already in the app.
- When the user asks for an overall design consistency overhaul, do not narrow the work to the page they mentioned first; audit and improve the shared shell, common controls, spacing system, and cross-page visual language together.
