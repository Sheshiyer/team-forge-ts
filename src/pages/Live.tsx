import { useState, useEffect, useCallback, useRef } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { formatDuration, timeAgo } from "../lib/format";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <h1 style={styles.pageTitle}>LIVE PRESENCE</h1>
        {lastUpdated && (
          <span style={styles.lastUpdated}>
            LAST UPDATED: {timeAgo(lastUpdated.toISOString()).toUpperCase()}
          </span>
        )}
      </div>
      <div style={styles.pageTitleBar} />

      {loading ? (
        <div style={styles.grid}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : presence.length === 0 ? (
        <p style={styles.emptyText}>NO CREW MEMBERS FOUND. SYNC DATA FIRST.</p>
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
      ? "var(--lcars-green)"
      : data.combinedStatus === "idle"
      ? "var(--lcars-yellow)"
      : "var(--text-quaternary)";

  const borderColor =
    data.combinedStatus === "active"
      ? "var(--lcars-green)"
      : data.combinedStatus === "idle"
      ? "var(--lcars-yellow)"
      : "var(--lcars-lavender)";

  const clockifyLine = data.clockifyTimerActive
    ? `TRACKING: ${(data.clockifyProject ?? "UNKNOWN").toUpperCase()} (${
        data.clockifyDuration != null
          ? formatDuration(data.clockifyDuration)
          : "--"
      })`
    : "NO ACTIVE TIMER";

  const hulyLine = data.hulyLastSeen
    ? `ACTIVE ${timeAgo(data.hulyLastSeen).toUpperCase()}`
    : "INACTIVE";

  return (
    <div style={{ ...styles.presenceCard, borderLeftColor: borderColor }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <Avatar name={data.employeeName} size={32} />
        <span
          style={{
            display: "inline-block",
            width: 10,
            height: 10,
            borderRadius: "50%",
            backgroundColor: statusColor,
            flexShrink: 0,
            boxShadow: data.combinedStatus === "active" ? `0 0 8px ${statusColor}` : "none",
            animation: data.combinedStatus === "active" ? "lcars-pulse 2s ease-in-out infinite" : "none",
          }}
        />
        <span style={styles.employeeName}>{data.employeeName.toUpperCase()}</span>
      </div>
      <div style={styles.presenceDetail}>
        <span style={styles.detailLabel}>CLOCKIFY</span>
        <span style={styles.detailValue}>{clockifyLine}</span>
      </div>
      <div style={styles.presenceDetail}>
        <span style={styles.detailLabel}>HULY</span>
        <span style={styles.detailValue}>{hulyLine}</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageTitle: {
    ...lcarsPageStyles.pageTitle,
    marginBottom: 0,
  },
  pageTitleBar: lcarsPageStyles.pageTitleBar,
  lastUpdated: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: "var(--text-quaternary)",
    letterSpacing: "1px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 16,
  },
  presenceCard: {
    ...lcarsPageStyles.card,
    borderLeftColor: "var(--lcars-lavender)",
    padding: 20,
  },
  employeeName: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 14,
    fontWeight: 600,
    color: "var(--lcars-orange)",
    letterSpacing: "1.5px",
  },
  presenceDetail: {
    fontSize: 12,
    marginBottom: 4,
    display: "flex",
    gap: 8,
  },
  detailLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    fontWeight: 600,
    color: "var(--text-quaternary)",
    letterSpacing: "1px",
    minWidth: 64,
    paddingTop: 2,
  },
  detailValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    color: "var(--lcars-lavender)",
  },
  emptyText: lcarsPageStyles.emptyText,
};

export default Live;
