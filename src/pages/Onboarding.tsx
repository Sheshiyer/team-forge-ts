import { useState, useEffect, useCallback } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";
import { SkeletonCard, SkeletonTable } from "../components/ui/Skeleton";
import type { OnboardingFlowView } from "../lib/types";

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

function StatusPill({ status }: { status: string }) {
  let borderColor: string;
  let label: string;

  switch (status.toLowerCase()) {
    case "in progress":
    case "in_progress":
      borderColor = "var(--lcars-cyan)";
      label = "IN PROGRESS";
      break;
    case "completed":
      borderColor = "var(--lcars-green)";
      label = "COMPLETED";
      break;
    case "stalled":
      borderColor = "var(--lcars-red)";
      label = "STALLED";
      break;
    default:
      borderColor = "var(--text-quaternary)";
      label = status.toUpperCase();
  }

  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 2,
        backgroundColor: "transparent",
        border: `1px solid ${borderColor}`,
        color: borderColor,
        fontSize: 10,
        fontWeight: 600,
        fontFamily: "'Orbitron', sans-serif",
        lineHeight: "18px",
        letterSpacing: "1px",
        boxShadow: `0 0 8px ${borderColor}33`,
      }}
    >
      {label}
    </span>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  const clamped = Math.min(Math.max(percent, 0), 100);
  const color =
    clamped >= 80
      ? "var(--lcars-green)"
      : clamped >= 40
        ? "var(--lcars-orange)"
        : "var(--lcars-yellow)";
  return (
    <div
      style={{
        width: "100%",
        height: 6,
        borderRadius: 0,
        background: "rgba(153, 153, 204, 0.1)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${clamped}%`,
          height: "100%",
          background: color,
          transition: "width 0.4s ease",
          boxShadow: `0 0 6px ${color}44`,
        }}
      />
    </div>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "--";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function TaskCheckItem({
  title,
  completed,
  completedAt,
  resourceCreated,
}: {
  title: string;
  completed: boolean;
  completedAt: string | null;
  resourceCreated: string | null;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 0",
        borderBottom: "1px solid rgba(153, 153, 204, 0.06)",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 14,
          height: 14,
          borderRadius: 2,
          border: completed
            ? "1px solid var(--lcars-green)"
            : "1px solid var(--text-quaternary)",
          backgroundColor: completed
            ? "rgba(39, 166, 68, 0.15)"
            : "transparent",
          textAlign: "center" as const,
          lineHeight: "14px",
          fontSize: 10,
          color: completed ? "var(--lcars-green)" : "var(--text-quaternary)",
        }}
      >
        {completed ? "✓" : ""}
      </span>
      <span
        style={{
          flex: 1,
          fontSize: 12,
          color: completed ? "var(--lcars-tan)" : "var(--text-quaternary)",
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {title}
      </span>
      {completedAt && (
        <span
          style={{
            fontSize: 10,
            fontFamily: "'JetBrains Mono', monospace",
            color: "var(--lcars-lavender)",
          }}
        >
          {formatDate(completedAt)}
        </span>
      )}
      {resourceCreated && (
        <span
          style={{
            fontSize: 9,
            fontFamily: "'Orbitron', sans-serif",
            color: "var(--lcars-blue)",
            letterSpacing: "0.5px",
            padding: "1px 6px",
            border: "1px solid rgba(102,136,204,0.3)",
            borderRadius: 2,
          }}
        >
          {resourceCreated}
        </span>
      )}
    </div>
  );
}

function OnboardingCard({ flow }: { flow: OnboardingFlowView }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        ...lcarsPageStyles.subtleCard,
        borderLeftColor: flow.status.toLowerCase() === "stalled"
          ? "var(--lcars-red)"
          : flow.status.toLowerCase() === "completed"
            ? "var(--lcars-green)"
            : "var(--lcars-cyan)",
        cursor: "pointer",
      }}
      onClick={() => setExpanded(!expanded)}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 8,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--lcars-orange)",
              letterSpacing: "1px",
              marginBottom: 4,
            }}
          >
            {flow.clientName}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-quaternary)",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            STARTED {formatDate(flow.startDate)}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 18,
              fontWeight: 600,
              color: "var(--lcars-lavender)",
            }}
          >
            {flow.daysElapsed}
            <span
              style={{
                fontSize: 9,
                fontFamily: "'Orbitron', sans-serif",
                color: "var(--text-quaternary)",
                marginLeft: 4,
                letterSpacing: "1px",
              }}
            >
              DAYS
            </span>
          </div>
          <StatusPill status={flow.status} />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <ProgressBar percent={flow.progressPercent} />
        <span
          style={{
            fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace",
            color: "var(--lcars-lavender)",
            whiteSpace: "nowrap",
          }}
        >
          {flow.completedTasks}/{flow.totalTasks}
        </span>
      </div>

      {expanded && flow.tasks.length > 0 && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: "1px solid rgba(153, 153, 204, 0.1)",
          }}
        >
          <div
            style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 9,
              color: "var(--lcars-lavender)",
              letterSpacing: "1.5px",
              marginBottom: 8,
              textTransform: "uppercase" as const,
            }}
          >
            ONBOARDING CHECKLIST
          </div>
          {flow.tasks.map((task) => (
            <TaskCheckItem
              key={task.id}
              title={task.title}
              completed={task.completed}
              completedAt={task.completedAt}
              resourceCreated={task.resourceCreated}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const SCENARIO_DEFS = [
  { name: "New Client Onboarding", key: "onboarding" },
  { name: "Daily Work Cycle", key: "daily" },
  { name: "Sprint Planning", key: "sprint" },
] as const;

function Onboarding() {
  const api = useInvoke();
  const [flows, setFlows] = useState<OnboardingFlowView[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.getOnboardingFlows();
      setFlows(data);
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
        <h1 style={styles.pageTitle}>CLIENT ONBOARDING</h1>
        <div style={styles.pageTitleBar} />
        <div style={styles.metricsRow}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div style={styles.card}>
          <SkeletonTable rows={4} cols={4} />
        </div>
      </div>
    );
  }

  const active = flows.filter(
    (f) => f.status.toLowerCase() !== "completed"
  );
  const activeCount = active.length;
  const avgDays =
    flows.length > 0
      ? flows.reduce((sum, f) => sum + f.daysElapsed, 0) / flows.length
      : 0;
  const totalTasks = flows.reduce((sum, f) => sum + f.totalTasks, 0);
  const completedTasks = flows.reduce((sum, f) => sum + f.completedTasks, 0);
  const templateCompliance =
    totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  // Derive scenario compliance from flow data
  const scenarioStats = SCENARIO_DEFS.map((s) => {
    if (s.key === "onboarding") {
      return {
        ...s,
        compliance: templateCompliance,
        total: flows.length,
        completed: flows.filter((f) => f.status.toLowerCase() === "completed")
          .length,
      };
    }
    // For non-onboarding scenarios, show aggregate task stats
    return {
      ...s,
      compliance: templateCompliance,
      total: totalTasks,
      completed: completedTasks,
    };
  });

  return (
    <div>
      <h1 style={styles.pageTitle}>CLIENT ONBOARDING</h1>
      <div style={styles.pageTitleBar} />

      <div style={styles.metricsRow}>
        <MetricCard
          label="ACTIVE ONBOARDINGS"
          value={String(activeCount)}
          barColor="var(--lcars-orange)"
        />
        <MetricCard
          label="AVG DAYS TO COMPLETE"
          value={avgDays.toFixed(0)}
          barColor="var(--lcars-cyan)"
        />
        <MetricCard
          label="TEMPLATE COMPLIANCE"
          value={`${templateCompliance.toFixed(0)}%`}
          barColor="var(--lcars-green)"
        />
      </div>

      {/* Onboarding flow cards */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>ONBOARDING FLOWS</h2>
        <div style={styles.sectionDivider} />
        {flows.length === 0 ? (
          <p style={styles.emptyText}>
            NO ONBOARDING FLOWS FOUND. SYNC DATA FIRST.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {flows.map((flow) => (
              <OnboardingCard key={flow.clientId} flow={flow} />
            ))}
          </div>
        )}
      </div>

      {/* Scenario tracking */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>SCENARIO TRACKING</h2>
        <div style={styles.sectionDivider} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          {scenarioStats.map((s) => (
            <div
              key={s.key}
              style={{
                ...lcarsPageStyles.subtleCard,
                borderLeftColor: "var(--lcars-lavender)",
                padding: 16,
              }}
            >
              <div
                style={{
                  fontFamily: "'Orbitron', sans-serif",
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--lcars-orange)",
                  letterSpacing: "1px",
                  marginBottom: 8,
                  textTransform: "uppercase" as const,
                }}
              >
                {s.name}
              </div>
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 22,
                  fontWeight: 600,
                  color:
                    s.compliance >= 80
                      ? "var(--lcars-green)"
                      : s.compliance >= 50
                        ? "var(--lcars-orange)"
                        : "var(--lcars-red)",
                  marginBottom: 4,
                }}
              >
                {s.compliance.toFixed(0)}%
              </div>
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                  color: "var(--text-quaternary)",
                }}
              >
                {s.completed}/{s.total} COMPLETED
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

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
    borderLeftColor: "var(--lcars-cyan)",
  },
  sectionTitle: lcarsPageStyles.sectionTitle,
  sectionDivider: lcarsPageStyles.sectionDivider,
  emptyText: lcarsPageStyles.emptyText,
};

export default Onboarding;
