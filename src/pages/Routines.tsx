import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SkeletonCard } from "../components/ui/Skeleton";
import { useInvoke } from "../hooks/useInvoke";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";
import type {
  PaperclipRoutineItemView,
  PaperclipRoutinesAgentView,
  PaperclipRoutinesView,
} from "../lib/types";

function tokenLabel(value: string): string {
  return value.replace(/_/g, " ").toUpperCase();
}

function kindColor(kind: string): string {
  switch (kind.trim().toLowerCase()) {
    case "custom_routine":
      return "var(--lcars-orange)";
    case "event_trigger":
      return "var(--lcars-cyan)";
    case "command":
      return "var(--lcars-green)";
    default:
      return "var(--lcars-lavender)";
  }
}

function StatusPill({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        ...styles.pill,
        borderColor: color,
        color,
      }}
    >
      {label}
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

type RoutineRecord = {
  agent: PaperclipRoutinesAgentView;
  item: PaperclipRoutineItemView;
};

function RoutineListRow({
  record,
  selected,
  onSelect,
}: {
  record: RoutineRecord;
  selected: boolean;
  onSelect: () => void;
}) {
  const color = kindColor(record.item.kind);
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        ...styles.listRow,
        borderLeftColor: selected ? color : "rgba(153, 153, 204, 0.22)",
        background: selected ? "rgba(255, 153, 0, 0.08)" : "rgba(153, 153, 204, 0.04)",
      }}
    >
      <div style={styles.listRowHead}>
        <div style={styles.listRowTitle}>{record.item.label.toUpperCase()}</div>
        <StatusPill label={tokenLabel(record.item.kind)} color={color} />
      </div>
      <div style={styles.listRowMeta}>
        {record.agent.user.userName.toUpperCase()}
        {record.agent.currentKrebs ? ` · ${record.agent.currentKrebs.toUpperCase()}` : ""}
      </div>
      <div style={styles.listRowMeta}>
        {record.item.platforms.length > 0
          ? record.item.platforms.map((platform) => platform.toUpperCase()).join(" · ")
          : record.item.interval
            ? `EVERY ${record.item.interval.toUpperCase()}`
            : "LOCAL LOOP"}
      </div>
    </button>
  );
}

function matchesKind(record: RoutineRecord, filter: string): boolean {
  return filter === "all" || record.item.kind === filter;
}

