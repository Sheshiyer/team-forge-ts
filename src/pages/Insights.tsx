import { useState, useEffect, useCallback } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";
import { SkeletonTable } from "../components/ui/Skeleton";
import Avatar from "../components/ui/Avatar";
import type {
  TimeDiscrepancy,
  EstimationAccuracy,
  PriorityDistribution,
  NamingComplianceStats,
  StandupReport,
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
  const [naming, setNaming] = useState<NamingComplianceStats | null>(null);
  const [standup, setStandup] = useState<StandupReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [d, a, p, n, s] = await Promise.all([
        api.getTimeDiscrepancies(),
        api.getEstimationAccuracy(),
        api.getPriorityDistribution(),
        api.getNamingCompliance(),
        api.getStandupReport(),
      ]);
      setDiscrepancies(d);
      setAccuracy(a);
      setPriorities(p);
      setNaming(n);
      setStandup(s);
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
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                gap: 12,
              }}
            >
              {priorities.map((p) => {
                const isHighPriority =
                  (p.priority.toLowerCase() === "urgent" || p.priority.toLowerCase() === "high") &&
                  p.unassignedCount > 0;
                const color = PRIORITY_COLORS[p.priority.toLowerCase()] ?? "var(--text-quaternary)";
                return (
                  <div
                    key={p.priority}
                    style={{
                      ...lcarsPageStyles.subtleCard,
                      borderLeftColor: color,
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

      {/* Naming Convention Compliance (#13) */}
      {naming && (
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>TASK NAMING COMPLIANCE</h2>
          <div style={styles.sectionDivider} />
          <div style={{ display: "flex", gap: 24, marginBottom: 16, flexWrap: "wrap" as const }}>
            <div style={styles.metricBox}>
              <div style={styles.metricValue}>{naming.compliancePercent.toFixed(0)}%</div>
              <div style={styles.metricLabel}>COMPLIANT</div>
            </div>
            <div style={styles.metricBox}>
              <div style={{ ...styles.metricValue, color: "var(--lcars-green)" }}>{naming.compliant}</div>
              <div style={styles.metricLabel}>FOLLOWING FORMAT</div>
            </div>
            <div style={styles.metricBox}>
              <div style={{ ...styles.metricValue, color: "var(--lcars-red)" }}>{naming.total - naming.compliant}</div>
              <div style={styles.metricLabel}>NON-COMPLIANT</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" as const }}>
            <div>
              <div style={styles.subLabel}>BY PROJECT</div>
              {naming.byProject.map((p) => (
                <div key={p.projectCode} style={styles.tagRow}>
                  <span style={styles.tag}>{p.projectCode}</span>
                  <span style={styles.tagCount}>{p.count}</span>
                </div>
              ))}
            </div>
            <div>
              <div style={styles.subLabel}>BY TYPE</div>
              {naming.byType.map((t) => (
                <div key={t.typeCode} style={styles.tagRow}>
                  <span style={styles.tag}>{t.typeCode}</span>
                  <span style={styles.tagCount}>{t.count}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 12, color: "var(--text-quaternary)", fontSize: 11 }}>
            FORMAT: [PROJECT]-[TYPE]-[COMPONENT]-[ID]: Description
          </div>
        </div>
      )}

      {/* Standup Compliance (#10) */}
      {standup && (
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>STANDUP COMPLIANCE — {standup.date}</h2>
          <div style={styles.sectionDivider} />
          <div style={{ display: "flex", gap: 24, marginBottom: 16, flexWrap: "wrap" as const }}>
            <div style={styles.metricBox}>
              <div style={styles.metricValue}>{standup.compliancePercent.toFixed(0)}%</div>
              <div style={styles.metricLabel}>POSTED TODAY</div>
            </div>
            <div style={styles.metricBox}>
              <div style={{ ...styles.metricValue, color: "var(--lcars-green)" }}>{standup.postedCount}</div>
              <div style={styles.metricLabel}>POSTED</div>
            </div>
            <div style={styles.metricBox}>
              <div style={{ ...styles.metricValue, color: standup.missingCount > 0 ? "var(--lcars-red)" : "var(--lcars-green)" }}>
                {standup.missingCount}
              </div>
              <div style={styles.metricLabel}>MISSING</div>
            </div>
          </div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>CREW MEMBER</th>
                <th style={styles.th}>STATUS</th>
                <th style={styles.th}>CHANNEL</th>
                <th style={styles.th}>POSTED AT</th>
                <th style={styles.th}>PREVIEW</th>
              </tr>
            </thead>
            <tbody>
              {standup.entries.map((e) => (
                <tr key={e.employeeName}>
                  <td style={styles.td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Avatar name={e.employeeName} size={24} />
                      <span style={{ color: "var(--lcars-orange)" }}>{e.employeeName}</span>
                    </div>
                  </td>
                  <td style={styles.td}>
                    <span style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: e.status === "posted" ? "var(--lcars-green)" : "var(--lcars-red)",
                      marginRight: 6,
                    }} />
                    {e.status.toUpperCase()}
                  </td>
                  <td style={styles.td}>{e.channel || "—"}</td>
                  <td style={styles.tdMono}>{e.postedAt ? e.postedAt.slice(11, 16) : "—"}</td>
                  <td style={{ ...styles.td, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, color: "var(--text-tertiary)", fontSize: 12 }}>
                    {e.contentPreview ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageTitle: lcarsPageStyles.pageTitle,
  pageTitleBar: lcarsPageStyles.pageTitleBar,
  card: {
    ...lcarsPageStyles.card,
    borderLeftColor: "var(--lcars-blue)",
  },
  sectionTitle: lcarsPageStyles.sectionTitle,
  sectionDivider: lcarsPageStyles.sectionDivider,
  table: lcarsPageStyles.table,
  th: lcarsPageStyles.th,
  td: lcarsPageStyles.td,
  tdMono: lcarsPageStyles.tdMono,
  emptyText: lcarsPageStyles.emptyText,
  metricBox: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    padding: "12px 20px",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 4,
    minWidth: 100,
  },
  metricValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 28,
    fontWeight: 700,
    color: "var(--lcars-orange)",
    lineHeight: 1,
  },
  metricLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    color: "var(--text-quaternary)",
    letterSpacing: "1px",
    marginTop: 4,
    textTransform: "uppercase" as const,
  },
  subLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    color: "var(--text-tertiary)",
    letterSpacing: "1px",
    marginBottom: 8,
    textTransform: "uppercase" as const,
  },
  tagRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  tag: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: "var(--lcars-blue)",
    background: "rgba(102,136,204,0.12)",
    padding: "2px 6px",
    borderRadius: 2,
    minWidth: 70,
    display: "inline-block",
  },
  tagCount: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    color: "var(--text-secondary)",
  },
};

export default Insights;
