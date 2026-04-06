import { useState, useEffect, useCallback } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { exportCsv } from "../lib/export";
import { SkeletonCard, SkeletonTable } from "../components/ui/Skeleton";
import type { ProjectStats } from "../lib/types";

function Projects() {
  const api = useInvoke();
  const [projects, setProjects] = useState<ProjectStats[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .split("T")[0];
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
        .toISOString()
        .split("T")[0];
      const data = await api.getProjectBreakdown(start, end);
      setProjects(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalHours = projects.reduce((sum, p) => sum + p.totalHours, 0);
  const avgUtilization =
    projects.length > 0
      ? projects.reduce((sum, p) => sum + p.utilization, 0) / projects.length
      : 0;

  const handleExport = () => {
    const headers = [
      "Project",
      "Total Hours",
      "Billable Hours",
      "Team Members",
      "Utilization %",
    ];
    const rows = projects.map((p) => [
      p.projectName,
      p.totalHours.toFixed(2),
      p.billableHours.toFixed(2),
      String(p.teamMembers),
      (p.utilization * 100).toFixed(1),
    ]);
    exportCsv("projects.csv", headers, rows);
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <h1 style={styles.pageTitle}>PROJECTS</h1>
        <button onClick={handleExport} style={styles.ghostBtn}>
          EXPORT CSV
        </button>
      </div>
      <div style={styles.pageTitleBar} />

      {/* Summary Row */}
      {loading ? (
        <div style={styles.summaryRow}>
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <div style={styles.summaryRow}>
          <div style={{ ...styles.summaryCard, borderLeftColor: "var(--lcars-orange)" }}>
            <div style={styles.summaryLabel}>TOTAL HOURS</div>
            <div style={styles.summaryValue}>{totalHours.toFixed(1)}H</div>
          </div>
          <div style={{ ...styles.summaryCard, borderLeftColor: "var(--lcars-cyan)" }}>
            <div style={styles.summaryLabel}>AVG UTILIZATION</div>
            <div style={styles.summaryValue}>
              {(avgUtilization * 100).toFixed(1)}%
            </div>
          </div>
        </div>
      )}

      {/* Projects Table */}
      <div style={styles.card}>
        {loading ? (
          <SkeletonTable rows={5} cols={5} />
        ) : projects.length === 0 ? (
          <p style={styles.emptyText}>
            NO PROJECT DATA. SYNC TIME ENTRIES FIRST.
          </p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>PROJECT</th>
                <th style={styles.th}>TOTAL HOURS</th>
                <th style={styles.th}>BILLABLE HOURS</th>
                <th style={styles.th}>CREW</th>
                <th style={{ ...styles.th, minWidth: 180 }}>UTILIZATION</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.projectName}>
                  <td
                    style={{
                      ...styles.td,
                      fontWeight: 600,
                      color: "var(--lcars-orange)",
                    }}
                  >
                    {p.projectName}
                  </td>
                  <td style={styles.tdMono}>{p.totalHours.toFixed(1)}h</td>
                  <td style={styles.tdMono}>{p.billableHours.toFixed(1)}h</td>
                  <td style={styles.tdMono}>{p.teamMembers}</td>
                  <td style={styles.td}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <div style={styles.barTrack}>
                        <div
                          style={{
                            ...styles.barFill,
                            width: `${Math.min(p.utilization * 100, 100)}%`,
                            backgroundColor: utilizationColor(p.utilization),
                            boxShadow: `0 0 6px ${utilizationColor(p.utilization)}44`,
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontSize: 12,
                          fontFamily: "'JetBrains Mono', monospace",
                          color: "var(--lcars-lavender)",
                          minWidth: 40,
                        }}
                      >
                        {(p.utilization * 100).toFixed(0)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function utilizationColor(rate: number): string {
  if (rate >= 0.8) return "var(--lcars-green)";
  if (rate >= 0.5) return "var(--lcars-yellow)";
  return "var(--lcars-red)";
}

const styles: Record<string, React.CSSProperties> = {
  pageTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 20,
    fontWeight: 700,
    color: "var(--lcars-orange)",
    letterSpacing: "4px",
    textTransform: "uppercase" as const,
    marginBottom: 0,
  },
  pageTitleBar: {
    height: 3,
    background: "linear-gradient(90deg, var(--lcars-orange), transparent)",
    marginBottom: 24,
  },
  ghostBtn: {
    background: "transparent",
    border: "1px solid rgba(255, 153, 0, 0.3)",
    borderRadius: 2,
    color: "var(--lcars-orange)",
    padding: "8px 14px",
    fontSize: 10,
    fontWeight: 600,
    fontFamily: "'Orbitron', sans-serif",
    cursor: "pointer",
    letterSpacing: "1px",
    textTransform: "uppercase" as const,
  },
  summaryRow: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 16,
    marginBottom: 20,
  },
  summaryCard: {
    background: "rgba(26, 26, 46, 0.6)",
    borderLeft: "4px solid var(--lcars-orange)",
    padding: 24,
  },
  summaryLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    fontWeight: 500,
    color: "var(--lcars-lavender)",
    marginBottom: 8,
    letterSpacing: "2px",
    textTransform: "uppercase" as const,
  },
  summaryValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 28,
    fontWeight: 600,
    color: "var(--lcars-orange)",
    letterSpacing: "-0.5px",
  },
  card: {
    background: "rgba(26, 26, 46, 0.6)",
    borderLeft: "4px solid var(--lcars-tan)",
    padding: 24,
    marginBottom: 20,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 13,
  },
  th: {
    textAlign: "left" as const,
    color: "var(--lcars-lavender)",
    fontFamily: "'Orbitron', sans-serif",
    fontWeight: 500,
    padding: "8px 12px",
    borderBottom: "1px solid rgba(255, 153, 0, 0.15)",
    fontSize: 10,
    textTransform: "uppercase" as const,
    letterSpacing: "1.5px",
    background: "rgba(255, 153, 0, 0.05)",
  },
  td: {
    padding: "10px 12px",
    color: "var(--lcars-tan)",
    borderBottom: "1px solid rgba(153, 153, 204, 0.08)",
  },
  tdMono: {
    padding: "10px 12px",
    color: "var(--lcars-lavender)",
    borderBottom: "1px solid rgba(153, 153, 204, 0.08)",
    fontFamily: "'JetBrains Mono', monospace",
  },
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: 0,
    background: "rgba(153, 153, 204, 0.1)",
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 0,
    transition: "width 0.4s ease",
  },
  emptyText: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 11,
    color: "var(--text-quaternary)",
    letterSpacing: "2px",
    textTransform: "uppercase" as const,
  },
};

export default Projects;
