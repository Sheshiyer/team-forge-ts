import { useState, useEffect, useCallback } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { SkeletonCard, SkeletonTable } from "../components/ui/Skeleton";
import Avatar from "../components/ui/Avatar";
import type { OverviewData, QuotaRow } from "../lib/types";

// ── ProgressRing ──────────────────────────────────────────────

function ProgressRing({
  percent,
  size = 48,
  strokeWidth = 4,
  color,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(percent, 0), 100);
  const offset = circumference - (clamped / 100) * circumference;

  const strokeColor =
    color ??
    (clamped >= 80
      ? "var(--lcars-orange)"
      : clamped >= 50
      ? "var(--lcars-yellow)"
      : "var(--lcars-red)");

  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(153, 153, 204, 0.1)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="butt"
        style={{
          transition: "stroke-dashoffset 0.6s ease",
          filter: `drop-shadow(0 0 4px ${strokeColor})`,
        }}
      />
    </svg>
  );
}

// ── Sparkline ─────────────────────────────────────────────────

function Sparkline({
  data,
  width = 80,
  height = 24,
  color = "var(--lcars-orange)",
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function mockSparklineData(name: string): number[] {
  let seed = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const data: number[] = [];
  let val = 10 + (seed % 20);
  for (let i = 0; i < 8; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    val += (seed % 7) - 2;
    data.push(Math.max(val, 0));
  }
  return data;
}

// ── MetricCard ────────────────────────────────────────────────

const METRIC_COLORS = ["var(--lcars-orange)", "var(--lcars-cyan)", "var(--lcars-green)"];

function MetricCard({
  label,
  value,
  children,
  colorIndex = 0,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
  colorIndex?: number;
}) {
  const barColor = METRIC_COLORS[colorIndex % METRIC_COLORS.length];
  return (
    <div style={styles.metricCard}>
      <div style={{ ...styles.metricCardBar, backgroundColor: barColor }} />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div style={styles.metricLabel}>{label}</div>
          <div style={styles.metricValue}>{value}</div>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Overview Page ─────────────────────────────────────────────

function Overview() {
  const api = useInvoke();
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [quotaRows, setQuotaRows] = useState<QuotaRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [ov, qr] = await Promise.all([
        api.getOverview(),
        api.getQuotaCompliance(),
      ]);
      setOverview(ov);
      setQuotaRows(qr);
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
        <h1 style={styles.pageTitle}>OVERVIEW</h1>
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

  const hoursPercent =
    overview && overview.teamQuota > 0
      ? (overview.teamHoursThisMonth / overview.teamQuota) * 100
      : 0;

  return (
    <div>
      <h1 style={styles.pageTitle}>OVERVIEW</h1>
      <div style={styles.pageTitleBar} />

      {/* Metric Cards Row */}
      <div style={styles.metricsRow}>
        <MetricCard
          label="TEAM HOURS THIS MONTH"
          value={
            overview
              ? `${overview.teamHoursThisMonth.toFixed(1)} / ${overview.teamQuota.toFixed(0)}H`
              : "--"
          }
          colorIndex={0}
        >
          <ProgressRing percent={hoursPercent} />
        </MetricCard>

        <MetricCard
          label="UTILIZATION RATE"
          value={
            overview
              ? `${(overview.utilizationRate * 100).toFixed(1)}%`
              : "--"
          }
          colorIndex={1}
        >
          <ProgressRing
            percent={overview ? overview.utilizationRate * 100 : 0}
            color="var(--lcars-cyan)"
          />
        </MetricCard>

        <MetricCard
          label="ACTIVE NOW"
          value={
            overview
              ? `${overview.activeCount} / ${overview.totalCount}`
              : "--"
          }
          colorIndex={2}
        >
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {overview &&
              Array.from({ length: overview.totalCount }).map((_, i) => (
                <span
                  key={i}
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor:
                      i < overview.activeCount
                        ? "var(--lcars-green)"
                        : "var(--text-quaternary)",
                    boxShadow:
                      i < overview.activeCount
                        ? "0 0 6px rgba(51, 204, 102, 0.4)"
                        : "none",
                    animation:
                      i < overview.activeCount
                        ? "lcars-pulse 2s ease-in-out infinite"
                        : "none",
                  }}
                />
              ))}
          </div>
        </MetricCard>
      </div>

      {/* Quota Compliance Table */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>QUOTA COMPLIANCE</h2>
        <div style={styles.sectionDivider} />
        {quotaRows.length === 0 ? (
          <p style={styles.emptyText}>
            No data yet. Sync employees and time entries first.
          </p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>NAME</th>
                <th style={styles.th}>THIS WEEK</th>
                <th style={styles.th}>THIS MONTH</th>
                <th style={styles.th}>QUOTA</th>
                <th style={styles.th}>TREND</th>
                <th style={styles.th}>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {quotaRows.map((row) => (
                <tr key={row.employeeName} style={{ cursor: "default" }}>
                  <td style={styles.td}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <Avatar name={row.employeeName} size={24} />
                      <span style={{ color: "var(--lcars-orange)" }}>{row.employeeName}</span>
                    </div>
                  </td>
                  <td style={styles.tdMono}>{row.thisWeekHours.toFixed(1)}h</td>
                  <td style={styles.tdMono}>{row.thisMonthHours.toFixed(1)}h</td>
                  <td style={styles.tdMono}>{row.quota.toFixed(0)}h</td>
                  <td style={styles.td}>
                    <Sparkline
                      data={mockSparklineData(row.employeeName)}
                      color={
                        row.status === "onTrack"
                          ? "var(--lcars-green)"
                          : row.status === "behind"
                          ? "var(--lcars-yellow)"
                          : "var(--lcars-red)"
                      }
                    />
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

      {/* Weekly Trend */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>WEEKLY TREND</h2>
        <div style={styles.sectionDivider} />
        <p style={styles.emptyText}>AWAITING DATA STREAM</p>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  let bg: string;
  let label: string;

  switch (status) {
    case "onTrack":
      bg = "var(--lcars-green)";
      label = "ON TRACK";
      break;
    case "behind":
      bg = "var(--lcars-yellow)";
      label = "BEHIND";
      break;
    case "critical":
      bg = "var(--lcars-red)";
      label = "CRITICAL";
      break;
    default:
      bg = "var(--text-quaternary)";
      label = status.toUpperCase();
  }

  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 2,
        backgroundColor: "transparent",
        border: `1px solid ${bg}`,
        color: bg,
        fontSize: 10,
        fontWeight: 600,
        fontFamily: "'Orbitron', sans-serif",
        lineHeight: "18px",
        letterSpacing: "1px",
        textTransform: "uppercase" as const,
        boxShadow: `0 0 8px ${bg}33`,
      }}
    >
      {label}
    </span>
  );
}

// ── Styles ────────────────────────────────────────────────────

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
  metricsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 16,
    marginBottom: 20,
  },
  metricCard: {
    background: "rgba(26, 26, 46, 0.6)",
    borderLeft: "4px solid var(--lcars-orange)",
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
  metricLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    fontWeight: 500,
    color: "var(--lcars-lavender)",
    marginBottom: 8,
    letterSpacing: "2px",
    textTransform: "uppercase" as const,
  },
  metricValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 28,
    fontWeight: 600,
    color: "var(--lcars-orange)",
    letterSpacing: "-0.5px",
  },
  card: {
    background: "rgba(26, 26, 46, 0.6)",
    borderLeft: "4px solid var(--lcars-lavender)",
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

export default Overview;
