import { useState, useEffect, useCallback, useMemo } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { timeAgo } from "../lib/format";
import { SkeletonTable } from "../components/ui/Skeleton";
import Avatar from "../components/ui/Avatar";
import type { ActivityItem } from "../lib/types";

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
    background: "rgba(26, 26, 46, 0.6)",
    borderLeft: "4px solid var(--lcars-orange)",
    padding: 24,
    marginBottom: 20,
  },
  title: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--lcars-orange)",
    marginBottom: 8,
    letterSpacing: "2px",
    textTransform: "uppercase" as const,
  },
  divider: {
    height: 2,
    background: "rgba(153, 153, 204, 0.15)",
    marginBottom: 16,
  },
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

// ── Activity Page ─────────────────────────────────────────────

function Activity() {
  const api = useInvoke();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.getActivityFeed(50);
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
        <EngagementHeatmap activities={items} />
      )}

      <div style={styles.card}>
        {loading ? (
          <SkeletonTable rows={8} cols={3} />
        ) : items.length === 0 ? (
          <p style={styles.emptyText}>
            NO ACTIVITY YET. SYNC DATA TO POPULATE THE FEED.
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
                    <span style={styles.detailText}>{item.detail}</span>
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
  const isClockify = source.toLowerCase() === "clockify";
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
        border: `1px solid ${isClockify ? "var(--lcars-orange)" : "var(--lcars-peach)"}`,
        color: isClockify ? "var(--lcars-orange)" : "var(--lcars-peach)",
        textTransform: "uppercase" as const,
      }}
    >
      {isClockify ? "CLOCKIFY" : "HULY"}
    </span>
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
    borderLeft: "4px solid var(--lcars-green)",
    padding: 24,
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
  timeText: {
    fontFamily: "'JetBrains Mono', monospace",
    color: "var(--text-quaternary)",
    fontSize: 12,
    flexShrink: 0,
    marginLeft: 12,
  },
  emptyText: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 11,
    color: "var(--text-quaternary)",
    letterSpacing: "2px",
    textTransform: "uppercase" as const,
  },
};

export default Activity;