function Routines() {
  const api = useInvoke();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<PaperclipRoutinesView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manifestContent, setManifestContent] = useState("");
  const [manifestPath, setManifestPath] = useState<string | null>(null);
  const [manifestMessage, setManifestMessage] = useState<string | null>(null);
  const [manifestLoading, setManifestLoading] = useState(false);
  const [manifestSaving, setManifestSaving] = useState(false);

  const kindFilter = searchParams.get("kind") ?? "all";
  const agentFilter = searchParams.get("agent") ?? "all";
  const selectedKey = searchParams.get("routine");

  const load = useCallback(async () => {
    try {
      const result = await api.getPaperclipRoutines();
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

  const records = useMemo(() => {
    if (!view) return [];
    return view.agents.flatMap((agent) =>
      agent.items.map((item) => ({
        agent,
        item,
      }))
    );
  }, [view]);

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const agentMatches = agentFilter === "all" || record.agent.user.userId === agentFilter;
      return agentMatches && matchesKind(record, kindFilter);
    });
  }, [agentFilter, kindFilter, records]);

  useEffect(() => {
    if (filteredRecords.length === 0) return;
    if (selectedKey && filteredRecords.some((record) => record.item.key === selectedKey)) return;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("routine", filteredRecords[0].item.key);
      return next;
    });
  }, [filteredRecords, selectedKey, setSearchParams]);

  const selectedRecord =
    filteredRecords.find((record) => record.item.key === selectedKey) ?? filteredRecords[0] ?? null;
  const editorUserId =
    selectedRecord?.agent.user.userId ??
    (agentFilter !== "all" ? agentFilter : view?.agents[0]?.user.userId ?? null);

  const loadManifestFile = useCallback(
    async (userId: string) => {
      setManifestLoading(true);
      try {
        const file = await api.getPaperclipAgentManifestFile(userId);
        setManifestContent(file.content);
        setManifestPath(file.filePath);
        setManifestMessage(null);
      } catch (loadError) {
        setManifestContent("");
        setManifestPath(null);
        setManifestMessage(`MANIFEST LOAD FAILED: ${String(loadError)}`);
      } finally {
        setManifestLoading(false);
      }
    },
    [api]
  );

  useEffect(() => {
    if (!editorUserId) return;
    void loadManifestFile(editorUserId);
  }, [editorUserId, loadManifestFile]);

  const saveManifestFile = useCallback(async () => {
    if (!editorUserId) return;
    setManifestSaving(true);
    try {
      await api.savePaperclipAgentManifestFile(editorUserId, manifestContent);
      setManifestMessage("MANIFEST.YAML SAVED TO PAPERCLIP.");
      await Promise.all([load(), loadManifestFile(editorUserId)]);
    } catch (saveError) {
      setManifestMessage(`MANIFEST SAVE FAILED: ${String(saveError)}`);
    } finally {
      setManifestSaving(false);
    }
  }, [api, editorUserId, load, loadManifestFile, manifestContent]);

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
        <div style={lcarsPageStyles.pageTitle}>Routines</div>
        <div style={lcarsPageStyles.pageTitleBar} />
        <div style={styles.warningCard}>
          <div style={styles.warningTitle}>ROUTINES UNAVAILABLE</div>
          <div style={styles.warningBody}>{error || "Paperclip routine context could not be loaded."}</div>
          <button type="button" onClick={() => void load()} style={lcarsPageStyles.ghostButton}>
            RETRY
          </button>
        </div>
      </div>
    );
  }

  const agentOptions = view.agents.filter((agent) => agent.items.length > 0);

  return (
    <div style={styles.page}>
      <div style={lcarsPageStyles.pageTitle}>Routines</div>
      <div style={lcarsPageStyles.pageTitleBar} />

      <div style={styles.summaryGrid}>
        <SummaryCard
          label="Custom"
          value={String(view.summary.totalCustomRoutines)}
          subtext="MANIFEST-DEFINED ROUTINES"
          color="var(--lcars-orange)"
        />
        <SummaryCard
          label="Triggers"
          value={String(view.summary.totalEventTriggers)}
          subtext="EVENT OR INTERVAL WATCHERS"
          color="var(--lcars-cyan)"
        />
        <SummaryCard
          label="Commands"
          value={String(view.summary.totalCommands)}
          subtext="EXPORTED OPERATOR COMMANDS"
          color="var(--lcars-green)"
        />
        <SummaryCard
          label="Agents"
          value={String(view.summary.automatedAgents)}
          subtext={`${view.summary.totalAgents} TOTAL AGENTS`}
          color="var(--lcars-lavender)"
        />
      </div>

      <div style={styles.toolbar}>
        {["all", "custom_routine", "event_trigger", "command", "loop_contract"].map((filter) => (
          <FilterPill
            key={filter}
            label={tokenLabel(filter)}
            active={kindFilter === filter}
            onClick={() =>
              setSearchParams((current) => {
                const next = new URLSearchParams(current);
                next.set("kind", filter);
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
              <div style={styles.sectionTitle}>AUTOMATION SURFACE</div>
              <div style={styles.sectionSubtitle}>{filteredRecords.length} ROUTINES IN VIEW</div>
            </div>
            <button type="button" onClick={() => void load()} style={lcarsPageStyles.ghostButton}>
              REFRESH
            </button>
          </div>
          <div style={styles.sectionDivider} />
          {filteredRecords.length === 0 ? (
            <div style={styles.emptyText}>NO ROUTINES MATCH THE CURRENT FILTERS.</div>
          ) : (
            <div style={styles.listColumn}>
              {filteredRecords.map((record) => (
                <RoutineListRow
                  key={record.item.key}
                  record={record}
                  selected={selectedRecord?.item.key === record.item.key}
                  onSelect={() =>
                    setSearchParams((current) => {
                      const next = new URLSearchParams(current);
                      next.set("routine", record.item.key);
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
              <div style={styles.sectionTitle}>ROUTINE DETAIL</div>
              <div style={styles.sectionSubtitle}>TEAMFORGE CONTROL-PLANE VIEW</div>
            </div>
            {selectedRecord ? (
              <div style={styles.detailMeta}>{selectedRecord.agent.user.userName.toUpperCase()}</div>
            ) : null}
          </div>
          <div style={styles.sectionDivider} />
          {selectedRecord ? (
            <>
              <div style={styles.detailHeader}>
                <div style={styles.detailTitle}>{selectedRecord.item.label.toUpperCase()}</div>
                <StatusPill
                  label={tokenLabel(selectedRecord.item.kind)}
                  color={kindColor(selectedRecord.item.kind)}
                />
              </div>

              <div style={styles.metricGrid}>
                <div>
                  <div style={styles.metricLabel}>OWNER</div>
                  <div style={styles.metricValue}>{selectedRecord.agent.user.userName.toUpperCase()}</div>
                </div>
                <div>
                  <div style={styles.metricLabel}>KREBS</div>
                  <div style={styles.metricValue}>
                    {selectedRecord.agent.currentKrebs?.toUpperCase() || "UNASSIGNED"}
                  </div>
                </div>
                <div>
                  <div style={styles.metricLabel}>LOOP</div>
                  <div style={styles.metricValue}>
                    {selectedRecord.agent.loopInterval?.toUpperCase() || "NOT DECLARED"}
                  </div>
                </div>
              </div>

              {selectedRecord.agent.mission ? (
                <div style={styles.detailSection}>
                  <div style={styles.metricLabel}>MISSION</div>
                  <div style={styles.narrative}>{selectedRecord.agent.mission}</div>
                </div>
              ) : null}

              <div style={styles.detailSection}>
                <div style={styles.metricLabel}>ROUTINE CONTRACT</div>
                <div style={styles.contractList}>
                  {selectedRecord.item.trigger ? <div>TRIGGER: {selectedRecord.item.trigger}</div> : null}
                  {selectedRecord.item.action ? <div>ACTION: {selectedRecord.item.action}</div> : null}
                  {selectedRecord.item.filter ? <div>FILTER: {selectedRecord.item.filter}</div> : null}
                  {selectedRecord.item.interval ? <div>INTERVAL: {selectedRecord.item.interval}</div> : null}
                  {selectedRecord.item.scope ? <div>SCOPE: {selectedRecord.item.scope}</div> : null}
                  {selectedRecord.item.renderer ? <div>RENDERER: {selectedRecord.item.renderer}</div> : null}
                  {selectedRecord.item.outputPath ? <div>OUTPUT: {selectedRecord.item.outputPath}</div> : null}
                  {selectedRecord.item.detail ? <div>DETAIL: {selectedRecord.item.detail}</div> : null}
                </div>
              </div>

              <div style={styles.detailSection}>
                <div style={styles.metricLabel}>PLATFORMS</div>
                <div style={styles.tagRow}>
                  {selectedRecord.item.platforms.length > 0 ? (
                    selectedRecord.item.platforms.map((platform) => (
                      <span key={platform} style={styles.tag}>
                        {platform}
                      </span>
                    ))
                  ) : (
                    <span style={styles.mutedText}>LOCAL LOOP</span>
                  )}
                </div>
              </div>

              <div style={styles.detailSection}>
                <div style={styles.metricLabel}>LOOP READ/WRITE</div>
                <div style={styles.narrative}>
                  READS:{" "}
                  {selectedRecord.agent.loopReads.length > 0
                    ? selectedRecord.agent.loopReads.join(", ")
                    : "none declared"}
                </div>
                <div style={styles.narrative}>
                  WRITES:{" "}
                  {selectedRecord.agent.loopWrites.length > 0
                    ? selectedRecord.agent.loopWrites.join(", ")
                    : "none declared"}
                </div>
                <div style={styles.narrative}>
                  ESCALATES TO: {selectedRecord.agent.escalationTarget?.toUpperCase() || "NOT DECLARED"}
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
                  <button
                    type="button"
                    onClick={() => navigate(`/goals?agent=${encodeURIComponent(selectedRecord.agent.user.userId)}`)}
                    style={lcarsPageStyles.ghostButton}
                  >
                    OPEN GOALS
                  </button>
                </div>
              </div>

              <div style={styles.detailSection}>
                <div style={styles.metricLabel}>DIRECT PAPERCLIP EDIT</div>
                <div style={styles.mutedText}>
                  {selectedRecord.item.kind === "custom_routine"
                    ? "EDITING HERE WRITES DIRECTLY TO THE AGENT MANIFEST.YAML SOURCE OF TRUTH."
                    : "CUSTOM ROUTINES LIVE IN MANIFEST.YAML. TRIGGERS, COMMANDS, AND LOOP CONTRACT ARE ALSO DERIVED FROM THIS FILE."}
                </div>
                {manifestPath ? <div style={styles.filePath}>{manifestPath}</div> : null}
                <textarea
                  value={manifestContent}
                  onChange={(event) => setManifestContent(event.target.value)}
                  style={styles.editor}
                  spellCheck={false}
                  placeholder="MANIFEST.yaml will load here."
                />
                <div style={styles.buttonRow}>
                  <button
                    type="button"
                    onClick={() => editorUserId && void loadManifestFile(editorUserId)}
                    style={lcarsPageStyles.ghostButton}
                    disabled={manifestLoading}
                  >
                    {manifestLoading ? "LOADING..." : "RELOAD MANIFEST"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveManifestFile()}
                    style={lcarsPageStyles.primaryButton}
                    disabled={manifestSaving || !editorUserId}
                  >
                    {manifestSaving ? "SAVING..." : "SAVE MANIFEST"}
                  </button>
                </div>
                {manifestMessage ? (
                  <div
                    style={{
                      ...styles.mutedText,
                      color: manifestMessage.startsWith("MANIFEST SAVE FAILED")
                        || manifestMessage.startsWith("MANIFEST LOAD FAILED")
                        ? "var(--lcars-red)"
                        : "var(--lcars-green)",
                    }}
                  >
                    {manifestMessage}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div style={styles.emptyText}>SELECT A ROUTINE TO LOAD ITS DETAIL CONTEXT.</div>
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
    marginBottom: 16,
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
  detailSection: {
    marginBottom: 18,
  },
  narrative: {
    color: "var(--lcars-tan)",
    fontSize: 13,
    lineHeight: 1.7,
  },
  contractList: {
    display: "grid",
    gap: 8,
    color: "var(--lcars-tan)",
    fontSize: 12,
    lineHeight: 1.6,
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

export default Routines;
