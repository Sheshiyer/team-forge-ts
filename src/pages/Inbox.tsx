import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SkeletonCard } from "../components/ui/Skeleton";
import { useInvoke } from "../hooks/useInvoke";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";
import type {
  HermesIntakeIngestResult,
  PaperclipApprovalQueueView,
  PaperclipFounderQueueView,
  PaperclipUser,
  TeamforgeInboxView,
  TeamforgeIntakeDetailView,
  TeamforgeIntakeItemView,
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

function pillColor(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized.includes("failed") || normalized.includes("critical") || normalized.includes("blocked")) {
    return "var(--lcars-red)";
  }
  if (normalized.includes("review") || normalized.includes("triage") || normalized.includes("pending")) {
    return "var(--lcars-yellow)";
  }
  if (normalized.includes("percolated") || normalized.includes("done")) {
    return "var(--lcars-green)";
  }
  return "var(--lcars-cyan)";
}

function StatusPill({ label }: { label: string }) {
  const color = pillColor(label);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 10px",
        border: `1px solid ${color}`,
        color,
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 10,
        letterSpacing: "1px",
        textTransform: "uppercase",
      }}
    >
      {tokenLabel(label)}
    </span>
  );
}

function ActionButton({
  label,
  onClick,
  disabled = false,
  accent = "ghost",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  accent?: "ghost" | "primary";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...(accent === "primary" ? lcarsPageStyles.primaryButton : lcarsPageStyles.ghostButton),
        opacity: disabled ? 0.6 : 1,
        padding: "6px 12px",
        fontSize: 10,
        letterSpacing: "1px",
      }}
    >
      {label}
    </button>
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

function IntakeListRow({
  item,
  selected,
  onSelect,
}: {
  item: TeamforgeIntakeItemView;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        ...styles.listRow,
        background: selected ? "rgba(255, 153, 0, 0.08)" : "rgba(153, 153, 204, 0.04)",
        borderLeftColor: selected ? "var(--lcars-orange)" : "rgba(153, 153, 204, 0.24)",
      }}
    >
      <div style={styles.listRowHead}>
        <div style={styles.listRowTitle}>{item.title.toUpperCase()}</div>
        <StatusPill label={item.percolationStatus} />
      </div>
      <div style={styles.listRowMeta}>
        {tokenLabel(item.source)}
        {item.sourceRef ? ` · ${item.sourceRef}` : ""}
        {item.projectCode ? ` · ${item.projectCode.toUpperCase()}` : ""}
        {item.routingLabel ? ` · ${item.routingLabel.toUpperCase()}` : ""}
      </div>
      <div style={styles.listRowMeta}>
        {tokenLabel(item.priority)} · {formatDateTime(item.updatedAt)}
        {item.downstreamSecondaryRef ? ` · ${item.downstreamSecondaryRef}` : ""}
      </div>
    </button>
  );
}

