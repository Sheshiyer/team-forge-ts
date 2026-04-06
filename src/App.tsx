import { useEffect } from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import Overview from "./pages/Overview";
import Timesheet from "./pages/Timesheet";
import Projects from "./pages/Projects";
import Activity from "./pages/Activity";
import Live from "./pages/Live";
import Settings from "./pages/Settings";

const navItems = [
  { path: "/", label: "Overview" },
  { path: "/timesheet", label: "Timesheet" },
  { path: "/projects", label: "Projects" },
  { path: "/activity", label: "Activity" },
  { path: "/live", label: "Live" },
  { path: "/settings", label: "Settings" },
];

function App() {
  useEffect(() => {
    // Start background sync on app launch (no-ops if settings not configured)
    const timer = setTimeout(() => {
      invoke<string>("start_background_sync").catch(() => {
        // DB may not be ready yet on first launch, ignore
      });
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

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
      </aside>
      <main style={styles.main}>
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
  main: {
    flex: 1,
    overflow: "auto",
    padding: "var(--space-8)",
  },
};

export default App;
