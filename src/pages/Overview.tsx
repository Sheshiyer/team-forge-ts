import { useState, useEffect, useCallback } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { SkeletonCard, SkeletonTable } from "../components/ui/Skeleton";
import Avatar from "../components/ui/Avatar";
import type { OverviewData, QuotaRow } from "../lib/types";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";

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
  const statusCounts = quotaRows.reduce(
    (acc, row) => {
      acc[row.status] += 1;
      return acc;
    },
    { onTrack: 0, behind: 0, critical: 0 } as Record<QuotaRow["status"], number>,
  );
  const attentionRows = quotaRows
    .filter((row) => row.status !== "onTrack")
    .sort((left, right) => {
      const severity = { critical: 2, behind: 1, onTrack: 0 };
      return (
        severity[right.status] - severity[left.status] ||
        right.thisMonthHours - left.thisMonthHours ||
        left.employeeName.localeCompare(right.employeeName)
      );
    });
  const topWeeklyRows = [...quotaRows]
    .sort((left, right) => {
      return (
        right.thisWeekHours - left.thisWeekHours ||
        right.thisMonthHours - left.thisMonthHours ||
        left.employeeName.localeCompare(right.employeeName)
      );
    })
    .slice(0, 5);

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
                    <StatusPill status={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={styles.summaryGrid}>
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>STATUS SUMMARY</h2>
          <div style={styles.sectionDivider} />
          <div style={styles.summaryStatGrid}>
            <div style={styles.summaryStatCard}>
              <div style={styles.metricLabel}>ON TRACK</div>
              <div style={{ ...styles.metricValue, color: "var(--lcars-green)" }}>
                {statusCounts.onTrack}
              </div>
            </div>
            <div style={styles.summaryStatCard}>
              <div style={styles.metricLabel}>BEHIND</div>
              <div style={{ ...styles.metricValue, color: "var(--lcars-yellow)" }}>
                {statusCounts.behind}
              </div>
            </div>
            <div style={styles.summaryStatCard}>
              <div style={styles.metricLabel}>CRITICAL</div>
              <div style={{ ...styles.metricValue, color: "var(--lcars-red)" }}>
                {statusCounts.critical}
              </div>
            </div>
          </div>
          <div style={styles.summarySubtext}>
            {quotaRows.length === 0
              ? "Sync employees and Clockify time entries to populate quota status."
              : `${quotaRows.length} active crew members are included in this month’s quota projection.`}
          </div>
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>WEEKLY LOAD</h2>
          <div style={styles.sectionDivider} />
          {topWeeklyRows.length === 0 ? (
            <p style={styles.emptyText}>
              NO WEEKLY LOAD DATA AVAILABLE YET.
            </p>
          ) : (
            <div style={styles.summaryList}>
              {topWeeklyRows.map((row) => (
                <div key={row.employeeName} style={styles.summaryListItem}>
                  <div>
                    <div style={{ color: "var(--lcars-tan)", fontSize: 12 }}>
                      {row.employeeName}
                    </div>
                    <div style={styles.summarySubtext}>
                      {row.thisMonthHours.toFixed(1)}h logged this month
                    </div>
                  </div>
                  <div style={styles.summaryValueMono}>
                    {row.thisWeekHours.toFixed(1)}h
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>ATTENTION WATCHLIST</h2>
          <div style={styles.sectionDivider} />
          {attentionRows.length === 0 ? (
            <p style={styles.emptyText}>
              ALL ACTIVE CREW MEMBERS ARE CURRENTLY ON TRACK.
            </p>
          ) : (
            <div style={styles.summaryList}>
              {attentionRows.map((row) => (
                <div key={row.employeeName} style={styles.summaryListItem}>
                  <div>
                    <div style={{ color: "var(--lcars-tan)", fontSize: 12 }}>
                      {row.employeeName}
                    </div>
                    <div style={styles.summarySubtext}>
                      {row.thisMonthHours.toFixed(1)}h / {row.quota.toFixed(0)}h quota
                    </div>
                  </div>
                  <StatusPill status={row.status} />
                </div>
              ))}
            </div>
          )}
        </div>
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
  pageTitle: lcarsPageStyles.pageTitle,
  pageTitleBar: lcarsPageStyles.pageTitleBar,
  metricsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
    marginBottom: 20,
  },
  metricCard: {
    background: "var(--bg-console-soft)",
    border: "1px solid rgba(153, 153, 204, 0.16)",
    borderLeft: "8px solid var(--lcars-orange)",
    borderRadius: "0 22px 0 0",
    padding: 24,
    position: "relative" as const,
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.03), 0 18px 30px rgba(0, 0, 0, 0.2)",
  },
  metricCardBar: {
    position: "absolute" as const,
    top: 0,
    left: -8,
    right: 0,
    height: 5,
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
    ...lcarsPageStyles.card,
    borderLeft: "8px solid var(--lcars-lavender)",
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 16,
    marginTop: 16,
  },
  summaryStatGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: 12,
  },
  summaryStatCard: {
    background: "rgba(153, 153, 204, 0.04)",
    border: "1px solid rgba(153, 153, 204, 0.12)",
    padding: 14,
  },
  summaryList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  summaryListItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "8px 10px",
    background: "rgba(153, 153, 204, 0.04)",
    borderLeft: "3px solid var(--lcars-cyan)",
  },
  summarySubtext: {
    color: "var(--lcars-lavender)",
    fontSize: 11,
    marginTop: 4,
  },
  summaryValueMono: {
    color: "var(--lcars-orange)",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  sectionTitle: lcarsPageStyles.sectionTitle,
  sectionDivider: lcarsPageStyles.sectionDivider,
  table: lcarsPageStyles.table,
  th: lcarsPageStyles.th,
  td: lcarsPageStyles.td,
  tdMono: lcarsPageStyles.tdMono,
  emptyText: lcarsPageStyles.emptyText,
};

export default Overview;
