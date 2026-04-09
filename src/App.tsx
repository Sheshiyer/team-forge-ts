import { useEffect, useState } from "react";
import { Routes, Route, NavLink, useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import Overview from "./pages/Overview";
import Timesheet from "./pages/Timesheet";
import Projects from "./pages/Projects";
import Sprints from "./pages/Sprints";
import Insights from "./pages/Insights";
import Team from "./pages/Team";
import Calendar from "./pages/Calendar";
import Comms from "./pages/Comms";
import Boards from "./pages/Boards";
import Activity from "./pages/Activity";
import Live from "./pages/Live";
import Settings from "./pages/Settings";
import Avatar from "./components/ui/Avatar";
import DateRangePicker from "./components/ui/DateRangePicker";
import { useViewportWidth } from "./hooks/useViewportWidth";
import { useAppStore } from "./stores/appStore";
import type { PresenceStatus } from "./lib/types";

const navSections = [
  {
    label: "CORE SYSTEMS",
    color: "var(--lcars-orange)",
    items: [
      { path: "/", label: "Overview" },
      { path: "/timesheet", label: "Timesheet" },
      { path: "/projects", label: "Projects" },
    ],
  },
  {
    label: "HULY OPS",
    color: "var(--lcars-peach)",
    items: [
      { path: "/sprints", label: "Sprints" },
      { path: "/insights", label: "Insights" },
      { path: "/team", label: "Team" },
      { path: "/calendar", label: "Calendar" },
      { path: "/comms", label: "Comms" },
      { path: "/boards", label: "Boards" },
    ],
  },
  {
    label: "MONITORING",
    color: "var(--lcars-tan)",
    items: [
      { path: "/activity", label: "Activity" },
      { path: "/live", label: "Live" },
    ],
  },
  {
    label: "SYSTEM",
    color: "var(--lcars-lavender)",
    items: [{ path: "/settings", label: "Settings" }],
  },
];

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
  const viewportWidth = useViewportWidth();
  const [teamPresence, setTeamPresence] = useState<PresenceStatus[]>([]);
  const [appVersion, setAppVersion] = useState<string>("--");
  const dateRange = useAppStore((s) => s.dateRange);
  const setDateRange = useAppStore((s) => s.setDateRange);
  const [syncActive, setSyncActive] = useState(false);
  const isTightShell = viewportWidth < 1240;
  const isCompactShell = viewportWidth < 1080;
  const sidebarWidth = isCompactShell ? 208 : isTightShell ? 224 : 240;
  const visiblePresence = teamPresence.slice(0, isCompactShell ? 6 : 8);

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

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        const routes = [
          "/", "/timesheet", "/projects", "/sprints", "/insights",
          "/team", "/calendar", "/comms", "/boards", "/activity",
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
        if (e.key === "-") {
          e.preventDefault();
          navigate("/live");
        }
        if (e.key === "=") {
          e.preventDefault();
          navigate("/settings");
        }
        if (e.key === "r") {
          e.preventDefault();
          invoke("trigger_sync").catch(() => {});
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

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

  return (
    <div style={styles.shell}>
      {/* LCARS Sidebar */}
      <aside
        style={{
          ...styles.sidebar,
          width: sidebarWidth,
          borderRight: isCompactShell
            ? "1px solid rgba(255, 153, 0, 0.18)"
            : styles.sidebar.borderRight,
        }}
      >
        {/* Top bar with title */}
        <div
          style={{
            ...styles.sidebarTopBar,
            paddingLeft: isCompactShell ? 12 : 16,
            paddingRight: isCompactShell ? 10 : 12,
          }}
        >
          <span
            style={{
              ...styles.logoText,
              fontSize: isCompactShell ? 12 : 14,
              letterSpacing: isCompactShell ? "3px" : "4px",
            }}
          >
            TEAMFORGE
          </span>
        </div>

        {/* Connector bar */}
        <div
          style={{
            ...styles.connectorBar,
            marginRight: isCompactShell ? 28 : 40,
          }}
        />

        {/* Nav sections */}
        <nav style={styles.nav}>
          {navSections.map((section, si) => (
            <div key={section.label}>
              {/* Section divider bar */}
              <div
                style={{
                  ...styles.sectionBar,
                  backgroundColor: section.color,
                }}
              >
                <span style={styles.sectionBarLabel}>{section.label}</span>
              </div>

              {/* Nav items */}
              {section.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === "/"}
                  style={({ isActive }) => ({
                    ...styles.navItem,
                    padding: isCompactShell ? "6px 10px 6px 14px" : styles.navItem.padding,
                    fontSize: isCompactShell ? 11 : 12,
                    color: isActive
                      ? "var(--lcars-orange)"
                      : "var(--lcars-lavender)",
                    borderLeft: isActive
                      ? `4px solid ${section.color}`
                      : "4px solid transparent",
                    backgroundColor: isActive
                      ? "rgba(255, 153, 0, 0.06)"
                      : "transparent",
                  })}
                >
                  {item.label.toUpperCase()}
                </NavLink>
              ))}

              {/* Gap between sections */}
              {si < navSections.length - 1 && (
                <div style={{ height: 4 }} />
              )}
            </div>
          ))}
        </nav>

        {/* Team Presence Section */}
        <div style={styles.teamSection}>
          <div style={styles.teamBar}>
            <span style={styles.sectionBarLabel}>CREW STATUS</span>
          </div>
          {visiblePresence.map((p) => (
            <div key={p.employeeName} style={styles.teamMember}>
              <Avatar name={p.employeeName} size={22} />
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor:
                    p.combinedStatus === "active"
                      ? "var(--status-success)"
                      : p.combinedStatus === "idle"
                      ? "var(--status-warning)"
                      : "var(--text-quaternary)",
                  flexShrink: 0,
                  boxShadow:
                    p.combinedStatus === "active"
                      ? "0 0 6px rgba(51, 204, 102, 0.5)"
                      : "none",
                  animation:
                    p.combinedStatus === "active"
                      ? "lcars-pulse 2s ease-in-out infinite"
                      : "none",
                }}
              />
              <span
                style={{
                  color: "var(--lcars-lavender)",
                  fontSize: isCompactShell ? 11 : 12,
                  fontFamily: "var(--font-mono)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {p.employeeName}
              </span>
            </div>
          ))}
        </div>

        <div style={styles.sidebarVersionWrap}>
          <span style={styles.sidebarVersionLabel}>BUILD</span>
          <span style={styles.sidebarVersionValue}>v{appVersion}</span>
        </div>

        {/* Bottom bar */}
        <div style={styles.sidebarBottomBar} />
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
            <Route path="/" element={<Overview />} />
            <Route path="/timesheet" element={<Timesheet />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/sprints" element={<Sprints />} />
        <Route path="/insights" element={<Insights />} />
        <Route path="/team" element={<Team />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/comms" element={<Comms />} />
            <Route path="/boards" element={<Boards />} />
            <Route path="/activity" element={<Activity />} />
            <Route path="/live" element={<Live />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </div>
      </main>
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
    background:
      "linear-gradient(180deg, rgba(10, 10, 26, 0.98) 0%, rgba(6, 6, 18, 0.98) 100%)",
    display: "flex",
    flexDirection: "column",
    borderRight: "2px solid rgba(255, 153, 0, 0.15)",
    overflow: "hidden",
    boxShadow: "inset -1px 0 0 rgba(153, 153, 204, 0.08)",
  },
  sidebarTopBar: {
    height: 40,
    background: "linear-gradient(90deg, var(--lcars-orange), #ffb347)",
    borderRadius: "0 0 20px 0",
    display: "flex",
    alignItems: "center",
    paddingLeft: 16,
    paddingRight: 12,
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
  connectorBar: {
    height: 5,
    background: "linear-gradient(90deg, var(--lcars-orange), transparent)",
    marginRight: 40,
    flexShrink: 0,
  },
  nav: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    overflowY: "auto",
    paddingTop: 4,
  },
  sectionBar: {
    height: 22,
    borderRadius: "0 11px 11px 0",
    marginRight: 16,
    display: "flex",
    alignItems: "center",
    paddingLeft: 12,
  },
  sectionBarLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    fontWeight: 600,
    color: "#000",
    letterSpacing: "2px",
    textTransform: "uppercase" as const,
  },
  navItem: {
    display: "block",
    padding: "6px 12px 6px 16px",
    fontSize: 12,
    fontWeight: 500,
    textDecoration: "none",
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: "1.5px",
    transition: "background-color 0.15s, color 0.15s, border-color 0.15s",
  },
  teamSection: {
    marginTop: "auto",
    flexShrink: 0,
  },
  teamBar: {
    height: 22,
    background: "var(--lcars-cyan)",
    borderRadius: "0 11px 11px 0",
    marginRight: 16,
    display: "flex",
    alignItems: "center",
    paddingLeft: 12,
  },
  teamMember: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "4px 12px 4px 16px",
  },
  sidebarVersionWrap: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    padding: "8px 12px 6px 16px",
    flexShrink: 0,
  },
  sidebarVersionLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    fontWeight: 600,
    color: "var(--lcars-lavender)",
    letterSpacing: "1.8px",
    textTransform: "uppercase" as const,
  },
  sidebarVersionValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    fontWeight: 700,
    color: "var(--lcars-tan)",
    letterSpacing: "0.08em",
  },
  sidebarBottomBar: {
    height: 32,
    background: "linear-gradient(90deg, var(--lcars-tan), #d7a677)",
    borderRadius: "0 16px 0 0",
    flexShrink: 0,
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
};

export default App;
