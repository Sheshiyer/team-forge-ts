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
  if (abs <= 10) return "var(--lcars-green)";
  if (abs <= 25) return "var(--lcars-yellow)";
  return "var(--lcars-red)";
}

function accuracyColor(percent: number): string {
  if (percent >= 90) return "var(--lcars-green)";
  if (percent >= 70) return "var(--lcars-yellow)";
  return "var(--lcars-red)";
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "var(--lcars-red)",
  high: "var(--lcars-orange)",
  medium: "var(--lcars-yellow)",
  low: "var(--lcars-blue)",
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
        <h1 style={styles.pageTitle}>INSIGHTS</h1>
        <div style={styles.pageTitleBar} />
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
      <h1 style={styles.pageTitle}>INSIGHTS</h1>
      <div style={styles.pageTitleBar} />

      {/* Time Discrepancies */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>CLOCKIFY VS HULY TIME</h2>
        <div style={styles.sectionDivider} />
        {discrepancies.length === 0 ? (
          <p style={styles.emptyText}>NO TIME DISCREPANCY DATA AVAILABLE</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>CREW MEMBER</th>
                <th style={styles.th}>CLOCKIFY HOURS</th>
                <th style={styles.th}>HULY HOURS</th>
                <th style={styles.th}>DIFFERENCE</th>
                <th style={styles.th}>{"\u0394"}%</th>
              </tr>
            </thead>
            <tbody>
              {discrepancies.map((d) => (
                <tr key={d.employeeName} style={{ cursor: "default" }}>
                  <td style={styles.td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Avatar name={d.employeeName} size={24} />
                      <span style={{ color: "var(--lcars-orange)" }}>{d.employeeName}</span>
                    </div>
                  </td>
                  <td style={styles.tdMono}>{d.clockifyHours.toFixed(1)}h</td>
                  <td style={styles.tdMono}>{d.hulyHours.toFixed(1)}h</td>
                  <td
                    style={{
                      ...styles.tdMono,
                      color: discrepancyColor(d.differencePercent),
                      fontWeight: 600,
                    }}
                  >
                    {d.differenceHours > 0 ? "+" : ""}
                    {d.differenceHours.toFixed(1)}h
                  </td>
                  <td
                    style={{
                      ...styles.tdMono,
                      color: discrepancyColor(d.differencePercent),
                      fontWeight: 600,
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
        <h2 style={styles.sectionTitle}>ESTIMATION ACCURACY</h2>
        <div style={styles.sectionDivider} />
        {accuracy.length === 0 ? (
          <p style={styles.emptyText}>NO ESTIMATION DATA AVAILABLE</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>CREW MEMBER</th>
                <th style={styles.th}>ISSUES</th>
                <th style={styles.th}>AVG ESTIMATED</th>
                <th style={styles.th}>AVG ACTUAL</th>
                <th style={styles.th}>ACCURACY</th>
                <th style={styles.th}>FLAG</th>
              </tr>
            </thead>
            <tbody>
              {accuracy.map((a) => (
                <tr key={a.employeeName} style={{ cursor: "default" }}>
                  <td style={styles.td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Avatar name={a.employeeName} size={24} />
                      <span style={{ color: "var(--lcars-orange)" }}>{a.employeeName}</span>
                    </div>
                  </td>
                  <td style={styles.tdMono}>{a.totalIssues}</td>
                  <td style={styles.tdMono}>{a.avgEstimatedHours.toFixed(1)}h</td>
                  <td style={styles.tdMono}>{a.avgActualHours.toFixed(1)}h</td>
                  <td
                    style={{
                      ...styles.tdMono,
                      color: accuracyColor(a.accuracyPercent),
                      fontWeight: 600,
                    }}
                  >
                    {a.accuracyPercent.toFixed(0)}%
                  </td>
                  <td style={styles.td}>
                    {a.chronicUnderEstimator && (
                      <span
                        style={{
                          display: "inline-block",
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          backgroundColor: "var(--lcars-red)",
                          boxShadow: "0 0 6px rgba(204, 51, 51, 0.5)",
                        }}
                        title="Chronic under-estimator"
                      />
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
        <h2 style={styles.sectionTitle}>PRIORITY DISTRIBUTION</h2>
        <div style={styles.sectionDivider} />
        {priorities.length === 0 ? (
          <p style={styles.emptyText}>NO PRIORITY DATA AVAILABLE</p>
        ) : (
          <>
            {/* Stacked bar */}
            <div
              style={{
                display: "flex",
                height: 24,
                borderRadius: 0,
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
                const color = PRIORITY_COLORS[p.priority.toLowerCase()] ?? "var(--text-quaternary)";
                return (
                  <div
                    key={p.priority}
                    style={{
                      background: "rgba(26, 26, 46, 0.8)",
                      borderLeft: `3px solid ${color}`,
                      padding: 12,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "'Orbitron', sans-serif",
                        fontSize: 10,
                        fontWeight: 600,
                        color,
                        textTransform: "uppercase" as const,
                        marginBottom: 4,
                        letterSpacing: "1px",
                      }}
                    >
                      {p.priority}
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 600, color: "var(--lcars-orange)" }}>
                      {p.count}
                    </div>
                    <div
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 11,
                        color: isHighPriority ? "var(--lcars-red)" : "var(--text-quaternary)",
                        fontWeight: isHighPriority ? 600 : 400,
                        marginTop: 2,
                      }}
                    >
                      {p.unassignedCount} UNASSIGNED
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
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 8,
    color: "var(--lcars-orange)",
    letterSpacing: "4px",
    textTransform: "uppercase" as const,
  },
  pageTitleBar: {
    height: 3,
    background: "linear-gradient(90deg, var(--lcars-orange), transparent)",
    marginBottom: 24,
  },
  card: {
    background: "rgba(26, 26, 46, 0.6)",
    borderLeft: "4px solid var(--lcars-blue)",
    padding: 24,
    marginBottom: 20,
  },
  sectionTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--lcars-orange)",
    marginBottom: 8,
    letterSpacing: "2px",
    textTransform: "uppercase" as const,
  },
  sectionDivider: {
    height: 2,
    background: "rgba(153, 153, 204, 0.15)",
    marginBottom: 16,
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
  emptyText: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 11,
    color: "var(--text-quaternary)",
    letterSpacing: "2px",
    textTransform: "uppercase" as const,
  },
};

export default Insights;
