import { useState, useEffect, useCallback } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { exportCsv } from "../lib/export";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";
import { SkeletonCard, SkeletonTable } from "../components/ui/Skeleton";
import type { ExecutionProjectView } from "../lib/types";

function Projects() {
  const api = useInvoke();
  const [projects, setProjects] = useState<ExecutionProjectView[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const load = useCallback(async (): Promise<boolean> => {
    try {
      setProjects(await api.getExecutionProjects());
      setHasLoadedOnce(true);
      setLoading(false);
      return true;
    } catch {
      if (hasLoadedOnce) {
        setLoading(false);
      } else {
        setLoading(true);
      }
      return false;
    }
  }, [api, hasLoadedOnce]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
      if (cancelled) return;
      const ok = await load();
      if (cancelled) return;
      timer = setTimeout(run, ok ? 60_000 : 2_000);
    };

    run();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [load]);

  const totalHours = projects.reduce((sum, p) => sum + p.totalHours, 0);
  const githubProjects = projects.filter((project) => project.source === "github");
  const openIssues = githubProjects.reduce((sum, project) => sum + project.openIssues, 0);
  const totalIssues = githubProjects.reduce((sum, project) => sum + project.totalIssues, 0);
  const completedIssues = githubProjects.reduce((sum, project) => sum + project.closedIssues, 0);
  const avgUtilization =
    projects.length > 0
      ? projects.reduce((sum, p) => sum + p.utilization, 0) / projects.length
      : 0;

  const handleExport = () => {
    const headers = [
      "Project",
      "Source",
      "Repo",
      "Milestone",
      "Status",
      "Total Issues",
      "Open Issues",
      "Closed Issues",
      "Total Hours",
      "Billable Hours",
      "Team Members",
      "Progress %",
    ];
    const rows = projects.map((p) => [
      p.title,
      p.source,
      p.repo ?? "",
      p.milestone ?? "",
      p.status,
      String(p.totalIssues),
      String(p.openIssues),
      String(p.closedIssues),
      p.totalHours.toFixed(2),
      p.billableHours.toFixed(2),
      String(p.teamMembers),
      (p.percentComplete * 100).toFixed(1),
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
            <div style={styles.summaryLabel}>GITHUB PROJECTS</div>
            <div style={styles.summaryValue}>{githubProjects.length}</div>
            <div style={styles.summaryHint}>
              {completedIssues}/{totalIssues} ISSUES CLOSED
            </div>
          </div>
          <div style={{ ...styles.summaryCard, borderLeftColor: "var(--lcars-peach)" }}>
            <div style={styles.summaryLabel}>OPEN ISSUES</div>
            <div style={styles.summaryValue}>{openIssues}</div>
            <div style={styles.summaryHint}>
              GITHUB IS THE PLAN SOURCE
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
            NO EXECUTION PROJECTS FOUND. SYNC GITHUB PLANS IN SETTINGS.
          </p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>PROJECT</th>
                <th style={styles.th}>SOURCE</th>
                <th style={styles.th}>ISSUES</th>
                <th style={styles.th}>OPEN</th>
                <th style={styles.th}>HOURS</th>
                <th style={styles.th}>CREW</th>
                <th style={{ ...styles.th, minWidth: 180 }}>PROGRESS</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td
                    style={{
                      ...styles.td,
                      fontWeight: 600,
                      color: "var(--lcars-orange)",
                    }}
                  >
                    <div>{p.title}</div>
                    {p.repo && (
                      <div style={styles.projectSubtext}>
                        {p.repo}{p.milestone ? ` · ${p.milestone}` : ""}
                      </div>
                    )}
                  </td>
                  <td style={styles.td}><SourceBadge source={p.source} /></td>
                  <td style={styles.tdMono}>{p.totalIssues}</td>
                  <td style={styles.tdMono}>{p.openIssues}</td>
                  <td style={styles.tdMono}>{p.totalHours.toFixed(1)}h</td>
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
                            width: `${Math.min(p.percentComplete * 100, 100)}%`,
                            backgroundColor: progressColor(p),
                            boxShadow: `0 0 6px ${progressColor(p)}44`,
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
                        {(p.percentComplete * 100).toFixed(0)}%
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

function SourceBadge({ source }: { source: string }) {
  const isGitHub = source === "github";
  return (
    <span
      style={{
        ...styles.sourceBadge,
        borderColor: isGitHub ? "var(--lcars-cyan)" : "var(--lcars-orange)",
        color: isGitHub ? "var(--lcars-cyan)" : "var(--lcars-orange)",
      }}
    >
      {source.toUpperCase()}
    </span>
  );
}

function progressColor(project: ExecutionProjectView): string {
  if (project.totalIssues === 0) return "var(--lcars-orange)";
  if (project.openIssues === 0) return "var(--lcars-green)";
  if (project.percentComplete >= 0.5) return "var(--lcars-yellow)";
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
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
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
  projectSubtext: {
    marginTop: 4,
    color: "var(--text-quaternary)",
    fontSize: 10,
    fontFamily: "'JetBrains Mono', monospace",
    textTransform: "none",
  },
  sourceBadge: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 2,
    fontSize: 9,
    fontWeight: 600,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: "1px",
    border: "1px solid var(--lcars-orange)",
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
  emptyText: lcarsPageStyles.emptyText,
};

export default Projects;
