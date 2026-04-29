import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Avatar from "../components/ui/Avatar";
import { SkeletonCard } from "../components/ui/Skeleton";
import { useInvoke } from "../hooks/useInvoke";
import { formatDuration, timeAgo } from "../lib/format";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";
import type {
  PaperclipEscalationInput,
  PaperclipPersonalContext,
  PaperclipRoomDefinition,
  PaperclipRuntimeOverview,
  PaperclipTelemetryItem,
  PaperclipUser,
  PresenceStatus,
} from "../lib/types";

function formatDate(value: string | null): string {
  if (!value) return "NO RECENT SIGNAL";
  return timeAgo(value).toUpperCase();
}

function metricColor(value: string): string {
  switch (value) {
    case "healthy":
      return "var(--lcars-green)";
    case "stale":
      return "var(--lcars-yellow)";
    case "uninitialized":
      return "var(--lcars-red)";
    default:
      return "var(--lcars-lavender)";
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

function TelemetryRow({
  item,
  selected,
  onSelect,
}: {
  item: PaperclipTelemetryItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const color = metricColor(item.status);
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
        <span style={{ ...styles.statusPill, borderColor: color, color }}>
          {item.status.toUpperCase()}
        </span>
      </div>
      <div style={styles.rowMeta}>
        {item.outcome?.toUpperCase() || "NO OUTCOME"} · {item.steps} STEPS ·{" "}
        {item.blocked} BLOCKED · {formatDate(item.lastCycle)}
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
        data.clockifyDuration != null
          ? formatDuration(data.clockifyDuration)
          : "--"
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

function Agents() {
  const api = useInvoke();
  const navigate = useNavigate();
  const [runtime, setRuntime] = useState<PaperclipRuntimeOverview | null>(null);
  const [telemetry, setTelemetry] = useState<PaperclipTelemetryItem[]>([]);
  const [users, setUsers] = useState<PaperclipUser[]>([]);
  const [presence, setPresence] = useState<PresenceStatus[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [personalContext, setPersonalContext] = useState<PaperclipPersonalContext | null>(null);
  const [rooms, setRooms] = useState<PaperclipRoomDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [escalationTitle, setEscalationTitle] = useState("");
  const [escalationBody, setEscalationBody] = useState("");
  const [escalationSeverity, setEscalationSeverity] = useState("high");
  const [escalationSending, setEscalationSending] = useState(false);
  const [escalationMessage, setEscalationMessage] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadPresence = useCallback(async () => {
    try {
      setPresence(await api.getPresenceStatus());
    } catch {
      setPresence([]);
    }
  }, []);

  const loadRuntime = useCallback(async () => {
    try {
      const [runtimeSummary, telemetryItems, roster] = await Promise.all([
        api.getPaperclipRuntimeSummary(),
        api.getPaperclipTelemetry(),
        api.getPaperclipUsers(),
      ]);
      setRuntime(runtimeSummary);
      setTelemetry(telemetryItems);
      setUsers(roster);
      setLastUpdated(new Date());
      setLoadError(null);

      if (!selectedUserId) {
        const founder = roster.find((user) => user.userId === "ceo") ?? roster[0];
        if (founder) {
          setSelectedUserId(founder.userId);
        }
      }
    } catch (error) {
      setLoadError(String(error));
      setRuntime(null);
      setTelemetry([]);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [selectedUserId]);

  const loadUserDetail = useCallback(async (userId: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const [personal, roomList] = await Promise.all([
        api.getPaperclipPersonalContext(userId),
        api.getPaperclipRooms(userId),
      ]);
      setPersonalContext(personal);
      setRooms(roomList);
    } catch (error) {
      setDetailError(String(error));
      setPersonalContext(null);
      setRooms([]);
    } finally {
      setDetailLoading(false);
    }
  }, []);

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
    if (!selectedUserId && users.length > 0) {
      const founder = users.find((user) => user.userId === "ceo") ?? users[0];
      setSelectedUserId(founder.userId);
    }
  }, [selectedUserId, users]);

  useEffect(() => {
    if (!selectedUserId) return;
    void loadUserDetail(selectedUserId);
  }, [loadUserDetail, selectedUserId]);

  const submitEscalation = useCallback(async () => {
    if (!selectedUserId || !escalationTitle.trim() || !escalationBody.trim()) {
      return;
    }

    const input: PaperclipEscalationInput = {
      title: escalationTitle.trim(),
      body: escalationBody.trim(),
      severity: escalationSeverity,
      userId: selectedUserId,
    };

    setEscalationSending(true);
    setEscalationMessage(null);
    try {
      const response = await api.createPaperclipEscalation(input);
      setEscalationMessage(`Escalation sent (${response.issueKey})`);
      setEscalationTitle("");
      setEscalationBody("");
      await Promise.all([loadRuntime(), loadUserDetail(selectedUserId)]);
    } catch (error) {
      setEscalationMessage(`Error: ${String(error)}`);
    } finally {
      setEscalationSending(false);
    }
  }, [
    escalationBody,
    escalationSeverity,
    escalationTitle,
    loadRuntime,
    loadUserDetail,
    selectedUserId,
  ]);

  if (loading) {
    return (
      <div>
        <h1 style={styles.pageTitle}>AGENTS</h1>
        <div style={styles.pageTitleBar} />
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
      </div>
    );
  }

  return (
    <div>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.pageTitle}>AGENTS</h1>
          <div style={styles.pageTitleBar} />
        </div>
        <div style={styles.headerMeta}>
          {lastUpdated ? `UPDATED ${formatDate(lastUpdated.toISOString())}` : "NO REFRESH YET"}
        </div>
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
        <div style={styles.warningBox}>
          <div style={styles.warningTitle}>PAPERCLIP RUNTIME UNAVAILABLE</div>
          <div style={styles.warningBody}>{loadError.toUpperCase()}</div>
          <div style={styles.actionRow}>
            <button type="button" onClick={() => navigate("/settings")} style={styles.ghostButton}>
              OPEN SETTINGS
            </button>
            <button type="button" onClick={() => void loadRuntime()} style={styles.ghostButton}>
              RETRY
            </button>
          </div>
        </div>
      ) : null}

      <div style={styles.mainGrid}>
        <section style={styles.sectionCard}>
          <div style={styles.sectionHeader}>
            <div>
              <div style={styles.sectionTitle}>RUNTIME HEALTH</div>
              <div style={styles.sectionSubtitle}>PAPERCLIP TELEMETRY</div>
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
                <TelemetryRow
                  key={item.userId}
                  item={item}
                  selected={selectedUserId === item.userId}
                  onSelect={() => setSelectedUserId(item.userId)}
                />
              ))}
            </div>
          )}
        </section>

        <section style={styles.sectionCard}>
          <div style={styles.sectionHeader}>
            <div>
              <div style={styles.sectionTitle}>WORK CONTEXT</div>
              <div style={styles.sectionSubtitle}>
                {selectedUserId ? `FOCUS · ${selectedUserId.toUpperCase()}` : "SELECT AN AGENT"}
              </div>
            </div>
            <button type="button" onClick={() => navigate("/activity")} style={styles.ghostButton}>
              OPEN ACTIVITY
            </button>
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
          {detailLoading ? (
            <div style={styles.emptyText}>LOADING AGENT CONTEXT…</div>
          ) : detailError ? (
            <div style={styles.warningBody}>{detailError.toUpperCase()}</div>
          ) : personalContext ? (
            <>
              <div style={styles.contextBand}>
                <div style={styles.contextCell}>
                  <div style={styles.summaryLabel}>CURRENT KREBS</div>
                  <div style={styles.contextValue}>
                    {(personalContext.currentKrebs || "UNASSIGNED").toUpperCase()}
                  </div>
                </div>
                <div style={styles.contextCell}>
                  <div style={styles.summaryLabel}>TASK MIX</div>
                  <div style={styles.contextValue}>
                    {personalContext.summary.pending}P / {personalContext.summary.inProgress}I /{" "}
                    {personalContext.summary.blocked}B
                  </div>
                </div>
                <div style={styles.contextCell}>
                  <div style={styles.summaryLabel}>LATEST HEARTBEAT</div>
                  <div style={styles.contextValue}>
                    {formatDate(personalContext.latestHeartbeatAt)}
                  </div>
                </div>
              </div>
              <div style={styles.subsectionTitle}>ACTIVE TASKS</div>
              {personalContext.tasks.length === 0 ? (
                <div style={styles.emptyText}>NO TASKS FOR THIS AGENT.</div>
              ) : (
                <div style={styles.columnList}>
                  {personalContext.tasks.slice(0, 6).map((task) => (
                    <div key={task.id} style={styles.signalRow}>
                      <div>
                        <div style={styles.rowTitle}>{task.title.toUpperCase()}</div>
                        <div style={styles.rowMeta}>
                          {(task.status || "UNKNOWN").toUpperCase()}
                          {task.priority ? ` · ${task.priority.toUpperCase()}` : ""}
                          {task.projectCode ? ` · ${task.projectCode.toUpperCase()}` : ""}
                        </div>
                      </div>
                      <div style={styles.rowActions}>
                        {task.projectId ? (
                          <button
                            type="button"
                            onClick={() =>
                              navigate(`/issues?project=${encodeURIComponent(task.projectId!)}&state=open`)
                            }
                            style={styles.inlineAction}
                          >
                            OPEN ISSUES
                          </button>
                        ) : null}
                        <span style={styles.statusPill}>
                          {(task.status || "pending").toUpperCase()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={styles.subsectionTitle}>ROOMS</div>
              {rooms.length === 0 ? (
                <div style={styles.emptyText}>NO ROOM DEFINITIONS FOR THIS AGENT.</div>
              ) : (
                <div style={styles.columnList}>
                  {rooms.map((room) => (
                    <div key={room.id} style={styles.signalRow}>
                      <div>
                        <div style={styles.rowTitle}>{room.name.toUpperCase()}</div>
                        <div style={styles.rowMeta}>
                          {room.roomType.toUpperCase()}
                          {room.projectCode ? ` · ${room.projectCode.toUpperCase()}` : ""}
                          {room.projectName ? ` · ${room.projectName.toUpperCase()}` : ""}
                        </div>
                      </div>
                      <div style={styles.rowActions}>
                        {room.projectId ? (
                          <button
                            type="button"
                            onClick={() =>
                              navigate(`/issues?project=${encodeURIComponent(room.projectId!)}&state=open`)
                            }
                            style={styles.inlineAction}
                          >
                            OPEN PROJECT
                          </button>
                        ) : null}
                        {room.clientId ? (
                          <button
                            type="button"
                            onClick={() =>
                              navigate(`/clients?client=${encodeURIComponent(room.clientId!)}&registry=canonical`)
                            }
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
          ) : (
            <div style={styles.emptyText}>SELECT AN AGENT TO LOAD DETAILS.</div>
          )}
        </section>

        <section style={styles.sectionCard}>
          <div style={styles.sectionHeader}>
            <div>
              <div style={styles.sectionTitle}>ESCALATE + CREW STATUS</div>
              <div style={styles.sectionSubtitle}>FOUNDER ACTIONS AND LIVE PRESENCE</div>
            </div>
            <button type="button" onClick={() => navigate("/settings")} style={styles.ghostButton}>
              ADMIN TOOLS
            </button>
          </div>
          <div style={styles.sectionDivider} />
          <div style={styles.field}>
            <label style={styles.fieldLabel}>ESCALATION TITLE</label>
            <input
              value={escalationTitle}
              onChange={(event) => setEscalationTitle(event.target.value)}
              placeholder="Need founder review on runtime or delivery blocker"
              style={styles.input}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.fieldLabel}>ESCALATION BODY</label>
            <textarea
              value={escalationBody}
              onChange={(event) => setEscalationBody(event.target.value)}
              placeholder="State the blocker, risk, and next action you need."
              rows={4}
              style={styles.textarea}
            />
          </div>
          <div style={styles.actionRow}>
            <select
              value={escalationSeverity}
              onChange={(event) => setEscalationSeverity(event.target.value)}
              style={styles.select}
            >
              <option value="critical">CRITICAL</option>
              <option value="high">HIGH</option>
              <option value="medium">MEDIUM</option>
            </select>
            <button
              type="button"
              onClick={() => void submitEscalation()}
              disabled={
                escalationSending ||
                !selectedUserId ||
                !escalationTitle.trim() ||
                !escalationBody.trim()
              }
              style={{
                ...styles.primaryButton,
                opacity:
                  escalationSending ||
                  !selectedUserId ||
                  !escalationTitle.trim() ||
                  !escalationBody.trim()
                    ? 0.5
                    : 1,
              }}
            >
              {escalationSending ? "SENDING..." : "SEND ESCALATION"}
            </button>
          </div>
          {escalationMessage ? (
            <div
              style={{
                ...styles.warningBody,
                color: escalationMessage.startsWith("Error")
                  ? "var(--lcars-red)"
                  : "var(--lcars-green)",
              }}
            >
              {escalationMessage.toUpperCase()}
            </div>
          ) : null}

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
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
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
  mainGrid: {
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
  rosterWrap: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  rosterChip: {
    padding: "6px 12px",
    border: "1px solid rgba(153, 153, 204, 0.24)",
    background: "transparent",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    letterSpacing: "1px",
    cursor: "pointer",
  },
  contextBand: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
    gap: 10,
  },
  contextCell: {
    padding: "12px 10px",
    background: "rgba(153, 153, 204, 0.04)",
    borderLeft: "3px solid rgba(0, 204, 255, 0.28)",
  },
  contextValue: {
    marginTop: 8,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 16,
    color: "var(--lcars-cyan)",
    fontWeight: 700,
  },
  subsectionTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    letterSpacing: "1.6px",
    color: "var(--lcars-lavender)",
    marginTop: 4,
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
  rowActions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  inlineAction: {
    ...lcarsPageStyles.ghostButton,
    padding: "4px 10px",
    fontSize: 9,
    letterSpacing: "1px",
    color: "var(--lcars-cyan)",
    border: "1px solid rgba(0, 204, 255, 0.28)",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  fieldLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    color: "var(--lcars-lavender)",
    letterSpacing: "1.2px",
  },
  input: {
    ...lcarsPageStyles.input,
  },
  textarea: {
    ...lcarsPageStyles.input,
    minHeight: 110,
    resize: "vertical",
  },
  select: {
    ...lcarsPageStyles.input,
    minWidth: 140,
  },
  presenceGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  presenceCard: {
    padding: "14px 14px 12px",
    background: "rgba(153, 153, 204, 0.04)",
    borderLeft: "4px solid rgba(153, 153, 204, 0.24)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  presenceHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  presenceName: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 13,
    color: "var(--lcars-orange)",
    letterSpacing: "1px",
  },
};

export default Agents;
