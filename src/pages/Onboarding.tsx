import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useInvoke } from "../hooks/useInvoke";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";
import { SkeletonCard, SkeletonTable } from "../components/ui/Skeleton";
import type { OnboardingAudience, OnboardingFlowView } from "../lib/types";

type OnboardingAudienceFilter = OnboardingAudience | "all";

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

function onboardingFlowNeedsReview(flow: OnboardingFlowView): boolean {
  if (flow.status.toLowerCase() === "completed") {
    return false;
  }
  if (flow.status.toLowerCase() === "stalled") {
    return true;
  }

  return (
    (flow.daysElapsed >= 14 && flow.progressPercent < 50) ||
    (flow.daysElapsed >= 30 && flow.progressPercent < 100)
  );
}

function matchesStatusFilter(flow: OnboardingFlowView, statusFilter: string | null): boolean {
  switch (statusFilter) {
    case "active":
      return flow.status.toLowerCase() !== "completed";
    case "stalled":
      return flow.status.toLowerCase() === "stalled";
    case "completed":
      return flow.status.toLowerCase() === "completed";
    case "at-risk":
      return onboardingFlowNeedsReview(flow);
    default:
      return true;
  }
}

function TaskCheckItem({
  title,
  completed,
  completedAt,
  resourceCreated,
  notes,
}: {
  title: string;
  completed: boolean;
  completedAt: string | null;
  resourceCreated: string | null;
  notes: string | null;
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
      {notes && (
        <div
          style={{
            marginLeft: 24,
            color: "var(--text-quaternary)",
            fontSize: 10,
            fontFamily: "'JetBrains Mono', monospace",
            lineHeight: 1.4,
          }}
        >
          {notes}
        </div>
      )}
    </div>
  );
}

