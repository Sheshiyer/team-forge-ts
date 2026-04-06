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
      dayLabels.push(d.toLocaleDateString("en-US", { weekday: "short" }));
      dayKeys.push(d.toISOString().split("T")[0]);
    }

    // Count activities per employee per day
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
    if (count === 0) return "rgba(255,255,255,0.02)";
    if (count <= 2) return "rgba(94, 106, 210, 0.3)";
    if (count <= 5) return "rgba(94, 106, 210, 0.5)";
    return "rgba(94, 106, 210, 0.8)";
  }

  return (
    <div style={heatmapStyles.wrapper}>
      <h2 style={heatmapStyles.title}>Engagement Heatmap</h2>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={heatmapStyles.cornerCell} />
              {days.map((d) => (
                <th key={d} style={heatmapStyles.dayLabel}>
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map((emp, ei) => (
              <tr key={emp}>
                <td style={heatmapStyles.empLabel}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Avatar name={emp} size={18} />
                    <span>{emp}</span>
                  </div>
                </td>
                {grid[ei].map((count, di) => (
                  <td key={di} style={{ padding: 2 }}>
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 3,
                        backgroundColor: cellColor(count),
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
    background: "rgba(255,255,255,0.02)",
    border: "1px solid var(--border-standard)",
    borderRadius: "var(--radius-lg)",
    padding: 24,
    marginBottom: 20,
  },
  title: {
    fontSize: 14,
    fontWeight: 510,
    color: "var(--text-primary)",
    marginBottom: 16,
  },
  cornerCell: {
    padding: "4px 12px 4px 0",
  },
  dayLabel: {
    fontSize: 11,
    fontWeight: 500,
    color: "var(--text-quaternary)",
    textAlign: "center",
    padding: "0 2px 6px",
  },
  empLabel: {
    fontSize: 12,
    color: "var(--text-tertiary)",
    paddingRight: 12,
    whiteSpace: "nowrap",
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

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h1 style={styles.pageTitle}>Activity</h1>

      {!loading && items.length > 0 && (
        <EngagementHeatmap activities={items} />
      )}

      <div style={styles.card}>
        {loading ? (
          <SkeletonTable rows={8} cols={3} />
        ) : items.length === 0 ? (
          <p style={styles.emptyText}>
            No activity yet. Sync data to populate the feed.
          </p>
        ) : (
          <div>
            {items.map((item, i) => (
              <div key={`${item.occurredAt}-${i}`} style={styles.feedItem}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 4,
                  }}
                >
                  <Avatar name={item.employeeName} size={22} />
                  <SourceBadge source={item.source} />
                  <span style={styles.employeeName}>{item.employeeName}</span>
                  <span style={styles.actionText}>{item.action}</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                  }}
                >
                  {item.detail && (
                    <span style={styles.detailText}>{item.detail}</span>
                  )}
                  <span style={styles.timeText}>
                    {timeAgo(item.occurredAt)}
                  </span>
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
        borderRadius: "var(--radius-full)",
        fontSize: 11,
        fontWeight: 510,
        letterSpacing: "0.02em",
        background: isClockify
          ? "rgba(94, 106, 210, 0.15)"
          : "rgba(113, 112, 255, 0.15)",
        color: isClockify ? "var(--accent-brand)" : "var(--accent-violet)",
      }}
    >
      {isClockify ? "Clockify" : "Huly"}
    </span>
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
  },
  feedItem: {
    padding: "12px 0",
    borderBottom: "1px solid var(--border-subtle)",
  },
  employeeName: {
    fontWeight: 510,
    color: "var(--text-primary)",
    fontSize: 13,
  },
  actionText: {
    color: "var(--text-secondary)",
    fontSize: 13,
  },
  detailText: {
    color: "var(--text-tertiary)",
    fontSize: 13,
    flex: 1,
  },
  timeText: {
    color: "var(--text-quaternary)",
    fontSize: 12,
    flexShrink: 0,
    marginLeft: 12,
  },
  emptyText: {
    fontSize: 13,
    color: "var(--text-tertiary)",
  },
};

export default Activity;
