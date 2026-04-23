import { useState, useEffect, useCallback } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";
import { SkeletonCard, SkeletonTable } from "../components/ui/Skeleton";
import type {
  TrainingTrackView,
  TrainingStatusRow,
  SkillsMatrixCell,
} from "../lib/types";

function ProgressBar({ percent }: { percent: number }) {
  const clamped = Math.min(Math.max(percent, 0), 100);
  const color =
    clamped >= 80
      ? "var(--lcars-green)"
      : clamped >= 40
        ? "var(--lcars-orange)"
        : "var(--lcars-yellow)";
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

function StatusPill({ status }: { status: string }) {
  let color: string;
  switch (status.toLowerCase()) {
    case "completed":
      color = "var(--lcars-green)";
      break;
    case "in progress":
      color = "var(--lcars-cyan)";
      break;
    case "overdue":
      color = "var(--lcars-red)";
      break;
    default:
      color = "var(--text-quaternary)";
  }
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 2,
        backgroundColor: "transparent",
        border: `1px solid ${color}`,
        color,
        fontSize: 10,
        fontWeight: 600,
        fontFamily: "'Orbitron', sans-serif",
        lineHeight: "18px",
        letterSpacing: "1px",
        boxShadow: `0 0 8px ${color}33`,
      }}
    >
      {status.toUpperCase()}
    </span>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "--";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isPastDue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

const LEVEL_COLORS: Record<number, string> = {
  0: "rgba(153, 153, 204, 0.06)",
  1: "rgba(255, 153, 0, 0.18)",
  2: "rgba(255, 153, 0, 0.42)",
  3: "rgba(255, 153, 0, 0.72)",
};

const LEVEL_TEXT: Record<number, string> = {
  0: "—",
  1: "1",
  2: "2",
  3: "3",
};

const TRACK_COLORS: Record<string, string> = {
  "Onboarding Track": "var(--lcars-orange)",
  "Smart Home Integration Track": "var(--lcars-cyan)",
  "PM-Developer Track": "var(--lcars-blue)",
  "R&D Contributor Track": "var(--lcars-lavender)",
};

