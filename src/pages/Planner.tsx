import { useState, useEffect, useCallback } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";
import { SkeletonCard, SkeletonTable } from "../components/ui/Skeleton";
import type { PlannerSlotView } from "../lib/types";

function MetricCard({
  label,
  value,
  barColor = "var(--lcars-orange)",
}: {
  label: string;
  value: string;
  barColor?: string;
}) {
  return (
    <div style={{ ...styles.metricCard, borderLeftColor: barColor }}>
      <div style={{ ...styles.metricCardBar, backgroundColor: barColor }} />
      <div style={styles.metricLabel}>{label}</div>
      <div style={styles.metricValue}>{value}</div>
    </div>
  );
}

function UtilizationBar({ percent }: { percent: number }) {
  const clamped = Math.min(Math.max(percent, 0), 120);
  const displayWidth = Math.min(clamped, 100);
  const color =
    percent > 100
      ? "var(--lcars-red)"
      : percent >= 70
        ? "var(--lcars-green)"
        : percent >= 40
          ? "var(--lcars-orange)"
          : "var(--lcars-yellow)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          width: 80,
          height: 6,
          borderRadius: 0,
          background: "rgba(153, 153, 204, 0.1)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${displayWidth}%`,
            height: "100%",
            background: color,
            transition: "width 0.4s ease",
            boxShadow: `0 0 6px ${color}44`,
          }}
        />
      </div>
      <span
        style={{
          fontSize: 11,
          fontFamily: "'JetBrains Mono', monospace",
          color,
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        {percent.toFixed(0)}%
      </span>
    </div>
  );
}

function hoursColor(scheduled: number, actual: number): string {
  if (actual > 10) return "var(--lcars-red)";
  if (scheduled < 4) return "var(--lcars-yellow)";
  return "var(--lcars-lavender)";
}

