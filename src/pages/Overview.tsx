import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SkeletonCard } from "../components/ui/Skeleton";
import { useInvoke } from "../hooks/useInvoke";
import type {
  FounderActiveStreamView,
  FounderCommandCenterView,
  FounderNeedsReviewItemView,
  PaperclipUser,
  StandupReport,
  TeamforgeIntakeItemView,
  VaultPortfolioSurface,
} from "../lib/types";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";

const ACTIVE_WORK_NOTE = "00-meta/mocs/active-work.md";
const PORTFOLIO_REVIEW_NOTE = "20-operations/project-management/portfolio-source-of-truth-review.md";
const WHITE_LABELABLE_INVENTORY_NOTE = "00-meta/mocs/white-labelable-inventory.md";
const STALE_REVIEW_NOTE = "00-meta/mocs/stale-needs-review.md";
const RESEARCH_REGISTRY_NOTE = "30-research-hub/capture-registry.md";

function formatRatioPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatHours(value: number): string {
  return `${value.toFixed(1)}H`;
}

function formatDate(value: string | null): string {
  if (!value) return "NO RECENT SIGNAL";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function normalizeTokenLabel(value: string): string {
  return value.replace(/_/g, " ").toUpperCase();
}

function parseTagDraft(value: string): string[] {
  return value
    .split(/,|\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildRoute(pathname: string, params: Record<string, string | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && value.trim()) {
      search.set(key, value);
    }
  }
  const query = search.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function parseGitHubIssueReference(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  const repoRef = trimmed.match(/^(?<repo>[^#\s]+\/[^#\s]+)#(?<number>\d+)$/);
  if (repoRef?.groups?.repo && repoRef.groups.number) {
    return {
      repo: repoRef.groups.repo,
      number: Number(repoRef.groups.number),
      issueId: `${repoRef.groups.repo}#${repoRef.groups.number}`,
    };
  }
  const entityRef = trimmed.match(/^github:(?<repo>[^:]+\/[^:]+):issue:(?<number>\d+)$/);
  if (entityRef?.groups?.repo && entityRef.groups.number) {
    return {
      repo: entityRef.groups.repo,
      number: Number(entityRef.groups.number),
      issueId: `${entityRef.groups.repo}#${entityRef.groups.number}`,
    };
  }
  return null;
}

function railColor(signal: string): string {
  const normalized = signal.toLowerCase();
  if (
    normalized.includes("orphan") ||
    normalized.includes("stalled") ||
    normalized.includes("archived")
  ) {
    return "var(--lcars-red)";
  }
  if (
    normalized.includes("paused") ||
    normalized.includes("review") ||
    normalized.includes("triage")
  ) {
    return "var(--lcars-yellow)";
  }
  if (
    normalized.includes("completed") ||
    normalized.includes("active") ||
    normalized.includes("promoted")
  ) {
    return "var(--lcars-green)";
  }
  if (normalized.includes("white-labelable")) {
    return "var(--lcars-cyan)";
  }
  return "var(--lcars-lavender)";
}

function StatusPill({ label }: { label: string }) {
  const color = railColor(label);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px",
        border: `1px solid ${color}`,
        color,
        fontSize: 10,
        letterSpacing: "1px",
        fontFamily: "'Orbitron', sans-serif",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function MetricRail({
  label,
  value,
  subtext,
  color,
}: {
  label: string;
  value: string;
  subtext: string;
  color: string;
}) {
  return (
    <div style={{ ...styles.metricRail, borderLeftColor: color }}>
      <div style={{ ...styles.metricAccent, backgroundColor: color }} />
      <div style={styles.metricLabel}>{label}</div>
      <div style={{ ...styles.metricValue, color }}>{value}</div>
      <div style={styles.metricSubtext}>{subtext}</div>
    </div>
  );
}

function SectionFrame({
  title,
  subtitle,
  accent,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  accent: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section style={{ ...styles.sectionFrame, borderLeftColor: accent }}>
      <div style={styles.sectionHeader}>
        <div>
          <div style={styles.sectionTitle}>{title}</div>
          {subtitle ? <div style={styles.sectionSubtitle}>{subtitle}</div> : null}
        </div>
        <div style={styles.sectionHeaderRight}>
          {actions}
          <div style={{ ...styles.sectionHeaderBand, backgroundColor: accent }} />
        </div>
      </div>
      <div style={styles.sectionDivider} />
      {children}
    </section>
  );
}

function ActionButton({
  label,
  onClick,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...lcarsPageStyles.ghostButton,
        opacity: disabled ? 0.6 : 1,
        padding: "6px 12px",
        fontSize: 10,
        letterSpacing: "1px",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

function RowActionButton({
  label,
  onClick,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{ ...styles.rowActionButton, opacity: disabled ? 0.55 : 1 }}
    >
      {label}
    </button>
  );
}

function ActiveStreamRow({
  stream,
  onOpenIssues,
}: {
  stream: FounderActiveStreamView;
  onOpenIssues?: () => void;
}) {
  const progressColor =
    stream.openIssues > 0 ? "var(--lcars-orange)" : "var(--lcars-green)";
  return (
    <div style={styles.streamRow}>
      <div style={styles.streamHead}>
        <div>
          <div style={styles.streamTitle}>{stream.title.toUpperCase()}</div>
          <div style={styles.streamMeta}>
            {stream.source.toUpperCase()}
            {stream.repo ? ` · ${stream.repo}` : ""}
            {stream.milestone ? ` · ${stream.milestone}` : ""}
          </div>
        </div>
        <div style={styles.rowActionGroup}>
          {onOpenIssues ? (
            <RowActionButton label="OPEN ISSUES" onClick={onOpenIssues} />
          ) : null}
          <StatusPill label={stream.status} />
        </div>
      </div>
      <div style={styles.streamStats}>
        <span>{stream.openIssues} OPEN</span>
        <span>{formatHours(stream.totalHours)}</span>
        <span>{formatDate(stream.latestActivity)}</span>
      </div>
      <div style={styles.progressTrack}>
        <div
          style={{
            ...styles.progressFill,
            width: `${Math.max(6, Math.min(100, Math.round(stream.percentComplete * 100)))}%`,
            backgroundColor: progressColor,
          }}
        />
      </div>
      <div style={styles.streamAttention}>{stream.attention}</div>
    </div>
  );
}

function PortfolioSurfaceRow({
  surface,
  onOpenClient,
}: {
  surface: VaultPortfolioSurface;
  onOpenClient?: () => void;
}) {
  const label = surface.commercialReuse
    ? `${surface.status} · ${surface.commercialReuse}`
    : surface.status;
  return (
    <div style={styles.signalRow}>
      <div>
        <div style={styles.signalTitle}>{surface.title.toUpperCase()}</div>
        <div style={styles.signalMeta}>
          {surface.kind.toUpperCase()}
          {surface.clientName ? ` · ${surface.clientName.toUpperCase()}` : ""}
        </div>
        <div style={styles.pathText}>{surface.sourceRelativePath}</div>
      </div>
      <div style={styles.rowActionGroup}>
        {onOpenClient ? (
          <RowActionButton label="OPEN CLIENT" onClick={onOpenClient} />
        ) : null}
        <StatusPill label={label} />
      </div>
    </div>
  );
}

function NeedsReviewRow({
  item,
  actionLabel,
  onAction,
}: {
  item: FounderNeedsReviewItemView;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div style={styles.signalRow}>
      <div>
        <div style={styles.signalTitle}>{item.title.toUpperCase()}</div>
        <div style={styles.signalMeta}>{item.detail}</div>
        {item.sourceRelativePath ? (
          <div style={styles.pathText}>{item.sourceRelativePath}</div>
        ) : null}
      </div>
      <div style={styles.reviewMeta}>
        {actionLabel && onAction ? (
          <RowActionButton label={actionLabel} onClick={onAction} />
        ) : null}
        <StatusPill label={item.signal} />
        <span style={styles.categoryText}>{item.category.replace(/-/g, " ").toUpperCase()}</span>
      </div>
    </div>
  );
}

function IntakeQueueRow({
  item,
  actionLabel,
  onAction,
  actionDisabled = false,
  onOpenIssue,
}: {
  item: TeamforgeIntakeItemView;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  onOpenIssue?: () => void;
}) {
  const detailParts = [
    normalizeTokenLabel(item.source),
    normalizeTokenLabel(item.priority),
    item.sourceRef ? `SOURCE ${item.sourceRef}` : null,
    item.routingLabel ? `TARGET ${item.routingLabel.toUpperCase()}` : null,
    item.projectCode ? `PROJECT ${item.projectCode.toUpperCase()}` : null,
    item.downstreamSecondaryRef ? `PAPERCLIP ${item.downstreamSecondaryRef}` : null,
    item.routeAttemptCount > 0 ? `ATTEMPT ${item.routeAttemptCount}` : null,
  ].filter(Boolean);

  return (
    <div style={styles.signalRow}>
      <div>
        <div style={styles.signalTitle}>{item.title.toUpperCase()}</div>
        <div style={styles.signalMeta}>{detailParts.join(" · ")}</div>
        {item.percolationError ? (
          <div style={styles.warningText}>{item.percolationError}</div>
        ) : (
          <div style={styles.pathText}>
            UPDATED {formatDate(item.updatedAt)}
            {item.founderReviewRequired ? " · FOUNDER REVIEW PATH" : ""}
          </div>
        )}
      </div>
      <div style={styles.reviewMeta}>
        {onOpenIssue ? <RowActionButton label="OPEN ISSUE" onClick={onOpenIssue} /> : null}
        {actionLabel && onAction ? (
          <RowActionButton label={actionLabel} onClick={onAction} disabled={actionDisabled} />
        ) : null}
        <StatusPill label={item.percolationStatus} />
      </div>
    </div>
  );
}

function Overview() {
  const api = useInvoke();
  const navigate = useNavigate();
  const [commandCenter, setCommandCenter] = useState<FounderCommandCenterView | null>(null);
  const [paperclipUsers, setPaperclipUsers] = useState<PaperclipUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [intakeMessage, setIntakeMessage] = useState<string | null>(null);
  const [intakeSubmitting, setIntakeSubmitting] = useState(false);
  const [routingItemId, setRoutingItemId] = useState<string | null>(null);
  const [intakeDraft, setIntakeDraft] = useState({
    title: "",
    body: "",
    priority: "medium",
    targetAgent: "",
    targetDepartment: "",
    targetQueue: "",
    projectCode: "",
    tags: "",
    founderReviewRequired: false,
  });
  const [openingVaultPath, setOpeningVaultPath] = useState<string | null>(null);
  const [paperclipRetryCount, setPaperclipRetryCount] = useState(0);
  const [standup, setStandup] = useState<StandupReport | null>(null);
  const [dashboardRole, setDashboardRole] = useState<"executive" | "pm" | "developer">("executive");

  const load = useCallback(async () => {
    try {
      const view = await api.getFounderCommandCenter();
      setCommandCenter(view);
      setLoadError(null);
      setActionMessage(null);
      if (view.paperclipRuntime || !view.paperclipError) {
        setPaperclipRetryCount(0);
      }
    } catch (error) {
      setLoadError(String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  const openVaultPath = useCallback(async (relativePath: string) => {
    setOpeningVaultPath(relativePath);
    setActionMessage(null);
    try {
      await api.openVaultRelativePath(relativePath);
    } catch (error) {
      setActionMessage(`VAULT OPEN FAILED: ${String(error).toUpperCase()}`);
    } finally {
      setOpeningVaultPath(null);
    }
  }, [api]);

  const navigateTo = useCallback(
    (pathname: string, params: Record<string, string | null | undefined> = {}) => {
      navigate(buildRoute(pathname, params));
    },
    [navigate],
  );

  const openLinkedIssue = useCallback(
    (item: TeamforgeIntakeItemView) => {
      const parsed =
        parseGitHubIssueReference(item.sourceRef) ??
        parseGitHubIssueReference(item.downstreamPrimaryRef) ??
        parseGitHubIssueReference(item.downstreamSecondaryRef);
      if (!parsed) return;
      navigateTo("/issues", { issue: parsed.issueId });
    },
    [navigateTo],
  );

  const openClientDrillDown = useCallback(
    (clientReference?: string | null, params: Record<string, string | null | undefined> = {}) => {
      navigateTo("/clients", {
        ...params,
        client: clientReference ?? undefined,
      });
    },
    [navigateTo],
  );

  const openOnboardingDrillDown = useCallback(
    (params: Record<string, string | null | undefined> = {}) => {
      navigateTo("/onboarding", params);
    },
    [navigateTo],
  );

  const openNeedsReviewAction = useCallback(
    (item: FounderNeedsReviewItemView) => {
      if (item.category === "orphaned-identity") {
        openClientDrillDown(undefined, { registry: "operational" });
        return;
      }

      if (item.category === "onboarding-risk") {
        const audienceToken = item.title.split("·").pop()?.trim().toLowerCase();
        const audience =
          audienceToken === "client" || audienceToken === "employee"
            ? audienceToken
            : undefined;
        const flowId = item.id.startsWith("onboarding:")
          ? item.id.replace(/^onboarding:/, "")
          : undefined;
        openOnboardingDrillDown({
          status: "at-risk",
          audience,
          flow: flowId,
        });
        return;
      }

      if (item.sourceRelativePath) {
        void openVaultPath(item.sourceRelativePath);
      }
    },
    [openClientDrillDown, openOnboardingDrillDown, openVaultPath],
  );

  const needsReviewActionLabel = useCallback((item: FounderNeedsReviewItemView) => {
    switch (item.category) {
      case "orphaned-identity":
        return "OPEN CLIENTS";
      case "onboarding-risk":
        return "OPEN ONBOARDING";
      case "stale-note":
        return "OPEN NOTE";
      default:
        return undefined;
    }
  }, []);

  const submitIntake = useCallback(async () => {
    setIntakeSubmitting(true);
    setIntakeMessage(null);
    try {
      const result = await api.createTeamforgeIntakeItem({
        title: intakeDraft.title,
        body: intakeDraft.body,
        source: "teamforge_manual",
        sourceRef: null,
        status: null,
        priority: intakeDraft.priority,
        tags: parseTagDraft(intakeDraft.tags),
        createdBy: "ceo",
        routing: {
          targetAgent: intakeDraft.targetAgent || null,
          targetDepartment: intakeDraft.targetDepartment || null,
          targetQueue: intakeDraft.targetQueue || null,
          projectCode: intakeDraft.projectCode || null,
          projectId: null,
          clientId: null,
          founderReviewRequired: intakeDraft.founderReviewRequired,
        },
      });
      setIntakeMessage(result.message);
      setIntakeDraft({
        title: "",
        body: "",
        priority: "medium",
        targetAgent: "",
        targetDepartment: "",
        targetQueue: "",
        projectCode: "",
        tags: "",
        founderReviewRequired: false,
      });
      await load();
    } catch (error) {
      setIntakeMessage(`INTAKE SAVE FAILED: ${String(error)}`);
    } finally {
      setIntakeSubmitting(false);
    }
  }, [intakeDraft, load]);

  const routeIntakeItem = useCallback(async (itemId: string) => {
    setRoutingItemId(itemId);
    setIntakeMessage(null);
    try {
      const result = await api.routeTeamforgeIntakeItem(itemId);
      setIntakeMessage(result.message);
      await load();
    } catch (error) {
      setIntakeMessage(`INTAKE ROUTE FAILED: ${String(error)}`);
    } finally {
      setRoutingItemId(null);
    }
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    const fetchPaperclipUsers = async () => {
      try {
        const users = await api.getPaperclipUsers();
        if (!cancelled) {
          setPaperclipUsers(users);
        }
      } catch {
        if (!cancelled) {
          setPaperclipUsers([]);
        }
      }
    };
    void fetchPaperclipUsers();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch standup report
  useEffect(() => {
    let cancelled = false;
    const fetchStandup = async () => {
      try {
        const report = await api.getStandupReport();
        if (!cancelled) setStandup(report);
      } catch {
        // Standup view is best-effort on Overview
      }
    };
    fetchStandup();
    const interval = setInterval(fetchStandup, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      void load();
    }, 30000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (loading || !commandCenter || commandCenter.paperclipRuntime || !commandCenter.paperclipError) {
      return;
    }

    const retryablePaperclipError = /error sending request|connection refused|tcp connect|os error|timed out/i.test(
      commandCenter.paperclipError,
    );

    if (!retryablePaperclipError || paperclipRetryCount >= 4) {
      return;
    }

    const timer = setTimeout(() => {
      setPaperclipRetryCount((current) => current + 1);
      void load();
    }, 2500);

    return () => clearTimeout(timer);
  }, [commandCenter, load, loading, paperclipRetryCount]);

  if (loading) {
    return (
      <div>
        <h1 style={styles.pageTitle}>OVERVIEW</h1>
        <div style={styles.pageTitleBar} />
        <div style={styles.metricGrid}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div style={styles.mainGrid}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (!commandCenter) {
    return (
      <div>
        <h1 style={styles.pageTitle}>OVERVIEW</h1>
        <div style={styles.pageTitleBar} />
        <div style={styles.errorFrame}>
          OVERVIEW UNAVAILABLE.
          {loadError ? ` ${loadError.toUpperCase()}` : ""}
        </div>
      </div>
    );
  }

  const {
    summary,
    activeStreams,
    portfolio,
    whiteLabelable,
    needsReview,
    researchHub,
    intakeConsole,
    paperclipRuntime,
    paperclipError,
    vaultError,
  } =
    commandCenter;

  return (
    <div>
      <h1 style={styles.pageTitle}>OVERVIEW</h1>
      <div style={styles.pageTitleBar} />

      {/* Role-Based Dashboard Selector (#12) */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["executive", "pm", "developer"] as const).map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => setDashboardRole(role)}
            style={{
              padding: "5px 12px",
              fontSize: 9,
              letterSpacing: "1px",
              fontFamily: "'Orbitron', sans-serif",
              color: dashboardRole === role ? "var(--lcars-orange)" : "var(--lcars-lavender)",
              background: dashboardRole === role ? "rgba(255,153,0,0.1)" : "transparent",
              border: `1px solid ${dashboardRole === role ? "var(--lcars-orange)" : "rgba(153,153,204,0.25)"}`,
              borderRadius: 4,
              cursor: "pointer",
              textTransform: "uppercase" as const,
            }}
          >
            {role === "executive" ? "EXECUTIVE" : role === "pm" ? "PM" : "DEVELOPER"}
          </button>
        ))}
      </div>

      <div style={styles.metricGrid}>
        <MetricRail
          label="ACTIVE DELIVERY"
          value={String(summary.activeDeliveryStreams)}
          subtext={`${summary.canonicalClients} LINKED CLIENTS · ${summary.atRiskClients} AT RISK`}
          color="var(--lcars-orange)"
        />
        <MetricRail
          label="NEEDS REVIEW"
          value={String(summary.unresolvedReviewItems)}
          subtext={`${needsReview.orphanedIdentityCount} ORPHANED · ${summary.onboardingAtRisk} ONBOARDING RISK`}
          color="var(--lcars-red)"
        />
        <MetricRail
          label="PORTFOLIO STATE"
          value={`${portfolio.activeCount}/${portfolio.totalSurfaces}`}
          subtext={`${portfolio.whiteLabelableCount} WHITE-LABELABLE · ${portfolio.archivedCount} ARCHIVED`}
          color="var(--lcars-cyan)"
        />
        <MetricRail
          label="UTILIZATION"
          value={formatRatioPercent(summary.utilizationRate)}
          subtext={`${formatHours(summary.teamHoursThisMonth)} OF ${formatHours(summary.teamQuota)} · ${summary.activeCount}/${summary.totalCount} ACTIVE`}
          color="var(--lcars-green)"
        />
      </div>

      <SectionFrame
        title="FOUNDER INTAKE CONSOLE"
        subtitle="CREATE, HOLD, ROUTE, AND RECOVER WORK FROM ONE SURFACE"
        accent="var(--lcars-peach, var(--lcars-orange))"
        actions={
          <div style={styles.actionGroup}>
            <ActionButton label="OPEN INBOX" onClick={() => navigate("/inbox")} />
            <ActionButton label="OPEN AGENTS" onClick={() => navigate("/agents")} />
            <ActionButton label="OPEN SETTINGS" onClick={() => navigate("/settings")} />
          </div>
        }
      >
        <div style={styles.commandBand}>
          <div style={styles.commandCell}>
            <div style={styles.commandLabel}>AWAITING TRIAGE</div>
            <div style={{ ...styles.commandValue, color: "var(--lcars-yellow)" }}>
              {intakeConsole.summary.awaitingTriageCount}
            </div>
          </div>
          <div style={styles.commandCell}>
            <div style={styles.commandLabel}>PENDING ROUTE</div>
            <div style={{ ...styles.commandValue, color: "var(--lcars-orange)" }}>
              {intakeConsole.summary.pendingRouteCount}
            </div>
          </div>
          <div style={styles.commandCell}>
            <div style={styles.commandLabel}>ROUTING FAILURES</div>
            <div style={{ ...styles.commandValue, color: "var(--lcars-red)" }}>
              {intakeConsole.summary.routeFailedCount}
            </div>
          </div>
          <div style={styles.commandCell}>
            <div style={styles.commandLabel}>PERCOLATED</div>
            <div style={{ ...styles.commandValue, color: "var(--lcars-green)" }}>
              {intakeConsole.summary.percolatedCount}
            </div>
          </div>
        </div>
        <div style={styles.commandNarrative}>
          TeamForge writes one canonical intake row first, then either holds it in founder triage
          or routes it into Paperclip and records the percolation result here.
        </div>
        {intakeConsole.error ? <div style={styles.warningText}>{intakeConsole.error}</div> : null}
        {intakeMessage ? <div style={styles.warningText}>{intakeMessage}</div> : null}
        <div style={styles.intakeComposerGrid}>
          <div style={{ ...styles.inputGroup, gridColumn: "1 / -1" }}>
            <label style={styles.inputLabel}>ISSUE TITLE</label>
            <input
              value={intakeDraft.title}
              onChange={(event) =>
                setIntakeDraft((current) => ({ ...current, title: event.target.value }))
              }
              style={styles.input}
              placeholder="HARPOON ACTION QUEUE OVERFLOW"
            />
          </div>
          <div style={{ ...styles.inputGroup, gridColumn: "1 / -1" }}>
            <label style={styles.inputLabel}>INTAKE BODY</label>
            <textarea
              value={intakeDraft.body}
              onChange={(event) =>
                setIntakeDraft((current) => ({ ...current, body: event.target.value }))
              }
              style={styles.textarea}
              rows={5}
              placeholder="Describe the signal, the origin, and the handoff you want to happen."
            />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.inputLabel}>PRIORITY</label>
            <select
              value={intakeDraft.priority}
              onChange={(event) =>
                setIntakeDraft((current) => ({ ...current, priority: event.target.value }))
              }
              style={styles.select}
            >
              <option value="critical">CRITICAL</option>
              <option value="high">HIGH</option>
              <option value="medium">MEDIUM</option>
              <option value="low">LOW</option>
            </select>
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.inputLabel}>TARGET AGENT</label>
            <select
              value={intakeDraft.targetAgent}
              onChange={(event) =>
                setIntakeDraft((current) => ({ ...current, targetAgent: event.target.value }))
              }
              style={styles.select}
            >
              <option value="">AUTO / NONE</option>
              {paperclipUsers.map((user) => (
                <option key={user.userId} value={user.userId}>
                  {user.userName.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.inputLabel}>TARGET DEPARTMENT</label>
            <input
              value={intakeDraft.targetDepartment}
              onChange={(event) =>
                setIntakeDraft((current) => ({ ...current, targetDepartment: event.target.value }))
              }
              style={styles.input}
              placeholder="OPS / PRODUCT / DELIVERY"
            />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.inputLabel}>PROJECT CODE</label>
            <input
              value={intakeDraft.projectCode}
              onChange={(event) =>
                setIntakeDraft((current) => ({ ...current, projectCode: event.target.value }))
              }
              style={styles.input}
              placeholder="THO-51"
            />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.inputLabel}>TARGET QUEUE</label>
            <input
              value={intakeDraft.targetQueue}
              onChange={(event) =>
                setIntakeDraft((current) => ({ ...current, targetQueue: event.target.value }))
              }
              style={styles.input}
              placeholder="FOUNDER / ONBOARDING / APPROVALS"
            />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.inputLabel}>TAGS</label>
            <input
              value={intakeDraft.tags}
              onChange={(event) =>
                setIntakeDraft((current) => ({ ...current, tags: event.target.value }))
              }
              style={styles.input}
              placeholder="overflow, onboarding, packetless"
            />
          </div>
        </div>
        <label style={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={intakeDraft.founderReviewRequired}
            onChange={(event) =>
              setIntakeDraft((current) => ({
                ...current,
                founderReviewRequired: event.target.checked,
              }))
            }
          />
          <span>HOLD IN FOUNDER TRIAGE BEFORE ROUTING</span>
        </label>
        <div style={styles.actionGroup}>
          <ActionButton
            label={intakeDraft.founderReviewRequired ? "SAVE TO TRIAGE" : "ROUTE TO PAPERCLIP"}
            onClick={() => void submitIntake()}
            disabled={intakeSubmitting}
          />
        </div>
        {intakeConsole.sections.length === 0 ? (
          <p style={styles.emptyText}>NO TEAMFORGE INTAKE ITEMS YET.</p>
        ) : (
          <div style={styles.intakeSectionGrid}>
            {intakeConsole.sections.map((section) => (
              <div key={section.key} style={styles.intakeSectionCard}>
                <div style={styles.intakeSectionHeader}>
                  <div style={styles.sectionTitle}>{section.label}</div>
                  <StatusPill label={`${section.count}`} />
                </div>
                <div style={styles.columnList}>
                  {section.items.map((item) => (
                    <IntakeQueueRow
                      key={item.id}
                      item={item}
                      onOpenIssue={
                        parseGitHubIssueReference(item.sourceRef) ||
                        parseGitHubIssueReference(item.downstreamPrimaryRef) ||
                        parseGitHubIssueReference(item.downstreamSecondaryRef)
                          ? () => openLinkedIssue(item)
                          : undefined
                      }
                      actionLabel={
                        item.percolationStatus === "awaiting_triage"
                          ? "ROUTE NOW"
                          : item.percolationStatus === "route_failed" ||
                              item.percolationStatus === "pending_route"
                            ? "RETRY"
                            : undefined
                      }
                      actionDisabled={routingItemId === item.id}
                      onAction={() => void routeIntakeItem(item.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionFrame>

      <div style={styles.heroGrid}>
        <SectionFrame
          title="MISSION SNAPSHOT"
          subtitle="LIVE OPERATIONS VIEW"
          accent="var(--lcars-orange)"
          actions={
            <div style={styles.actionGroup}>
              <ActionButton label="OPEN PROJECTS" onClick={() => navigate("/projects")} />
              <ActionButton
                label="OPEN ACTIVE WORK NOTE"
                onClick={() => void openVaultPath(ACTIVE_WORK_NOTE)}
                disabled={openingVaultPath === ACTIVE_WORK_NOTE}
              />
            </div>
          }
        >
          <div style={styles.commandBand}>
            <div style={styles.commandCell}>
              <div style={styles.commandLabel}>OPERATIONAL ONLY CLIENTS</div>
              <div style={styles.commandValue}>{summary.operationalOnlyClients}</div>
            </div>
            <div style={styles.commandCell}>
              <div style={styles.commandLabel}>RESEARCH NEEDS TRIAGE</div>
              <div style={styles.commandValue}>{summary.researchNeedsTriage}</div>
            </div>
            <div style={styles.commandCell}>
              <div style={styles.commandLabel}>WHITE-LABELABLE</div>
              <div style={styles.commandValue}>{summary.whiteLabelableCount}</div>
            </div>
            <div style={styles.commandCell}>
              <div style={styles.commandLabel}>PORTFOLIO MIX</div>
              <div style={styles.commandValue}>
                {portfolio.productCount}P / {portfolio.clientDeliveryCount}C
              </div>
            </div>
          </div>
          <div style={styles.commandNarrative}>
            {summary.atRiskClients > 0
              ? `⚠ ${summary.atRiskClients} CLIENT${summary.atRiskClients > 1 ? "S" : ""} AT RISK — REVIEW DELIVERY STATUS`
              : `ALL ${summary.canonicalClients} DELIVERY STREAMS HEALTHY`}
          </div>
          {vaultError ? (
            <div style={styles.warningText}>
              VAULT CONNECTION ISSUE — CHECK DESKTOP WORKSPACE IN SETTINGS
            </div>
          ) : null}
          {actionMessage ? <div style={styles.warningText}>{actionMessage}</div> : null}
        </SectionFrame>

        <SectionFrame
          title="PORTFOLIO LIFECYCLE"
          subtitle="PROJECT STATUS"
          accent="var(--lcars-cyan)"
          actions={
            <div style={styles.actionGroup}>
              <ActionButton
                label="OPEN CLIENTS"
                onClick={() => openClientDrillDown(undefined, { registry: "canonical" })}
              />
              <ActionButton
                label="OPEN PORTFOLIO REVIEW"
                onClick={() => void openVaultPath(PORTFOLIO_REVIEW_NOTE)}
                disabled={openingVaultPath === PORTFOLIO_REVIEW_NOTE}
              />
            </div>
          }
        >
          <div style={styles.lifecycleGrid}>
            <div style={styles.lifecycleTile}>
              <div style={styles.commandLabel}>ACTIVE</div>
              <div style={{ ...styles.lifecycleValue, color: "var(--lcars-green)" }}>
                {portfolio.activeCount}
              </div>
            </div>
            <div style={styles.lifecycleTile}>
              <div style={styles.commandLabel}>PAUSED</div>
              <div style={{ ...styles.lifecycleValue, color: "var(--lcars-yellow)" }}>
                {portfolio.pausedCount}
              </div>
            </div>
            <div style={styles.lifecycleTile}>
              <div style={styles.commandLabel}>COMPLETED</div>
              <div style={{ ...styles.lifecycleValue, color: "var(--lcars-cyan)" }}>
                {portfolio.completedCount}
              </div>
            </div>
            <div style={styles.lifecycleTile}>
              <div style={styles.commandLabel}>ARCHIVED</div>
              <div style={{ ...styles.lifecycleValue, color: "var(--lcars-lavender)" }}>
                {portfolio.archivedCount}
              </div>
            </div>
          </div>
          <div style={styles.lifecycleSubtext}>
            {portfolio.productCount} PRODUCTS · {portfolio.clientDeliveryCount} CLIENT DELIVERIES · {portfolio.whiteLabelableCount} REUSABLE
          </div>
        </SectionFrame>

        {dashboardRole !== "executive" && (
        <SectionFrame
          title="AGENT RUNTIME"
          subtitle="PAPERCLIP DAILY SIGNALS"
          accent="var(--lcars-lavender)"
          actions={
            <div style={styles.actionGroup}>
              <ActionButton label="OPEN AGENTS" onClick={() => navigate("/agents")} />
              <ActionButton label="OPEN SETTINGS" onClick={() => navigate("/settings")} />
            </div>
          }
        >
          {paperclipRuntime ? (
            <>
              <div style={styles.commandBand}>
                <div style={styles.commandCell}>
                  <div style={styles.commandLabel}>HEALTHY</div>
                  <div style={{ ...styles.commandValue, color: "var(--lcars-green)" }}>
                    {paperclipRuntime.healthyCount}
                  </div>
                </div>
                <div style={styles.commandCell}>
                  <div style={styles.commandLabel}>STALE</div>
                  <div style={{ ...styles.commandValue, color: "var(--lcars-yellow)" }}>
                    {paperclipRuntime.staleCount}
                  </div>
                </div>
                <div style={styles.commandCell}>
                  <div style={styles.commandLabel}>UNINITIALIZED</div>
                  <div style={{ ...styles.commandValue, color: "var(--lcars-red)" }}>
                    {paperclipRuntime.uninitializedCount}
                  </div>
                </div>
                <div style={styles.commandCell}>
                  <div style={styles.commandLabel}>ESCALATIONS</div>
                  <div style={{ ...styles.commandValue, color: "var(--lcars-cyan)" }}>
                    {paperclipRuntime.escalationBacklogCount}
                  </div>
                </div>
              </div>
              <div style={styles.commandNarrative}>
                {paperclipRuntime.latestActivityLabel
                  ? `LATEST CYCLE · ${paperclipRuntime.latestActivityLabel} · ${formatDate(
                      paperclipRuntime.latestActivityAt
                    )}`
                  : "LATEST CYCLE SIGNAL NOT AVAILABLE YET."}
              </div>
              <div style={styles.lifecycleSubtext}>
                {paperclipRuntime.latestEscalationTitle
                  ? `LATEST ESCALATION · ${paperclipRuntime.latestEscalationTitle.toUpperCase()} · ${formatDate(
                      paperclipRuntime.latestEscalationAt
                    )}`
                  : `${paperclipRuntime.activeTaskCount} LIVE TASKS ACROSS THE FOUNDER LENS.`}
              </div>
            </>
          ) : (
            <div style={styles.warningText}>
              {paperclipError
                ? "PAPERCLIP AGENT RUNTIME UNAVAILABLE — CHECK SETTINGS → DESKTOP WORKSPACE"
                : "PAPERCLIP RUNTIME IS NOT CONFIGURED ON THIS MACHINE."}
            </div>
          )}
        </SectionFrame>
        )}
      </div>

      <div style={styles.mainGrid}>
        <SectionFrame
          title="ACTIVE DELIVERY STREAMS"
          subtitle="LIVE PROJECT TRACKING"
          accent="var(--lcars-orange)"
          actions={
            <div style={styles.actionGroup}>
              <ActionButton label="OPEN PROJECTS" onClick={() => navigate("/projects")} />
              <ActionButton
                label="OPEN ISSUES"
                onClick={() => navigateTo("/issues", { state: "open" })}
              />
            </div>
          }
        >
          {activeStreams.length === 0 ? (
            <p style={styles.emptyText}>NO ACTIVE DELIVERY STREAMS YET.</p>
          ) : (
            <div style={styles.columnList}>
              {activeStreams.map((stream) => (
                <ActiveStreamRow
                  key={stream.id}
                  stream={stream}
                  onOpenIssues={() =>
                    navigateTo("/issues", {
                      project: stream.projectId ?? stream.id,
                      state: "open",
                    })
                  }
                />
              ))}
            </div>
          )}
        </SectionFrame>

        <SectionFrame
          title="WHITE-LABELABLE OPPORTUNITIES"
          subtitle="REUSABLE DELIVERY WORK"
          accent="var(--lcars-cyan)"
          actions={
            <div style={styles.actionGroup}>
              <ActionButton
                label="OPEN CLIENTS"
                onClick={() => openClientDrillDown(undefined, { registry: "canonical" })}
              />
              <ActionButton
                label="OPEN INVENTORY NOTE"
                onClick={() => void openVaultPath(WHITE_LABELABLE_INVENTORY_NOTE)}
                disabled={openingVaultPath === WHITE_LABELABLE_INVENTORY_NOTE}
              />
            </div>
          }
        >
          {whiteLabelable.length === 0 ? (
            <p style={styles.emptyText}>NO WHITE-LABELABLE SURFACES REGISTERED.</p>
          ) : (
            <div style={styles.columnList}>
              {whiteLabelable.slice(0, 6).map((surface) => (
                <PortfolioSurfaceRow
                  key={surface.id}
                  surface={surface}
                  onOpenClient={
                    surface.clientId || surface.clientName
                      ? () =>
                          openClientDrillDown(surface.clientId ?? surface.clientName, {
                            registry: "canonical",
                          })
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </SectionFrame>

        <SectionFrame
          title="NEEDS REVIEW"
          subtitle="STALE / ORPHANED / ONBOARDING RISK"
          accent="var(--lcars-red)"
          actions={
            <div style={styles.actionGroup}>
              <ActionButton
                label="OPEN UNLINKED CLIENTS"
                onClick={() => openClientDrillDown(undefined, { registry: "operational" })}
              />
              <ActionButton
                label="OPEN AT-RISK ONBOARDING"
                onClick={() => openOnboardingDrillDown({ status: "at-risk", audience: "all" })}
              />
              <ActionButton
                label="OPEN STALE REVIEW"
                onClick={() => void openVaultPath(STALE_REVIEW_NOTE)}
                disabled={openingVaultPath === STALE_REVIEW_NOTE}
              />
            </div>
          }
        >
          {needsReview.items.length === 0 ? (
            <p style={styles.emptyText}>NO REVIEW ITEMS RIGHT NOW.</p>
          ) : (
            <div style={styles.columnList}>
              {needsReview.items.slice(0, 8).map((item) => (
                <NeedsReviewRow
                  key={item.id}
                  item={item}
                  actionLabel={needsReviewActionLabel(item)}
                  onAction={() => openNeedsReviewAction(item)}
                />
              ))}
            </div>
          )}
        </SectionFrame>

        {dashboardRole === "developer" && (
        <SectionFrame
          title="RESEARCH INTAKE"
          subtitle="RESEARCH NOTES AND CAPTURES"
          accent="var(--lcars-lavender)"
          actions={
            <div style={styles.actionGroup}>
              <ActionButton
                label="OPEN REGISTRY"
                onClick={() => void openVaultPath(RESEARCH_REGISTRY_NOTE)}
                disabled={openingVaultPath === RESEARCH_REGISTRY_NOTE}
              />
              <ActionButton label="OPEN CLIENTS" onClick={() => navigate("/clients")} />
            </div>
          }
        >
          <div style={styles.lifecycleGrid}>
            <div style={styles.lifecycleTile}>
              <div style={styles.commandLabel}>CAPTURES</div>
              <div style={styles.lifecycleValue}>{researchHub.totalCaptures}</div>
            </div>
            <div style={styles.lifecycleTile}>
              <div style={styles.commandLabel}>RAW</div>
              <div style={styles.lifecycleValue}>{researchHub.rawCaptureCount}</div>
            </div>
            <div style={styles.lifecycleTile}>
              <div style={styles.commandLabel}>NEEDS TRIAGE</div>
              <div style={styles.lifecycleValue}>{researchHub.needsTriageCount}</div>
            </div>
            <div style={styles.lifecycleTile}>
              <div style={styles.commandLabel}>INBOX NOTES</div>
              <div style={styles.lifecycleValue}>{researchHub.inboxNoteCount}</div>
            </div>
          </div>
          <div style={styles.researchMeta}>
            <div>CAPTURES · {researchHub.totalCaptures} TOTAL</div>
            <div>LIVE RESEARCH LINES · {researchHub.liveResearchCount}</div>
          </div>
          {researchHub.captures.length === 0 ? (
            <div style={styles.warningText}>
              THE RESEARCH INBOX IS STILL EMPTY.
            </div>
          ) : (
            <div style={styles.columnList}>
              {researchHub.captures.slice(0, 4).map((capture) => (
                <div key={`${capture.source}-${capture.title}`} style={styles.signalRow}>
                  <div>
                    <div style={styles.signalTitle}>{capture.title.toUpperCase()}</div>
                    <div style={styles.signalMeta}>
                      {capture.source.toUpperCase()}
                      {capture.promotionTarget ? ` · ${capture.promotionTarget.toUpperCase()}` : ""}
                    </div>
                  </div>
                  <StatusPill label={capture.status} />
                </div>
              ))}
            </div>
          )}
        </SectionFrame>
        )}

        {/* Standup Digest Widget */}
        <SectionFrame
          title="STANDUP DIGEST"
          subtitle={standup ? `${standup.date} · ${standup.compliancePercent.toFixed(0)}% COMPLIANCE` : "TODAY"}
          accent="var(--lcars-peach, var(--lcars-orange))"
          actions={
            <div style={styles.actionGroup}>
              <ActionButton label="OPEN INSIGHTS" onClick={() => navigate("/insights")} />
            </div>
          }
        >
          {!standup ? (
            <p style={styles.emptyText}>STANDUP DATA LOADING...</p>
          ) : (
            <>
              <div style={styles.standupMetrics}>
                <div style={styles.standupMetric}>
                  <div style={styles.commandLabel}>POSTED</div>
                  <div style={{ ...styles.standupMetricValue, color: "var(--lcars-green)" }}>
                    {standup.postedCount}
                  </div>
                </div>
                <div style={styles.standupMetric}>
                  <div style={styles.commandLabel}>MISSING</div>
                  <div style={{
                    ...styles.standupMetricValue,
                    color: standup.missingCount > 0 ? "var(--lcars-red)" : "var(--lcars-green)",
                  }}>
                    {standup.missingCount}
                  </div>
                </div>
                <div style={styles.standupMetric}>
                  <div style={styles.commandLabel}>TEAM SIZE</div>
                  <div style={styles.standupMetricValue}>{standup.totalTeam}</div>
                </div>
                <div style={styles.standupMetric}>
                  <div style={styles.commandLabel}>COMPLIANCE</div>
                  <div style={{
                    ...styles.standupMetricValue,
                    color: standup.compliancePercent >= 80
                      ? "var(--lcars-green)"
                      : standup.compliancePercent >= 50
                        ? "var(--lcars-orange)"
                        : "var(--lcars-red)",
                  }}>
                    {standup.compliancePercent.toFixed(0)}%
                  </div>
                </div>
              </div>
              {standup.entries.length > 0 && (
                <div style={styles.standupEntries}>
                  {standup.entries.slice(0, 6).map((entry) => (
                    <div key={entry.employeeName} style={styles.standupRow}>
                      <span style={{
                        ...styles.standupDot,
                        backgroundColor: entry.status === "posted"
                          ? "var(--lcars-green)"
                          : "var(--lcars-red)",
                      }} />
                      <span style={styles.standupName}>{entry.employeeName.toUpperCase()}</span>
                      <span style={styles.standupSource}>{entry.source.toUpperCase()}</span>
                      {entry.contentPreview && (
                        <span style={styles.standupPreview}>
                          {entry.contentPreview.slice(0, 60)}
                          {entry.contentPreview.length > 60 ? "…" : ""}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </SectionFrame>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageTitle: lcarsPageStyles.pageTitle,
  pageTitleBar: lcarsPageStyles.pageTitleBar,
  metricGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
    marginBottom: 18,
  },
  metricRail: {
    position: "relative",
    background: "linear-gradient(180deg, rgba(23, 24, 44, 0.92), rgba(11, 12, 24, 0.96))",
    border: "1px solid rgba(153, 153, 204, 0.15)",
    borderLeft: "8px solid var(--lcars-orange)",
    borderRadius: "0 24px 0 0",
    padding: "18px 18px 16px",
    boxShadow: "0 18px 28px rgba(0, 0, 0, 0.2)",
  },
  metricAccent: {
    position: "absolute",
    top: 0,
    left: -8,
    width: 72,
    height: 5,
  },
  metricLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    color: "var(--lcars-lavender)",
    letterSpacing: "2px",
    textTransform: "uppercase",
  },
  metricValue: {
    marginTop: 8,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: "-0.5px",
  },
  metricSubtext: {
    marginTop: 8,
    color: "var(--lcars-tan)",
    fontSize: 11,
    lineHeight: 1.5,
  },
  heroGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 16,
    marginBottom: 16,
  },
  mainGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 16,
  },
  sectionFrame: {
    ...lcarsPageStyles.card,
    borderLeft: "8px solid var(--lcars-orange)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
  },
  sectionHeaderRight: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  sectionTitle: {
    ...lcarsPageStyles.sectionTitle,
    marginBottom: 2,
  },
  sectionSubtitle: {
    color: "var(--lcars-lavender)",
    fontSize: 11,
    letterSpacing: "1px",
    fontFamily: "'JetBrains Mono', monospace",
  },
  sectionHeaderBand: {
    width: 96,
    height: 12,
    borderRadius: "0 16px 0 0",
    flexShrink: 0,
    marginTop: 6,
  },
  actionGroup: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  intakeComposerGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  inputGroup: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  },
  inputLabel: {
    ...lcarsPageStyles.metricLabel,
    marginBottom: 0,
  },
  input: lcarsPageStyles.input,
  textarea: {
    ...lcarsPageStyles.input,
    minHeight: 120,
    resize: "vertical" as const,
    lineHeight: 1.6,
  },
  select: {
    ...lcarsPageStyles.input,
    appearance: "none" as const,
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    color: "var(--lcars-tan)",
    fontSize: 11,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: "1px",
  },
  intakeSectionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 12,
  },
  intakeSectionCard: {
    ...lcarsPageStyles.subtleCard,
    borderLeft: "6px solid rgba(255, 153, 0, 0.26)",
    display: "flex",
    flexDirection: "column" as const,
    gap: 12,
  },
  intakeSectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "center",
  },
  sectionDivider: lcarsPageStyles.sectionDivider,
  commandBand: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))",
    gap: 10,
  },
  commandCell: {
    padding: "12px 10px",
    background: "rgba(153, 153, 204, 0.04)",
    borderLeft: "3px solid rgba(255, 153, 0, 0.28)",
  },
  commandLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    color: "var(--lcars-lavender)",
    letterSpacing: "1.2px",
    textTransform: "uppercase",
  },
  commandValue: {
    marginTop: 8,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 20,
    color: "var(--lcars-orange)",
    fontWeight: 700,
  },
  commandNarrative: {
    color: "var(--lcars-tan)",
    fontSize: 12,
    lineHeight: 1.6,
    paddingTop: 4,
  },
  lifecycleGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(108px, 1fr))",
    gap: 10,
  },
  lifecycleTile: {
    padding: "12px 10px",
    background: "rgba(153, 153, 204, 0.04)",
    borderLeft: "3px solid rgba(153, 153, 204, 0.22)",
  },
  lifecycleValue: {
    marginTop: 8,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 22,
    color: "var(--lcars-orange)",
    fontWeight: 700,
  },
  lifecycleSubtext: {
    color: "var(--lcars-tan)",
    fontSize: 12,
    lineHeight: 1.6,
  },
  columnList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  streamRow: {
    padding: "12px 12px 10px",
    background: "rgba(153, 153, 204, 0.04)",
    borderLeft: "3px solid rgba(255, 153, 0, 0.35)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  streamHead: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
  },
  rowActionGroup: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  rowActionButton: {
    ...lcarsPageStyles.ghostButton,
    padding: "4px 10px",
    fontSize: 9,
    letterSpacing: "1px",
    color: "var(--lcars-cyan)",
    border: "1px solid rgba(0, 204, 255, 0.28)",
    whiteSpace: "nowrap",
  },
  streamTitle: {
    color: "var(--lcars-orange)",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.6px",
  },
  streamMeta: {
    marginTop: 4,
    color: "var(--lcars-lavender)",
    fontSize: 10,
    fontFamily: "'JetBrains Mono', monospace",
  },
  streamStats: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    color: "var(--lcars-tan)",
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
  },
  progressTrack: {
    width: "100%",
    height: 6,
    background: "rgba(153, 153, 204, 0.12)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
  },
  streamAttention: {
    color: "var(--lcars-cyan)",
    fontSize: 10,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: "1px",
  },
  signalRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    padding: "10px 12px",
    background: "rgba(153, 153, 204, 0.04)",
    borderLeft: "3px solid rgba(153, 153, 204, 0.24)",
  },
  signalTitle: {
    color: "var(--lcars-tan)",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.5px",
  },
  signalMeta: {
    marginTop: 4,
    color: "var(--lcars-lavender)",
    fontSize: 10,
    lineHeight: 1.5,
    fontFamily: "'JetBrains Mono', monospace",
  },
  reviewMeta: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    alignItems: "flex-end",
  },
  categoryText: {
    color: "var(--lcars-cyan)",
    fontSize: 9,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: "1px",
    textTransform: "uppercase",
    textAlign: "right",
  },
  pathText: {
    marginTop: 6,
    color: "var(--text-quaternary)",
    fontSize: 10,
    fontFamily: "'JetBrains Mono', monospace",
    lineHeight: 1.4,
    wordBreak: "break-word",
  },
  researchMeta: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    color: "var(--lcars-tan)",
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    lineHeight: 1.5,
  },
  warningText: {
    color: "var(--lcars-yellow)",
    fontSize: 11,
    lineHeight: 1.6,
    fontFamily: "'JetBrains Mono', monospace",
  },
  emptyText: lcarsPageStyles.emptyText,
  errorFrame: {
    ...lcarsPageStyles.card,
    borderLeft: "8px solid var(--lcars-red)",
    color: "var(--lcars-red)",
    fontFamily: "'JetBrains Mono', monospace",
  },
  standupMetrics: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 12,
    marginBottom: 14,
  },
  standupMetric: {
    textAlign: "center" as const,
  },
  standupMetricValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 22,
    fontWeight: 700,
    color: "var(--lcars-text, #f0e0c0)",
    marginTop: 4,
  },
  standupEntries: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  },
  standupRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "4px 0",
  },
  standupDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    flexShrink: 0,
  },
  standupName: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 11,
    letterSpacing: "0.5px",
    color: "var(--lcars-lavender)",
    minWidth: 100,
  },
  standupSource: {
    fontSize: 9,
    letterSpacing: "1px",
    color: "var(--lcars-tan)",
    minWidth: 50,
  },
  standupPreview: {
    fontSize: 11,
    color: "var(--lcars-text, #f0e0c0)",
    opacity: 0.7,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    flex: 1,
  },
};

export default Overview;
