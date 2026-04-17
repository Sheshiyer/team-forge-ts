<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=0,1,2&height=200&text=TEAMFORGE&fontSize=60&fontAlignY=35&desc=LCARS%20Mission%20Control%20for%20Your%20Team&descAlignY=55&fontColor=ff9900" width="100%" />

```
  ____________  ___    __  ________  ____  ___  _____________
 /_  __/ __/  |/  /   / / / / __/ / / / / / _ \/ ___/ __/
  / / / _// /|_/ /   / /_/ /\ \/ /_/ / / / , _/ (_ / _/
 /_/ /___/_/  /_/    \____/___/\____/_/_/_/|_|\___/___/
       STARDATE 2026.098 — SYSTEMS NOMINAL
```

<!-- readme-gen:start:badges -->

![Build](https://img.shields.io/badge/build-passing-33cc66?style=flat-square&logo=rust&logoColor=white)
![Release](https://img.shields.io/github/v/tag/Sheshiyer/team-forge-ts?style=flat-square&color=ff9900)
![Platform](https://img.shields.io/badge/platform-macOS-ff9900?style=flat-square&logo=apple&logoColor=white)
![License](https://img.shields.io/github/license/Sheshiyer/team-forge-ts?style=flat-square&color=9999cc)
![Tauri](https://img.shields.io/badge/tauri-v2-cc6699?style=flat-square&logo=tauri&logoColor=white)
![React](https://img.shields.io/badge/react-19-6688cc?style=flat-square&logo=react&logoColor=white)
![Rust](https://img.shields.io/badge/rust-2021-cc9966?style=flat-square&logo=rust&logoColor=white)

<!-- readme-gen:end:badges -->

<!-- readme-gen:start:tech-stack -->
<p align="center">
  <img src="https://skillicons.dev/icons?i=tauri,react,rust,ts,sqlite,vite&theme=dark" alt="Tech Stack" />
</p>
<!-- readme-gen:end:tech-stack -->

</div>

---

> **Tracking your team shouldn't require switching between 6 browser tabs.** TeamForge unifies Clockify time tracking, Huly execution workflows, and a Cloudflare-backed TeamForge project control plane into a single native Mac applet — with a Star Trek LCARS interface that makes mission control feel like the bridge of the Enterprise.

<img src="https://capsule-render.vercel.app/api?type=rect&color=gradient&customColorList=0,1,2&height=1" width="100%" />

## Highlights

<table>
<tr>
<td width="50%" valign="top">

### Unified Time Intelligence
Cross-reference Clockify hours with Huly time reports. Spot discrepancies. Track quota compliance with business-day-aware calculations.

</td>
<td width="50%" valign="top">

### Live Presence Monitoring
30-second polling shows who has active Clockify timers and recent Huly activity. Combined status: Active, Idle, Offline.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### Canonical Project Control Plane
Cloudflare Worker + D1 now own TeamForge project identity, GitHub repo links, Huly project links, artifacts, and sync policy metadata.

</td>
<td width="50%" valign="top">

### Hybrid GitHub + Huly Orchestration
Engineering issues stay GitHub-owned, execution/admin issues stay Huly-owned, and milestones remain GitHub-authoritative by default.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### Weekly Timeline
Activity now rolls up into a compact 7-day timeline so you can read motion at the team level before diving into the raw feed.

</td>
<td width="50%" valign="top">

### Calendar Ops Route
Leave tracking and yearly holidays now live on a dedicated Calendar route, keeping schedule operations separate from org editing while still using the same cache-first Huly snapshot.

</td>
</tr>
</table>

<img src="https://capsule-render.vercel.app/api?type=rect&color=gradient&customColorList=0,1,2&height=1" width="100%" />

## New In v0.1.19

- **Projects execution loading is now isolated from the new control-plane fetch path** so opening the page no longer stalls `EXECUTION` mode while the TeamForge registry is still coming online.
- **Control-plane data now loads lazily when `CONTROL PLANE` is opened**, preserving the Worker-canonical project registry without blocking the legacy execution summary view.
- **Execution-mode first-load failures now surface a retry banner instead of an endless skeleton**, making startup races recoverable and visible from the installed app.
- **Release metadata is now at `0.1.19`** across the frontend package, sidecar package, Tauri config, and Rust crate.

<img src="https://capsule-render.vercel.app/api?type=rect&color=gradient&customColorList=0,1,2&height=1" width="100%" />

## Preview

### Overview

![TeamForge Overview](docs/images/preview-overview.png)

### Settings

![TeamForge Settings](docs/images/preview-settings.png)

### Activity

![TeamForge Activity](docs/images/preview-activity.png)

<img src="https://capsule-render.vercel.app/api?type=rect&color=gradient&customColorList=0,1,2&height=1" width="100%" />

## Quick Start

```bash
git clone https://github.com/Sheshiyer/team-forge-ts.git
cd team-forge-ts
pnpm install
cargo tauri dev
```

**Prerequisites:** Node.js 20+, Rust 1.75+, pnpm

On first launch:
1. Navigate to **Settings** (or `Cmd+=`)
2. Enter your **Clockify API key** and select workspace
3. Confirm or edit the **Ignored Clockify Emails** list
4. Enter your **Huly JWT token**
5. Paste the **Slack Bot User OAuth Token** (`xoxb-...`) if you want Slack-backed chat activity in **Comms**
6. Hit **Sync Now** — data populates across all views
7. Open **Projects** for execution summaries or the TeamForge control plane, **Team** for org mapping and employee summaries, then **Calendar** for leave and holiday operations

## Releases

- **Current app version in repo:** `0.1.19`
- **Latest published tag:** `v0.1.18`
- **Release trigger:** pushing a tag that matches `v*`
- **Artifacts:** macOS `.app` and `.dmg` bundles built by GitHub Actions for Apple Silicon and Intel targets
- **Download page:** [GitHub Releases](https://github.com/Sheshiyer/team-forge-ts/releases)

## Architecture

<!-- readme-gen:start:architecture -->
```mermaid
graph LR
    A["React Frontend<br/>WebView"] <-->|"Tauri IPC"| B["Rust Backend<br/>Tauri Core"]
    B -->|"reqwest"| C["Clockify REST API"]
    B -->|"JSON-RPC + REST"| D["Huly.io Transactor"]
    B -->|"HTTP"| E["Cloudflare Worker<br/>TeamForge API"]
    E <-->|"D1"| F[("Canonical Project Graph")]
    E -->|"Queues + DO Locks"| G["Sync Orchestration"]
    B <-->|"sqlx"| H[("SQLite Cache / Projection")]
    B -->|"30s/5m/60m"| I["Background Scheduler"]
    I --> C
    I --> D
    B -->|"Notifications"| J["macOS Alerts"]
    B -->|"Tray"| K["Menu Bar Icon"]
```
<!-- readme-gen:end:architecture -->

## Thoughtseed Data Flow

TeamForge becomes useful when it does more than just display API responses. The real value is in **cross-populating three layers of truth**:

1. **Clockify** answers who is working, for how long, and whether they are active right now.
2. **Huly** answers what the work is, why it matters, what changed, and who is blocked.
3. **Thoughtseed operating structure** answers how the work should be interpreted: client, project stream, sprint, onboarding flow, knowledge asset, and delivery rhythm.

```mermaid
graph TD
    C["Clockify<br/>time entries, timers, projects, users"] --> DB["SQLite mission cache"]
    H["Huly<br/>issues, milestones, departments, chat, meetings"] --> DB
    T["Thoughtseed operating model<br/>clients, onboarding flow, sprints, knowledge, devices"] -. enriches .-> DB

    DB --> O["Overview<br/>capacity, utilization, active crew"]
    DB --> L["Live<br/>real-time people check"]
    DB --> A["Activity<br/>weekly timeline + event feed"]
    DB --> S["Sprints / Insights<br/>delivery health"]
    DB --> TM["Team / Comms / Boards<br/>operating rhythm"]
```

### Cross-Population Strategy

- **People layer:** map Clockify users and Huly persons into one employee record so presence, work logs, and Huly activity can sit on the same card.
- **Time layer:** let Clockify remain the source of actual effort while Huly remains the source of task semantics and collaboration context.
- **Meaning layer:** enrich raw operational data with Thoughtseed concepts such as Axtech vs Tuya vs OASIS, client onboarding flow, knowledge article lineage, and sprint rhythm.
- **Fallback ops layer:** keep local SQLite-backed leave and holiday overrides available so the Team page still works when Huly HR coverage is incomplete or a manual correction is needed.
- **Dashboard layer:** expose the fused dataset differently by page, rather than trying to force every concept into one giant table.

### How This Maps Onto The Current Dashboard

- **Overview** should answer: Are we staffed correctly? Are people active? Are hours landing where they should?
- **Live** should answer: Who is actually moving right now?
- **Activity** should answer: What changed this week, and what is the shape of team motion over time?
- **Sprints / Insights** should answer: Are delivery promises, estimates, and priorities converging?
- **Team / Comms / Boards** should answer: Is the organization functioning, talking, and unblocking itself?

This is the intended direction for the Thoughtseed workspace normalization work tracked in the repository backlog.

## System Design

The rollout is now documented in-repo instead of living only in chat and GitHub issues:

- [Changelog](CHANGELOG.md)
- [Thoughtseed Huly System Design](docs/huly-system-design.md)
- [Huly Rollout Implementation Plan](docs/plans/2026-04-06-huly-rollout.md)
- [Cloudflare Project Sync Architecture](docs/plans/2026-04-17-cloudflare-project-sync-design.md)
- [Cloudflare Project Backend Implementation Plan](docs/plans/2026-04-17-cloudflare-project-backend-implementation.md)

The first Cloudflare control-plane tranche tracked in GitHub is now implemented on the current `0.1.19` line:

- milestone propagation from GitHub into Huly with drift-review conflict records
- Huly-owned execution/admin issue propagation
- GitHub-owned engineering issue propagation
- sync journal and conflict records for GitHub/Huly activity
- operator UI for registry editing, conflict review, classification overrides, and sync controls

## Dashboard Views

| View | Shortcut | Source | What It Shows |
|:-----|:--------:|:------:|:--------------|
| **Overview** | `Cmd+1` | Clockify | Quota compliance, team hours, utilization rate, metric cards |
| **Timesheet** | `Cmd+2` | Clockify | Time entries with employee/date filtering, CSV export |
| **Projects** | `Cmd+3` | Clockify + Worker | Per-project execution breakdown, utilization export, and TeamForge control-plane editing |
| **Sprints** | `Cmd+4` | Huly | Milestone tracking, progress bars, on-track/delayed status |
| **Insights** | `Cmd+5` | Both | Time discrepancies, estimation accuracy, priority queue health |
| **Team** | `Cmd+6` | Huly + SQLite | Drag-and-drop org chart mapping, department structure, and employee operations summaries |
| **Calendar** | `Cmd+7` | Huly + SQLite | Local leave tracking, yearly holiday management, and cache-first schedule ops |
| **Comms** | `Cmd+8` | Huly + Slack | Chat activity volume, meeting load with ratio analysis |
| **Boards** | `Cmd+9` | Huly | Kanban cards, days-in-status tracking, stuck card filtering |
| **Activity** | `Cmd+0` | Both | Weekly timeline, combined feed, engagement heatmap |
| **Live** | `Cmd+-` | Both | Real-time presence cards with auto-refresh |

## Project Structure

<!-- readme-gen:start:tree -->
```
team-forge-ts/
  DESIGN.md                    # Linear design system reference
  src/                         # React frontend
    components/ui/             # Avatar, Skeleton, DateRangePicker
    pages/                     # 12 app pages including Team + Calendar split
    hooks/                     # Typed Tauri invoke layer + viewport helpers
    stores/appStore.ts         # Zustand state
    lib/                       # Types, formatting, CSV export, shared LCARS page styles
  cloudflare/worker/           # Canonical TeamForge Worker + D1 control plane
  src-tauri/                   # Rust backend
    src/clockify/              # HTTP client, sync, rate limiter
    src/huly/                  # REST client, types, sync
    src/commands/              # Tauri command surface
    src/sync/                  # Background scheduler, alerts, TeamForge Worker bridge
    src/db/                    # SQLite cache/projection models, queries, migrations
    migrations/                # SQLite schema, including local Team calendar storage
  sidecar/                     # Node.js Huly SDK (reserved)
```
<!-- readme-gen:end:tree -->

## Huly Integration Details

TeamForge connects to Huly via **direct REST API calls** (no SDK required). We reverse-engineered the endpoint structure from the official `@hcengineering/api-client` source:

1. Fetch `huly.app/config.json` for accounts URL
2. JSON-RPC `selectWorkspace` call with JWT token
3. REST queries to transactor: `GET /api/v1/find-all/{workspace}?class=...`

| Huly Class | Integration |
|:-----------|:------------|
| `tracker:class:Issue` | Issue tracking, priority distribution, estimation accuracy |
| `tracker:class:Milestone` | Sprint/milestone progress |
| `tracker:class:TimeSpendReport` | Time logging cross-reference with Clockify |
| `hr:class:Department` | Organization structure |
| `hr:class:Request` | Leave/PTO tracking |
| `hr:class:Holiday` | Company holiday calendar |
| `chunter:class:ChunterMessage` | Chat activity metrics |
| `board:class:Card` | Kanban board card tracking |
| `calendar:class:Event` | Meeting load analysis |

## Sync Strategy

| Data | Source | Frequency |
|:-----|:------:|:---------:|
| Active timers | Clockify | 30s |
| Time entries | Clockify | 5 min |
| Summary reports | Clockify | 15 min |
| Users/Projects | Clockify | 60 min |
| Huly issues | Huly | 5 min |
| Huly presence | Huly | 60s |
| TeamForge project graph | Cloudflare Worker | On demand |

Cloudflare Worker + D1 are now the canonical source of truth for TeamForge project graph and sync policy state. Frontend reads still go through Tauri IPC, and local SQLite remains the desktop cache/offline projection for operational reads.

Menu bar quick actions:
- **Show TeamForge** brings the app to the front
- **Live Crew Check** jumps straight to the real-time presence view
- **Weekly Timeline** jumps to the last-7-days activity view
- **Sync Now** runs a manual sync sweep

<!-- readme-gen:start:health -->
## Project Health

| Category | Status | Score |
|:---------|:------:|------:|
| Type Safety | ████████████████████ | 100% |
| Build | ████████████████████ | 100% |
| Architecture | ██████████████████░░ | 90% |
| Documentation | ████████████████░░░░ | 80% |
| Tests | ████████░░░░░░░░░░░░ | 40% |

> **Overall: 82%** — Operational
<!-- readme-gen:end:health -->

<img src="https://capsule-render.vercel.app/api?type=rect&color=gradient&customColorList=0,1,2&height=1" width="100%" />

## Contributing

Contributions welcome. Please open an issue first to discuss what you'd like to change.

```bash
# Development
pnpm install
cargo tauri dev

# Build for production
cargo tauri build
```

## License

ISC

<!-- readme-gen:start:footer -->
<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=0,1,2&height=100&section=footer" width="100%" />

**Built by [Thoughtseed](https://thoughtseed.com) | Powered by Clockify + Huly.io**

</div>
<!-- readme-gen:end:footer -->
