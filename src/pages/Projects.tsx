import { useState, useEffect, useCallback } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { exportCsv } from "../lib/export";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";
import { SkeletonCard, SkeletonTable } from "../components/ui/Skeleton";
import type { ProjectCatalogItem, ProjectStats } from "../lib/types";

function Projects() {
  const api = useInvoke();
  const [projects, setProjects] = useState<ProjectStats[]>([]);
  const [syncedProjectCount, setSyncedProjectCount] = useState(0);
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
      const [catalog, breakdown] = await Promise.all([
        api.getProjectsCatalog(),
        api.getProjectBreakdown(start, end),
      ]);
      setProjects(mergeProjectRows(catalog, breakdown));
      setSyncedProjectCount(catalog.filter((project) => !project.isArchived).length);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const totalHours = projects.reduce((sum, p) => sum + p.totalHours, 0);
  const projectsWithHours = projects.filter((project) => project.totalHours > 0).length;
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
          <div style={{ ...styles.summaryCard, borderLeftColor: "var(--lcars-lavender)" }}>
            <div style={styles.summaryLabel}>SYNCED PROJECTS</div>
            <div style={styles.summaryValue}>{syncedProjectCount}</div>
            <div style={styles.summaryHint}>
              {projectsWithHours} WITH TRACKED HOURS THIS MONTH
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
            NO SYNCED PROJECTS FOUND. RUN CLOCKIFY SYNC IN SETTINGS.
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
                <tr key={p.projectId ?? p.projectName}>
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

function mergeProjectRows(
  catalog: ProjectCatalogItem[],
  breakdown: ProjectStats[]
): ProjectStats[] {
  const statsById = new Map(
    breakdown
      .filter((row) => row.projectId)
      .map((row) => [row.projectId as string, row])
  );

  const merged: ProjectStats[] = catalog
    .filter((project) => !project.isArchived)
    .map((project) => {
      const stats = statsById.get(project.id);
      return (
        stats ?? {
          projectId: project.id,
          projectName: project.name,
          totalHours: 0,
          billableHours: 0,
          teamMembers: 0,
          utilization: 0,
        }
      );
    });

  for (const row of breakdown) {
    if (row.projectId === null && !merged.some((item) => item.projectName === row.projectName)) {
      merged.push(row);
    }
  }

  merged.sort((left, right) => {
    if (right.totalHours !== left.totalHours) {
      return right.totalHours - left.totalHours;
    }
    return left.projectName.localeCompare(right.projectName);
  });

  return merged;
}

function utilizationColor(rate: number): string {
  if (rate >= 0.8) return "var(--lcars-green)";
  if (rate >= 0.5) return "var(--lcars-yellow)";
  return "var(--lcars-red)";
}

const styles: Record<string, React.CSSProperties> = {
  pageTitle: {
    ...lcarsPageStyles.pageTitle,
    marginBottom: 0,
  },
  pageTitleBar: lcarsPageStyles.pageTitleBar,
  ghostBtn: {
    ...lcarsPageStyles.ghostButton,
    color: "var(--lcars-orange)",
    borderColor: "rgba(255, 153, 0, 0.28)",
    padding: "8px 14px",
  },
  summaryRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
    marginBottom: 20,
  },
  summaryCard: {
    ...lcarsPageStyles.card,
    borderLeft: "8px solid var(--lcars-orange)",
    padding: 24,
  },
  summaryLabel: lcarsPageStyles.metricLabel,
  summaryValue: lcarsPageStyles.metricValue,
  summaryHint: {
    marginTop: 8,
    color: "var(--text-quaternary)",
    fontSize: 10,
    letterSpacing: "0.9px",
    fontFamily: "'Orbitron', sans-serif",
  },
  card: {
    ...lcarsPageStyles.card,
    borderLeftColor: "var(--lcars-tan)",
  },
  table: lcarsPageStyles.table,
  th: lcarsPageStyles.th,
  td: lcarsPageStyles.td,
  tdMono: lcarsPageStyles.tdMono,
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
  emptyText: lcarsPageStyles.emptyText,
};

export default Projects;