function Planner() {
  const api = useInvoke();
  const [slots, setSlots] = useState<PlannerSlotView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getPlannerCapacity();
      setSlots(data);
      setLoadError(null);
    } catch {
      setLoadError(
        "PLANNER VIEW UNAVAILABLE.",
      );
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
        <h1 style={styles.pageTitle}>PLANNER & CAPACITY</h1>
        <div style={styles.pageTitleBar} />
        <div style={styles.metricsRow}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div style={styles.card}>
          <SkeletonTable rows={6} cols={6} />
        </div>
      </div>
    );
  }

  const teamSize = slots.length;
  const baseCapacity = teamSize * 8;
  const totalScheduled = slots.reduce((s, r) => s + r.scheduledHours, 0);
  const totalActual = slots.reduce((s, r) => s + r.actualHours, 0);
  const totalMeetings = slots.reduce((s, r) => s + r.meetingBlocks, 0);
  const avgUtilization =
    slots.length > 0
      ? slots.reduce((s, r) => s + r.capacityUtilization, 0) / slots.length
      : 0;
  const overAllocated = slots.filter((r) => r.capacityUtilization > 100).length;
  const underAllocated = slots.filter(
    (r) => r.capacityUtilization < 40
  ).length;
  const netAvailable = Math.max(baseCapacity - totalMeetings, 0);

  return (
    <div>
      <h1 style={styles.pageTitle}>PLANNER & CAPACITY</h1>
      <div style={styles.pageTitleBar} />

      {/* Research note banner */}
      <div style={styles.infoBanner}>
        <div style={styles.infoBannerIcon}>◈</div>
        <div style={styles.infoBannerText}>
          DERIVED CAPACITY VIEW FROM CLOCKIFY AND HULY SIGNALS.
        </div>
      </div>

      {!loadError && (
        <div style={styles.metricsRow}>
          <MetricCard
            label="TEAM CAPACITY"
            value={`${baseCapacity}h`}
            barColor="var(--lcars-orange)"
          />
          <MetricCard
            label="AVG UTILIZATION"
            value={`${avgUtilization.toFixed(0)}%`}
            barColor="var(--lcars-cyan)"
          />
          <MetricCard
            label="OVER-ALLOCATED"
            value={String(overAllocated)}
            barColor="var(--lcars-red)"
          />
          <MetricCard
            label="UNDER-ALLOCATED"
            value={String(underAllocated)}
            barColor="var(--lcars-yellow)"
          />
        </div>
      )}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" as const }}>
        {/* Main capacity table */}
        <div style={{ ...styles.card, flex: "1 1 600px", minWidth: 0 }}>
          <h2 style={styles.sectionTitle}>CAPACITY DASHBOARD</h2>
          <div style={styles.sectionDivider} />
          {loadError ? (
            <p style={styles.emptyText}>{loadError}</p>
          ) : slots.length === 0 ? (
            <p style={styles.emptyText}>
              NO PLANNER DATA.
            </p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>EMPLOYEE</th>
                  <th style={styles.th}>SCHEDULED</th>
                  <th style={styles.th}>ACTUAL</th>
                  <th style={styles.th}>FOCUS</th>
                  <th style={styles.th}>MEETINGS</th>
                  <th style={{ ...styles.th, minWidth: 130 }}>UTILIZATION</th>
                </tr>
              </thead>
              <tbody>
                {slots.map((slot) => {
                  const hColor = hoursColor(
                    slot.scheduledHours,
                    slot.actualHours
                  );
                  return (
                    <tr key={slot.employeeName} style={{ cursor: "default" }}>
                      <td
                        style={{
                          ...styles.td,
                          color: "var(--lcars-orange)",
                          fontWeight: 600,
                        }}
                      >
                        {slot.employeeName}
                      </td>
                      <td
                        style={{
                          ...styles.tdMono,
                          color:
                            slot.scheduledHours < 4
                              ? "var(--lcars-yellow)"
                              : "var(--lcars-lavender)",
                          fontWeight: slot.scheduledHours < 4 ? 600 : 400,
                        }}
                      >
                        {slot.scheduledHours.toFixed(1)}h
                      </td>
                      <td
                        style={{
                          ...styles.tdMono,
                          color: hColor,
                          fontWeight:
                            slot.actualHours > 10 ? 600 : 400,
                        }}
                      >
                        {slot.actualHours.toFixed(1)}h
                        {slot.actualHours > 10 && (
                          <span
                            style={{
                              display: "inline-block",
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              backgroundColor: "var(--lcars-red)",
                              marginLeft: 6,
                              boxShadow: "0 0 4px rgba(204, 51, 51, 0.5)",
                            }}
                            title="Over 10h in a day"
                          />
                        )}
                      </td>
                      <td style={styles.tdMono}>{slot.focusBlocks}</td>
                      <td style={styles.tdMono}>{slot.meetingBlocks}</td>
                      <td style={styles.td}>
                        <UtilizationBar percent={slot.capacityUtilization} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {!loadError && (
          <div
            style={{
              ...styles.sideCard,
              flex: "0 0 260px",
            }}
          >
            <h2 style={styles.sectionTitle}>WEEKLY SUMMARY</h2>
            <div style={styles.sectionDivider} />

            <div style={styles.summaryRow}>
              <span style={styles.summaryLabel}>TEAM SIZE</span>
              <span style={styles.summaryValue}>{teamSize}</span>
            </div>
            <div style={styles.summaryRow}>
              <span style={styles.summaryLabel}>BASE CAPACITY</span>
              <span style={styles.summaryValue}>
                {teamSize} × 8h = {baseCapacity}h
              </span>
            </div>
            <div style={styles.summaryRow}>
              <span style={styles.summaryLabel}>SCHEDULED</span>
              <span style={styles.summaryValue}>
                {totalScheduled.toFixed(1)}h
              </span>
            </div>
            <div style={styles.summaryRow}>
              <span style={styles.summaryLabel}>ACTUAL LOGGED</span>
              <span style={styles.summaryValue}>
                {totalActual.toFixed(1)}h
              </span>
            </div>
            <div
              style={{
                ...styles.summaryRow,
                borderTop: "1px solid rgba(153, 153, 204, 0.12)",
                paddingTop: 8,
                marginTop: 4,
              }}
            >
              <span style={styles.summaryLabel}>MEETINGS</span>
              <span
                style={{
                  ...styles.summaryValue,
                  color: "var(--lcars-red)",
                }}
              >
                −{totalMeetings}h
              </span>
            </div>
            <div
              style={{
                ...styles.summaryRow,
                borderTop: "1px solid rgba(255, 153, 0, 0.18)",
                paddingTop: 10,
                marginTop: 6,
              }}
            >
              <span
                style={{
                  ...styles.summaryLabel,
                  color: "var(--lcars-orange)",
                  fontWeight: 600,
                }}
              >
                NET AVAILABLE
              </span>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 20,
                  fontWeight: 700,
                  color: "var(--lcars-orange)",
                }}
              >
                {netAvailable.toFixed(0)}h
              </span>
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
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 16,
    marginBottom: 20,
  },
  metricCard: {
    ...lcarsPageStyles.card,
    borderLeft: "8px solid var(--lcars-orange)",
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
  metricLabel: lcarsPageStyles.metricLabel,
  metricValue: lcarsPageStyles.metricValue,
  card: {
    ...lcarsPageStyles.card,
    borderLeftColor: "var(--lcars-lavender)",
  },
  sideCard: {
    ...lcarsPageStyles.card,
    borderLeftColor: "var(--lcars-orange)",
    padding: 20,
  },
  sectionTitle: lcarsPageStyles.sectionTitle,
  sectionDivider: lcarsPageStyles.sectionDivider,
  table: lcarsPageStyles.table,
  th: lcarsPageStyles.th,
  td: lcarsPageStyles.td,
  tdMono: lcarsPageStyles.tdMono,
  emptyText: lcarsPageStyles.emptyText,
  infoBanner: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    background: "rgba(153, 153, 204, 0.06)",
    border: "1px solid rgba(153, 153, 204, 0.16)",
    borderLeft: "6px solid var(--lcars-lavender)",
    borderRadius: "0 18px 18px 0",
    padding: "12px 16px",
    marginBottom: 20,
  },
  infoBannerIcon: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 14,
    color: "var(--lcars-lavender)",
    lineHeight: 1,
    marginTop: 1,
  },
  infoBannerText: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    fontWeight: 500,
    color: "var(--lcars-lavender)",
    letterSpacing: "1px",
    lineHeight: 1.6,
    textTransform: "uppercase" as const,
  },
  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 0",
  },
  summaryLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    fontWeight: 500,
    color: "var(--text-quaternary)",
    letterSpacing: "1px",
    textTransform: "uppercase" as const,
  },
  summaryValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--lcars-lavender)",
  },
};

export default Planner;
