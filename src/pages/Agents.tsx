import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import Avatar from "../components/ui/Avatar";
import { SkeletonCard } from "../components/ui/Skeleton";
import { useInvoke } from "../hooks/useInvoke";
import { formatDuration, timeAgo } from "../lib/format";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";
import type {
  PaperclipAgentDetailView,
  PaperclipApprovalQueueView,
  PaperclipEscalationInput,
  PaperclipFounderQueueView,
  PaperclipOrgNodeView,
  PaperclipOrgView,
  PaperclipRuntimeOperationResult,
  PaperclipRuntimeOverview,
  PaperclipTelemetryItem,
  PaperclipUser,
  PresenceStatus,
} from "../lib/types";

function formatDate(value: string | null): string {
  if (!value) return "NO RECENT SIGNAL";
  return timeAgo(value).toUpperCase();
}

function metricColor(status: string | null | undefined): string {
  switch ((status || "").toLowerCase()) {
    case "healthy":
    case "ok":
      return "var(--lcars-green)";
    case "degraded":
      return "var(--lcars-peach)";
    case "stale":
      return "var(--lcars-yellow)";
    case "uninitialized":
    case "failed":
      return "var(--lcars-red)";
    default:
      return "var(--lcars-lavender)";
  }
}

function buildIssuePath(projectId: string): string {
  return `/issues?project=${encodeURIComponent(projectId)}&state=open`;
}

function buildClientPath(clientId: string): string {
  return `/clients?client=${encodeURIComponent(clientId)}&registry=canonical`;
}

function approvalColor(state: string | null | undefined): string {
  switch ((state || "").toLowerCase()) {
    case "approved":
      return "var(--lcars-green)";
    case "blocked":
      return "var(--lcars-red)";
    case "deferred":
      return "var(--lcars-yellow)";
    default:
      return "var(--lcars-orange)";
  }
}

function SummaryRail({
  label,
  value,
  color,
  subtext,
}: {
  label: string;
  value: string;
  color: string;
  subtext: string;
}) {
  return (
    <div style={{ ...styles.summaryRail, borderLeftColor: color }}>
      <div style={styles.summaryLabel}>{label}</div>
      <div style={{ ...styles.summaryValue, color }}>{value}</div>
      <div style={styles.summarySubtext}>{subtext}</div>
    </div>
  );
}

function WarningFrame({
  title,
  body,
  onRetry,
}: {
  title: string;
  body: string;
  onRetry: () => void;
}) {
  const navigate = useNavigate();

  return (
    <div style={styles.warningBox}>
      <div style={styles.warningTitle}>{title}</div>
      <div style={styles.warningBody}>{body.toUpperCase()}</div>
      <div style={styles.actionRow}>
        <button type="button" onClick={() => navigate("/settings")} style={styles.ghostButton}>
          OPEN SETTINGS
        </button>
        <button type="button" onClick={onRetry} style={styles.ghostButton}>
          RETRY
        </button>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string | null | undefined }) {
  const color = metricColor(status);
  return (
    <span style={{ ...styles.statusPill, borderColor: color, color }}>
      {(status || "unknown").toUpperCase()}
    </span>
  );
}

function ApprovalStatePill({ state }: { state: string | null | undefined }) {
  const color = approvalColor(state);
  return (
    <span style={{ ...styles.statusPill, borderColor: color, color }}>
      {(state || "pending").toUpperCase()}
    </span>
  );
}

function RuntimeTelemetryRow({
  item,
  selected,
  onSelect,
  onOpenDetail,
}: {
  item: PaperclipTelemetryItem;
  selected: boolean;
  onSelect: () => void;
  onOpenDetail: () => void;
}) {
  const color = metricColor(item.status);
  const flags = [
    item.degraded ? "DEGRADED" : null,
    item.stale ? "STALE" : null,
    item.uninitialized ? "UNINITIALIZED" : null,
    item.missingFiles > 0 ? `${item.missingFiles} MISSING FILES` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        ...styles.listRowButton,
        borderLeftColor: color,
        background: selected ? "rgba(255, 153, 0, 0.1)" : "rgba(153, 153, 204, 0.04)",
      }}
    >
      <div style={styles.rowHeader}>
        <div>
          <div style={styles.rowTitle}>{item.userName.toUpperCase()}</div>
          <div style={styles.rowMeta}>
            {item.department?.toUpperCase() || "UNASSIGNED"}
            {item.role ? ` · ${item.role.toUpperCase()}` : ""}
          </div>
        </div>
        <StatusPill status={item.status} />
      </div>
      <div style={styles.rowMeta}>
        {(item.outcome || "NO OUTCOME").toUpperCase()} · {item.steps} STEPS · {item.blocked} BLOCKED
        {flags ? ` · ${flags}` : ""} · {formatDate(item.lastCycle)}
      </div>
      <div style={styles.rowActions}>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpenDetail();
          }}
          style={styles.inlineAction}
        >
          OPEN DETAIL
        </button>
      </div>
    </button>
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
    ? `TRACKING ${(data.clockifyProject ?? "UNKNOWN").toUpperCase()} · ${
        data.clockifyDuration != null ? formatDuration(data.clockifyDuration) : "--"
      }`
    : "NO ACTIVE TIMER";

  const hulyLine = data.hulyLastSeen
    ? `ACTIVE ${timeAgo(data.hulyLastSeen).toUpperCase()}`
    : "NO HULY SIGNAL";

  return (
    <div style={{ ...styles.presenceCard, borderLeftColor: borderColor }}>
      <div style={styles.presenceHeader}>
        <Avatar name={data.employeeName} size={32} />
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            backgroundColor: statusColor,
            flexShrink: 0,
          }}
        />
        <span style={styles.presenceName}>{data.employeeName.toUpperCase()}</span>
      </div>
      <div style={styles.rowMeta}>{clockifyLine}</div>
      <div style={styles.rowMeta}>{hulyLine}</div>
    </div>
  );
}

