import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SkeletonCard } from "../components/ui/Skeleton";
import { useInvoke } from "../hooks/useInvoke";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";
import type {
  PaperclipGoalItemView,
  PaperclipGoalsAgentView,
  PaperclipGoalsView,
} from "../lib/types";

function formatDateTime(value: string | null): string {
  if (!value) return "NO SIGNAL";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function tokenLabel(value: string): string {
  return value.replace(/_/g, " ").toUpperCase();
}

function statusColor(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (normalized.includes("blocked")) return "var(--lcars-red)";
  if (normalized.includes("standing")) return "var(--lcars-cyan)";
  if (normalized.includes("completed") || normalized.includes("done")) return "var(--lcars-green)";
  if (normalized.includes("progress")) return "var(--lcars-orange)";
  return "var(--lcars-yellow)";
}

function StatusPill({ status }: { status: string }) {
  const color = statusColor(status);
  return (
    <span
      style={{
        ...styles.pill,
        borderColor: color,
        color,
      }}
    >
      {tokenLabel(status)}
    </span>
  );
}

function SummaryCard({
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
    <div style={{ ...styles.summaryCard, borderLeftColor: color }}>
      <div style={styles.summaryLabel}>{label}</div>
      <div style={{ ...styles.summaryValue, color }}>{value}</div>
      <div style={styles.summarySubtext}>{subtext}</div>
    </div>
  );
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...lcarsPageStyles.ghostButton,
        padding: "4px 12px",
        fontSize: 10,
        color: active ? "var(--lcars-orange)" : "var(--lcars-lavender)",
        border: `1px solid ${active ? "var(--lcars-orange)" : "rgba(153, 153, 204, 0.25)"}`,
        background: active ? "rgba(255, 153, 0, 0.12)" : "rgba(10, 10, 20, 0.68)",
      }}
    >
      {label.toUpperCase()}
    </button>
  );
}

function matchesGoalStatus(goal: PaperclipGoalItemView, filter: string): boolean {
  const normalized = goal.status.trim().toLowerCase();
  switch (filter) {
    case "active":
      return (
        normalized === "open" ||
        normalized === "pending" ||
        normalized === "in_progress" ||
        normalized === "active" ||
        normalized === "working"
      );
    case "blocked":
      return normalized === "blocked";
    case "standing":
      return normalized === "standing";
    case "completed":
      return normalized === "completed" || normalized === "done" || normalized === "closed";
    default:
      return true;
  }
}

type GoalRecord = {
  agent: PaperclipGoalsAgentView;
  goal: PaperclipGoalItemView;
};

function GoalListRow({
  record,
  selected,
  onSelect,
}: {
  record: GoalRecord;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        ...styles.listRow,
        borderLeftColor: selected ? "var(--lcars-orange)" : "rgba(153, 153, 204, 0.22)",
        background: selected ? "rgba(255, 153, 0, 0.08)" : "rgba(153, 153, 204, 0.04)",
      }}
    >
      <div style={styles.listRowHead}>
        <div style={styles.listRowTitle}>{record.goal.title.toUpperCase()}</div>
        <StatusPill status={record.goal.status} />
      </div>
      <div style={styles.listRowMeta}>
        {record.agent.user.userName.toUpperCase()}
        {record.goal.currentKrebs ? ` · ${record.goal.currentKrebs.toUpperCase()}` : ""}
      </div>
      <div style={styles.listRowMeta}>
        {record.goal.sourceLabel}
        {record.goal.priority ? ` · ${record.goal.priority.toUpperCase()}` : ""}
        {record.goal.projectCode ? ` · ${record.goal.projectCode.toUpperCase()}` : ""}
      </div>
    </button>
  );
}