function OnboardingCard({ flow }: { flow: OnboardingFlowView }) {
  const [expanded, setExpanded] = useState(false);
  const subtitle =
    flow.audience === "client"
      ? flow.primaryContact
        ? `PRIMARY CONTACT · ${flow.primaryContact}`
        : "CLIENT FLOW"
      : [flow.department, flow.manager].filter(Boolean).join(" · ") || "TEAMFORGE FLOW";

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
            {flow.subjectName}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-quaternary)",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {subtitle} · STARTED {formatDate(flow.startDate)}
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
              notes={task.notes}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Onboarding() {
  const api = useInvoke();
  const [searchParams, setSearchParams] = useSearchParams();
  const [flows, setFlows] = useState<OnboardingFlowView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const audienceParam = searchParams.get("audience");
  const tab: OnboardingAudienceFilter =
    audienceParam === "employee"
      ? "employee"
      : audienceParam === "all"
        ? "all"
        : "client";
  const statusFilter = searchParams.get("status");
  const flowFilter = searchParams.get("flow")?.trim().toLowerCase() ?? null;

  const load = useCallback(async () => {
    try {
      const data = await api.getOnboardingFlows();
      setFlows(data);
      setLoadError(null);
    } catch {
      setLoadError(
        "ONBOARDING FLOWS UNAVAILABLE.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateSearchParam = useCallback(
    (key: string, value: string | null) => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        if (value && value.trim()) {
          next.set(key, value);
        } else {
          next.delete(key);
        }
        return next;
      });
    },
    [setSearchParams],
  );

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

  const visibleFlows = flows.filter(
    (flow) =>
      (tab === "all" || flow.audience === tab) &&
      matchesStatusFilter(flow, statusFilter) &&
      (flowFilter === null || flow.id.trim().toLowerCase() === flowFilter),
  );
  const active = visibleFlows.filter(
    (f) => f.status.toLowerCase() !== "completed"
  );
  const activeCount = active.length;
  const avgDays =
    visibleFlows.length > 0
      ? visibleFlows.reduce((sum, f) => sum + f.daysElapsed, 0) / visibleFlows.length
      : 0;
  const totalTasks = visibleFlows.reduce((sum, f) => sum + f.totalTasks, 0);
  const completedTasks = visibleFlows.reduce((sum, f) => sum + f.completedTasks, 0);
  const templateCompliance =
    totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
  const stalledFlows = visibleFlows.filter(
    (flow) => flow.status.toLowerCase() === "stalled"
  ).length;
  const heading =
    tab === "client"
      ? "CLIENT ONBOARDING"
      : tab === "employee"
        ? "EMPLOYEE ONBOARDING"
        : "ONBOARDING FLOWS";

  return (
    <div>
      <h1 style={styles.pageTitle}>{heading}</h1>
      <div style={styles.pageTitleBar} />

      <div style={styles.infoBanner}>
        <div style={styles.infoBannerIcon}>◈</div>
        <div style={styles.infoBannerText}>
          This page shows saved onboarding flows only. If a flow has not been
          created yet, the view stays empty.
        </div>
      </div>

      <div style={styles.tabRow}>
        <button
          onClick={() => updateSearchParam("audience", "all")}
          style={{
            ...styles.tabButton,
            ...(tab === "all" ? styles.tabButtonActive : null),
          }}
        >
          ALL ONBOARDING
        </button>
        <button
          onClick={() => updateSearchParam("audience", "client")}
          style={{
            ...styles.tabButton,
            ...(tab === "client" ? styles.tabButtonActive : null),
          }}
        >
          CLIENT ONBOARDING
        </button>
        <button
          onClick={() => updateSearchParam("audience", "employee")}
          style={{
            ...styles.tabButton,
            ...(tab === "employee" ? styles.tabButtonActive : null),
          }}
        >
          EMPLOYEE ONBOARDING
        </button>
      </div>

      <div style={styles.statusFilterRow}>
        <button
          type="button"
          onClick={() => updateSearchParam("status", null)}
          style={{
            ...styles.statusFilterButton,
            ...(statusFilter === null ? styles.statusFilterButtonActive : null),
          }}
        >
          ALL FLOWS
        </button>
        <button
          type="button"
          onClick={() => updateSearchParam("status", "active")}
          style={{
            ...styles.statusFilterButton,
            ...(statusFilter === "active" ? styles.statusFilterButtonActive : null),
          }}
        >
          ACTIVE
        </button>
        <button
          type="button"
          onClick={() => updateSearchParam("status", "at-risk")}
          style={{
            ...styles.statusFilterButton,
            ...(statusFilter === "at-risk" ? styles.statusFilterButtonActive : null),
          }}
        >
          AT RISK
        </button>
        <button
          type="button"
          onClick={() => updateSearchParam("status", "stalled")}
          style={{
            ...styles.statusFilterButton,
            ...(statusFilter === "stalled" ? styles.statusFilterButtonActive : null),
          }}
        >
          STALLED
        </button>
        <button
          type="button"
          onClick={() => updateSearchParam("status", "completed")}
          style={{
            ...styles.statusFilterButton,
            ...(statusFilter === "completed" ? styles.statusFilterButtonActive : null),
          }}
        >
          COMPLETED
        </button>
      </div>

      {!loadError && (
        <div style={styles.metricsRow}>
          <MetricCard
            label="ACTIVE FLOWS"
            value={String(activeCount)}
            barColor="var(--lcars-orange)"
          />
          <MetricCard
            label="AVG DAYS TO COMPLETE"
            value={avgDays.toFixed(0)}
            barColor="var(--lcars-cyan)"
          />
          <MetricCard
            label="TASK COMPLETION"
            value={`${templateCompliance.toFixed(0)}%`}
            barColor="var(--lcars-green)"
          />
          <MetricCard
            label="STALLED FLOWS"
            value={String(stalledFlows)}
            barColor="var(--lcars-lavender)"
          />
        </div>
      )}

      {/* Onboarding flow cards */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>ONBOARDING FLOWS</h2>
        <div style={styles.sectionDivider} />
        {loadError ? (
          <p style={styles.emptyText}>{loadError}</p>
        ) : visibleFlows.length === 0 ? (
          <p style={styles.emptyText}>
            {tab === "client"
              ? "NO CLIENT ONBOARDING FLOWS YET."
              : tab === "employee"
                ? "NO EMPLOYEE ONBOARDING FLOWS YET."
                : "NO ONBOARDING FLOWS MATCH THESE FILTERS."}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {visibleFlows.map((flow) => (
              <OnboardingCard key={flow.id} flow={flow} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageTitle: lcarsPageStyles.pageTitle,
  pageTitleBar: lcarsPageStyles.pageTitleBar,
  tabRow: {
    display: "flex",
    gap: 10,
    marginBottom: 16,
  },
  statusFilterRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap" as const,
    marginBottom: 20,
  },
  tabButton: {
    background: "rgba(153, 153, 204, 0.08)",
    border: "1px solid rgba(153, 153, 204, 0.22)",
    color: "var(--lcars-lavender)",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    letterSpacing: "1px",
    padding: "8px 12px",
    cursor: "pointer",
  },
  tabButtonActive: {
    borderColor: "var(--lcars-orange)",
    color: "var(--lcars-orange)",
    boxShadow: "0 0 10px rgba(255, 153, 0, 0.14)",
  },
  statusFilterButton: {
    ...lcarsPageStyles.ghostButton,
    padding: "6px 12px",
    fontSize: 10,
    color: "var(--lcars-lavender)",
    border: "1px solid rgba(153, 153, 204, 0.22)",
  },
  statusFilterButtonActive: {
    borderColor: "var(--lcars-cyan)",
    color: "var(--lcars-cyan)",
    background: "rgba(0, 204, 255, 0.08)",
    boxShadow: "0 0 10px rgba(0, 204, 255, 0.14)",
  },
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
  infoBanner: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    background: "rgba(0, 204, 255, 0.05)",
    border: "1px solid rgba(0, 204, 255, 0.14)",
    borderLeft: "6px solid var(--lcars-cyan)",
    borderRadius: "0 18px 18px 0",
    padding: "12px 16px",
    marginBottom: 20,
  },
  infoBannerIcon: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 14,
    color: "var(--lcars-cyan)",
    lineHeight: 1,
    marginTop: 1,
  },
  infoBannerText: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    fontWeight: 500,
    color: "var(--lcars-cyan)",
    letterSpacing: "1px",
    lineHeight: 1.6,
    textTransform: "uppercase" as const,
  },
  sectionTitle: lcarsPageStyles.sectionTitle,
  sectionDivider: lcarsPageStyles.sectionDivider,
  emptyText: lcarsPageStyles.emptyText,
};

export default Onboarding;
