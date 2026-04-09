import { useState, useEffect, useCallback } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";
import { SkeletonCard, SkeletonTable } from "../components/ui/Skeleton";
import Avatar from "../components/ui/Avatar";
import type { MilestoneView, SprintDetailView, SprintBurndownPoint } from "../lib/types";

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

function BurndownChart({ points }: { points: SprintBurndownPoint[] }) {
  if (points.length === 0) return <p style={styles.emptyText}>NO BURNDOWN DATA AVAILABLE</p>;
  const maxVal = Math.max(...points.map((p) => Math.max(p.remaining, p.ideal)), 1);
  const w = 480;
  const h = 160;
  const pad = { top: 12, right: 12, bottom: 24, left: 36 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;
  const xStep = points.length > 1 ? cw / (points.length - 1) : cw;
  const toPath = (key: "remaining" | "ideal") =>
    points
      .map((p, i) => {
        const x = pad.left + i * xStep;
        const y = pad.top + ch - (p[key] / maxVal) * ch;
        return `${i === 0 ? "M" : "L"}${x},${y}`;
      })
      .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", maxWidth: w, height: "auto" }}>
      <line x1={pad.left} y1={pad.top + ch} x2={pad.left + cw} y2={pad.top + ch} stroke="rgba(153,153,204,0.2)" />
      <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + ch} stroke="rgba(153,153,204,0.2)" />
      <path d={toPath("ideal")} fill="none" stroke="rgba(153,153,204,0.35)" strokeWidth={1.5} strokeDasharray="6 4" />
      <path d={toPath("remaining")} fill="none" stroke="#ff9900" strokeWidth={2} />
      {points.map((p, i) => (
        <circle key={i} cx={pad.left + i * xStep} cy={pad.top + ch - (p.remaining / maxVal) * ch} r={3} fill="#ff9900" />
      ))}
      <text x={pad.left + cw / 2} y={h - 2} textAnchor="middle" fill="#9999cc" fontSize={9} fontFamily="Orbitron">
        SPRINT DAY
      </text>
    </svg>
  );
}

