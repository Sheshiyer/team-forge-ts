import { useState, useEffect, useCallback } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { SkeletonCard, SkeletonTable } from "../components/ui/Skeleton";
import type { MilestoneView } from "../lib/types";

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={styles.metricCard}>
      <div style={styles.metricLabel}>{label}</div>
      <div style={styles.metricValue}>{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  let bg: string;
  let color: string;
  let label: string;

  switch (status) {
    case "active":
      bg = "var(--accent-brand)";
      color = "#fff";
      label = "Active";
      break;
    case "completed":
      bg = "var(--status-success)";
      color = "#fff";
      label = "Completed";
      break;
    case "planned":
      bg = "var(--text-tertiary)";
      color = "#fff";
      label = "Planned";
      break;
    case "cancelled":
      bg = "var(--status-critical)";
      color = "#fff";
      label = "Cancelled";
      break;
    default:
      bg = "var(--text-quaternary)";
      color = "#fff";
      label = status;
  }

  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: "var(--radius-full)",
        backgroundColor: bg,
        color,
        fontSize: 12,
        fontWeight: 510,
        lineHeight: "20px",
      }}
    >
      {label}
    </span>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  const clamped = Math.min(Math.max(percent, 0), 100);
  return (
    <div
      style={{
        width: "100%",
        height: 6,
        borderRadius: 3,
        background: "rgba(255,255,255,0.05)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${clamped}%`,
          height: "100%",
          borderRadius: 3,
          background: clamped >= 80 ? "var(--status-success)" : clamped >= 40 ? "var(--accent-brand)" : "var(--status-warning)",
          transition: "width 0.4s ease",
        }}
      />
    </div>
  );
}

function isPastDue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "--";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function Sprints() {
  const api = useInvoke();
  const [milestones, setMilestones] = useState<MilestoneView[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.getMilestones();
      setMilestones(data);
    } catch {
      // data may not exist yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div>
        <h1 style={styles.pageTitle}>Sprints & Milestones</h1>
        <div style={styles.metricsRow}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div style={styles.card}>
          <SkeletonTable rows={5} cols={6} />
        </div>
      </div>
    );
  }

  const active = milestones.filter((m) => m.status === "active");
  const activeSprints = active.length;
  const onTrack = active.filter((m) => m.progressPercent >= 50).length;
  const avgCompletion =
    active.length > 0
      ? active.reduce((sum, m) => sum + m.progressPercent, 0) / active.length
      : 0;

  return (
    <div>
      <h1 style={styles.pageTitle}>Sprints & Milestones</h1>

      <div style={styles.metricsRow}>
        <MetricCard label="Active Sprints" value={String(activeSprints)} />
        <MetricCard label="On Track" value={String(onTrack)} />
        <MetricCard label="Avg Completion" value={`${avgCompletion.toFixed(0)}%`} />
      </div>

      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>Milestones</h2>
        {milestones.length === 0 ? (
          <p style={styles.emptyText}>No milestones found. Sync Huly data first.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Sprint</th>
                <th style={styles.th}>Project</th>
                <th style={styles.th}>Issues</th>
                <th style={{ ...styles.th, minWidth: 120 }}>Progress</th>
                <th style={styles.th}>Target Date</th>
                <th style={styles.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {milestones.map((m) => (
                <tr key={m.id} style={{ cursor: "default" }}>
                  <td style={{ ...styles.td, color: "var(--text-primary)", fontWeight: 500 }}>
                    {m.label}
                  </td>
                  <td style={styles.td}>{m.projectName ?? "--"}</td>
                  <td style={styles.td}>
                    {m.completedIssues}/{m.totalIssues}
                  </td>
                  <td style={styles.td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <ProgressBar percent={m.progressPercent} />
                      <span style={{ fontSize: 12, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                        {m.progressPercent.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td
                    style={{
                      ...styles.td,
                      color:
                        m.status === "active" && isPastDue(m.targetDate)
                          ? "var(--status-critical)"
                          : "var(--text-secondary)",
                      fontWeight: isPastDue(m.targetDate) && m.status === "active" ? 510 : 400,
                    }}
                  >
                    {formatDate(m.targetDate)}
                  </td>
                  <td style={styles.td}>
                    <StatusPill status={m.status} />
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

const styles: Record<string, React.CSSProperties> = {
  pageTitle: {
    fontSize: 20,
    fontWeight: 600,
    marginBottom: 24,
    color: "var(--text-primary)",
    letterSpacing: "-0.02em",
  },
  metricsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 16,
    marginBottom: 20,
  },
  metricCard: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid var(--border-standard)",
    borderRadius: "var(--radius-lg)",
    padding: 24,
  },
  metricLabel: {
    fontSize: 13,
    fontWeight: 510,
    color: "var(--text-tertiary)",
    marginBottom: 8,
  },
  metricValue: {
    fontSize: 32,
    fontWeight: 510,
    color: "var(--text-primary)",
    letterSpacing: "-0.704px",
  },
  card: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid var(--border-standard)",
    borderRadius: "var(--radius-lg)",
    padding: 24,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 510,
    color: "var(--text-primary)",
    marginBottom: 16,
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
  emptyText: {
    fontSize: 13,
    color: "var(--text-tertiary)",
  },
};

export default Sprints;
