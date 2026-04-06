import { useState, useEffect, useCallback, useRef } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { formatDuration, timeAgo } from "../lib/format";
import { SkeletonCard } from "../components/ui/Skeleton";
import Avatar from "../components/ui/Avatar";
import type { PresenceStatus } from "../lib/types";

function Live() {
  const api = useInvoke();
  const [presence, setPresence] = useState<PresenceStatus[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getPresenceStatus();
      setPresence(data);
      setLastUpdated(new Date());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, 30000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [load]);

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 24,
        }}
      >
        <h1 style={styles.pageTitle}>Live Presence</h1>
        {lastUpdated && (
          <span style={styles.lastUpdated}>
            Last updated: {timeAgo(lastUpdated.toISOString())}
          </span>
        )}
      </div>

      {loading ? (
        <div style={styles.grid}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : presence.length === 0 ? (
        <p style={styles.emptyText}>No employees found. Sync data first.</p>
      ) : (
        <div style={styles.grid}>
          {presence.map((p) => (
            <PresenceCard key={p.employeeName} data={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function PresenceCard({ data }: { data: PresenceStatus }) {
  const statusColor =
    data.combinedStatus === "active"
      ? "var(--status-success)"
      : data.combinedStatus === "idle"
      ? "var(--status-warning)"
      : "var(--text-quaternary)";

  const clockifyLine = data.clockifyTimerActive
    ? `Tracking: ${data.clockifyProject ?? "Unknown"} (${
        data.clockifyDuration != null
          ? formatDuration(data.clockifyDuration)
          : "--"
      })`
    : "No active timer";

  const hulyLine = data.hulyLastSeen
    ? `Active ${timeAgo(data.hulyLastSeen)}`
    : "Inactive";

  return (
    <div style={styles.presenceCard}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <Avatar name={data.employeeName} size={32} />
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: statusColor,
            flexShrink: 0,
          }}
        />
        <span style={styles.employeeName}>{data.employeeName}</span>
      </div>
      <div style={styles.presenceDetail}>
        <span style={styles.detailLabel}>Clockify</span>
        {clockifyLine}
      </div>
      <div style={styles.presenceDetail}>
        <span style={styles.detailLabel}>Huly</span>
        {hulyLine}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageTitle: {
    fontSize: 20,
    fontWeight: 600,
    color: "var(--text-primary)",
    letterSpacing: "-0.02em",
    marginBottom: 0,
  },
  lastUpdated: {
    fontSize: 12,
    color: "var(--text-quaternary)",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
    gap: 16,
  },
  presenceCard: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid var(--border-standard)",
    borderRadius: "var(--radius-lg)",
    padding: 20,
  },
  employeeName: {
    fontSize: 16,
    fontWeight: 510,
    color: "var(--text-primary)",
  },
  presenceDetail: {
    fontSize: 13,
    color: "var(--text-tertiary)",
    marginBottom: 4,
    display: "flex",
    gap: 8,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: 510,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    color: "var(--text-quaternary)",
    minWidth: 56,
  },
  emptyText: {
    fontSize: 13,
    color: "var(--text-tertiary)",
  },
};

export default Live;