function Goals() {
  const api = useInvoke();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<PaperclipGoalsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tasksFileContent, setTasksFileContent] = useState("");
  const [tasksFilePath, setTasksFilePath] = useState<string | null>(null);
  const [tasksFileMessage, setTasksFileMessage] = useState<string | null>(null);
  const [tasksFileLoading, setTasksFileLoading] = useState(false);
  const [tasksFileSaving, setTasksFileSaving] = useState(false);

  const statusFilter = searchParams.get("status") ?? "all";
  const agentFilter = searchParams.get("agent") ?? "all";
  const selectedGoalKey = searchParams.get("goal");

  const load = useCallback(async () => {
    try {
      const result = await api.getPaperclipGoals();
      setView(result);
      setError(null);
    } catch (loadError) {
      setView(null);
      setError(String(loadError));
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

  const goalRecords = useMemo(() => {
    if (!view) return [];
    return view.agents.flatMap((agent) =>
      agent.goals.map((goal) => ({
        agent,
        goal,
      }))
    );
  }, [view]);

  const filteredRecords = useMemo(() => {
    return goalRecords.filter((record) => {
      const agentMatches = agentFilter === "all" || record.agent.user.userId === agentFilter;
      return agentMatches && matchesGoalStatus(record.goal, statusFilter);
    });
  }, [agentFilter, goalRecords, statusFilter]);

  useEffect(() => {
    if (filteredRecords.length === 0) return;
    if (selectedGoalKey && filteredRecords.some((record) => record.goal.key === selectedGoalKey)) {
      return;
    }
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("goal", filteredRecords[0].goal.key);
      return next;
    });
  }, [filteredRecords, selectedGoalKey, setSearchParams]);

  const selectedRecord =
    filteredRecords.find((record) => record.goal.key === selectedGoalKey) ?? filteredRecords[0] ?? null;
  const editorUserId =
    selectedRecord?.agent.user.userId ??
    (agentFilter !== "all" ? agentFilter : view?.agents[0]?.user.userId ?? null);

  const loadTasksFile = useCallback(
    async (userId: string) => {
      setTasksFileLoading(true);
      try {
        const file = await api.getPaperclipAgentTasksFile(userId);
        setTasksFileContent(file.content);
        setTasksFilePath(file.filePath);
        setTasksFileMessage(null);
      } catch (loadError) {
        setTasksFilePath(null);
        setTasksFileContent("");
        setTasksFileMessage(`TASK FILE LOAD FAILED: ${String(loadError)}`);
      } finally {
        setTasksFileLoading(false);
      }
    },
    [api]
  );

  useEffect(() => {
    if (!editorUserId) return;
    void loadTasksFile(editorUserId);
  }, [editorUserId, loadTasksFile]);

  const saveTasksFile = useCallback(async () => {
    if (!editorUserId) return;
    setTasksFileSaving(true);
    try {
      await api.savePaperclipAgentTasksFile(editorUserId, tasksFileContent);
      setTasksFileMessage("TASKS.MD SAVED TO PAPERCLIP.");
      await Promise.all([load(), loadTasksFile(editorUserId)]);
    } catch (saveError) {
      setTasksFileMessage(`TASK FILE SAVE FAILED: ${String(saveError)}`);
    } finally {
      setTasksFileSaving(false);
    }
  }, [api, editorUserId, load, loadTasksFile, tasksFileContent]);

  if (loading) {
    return (
      <div style={styles.page}>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!view) {
    return (
      <div style={styles.page}>
        <div style={lcarsPageStyles.pageTitle}>Goals</div>
        <div style={lcarsPageStyles.pageTitleBar} />
        <div style={styles.warningCard}>
          <div style={styles.warningTitle}>GOALS UNAVAILABLE</div>
          <div style={styles.warningBody}>{error || "Paperclip goal context could not be loaded."}</div>
          <button type="button" onClick={() => void load()} style={lcarsPageStyles.ghostButton}>
            RETRY
          </button>
        </div>
      </div>
    );
  }

  const agentOptions = view.agents.filter((agent) => agent.goals.length > 0);

  return (
    <div style={styles.page}>
      <div style={lcarsPageStyles.pageTitle}>Goals</div>
      <div style={lcarsPageStyles.pageTitleBar} />

      <div style={styles.summaryGrid}>
        <SummaryCard
          label="Active"
          value={String(view.summary.activeGoals)}
          subtext={`${view.summary.blockedGoals} BLOCKED`}
          color="var(--lcars-orange)"
        />
        <SummaryCard
          label="Standing"
          value={String(view.summary.standingGoals)}
          subtext="LOOP-CADENCE RESPONSIBILITIES"
          color="var(--lcars-cyan)"
        />
        <SummaryCard
          label="Completed"
          value={String(view.summary.completedGoals)}
          subtext="RECENTLY CLOSED OR HANDLED"
          color="var(--lcars-green)"
        />
        <SummaryCard
          label="Agents"
          value={String(view.summary.agentsWithWork)}
          subtext={`${view.summary.totalAgents} TOTAL AGENTS`}
          color="var(--lcars-lavender)"
        />
      </div>

      <div style={styles.toolbar}>
        {["all", "active", "blocked", "standing", "completed"].map((filter) => (
          <FilterPill
            key={filter}
            label={filter}
            active={statusFilter === filter}
            onClick={() =>
              setSearchParams((current) => {
                const next = new URLSearchParams(current);
                next.set("status", filter);
                return next;
              })
            }
          />
        ))}
      </div>

      <div style={styles.agentToolbar}>
        <FilterPill
          label="all agents"
          active={agentFilter === "all"}
          onClick={() =>
            setSearchParams((current) => {
              const next = new URLSearchParams(current);
              next.set("agent", "all");
              return next;
            })
          }
        />
        {agentOptions.map((agent) => (
          <FilterPill
            key={agent.user.userId}
            label={agent.user.userName}
            active={agentFilter === agent.user.userId}
            onClick={() =>
              setSearchParams((current) => {
                const next = new URLSearchParams(current);
                next.set("agent", agent.user.userId);
                return next;
              })
            }
          />
        ))}
      </div>

      <div style={styles.mainGrid}>
        <section style={styles.listCard}>
          <div style={styles.sectionHead}>
            <div>
              <div style={styles.sectionTitle}>WORK SUMMARY</div>
              <div style={styles.sectionSubtitle}>{filteredRecords.length} GOALS IN VIEW</div>
            </div>
            <button type="button" onClick={() => void load()} style={lcarsPageStyles.ghostButton}>
              REFRESH
            </button>
          </div>
          <div style={styles.sectionDivider} />
          {filteredRecords.length === 0 ? (
            <div style={styles.emptyText}>NO GOALS MATCH THE CURRENT FILTERS.</div>
          ) : (
            <div style={styles.listColumn}>
              {filteredRecords.map((record) => (
                <GoalListRow
                  key={record.goal.key}
                  record={record}
                  selected={selectedRecord?.goal.key === record.goal.key}
                  onSelect={() =>
                    setSearchParams((current) => {
                      const next = new URLSearchParams(current);
                      next.set("goal", record.goal.key);
                      return next;
                    })
                  }
                />
              ))}
            </div>
          )}
        </section>

        <section style={styles.detailCard}>
          <div style={styles.sectionHead}>
            <div>
              <div style={styles.sectionTitle}>GOAL DETAIL</div>
              <div style={styles.sectionSubtitle}>FOUNDER REVIEW SURFACE</div>
            </div>
            {selectedRecord ? (
              <div style={styles.detailMeta}>{selectedRecord.agent.user.userName.toUpperCase()}</div>
            ) : null}
          </div>
          <div style={styles.sectionDivider} />
          {selectedRecord ? (
            <>
              <div style={styles.detailHeader}>
                <div style={styles.detailTitle}>{selectedRecord.goal.title.toUpperCase()}</div>
                <StatusPill status={selectedRecord.goal.status} />
              </div>

              <div style={styles.detailMeta}>
                {selectedRecord.goal.sourceLabel}
                {selectedRecord.goal.section ? ` · ${selectedRecord.goal.section.toUpperCase()}` : ""}
                {selectedRecord.goal.priority ? ` · ${selectedRecord.goal.priority.toUpperCase()}` : ""}
              </div>

              <div style={styles.metricGrid}>
                <div>
                  <div style={styles.metricLabel}>OWNER</div>
                  <div style={styles.metricValue}>{selectedRecord.agent.user.userName.toUpperCase()}</div>
                </div>
                <div>
                  <div style={styles.metricLabel}>KREBS</div>
                  <div style={styles.metricValue}>
                    {selectedRecord.goal.currentKrebs?.toUpperCase() || "UNASSIGNED"}
                  </div>
                </div>
                <div>
                  <div style={styles.metricLabel}>UPDATED</div>
                  <div style={styles.metricValueMono}>{formatDateTime(selectedRecord.goal.updatedAt)}</div>
                </div>
              </div>

              {selectedRecord.goal.mission ? (
                <div style={styles.detailSection}>
                  <div style={styles.metricLabel}>MISSION</div>
                  <div style={styles.narrative}>{selectedRecord.goal.mission}</div>
                </div>
              ) : null}

              {selectedRecord.goal.detail ? (
                <div style={styles.detailSection}>
                  <div style={styles.metricLabel}>NOTES</div>
                  <div style={styles.narrative}>{selectedRecord.goal.detail}</div>
                </div>
              ) : null}

              <div style={styles.detailSection}>
                <div style={styles.metricLabel}>TAGS</div>
                <div style={styles.tagRow}>
                  {selectedRecord.goal.tags.length > 0 ? (
                    selectedRecord.goal.tags.map((tag) => (
                      <span key={tag} style={styles.tag}>
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span style={styles.mutedText}>NO TAGS</span>
                  )}
                </div>
              </div>

              <div style={styles.detailSection}>
                <div style={styles.metricLabel}>RELATED ACTIONS</div>
                <div style={styles.buttonRow}>
                  <button
                    type="button"
                    onClick={() => navigate(`/agents/${encodeURIComponent(selectedRecord.agent.user.userId)}`)}
                    style={lcarsPageStyles.ghostButton}
                  >
                    OPEN AGENT
                  </button>
                  {selectedRecord.goal.projectId ? (
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/issues?project=${encodeURIComponent(selectedRecord.goal.projectId!)}`)
                      }
                      style={lcarsPageStyles.ghostButton}
                    >
                      OPEN ISSUES
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        selectedRecord.goal.escalationTagged || selectedRecord.goal.status === "blocked"
                          ? "/inbox?filter=route_failed"
                          : "/inbox"
                      )
                    }
                    style={lcarsPageStyles.ghostButton}
                  >
                    OPEN INBOX
                  </button>
                </div>
              </div>

              <div style={styles.detailSection}>
                <div style={styles.metricLabel}>DIRECT PAPERCLIP EDIT</div>
                <div style={styles.mutedText}>
                  {selectedRecord.goal.sourceKind === "runtime_task"
                    ? "THIS GOAL IS RUNTIME-FED. EDIT THE AGENT TASK FILE BELOW TO CHANGE LOCAL GOALS OR STANDING RESPONSIBILITIES."
                    : "EDITING HERE WRITES DIRECTLY TO THE AGENT TASKS.MD SOURCE OF TRUTH."}
                </div>
                {tasksFilePath ? <div style={styles.filePath}>{tasksFilePath}</div> : null}
                <textarea
                  value={tasksFileContent}
                  onChange={(event) => setTasksFileContent(event.target.value)}
                  style={styles.editor}
                  spellCheck={false}
                  placeholder="TASKS.md will load here."
                />
                <div style={styles.buttonRow}>
                  <button
                    type="button"
                    onClick={() => editorUserId && void loadTasksFile(editorUserId)}
                    style={lcarsPageStyles.ghostButton}
                    disabled={tasksFileLoading}
                  >
                    {tasksFileLoading ? "LOADING..." : "RELOAD TASK FILE"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveTasksFile()}
                    style={lcarsPageStyles.primaryButton}
                    disabled={tasksFileSaving || !editorUserId}
                  >
                    {tasksFileSaving ? "SAVING..." : "SAVE TASK FILE"}
                  </button>
                </div>
                {tasksFileMessage ? (
                  <div
                    style={{
                      ...styles.mutedText,
                      color: tasksFileMessage.startsWith("TASK FILE SAVE FAILED")
                        || tasksFileMessage.startsWith("TASK FILE LOAD FAILED")
                        ? "var(--lcars-red)"
                        : "var(--lcars-green)",
                    }}
                  >
                    {tasksFileMessage}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div style={styles.emptyText}>SELECT A GOAL TO LOAD ITS DETAIL CONTEXT.</div>
          )}
        </section>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    padding: 24,
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 16,
    marginBottom: 20,
  },
  summaryCard: {
    background: "var(--bg-console)",
    border: "1px solid rgba(153, 153, 204, 0.16)",
    borderLeft: "6px solid var(--lcars-orange)",
    borderRadius: "0 18px 18px 0",
    padding: 18,
  },
  summaryLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    letterSpacing: "1.5px",
    color: "var(--lcars-lavender)",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  summaryValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 28,
    marginBottom: 8,
  },
  summarySubtext: {
    color: "var(--text-quaternary)",
    fontSize: 11,
    letterSpacing: "1px",
  },
  toolbar: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 12,
  },
  agentToolbar: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },
  mainGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(300px, 0.95fr) minmax(360px, 1.05fr)",
    gap: 20,
  },
  listCard: {
    ...lcarsPageStyles.card,
    marginBottom: 0,
  },
  detailCard: {
    ...lcarsPageStyles.card,
    marginBottom: 0,
  },
  sectionHead: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
  },
  sectionTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 12,
    letterSpacing: "2px",
    color: "var(--lcars-orange)",
    marginBottom: 4,
  },
  sectionSubtitle: {
    color: "var(--lcars-lavender)",
    fontSize: 11,
    letterSpacing: "1px",
  },
  sectionDivider: {
    ...lcarsPageStyles.sectionDivider,
    marginTop: 16,
  },
  listColumn: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    maxHeight: "72vh",
    overflowY: "auto",
    paddingRight: 4,
  },
  listRow: {
    width: "100%",
    textAlign: "left",
    background: "rgba(153, 153, 204, 0.04)",
    border: "1px solid rgba(153, 153, 204, 0.14)",
    borderLeft: "4px solid rgba(153, 153, 204, 0.22)",
    borderRadius: "0 14px 14px 0",
    padding: 14,
    cursor: "pointer",
  },
  listRowHead: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    marginBottom: 6,
  },
  listRowTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 11,
    color: "var(--lcars-tan)",
    letterSpacing: "1px",
    lineHeight: 1.5,
  },
  listRowMeta: {
    color: "var(--text-quaternary)",
    fontSize: 11,
    letterSpacing: "0.5px",
    lineHeight: 1.5,
  },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    padding: "3px 10px",
    border: "1px solid",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    letterSpacing: "1px",
  },
  detailHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    marginBottom: 8,
  },
  detailTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 16,
    color: "var(--lcars-tan)",
    lineHeight: 1.5,
    letterSpacing: "1.5px",
  },
  detailMeta: {
    color: "var(--lcars-lavender)",
    fontSize: 11,
    letterSpacing: "1px",
    marginBottom: 14,
  },
  metricGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 14,
    marginBottom: 18,
  },
  metricLabel: {
    ...lcarsPageStyles.metricLabel,
    marginBottom: 6,
  },
  metricValue: {
    color: "var(--lcars-tan)",
    fontSize: 13,
    lineHeight: 1.4,
  },
  metricValueMono: {
    color: "var(--lcars-lavender)",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    lineHeight: 1.5,
  },
  detailSection: {
    marginBottom: 18,
  },
  narrative: {
    color: "var(--lcars-tan)",
    fontSize: 13,
    lineHeight: 1.7,
  },
  tagRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  tag: {
    padding: "4px 9px",
    borderRadius: 999,
    border: "1px solid rgba(153, 153, 204, 0.24)",
    color: "var(--lcars-lavender)",
    fontSize: 11,
  },
  mutedText: {
    color: "var(--text-quaternary)",
    fontSize: 11,
  },
  buttonRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
  },
  filePath: {
    color: "var(--lcars-lavender)",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    lineHeight: 1.5,
    margin: "8px 0 10px",
  },
  editor: {
    width: "100%",
    minHeight: 220,
    resize: "vertical" as const,
    background: "rgba(10, 10, 20, 0.84)",
    border: "1px solid rgba(153, 153, 204, 0.18)",
    borderLeft: "4px solid rgba(255, 153, 0, 0.3)",
    color: "var(--lcars-tan)",
    padding: "10px 12px",
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    borderRadius: "0 12px 12px 0",
    margin: "10px 0 12px",
  },
  emptyText: {
    ...lcarsPageStyles.emptyText,
  },
  warningCard: {
    ...lcarsPageStyles.card,
  },
  warningTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 14,
    color: "var(--lcars-red)",
    letterSpacing: "2px",
    marginBottom: 12,
  },
  warningBody: {
    color: "var(--lcars-tan)",
    lineHeight: 1.7,
    marginBottom: 16,
  },
};

export default Goals;
