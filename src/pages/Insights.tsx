import { useState, useEffect, useCallback } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { SkeletonTable } from "../components/ui/Skeleton";
import Avatar from "../components/ui/Avatar";
import type {
  TimeDiscrepancy,
  EstimationAccuracy,
  PriorityDistribution,
} from "../lib/types";

function discrepancyColor(percent: number): string {
  const abs = Math.abs(percent);
  if (abs <= 10) return "var(--status-success)";
  if (abs <= 25) return "var(--status-warning)";
  return "var(--status-critical)";
}

function accuracyColor(percent: number): string {
  if (percent >= 90) return "var(--status-success)";
  if (percent >= 70) return "var(--status-warning)";
  return "var(--status-critical)";
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "var(--status-critical)",
  high: "#f97316",
  medium: "var(--status-warning)",
  low: "var(--accent-brand)",
};

function Insights() {
  const api = useInvoke();
  const [discrepancies, setDiscrepancies] = useState<TimeDiscrepancy[]>([]);
  const [accuracy, setAccuracy] = useState<EstimationAccuracy[]>([]);
  const [priorities, setPriorities] = useState<PriorityDistribution[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [d, a, p] = await Promise.all([
        api.getTimeDiscrepancies(),
        api.getEstimationAccuracy(),
        api.getPriorityDistribution(),
      ]);
      setDiscrepancies(d);
      setAccuracy(a);
      setPriorities(p);
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
        <h1 style={styles.pageTitle}>Insights</h1>
        <div style={styles.card}>
          <SkeletonTable rows={5} cols={5} />
        </div>
        <div style={styles.card}>
          <SkeletonTable rows={5} cols={6} />
        </div>
        <div style={styles.card}>
          <SkeletonTable rows={4} cols={4} />
        </div>
      </div>
    );
  }

  const totalPriority = priorities.reduce((s, p) => s + p.count, 0);

  return (
    <div>
      <h1 style={styles.pageTitle}>Insights</h1>

      {/* Time Discrepancies */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>Clockify vs Huly Time</h2>
        {discrepancies.length === 0 ? (
          <p style={styles.emptyText}>No time discrepancy data available.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Employee</th>
                <th style={styles.th}>Clockify Hours</th>
                <th style={styles.th}>Huly Hours</th>
                <th style={styles.th}>Difference</th>
                <th style={styles.th}>{"\u0394"}%</th>
              </tr>
            </thead>
            <tbody>
              {discrepancies.map((d) => (
                <tr key={d.employeeName} style={{ cursor: "default" }}>
                  <td style={styles.td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Avatar name={d.employeeName} size={24} />
                      {d.employeeName}
                    </div>
                  </td>
                  <td style={styles.td}>{d.clockifyHours.toFixed(1)}h</td>
                  <td style={styles.td}>{d.hulyHours.toFixed(1)}h</td>
                  <td
                    style={{
                      ...styles.td,
                      color: discrepancyColor(d.differencePercent),
                      fontWeight: 510,
                    }}
                  >
                    {d.differenceHours > 0 ? "+" : ""}
                    {d.differenceHours.toFixed(1)}h
                  </td>
                  <td
                    style={{
                      ...styles.td,
                      color: discrepancyColor(d.differencePercent),
                      fontWeight: 510,
                    }}
                  >
                    {d.differencePercent > 0 ? "+" : ""}
                    {d.differencePercent.toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Estimation Accuracy */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>Estimation Accuracy</h2>
        {accuracy.length === 0 ? (
          <p style={styles.emptyText}>No estimation data available.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Employee</th>
                <th style={styles.th}>Issues</th>
                <th style={styles.th}>Avg Estimated</th>
                <th style={styles.th}>Avg Actual</th>
                <th style={styles.th}>Accuracy</th>
                <th style={styles.th}>Flag</th>
              </tr>
            </thead>
            <tbody>
              {accuracy.map((a) => (
                <tr key={a.employeeName} style={{ cursor: "default" }}>
                  <td style={styles.td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Avatar name={a.employeeName} size={24} />
                      {a.employeeName}
                    </div>
                  </td>
                  <td style={styles.td}>{a.totalIssues}</td>
                  <td style={styles.td}>{a.avgEstimatedHours.toFixed(1)}h</td>
                  <td style={styles.td}>{a.avgActualHours.toFixed(1)}h</td>
                  <td
                    style={{
                      ...styles.td,
                      color: accuracyColor(a.accuracyPercent),
                      fontWeight: 510,
                    }}
                  >
                    {a.accuracyPercent.toFixed(0)}%
                  </td>
                  <td style={styles.td}>
                    {a.chronicUnderEstimator && (
                      <span title="Chronic under-estimator" style={{ fontSize: 14 }}>
                        {"\uD83D\uDD34"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Priority Distribution */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>Priority Distribution</h2>
        {priorities.length === 0 ? (
          <p style={styles.emptyText}>No priority data available.</p>
        ) : (
          <>
            {/* Stacked bar */}
            <div
              style={{
                display: "flex",
                height: 24,
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
                marginBottom: 16,
              }}
            >
              {priorities.map((p) => {
                const pct = totalPriority > 0 ? (p.count / totalPriority) * 100 : 0;
                return (
                  <div
                    key={p.priority}
                    title={`${p.priority}: ${p.count}`}
                    style={{
                      width: `${pct}%`,
                      background: PRIORITY_COLORS[p.priority.toLowerCase()] ?? "var(--text-quaternary)",
                      minWidth: pct > 0 ? 4 : 0,
                      transition: "width 0.4s ease",
                    }}
                  />
                );
              })}
            </div>

            {/* Mini cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {priorities.map((p) => {
                const isHighPriority =
                  (p.priority.toLowerCase() === "urgent" || p.priority.toLowerCase() === "high") &&
                  p.unassignedCount > 0;
                return (
                  <div
                    key={p.priority}
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-md)",
                      padding: 12,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 510,
                        color: PRIORITY_COLORS[p.priority.toLowerCase()] ?? "var(--text-tertiary)",
                        textTransform: "capitalize",
                        marginBottom: 4,
                      }}
                    >
                      {p.priority}
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 510, color: "var(--text-primary)" }}>
                      {p.count}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: isHighPriority ? "var(--status-critical)" : "var(--text-tertiary)",
                        fontWeight: isHighPriority ? 510 : 400,
                        marginTop: 2,
                      }}
                    >
                      {p.unassignedCount} unassigned
                    </div>
                  </div>
                );
              })}
            </div>
          </>
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

export default Insights;
