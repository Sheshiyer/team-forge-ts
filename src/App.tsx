import { useEffect, useMemo, useState, useCallback } from "react";
import { Routes, Route, NavLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { checkForUpdate, isUpdaterSupported } from "./lib/updater";
import Overview from "./pages/Overview";
import Inbox from "./pages/Inbox";
import Timesheet from "./pages/Timesheet";
import Projects from "./pages/Projects";
import Sprints from "./pages/Sprints";
import Insights from "./pages/Insights";
import Team from "./pages/Team";
import Calendar from "./pages/Calendar";
import Comms from "./pages/Comms";
import Boards from "./pages/Boards";
import Activity from "./pages/Activity";
import Agents from "./pages/Agents";
import Settings from "./pages/Settings";
import Clients from "./pages/Clients";
import Issues from "./pages/Issues";
import Routines from "./pages/Routines";
import Goals from "./pages/Goals";
import Knowledge from "./pages/Knowledge";
import Onboarding from "./pages/Onboarding";
import MissionCortexPage from "./pages/MissionCortexPage";
import Avatar from "./components/ui/Avatar";
import DateRangePicker from "./components/ui/DateRangePicker";
import CommandPalette from "./components/ui/CommandPalette";
import type { CommandItem } from "./components/ui/CommandPalette";
import { useViewportWidth } from "./hooks/useViewportWidth";
import { useAppStore } from "./stores/appStore";
import type { NotificationItem, PaperclipStartupResult, PresenceStatus } from "./lib/types";

const navSections = [
  {
    label: "MISSION CONTROL",
    color: "var(--lcars-orange)",
    items: [
      { path: "/mission-cortex", label: "Cortex", icon: "✺" },
      { path: "/", label: "Overview", icon: "◈" },
      { path: "/agents", label: "Agents", icon: "⬢" },
      { path: "/inbox", label: "Inbox", icon: "✉" },
      { path: "/projects", label: "Projects", icon: "▣" },
    ],
  },
  {
    label: "PORTFOLIO",
    color: "var(--lcars-cyan)",
    items: [
      { path: "/clients", label: "Clients", icon: "◇" },
      { path: "/issues", label: "Issues", icon: "⬡" },
      { path: "/onboarding", label: "Onboarding", icon: "▷" },
      { path: "/activity", label: "Activity", icon: "◫" },
      { path: "/team", label: "Team", icon: "⧫" },
    ],
  },
  {
    label: "SYS",
    color: "var(--lcars-lavender)",
    items: [{ path: "/settings", label: "Settings", icon: "⚙" }],
  },
];

// Secondary pages reachable via palette but not sidebar (reduces nav noise).
const paletteOnlyPages: CommandItem[] = [
  { id: "page:timesheet", label: "Timesheet", section: "PAGES", icon: "→", action: () => {} },
  { id: "page:sprints", label: "Sprints", section: "PAGES", icon: "→", action: () => {} },
  { id: "page:insights", label: "Insights", section: "PAGES", icon: "→", action: () => {} },
  { id: "page:calendar", label: "Calendar", section: "PAGES", icon: "→", action: () => {} },
  { id: "page:comms", label: "Comms", section: "PAGES", icon: "→", action: () => {} },
  { id: "page:routines", label: "Routines", section: "PAGES", icon: "→", action: () => {} },
  { id: "page:goals", label: "Goals", section: "PAGES", icon: "→", action: () => {} },
  { id: "page:knowledge", label: "Skills", section: "PAGES", icon: "→", action: () => {} },
  { id: "page:boards", label: "Boards", section: "PAGES", icon: "→", action: () => {} },
];

const classicFallbackPages = [
  { path: "/classic/overview", label: "Classic Overview" },
  { path: "/classic/inbox", label: "Classic Inbox" },
  { path: "/classic/agents", label: "Classic Agents" },
  { path: "/classic/projects", label: "Classic Projects" },
  { path: "/classic/clients", label: "Classic Clients" },
  { path: "/classic/issues", label: "Classic Issues" },
  { path: "/classic/onboarding", label: "Classic Onboarding" },
  { path: "/classic/activity", label: "Classic Activity" },
  { path: "/classic/team", label: "Classic Team" },
  { path: "/classic/timesheet", label: "Classic Timesheet" },
  { path: "/classic/sprints", label: "Classic Sprints" },
  { path: "/classic/insights", label: "Classic Insights" },
  { path: "/classic/calendar", label: "Classic Calendar" },
  { path: "/classic/comms", label: "Classic Comms" },
  { path: "/classic/routines", label: "Classic Routines" },
  { path: "/classic/goals", label: "Classic Goals" },
  { path: "/classic/knowledge", label: "Classic Skills" },
  { path: "/classic/boards", label: "Classic Boards" },
  { path: "/classic/settings", label: "Classic Settings" },
];

const cortexRoutePrefixes = [
  "/mission-cortex",
  "/agents",
  "/inbox",
  "/projects",
  "/clients",
  "/issues",
  "/onboarding",
  "/activity",
  "/team",
  "/timesheet",
  "/sprints",
  "/insights",
  "/calendar",
  "/comms",
  "/boards",
  "/routines",
  "/goals",
  "/knowledge",
  "/settings",
  "/devices",
  "/planner",
  "/live",
];

function isCommandCortexPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return cortexRoutePrefixes.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

function getStardate(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);
  return `STARDATE ${now.getFullYear()}.${String(dayOfYear).padStart(3, "0")}`;
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const viewportWidth = useViewportWidth();
  const [teamPresence, setTeamPresence] = useState<PresenceStatus[]>([]);
  const [appVersion, setAppVersion] = useState<string>("--");
  const dateRange = useAppStore((s) => s.dateRange);
  const setDateRange = useAppStore((s) => s.setDateRange);
  const [syncActive, setSyncActive] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paperclipAlive, setPaperclipAlive] = useState<boolean | null>(null);
  const [paperclipUiUrl, setPaperclipUiUrl] = useState("http://127.0.0.1:3131");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isTightShell = viewportWidth < 1240;
  const isCompactShell = viewportWidth < 1080;
  const sidebarExpandedWidth = isCompactShell ? 208 : isTightShell ? 224 : 240;
  const sidebarWidth = sidebarCollapsed ? 52 : sidebarExpandedWidth;
  const visiblePresence = teamPresence.slice(0, isCompactShell ? 6 : 8);
  const isCortexRoute = isCommandCortexPath(location.pathname);

  // Paperclip heartbeat polling every 15s
  useEffect(() => {
    const checkHeartbeat = async () => {
      try {
        await invoke<unknown>("probe_paperclip_api");
        setPaperclipAlive(true);
      } catch {
        setPaperclipAlive(false);
      }
    };
    const timer = setTimeout(checkHeartbeat, 3000);
    const interval = setInterval(checkHeartbeat, 15000);
    return () => { clearTimeout(timer); clearInterval(interval); };
  }, []);

  // Load Paperclip UI URL from settings
  useEffect(() => {
    invoke<Record<string, string>>("get_settings")
      .then((s) => { if (s.paperclip_ui_url) setPaperclipUiUrl(s.paperclip_ui_url); })
      .catch(() => {});
  }, []);

  // Notification feed polling every 60s
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);

  const refreshNotifications = useCallback(async () => {
    try {
      const feed = await invoke<NotificationItem[]>("get_notification_feed");
      setNotifications(feed);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    const timer = setTimeout(refreshNotifications, 5000);
    const interval = setInterval(refreshNotifications, 60000);
    return () => { clearTimeout(timer); clearInterval(interval); };
  }, [refreshNotifications]);

  const dismissNotif = async (key: string) => {
    try {
      await invoke<void>("dismiss_notification", { notificationKey: key });
      setNotifications((prev) => prev.filter((n) => n.key !== key));
    } catch { /* silent */ }
  };

  // Cloud credential sync on launch (enabled by default, opt-out via settings)
  useEffect(() => {
    let cancelled = false;

    const maybeSyncCloudCredentials = async () => {
      try {
        const settings = await invoke<Record<string, string>>("get_settings");
        if (settings.cloud_credential_sync_enabled === "false") {
          return;
        }

        const result = await invoke<unknown>("sync_cloud_credentials");
        if (!cancelled) {
          console.log("[teamforge] cloud credential sync:", result);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("[teamforge] cloud credential sync skipped:", err);
        }
      }
    };

    maybeSyncCloudCredentials();

    return () => {
      cancelled = true;
    };
  }, []);

  // Local Paperclip runtime startup on launch
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      invoke<PaperclipStartupResult>("ensure_paperclip_runtime_started")
        .then((result) => {
          if (cancelled) return;
          if (result.scriptStatus !== "skipped" || result.adapterStatus !== "skipped") {
            console.log("[teamforge] paperclip startup:", result);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            console.warn("[teamforge] paperclip startup skipped:", err);
          }
        });
    }, 1200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // Background sync on launch
  useEffect(() => {
    const timer = setTimeout(() => {
      setSyncActive(true);
      invoke<string>("start_background_sync")
        .catch(() => {})
        .finally(() => setSyncActive(false));
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // Presence polling every 30s
  useEffect(() => {
    const fetchPresence = async () => {
      try {
        const presence = await invoke<PresenceStatus[]>("get_presence_status");
        setTeamPresence(presence);
      } catch {
        // ignore
      }
    };
    fetchPresence();
    const interval = setInterval(fetchPresence, 30000);
    return () => clearInterval(interval);
  }, []);

  // Command palette items
  const commandItems: CommandItem[] = useMemo(() => {
    const nav: CommandItem[] = navSections.flatMap((section) =>
      section.items.map((item) => ({
        id: `nav:${item.path}`,
        label: item.label,
        section: section.label,
        icon: "→",
        action: () => navigate(item.path),
      })),
    );

    const secondary: CommandItem[] = paletteOnlyPages.map((p) => ({
      ...p,
      action: () => navigate(p.id.replace("page:", "/")),
    }));

    const classicFallbacks: CommandItem[] = classicFallbackPages.map((page) => ({
      id: `classic:${page.path}`,
      label: page.label,
      section: "CLASSIC FALLBACKS",
      icon: "↩",
      action: () => navigate(page.path),
    }));

    const actions: CommandItem[] = [
      {
        id: "action:sync-all",
        label: "Sync All Sources",
        section: "ACTIONS",
        icon: "⟳",
        shortcut: "⌘R",
        action: () => { invoke("trigger_sync").catch(() => {}); },
      },
      {
        id: "action:sync-slack",
        label: "Sync Slack Now",
        section: "ACTIONS",
        icon: "💬",
        action: () => { invoke("trigger_slack_sync").catch(() => {}); },
      },
      {
        id: "action:sync-huly",
        label: "Sync Huly Now",
        section: "ACTIONS",
        icon: "📋",
        action: () => { invoke("trigger_huly_sync").catch(() => {}); },
      },
      {
        id: "action:sync-github",
        label: "Sync GitHub Plans",
        section: "ACTIONS",
        icon: "🐙",
        action: () => { invoke("sync_github_plans").catch(() => {}); },
      },
      {
        id: "action:launch-paperclip",
        label: "Launch Paperclip",
        section: "ACTIONS",
        icon: "📎",
        action: () => { invoke("ensure_paperclip_runtime_started").catch(() => {}); },
      },
      {
        id: "action:open-paperclip-ui",
        label: "Open Paperclip UI",
        section: "ACTIONS",
        icon: "🖥",
        action: () => { invoke("open_paperclip_ui", { url: paperclipUiUrl }).catch(() => {}); },
      },
      {
        id: "action:vault-sync",
        label: "Sync Vault to TeamForge",
        section: "ACTIONS",
        icon: "📂",
        action: () => { invoke("sync_local_vault_to_teamforge").catch(() => {}); },
      },
      {
        id: "action:check-update",
        label: "Check for Updates",
        section: "SYSTEM",
        icon: "↑",
        action: () => navigate("/settings"),
      },
    ];

    return [...nav, ...actions, ...secondary, ...classicFallbacks];
  }, [navigate]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === "k") {
          e.preventDefault();
          if (isCortexRoute) {
            window.dispatchEvent(new CustomEvent("cortex:focus-command"));
            return;
          }
          setPaletteOpen((prev) => !prev);
          return;
        }
        if (e.key === "b") {
          e.preventDefault();
          setSidebarCollapsed((prev) => !prev);
          return;
        }
        const routes = [
          "/", "/agents", "/inbox", "/projects", "/clients",
          "/issues", "/onboarding", "/activity", "/team", "/settings",
        ];
        const num = parseInt(e.key);
        if (num >= 1 && num <= 9) {
          e.preventDefault();
          navigate(routes[num - 1]);
        }
        if (e.key === "0") {
          e.preventDefault();
          navigate(routes[9]);
        }
        if (e.key === "r") {
          e.preventDefault();
          invoke("trigger_sync").catch(() => {});
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCortexRoute, navigate]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const bind = async () => {
      unlisten = await listen<string>("tray:navigate", (event) => {
        navigate(event.payload);
      });
    };

    bind();
    return () => {
      unlisten?.();
    };
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;

    getVersion()
      .then((version) => {
        if (!cancelled) {
          setAppVersion(version);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAppVersion("--");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Silent update check on mount
  useEffect(() => {
    if (!isUpdaterSupported()) return;
    let cancelled = false;
    const check = async () => {
      try {
        const result = await checkForUpdate();
        if (!cancelled && result) setUpdateAvailable(true);
      } catch { /* silent */ }
    };
    check();
    return () => { cancelled = true; };
  }, []);

  if (isCortexRoute) {
    return (
      <div className="cortex-app-frame">
        <Routes>
          <Route path="/" element={<MissionCortexPage />} />
          <Route path="/mission-cortex" element={<MissionCortexPage />} />
          <Route path="/agents/*" element={<MissionCortexPage />} />
          <Route path="/inbox" element={<MissionCortexPage />} />
          <Route path="/projects/*" element={<MissionCortexPage />} />
          <Route path="/clients/*" element={<MissionCortexPage />} />
          <Route path="/issues/*" element={<MissionCortexPage />} />
          <Route path="/onboarding" element={<MissionCortexPage />} />
          <Route path="/activity/*" element={<MissionCortexPage />} />
          <Route path="/team/*" element={<MissionCortexPage />} />
          <Route path="/timesheet" element={<MissionCortexPage />} />
          <Route path="/sprints" element={<MissionCortexPage />} />
          <Route path="/insights" element={<MissionCortexPage />} />
          <Route path="/calendar" element={<MissionCortexPage />} />
          <Route path="/comms" element={<MissionCortexPage />} />
          <Route path="/boards" element={<MissionCortexPage />} />
          <Route path="/routines" element={<MissionCortexPage />} />
          <Route path="/goals" element={<MissionCortexPage />} />
          <Route path="/knowledge" element={<MissionCortexPage />} />
          <Route path="/settings" element={<MissionCortexPage />} />
          <Route path="/devices" element={<Navigate to="/issues" replace />} />
          <Route path="/planner" element={<Navigate to="/team/capacity" replace />} />
          <Route path="/live" element={<Navigate to="/agents" replace />} />
          <Route path="*" element={<Navigate to="/mission-cortex" replace />} />
        </Routes>
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          items={commandItems}
        />
      </div>
    );
  }

  return (
    <div style={styles.shell}>
      {/* ── LCARS Sidebar ── */}
      <aside
        style={{
          ...styles.sidebar,
          width: sidebarWidth,
          transition: "width 0.2s ease",
        }}
      >
        {/* ── Top Elbow: orange header bar ── */}
        <div style={{
          ...styles.sidebarTopBar,
          padding: sidebarCollapsed ? "0 6px" : "0 16px",
          justifyContent: sidebarCollapsed ? "center" : "space-between",
        }}>
          {!sidebarCollapsed && (
            <span style={styles.logoText}>TEAMFORGE</span>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            style={styles.collapseBtn}
            title={sidebarCollapsed ? "Expand (⌘B)" : "Collapse (⌘B)"}
          >
            {sidebarCollapsed ? "▸" : "◂"}
          </button>
        </div>

        {/* ── LCARS Elbow Connector ── */}
        <div style={{
          display: "flex",
          flexShrink: 0,
          height: sidebarCollapsed ? 4 : 28,
          transition: "height 0.2s ease",
        }}>
          <div style={{
            width: sidebarCollapsed ? 6 : 28,
            background: "var(--lcars-orange)",
            transition: "width 0.2s ease",
          }} />
          {!sidebarCollapsed && (
            <div style={{
              width: 28,
              height: 28,
              background: "var(--lcars-orange)",
              borderRadius: "0 0 18px 0",
              position: "relative" as const,
            }}>
              <div style={{
                position: "absolute" as const,
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(10, 10, 26, 0.98)",
                borderRadius: "0 0 18px 0",
                margin: "0 0 6px 6px",
              }} />
            </div>
          )}
          {!sidebarCollapsed && (
            <div style={{ flex: 1, height: 6, background: "var(--lcars-orange)", alignSelf: "flex-start" }} />
          )}
        </div>

        {/* ── Nav Sections ── */}
        <nav style={styles.nav}>
          {navSections.map((section, si) => (
            <div key={section.label}>
              <div style={{
                height: sidebarCollapsed ? 4 : 20,
                background: section.color,
                borderRadius: sidebarCollapsed ? "0 2px 2px 0" : "0 10px 10px 0",
                marginRight: sidebarCollapsed ? 6 : 14,
                marginLeft: sidebarCollapsed ? 6 : 0,
                display: "flex",
                alignItems: "center",
                paddingLeft: sidebarCollapsed ? 0 : 12,
                marginTop: si > 0 ? 6 : 2,
                marginBottom: 2,
                transition: "height 0.2s ease",
                overflow: "hidden",
              }}>
                {!sidebarCollapsed && (
                  <span style={styles.sectionBarLabel}>{section.label}</span>
                )}
              </div>

              {section.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === "/"}
                  title={sidebarCollapsed ? item.label : undefined}
                  style={({ isActive }) => ({
                    display: "flex",
                    alignItems: "center",
                    gap: sidebarCollapsed ? 0 : 10,
                    justifyContent: sidebarCollapsed ? "center" : "flex-start",
                    padding: sidebarCollapsed ? "7px 0" : "6px 12px 6px 16px",
                    fontSize: sidebarCollapsed ? 15 : 11,
                    fontWeight: 500,
                    textDecoration: "none",
                    fontFamily: "'Orbitron', sans-serif",
                    letterSpacing: sidebarCollapsed ? 0 : "1.5px",
                    color: isActive ? "var(--lcars-orange)" : "var(--lcars-lavender)",
                    borderLeft: sidebarCollapsed
                      ? "none"
                      : isActive
                        ? `4px solid ${section.color}`
                        : "4px solid transparent",
                    backgroundColor: isActive ? "rgba(255, 153, 0, 0.08)" : "transparent",
                    transition: "background-color 0.15s, color 0.15s",
                  })}
                >
                  <span style={{
                    display: "inline-block",
                    width: sidebarCollapsed ? "auto" : 16,
                    textAlign: "center" as const,
                    fontSize: sidebarCollapsed ? 15 : 12,
                    lineHeight: 1,
                    flexShrink: 0,
                  }}>
                    {item.icon}
                  </span>
                  {!sidebarCollapsed && (
                    <span>{item.label.toUpperCase()}</span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* ── Crew Presence ── */}
        {!sidebarCollapsed && teamPresence.length > 0 && (
          <div style={styles.teamSection}>
            <div style={styles.teamBar}>
              <span style={styles.sectionBarLabel}>CREW</span>
            </div>
            {visiblePresence.map((p) => (
              <div key={p.employeeName} style={styles.teamMember}>
                <Avatar name={p.employeeName} size={20} />
                <span style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  flexShrink: 0,
                  backgroundColor: p.combinedStatus === "active"
                    ? "var(--lcars-green)"
                    : p.combinedStatus === "idle"
                      ? "var(--lcars-yellow)"
                      : "var(--text-quaternary)",
                  boxShadow: p.combinedStatus === "active"
                    ? "0 0 6px rgba(51, 204, 102, 0.5)"
                    : "none",
                }} />
                <span style={styles.crewName}>{p.employeeName}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Quick Actions Panel ── */}
        <div style={styles.actionsPanel}>
          {!sidebarCollapsed && (
            <div style={styles.actionsPanelBar}>
              <span style={styles.sectionBarLabel}>ACTIONS</span>
            </div>
          )}
          <div style={{
            display: "flex",
            flexDirection: sidebarCollapsed ? "column" : "row" as const,
            gap: 3,
            padding: sidebarCollapsed ? "4px 6px" : "4px 10px 6px",
          }}>
            <button
              type="button"
              onClick={() => invoke("ensure_paperclip_runtime_started").catch(() => {})}
              title={paperclipAlive ? "Paperclip running" : "Launch Paperclip"}
              style={{
                ...styles.actionBtn,
                borderColor: paperclipAlive ? "rgba(51,204,102,0.3)" : "rgba(255,153,0,0.3)",
                color: paperclipAlive ? "var(--lcars-green)" : "var(--lcars-orange)",
              }}
            >
              {sidebarCollapsed ? "📎" : "📎 LAUNCH"}
            </button>
            <button
              type="button"
              onClick={() => invoke("open_paperclip_ui", { url: paperclipUiUrl }).catch(() => {})}
              disabled={!paperclipAlive}
              title={paperclipAlive ? "Open Paperclip UI" : "Paperclip offline — launch first"}
              style={{
                ...styles.actionBtn,
                opacity: paperclipAlive ? 1 : 0.35,
                cursor: paperclipAlive ? "pointer" : "not-allowed",
              }}
            >
              {sidebarCollapsed ? "🖥" : "🖥 UI"}
            </button>
            <button
              type="button"
              onClick={() => { setSyncActive(true); invoke("trigger_sync").catch(() => {}).finally(() => setSyncActive(false)); }}
              title="Sync all sources"
              style={{
                ...styles.actionBtn,
                color: syncActive ? "var(--lcars-cyan)" : "var(--lcars-tan)",
                borderColor: syncActive ? "rgba(0,204,255,0.4)" : "rgba(153,153,204,0.2)",
              }}
            >
              {sidebarCollapsed ? "⟳" : (syncActive ? "⟳ …" : "⟳ SYNC")}
            </button>
          </div>
        </div>

        {/* ── Bottom Status Strip ── */}
        <div style={styles.bottomStrip}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              flexShrink: 0,
              background: paperclipAlive === null
                ? "var(--lcars-yellow)"
                : paperclipAlive
                  ? "var(--lcars-green)"
                  : "var(--lcars-red)",
              boxShadow: paperclipAlive
                ? "0 0 8px rgba(51,204,102,0.6)"
                : "none",
            }}
            title={paperclipAlive === null ? "Checking…" : paperclipAlive ? "Paperclip online" : "Paperclip offline"}
          />
          {!sidebarCollapsed && (
            <>
              <span style={styles.bottomLabel}>v{appVersion}</span>
              {updateAvailable && (
                <span onClick={() => navigate("/settings")} style={styles.updatePill} title="Update available">
                  ↑ UPDATE
                </span>
              )}
            </>
          )}
          {sidebarCollapsed && updateAvailable && (
            <span onClick={() => navigate("/settings")} style={{ ...styles.updatePill, fontSize: 7, padding: "1px 3px" }} title="Update available">↑</span>
          )}
        </div>

        {/* ── Bottom LCARS Bar ── */}
        <div style={{
          height: sidebarCollapsed ? 16 : 28,
          background: "linear-gradient(90deg, var(--lcars-tan), #d7a677)",
          borderRadius: "0 14px 0 0",
          flexShrink: 0,
          transition: "height 0.2s ease",
        }} />
      </aside>

      <main style={styles.main}>
        {/* LCARS Top Bar */}
        <div
          style={{
            ...styles.topBar,
            height: isCompactShell ? 44 : 36,
            flexWrap: isCompactShell ? ("wrap" as const) : ("nowrap" as const),
            rowGap: isCompactShell ? 6 : 0,
          }}
        >
          <div style={styles.topBarLeft}>
            <div style={styles.topBarEndcap} />
            <span
              style={{
                ...styles.stardateText,
                fontSize: isCompactShell ? 10 : 11,
                letterSpacing: isCompactShell ? "2px" : "3px",
                padding: isCompactShell ? "0 10px" : "0 16px",
              }}
            >
              {getStardate()}
            </span>
            <div style={styles.topBarLine} />
          </div>
          <div
            style={{
              ...styles.topBarRight,
              gap: isCompactShell ? 8 : 12,
              paddingRight: isCompactShell ? 0 : styles.topBarRight.paddingRight,
            }}
          >
            {/* Status indicators */}
            <div
              style={{
                ...styles.statusIndicators,
                paddingRight: isCompactShell ? 2 : 8,
              }}
            >
              <span
                style={{
                  ...styles.statusDot,
                  backgroundColor: "var(--lcars-green)",
                  boxShadow: "0 0 6px rgba(51, 204, 102, 0.5)",
                  animation: "lcars-pulse 2s ease-in-out infinite",
                }}
                title="System Online"
              />
              <span
                style={{
                  ...styles.statusDot,
                  backgroundColor: syncActive
                    ? "var(--lcars-cyan)"
                    : "var(--text-quaternary)",
                  boxShadow: syncActive
                    ? "0 0 6px rgba(0, 204, 255, 0.5)"
                    : "none",
                  animation: syncActive
                    ? "lcars-pulse 1s ease-in-out infinite"
                    : "none",
                }}
                title={syncActive ? "Syncing" : "Idle"}
              />
            </div>
            {/* Notification bell */}
            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setNotifOpen(!notifOpen)}
                style={styles.notifBell}
                title={`${notifications.length} notifications`}
              >
                🔔
                {notifications.length > 0 && (
                  <span style={styles.notifBadge}>{notifications.length}</span>
                )}
              </button>
              {notifOpen && notifications.length > 0 && (
                <div style={styles.notifDropdown}>
                  <div style={styles.notifHeader}>NOTIFICATIONS</div>
                  {notifications.slice(0, 10).map((n) => (
                    <div key={n.key} style={styles.notifRow}>
                      <span style={{
                        ...styles.notifSource,
                        color: n.severity === "critical" ? "var(--lcars-red)"
                          : n.severity === "warning" ? "var(--lcars-yellow)"
                          : "var(--lcars-lavender)",
                      }}>
                        {n.source.toUpperCase()}
                      </span>
                      <span style={styles.notifTitle}>{n.title}</span>
                      <button
                        type="button"
                        style={styles.notifDismiss}
                        onClick={(e) => { e.stopPropagation(); dismissNotif(n.key); }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <DateRangePicker value={dateRange} onChange={setDateRange} />
            <div style={styles.topBarEndcapRight} />
          </div>
        </div>

        {/* Main content */}
        <div
          style={{
            ...styles.content,
            padding: isCompactShell
              ? "20px 16px 24px"
              : isTightShell
                ? "24px"
                : styles.content.padding,
          }}
        >
          <Routes>
            <Route path="/classic" element={<Navigate to="/classic/overview" replace />} />
            <Route path="/classic/overview" element={<Overview />} />
            <Route path="/classic/inbox" element={<Inbox />} />
            <Route path="/classic/projects" element={<Projects />} />
            <Route path="/classic/sprints" element={<Sprints />} />
            <Route path="/classic/insights" element={<Insights />} />
            <Route path="/classic/team/*" element={<Team />} />
            <Route path="/classic/calendar" element={<Calendar />} />
            <Route path="/classic/comms" element={<Comms />} />
            <Route path="/classic/boards" element={<Boards />} />
            <Route path="/classic/clients" element={<Clients />} />
            <Route path="/classic/issues" element={<Issues />} />
            <Route path="/classic/routines" element={<Routines />} />
            <Route path="/classic/goals" element={<Goals />} />
            <Route path="/classic/knowledge" element={<Knowledge />} />
            <Route path="/classic/onboarding" element={<Onboarding />} />
            <Route path="/classic/activity" element={<Activity />} />
            <Route path="/classic/agents/*" element={<Agents />} />
            <Route path="/classic/timesheet" element={<Timesheet />} />
            <Route path="/classic/settings" element={<Settings />} />
          </Routes>
        </div>
      </main>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        items={commandItems}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    display: "flex",
    height: "100%",
    backgroundColor: "var(--bg-canvas)",
  },
  sidebar: {
    width: 240,
    flexShrink: 0,
    background: "linear-gradient(180deg, rgba(10, 10, 26, 0.98) 0%, rgba(6, 6, 18, 0.98) 100%)",
    display: "flex",
    flexDirection: "column",
    borderRight: "2px solid rgba(255, 153, 0, 0.12)",
    overflow: "hidden",
  },
  sidebarTopBar: {
    height: 40,
    background: "linear-gradient(90deg, var(--lcars-orange), #ffb347)",
    borderRadius: "0 0 20px 0",
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
  },
  logoText: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 14,
    fontWeight: 700,
    color: "#000",
    letterSpacing: "4px",
    textTransform: "uppercase" as const,
  },
  collapseBtn: {
    background: "transparent",
    border: "none",
    color: "rgba(0,0,0,0.6)",
    fontSize: 11,
    cursor: "pointer",
    padding: "2px 6px",
    fontWeight: 700,
    lineHeight: 1,
  },
  nav: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    overflowY: "auto",
    paddingTop: 2,
  },
  sectionBarLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 8,
    fontWeight: 700,
    color: "#000",
    letterSpacing: "2px",
    textTransform: "uppercase" as const,
  },
  teamSection: {
    marginTop: "auto",
    flexShrink: 0,
  },
  teamBar: {
    height: 20,
    background: "var(--lcars-cyan)",
    borderRadius: "0 10px 10px 0",
    marginRight: 14,
    display: "flex",
    alignItems: "center",
    paddingLeft: 12,
    marginBottom: 2,
  },
  teamMember: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 12px 3px 16px",
  },
  crewName: {
    color: "var(--lcars-lavender)",
    fontSize: 10,
    fontFamily: "'JetBrains Mono', monospace",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  actionsPanel: {
    flexShrink: 0,
    marginTop: 4,
  },
  actionsPanelBar: {
    height: 18,
    background: "var(--lcars-lavender)",
    borderRadius: "0 9px 9px 0",
    marginRight: 14,
    display: "flex",
    alignItems: "center",
    paddingLeft: 12,
    marginBottom: 2,
  },
  actionBtn: {
    flex: 1,
    background: "rgba(153, 153, 204, 0.06)",
    border: "1px solid rgba(153, 153, 204, 0.2)",
    borderRadius: "0 8px 8px 0",
    color: "var(--lcars-tan)",
    fontSize: 8,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: "0.5px",
    padding: "6px 4px",
    cursor: "pointer",
    textAlign: "center" as const,
    whiteSpace: "nowrap" as const,
    transition: "background 0.15s, border-color 0.15s, opacity 0.15s",
  },
  bottomStrip: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 14px",
    flexShrink: 0,
  },
  bottomLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    fontWeight: 700,
    color: "var(--lcars-tan)",
    letterSpacing: "0.08em",
  },
  updatePill: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 8,
    fontWeight: 600,
    color: "var(--lcars-green)",
    letterSpacing: "1px",
    textTransform: "uppercase" as const,
    cursor: "pointer",
    padding: "2px 6px",
    border: "1px solid var(--lcars-green)",
    borderRadius: "0 6px 6px 0",
    animation: "lcars-pulse 2s ease-in-out infinite",
    marginLeft: "auto",
  },
  main: {
    flex: 1,
    overflow: "auto",
    display: "flex",
    flexDirection: "column",
  },
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0 0 0 0",
    flexShrink: 0,
    height: 36,
    gap: 0,
    marginBottom: 8,
  },
  topBarLeft: {
    display: "flex",
    alignItems: "center",
    gap: 0,
    height: "100%",
    flex: 1,
  },
  topBarEndcap: {
    width: 24,
    height: 28,
    background: "var(--lcars-peach)",
    borderRadius: "0 0 14px 0",
    flexShrink: 0,
  },
  stardateText: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 11,
    fontWeight: 500,
    color: "var(--lcars-peach)",
    letterSpacing: "3px",
    padding: "0 16px",
    whiteSpace: "nowrap",
    textTransform: "uppercase" as const,
  },
  topBarLine: {
    flex: 1,
    height: 3,
    background: "var(--lcars-peach)",
    opacity: 0.4,
  },
  topBarRight: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    height: "100%",
    paddingRight: 0,
  },
  statusIndicators: {
    display: "flex",
    gap: 6,
    alignItems: "center",
    paddingRight: 8,
  },
  statusDot: {
    display: "inline-block",
    width: 8,
    height: 8,
    borderRadius: "50%",
    flexShrink: 0,
  },
  topBarEndcapRight: {
    width: 24,
    height: 28,
    background: "var(--lcars-lavender)",
    borderRadius: "0 0 0 14px",
    flexShrink: 0,
  },
  content: {
    flex: 1,
    overflow: "auto",
    padding: "var(--space-8)",
  },
  notifBell: {
    position: "relative" as const,
    background: "transparent",
    border: "none",
    fontSize: 16,
    cursor: "pointer",
    padding: "4px 8px",
    lineHeight: 1,
  },
  notifBadge: {
    position: "absolute" as const,
    top: 0,
    right: 2,
    background: "var(--lcars-red)",
    color: "#000",
    fontSize: 8,
    fontWeight: 700,
    width: 14,
    height: 14,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  notifDropdown: {
    position: "absolute" as const,
    top: "100%",
    right: 0,
    width: 320,
    maxHeight: 400,
    overflow: "auto",
    background: "rgba(11,12,24,0.98)",
    border: "1px solid var(--lcars-cyan)",
    borderRadius: 6,
    zIndex: 9999,
    boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
  },
  notifHeader: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    letterSpacing: "1.5px",
    color: "var(--lcars-orange)",
    padding: "10px 12px 6px",
    borderBottom: "1px solid rgba(153,153,204,0.15)",
  },
  notifRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderBottom: "1px solid rgba(153,153,204,0.08)",
  },
  notifSource: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 8,
    letterSpacing: "0.5px",
    flexShrink: 0,
    minWidth: 52,
  },
  notifTitle: {
    fontSize: 11,
    color: "var(--lcars-text, #f0e0c0)",
    flex: 1,
    overflow: "hidden" as const,
    textOverflow: "ellipsis" as const,
    whiteSpace: "nowrap" as const,
  },
  notifDismiss: {
    background: "transparent",
    border: "none",
    color: "var(--lcars-red)",
    fontSize: 12,
    cursor: "pointer",
    padding: "2px 4px",
    flexShrink: 0,
  },
};

export default App;
