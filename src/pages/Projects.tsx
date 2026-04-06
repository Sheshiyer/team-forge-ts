import { useState, useEffect, useCallback } from "react";
import { useInvoke } from "../hooks/useInvoke";
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

  return (
    <div>
      <h1 style={styles.pageTitle}>Projects</h1>

      {/* Summary Row */}
      <div style={styles.summaryRow}>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Total Hours</div>
          <div style={styles.summaryValue}>{totalHours.toFixed(1)}h</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Avg Utilization</div>
          <div style={styles.summaryValue}>
            {(avgUtilization * 100).toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Projects Table */}
      <div style={styles.card}>
        {loading ? (
          <p style={styles.emptyText}>Loading...</p>
        ) : projects.length === 0 ? (
          <p style={styles.emptyText}>
            No project data yet. Sync time entries first.
          </p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Project</th>
                <th style={styles.th}>Total Hours</th>
                <th style={styles.th}>Billable Hours</th>
                <th style={styles.th}>Team Members</th>
                <th style={{ ...styles.th, minWidth: 180 }}>Utilization</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.projectName}>
                  <td style={{ ...styles.td, fontWeight: 510, color: "var(--text-primary)" }}>
                    {p.projectName}
                  </td>
                  <td style={styles.td}>{p.totalHours.toFixed(1)}h</td>
                  <td style={styles.td}>{p.billableHours.toFixed(1)}h</td>
                  <td style={styles.td}>{p.teamMembers}</td>
                  <td style={styles.td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={styles.barTrack}>
                        <div
                          style={{
                            ...styles.barFill,
                            width: `${Math.min(p.utilization * 100, 100)}%`,
                            backgroundColor: utilizationColor(p.utilization),
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 12, color: "var(--text-tertiary)", minWidth: 40 }}>
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
  if (rate >= 0.8) return "var(--accent-brand)";
  if (rate >= 0.5) return "var(--status-warning)";
  return "var(--text-quaternary)";
}

const styles: Record<string, React.CSSProperties> = {
  pageTitle: {
    fontSize: 20,
    fontWeight: 600,
    marginBottom: 24,
    color: "var(--text-primary)",
    letterSpacing: "-0.02em",
  },
  summaryRow: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 16,
    marginBottom: 20,
  },
  summaryCard: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid var(--border-standard)",
    borderRadius: "var(--radius-lg)",
    padding: 24,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: 510,
    color: "var(--text-tertiary)",
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: 510,
    color: "var(--text-primary)",
    letterSpacing: "-0.5px",
  },
  card: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid var(--border-standard)",
    borderRadius: "var(--radius-lg)",
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
    color: "var(--text-tertiary)",
    fontWeight: 500,
    padding: "8px 12px",
    borderBottom: "1px solid var(--border-subtle)",
    fontSize: 12,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  td: {
    padding: "10px 12px",
    color: "var(--text-secondary)",
    borderBottom: "1px solid var(--border-subtle)",
  },
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    background: "rgba(255,255,255,0.05)",
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 3,
    transition: "width 0.4s ease",
  },
  emptyText: {
    fontSize: 13,
    color: "var(--text-tertiary)",
  },
};

export default Projects;
