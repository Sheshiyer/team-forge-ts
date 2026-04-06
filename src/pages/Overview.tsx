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
      ? "var(--accent-brand)"
      : clamped >= 50
      ? "var(--status-warning)"
      : "var(--status-critical)");

  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.05)"
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
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
    </svg>
  );
}

// ── Sparkline ─────────────────────────────────────────────────

function Sparkline({
  data,
  width = 80,
  height = 24,
  color = "var(--accent-brand)",
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

/**
 * Generate mock sparkline data for a given employee name.
 * Uses a simple seeded approach so the same name always produces the same data.
 * TODO: Replace with real historical weekly data from a new Tauri command
 * (e.g. `get_employee_weekly_hours`) in a future pass.
 */
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

function MetricCard({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <div style={styles.metricCard}>
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
        <h1 style={styles.pageTitle}>Overview</h1>
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
      <h1 style={styles.pageTitle}>Overview</h1>

      {/* Metric Cards Row */}
      <div style={styles.metricsRow}>
        <MetricCard
          label="Team Hours This Month"
          value={
            overview
              ? `${overview.teamHoursThisMonth.toFixed(1)} / ${overview.teamQuota.toFixed(0)}h`
              : "--"
          }
        >
          <ProgressRing percent={hoursPercent} />
        </MetricCard>

        <MetricCard
          label="Utilization Rate"
          value={
            overview
              ? `${(overview.utilizationRate * 100).toFixed(1)}%`
              : "--"
          }
        >
          <ProgressRing
            percent={overview ? overview.utilizationRate * 100 : 0}
            color="var(--accent-violet)"
          />
        </MetricCard>

        <MetricCard
          label="Active Now"
          value={
            overview
              ? `${overview.activeCount} / ${overview.totalCount}`
              : "--"
          }
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
                        ? "var(--status-success)"
                        : "var(--text-quaternary)",
                  }}
                />
              ))}
          </div>
        </MetricCard>
      </div>

      {/* Quota Compliance Table */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>Quota Compliance</h2>
        {quotaRows.length === 0 ? (
          <p style={styles.emptyText}>
            No data yet. Sync employees and time entries first.
          </p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>This Week</th>
                <th style={styles.th}>This Month</th>
                <th style={styles.th}>Quota</th>
                <th style={styles.th}>Trend</th>
                <th style={styles.th}>Status</th>
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
                      {row.employeeName}
                    </div>
                  </td>
                  <td style={styles.td}>{row.thisWeekHours.toFixed(1)}h</td>
                  <td style={styles.td}>{row.thisMonthHours.toFixed(1)}h</td>
                  <td style={styles.td}>{row.quota.toFixed(0)}h</td>
                  <td style={styles.td}>
                    <Sparkline
                      data={mockSparklineData(row.employeeName)}
                      color={
                        row.status === "onTrack"
                          ? "var(--status-success)"
                          : row.status === "behind"
                          ? "var(--status-warning)"
                          : "var(--status-critical)"
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

      {/* Weekly Trend Placeholder */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>Weekly Trend</h2>
        <p style={styles.emptyText}>Coming Soon</p>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  let bg: string;
  let color: string;
  let label: string;

  switch (status) {
    case "onTrack":
      bg = "var(--status-success)";
      color = "#fff";
      label = "On Track";
      break;
    case "behind":
      bg = "var(--status-warning)";
      color = "#1a1a1a";
      label = "Behind";
      break;
    case "critical":
      bg = "var(--status-critical)";
      color = "#fff";
      label = "Critical";
      break;
    default:
      bg = "var(--text-quaternary)";
      color = "#fff";
      label = status;
  }

  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: "var(--radius-full)",
        backgroundColor: bg,
        color,
        fontSize: 12,
        fontWeight: 510,
        lineHeight: "20px",
      }}
    >
      {label}
    </span>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  pageTitle: {
    fontSize: 20,
    fontWeight: 600,
    marginBottom: 24,
    color: "var(--text-primary)",
    letterSpacing: "-0.02em",
  },
  metricsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 16,
    marginBottom: 20,
  },
  metricCard: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid var(--border-standard)",
    borderRadius: "var(--radius-lg)",
    padding: 24,
  },
  metricLabel: {
    fontSize: 13,
    fontWeight: 510,
    color: "var(--text-tertiary)",
    marginBottom: 8,
  },
  metricValue: {
    fontSize: 32,
    fontWeight: 510,
    color: "var(--text-primary)",
    letterSpacing: "-0.704px",
  },
  card: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid var(--border-standard)",
    borderRadius: "var(--radius-lg)",
    padding: 24,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 510,
    color: "var(--text-primary)",
    marginBottom: 16,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 13,
  },
  th: {
    textAlign: "left" as const,
    color: "var(--text-tertiary)",
    fontWeight: 500,
    padding: "8px 12px",
    borderBottom: "1px solid var(--border-subtle)",
    fontSize: 12,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  td: {
    padding: "10px 12px",
    color: "var(--text-secondary)",
    borderBottom: "1px solid var(--border-subtle)",
  },
  emptyText: {
    fontSize: 13,
    color: "var(--text-tertiary)",
  },
};

export default Overview;
