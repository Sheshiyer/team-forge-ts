import { useEffect, useState } from "react";
import { Routes, Route, NavLink, useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import Overview from "./pages/Overview";
import Timesheet from "./pages/Timesheet";
import Projects from "./pages/Projects";
import Activity from "./pages/Activity";
import Live from "./pages/Live";
import Settings from "./pages/Settings";
import Avatar from "./components/ui/Avatar";
import DateRangePicker from "./components/ui/DateRangePicker";
import { useAppStore } from "./stores/appStore";
import type { PresenceStatus } from "./lib/types";

const navItems = [
  { path: "/", label: "Overview" },
  { path: "/timesheet", label: "Timesheet" },
  { path: "/projects", label: "Projects" },
  { path: "/activity", label: "Activity" },
  { path: "/live", label: "Live" },
  { path: "/settings", label: "Settings" },
];

function App() {
  const navigate = useNavigate();
  const [teamPresence, setTeamPresence] = useState<PresenceStatus[]>([]);
  const dateRange = useAppStore((s) => s.dateRange);
  const setDateRange = useAppStore((s) => s.setDateRange);

  // Background sync on launch
  useEffect(() => {
    const timer = setTimeout(() => {
      invoke<string>("start_background_sync").catch(() => {});
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

  // Keyboard navigation: Cmd/Ctrl + 1-6 for routes, Cmd/Ctrl + R for sync
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        const routes = ["/", "/timesheet", "/projects", "/activity", "/live", "/settings"];
        const num = parseInt(e.key);
        if (num >= 1 && num <= 6) {
          e.preventDefault();
          navigate(routes[num - 1]);
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

  return (
    <div style={styles.shell}>
      <aside style={styles.sidebar}>
        <div style={styles.logo}>TeamForge</div>
        <nav style={styles.nav}>
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              style={({ isActive }) => ({
                ...styles.navItem,
                color: isActive
                  ? "var(--text-primary)"
                  : "var(--text-tertiary)",
                backgroundColor: isActive
                  ? "var(--bg-hover)"
                  : "transparent",
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Team Presence Section */}
        <div style={styles.teamSection}>
          <div style={styles.teamLabel}>TEAM</div>
          {teamPresence.map((p) => (
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
                }}
              />
              <span
                style={{
                  color: "var(--text-tertiary)",
                  fontSize: 13,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {p.employeeName}
              </span>
            </div>
          ))}
        </div>
      </aside>

      <main style={styles.main}>
        <div style={styles.topBar}>
          <div />
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/timesheet" element={<Timesheet />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/live" element={<Live />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
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
    width: 220,
    flexShrink: 0,
    backgroundColor: "var(--bg-sidebar)",
    borderRight: "1px solid var(--border-subtle)",
    display: "flex",
    flexDirection: "column",
    padding: "var(--space-4)",
  },
  logo: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
    padding: "var(--space-2) var(--space-3)",
    marginBottom: "var(--space-6)",
    letterSpacing: "-0.02em",
  },
  nav: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-1)",
  },
  navItem: {
    display: "block",
    padding: "var(--space-2) var(--space-3)",
    borderRadius: "var(--radius-md)",
    fontSize: 13,
    fontWeight: 500,
    textDecoration: "none",
    transition: "background-color 0.15s, color 0.15s",
  },
  teamSection: {
    marginTop: "auto",
    paddingTop: "var(--space-4)",
    borderTop: "1px solid var(--border-subtle)",
  },
  teamLabel: {
    fontSize: 11,
    fontWeight: 510,
    color: "var(--text-quaternary)",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    padding: "var(--space-2) var(--space-3)",
    marginBottom: "var(--space-1)",
  },
  teamMember: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "var(--space-1) var(--space-3)",
    borderRadius: "var(--radius-md)",
  },
  main: {
    flex: 1,
    overflow: "auto",
    padding: "var(--space-8)",
  },
  topBar: {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    marginBottom: "var(--space-4)",
  },
};

export default App;
