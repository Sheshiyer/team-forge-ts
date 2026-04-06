import { useState, useEffect, useCallback } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { timeAgo } from "../lib/format";
import type { ActivityItem } from "../lib/types";

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

      <div style={styles.card}>
        {loading ? (
          <p style={styles.emptyText}>Loading...</p>
        ) : items.length === 0 ? (
          <p style={styles.emptyText}>
            No activity yet. Sync data to populate the feed.
          </p>
        ) : (
          <div>
            {items.map((item, i) => (
              <div key={`${item.occurredAt}-${i}`} style={styles.feedItem}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <SourceBadge source={item.source} />
                  <span style={styles.employeeName}>{item.employeeName}</span>
                  <span style={styles.actionText}>{item.action}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
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
