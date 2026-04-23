import { useState, useEffect, useCallback, useMemo } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { timeAgo } from "../lib/format";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";
import { SkeletonTable } from "../components/ui/Skeleton";
import Avatar from "../components/ui/Avatar";
import type { ActivityItem } from "../lib/types";

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimelineTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "--:--";
  return parsed.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// ── Weekly Timeline ────────────────────────────────────────────

function WeeklyTimeline({ activities }: { activities: ActivityItem[] }) {
  const days = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 7 }, (_, index) => {
      const dayDate = new Date(now);
      dayDate.setDate(now.getDate() - (6 - index));

      const key = dateKey(dayDate);
      const dayItems = activities
        .filter((item) => {
          const parsed = new Date(item.occurredAt);
          return !Number.isNaN(parsed.getTime()) && dateKey(parsed) === key;
        })
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

      return {
        key,
        label: dayDate.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
        date: dayDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase(),
        count: dayItems.length,
        items: dayItems.slice(0, 4),
      };
    });
  }, [activities]);

  if (days.every((day) => day.count === 0)) return null;

  return (
    <div id="weekly-timeline" style={timelineStyles.wrapper}>
      <div style={timelineStyles.headerRow}>
        <div>
          <h2 style={timelineStyles.title}>WEEKLY TIMELINE</h2>
          <div style={timelineStyles.subhead}>
            CLOCKIFY MOTION + HULY CONTEXT FOR THE LAST 7 DAYS
          </div>
        </div>
        <div style={timelineStyles.rangePill}>7 DAY WINDOW</div>
      </div>
      <div style={timelineStyles.divider} />

      <div style={timelineStyles.grid}>
        {days.map((day) => (
          <div key={day.key} style={timelineStyles.dayCard}>
            <div style={timelineStyles.dayHeader}>
              <div>
                <div style={timelineStyles.dayLabel}>{day.label}</div>
                <div style={timelineStyles.dayDate}>{day.date}</div>
              </div>
              <div style={timelineStyles.dayCount}>{day.count}</div>
            </div>

            {day.count === 0 ? (
              <div style={timelineStyles.emptyDay}>NO SIGNALS</div>
            ) : (
              <div style={timelineStyles.dayList}>
                {day.items.map((item, index) => (
                  <div key={`${day.key}-${index}`} style={timelineStyles.timelineItem}>
                    <div style={timelineStyles.timelineMeta}>
                      <span style={timelineStyles.timelineTime}>{formatTimelineTime(item.occurredAt)}</span>
                      <span style={timelineStyles.timelineSource}>{item.source.toUpperCase()}</span>
                    </div>
                    <div style={timelineStyles.timelineText}>
                      <span style={timelineStyles.timelineName}>{item.employeeName}</span>
                      <span>{item.action}</span>
                    </div>
                  </div>
                ))}
                {day.count > day.items.length && (
                  <div style={timelineStyles.moreText}>
                    +{day.count - day.items.length} MORE EVENTS
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Engagement Heatmap ────────────────────────────────────────

function EngagementHeatmap({ activities }: { activities: ActivityItem[] }) {
  const { employees, days, grid } = useMemo(() => {
    const now = new Date();
    const dayLabels: string[] = [];
    const dayKeys: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      dayLabels.push(d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase());
      dayKeys.push(d.toISOString().split("T")[0]);
    }

    const countMap = new Map<string, Map<string, number>>();
    const empSet = new Set<string>();

    for (const a of activities) {
      empSet.add(a.employeeName);
      const day = a.occurredAt.split("T")[0];
      if (!countMap.has(a.employeeName)) countMap.set(a.employeeName, new Map());
      const empMap = countMap.get(a.employeeName)!;
      empMap.set(day, (empMap.get(day) ?? 0) + 1);
    }

    const employeeNames = Array.from(empSet).sort();
    const gridData = employeeNames.map((emp) => {
      return dayKeys.map((dk) => countMap.get(emp)?.get(dk) ?? 0);
    });

    return { employees: employeeNames, days: dayLabels, grid: gridData };
  }, [activities]);

  if (employees.length === 0) return null;

  function cellColor(count: number): string {
    if (count === 0) return "rgba(153, 153, 204, 0.05)";
    if (count <= 2) return "rgba(255, 153, 0, 0.25)";
    if (count <= 5) return "rgba(255, 153, 0, 0.5)";
    return "rgba(255, 153, 0, 0.8)";
  }

  return (
    <div style={heatmapStyles.wrapper}>
      <h2 style={heatmapStyles.title}>ENGAGEMENT HEATMAP</h2>
      <div style={heatmapStyles.divider} />
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={heatmapStyles.cornerCell} />
              {days.map((d) => (
                <th key={d} style={heatmapStyles.dayLabel}>{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map((emp, ei) => (
              <tr key={emp}>
                <td style={heatmapStyles.empLabel}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Avatar name={emp} size={18} />
                    <span>{emp.toUpperCase()}</span>
                  </div>
                </td>
                {grid[ei].map((count, di) => (
                  <td key={di} style={{ padding: 2 }}>
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 0,
                        backgroundColor: cellColor(count),
                        border: count > 0 ? "1px solid rgba(255, 153, 0, 0.2)" : "1px solid transparent",
                      }}
                      title={`${emp}: ${count} activities`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const heatmapStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    ...lcarsPageStyles.card,
    borderLeftColor: "var(--lcars-orange)",
  },
  title: lcarsPageStyles.sectionTitle,
  divider: lcarsPageStyles.sectionDivider,
  cornerCell: {
    padding: "4px 12px 4px 0",
  },
  dayLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    fontWeight: 500,
    color: "var(--lcars-lavender)",
    textAlign: "center",
    padding: "0 2px 6px",
    letterSpacing: "1px",
  },
  empLabel: {
    fontSize: 10,
    fontFamily: "'Orbitron', sans-serif",
    color: "var(--lcars-lavender)",
    paddingRight: 12,
    whiteSpace: "nowrap",
    letterSpacing: "0.5px",
  },
};

const timelineStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    ...lcarsPageStyles.card,
    borderLeftColor: "var(--lcars-cyan)",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap" as const,
    gap: 16,
  },
  title: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--lcars-cyan)",
    marginBottom: 6,
    letterSpacing: "2px",
    textTransform: "uppercase" as const,
  },
  subhead: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    color: "var(--text-quaternary)",
    letterSpacing: "1px",
  },
  rangePill: {
    border: "1px solid rgba(0, 204, 255, 0.28)",
    color: "var(--lcars-cyan)",
    padding: "7px 12px",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    letterSpacing: "1.5px",
    whiteSpace: "nowrap",
    borderRadius: "0 12px 12px 0",
    background: "rgba(0, 204, 255, 0.08)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
  },
  divider: {
    ...lcarsPageStyles.sectionDivider,
    margin: "16px 0",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
  },
  dayCard: {
    background: "var(--bg-console-soft)",
    border: "1px solid rgba(0, 204, 255, 0.14)",
    padding: 14,
    minHeight: 170,
    borderRadius: "0 16px 16px 0",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
  },
  dayHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 12,
  },
  dayLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 11,
    color: "var(--lcars-orange)",
    letterSpacing: "1px",
  },
  dayDate: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: "var(--lcars-lavender)",
    marginTop: 2,
  },
  dayCount: {
    minWidth: 26,
    height: 26,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "50%",
    background: "rgba(0, 204, 255, 0.12)",
    color: "var(--lcars-cyan)",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
  },
  emptyDay: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    color: "var(--text-quaternary)",
    letterSpacing: "1px",
  },
  dayList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  timelineItem: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  timelineMeta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  timelineTime: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    color: "var(--lcars-cyan)",
  },
  timelineSource: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 8,
    color: "var(--lcars-peach)",
    letterSpacing: "1px",
  },
  timelineText: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    fontSize: 11,
    color: "var(--lcars-tan)",
  },
  timelineName: {
    color: "var(--lcars-orange)",
    fontWeight: 600,
  },
  moreText: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    color: "var(--text-quaternary)",
    letterSpacing: "1px",
    marginTop: 2,
  },
};

// ── Activity Page ─────────────────────────────────────────────

function Activity() {
  const api = useInvoke();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.getActivityFeed(120);
      setItems(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <h1 style={styles.pageTitle}>ACTIVITY</h1>
      <div style={styles.pageTitleBar} />

      {!loading && items.length > 0 && (
        <>
          <WeeklyTimeline activities={items} />
          <EngagementHeatmap activities={items} />
        </>
      )}

      <div style={styles.card}>
        {loading ? (
          <SkeletonTable rows={8} cols={3} />
        ) : items.length === 0 ? (
          <p style={styles.emptyText}>
            NO ACTIVITY YET.
          </p>
        ) : (
          <div>
            {items.map((item, i) => (
              <div key={`${item.occurredAt}-${i}`} style={styles.feedItem}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <Avatar name={item.employeeName} size={22} />
                  <SourceBadge source={item.source} />
                  <span style={styles.employeeName}>{item.employeeName}</span>
                  <span style={styles.actionText}>{item.action}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  {item.detail && (
                    item.sourceUrl ? (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ ...styles.detailText, textDecoration: "none" }}
                      >
                        {item.detail}
                      </a>
                    ) : (
                      <span style={styles.detailText}>{item.detail}</span>
                    )
                  )}
                  {item.status && (
                    <span style={styles.statusText}>{item.status.toUpperCase()}</span>
                  )}
                  <span style={styles.timeText}>{timeAgo(item.occurredAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  const normalized = source.toLowerCase();
  const color =
    normalized === "github"
      ? "var(--lcars-cyan)"
      : normalized === "clockify"
        ? "var(--lcars-orange)"
        : "var(--lcars-peach)";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 8px",
        borderRadius: 2,
        fontSize: 9,
        fontWeight: 600,
        fontFamily: "'Orbitron', sans-serif",
        letterSpacing: "1px",
        border: `1px solid ${color}`,
        color,
        textTransform: "uppercase" as const,
      }}
    >
      {source}
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageTitle: lcarsPageStyles.pageTitle,
  pageTitleBar: lcarsPageStyles.pageTitleBar,
  card: {
    ...lcarsPageStyles.card,
    borderLeftColor: "var(--lcars-green)",
  },
  feedItem: {
    padding: "12px 0",
    borderBottom: "1px solid rgba(153, 153, 204, 0.08)",
  },
  employeeName: {
    fontWeight: 600,
    color: "var(--lcars-orange)",
    fontSize: 13,
  },
  actionText: {
    color: "var(--lcars-tan)",
    fontSize: 13,
  },
  detailText: {
    color: "var(--lcars-lavender)",
    fontSize: 13,
    flex: 1,
  },
  statusText: {
    color: "var(--lcars-cyan)",
    fontSize: 10,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: "1px",
    marginLeft: 12,
  },
  timeText: {
    fontFamily: "'JetBrains Mono', monospace",
    color: "var(--text-quaternary)",
    fontSize: 12,
    flexShrink: 0,
    marginLeft: 12,
  },
  emptyText: lcarsPageStyles.emptyText,
};

export default Activity;