function Training() {
  const api = useInvoke();
  const [tracks, setTracks] = useState<TrainingTrackView[]>([]);
  const [statuses, setStatuses] = useState<TrainingStatusRow[]>([]);
  const [matrix, setMatrix] = useState<SkillsMatrixCell[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [t, s, m] = await Promise.all([
        api.getTrainingTracks(),
        api.getTrainingStatus(),
        api.getSkillsMatrix(),
      ]);
      setTracks(t);
      setStatuses(s);
      setMatrix(m);
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
        <h1 style={styles.pageTitle}>TRAINING &amp; COMPLIANCE</h1>
        <div style={styles.pageTitleBar} />
        <div style={styles.metricsRow}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div style={styles.card}>
          <SkeletonTable rows={6} cols={7} />
        </div>
        <div style={styles.card}>
          <SkeletonTable rows={5} cols={6} />
        </div>
      </div>
    );
  }

  // ── Skills matrix pivoting ──
  const employees = Array.from(new Set(matrix.map((c) => c.employeeName))).sort();
  const skills = Array.from(new Set(matrix.map((c) => c.skill))).sort();
  const matrixMap = new Map<string, number>();
  for (const cell of matrix) {
    matrixMap.set(`${cell.employeeName}::${cell.skill}`, cell.level);
  }

  return (
    <div>
      <h1 style={styles.pageTitle}>TRAINING &amp; COMPLIANCE</h1>
      <div style={styles.pageTitleBar} />

      {/* ── Training Track overview cards ── */}
      <div style={styles.metricsRow}>
        {tracks.length === 0 ? (
          <div style={styles.card}>
            <p style={styles.emptyText}>NO TRAINING TRACKS CONFIGURED</p>
          </div>
        ) : (
          tracks.map((track) => {
            const barColor = TRACK_COLORS[track.name] ?? "var(--lcars-orange)";
            return (
              <div
                key={track.id}
                style={{ ...styles.trackCard, borderLeftColor: barColor }}
              >
                <div style={{ ...styles.metricCardBar, backgroundColor: barColor }} />
                <div style={styles.metricLabel}>{track.name.toUpperCase()}</div>
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 12,
                    color: "var(--lcars-tan)",
                    marginBottom: 8,
                  }}
                >
                  {track.totalModules} MODULES
                </div>
                <div style={{ marginBottom: 8 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <ProgressBar percent={track.completionRate} />
                    <span
                      style={{
                        fontSize: 12,
                        fontFamily: "'JetBrains Mono', monospace",
                        color: "var(--lcars-lavender)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {track.completionRate.toFixed(0)}%
                    </span>
                  </div>
                </div>
                {track.overdueCount > 0 && (
                  <div
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 11,
                      color: "var(--lcars-red)",
                      fontWeight: 600,
                    }}
                  >
                    {track.overdueCount} OVERDUE
                  </div>
                )}
                {track.overdueCount === 0 && (
                  <div
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 11,
                      color: "var(--lcars-green)",
                    }}
                  >
                    ON TRACK
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── Per-Employee Training Status ── */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>EMPLOYEE TRAINING STATUS</h2>
        <div style={styles.sectionDivider} />
        {statuses.length === 0 ? (
          <p style={styles.emptyText}>NO TRAINING STATUS DATA</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>EMPLOYEE</th>
                <th style={styles.th}>TRACK</th>
                <th style={{ ...styles.th, minWidth: 120 }}>PROGRESS</th>
                <th style={styles.th}>MODULES DONE</th>
                <th style={styles.th}>NEXT MODULE</th>
                <th style={styles.th}>DEADLINE</th>
                <th style={styles.th}>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {statuses.map((row, idx) => (
                <tr key={`${row.employeeName}-${row.track}-${idx}`} style={{ cursor: "default" }}>
                  <td
                    style={{
                      ...styles.td,
                      color: "var(--lcars-orange)",
                      fontWeight: 600,
                    }}
                  >
                    {row.employeeName}
                  </td>
                  <td style={styles.td}>{row.track}</td>
                  <td style={styles.td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <ProgressBar percent={row.progress} />
                      <span
                        style={{
                          fontSize: 12,
                          fontFamily: "'JetBrains Mono', monospace",
                          color: "var(--lcars-lavender)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.progress.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td style={styles.tdMono}>
                    {row.modulesDone}/{row.totalModules}
                  </td>
                  <td
                    style={{
                      ...styles.td,
                      maxWidth: 180,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap" as const,
                    }}
                  >
                    {row.nextModule ?? "—"}
                  </td>
                  <td
                    style={{
                      ...styles.tdMono,
                      color:
                        row.status.toLowerCase() !== "completed" &&
                        isPastDue(row.deadline)
                          ? "var(--lcars-red)"
                          : "var(--lcars-lavender)",
                      fontWeight:
                        isPastDue(row.deadline) &&
                        row.status.toLowerCase() !== "completed"
                          ? 600
                          : 400,
                    }}
                  >
                    {formatDate(row.deadline)}
                  </td>
                  <td style={styles.td}>
                    <StatusPill status={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Skills Matrix ── */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>SKILLS MATRIX</h2>
        <div style={styles.sectionDivider} />
        {matrix.length === 0 ? (
          <p style={styles.emptyText}>NO SKILLS MATRIX DATA</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>EMPLOYEE</th>
                  {skills.map((skill) => (
                    <th
                      key={skill}
                      style={{
                        ...styles.th,
                        textAlign: "center" as const,
                        minWidth: 80,
                      }}
                    >
                      {skill.toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr key={emp} style={{ cursor: "default" }}>
                    <td
                      style={{
                        ...styles.td,
                        color: "var(--lcars-orange)",
                        fontWeight: 600,
                        whiteSpace: "nowrap" as const,
                      }}
                    >
                      {emp}
                    </td>
                    {skills.map((skill) => {
                      const level = matrixMap.get(`${emp}::${skill}`) ?? 0;
                      return (
                        <td
                          key={skill}
                          style={{
                            ...styles.td,
                            textAlign: "center" as const,
                            background: LEVEL_COLORS[level] ?? LEVEL_COLORS[0],
                            color:
                              level >= 2
                                ? "var(--lcars-orange)"
                                : level === 1
                                  ? "var(--lcars-tan)"
                                  : "var(--text-quaternary)",
                            fontFamily: "'JetBrains Mono', monospace",
                            fontWeight: level >= 2 ? 600 : 400,
                            fontSize: 13,
                          }}
                        >
                          {LEVEL_TEXT[level] ?? "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Legend */}
            <div
              style={{
                display: "flex",
                gap: 16,
                marginTop: 12,
                alignItems: "center",
              }}
            >
              <span style={styles.legendLabel}>COMPETENCY:</span>
              {[0, 1, 2, 3].map((level) => (
                <div
                  key={level}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      background: LEVEL_COLORS[level],
                      border: "1px solid rgba(153, 153, 204, 0.15)",
                    }}
                  />
                  <span style={styles.legendValue}>
                    {level === 0
                      ? "NONE"
                      : level === 1
                        ? "BASIC"
                        : level === 2
                          ? "PROFICIENT"
                          : "EXPERT"}
                  </span>
                </div>
              ))}
            </div>
          </div>
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
  trackCard: {
    ...lcarsPageStyles.card,
    borderLeft: "8px solid var(--lcars-orange)",
    padding: 20,
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
  card: {
    ...lcarsPageStyles.card,
    borderLeftColor: "var(--lcars-cyan)",
  },
  sectionTitle: lcarsPageStyles.sectionTitle,
  sectionDivider: lcarsPageStyles.sectionDivider,
  table: lcarsPageStyles.table,
  th: lcarsPageStyles.th,
  td: lcarsPageStyles.td,
  tdMono: lcarsPageStyles.tdMono,
  emptyText: lcarsPageStyles.emptyText,
  legendLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    color: "var(--text-quaternary)",
    letterSpacing: "1px",
    textTransform: "uppercase" as const,
  },
  legendValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    color: "var(--lcars-tan)",
  },
};

export default Training;