function Sprints() {
  const api = useInvoke();
  const [milestones, setMilestones] = useState<MilestoneView[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSprint, setSelectedSprint] = useState<string | null>(null);
  const [sprintDetail, setSprintDetail] = useState<SprintDetailView | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

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

  const loadDetail = useCallback(async (sprintId: string) => {
    setDetailLoading(true);
    try {
      const detail = await api.getSprintDetail(sprintId);
      setSprintDetail(detail);
    } catch {
      setSprintDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

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
                <th style={styles.th}></th>
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
                  <td style={styles.td}>
                    <button
                      onClick={() => {
                        const next = selectedSprint === m.id ? null : m.id;
                        setSelectedSprint(next);
                        if (next) loadDetail(next);
                        else setSprintDetail(null);
                      }}
                      style={{
                        ...lcarsPageStyles.ghostButton,
                        padding: "3px 10px",
                        fontSize: 10,
                        background: selectedSprint === m.id ? "rgba(255,153,0,0.1)" : "rgba(10,10,20,0.68)",
                        border: `1px solid ${selectedSprint === m.id ? "var(--lcars-orange)" : "rgba(153,153,204,0.25)"}`,
                      }}
                    >
                      {selectedSprint === m.id ? "CLOSE" : "DETAIL"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Sprint Detail Panel */}
      {selectedSprint && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Burndown Chart */}
          <div style={{ ...styles.card, borderLeftColor: "var(--lcars-cyan)" }}>
            <h2 style={styles.sectionTitle}>SPRINT BURNDOWN</h2>
            <div style={styles.sectionDivider} />
            {detailLoading ? (
              <SkeletonCard />
            ) : sprintDetail ? (
              <BurndownChart points={sprintDetail.burndown} />
            ) : (
              <p style={styles.emptyText}>NO BURNDOWN DATA AVAILABLE</p>
            )}
          </div>

          {/* Sprint Goal & Retro */}
          <div style={{ ...styles.card, borderLeftColor: "var(--lcars-green)" }}>
            <h2 style={styles.sectionTitle}>SPRINT GOAL</h2>
            <div style={styles.sectionDivider} />
            {sprintDetail?.goal ? (
              <p style={{ color: "var(--lcars-tan)", fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
                {sprintDetail.goal}
              </p>
            ) : (
              <p style={styles.emptyText}>NO SPRINT GOAL SET</p>
            )}

            <h2 style={{ ...styles.sectionTitle, marginTop: 16 }}>RETRO NOTES</h2>
            <div style={styles.sectionDivider} />
            {sprintDetail?.retroNotes ? (
              <p style={{ color: "var(--lcars-lavender)", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {sprintDetail.retroNotes}
              </p>
            ) : (
              <p style={styles.emptyText}>NO RETROSPECTIVE NOTES</p>
            )}
          </div>

          {/* Capacity Planning */}
          <div style={{ ...styles.card, borderLeftColor: "var(--lcars-orange)" }}>
            <h2 style={styles.sectionTitle}>CAPACITY PLANNING</h2>
            <div style={styles.sectionDivider} />
            {sprintDetail && sprintDetail.capacity.length > 0 ? (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>MEMBER</th>
                    <th style={styles.th}>SCHEDULED</th>
                    <th style={styles.th}>AVAILABLE</th>
                    <th style={styles.th}>UTILIZATION</th>
                  </tr>
                </thead>
                <tbody>
                  {sprintDetail.capacity.map((c) => {
                    const pct = c.utilization * 100;
                    const color = pct > 100 ? "var(--lcars-red)" : pct >= 80 ? "var(--lcars-orange)" : "var(--lcars-green)";
                    return (
                      <tr key={c.employeeName}>
                        <td style={styles.td}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <Avatar name={c.employeeName} size={22} />
                            <span>{c.employeeName}</span>
                          </div>
                        </td>
                        <td style={styles.tdMono}>{c.scheduledHours.toFixed(1)}h</td>
                        <td style={styles.tdMono}>{c.availableHours.toFixed(1)}h</td>
                        <td style={{ ...styles.tdMono, color, fontWeight: 600 }}>{pct.toFixed(0)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p style={styles.emptyText}>NO CAPACITY DATA AVAILABLE</p>
            )}
          </div>

          {/* Sprint Comparison */}
          <div style={{ ...styles.card, borderLeftColor: "var(--lcars-lavender)" }}>
            <h2 style={styles.sectionTitle}>SPRINT COMPARISON</h2>
            <div style={styles.sectionDivider} />
            {sprintDetail?.comparison ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <div style={styles.metricLabel}>VELOCITY (CURRENT)</div>
                  <div style={styles.metricValue}>{sprintDetail.comparison.currentVelocity}</div>
                </div>
                <div>
                  <div style={styles.metricLabel}>VELOCITY (PREVIOUS)</div>
                  <div style={{ ...styles.metricValue, color: "var(--lcars-lavender)" }}>{sprintDetail.comparison.previousVelocity}</div>
                </div>
                <div>
                  <div style={styles.metricLabel}>COMPLETION (CURRENT)</div>
                  <div style={styles.metricValue}>{sprintDetail.comparison.currentCompletion}%</div>
                </div>
                <div>
                  <div style={styles.metricLabel}>COMPLETION (PREVIOUS)</div>
                  <div style={{ ...styles.metricValue, color: "var(--lcars-lavender)" }}>{sprintDetail.comparison.previousCompletion}%</div>
                </div>
              </div>
            ) : (
              <p style={styles.emptyText}>NO COMPARISON DATA. REQUIRES PREVIOUS SPRINT.</p>
            )}
          </div>
        </div>
      )}
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