function AgentTaskList({ detail }: { detail: PaperclipAgentDetailView }) {
  const navigate = useNavigate();
  return (
    <>
      <div style={styles.subsectionTitle}>ACTIVE TASKS</div>
      {detail.personalContext.tasks.length === 0 ? (
        <div style={styles.emptyText}>NO TASKS FOR THIS AGENT.</div>
      ) : (
        <div style={styles.columnList}>
          {detail.personalContext.tasks.map((task) => (
            <div key={task.id} style={styles.signalRow}>
              <div>
                <div style={styles.rowTitle}>{task.title.toUpperCase()}</div>
                <div style={styles.rowMeta}>
                  {(task.status || "UNKNOWN").toUpperCase()}
                  {task.priority ? ` · ${task.priority.toUpperCase()}` : ""}
                  {task.projectCode ? ` · ${task.projectCode.toUpperCase()}` : ""}
                  {task.source ? ` · ${task.source.toUpperCase()}` : ""}
                </div>
                {(task.tags.length > 0 || task.sourceRef || task.updatedAt) ? (
                  <div style={styles.rowMeta}>
                    {task.tags.length > 0 ? `TAGS ${task.tags.map((tag) => tag.toUpperCase()).join(", ")}` : null}
                    {task.sourceRef ? `${task.tags.length > 0 ? " · " : ""}${task.sourceRef.toUpperCase()}` : null}
                    {task.updatedAt ? ` · ${formatDate(task.updatedAt)}` : null}
                  </div>
                ) : null}
              </div>
              <div style={styles.rowActions}>
                {task.projectId ? (
                  <button
                    type="button"
                    onClick={() => navigate(buildIssuePath(task.projectId!))}
                    style={styles.inlineAction}
                  >
                    OPEN ISSUES
                  </button>
                ) : null}
                {task.clientId ? (
                  <button
                    type="button"
                    onClick={() => navigate(buildClientPath(task.clientId!))}
                    style={styles.inlineAction}
                  >
                    OPEN CLIENT
                  </button>
                ) : null}
                <StatusPill status={task.status} />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function AgentRoomList({ detail }: { detail: PaperclipAgentDetailView }) {
  const navigate = useNavigate();
  return (
    <>
      <div style={styles.subsectionTitle}>ROOM TOPOLOGY</div>
      {detail.rooms.length === 0 ? (
        <div style={styles.emptyText}>NO ROOM DEFINITIONS FOR THIS AGENT.</div>
      ) : (
        <div style={styles.columnList}>
          {detail.rooms.map((room) => (
            <div key={room.id} style={styles.signalRow}>
              <div>
                <div style={styles.rowTitle}>{room.name.toUpperCase()}</div>
                <div style={styles.rowMeta}>
                  {room.roomType.toUpperCase()}
                  {room.projectCode ? ` · ${room.projectCode.toUpperCase()}` : ""}
                  {room.projectName ? ` · ${room.projectName.toUpperCase()}` : ""}
                </div>
                {room.description ? (
                  <div style={styles.rowMeta}>{room.description.toUpperCase()}</div>
                ) : null}
              </div>
              <div style={styles.rowActions}>
                {room.projectId ? (
                  <button
                    type="button"
                    onClick={() => navigate(buildIssuePath(room.projectId!))}
                    style={styles.inlineAction}
                  >
                    OPEN PROJECT
                  </button>
                ) : null}
                {room.clientId ? (
                  <button
                    type="button"
                    onClick={() => navigate(buildClientPath(room.clientId!))}
                    style={styles.inlineAction}
                  >
                    OPEN CLIENT
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function AgentDetailPanel({
  detail,
  loading,
  error,
  onOpenDedicated,
}: {
  detail: PaperclipAgentDetailView | null;
  loading: boolean;
  error: string | null;
  onOpenDedicated?: (() => void) | null;
}) {
  if (loading) {
    return <div style={styles.emptyText}>LOADING AGENT CONTEXT…</div>;
  }

  if (error) {
    return <div style={styles.warningBody}>{error.toUpperCase()}</div>;
  }

  if (!detail) {
    return <div style={styles.emptyText}>SELECT AN AGENT TO LOAD DETAILS.</div>;
  }

  const telemetry = detail.telemetry;
  return (
    <>
      <div style={styles.agentIdentityBand}>
        <div style={styles.agentIdentityCard}>
          <Avatar name={detail.user.userName} size={38} />
          <div style={{ minWidth: 0 }}>
            <div style={styles.agentIdentityTitle}>{detail.user.userName.toUpperCase()}</div>
            <div style={styles.rowMeta}>
              {detail.user.title?.toUpperCase() || "NO TITLE"}
              {detail.user.role ? ` · ${detail.user.role.toUpperCase()}` : ""}
              {detail.user.department ? ` · ${detail.user.department.toUpperCase()}` : ""}
            </div>
            {detail.user.reportsTo ? (
              <div style={styles.rowMeta}>REPORTS TO {detail.user.reportsTo.toUpperCase()}</div>
            ) : null}
          </div>
        </div>
        <div style={styles.rowActions}>
          <StatusPill status={telemetry?.status} />
          {onOpenDedicated ? (
            <button type="button" onClick={onOpenDedicated} style={styles.inlineAction}>
              OPEN PAGE
            </button>
          ) : null}
        </div>
      </div>

      <div style={styles.contextBand}>
        <div style={styles.contextCell}>
          <div style={styles.summaryLabel}>CURRENT KREBS</div>
          <div style={styles.contextValue}>
            {(detail.personalContext.currentKrebs || "UNASSIGNED").toUpperCase()}
          </div>
        </div>
        <div style={styles.contextCell}>
          <div style={styles.summaryLabel}>QUEUE MIX</div>
          <div style={styles.contextValue}>
            {detail.personalContext.summary.pending}P / {detail.personalContext.summary.inProgress}I /{" "}
            {detail.personalContext.summary.blocked}B
          </div>
        </div>
        <div style={styles.contextCell}>
          <div style={styles.summaryLabel}>LATEST HEARTBEAT</div>
          <div style={styles.contextValue}>
            {formatDate(detail.personalContext.latestHeartbeatAt)}
          </div>
        </div>
        <div style={styles.contextCell}>
          <div style={styles.summaryLabel}>PROJECT ROOMS</div>
          <div style={styles.contextValue}>{detail.projectRoomCount}</div>
        </div>
      </div>

      <AgentTaskList detail={detail} />
      <AgentRoomList detail={detail} />
    </>
  );
}

function PaperclipEscalationComposer({
  selectedUserId,
  onSubmitted,
}: {
  selectedUserId: string | null;
  onSubmitted?: (() => Promise<void> | void) | null;
}) {
  const api = useInvoke();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState("high");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = useCallback(async () => {
    if (!selectedUserId || !title.trim() || !body.trim()) {
      return;
    }

    const input: PaperclipEscalationInput = {
      title: title.trim(),
      body: body.trim(),
      severity,
      userId: selectedUserId,
    };

    setSending(true);
    setMessage(null);
    try {
      const response = await api.createPaperclipEscalation(input);
      setMessage(`Escalation sent (${response.issueKey})`);
      setTitle("");
      setBody("");
      await onSubmitted?.();
    } catch (error) {
      setMessage(`Error: ${String(error)}`);
    } finally {
      setSending(false);
    }
  }, [api, body, onSubmitted, selectedUserId, severity, title]);

  return (
    <>
      <div style={styles.field}>
        <label style={styles.fieldLabel}>ESCALATION TITLE</label>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Need founder review on runtime or delivery blocker"
          style={styles.input}
        />
      </div>
      <div style={styles.field}>
        <label style={styles.fieldLabel}>ESCALATION BODY</label>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="State the blocker, risk, and next action you need."
          rows={4}
          style={styles.textarea}
        />
      </div>
      <div style={styles.actionRow}>
        <select
          value={severity}
          onChange={(event) => setSeverity(event.target.value)}
          style={styles.select}
        >
          <option value="critical">CRITICAL</option>
          <option value="high">HIGH</option>
          <option value="medium">MEDIUM</option>
        </select>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={sending || !selectedUserId || !title.trim() || !body.trim()}
          style={{
            ...styles.primaryButton,
            opacity: sending || !selectedUserId || !title.trim() || !body.trim() ? 0.5 : 1,
          }}
        >
          {sending ? "SENDING..." : "SEND ESCALATION"}
        </button>
      </div>
      {message ? (
        <div
          style={{
            ...styles.warningBody,
            color: message.startsWith("Error") ? "var(--lcars-red)" : "var(--lcars-green)",
          }}
        >
          {message.toUpperCase()}
        </div>
      ) : null}
    </>
  );
}

function AgentsRuntimeRoute() {
  const api = useInvoke();
  const navigate = useNavigate();
  const [runtime, setRuntime] = useState<PaperclipRuntimeOverview | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<PaperclipRuntimeOperationResult["runtimeStatus"] | null>(null);
  const [telemetry, setTelemetry] = useState<PaperclipTelemetryItem[]>([]);
  const [users, setUsers] = useState<PaperclipUser[]>([]);
  const [presence, setPresence] = useState<PresenceStatus[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PaperclipAgentDetailView | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [operationRunning, setOperationRunning] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [operationResult, setOperationResult] = useState<PaperclipRuntimeOperationResult | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadPresence = useCallback(async () => {
    try {
      setPresence(await api.getPresenceStatus());
    } catch {
      setPresence([]);
    }
  }, [api]);

  const loadRuntime = useCallback(async () => {
    try {
      const [runtimeSummary, telemetryItems, roster, status] = await Promise.all([
        api.getPaperclipRuntimeSummary(),
        api.getPaperclipTelemetry(),
        api.getPaperclipUsers(),
        api.getPaperclipRuntimeStatus(),
      ]);

      setRuntime(runtimeSummary);
      setTelemetry(telemetryItems);
      setUsers(roster);
      setRuntimeStatus(status);
      setLastUpdated(new Date());
      setLoadError(null);
      setSelectedUserId((current) => {
        if (current && roster.some((user) => user.userId === current)) {
          return current;
        }
        return (
          runtimeSummary.focusUserId ??
          roster.find((user) => user.userId === "ceo")?.userId ??
          roster[0]?.userId ??
          null
        );
      });
    } catch (error) {
      setLoadError(String(error));
      setRuntime(null);
      setRuntimeStatus(null);
      setTelemetry([]);
      setUsers([]);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [api]);

  const loadDetail = useCallback(
    async (userId: string) => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        setDetail(await api.getPaperclipAgentDetail(userId));
      } catch (error) {
        setDetail(null);
        setDetailError(String(error));
      } finally {
        setDetailLoading(false);
      }
    },
    [api],
  );

  const runRuntimeOperation = useCallback(
    async (
      operation: "warm-start" | "refresh-stale" | "maintain-heartbeat",
      label: string
    ) => {
      setOperationRunning(label);
      setOperationError(null);
      try {
        const result =
          operation === "warm-start"
            ? await api.runPaperclipWarmStart()
            : operation === "refresh-stale"
              ? await api.runPaperclipRefreshStale()
              : await api.runPaperclipMaintainHeartbeat();
        setOperationResult(result);
        await Promise.all([
          loadRuntime(),
          loadPresence(),
          selectedUserId ? loadDetail(selectedUserId) : Promise.resolve(),
        ]);
      } catch (error) {
        setOperationError(String(error));
      } finally {
        setOperationRunning(null);
      }
    },
    [api, loadDetail, loadPresence, loadRuntime, selectedUserId]
  );

  useEffect(() => {
    void loadPresence();
    void loadRuntime();
    intervalRef.current = setInterval(() => {
      void loadPresence();
      void loadRuntime();
    }, 30000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [loadPresence, loadRuntime]);

  useEffect(() => {
    if (!selectedUserId) return;
    void loadDetail(selectedUserId);
  }, [loadDetail, selectedUserId]);

  if (loading) {
    return (
      <>
        <div style={styles.summaryGrid}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div style={styles.mainGrid}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </>
    );
  }

  return (
    <>
      <div style={styles.headerMeta}>
        {lastUpdated ? `UPDATED ${formatDate(lastUpdated.toISOString())}` : "NO REFRESH YET"}
      </div>

      <div style={styles.summaryGrid}>
        <SummaryRail
          label="HEALTHY"
          value={String(runtime?.healthyCount ?? 0)}
          color="var(--lcars-green)"
          subtext={`${runtime?.totalAgents ?? 0} TOTAL AGENTS`}
        />
        <SummaryRail
          label="STALE"
          value={String(runtime?.staleCount ?? 0)}
          color="var(--lcars-yellow)"
          subtext={runtime?.latestActivityLabel || "NO RECENT CYCLE"}
        />
        <SummaryRail
          label="UNINITIALIZED"
          value={String(runtime?.uninitializedCount ?? 0)}
          color="var(--lcars-red)"
          subtext={runtime?.latestEscalationTitle || "NO OPEN ESCALATION"}
        />
        <SummaryRail
          label="FOUNDER QUEUE"
          value={String(runtime?.activeTaskCount ?? 0)}
          color="var(--lcars-cyan)"
          subtext={`${runtime?.escalationBacklogCount ?? 0} ESCALATIONS`}
        />
      </div>

      {loadError ? (
        <WarningFrame
          title="PAPERCLIP RUNTIME UNAVAILABLE"
          body={loadError}
          onRetry={() => void loadRuntime()}
        />
      ) : null}

      <section style={styles.sectionCard}>
        <div style={styles.sectionHeader}>
          <div>
            <div style={styles.sectionTitle}>RUNTIME OPS</div>
            <div style={styles.sectionSubtitle}>MAINTAIN THE PAPERCLIP ORG WITHOUT LEAVING TEAMFORGE</div>
          </div>
          <button type="button" onClick={() => void loadRuntime()} style={styles.ghostButton}>
            REFRESH STATUS
          </button>
        </div>
        <div style={styles.sectionDivider} />
        <div style={styles.opsGrid}>
          <button
            type="button"
            onClick={() => void runRuntimeOperation("warm-start", "WARM START")}
            disabled={operationRunning !== null}
            style={styles.primaryButton}
          >
            {operationRunning === "WARM START" ? "RUNNING..." : "WARM START"}
          </button>
          <button
            type="button"
            onClick={() => void runRuntimeOperation("refresh-stale", "REFRESH STALE")}
            disabled={operationRunning !== null}
            style={styles.primaryButton}
          >
            {operationRunning === "REFRESH STALE" ? "RUNNING..." : "REFRESH STALE"}
          </button>
          <button
            type="button"
            onClick={() => void runRuntimeOperation("maintain-heartbeat", "MAINTAIN HEARTBEAT")}
            disabled={operationRunning !== null}
            style={styles.primaryButton}
          >
            {operationRunning === "MAINTAIN HEARTBEAT" ? "RUNNING..." : "MAINTAIN HEARTBEAT"}
          </button>
        </div>
        <div style={styles.rowMeta}>
          {runtimeStatus
            ? `${runtimeStatus.summary.healthy} HEALTHY · ${runtimeStatus.summary.stale} STALE · ${runtimeStatus.summary.uninitialized} UNINITIALIZED · ${runtimeStatus.summary.degraded} DEGRADED`
            : "NO RUNTIME STATUS LOADED."}
        </div>
        {operationError ? (
          <div style={{ ...styles.warningBody, color: "var(--lcars-red)" }}>
            {operationError.toUpperCase()}
          </div>
        ) : null}
        {operationResult ? (
          <div style={styles.signalRow}>
            <div>
              <div style={styles.rowTitle}>{operationResult.operation.toUpperCase()}</div>
              <div style={styles.rowMeta}>
                {operationResult.message.toUpperCase()}
                {operationResult.finalSummary
                  ? ` · ${operationResult.finalSummary.healthy} HEALTHY / ${operationResult.finalSummary.stale} STALE / ${operationResult.finalSummary.uninitialized} UNINITIALIZED`
                  : ""}
              </div>
              {operationResult.refreshedAgents.length > 0 ? (
                <div style={styles.rowMeta}>
                  TARGETS {operationResult.refreshedAgents.map((agent) => agent.toUpperCase()).join(", ")}
                </div>
              ) : null}
            </div>
            <div style={styles.rowActions}>
              <StatusPill status={operationResult.status} />
            </div>
          </div>
        ) : null}
      </section>

      <div style={styles.mainGrid}>
        <section style={styles.sectionCard}>
          <div style={styles.sectionHeader}>
            <div>
              <div style={styles.sectionTitle}>RUNTIME HEALTH</div>
              <div style={styles.sectionSubtitle}>LIVE TELEMETRY + RECOVERY SIGNALS</div>
            </div>
            <button type="button" onClick={() => void loadRuntime()} style={styles.ghostButton}>
              REFRESH
            </button>
          </div>
          <div style={styles.sectionDivider} />
          {telemetry.length === 0 ? (
            <div style={styles.emptyText}>NO PAPERCLIP TELEMETRY AVAILABLE.</div>
          ) : (
            <div style={styles.columnList}>
              {telemetry.map((item) => (
                <RuntimeTelemetryRow
                  key={item.userId}
                  item={item}
                  selected={selectedUserId === item.userId}
                  onSelect={() => setSelectedUserId(item.userId)}
                  onOpenDetail={() => navigate(`/agents/${encodeURIComponent(item.userId)}`)}
                />
              ))}
            </div>
          )}
        </section>

        <section style={styles.sectionCard}>
          <div style={styles.sectionHeader}>
            <div>
              <div style={styles.sectionTitle}>FOCUS CONTEXT</div>
              <div style={styles.sectionSubtitle}>
                {selectedUserId ? `RUNTIME LENS · ${selectedUserId.toUpperCase()}` : "SELECT AN AGENT"}
              </div>
            </div>
            {selectedUserId ? (
              <button
                type="button"
                onClick={() => navigate(`/agents/${encodeURIComponent(selectedUserId)}`)}
                style={styles.ghostButton}
              >
                OPEN AGENT PAGE
              </button>
            ) : null}
          </div>
          <div style={styles.sectionDivider} />
          <div style={styles.rosterWrap}>
            {users.map((user) => (
              <button
                key={user.userId}
                type="button"
                onClick={() => setSelectedUserId(user.userId)}
                style={{
                  ...styles.rosterChip,
                  borderColor:
                    selectedUserId === user.userId
                      ? "var(--lcars-orange)"
                      : "rgba(153, 153, 204, 0.24)",
                  color:
                    selectedUserId === user.userId
                      ? "var(--lcars-orange)"
                      : "var(--lcars-lavender)",
                }}
              >
                {user.userName.toUpperCase()}
              </button>
            ))}
          </div>
          <AgentDetailPanel
            detail={detail}
            loading={detailLoading}
            error={detailError}
            onOpenDedicated={
              selectedUserId
                ? () => navigate(`/agents/${encodeURIComponent(selectedUserId)}`)
                : null
            }
          />
        </section>

        <section style={styles.sectionCard}>
          <div style={styles.sectionHeader}>
            <div>
              <div style={styles.sectionTitle}>ESCALATE + CREW STATUS</div>
              <div style={styles.sectionSubtitle}>FOUNDER ACTIONS AND HUMAN PRESENCE</div>
            </div>
            <button type="button" onClick={() => navigate("/settings")} style={styles.ghostButton}>
              ADMIN TOOLS
            </button>
          </div>
          <div style={styles.sectionDivider} />
          <PaperclipEscalationComposer
            selectedUserId={selectedUserId}
            onSubmitted={async () => {
              await Promise.all([
                loadRuntime(),
                selectedUserId ? loadDetail(selectedUserId) : Promise.resolve(),
              ]);
            }}
          />

          <div style={styles.subsectionTitle}>CREW STATUS</div>
          {presence.length === 0 ? (
            <div style={styles.emptyText}>NO CREW SIGNALS.</div>
          ) : (
            <div style={styles.presenceGrid}>
              {presence.map((entry) => (
                <PresenceCard key={entry.employeeName} data={entry} />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function OrgNodeCard({
  node,
  nodeById,
  depth,
}: {
  node: PaperclipOrgNodeView;
  nodeById: Map<string, PaperclipOrgNodeView>;
  depth: number;
}) {
  const navigate = useNavigate();
  const color = metricColor(node.telemetry?.status);
  const children = node.directReportIds
    .map((id) => nodeById.get(id))
    .filter((entry): entry is PaperclipOrgNodeView => Boolean(entry));

  return (
    <div style={{ ...styles.orgNodeWrap, marginLeft: depth * 18 }}>
      <div style={{ ...styles.orgNodeCard, borderLeftColor: color }}>
        <div style={styles.rowHeader}>
          <div style={styles.agentIdentityCard}>
            <Avatar name={node.user.userName} size={34} />
            <div style={{ minWidth: 0 }}>
              <div style={styles.rowTitle}>{node.user.userName.toUpperCase()}</div>
              <div style={styles.rowMeta}>
                {node.user.title?.toUpperCase() || "NO TITLE"}
                {node.user.role ? ` · ${node.user.role.toUpperCase()}` : ""}
                {node.user.department ? ` · ${node.user.department.toUpperCase()}` : ""}
              </div>
              {node.user.reportsTo ? (
                <div style={styles.rowMeta}>REPORTS TO {node.user.reportsTo.toUpperCase()}</div>
              ) : null}
            </div>
          </div>
          <div style={styles.rowActions}>
            <StatusPill status={node.telemetry?.status} />
            <button
              type="button"
              onClick={() => navigate(`/agents/${encodeURIComponent(node.user.userId)}`)}
              style={styles.inlineAction}
            >
              OPEN DETAIL
            </button>
          </div>
        </div>
        <div style={styles.rowMeta}>
          {node.activeTaskCount} ACTIVE · {node.escalationCount} ESCALATIONS · {node.projectRoomCount} PROJECT ROOMS ·{" "}
          {formatDate(node.latestHeartbeatAt)}
        </div>
        <div style={styles.rowMeta}>
          QUEUE {node.queueSummary.pending}P / {node.queueSummary.inProgress}I / {node.queueSummary.blocked}B / {node.queueSummary.completed}C
        </div>
        {node.projectRoomNames.length > 0 ? (
          <div style={styles.tagRow}>
            {node.projectRoomNames.map((roomName) => (
              <span key={roomName} style={styles.dataTag}>
                {roomName.toUpperCase()}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {children.length > 0 ? (
        <div style={styles.orgChildrenWrap}>
          {children.map((child) => (
            <OrgNodeCard
              key={child.user.userId}
              node={child}
              nodeById={nodeById}
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AgentsOrgRoute() {
  const api = useInvoke();
  const [view, setView] = useState<PaperclipOrgView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.getPaperclipOrgView();
      setView(result);
      setLoadError(null);
      setLastUpdated(new Date());
    } catch (error) {
      setView(null);
      setLoadError(String(error));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => {
      void load();
    }, 30000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) {
    return (
      <div style={styles.mainGrid}>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!view) {
    return (
      <WarningFrame
        title="ORG VIEW UNAVAILABLE"
        body={loadError || "Paperclip org data could not be loaded."}
        onRetry={() => void load()}
      />
    );
  }

  const nodeById = new Map(view.nodes.map((node) => [node.user.userId, node]));
  const rootNode = nodeById.get(view.rootUserId) ?? view.nodes[0];
  const totalActive = view.nodes.reduce((sum, node) => sum + node.activeTaskCount, 0);
  const totalProjectRooms = view.nodes.reduce((sum, node) => sum + node.projectRoomCount, 0);
  const staleAgents = view.nodes.filter((node) => node.telemetry?.stale).length;

  return (
    <>
      <div style={styles.headerMeta}>
        {lastUpdated ? `UPDATED ${formatDate(lastUpdated.toISOString())}` : "NO REFRESH YET"}
      </div>

      <div style={styles.summaryGrid}>
        <SummaryRail
          label="ROOT LEAD"
          value={(rootNode?.user.userName || "CEO").toUpperCase()}
          color="var(--lcars-orange)"
          subtext={`${view.nodes.length} AGENTS IN THE ORG`}
        />
        <SummaryRail
          label="ACTIVE QUEUE"
          value={String(totalActive)}
          color="var(--lcars-cyan)"
          subtext={`${staleAgents} STALE AGENTS`}
        />
        <SummaryRail
          label="PROJECT ROOMS"
          value={String(totalProjectRooms)}
          color="var(--lcars-green)"
          subtext="ROOM OWNERSHIP BY AGENT"
        />
      </div>

      <section style={styles.sectionCard}>
        <div style={styles.sectionHeader}>
          <div>
            <div style={styles.sectionTitle}>AGENT ORG</div>
            <div style={styles.sectionSubtitle}>REPORTING LINES + QUEUE OWNERSHIP</div>
          </div>
          <button type="button" onClick={() => void load()} style={styles.ghostButton}>
            REFRESH
          </button>
        </div>
        <div style={styles.sectionDivider} />
        {rootNode ? (
          <OrgNodeCard node={rootNode} nodeById={nodeById} depth={0} />
        ) : (
          <div style={styles.emptyText}>NO ROOT AGENT AVAILABLE.</div>
        )}
      </section>
    </>
  );
}

function FounderQueueSection({ section }: { section: PaperclipFounderQueueView["sections"][number] }) {
  const navigate = useNavigate();

  return (
    <div style={styles.queueSection}>
      <div style={styles.queueSectionHeader}>
        <div style={styles.sectionTitle}>{section.label.toUpperCase()}</div>
        <div style={styles.queueCount}>{section.count}</div>
      </div>
      <div style={styles.sectionDivider} />
      {section.items.length === 0 ? (
        <div style={styles.emptyText}>NO ITEMS.</div>
      ) : (
        <div style={styles.columnList}>
          {section.items.map((item) => (
            <div key={item.id} style={styles.signalRow}>
              <div>
                <div style={styles.rowTitle}>{item.title.toUpperCase()}</div>
                <div style={styles.rowMeta}>
                  {item.status.toUpperCase()}
                  {item.priority ? ` · ${item.priority.toUpperCase()}` : ""}
                  {item.projectCode ? ` · ${item.projectCode.toUpperCase()}` : ""}
                  {item.source ? ` · ${item.source.toUpperCase()}` : ""}
                </div>
                {(item.tags.length > 0 || item.sourceRef || item.updatedAt) ? (
                  <div style={styles.rowMeta}>
                    {item.tags.length > 0 ? `TAGS ${item.tags.map((tag) => tag.toUpperCase()).join(", ")}` : null}
                    {item.sourceRef ? `${item.tags.length > 0 ? " · " : ""}${item.sourceRef.toUpperCase()}` : null}
                    {item.updatedAt ? ` · ${formatDate(item.updatedAt)}` : null}
                  </div>
                ) : null}
              </div>
              <div style={styles.rowActions}>
                {item.escalationTagged ? <span style={styles.alertPill}>ESCALATION</span> : null}
                <button
                  type="button"
                  onClick={() => navigate(`/agents/${encodeURIComponent(item.userId)}`)}
                  style={styles.inlineAction}
                >
                  OPEN AGENT
                </button>
                {item.projectId ? (
                  <button
                    type="button"
                    onClick={() => navigate(buildIssuePath(item.projectId!))}
                    style={styles.inlineAction}
                  >
                    OPEN ISSUES
                  </button>
                ) : null}
                {item.clientId ? (
                  <button
                    type="button"
                    onClick={() => navigate(buildClientPath(item.clientId!))}
                    style={styles.inlineAction}
                  >
                    OPEN CLIENT
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AgentsQueueRoute() {
  const api = useInvoke();
  const [view, setView] = useState<PaperclipFounderQueueView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.getPaperclipFounderQueue();
      setView(result);
      setLoadError(null);
      setLastUpdated(new Date());
    } catch (error) {
      setView(null);
      setLoadError(String(error));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => {
      void load();
    }, 30000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) {
    return (
      <div style={styles.mainGrid}>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!view) {
    return (
      <WarningFrame
        title="FOUNDER QUEUE UNAVAILABLE"
        body={loadError || "Paperclip founder queue could not be loaded."}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <>
      <div style={styles.headerMeta}>
        {lastUpdated ? `UPDATED ${formatDate(lastUpdated.toISOString())}` : "NO REFRESH YET"}
      </div>

      <div style={styles.summaryGrid}>
        <SummaryRail
          label="FOUNDER"
          value={view.founderUserName.toUpperCase()}
          color="var(--lcars-orange)"
          subtext={formatDate(view.latestHeartbeatAt)}
        />
        <SummaryRail
          label="ACTIVE QUEUE"
          value={String(view.totalActive)}
          color="var(--lcars-cyan)"
          subtext={`${view.sections.length} LIVE SECTIONS`}
        />
        <SummaryRail
          label="ESCALATIONS"
          value={String(view.escalationBacklogCount)}
          color="var(--lcars-red)"
          subtext="FOUNDER REVIEW BACKLOG"
        />
      </div>

      <div style={styles.queueGrid}>
        {view.sections.map((section) => (
          <FounderQueueSection key={section.key} section={section} />
        ))}
      </div>
    </>
  );
}

function ApprovalSection({
  section,
  resolvingId,
  onResolve,
}: {
  section: PaperclipApprovalQueueView["sections"][number];
  resolvingId: string | null;
  onResolve: (taskId: string, decision: "approve" | "block" | "defer") => Promise<void>;
}) {
  const navigate = useNavigate();

  return (
    <div style={styles.queueSection}>
      <div style={styles.queueSectionHeader}>
        <div style={styles.sectionTitle}>{section.label.toUpperCase()}</div>
        <div style={styles.queueCount}>{section.count}</div>
      </div>
      <div style={styles.sectionDivider} />
      {section.items.length === 0 ? (
        <div style={styles.emptyText}>NO ITEMS.</div>
      ) : (
        <div style={styles.columnList}>
          {section.items.map((item) => {
            const isResolved = item.approvalState === "approved";
            return (
              <div key={item.id} style={styles.signalRow}>
                <div>
                  <div style={styles.rowTitle}>{item.title.toUpperCase()}</div>
                  <div style={styles.rowMeta}>
                    {item.status.toUpperCase()}
                    {item.priority ? ` · ${item.priority.toUpperCase()}` : ""}
                    {item.projectCode ? ` · ${item.projectCode.toUpperCase()}` : ""}
                    {item.source ? ` · ${item.source.toUpperCase()}` : ""}
                  </div>
                  {(item.tags.length > 0 || item.sourceRef || item.updatedAt) ? (
                    <div style={styles.rowMeta}>
                      {item.tags.length > 0
                        ? `TAGS ${item.tags.map((tag) => tag.toUpperCase()).join(", ")}`
                        : null}
                      {item.sourceRef ? `${item.tags.length > 0 ? " · " : ""}${item.sourceRef.toUpperCase()}` : null}
                      {item.updatedAt ? ` · ${formatDate(item.updatedAt)}` : null}
                    </div>
                  ) : null}
                  {item.approvalNote ? (
                    <div style={styles.rowMeta}>{item.approvalNote.toUpperCase()}</div>
                  ) : null}
                  {item.details ? (
                    <div style={styles.rowMeta}>{item.details.toUpperCase()}</div>
                  ) : null}
                </div>
                <div style={styles.rowActions}>
                  {item.escalationTagged ? <span style={styles.alertPill}>ESCALATION</span> : null}
                  <ApprovalStatePill state={item.approvalState} />
                  <button
                    type="button"
                    onClick={() => navigate(`/agents/${encodeURIComponent(item.userId)}`)}
                    style={styles.inlineAction}
                  >
                    OPEN AGENT
                  </button>
                  {item.projectId ? (
                    <button
                      type="button"
                      onClick={() => navigate(buildIssuePath(item.projectId!))}
                      style={styles.inlineAction}
                    >
                      OPEN ISSUES
                    </button>
                  ) : null}
                  {item.clientId ? (
                    <button
                      type="button"
                      onClick={() => navigate(buildClientPath(item.clientId!))}
                      style={styles.inlineAction}
                    >
                      OPEN CLIENT
                    </button>
                  ) : null}
                  {!isResolved ? (
                    <>
                      <button
                        type="button"
                        disabled={resolvingId === item.id}
                        onClick={() => void onResolve(item.id, "approve")}
                        style={styles.inlineAction}
                      >
                        {resolvingId === item.id ? "SAVING..." : "APPROVE"}
                      </button>
                      <button
                        type="button"
                        disabled={resolvingId === item.id}
                        onClick={() => void onResolve(item.id, "block")}
                        style={styles.inlineAction}
                      >
                        BLOCK
                      </button>
                      <button
                        type="button"
                        disabled={resolvingId === item.id}
                        onClick={() => void onResolve(item.id, "defer")}
                        style={styles.inlineAction}
                      >
                        DEFER
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AgentsApprovalsRoute() {
  const api = useInvoke();
  const [view, setView] = useState<PaperclipApprovalQueueView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveMessage, setResolveMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.getPaperclipApprovals();
      setView(result);
      setLoadError(null);
      setLastUpdated(new Date());
    } catch (error) {
      setView(null);
      setLoadError(String(error));
    } finally {
      setLoading(false);
    }
  }, [api]);

  const resolve = useCallback(
    async (taskId: string, decision: "approve" | "block" | "defer") => {
      setResolvingId(taskId);
      setResolveMessage(null);
      try {
        const result = await api.resolvePaperclipApproval(taskId, { decision });
        setResolveMessage(`${result.decision} saved for ${taskId}`);
        await load();
      } catch (error) {
        setResolveMessage(`Error: ${String(error)}`);
      } finally {
        setResolvingId(null);
      }
    },
    [api, load]
  );

  useEffect(() => {
    void load();
    const interval = setInterval(() => {
      void load();
    }, 30000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) {
    return (
      <div style={styles.mainGrid}>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!view) {
    return (
      <WarningFrame
        title="APPROVALS UNAVAILABLE"
        body={loadError || "Paperclip approvals could not be loaded."}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <>
      <div style={styles.headerMeta}>
        {lastUpdated ? `UPDATED ${formatDate(lastUpdated.toISOString())}` : "NO REFRESH YET"}
      </div>

      <div style={styles.summaryGrid}>
        <SummaryRail
          label="PENDING"
          value={String(view.pendingCount)}
          color="var(--lcars-orange)"
          subtext={`${view.totalOpen} OPEN DECISIONS`}
        />
        <SummaryRail
          label="BLOCKED"
          value={String(view.blockedCount)}
          color="var(--lcars-red)"
          subtext="FOUNDER INTERVENTION REQUIRED"
        />
        <SummaryRail
          label="DEFERRED"
          value={String(view.deferredCount)}
          color="var(--lcars-yellow)"
          subtext="HOLDING PATTERN"
        />
        <SummaryRail
          label="APPROVED"
          value={String(view.resolvedCount)}
          color="var(--lcars-green)"
          subtext={formatDate(view.latestHeartbeatAt)}
        />
      </div>

      {resolveMessage ? (
        <div
          style={{
            ...styles.warningBody,
            color: resolveMessage.startsWith("Error") ? "var(--lcars-red)" : "var(--lcars-green)",
          }}
        >
          {resolveMessage.toUpperCase()}
        </div>
      ) : null}

      <div style={styles.queueGrid}>
        {view.sections.map((section) => (
          <ApprovalSection
            key={section.key}
            section={section}
            resolvingId={resolvingId}
            onResolve={resolve}
          />
        ))}
      </div>
    </>
  );
}

function AgentDetailRoute() {
  const api = useInvoke();
  const navigate = useNavigate();
  const params = useParams();
  const agentId = params.agentId ?? "";
  const [detail, setDetail] = useState<PaperclipAgentDetailView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    if (!agentId) return;
    try {
      const result = await api.getPaperclipAgentDetail(agentId);
      setDetail(result);
      setLoadError(null);
      setLastUpdated(new Date());
    } catch (error) {
      setDetail(null);
      setLoadError(String(error));
    } finally {
      setLoading(false);
    }
  }, [agentId, api]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => {
      void load();
    }, 30000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) {
    return (
      <div style={styles.mainGrid}>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!detail) {
    return (
      <WarningFrame
        title="AGENT DETAIL UNAVAILABLE"
        body={loadError || "The selected agent could not be loaded."}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <>
      <div style={styles.headerMeta}>
        {lastUpdated ? `UPDATED ${formatDate(lastUpdated.toISOString())}` : "NO REFRESH YET"}
      </div>

      <div style={styles.summaryGrid}>
        <SummaryRail
          label="AGENT"
          value={detail.user.userName.toUpperCase()}
          color={metricColor(detail.telemetry?.status)}
          subtext={detail.user.title?.toUpperCase() || "NO TITLE"}
        />
        <SummaryRail
          label="STATUS"
          value={(detail.telemetry?.status || "unknown").toUpperCase()}
          color={metricColor(detail.telemetry?.status)}
          subtext={(detail.telemetry?.outcome || "NO OUTCOME").toUpperCase()}
        />
        <SummaryRail
          label="ACTIVE QUEUE"
          value={String(detail.activeTaskCount)}
          color="var(--lcars-cyan)"
          subtext={`${detail.personalContext.summary.blocked} BLOCKED`}
        />
        <SummaryRail
          label="PROJECT ROOMS"
          value={String(detail.projectRoomCount)}
          color="var(--lcars-green)"
          subtext={`${detail.escalationBacklogCount} ESCALATIONS`}
        />
      </div>

      <div style={styles.mainGrid}>
        <section style={styles.sectionCard}>
          <div style={styles.sectionHeader}>
            <div>
              <div style={styles.sectionTitle}>AGENT DETAIL</div>
              <div style={styles.sectionSubtitle}>DEDICATED WORK CONTEXT PAGE</div>
            </div>
            <div style={styles.rowActions}>
              <button type="button" onClick={() => navigate("/agents/runtime")} style={styles.ghostButton}>
                OPEN RUNTIME
              </button>
              <button type="button" onClick={() => navigate("/agents/org")} style={styles.ghostButton}>
                OPEN ORG
              </button>
              <button type="button" onClick={() => navigate("/agents/queue")} style={styles.ghostButton}>
                OPEN QUEUE
              </button>
              <button type="button" onClick={() => navigate("/agents/approvals")} style={styles.ghostButton}>
                OPEN APPROVALS
              </button>
            </div>
          </div>
          <div style={styles.sectionDivider} />
          <AgentDetailPanel detail={detail} loading={false} error={null} />
        </section>

        <section style={styles.sectionCard}>
          <div style={styles.sectionHeader}>
            <div>
              <div style={styles.sectionTitle}>FOUNDER ACTION</div>
              <div style={styles.sectionSubtitle}>ESCALATE DIRECTLY INTO PAPERCLIP</div>
            </div>
            <button type="button" onClick={() => void load()} style={styles.ghostButton}>
              REFRESH
            </button>
          </div>
          <div style={styles.sectionDivider} />
          <PaperclipEscalationComposer selectedUserId={detail.user.userId} onSubmitted={load} />
        </section>
      </div>
    </>
  );
}

function Agents() {
  return (
    <div>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.pageTitle}>AGENTS</h1>
          <div style={styles.pageTitleBar} />
        </div>
        <div style={styles.headerMeta}>PAPERCLIP DAILY SHELL</div>
      </div>

      <div style={styles.subrouteStrip}>
        <NavLink
          to="/agents/runtime"
          end
          style={({ isActive }) => ({
            ...styles.subrouteLink,
            ...(isActive ? styles.subrouteLinkActive : null),
          })}
        >
          RUNTIME
        </NavLink>
        <NavLink
          to="/agents/org"
          end
          style={({ isActive }) => ({
            ...styles.subrouteLink,
            ...(isActive ? styles.subrouteLinkActive : null),
          })}
        >
          ORG
        </NavLink>
        <NavLink
          to="/agents/queue"
          end
          style={({ isActive }) => ({
            ...styles.subrouteLink,
            ...(isActive ? styles.subrouteLinkActive : null),
          })}
        >
          QUEUE
        </NavLink>
        <NavLink
          to="/agents/approvals"
          end
          style={({ isActive }) => ({
            ...styles.subrouteLink,
            ...(isActive ? styles.subrouteLinkActive : null),
          })}
        >
          APPROVALS
        </NavLink>
      </div>

      <Routes>
        <Route index element={<Navigate to="runtime" replace />} />
        <Route path="runtime" element={<AgentsRuntimeRoute />} />
        <Route path="org" element={<AgentsOrgRoute />} />
        <Route path="queue" element={<AgentsQueueRoute />} />
        <Route path="approvals" element={<AgentsApprovalsRoute />} />
        <Route path=":agentId" element={<AgentDetailRoute />} />
        <Route path="*" element={<Navigate to="runtime" replace />} />
      </Routes>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  pageTitle: lcarsPageStyles.pageTitle,
  pageTitleBar: lcarsPageStyles.pageTitleBar,
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "baseline",
  },
  headerMeta: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: "var(--text-quaternary)",
    letterSpacing: "1px",
  },
  subrouteStrip: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 18,
  },
  subrouteLink: {
    ...lcarsPageStyles.ghostButton,
    textDecoration: "none",
    minWidth: 96,
    textAlign: "center",
  },
  subrouteLinkActive: {
    borderColor: "var(--lcars-orange)",
    color: "var(--lcars-orange)",
    background: "rgba(255, 153, 0, 0.08)",
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 14,
    marginBottom: 18,
  },
  summaryRail: {
    ...lcarsPageStyles.card,
    borderLeft: "8px solid var(--lcars-orange)",
    padding: "16px 18px",
  },
  summaryLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    color: "var(--lcars-lavender)",
    letterSpacing: "1.5px",
  },
  summaryValue: {
    marginTop: 8,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 28,
    fontWeight: 700,
  },
  summarySubtext: {
    marginTop: 8,
    fontSize: 11,
    color: "var(--lcars-tan)",
    lineHeight: 1.5,
  },
  warningBox: {
    ...lcarsPageStyles.card,
    borderLeft: "8px solid var(--lcars-red)",
    marginBottom: 16,
  },
  warningTitle: {
    ...lcarsPageStyles.sectionTitle,
    color: "var(--lcars-red)",
    marginBottom: 8,
  },
  warningBody: {
    color: "var(--lcars-tan)",
    fontSize: 12,
    lineHeight: 1.6,
  },
  actionRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
    marginTop: 12,
  },
  opsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
  },
  mainGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 16,
  },
  queueGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 16,
  },
  sectionCard: {
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
  sectionTitle: lcarsPageStyles.sectionTitle,
  sectionSubtitle: {
    color: "var(--lcars-lavender)",
    fontSize: 11,
    letterSpacing: "1px",
    fontFamily: "'JetBrains Mono', monospace",
  },
  sectionDivider: lcarsPageStyles.sectionDivider,
  ghostButton: lcarsPageStyles.ghostButton,
  primaryButton: lcarsPageStyles.primaryButton,
  emptyText: lcarsPageStyles.emptyText,
  columnList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  listRowButton: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    textAlign: "left",
    padding: "12px 12px 10px",
    border: "1px solid rgba(153, 153, 204, 0.12)",
    borderLeft: "4px solid rgba(153, 153, 204, 0.24)",
    cursor: "pointer",
    color: "inherit",
  },
  rowHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
  },
  rowTitle: {
    color: "var(--lcars-orange)",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.8px",
  },
  rowMeta: {
    color: "var(--lcars-tan)",
    fontSize: 11,
    lineHeight: 1.5,
    fontFamily: "'JetBrains Mono', monospace",
  },
  statusPill: {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    border: "1px solid rgba(153, 153, 204, 0.3)",
    color: "var(--lcars-lavender)",
    fontSize: 10,
    letterSpacing: "1px",
    fontFamily: "'Orbitron', sans-serif",
    whiteSpace: "nowrap",
  },
  alertPill: {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    border: "1px solid rgba(255, 102, 102, 0.45)",
    color: "var(--lcars-red)",
    fontSize: 10,
    letterSpacing: "1px",
    fontFamily: "'Orbitron', sans-serif",
    whiteSpace: "nowrap",
  },
  rosterWrap: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  rosterChip: {
    background: "transparent",
    border: "1px solid rgba(153, 153, 204, 0.22)",
    padding: "7px 10px",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    letterSpacing: "1px",
    cursor: "pointer",
  },
  contextBand: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 10,
  },
  contextCell: {
    ...lcarsPageStyles.subtleCard,
    padding: "12px 14px",
  },
  contextValue: {
    marginTop: 6,
    color: "var(--lcars-tan)",
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: "0.6px",
  },
  subsectionTitle: {
    color: "var(--lcars-cyan)",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 11,
    letterSpacing: "1.3px",
    marginTop: 6,
  },
  signalRow: {
    ...lcarsPageStyles.subtleCard,
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    padding: "12px 14px",
  },
  rowActions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  inlineAction: {
    background: "transparent",
    border: "none",
    color: "var(--lcars-cyan)",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    letterSpacing: "0.6px",
    cursor: "pointer",
    padding: 0,
  },
  presenceGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 10,
  },
  presenceCard: {
    ...lcarsPageStyles.subtleCard,
    borderLeft: "4px solid var(--lcars-lavender)",
    padding: "12px 14px",
  },
  presenceHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  presenceName: {
    color: "var(--lcars-tan)",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.6px",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  fieldLabel: {
    color: "var(--lcars-lavender)",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    letterSpacing: "1.1px",
  },
  input: lcarsPageStyles.input,
  textarea: lcarsPageStyles.textarea,
  select: lcarsPageStyles.select,
  agentIdentityBand: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  agentIdentityCard: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },
  agentIdentityTitle: {
    color: "var(--lcars-orange)",
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: "0.9px",
  },
  orgNodeWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  orgChildrenWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  orgNodeCard: {
    ...lcarsPageStyles.subtleCard,
    borderLeft: "6px solid var(--lcars-orange)",
    padding: "14px 16px",
  },
  queueSection: {
    ...lcarsPageStyles.card,
    borderLeft: "8px solid var(--lcars-cyan)",
  },
  queueSectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
  },
  queueCount: {
    color: "var(--lcars-cyan)",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 22,
    fontWeight: 700,
  },
  tagRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  dataTag: {
    padding: "4px 8px",
    border: "1px solid rgba(51, 204, 255, 0.28)",
    color: "var(--lcars-cyan)",
    fontSize: 10,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: "0.8px",
  },
};

export default Agents;
