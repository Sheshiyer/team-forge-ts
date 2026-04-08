import { useState, useEffect, useCallback } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";
import { SkeletonCard, SkeletonTable } from "../components/ui/Skeleton";
import type { MilestoneView } from "../lib/types";

function MetricCard({
  label,
  value,
  barColor = "var(--lcars-orange)",
}: {
  label: string;
  value: string;
  barColor?: string;
}) {
  return (
    <div style={{ ...styles.metricCard, borderLeftColor: barColor }}>
      <div style={{ ...styles.metricCardBar, backgroundColor: barColor }} />
      <div style={styles.metricLabel}>{label}</div>
      <div style={styles.metricValue}>{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  let borderColor: string;
  let label: string;

  switch (status) {
    case "active":
      borderColor = "var(--lcars-orange)";
      label = "ACTIVE";
      break;
    case "completed":
      borderColor = "var(--lcars-green)";
      label = "COMPLETED";
      break;
    case "planned":
      borderColor = "var(--lcars-lavender)";
      label = "PLANNED";
      break;
    case "cancelled":
      borderColor = "var(--lcars-red)";
      label = "CANCELLED";
      break;
    default:
      borderColor = "var(--text-quaternary)";
      label = status.toUpperCase();
  }

  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 2,
        backgroundColor: "transparent",
        border: `1px solid ${borderColor}`,
        color: borderColor,
        fontSize: 10,
        fontWeight: 600,
        fontFamily: "'Orbitron', sans-serif",
        lineHeight: "18px",
        letterSpacing: "1px",
        boxShadow: `0 0 8px ${borderColor}33`,
      }}
    >
      {label}
    </span>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  const clamped = Math.min(Math.max(percent, 0), 100);
  const color = clamped >= 80 ? "var(--lcars-green)" : clamped >= 40 ? "var(--lcars-orange)" : "var(--lcars-yellow)";
  return (
    <div
      style={{
        width: "100%",
        height: 6,
        borderRadius: 0,
        background: "rgba(153, 153, 204, 0.1)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${clamped}%`,
          height: "100%",
          background: color,
          transition: "width 0.4s ease",
          boxShadow: `0 0 6px ${color}44`,
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
        <h1 style={styles.pageTitle}>SPRINTS & MILESTONES</h1>
        <div style={styles.pageTitleBar} />
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
      <h1 style={styles.pageTitle}>SPRINTS & MILESTONES</h1>
      <div style={styles.pageTitleBar} />

      <div style={styles.metricsRow}>
        <MetricCard label="ACTIVE SPRINTS" value={String(activeSprints)} barColor="var(--lcars-orange)" />
        <MetricCard label="ON TRACK" value={String(onTrack)} barColor="var(--lcars-green)" />
        <MetricCard label="AVG COMPLETION" value={`${avgCompletion.toFixed(0)}%`} barColor="var(--lcars-cyan)" />
      </div>

      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>MILESTONES</h2>
        <div style={styles.sectionDivider} />
        {milestones.length === 0 ? (
          <p style={styles.emptyText}>NO MILESTONES FOUND. SYNC HULY DATA FIRST.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>SPRINT</th>
                <th style={styles.th}>PROJECT</th>
                <th style={styles.th}>ISSUES</th>
                <th style={{ ...styles.th, minWidth: 120 }}>PROGRESS</th>
                <th style={styles.th}>TARGET DATE</th>
                <th style={styles.th}>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {milestones.map((m) => (
                <tr key={m.id} style={{ cursor: "default" }}>
                  <td style={{ ...styles.td, color: "var(--lcars-orange)", fontWeight: 600 }}>
                    {m.label}
                  </td>
                  <td style={styles.td}>{m.projectName ?? "--"}</td>
                  <td style={styles.tdMono}>
                    {m.completedIssues}/{m.totalIssues}
                  </td>
                  <td style={styles.td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <ProgressBar percent={m.progressPercent} />
                      <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: "var(--lcars-lavender)", whiteSpace: "nowrap" }}>
                        {m.progressPercent.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td
                    style={{
                      ...styles.tdMono,
                      color:
                        m.status === "active" && isPastDue(m.targetDate)
                          ? "var(--lcars-red)"
                          : "var(--lcars-lavender)",
                      fontWeight: isPastDue(m.targetDate) && m.status === "active" ? 600 : 400,
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
  pageTitle: lcarsPageStyles.pageTitle,
  pageTitleBar: lcarsPageStyles.pageTitleBar,
  metricsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
    marginBottom: 20,
  },
  metricCard: {
    ...lcarsPageStyles.card,
    borderLeft: "8px solid var(--lcars-orange)",
    padding: 24,
    position: "relative" as const,
  },
  metricCardBar: {
    position: "absolute" as const,
    top: 0,
    left: -4,
    right: 0,
    height: 3,
  },
  metricLabel: lcarsPageStyles.metricLabel,
  metricValue: lcarsPageStyles.metricValue,
  card: {
    ...lcarsPageStyles.card,
    borderLeftColor: "var(--lcars-peach)",
  },
  sectionTitle: lcarsPageStyles.sectionTitle,
  sectionDivider: lcarsPageStyles.sectionDivider,
  table: lcarsPageStyles.table,
  th: lcarsPageStyles.th,
  td: lcarsPageStyles.td,
  tdMono: lcarsPageStyles.tdMono,
  emptyText: lcarsPageStyles.emptyText,
};

export default Sprints;