function Inbox() {
  const api = useInvoke();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [inbox, setInbox] = useState<TeamforgeInboxView | null>(null);
  const [detail, setDetail] = useState<TeamforgeIntakeDetailView | null>(null);
  const [paperclipUsers, setPaperclipUsers] = useState<PaperclipUser[]>([]);
  const [founderQueue, setFounderQueue] = useState<PaperclipFounderQueueView | null>(null);
  const [approvalQueue, setApprovalQueue] = useState<PaperclipApprovalQueueView | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ingestResult, setIngestResult] = useState<HermesIntakeIngestResult | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [routing, setRouting] = useState(false);
  const [hermesDraft, setHermesDraft] = useState({
    message: "",
    sourceRef: "",
    sender: "hermes",
    autoRoute: true,
  });
  const [editDraft, setEditDraft] = useState({
    title: "",
    body: "",
    sourceRef: "",
    status: "new",
    priority: "medium",
    tags: "",
    targetAgent: "",
    targetDepartment: "",
    targetQueue: "",
    projectCode: "",
    founderReviewRequired: false,
  });

  const filter = searchParams.get("filter") ?? "all";
  const selectedId = searchParams.get("item");

  const loadInbox = useCallback(async () => {
    const [inboxView, users, founder, approvals] = await Promise.all([
      api.getTeamforgeInbox(),
      api.getPaperclipUsers().catch(() => []),
      api.getPaperclipFounderQueue().catch(() => null),
      api.getPaperclipApprovals().catch(() => null),
    ]);
    setInbox(inboxView);
    setPaperclipUsers(users);
    setFounderQueue(founder);
    setApprovalQueue(approvals);
  }, []);

  const loadDetail = useCallback(async (itemId: string) => {
    setDetailLoading(true);
    try {
      const view = await api.getTeamforgeIntakeDetail(itemId);
      setDetail(view);
      setEditDraft({
        title: view.item.title,
        body: view.item.body,
        sourceRef: view.item.sourceRef ?? "",
        status: view.item.status,
        priority: view.item.priority,
        tags: view.item.tags.join(", "),
        targetAgent: view.item.routingTargetAgent ?? "",
        targetDepartment: view.item.routingTargetDepartment ?? "",
        targetQueue: view.item.routingTargetQueue ?? "",
        projectCode: view.item.projectCode ?? "",
        founderReviewRequired: view.item.founderReviewRequired,
      });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await loadInbox();
      setMessage(null);
    } catch (error) {
      setMessage(`INBOX LOAD FAILED: ${String(error)}`);
    } finally {
      setLoading(false);
    }
  }, [loadInbox]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openLinkedIssue = useCallback((reference: string | null | undefined) => {
    const parsed = parseGitHubIssueReference(reference);
    if (!parsed) return;
    navigate(`/issues?issue=${encodeURIComponent(parsed.issueId)}`);
  }, [navigate]);

  useEffect(() => {
    if (!inbox || inbox.items.length === 0) return;
    if (selectedId && inbox.items.some((item) => item.id === selectedId)) {
      void loadDetail(selectedId);
      return;
    }
    const first = inbox.items[0];
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("item", first.id);
      return next;
    });
  }, [inbox, loadDetail, selectedId, setSearchParams]);

  const filteredItems = useMemo(() => {
    if (!inbox) return [];
    return inbox.items.filter((item) => {
      switch (filter) {
        case "review":
          return item.percolationStatus === "awaiting_triage";
        case "pending":
          return item.percolationStatus === "pending_route";
        case "failed":
          return item.percolationStatus === "route_failed";
        case "percolated":
          return item.percolationStatus === "percolated";
        case "hermes":
          return item.source === "hermes_message";
        default:
          return true;
      }
    });
  }, [filter, inbox]);

  const setFilter = useCallback((nextFilter: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (nextFilter === "all") {
        next.delete("filter");
      } else {
        next.set("filter", nextFilter);
      }
      return next;
    });
  }, [setSearchParams]);

  const selectItem = useCallback((itemId: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("item", itemId);
      return next;
    });
  }, [setSearchParams]);

  const saveDetail = useCallback(async () => {
    if (!detail) return;
    setSaving(true);
    try {
      const result = await api.updateTeamforgeIntakeItem({
        id: detail.item.id,
        title: editDraft.title,
        body: editDraft.body,
        sourceRef: editDraft.sourceRef || null,
        status: editDraft.status,
        priority: editDraft.priority,
        tags: editDraft.tags
          .split(/,|\n/)
          .map((value) => value.trim())
          .filter(Boolean),
        routing: {
          targetAgent: editDraft.targetAgent || null,
          targetDepartment: editDraft.targetDepartment || null,
          targetQueue: editDraft.targetQueue || null,
          projectCode: editDraft.projectCode || null,
          projectId: detail.item.projectId,
          clientId: detail.item.clientId,
          founderReviewRequired: editDraft.founderReviewRequired,
        },
      });
      setMessage(result.message);
      await loadInbox();
      await loadDetail(detail.item.id);
    } catch (error) {
      setMessage(`SAVE FAILED: ${String(error)}`);
    } finally {
      setSaving(false);
    }
  }, [api, detail, editDraft, loadDetail, loadInbox]);

  const routeSelected = useCallback(async () => {
    if (!detail) return;
    setRouting(true);
    try {
      const result = await api.routeTeamforgeIntakeItem(detail.item.id);
      setMessage(result.message);
      await loadInbox();
      await loadDetail(detail.item.id);
    } catch (error) {
      setMessage(`ROUTE FAILED: ${String(error)}`);
    } finally {
      setRouting(false);
    }
  }, [api, detail, loadDetail, loadInbox]);

  const ingestHermes = useCallback(async () => {
    setIngesting(true);
    setMessage(null);
    try {
      const result = await api.ingestHermesMessage({
        message: hermesDraft.message,
        sourceRef: hermesDraft.sourceRef || null,
        sender: hermesDraft.sender || null,
        autoRoute: hermesDraft.autoRoute,
      });
      setIngestResult(result);
      setMessage(result.created.message);
      setHermesDraft({
        message: "",
        sourceRef: "",
        sender: "hermes",
        autoRoute: true,
      });
      await loadInbox();
      selectItem(result.created.item.id);
      await loadDetail(result.created.item.id);
    } catch (error) {
      setMessage(`HERMES INGEST FAILED: ${String(error)}`);
    } finally {
      setIngesting(false);
    }
  }, [api, hermesDraft, loadDetail, loadInbox, selectItem]);

  if (loading) {
    return (
      <div>
        <h1 style={styles.pageTitle}>INBOX</h1>
        <div style={styles.pageTitleBar} />
        <div style={styles.summaryGrid}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={styles.pageTitle}>INBOX</h1>
      <div style={styles.pageTitleBar} />

      <div style={styles.summaryGrid}>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>AWAITING TRIAGE</div>
          <div style={{ ...styles.summaryValue, color: "var(--lcars-yellow)" }}>
            {inbox?.summary.awaitingTriageCount ?? 0}
          </div>
          <div style={styles.summaryMeta}>FOUNDER REVIEW HOLD</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>ROUTING FAILURES</div>
          <div style={{ ...styles.summaryValue, color: "var(--lcars-red)" }}>
            {inbox?.summary.routeFailedCount ?? 0}
          </div>
          <div style={styles.summaryMeta}>RETRY OR RE-ROUTE</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>PAPERCLIP QUEUE</div>
          <div style={{ ...styles.summaryValue, color: "var(--lcars-cyan)" }}>
            {founderQueue?.totalActive ?? 0}
          </div>
          <div style={styles.summaryMeta}>
            {founderQueue ? `${founderQueue.escalationBacklogCount} ESCALATIONS` : "NO LIVE SIGNAL"}
          </div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>APPROVALS</div>
          <div style={{ ...styles.summaryValue, color: "var(--lcars-orange)" }}>
            {approvalQueue?.pendingCount ?? 0}
          </div>
          <div style={styles.summaryMeta}>
            {approvalQueue ? `${approvalQueue.totalOpen} OPEN` : "NO LIVE SIGNAL"}
          </div>
        </div>
      </div>

      {message ? <div style={styles.messageBanner}>{message}</div> : null}

      <div style={styles.mainGrid}>
        <section style={styles.columnCard}>
          <div style={styles.sectionHeader}>
            <div>
              <div style={styles.sectionTitle}>HERMES INTAKE</div>
              <div style={styles.sectionSubtitle}>
                RAW MESSAGE → NORMALIZED INTAKE → ROUTE / TRIAGE
              </div>
            </div>
            <div style={styles.actionRow}>
              <ActionButton label="REFRESH" onClick={() => void refresh()} />
              <ActionButton label="OPEN AGENTS" onClick={() => navigate("/agents/hermes")} />
            </div>
          </div>
          <div style={styles.sectionDivider} />
          <div style={styles.formGrid}>
            <div style={{ ...styles.inputGroup, gridColumn: "1 / -1" }}>
              <label style={styles.inputLabel}>RAW MESSAGE</label>
              <textarea
                value={hermesDraft.message}
                onChange={(event) =>
                  setHermesDraft((current) => ({ ...current, message: event.target.value }))
                }
                style={styles.textarea}
                rows={6}
                placeholder="Paste the Telegram/Hermes request here."
              />
            </div>
            <div style={styles.inputGroup}>
              <label style={styles.inputLabel}>SOURCE REF</label>
              <input
                value={hermesDraft.sourceRef}
                onChange={(event) =>
                  setHermesDraft((current) => ({ ...current, sourceRef: event.target.value }))
                }
                style={styles.input}
                placeholder="tg://message/123"
              />
            </div>
            <div style={styles.inputGroup}>
              <label style={styles.inputLabel}>SENDER</label>
              <input
                value={hermesDraft.sender}
                onChange={(event) =>
                  setHermesDraft((current) => ({ ...current, sender: event.target.value }))
                }
                style={styles.input}
                placeholder="hermes"
              />
            </div>
          </div>
          <label style={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={hermesDraft.autoRoute}
              onChange={(event) =>
                setHermesDraft((current) => ({ ...current, autoRoute: event.target.checked }))
              }
            />
            <span>AUTO-ROUTE WHEN CONFIDENCE IS HIGH</span>
          </label>
          <div style={styles.actionRow}>
            <ActionButton
              label="INGEST HERMES MESSAGE"
              onClick={() => void ingestHermes()}
              disabled={ingesting}
              accent="primary"
            />
          </div>
          {ingestResult ? (
            <div style={styles.subtleCard}>
              <div style={styles.sectionTitle}>LAST NORMALIZATION</div>
              <div style={styles.detailMeta}>
                {ingestResult.normalization.title.toUpperCase()} · CONFIDENCE{" "}
                {Math.round(ingestResult.normalization.confidence * 100)}%
              </div>
              <div style={styles.timelineList}>
                {ingestResult.normalization.rationale.map((line) => (
                  <div key={line} style={styles.timelineRow}>
                    <div style={styles.timelineLabel}>HERMES</div>
                    <div style={styles.timelineDetail}>{line}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section style={styles.columnCard}>
          <div style={styles.sectionHeader}>
            <div>
              <div style={styles.sectionTitle}>FOUNDER TRIAGE</div>
              <div style={styles.sectionSubtitle}>CANONICAL INTAKE QUEUE</div>
            </div>
          </div>
          <div style={styles.sectionDivider} />
          <div style={styles.filterRow}>
            {["all", "review", "pending", "failed", "percolated", "hermes"].map((value) => (
              <FilterPill
                key={value}
                label={value}
                active={filter === value}
                onClick={() => setFilter(value)}
              />
            ))}
          </div>
          <div style={styles.listColumn}>
            {filteredItems.length === 0 ? (
              <div style={styles.emptyText}>NO ITEMS MATCH THE CURRENT FILTER.</div>
            ) : (
              filteredItems.map((item) => (
                <IntakeListRow
                  key={item.id}
                  item={item}
                  selected={selectedId === item.id}
                  onSelect={() => selectItem(item.id)}
                />
              ))
            )}
          </div>
        </section>

        <section style={styles.columnCard}>
          <div style={styles.sectionHeader}>
            <div>
              <div style={styles.sectionTitle}>ISSUE DETAIL</div>
              <div style={styles.sectionSubtitle}>ROUTING, PROPERTIES, AND TIMELINE</div>
            </div>
            <div style={styles.actionRow}>
              {detail &&
              (parseGitHubIssueReference(detail.item.sourceRef) ||
                parseGitHubIssueReference(detail.item.downstreamPrimaryRef) ||
                parseGitHubIssueReference(detail.item.downstreamSecondaryRef)) ? (
                <ActionButton
                  label="OPEN ISSUE"
                  onClick={() =>
                    openLinkedIssue(
                      detail.item.sourceRef ??
                        detail.item.downstreamPrimaryRef ??
                        detail.item.downstreamSecondaryRef,
                    )
                  }
                />
              ) : null}
              {detail ? <StatusPill label={detail.item.percolationStatus} /> : null}
            </div>
          </div>
          <div style={styles.sectionDivider} />
          {detailLoading ? (
            <SkeletonCard />
          ) : !detail ? (
            <div style={styles.emptyText}>SELECT AN INTAKE ITEM TO REVIEW IT.</div>
          ) : (
            <>
              <div style={styles.formGrid}>
                <div style={{ ...styles.inputGroup, gridColumn: "1 / -1" }}>
                  <label style={styles.inputLabel}>TITLE</label>
                  <input
                    value={editDraft.title}
                    onChange={(event) =>
                      setEditDraft((current) => ({ ...current, title: event.target.value }))
                    }
                    style={styles.input}
                  />
                </div>
                <div style={{ ...styles.inputGroup, gridColumn: "1 / -1" }}>
                  <label style={styles.inputLabel}>BODY</label>
                  <textarea
                    value={editDraft.body}
                    onChange={(event) =>
                      setEditDraft((current) => ({ ...current, body: event.target.value }))
                    }
                    style={styles.textarea}
                    rows={6}
                  />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.inputLabel}>STATUS</label>
                  <select
                    value={editDraft.status}
                    onChange={(event) =>
                      setEditDraft((current) => ({ ...current, status: event.target.value }))
                    }
                    style={styles.select}
                  >
                    {["new", "triage", "assigned", "blocked", "in_progress", "approval", "done", "archived"].map((status) => (
                      <option key={status} value={status}>
                        {tokenLabel(status)}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.inputLabel}>PRIORITY</label>
                  <select
                    value={editDraft.priority}
                    onChange={(event) =>
                      setEditDraft((current) => ({ ...current, priority: event.target.value }))
                    }
                    style={styles.select}
                  >
                    {["critical", "high", "medium", "low"].map((priority) => (
                      <option key={priority} value={priority}>
                        {tokenLabel(priority)}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.inputLabel}>TARGET AGENT</label>
                  <select
                    value={editDraft.targetAgent}
                    onChange={(event) =>
                      setEditDraft((current) => ({ ...current, targetAgent: event.target.value }))
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
                    value={editDraft.targetDepartment}
                    onChange={(event) =>
                      setEditDraft((current) => ({
                        ...current,
                        targetDepartment: event.target.value,
                      }))
                    }
                    style={styles.input}
                  />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.inputLabel}>TARGET QUEUE</label>
                  <input
                    value={editDraft.targetQueue}
                    onChange={(event) =>
                      setEditDraft((current) => ({ ...current, targetQueue: event.target.value }))
                    }
                    style={styles.input}
                  />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.inputLabel}>PROJECT CODE</label>
                  <input
                    value={editDraft.projectCode}
                    onChange={(event) =>
                      setEditDraft((current) => ({ ...current, projectCode: event.target.value }))
                    }
                    style={styles.input}
                  />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.inputLabel}>SOURCE REF</label>
                  <input
                    value={editDraft.sourceRef}
                    onChange={(event) =>
                      setEditDraft((current) => ({ ...current, sourceRef: event.target.value }))
                    }
                    style={styles.input}
                  />
                </div>
                <div style={{ ...styles.inputGroup, gridColumn: "1 / -1" }}>
                  <label style={styles.inputLabel}>TAGS</label>
                  <input
                    value={editDraft.tags}
                    onChange={(event) =>
                      setEditDraft((current) => ({ ...current, tags: event.target.value }))
                    }
                    style={styles.input}
                  />
                </div>
              </div>
              <label style={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={editDraft.founderReviewRequired}
                  onChange={(event) =>
                    setEditDraft((current) => ({
                      ...current,
                      founderReviewRequired: event.target.checked,
                    }))
                  }
                />
                <span>HOLD IN FOUNDER TRIAGE</span>
              </label>
              <div style={styles.actionRow}>
                <ActionButton label="SAVE" onClick={() => void saveDetail()} disabled={saving} />
                <ActionButton
                  label={
                    detail.item.percolationStatus === "percolated"
                      ? "ROUTED"
                      : detail.item.percolationStatus === "route_failed"
                        ? "RETRY ROUTE"
                        : detail.item.percolationStatus === "awaiting_triage"
                          ? "ROUTE NOW"
                          : "SEND TO PAPERCLIP"
                  }
                  onClick={() => void routeSelected()}
                  disabled={routing || detail.item.percolationStatus === "percolated"}
                  accent="primary"
                />
              </div>
              <div style={styles.subtleCard}>
                <div style={styles.sectionTitle}>TIMELINE</div>
                <div style={styles.timelineList}>
                  {detail.timeline.map((event) => (
                    <div key={event.key} style={styles.timelineRow}>
                      <div style={styles.timelineLabel}>
                        {event.label}
                        <div style={styles.timelineTime}>{formatDateTime(event.occurredAt)}</div>
                      </div>
                      <div style={styles.timelineDetail}>{event.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageTitle: lcarsPageStyles.pageTitle,
  pageTitleBar: lcarsPageStyles.pageTitleBar,
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
    marginBottom: 18,
  },
  summaryCard: {
    ...lcarsPageStyles.card,
    borderLeftColor: "var(--lcars-orange)",
    marginBottom: 0,
    padding: 18,
  },
  summaryLabel: {
    ...lcarsPageStyles.metricLabel,
    marginBottom: 6,
  },
  summaryValue: {
    ...lcarsPageStyles.metricValue,
    fontSize: 26,
  },
  summaryMeta: {
    marginTop: 6,
    fontSize: 11,
    color: "var(--lcars-lavender)",
    fontFamily: "'JetBrains Mono', monospace",
  },
  messageBanner: {
    ...lcarsPageStyles.subtleCard,
    borderLeftColor: "var(--lcars-yellow)",
    color: "var(--lcars-yellow)",
    marginBottom: 16,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
  },
  mainGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(320px, 1.1fr) minmax(320px, 1fr) minmax(380px, 1.2fr)",
    gap: 16,
    alignItems: "start",
  },
  columnCard: {
    ...lcarsPageStyles.card,
    borderLeftColor: "var(--lcars-cyan)",
    marginBottom: 0,
    display: "flex",
    flexDirection: "column" as const,
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
    fontSize: 11,
    color: "var(--lcars-lavender)",
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: "1px",
  },
  sectionDivider: lcarsPageStyles.sectionDivider,
  actionRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap" as const,
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
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
    minHeight: 140,
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
  filterRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap" as const,
  },
  listColumn: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
    maxHeight: "70vh",
    overflowY: "auto" as const,
    paddingRight: 4,
  },
  listRow: {
    border: "1px solid rgba(153, 153, 204, 0.14)",
    borderLeft: "4px solid rgba(153, 153, 204, 0.24)",
    background: "rgba(153, 153, 204, 0.04)",
    padding: "12px 12px 10px",
    textAlign: "left" as const,
    cursor: "pointer",
  },
  listRowHead: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "flex-start",
  },
  listRowTitle: {
    color: "var(--lcars-orange)",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.5px",
  },
  listRowMeta: {
    marginTop: 6,
    color: "var(--lcars-lavender)",
    fontSize: 10,
    fontFamily: "'JetBrains Mono', monospace",
    lineHeight: 1.5,
  },
  subtleCard: {
    ...lcarsPageStyles.subtleCard,
    borderLeftColor: "var(--lcars-orange)",
  },
  detailMeta: {
    color: "var(--lcars-tan)",
    fontSize: 11,
    lineHeight: 1.6,
    fontFamily: "'JetBrains Mono', monospace",
  },
  timelineList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
    marginTop: 10,
  },
  timelineRow: {
    display: "grid",
    gridTemplateColumns: "140px 1fr",
    gap: 12,
    padding: "8px 0",
    borderBottom: "1px solid rgba(153, 153, 204, 0.08)",
  },
  timelineLabel: {
    color: "var(--lcars-cyan)",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    letterSpacing: "1px",
  },
  timelineTime: {
    marginTop: 4,
    color: "var(--lcars-lavender)",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
  },
  timelineDetail: {
    color: "var(--lcars-tan)",
    fontSize: 11,
    lineHeight: 1.6,
  },
  emptyText: lcarsPageStyles.emptyText,
};

export default Inbox;
