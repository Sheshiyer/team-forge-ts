import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";
import { SkeletonCard, SkeletonTable } from "../components/ui/Skeleton";
import { useInvoke } from "../hooks/useInvoke";
import type { ActiveProjectIssueDetailView, ActiveProjectIssueView } from "../lib/types";

function stateColor(state: string): string {
  switch (state.trim().toLowerCase()) {
    case "open":
      return "var(--lcars-red)";
    case "closed":
      return "var(--lcars-green)";
    default:
      return "var(--lcars-lavender)";
  }
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function parseDraftList(value: string): string[] {
  return value
    .split(/,|\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function splitIssueLabels(labels: string[]) {
  const priority = labels.find((label) => label.startsWith("priority:"))?.slice("priority:".length) ?? "";
  const track = labels.find((label) => label.startsWith("track:"))?.slice("track:".length) ?? "";
  const other = labels.filter(
    (label) => !label.startsWith("priority:") && !label.startsWith("track:"),
  );
  return {
    priority,
    track,
    otherLabels: other.join(", "),
  };
}

function buildIssueLabels(priority: string, track: string, otherLabels: string): string[] {
  const labels = parseDraftList(otherLabels);
  const trimmedPriority = priority.trim();
  const trimmedTrack = track.trim();
  if (trimmedPriority) {
    labels.unshift(`priority:${trimmedPriority}`);
  }
  if (trimmedTrack) {
    labels.unshift(`track:${trimmedTrack}`);
  }
  return labels.filter((label, index) => labels.indexOf(label) === index);
}

function StatePill({ state }: { state: string }) {
  const color = stateColor(state);
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 2,
        backgroundColor: "transparent",
        border: `1px solid ${color}`,
        color,
        fontSize: 10,
        fontWeight: 600,
        fontFamily: "'Orbitron', sans-serif",
        lineHeight: "18px",
        letterSpacing: "1px",
        textTransform: "uppercase",
        boxShadow: `0 0 8px ${color}33`,
      }}
    >
      {state.toUpperCase()}
    </span>
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
      onClick={onClick}
      style={{
        ...lcarsPageStyles.ghostButton,
        padding: "4px 12px",
        fontSize: 10,
        background: active ? "rgba(255, 153, 0, 0.12)" : "rgba(10, 10, 20, 0.68)",
        border: `1px solid ${active ? "var(--lcars-orange)" : "rgba(153, 153, 204, 0.25)"}`,
        color: active ? "var(--lcars-orange)" : "var(--lcars-lavender)",
      }}
    >
      {label.toUpperCase()}
    </button>
  );
}

function matchesIssueProjectFilter(issue: ActiveProjectIssueView, filter: string | null): boolean {
  const normalized = filter?.trim().toLowerCase();
  if (!normalized) return true;
  return (
    issue.projectName.trim().toLowerCase() === normalized ||
    issue.projectId?.trim().toLowerCase() === normalized
  );
}

function matchesIssueClientFilter(issue: ActiveProjectIssueView, filter: string | null): boolean {
  const normalized = filter?.trim().toLowerCase();
  if (!normalized) return true;
  return (
    issue.clientName?.trim().toLowerCase() === normalized ||
    issue.clientId?.trim().toLowerCase() === normalized
  );
}

type ProjectIssueGroup = {
  key: string;
  projectName: string;
  clientName: string | null;
  repoSet: string[];
  issues: ActiveProjectIssueView[];
};

function sortActiveIssues(issues: ActiveProjectIssueView[]): ActiveProjectIssueView[] {
  return [...issues].sort((left, right) => {
    const projectOrder = left.projectName.localeCompare(right.projectName);
    if (projectOrder !== 0) return projectOrder;
    const leftOpen = left.state.trim().toLowerCase() === "open";
    const rightOpen = right.state.trim().toLowerCase() === "open";
    if (leftOpen !== rightOpen) {
      return leftOpen ? -1 : 1;
    }
    return (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "");
  });
}

function IssueDetailPane({
  detail,
  loading,
  commenting,
  updating,
  relationSaving,
  onCreateComment,
  onUpdateIssue,
  onCreateSubIssue,
  onDeleteRelation,
}: {
  detail: ActiveProjectIssueDetailView | null;
  loading: boolean;
  commenting: boolean;
  updating: boolean;
  relationSaving: boolean;
  onCreateComment: (body: string) => Promise<void>;
  onUpdateIssue: (input: {
    title: string;
    body: string;
    state: string;
    priority: string;
    track: string;
    otherLabels: string;
    assignees: string;
  }) => Promise<void>;
  onCreateSubIssue: (reference: string) => Promise<void>;
  onDeleteRelation: (id: number) => Promise<void>;
}) {
  const [commentDraft, setCommentDraft] = useState("");
  const [relationDraft, setRelationDraft] = useState("");
  const [propertyDraft, setPropertyDraft] = useState({
    title: "",
    body: "",
    state: "open",
    priority: "",
    track: "",
    otherLabels: "",
    assignees: "",
  });

  useEffect(() => {
    setCommentDraft("");
    setRelationDraft("");
    if (!detail) {
      setPropertyDraft({
        title: "",
        body: "",
        state: "open",
        priority: "",
        track: "",
        otherLabels: "",
        assignees: "",
      });
      return;
    }
    const labels = splitIssueLabels(detail.issue.labels);
    setPropertyDraft({
      title: detail.issue.title,
      body: detail.bodyMarkdown ?? detail.bodyExcerpt ?? "",
      state: detail.issue.state,
      priority: labels.priority,
      track: labels.track,
      otherLabels: labels.otherLabels,
      assignees: detail.issue.assignees.join(", "),
    });
  }, [
    detail?.bodyExcerpt,
    detail?.bodyMarkdown,
    detail?.issue.assignees,
    detail?.issue.id,
    detail?.issue.labels,
    detail?.issue.state,
    detail?.issue.title,
  ]);

  if (loading) {
    return <SkeletonCard />;
  }

  if (!detail) {
    return <div style={styles.emptyText}>SELECT AN ISSUE TO INSPECT ITS DETAIL SURFACE.</div>;
  }

  return (
    <div style={styles.detailColumn}>
      <div style={styles.detailHeader}>
        <div>
          <div style={styles.detailTitle}>
            #{detail.issue.number} {detail.issue.title.toUpperCase()}
          </div>
          <div style={styles.detailMeta}>
            {detail.issue.projectName.toUpperCase()} · {detail.issue.repo}
            {detail.issue.clientName ? ` · ${detail.issue.clientName.toUpperCase()}` : ""}
          </div>
        </div>
        <StatePill state={detail.issue.state} />
      </div>

      <div style={styles.detailGrid}>
        <div>
          <div style={styles.detailLabel}>TRACK</div>
          <div style={styles.detailValue}>{detail.issue.track?.toUpperCase() ?? "—"}</div>
        </div>
        <div>
          <div style={styles.detailLabel}>PRIORITY</div>
          <div style={styles.detailValue}>{detail.issue.priority?.toUpperCase() ?? "—"}</div>
        </div>
        <div>
          <div style={styles.detailLabel}>ASSIGNEES</div>
          <div style={styles.detailValue}>
            {detail.issue.assignees.length > 0 ? detail.issue.assignees.join(", ") : "UNASSIGNED"}
          </div>
        </div>
        <div>
          <div style={styles.detailLabel}>UPDATED</div>
          <div style={styles.detailValueMono}>{formatDateTime(detail.issue.updatedAt)}</div>
        </div>
      </div>

      <div style={styles.detailSection}>
        <div style={styles.detailLabel}>LABELS</div>
        <div style={styles.tagRow}>
          {detail.issue.labels.length > 0 ? (
            detail.issue.labels.map((label) => <span key={label} style={styles.tag}>{label}</span>)
          ) : (
            <span style={styles.mutedText}>NO LABELS</span>
          )}
        </div>
      </div>

      <div style={styles.detailSection}>
        <div style={styles.detailLabel}>EDIT PROPERTIES</div>
        <div style={styles.composerBox}>
          <div style={styles.formGrid}>
            <div style={styles.detailSection}>
              <div style={styles.composerLabel}>TITLE</div>
              <input
                value={propertyDraft.title}
                onChange={(event) =>
                  setPropertyDraft((current) => ({ ...current, title: event.target.value }))
                }
                style={styles.input}
              />
            </div>

            <div style={styles.detailSection}>
              <div style={styles.composerLabel}>STATE</div>
              <select
                value={propertyDraft.state}
                onChange={(event) =>
                  setPropertyDraft((current) => ({ ...current, state: event.target.value }))
                }
                style={styles.select}
              >
                <option value="open">OPEN</option>
                <option value="closed">CLOSED</option>
              </select>
            </div>

            <div style={styles.detailSection}>
              <div style={styles.composerLabel}>PRIORITY LABEL</div>
              <input
                value={propertyDraft.priority}
                onChange={(event) =>
                  setPropertyDraft((current) => ({ ...current, priority: event.target.value }))
                }
                placeholder="p0, p1, high, critical"
                style={styles.input}
              />
            </div>

            <div style={styles.detailSection}>
              <div style={styles.composerLabel}>TRACK LABEL</div>
              <input
                value={propertyDraft.track}
                onChange={(event) =>
                  setPropertyDraft((current) => ({ ...current, track: event.target.value }))
                }
                placeholder="backend, ops, launch"
                style={styles.input}
              />
            </div>
          </div>

          <div style={styles.detailSection}>
            <div style={styles.composerLabel}>BODY</div>
            <textarea
              value={propertyDraft.body}
              onChange={(event) =>
                setPropertyDraft((current) => ({ ...current, body: event.target.value }))
              }
              style={styles.textarea}
            />
          </div>

          <div style={styles.formGrid}>
            <div style={styles.detailSection}>
              <div style={styles.composerLabel}>ASSIGNEES</div>
              <input
                value={propertyDraft.assignees}
                onChange={(event) =>
                  setPropertyDraft((current) => ({ ...current, assignees: event.target.value }))
                }
                placeholder="login1, login2"
                style={styles.input}
              />
            </div>

            <div style={styles.detailSection}>
              <div style={styles.composerLabel}>OTHER LABELS</div>
              <input
                value={propertyDraft.otherLabels}
                onChange={(event) =>
                  setPropertyDraft((current) => ({ ...current, otherLabels: event.target.value }))
                }
                placeholder="type:bug, area:agent, release:next"
                style={styles.input}
              />
            </div>
          </div>

          <div style={styles.hintText}>
            PRIORITY AND TRACK ARE STORED AS <code>priority:*</code> AND <code>track:*</code> LABELS.
          </div>

          <div style={styles.buttonRow}>
            <button
              type="button"
              onClick={() => void onUpdateIssue(propertyDraft)}
              style={lcarsPageStyles.primaryButton}
              disabled={updating || !propertyDraft.title.trim()}
            >
              {updating ? "SAVING..." : "SAVE ISSUE"}
            </button>
          </div>
        </div>
      </div>

      <div style={styles.detailSection}>
        <div style={styles.detailLabel}>BODY</div>
        <div style={styles.detailNarrative}>
          {detail.bodyMarkdown?.trim()
            || detail.bodyExcerpt?.trim()
            || "NO ISSUE BODY IS AVAILABLE FROM CACHE OR LIVE GITHUB."}
        </div>
      </div>

      <div style={styles.detailSection}>
        <div style={styles.detailLabel}>ATTACHMENTS</div>
        <div style={styles.linkList}>
          {detail.bodyAttachments.length > 0 ? (
            detail.bodyAttachments.map((attachment) => (
              <a
                key={attachment.url}
                href={attachment.url}
                target="_blank"
                rel="noopener noreferrer"
                style={styles.attachmentLink}
              >
                {attachment.label}
              </a>
            ))
          ) : (
            <span style={styles.mutedText}>NO BODY ATTACHMENTS DETECTED.</span>
          )}
        </div>
      </div>

      <div style={styles.detailSection}>
        <div style={styles.detailLabel}>SUB-ISSUES</div>
        <div style={styles.relatedList}>
          {detail.parentIssues.length > 0 ? (
            detail.parentIssues.map((issue) => (
              <div key={`parent-${issue.relationId}`} style={styles.relatedRow}>
                <a href={issue.url} target="_blank" rel="noopener noreferrer" style={styles.relatedLink}>
                  PARENT · {issue.repo}#{issue.number} · {issue.title}
                </a>
                <button type="button" onClick={() => void onDeleteRelation(issue.relationId)} style={styles.inlineAction}>
                  REMOVE
                </button>
              </div>
            ))
          ) : null}
          {detail.subIssues.length > 0 ? (
            detail.subIssues.map((issue) => (
              <div key={`child-${issue.relationId}`} style={styles.relatedRow}>
                <a href={issue.url} target="_blank" rel="noopener noreferrer" style={styles.relatedLink}>
                  CHILD · {issue.repo}#{issue.number} · {issue.title}
                </a>
                <button type="button" onClick={() => void onDeleteRelation(issue.relationId)} style={styles.inlineAction}>
                  REMOVE
                </button>
              </div>
            ))
          ) : null}
          {detail.parentIssues.length === 0 && detail.subIssues.length === 0 ? (
            <span style={styles.mutedText}>NO SUB-ISSUE RELATIONSHIPS YET.</span>
          ) : null}
        </div>

        <div style={styles.composerBox}>
          <div style={styles.composerLabel}>ADD CHILD ISSUE</div>
          <input
            value={relationDraft}
            onChange={(event) => setRelationDraft(event.target.value)}
            placeholder="owner/repo#123 or #123 for current repo"
            style={styles.input}
          />
          <div style={styles.buttonRow}>
            <button
              type="button"
              onClick={() => void onCreateSubIssue(relationDraft)}
              style={lcarsPageStyles.ghostButton}
              disabled={relationSaving || !relationDraft.trim()}
            >
              {relationSaving ? "LINKING..." : "LINK SUB-ISSUE"}
            </button>
          </div>
        </div>
      </div>

      <div style={styles.detailSection}>
        <div style={styles.detailLabel}>COMMENTS</div>
        {detail.liveDataError ? (
          <div style={{ ...styles.mutedText, color: "var(--lcars-yellow)" }}>
            LIVE GITHUB DETAIL PARTIAL: {detail.liveDataError}
          </div>
        ) : null}
        <div style={styles.commentList}>
          {detail.comments.length > 0 ? (
            detail.comments.map((comment) => (
              <div key={comment.id} style={styles.commentCard}>
                <div style={styles.commentMeta}>
                  <span>{comment.authorLogin?.toUpperCase() || "UNKNOWN"}</span>
                  <span>{formatDateTime(comment.updatedAt || comment.createdAt)}</span>
                </div>
                <div style={styles.detailNarrative}>{comment.body || "EMPTY COMMENT"}</div>
                <div style={styles.linkList}>
                  {comment.attachments.map((attachment) => (
                    <a
                      key={`${comment.id}-${attachment.url}`}
                      href={attachment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={styles.attachmentLink}
                    >
                      {attachment.label}
                    </a>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div style={styles.mutedText}>NO LIVE COMMENTS RETURNED.</div>
          )}
        </div>
        <div style={styles.composerBox}>
          <div style={styles.composerLabel}>POST COMMENT</div>
          <textarea
            value={commentDraft}
            onChange={(event) => setCommentDraft(event.target.value)}
            style={styles.textarea}
            placeholder="Write the GitHub issue comment to post from TeamForge."
          />
          <div style={styles.buttonRow}>
            <button
              type="button"
              onClick={() => void onCreateComment(commentDraft)}
              style={lcarsPageStyles.primaryButton}
              disabled={commenting || !commentDraft.trim()}
            >
              {commenting ? "POSTING..." : "POST COMMENT"}
            </button>
          </div>
        </div>
      </div>

      <div style={styles.detailSection}>
        <div style={styles.detailLabel}>TIMELINE</div>
        <div style={styles.timelineList}>
          {detail.timeline.length > 0 ? (
            detail.timeline.map((event) => (
              <div key={event.key} style={styles.timelineRow}>
                <div>
                  <div style={styles.timelineLabel}>{event.label}</div>
                  <div style={styles.timelineTime}>{formatDateTime(event.occurredAt)}</div>
                </div>
                <div style={styles.timelineDetail}>{event.detail}</div>
              </div>
            ))
          ) : (
            <div style={styles.mutedText}>NO ISSUE TIMELINE EVENTS ARE CACHED YET.</div>
          )}
        </div>
      </div>

      <a
        href={detail.issue.url}
        target="_blank"
        rel="noopener noreferrer"
        style={styles.detailLink}
      >
        OPEN ISSUE ↗
      </a>
    </div>
  );
}

function Issues() {
  const api = useInvoke();
  const [searchParams, setSearchParams] = useSearchParams();
  const [issues, setIssues] = useState<ActiveProjectIssueView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ActiveProjectIssueDetailView | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [relationSaving, setRelationSaving] = useState(false);
  const [detailMessage, setDetailMessage] = useState<string | null>(null);
  const [intakeSubmitting, setIntakeSubmitting] = useState(false);
  const [intakeMessage, setIntakeMessage] = useState<string | null>(null);
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

  const filterClient = searchParams.get("client");
  const filterProject = searchParams.get("project");
  const filterState = searchParams.get("state");
  const selectedIssueId = searchParams.get("issue");

  const load = useCallback(async () => {
    try {
      const data = await api.getActiveProjectIssues();
      setIssues(sortActiveIssues(data));
      setLoadError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLoadError(`ACTIVE PROJECT ISSUES UNAVAILABLE. ${message.toUpperCase()}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectIssue = useCallback((issueId: string | null) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (issueId && issueId.trim()) {
        next.set("issue", issueId);
      } else {
        next.delete("issue");
      }
      return next;
    });
  }, [setSearchParams]);

  const loadDetail = useCallback(async (issue: ActiveProjectIssueView) => {
    setDetailLoading(true);
    setDetailMessage(null);
    try {
      const view = await api.getActiveProjectIssueDetail(issue.repo, issue.number);
      setDetail(view);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, [api]);

  const createComment = useCallback(async (body: string) => {
    if (!detail || !body.trim()) return;
    setCommenting(true);
    try {
      await api.createActiveProjectIssueComment({
        repo: detail.issue.repo,
        number: detail.issue.number,
        body,
      });
      const refreshed = await api.getActiveProjectIssueDetail(detail.issue.repo, detail.issue.number);
      setDetail(refreshed);
      setDetailMessage("COMMENT POSTED TO GITHUB.");
    } catch (error) {
      setDetailMessage(`COMMENT POST FAILED. ${String(error)}`);
    } finally {
      setCommenting(false);
    }
  }, [api, detail]);

  const updateIssue = useCallback(async (input: {
    title: string;
    body: string;
    state: string;
    priority: string;
    track: string;
    otherLabels: string;
    assignees: string;
  }) => {
    if (!detail) return;
    setUpdating(true);
    try {
      const refreshed = await api.updateActiveProjectIssue({
        repo: detail.issue.repo,
        number: detail.issue.number,
        title: input.title,
        body: input.body,
        state: input.state,
        labels: buildIssueLabels(input.priority, input.track, input.otherLabels),
        assignees: parseDraftList(input.assignees),
      });
      setDetail(refreshed);
      setIssues((current) =>
        sortActiveIssues(
          current.map((issue) =>
            issue.repo === refreshed.issue.repo && issue.number === refreshed.issue.number
              ? refreshed.issue
              : issue,
          ),
        ),
      );
      setDetailMessage("ISSUE UPDATED ON GITHUB.");
    } catch (error) {
      setDetailMessage(`ISSUE UPDATE FAILED. ${String(error)}`);
    } finally {
      setUpdating(false);
    }
  }, [api, detail]);

  const createSubIssue = useCallback(async (reference: string) => {
    if (!detail || !reference.trim()) return;

    const normalized = reference.trim();
    const match = normalized.match(/^(?:(?<repo>[^#\s]+)?)#?(?<number>\d+)$/);
    if (!match?.groups?.number) {
      setDetailMessage("SUB-ISSUE FORMAT INVALID. USE owner/repo#123 OR #123.");
      return;
    }
    const repo = match.groups.repo?.trim() || detail.issue.repo;
    const number = Number(match.groups.number);
    const childEntityId = `github:${repo}:issue:${number}`;
    const parentEntityId = `github:${detail.issue.repo}:issue:${detail.issue.number}`;

    setRelationSaving(true);
    try {
      await api.upsertRelation({
        relationType: "sub_issue_of",
        sourceType: "github_issue",
        sourceId: childEntityId,
        targetType: "github_issue",
        targetId: parentEntityId,
        sourceSystem: "teamforge",
      });
      const refreshed = await api.getActiveProjectIssueDetail(detail.issue.repo, detail.issue.number);
      setDetail(refreshed);
      setDetailMessage("SUB-ISSUE LINK SAVED.");
    } catch (error) {
      setDetailMessage(`SUB-ISSUE LINK FAILED. ${String(error)}`);
    } finally {
      setRelationSaving(false);
    }
  }, [api, detail]);

  const deleteRelation = useCallback(async (id: number) => {
    if (!detail) return;
    setRelationSaving(true);
    try {
      await api.deleteRelation(id);
      const refreshed = await api.getActiveProjectIssueDetail(detail.issue.repo, detail.issue.number);
      setDetail(refreshed);
      setDetailMessage("SUB-ISSUE LINK REMOVED.");
    } catch (error) {
      setDetailMessage(`REMOVE LINK FAILED. ${String(error)}`);
    } finally {
      setRelationSaving(false);
    }
  }, [api, detail]);

  const submitIntake = useCallback(async () => {
    if (!intakeDraft.title.trim()) return;
    setIntakeSubmitting(true);
    setIntakeMessage(null);
    try {
      const result = await api.createTeamforgeIntakeItem({
        source: "teamforge_manual",
        title: intakeDraft.title,
        body: intakeDraft.body,
        status: null,
        priority: intakeDraft.priority,
        tags: parseDraftList(intakeDraft.tags),
        sourceRef: detail ? `${detail.issue.repo}#${detail.issue.number}` : null,
        createdBy: null,
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
    } catch (error) {
      setIntakeMessage(`ISSUE INTAKE FAILED. ${String(error)}`);
    } finally {
      setIntakeSubmitting(false);
    }
  }, [api, detail, intakeDraft]);

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

  const clearFilters = useCallback(() => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("client");
      next.delete("project");
      next.delete("state");
      return next;
    });
  }, [setSearchParams]);

  const clients = useMemo(
    () => [...new Set(issues.map((issue) => issue.clientName).filter(Boolean))] as string[],
    [issues],
  );

  const projects = useMemo(() => [...new Set(issues.map((issue) => issue.projectName))], [issues]);
  const states = useMemo(() => [...new Set(issues.map((issue) => issue.state))], [issues]);

  const filteredIssues = useMemo(
    () =>
      issues.filter((issue) => {
        if (!matchesIssueClientFilter(issue, filterClient)) return false;
        if (!matchesIssueProjectFilter(issue, filterProject)) return false;
        if (filterState && issue.state !== filterState) return false;
        return true;
      }),
    [issues, filterClient, filterProject, filterState],
  );

  useEffect(() => {
    if (filteredIssues.length === 0) {
      if (selectedIssueId) {
        selectIssue(null);
      }
      setDetail(null);
      return;
    }
    const selected = filteredIssues.find((issue) => issue.id === selectedIssueId);
    if (selected) {
      if (detail?.issue.id !== selected.id) {
        void loadDetail(selected);
      }
      return;
    }
    selectIssue(filteredIssues[0].id);
    void loadDetail(filteredIssues[0]);
  }, [detail?.issue.id, filteredIssues, loadDetail, selectIssue, selectedIssueId]);

  const groupedIssues = useMemo<ProjectIssueGroup[]>(() => {
    const groups = new Map<string, ProjectIssueGroup>();
    for (const issue of filteredIssues) {
      const key = issue.projectId ?? issue.projectName;
      const existing = groups.get(key);
      if (existing) {
        existing.issues.push(issue);
        if (!existing.repoSet.includes(issue.repo)) {
          existing.repoSet.push(issue.repo);
        }
      } else {
        groups.set(key, {
          key,
          projectName: issue.projectName,
          clientName: issue.clientName,
          repoSet: [issue.repo],
          issues: [issue],
        });
      }
    }

    return [...groups.values()].sort((left, right) =>
      left.projectName.localeCompare(right.projectName),
    );
  }, [filteredIssues]);

  const openCount = filteredIssues.filter((issue) => issue.state.trim().toLowerCase() === "open").length;
  const hasActiveFilters = filterClient || filterProject || filterState;

  if (loading) {
    return (
      <div>
        <h1 style={styles.pageTitle}>ISSUES</h1>
        <div style={styles.pageTitleBar} />
        <div style={styles.pageGrid}>
          <div style={styles.card}>
            <SkeletonTable rows={8} cols={5} />
          </div>
          <div style={styles.card}>
            <SkeletonCard />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={styles.pageTitle}>ISSUES</h1>
      <div style={styles.pageTitleBar} />

      <div style={styles.filterBar}>
        <div style={styles.filterGroup}>
          <div style={styles.filterLabel}>CLIENT</div>
          <div style={styles.filterPills}>
            <FilterPill label="ALL" active={filterClient === null} onClick={() => updateSearchParam("client", null)} />
            {clients.map((client) => (
              <FilterPill
                key={client}
                label={client}
                active={filterClient === client}
                onClick={() => updateSearchParam("client", filterClient === client ? null : client)}
              />
            ))}
          </div>
        </div>

        <div style={styles.filterGroup}>
          <div style={styles.filterLabel}>PROJECT</div>
          <div style={styles.filterPills}>
            <FilterPill label="ALL" active={filterProject === null} onClick={() => updateSearchParam("project", null)} />
            {projects.map((project) => (
              <FilterPill
                key={project}
                label={project}
                active={filterProject === project}
                onClick={() => updateSearchParam("project", filterProject === project ? null : project)}
              />
            ))}
          </div>
        </div>

        <div style={styles.filterGroup}>
          <div style={styles.filterLabel}>STATUS</div>
          <div style={styles.filterPills}>
            <FilterPill label="ALL" active={filterState === null} onClick={() => updateSearchParam("state", null)} />
            {states.map((state) => (
              <FilterPill
                key={state}
                label={state}
                active={filterState === state}
                onClick={() => updateSearchParam("state", filterState === state ? null : state)}
              />
            ))}
          </div>
        </div>

        {hasActiveFilters ? (
          <button
            onClick={clearFilters}
            style={{
              ...lcarsPageStyles.ghostButton,
              padding: "4px 12px",
              fontSize: 10,
              color: "var(--lcars-red)",
              border: "1px solid var(--lcars-red)",
            }}
          >
            CLEAR FILTERS
          </button>
        ) : null}
      </div>

      <div style={styles.summaryRail}>
        <div style={styles.summaryChip}>
          <span style={styles.summaryLabel}>ACTIVE PROJECTS</span>
          <span style={styles.summaryValue}>{groupedIssues.length}</span>
        </div>
        <div style={styles.summaryChip}>
          <span style={styles.summaryLabel}>VISIBLE ISSUES</span>
          <span style={styles.summaryValue}>{filteredIssues.length}</span>
        </div>
        <div style={styles.summaryChip}>
          <span style={styles.summaryLabel}>OPEN ISSUES</span>
          <span style={styles.summaryValue}>{openCount}</span>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.projectHeader}>
          <div>
            <div style={styles.sectionTitle}>NEW ISSUE INTAKE</div>
            <div style={styles.projectMeta}>
              CREATE CANONICAL TEAMFORGE WORK WITHOUT LEAVING THE ISSUES ROUTE.
            </div>
          </div>
          {detail ? (
            <button
              type="button"
              onClick={() =>
                setIntakeDraft((current) => ({
                  ...current,
                  title: current.title || `Follow-up: ${detail.issue.title}`,
                  body:
                    current.body ||
                    `Upstream issue: ${detail.issue.repo}#${detail.issue.number}\n${detail.issue.title}\n\nNext action:\n`,
                  targetQueue: current.targetQueue || "issues",
                }))
              }
              style={styles.inlineAction}
            >
              USE SELECTED ISSUE CONTEXT
            </button>
          ) : null}
        </div>
        <div style={styles.sectionDivider} />
        {intakeMessage ? (
          <div
            style={{
              ...styles.mutedText,
              color: intakeMessage.includes("FAILED") ? "var(--lcars-red)" : "var(--lcars-green)",
              marginBottom: 10,
            }}
          >
            {intakeMessage}
          </div>
        ) : null}
        <div style={styles.formGrid}>
          <div style={styles.detailSection}>
            <div style={styles.composerLabel}>TITLE</div>
            <input
              value={intakeDraft.title}
              onChange={(event) =>
                setIntakeDraft((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="Open a new issue, request, or founder task."
              style={styles.input}
            />
          </div>
          <div style={styles.detailSection}>
            <div style={styles.composerLabel}>PRIORITY</div>
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
        </div>
        <div style={styles.detailSection}>
          <div style={styles.composerLabel}>BODY</div>
          <textarea
            value={intakeDraft.body}
            onChange={(event) =>
              setIntakeDraft((current) => ({ ...current, body: event.target.value }))
            }
            placeholder="Describe the issue, origin, handoff, or requested outcome."
            style={styles.textarea}
          />
        </div>
        <div style={styles.formGrid}>
          <div style={styles.detailSection}>
            <div style={styles.composerLabel}>TARGET AGENT</div>
            <input
              value={intakeDraft.targetAgent}
              onChange={(event) =>
                setIntakeDraft((current) => ({ ...current, targetAgent: event.target.value }))
              }
              placeholder="ceo, hermes, atlas"
              style={styles.input}
            />
          </div>
          <div style={styles.detailSection}>
            <div style={styles.composerLabel}>TARGET DEPARTMENT</div>
            <input
              value={intakeDraft.targetDepartment}
              onChange={(event) =>
                setIntakeDraft((current) => ({ ...current, targetDepartment: event.target.value }))
              }
              placeholder="ops, engineering, growth"
              style={styles.input}
            />
          </div>
          <div style={styles.detailSection}>
            <div style={styles.composerLabel}>TARGET QUEUE</div>
            <input
              value={intakeDraft.targetQueue}
              onChange={(event) =>
                setIntakeDraft((current) => ({ ...current, targetQueue: event.target.value }))
              }
              placeholder="issues, approvals, founder"
              style={styles.input}
            />
          </div>
          <div style={styles.detailSection}>
            <div style={styles.composerLabel}>PROJECT CODE</div>
            <input
              value={intakeDraft.projectCode}
              onChange={(event) =>
                setIntakeDraft((current) => ({ ...current, projectCode: event.target.value }))
              }
              placeholder="AXTECH, THO, LAUNCH"
              style={styles.input}
            />
          </div>
        </div>
        <div style={styles.formGrid}>
          <div style={styles.detailSection}>
            <div style={styles.composerLabel}>TAGS</div>
            <input
              value={intakeDraft.tags}
              onChange={(event) =>
                setIntakeDraft((current) => ({ ...current, tags: event.target.value }))
              }
              placeholder="handoff, escalation, release"
              style={styles.input}
            />
          </div>
          <label style={styles.checkboxLabel}>
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
            HOLD FOR FOUNDER REVIEW
          </label>
        </div>
        <div style={styles.buttonRow}>
          <button
            type="button"
            onClick={() => void submitIntake()}
            style={lcarsPageStyles.primaryButton}
            disabled={intakeSubmitting || !intakeDraft.title.trim()}
          >
            {intakeSubmitting ? "SENDING..." : "CREATE ISSUE INTAKE"}
          </button>
        </div>
      </div>

      {loadError ? (
        <div style={styles.card}>
          <p style={styles.emptyText}>{loadError}</p>
        </div>
      ) : issues.length === 0 ? (
        <div style={styles.card}>
          <p style={styles.emptyText}>NO ACTIVE PROJECT ISSUES.</p>
        </div>
      ) : groupedIssues.length === 0 ? (
        <div style={styles.card}>
          <p style={styles.emptyText}>NO ISSUES MATCH CURRENT FILTERS.</p>
        </div>
      ) : (
        <div style={styles.pageGrid}>
          <div>
            {groupedIssues.map((group) => {
              const groupOpenCount = group.issues.filter((issue) =>
                issue.state.trim().toLowerCase() === "open",
              ).length;

              return (
                <div key={group.key} style={styles.card}>
                  <div style={styles.projectHeader}>
                    <div>
                      <h2 style={{ ...styles.sectionTitle, marginBottom: 4 }}>
                        {group.projectName.toUpperCase()}
                      </h2>
                      <div style={styles.projectMeta}>
                        {group.clientName ? `${group.clientName} · ` : ""}
                        {group.repoSet.join(" · ")}
                      </div>
                    </div>
                    <div style={styles.projectCount}>
                      {groupOpenCount} / {group.issues.length} OPEN
                    </div>
                  </div>
                  <div style={styles.sectionDivider} />

                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>ISSUE</th>
                        <th style={styles.th}>TRACK</th>
                        <th style={styles.th}>ASSIGNEES</th>
                        <th style={styles.th}>STATUS</th>
                        <th style={styles.th}>UPDATED</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.issues.map((issue) => {
                        const selected = selectedIssueId === issue.id;
                        return (
                          <tr
                            key={issue.id}
                            onClick={() => {
                              selectIssue(issue.id);
                              void loadDetail(issue);
                            }}
                            style={{
                              cursor: "pointer",
                              background: selected ? "rgba(255, 153, 0, 0.06)" : "transparent",
                            }}
                          >
                            <td
                              style={{
                                ...styles.td,
                                color: selected ? "var(--lcars-orange)" : "var(--lcars-tan)",
                                fontWeight: 600,
                              }}
                            >
                              #{issue.number} {issue.title}
                            </td>
                            <td style={styles.td}>
                              {issue.track ? (
                                <span style={styles.trackText}>{issue.track.toUpperCase()}</span>
                              ) : (
                                <span style={styles.mutedText}>—</span>
                              )}
                            </td>
                            <td style={styles.td}>
                              {issue.assignees.length > 0 ? issue.assignees.join(", ") : (
                                <span style={styles.mutedText}>UNASSIGNED</span>
                              )}
                            </td>
                            <td style={styles.td}>
                              <StatePill state={issue.state} />
                            </td>
                            <td style={styles.tdMono}>{formatDateTime(issue.updatedAt)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>

          <div style={styles.card}>
            <div style={styles.sectionTitle}>ISSUE DETAIL PANEL</div>
            <div style={styles.sectionDivider} />
            {detailMessage ? (
              <div style={{ ...styles.mutedText, color: detailMessage.includes("FAILED") ? "var(--lcars-red)" : "var(--lcars-green)", marginBottom: 10 }}>
                {detailMessage}
              </div>
            ) : null}
            <IssueDetailPane
              detail={detail}
              loading={detailLoading}
              commenting={commenting}
              updating={updating}
              relationSaving={relationSaving}
              onCreateComment={createComment}
              onUpdateIssue={updateIssue}
              onCreateSubIssue={createSubIssue}
              onDeleteRelation={deleteRelation}
            />
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageTitle: lcarsPageStyles.pageTitle,
  pageTitleBar: lcarsPageStyles.pageTitleBar,
  card: {
    ...lcarsPageStyles.card,
    borderLeftColor: "var(--lcars-cyan)",
    marginBottom: 20,
  },
  pageGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.2fr) minmax(340px, 0.9fr)",
    gap: 16,
    alignItems: "start",
  },
  sectionTitle: lcarsPageStyles.sectionTitle,
  sectionDivider: lcarsPageStyles.sectionDivider,
  table: lcarsPageStyles.table,
  th: lcarsPageStyles.th,
  td: lcarsPageStyles.td,
  tdMono: lcarsPageStyles.tdMono,
  emptyText: lcarsPageStyles.emptyText,
  filterBar: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    marginBottom: 20,
    padding: "16px 20px",
    background: "var(--bg-console-soft)",
    border: "1px solid rgba(153, 153, 204, 0.14)",
    borderLeft: "6px solid var(--lcars-cyan)",
    borderRadius: "0 18px 18px 0",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.03), 0 12px 24px rgba(0, 0, 0, 0.18)",
  },
  filterGroup: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  filterLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    fontWeight: 600,
    color: "var(--lcars-lavender)",
    letterSpacing: "1.5px",
    minWidth: 72,
    textTransform: "uppercase",
  },
  filterPills: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
  },
  summaryRail: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 20,
  },
  summaryChip: {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
    padding: "10px 14px",
    borderRadius: "0 14px 14px 0",
    borderLeft: "6px solid var(--lcars-orange)",
    background: "var(--bg-console-soft)",
    borderTop: "1px solid rgba(153, 153, 204, 0.14)",
    borderRight: "1px solid rgba(153, 153, 204, 0.14)",
    borderBottom: "1px solid rgba(153, 153, 204, 0.14)",
  },
  summaryLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    letterSpacing: "1.2px",
    color: "var(--lcars-lavender)",
  },
  summaryValue: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 18,
    color: "var(--lcars-orange)",
  },
  projectHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "center",
    marginBottom: 8,
  },
  projectMeta: {
    fontSize: 11,
    color: "var(--lcars-lavender)",
    fontFamily: "'JetBrains Mono', monospace",
  },
  projectCount: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: "var(--lcars-lavender)",
  },
  trackText: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    letterSpacing: "1px",
    color: "var(--lcars-cyan)",
  },
  mutedText: {
    color: "var(--text-quaternary)",
    fontSize: 11,
  },
  detailColumn: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 14,
  },
  detailHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
  },
  detailTitle: {
    color: "var(--lcars-orange)",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.5px",
  },
  detailMeta: {
    marginTop: 6,
    color: "var(--lcars-lavender)",
    fontSize: 10,
    fontFamily: "'JetBrains Mono', monospace",
    lineHeight: 1.6,
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 12,
  },
  detailSection: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  },
  detailLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    letterSpacing: "1px",
    color: "var(--lcars-lavender)",
    textTransform: "uppercase",
  },
  detailValue: {
    color: "var(--lcars-tan)",
    fontSize: 12,
    lineHeight: 1.5,
  },
  detailValueMono: {
    color: "var(--lcars-orange)",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
  },
  tagRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap" as const,
  },
  tag: {
    padding: "3px 8px",
    border: "1px solid rgba(0, 204, 255, 0.24)",
    color: "var(--lcars-cyan)",
    fontSize: 10,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: "1px",
  },
  detailNarrative: {
    color: "var(--lcars-tan)",
    fontSize: 12,
    lineHeight: 1.7,
    whiteSpace: "pre-wrap" as const,
  },
  relatedList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  },
  relatedRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    padding: "8px 0",
    borderBottom: "1px solid rgba(153, 153, 204, 0.08)",
  },
  relatedLink: {
    color: "var(--lcars-cyan)",
    textDecoration: "none",
    fontSize: 11,
    lineHeight: 1.6,
  },
  inlineAction: {
    ...lcarsPageStyles.ghostButton,
    padding: "4px 10px",
    fontSize: 10,
  },
  composerBox: {
    marginTop: 10,
    padding: "12px 14px",
    border: "1px solid rgba(153, 153, 204, 0.14)",
    borderLeft: "4px solid var(--lcars-orange)",
    background: "rgba(10, 10, 20, 0.55)",
    borderRadius: "0 12px 12px 0",
  },
  composerLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    color: "var(--lcars-orange)",
    letterSpacing: "1px",
    marginBottom: 8,
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
  },
  input: {
    ...lcarsPageStyles.input,
  },
  select: {
    ...lcarsPageStyles.input,
    appearance: "none" as const,
  },
  textarea: {
    width: "100%",
    minHeight: 110,
    resize: "vertical" as const,
    background: "rgba(10, 10, 20, 0.84)",
    border: "1px solid rgba(153, 153, 204, 0.18)",
    borderLeft: "4px solid rgba(255, 153, 0, 0.3)",
    color: "var(--lcars-tan)",
    padding: "10px 12px",
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    borderRadius: "0 12px 12px 0",
  },
  hintText: {
    marginTop: 8,
    color: "var(--lcars-lavender)",
    fontSize: 10,
    lineHeight: 1.6,
    fontFamily: "'JetBrains Mono', monospace",
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "var(--lcars-lavender)",
    fontSize: 10,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: "1px",
    textTransform: "uppercase",
  },
  buttonRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 10,
    marginTop: 10,
  },
  commentList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  },
  commentCard: {
    padding: "10px 12px",
    border: "1px solid rgba(153, 153, 204, 0.14)",
    borderRadius: "0 12px 12px 0",
    background: "rgba(0, 0, 0, 0.16)",
  },
  commentMeta: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 8,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    color: "var(--lcars-lavender)",
  },
  linkList: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 8,
    marginTop: 6,
  },
  attachmentLink: {
    color: "var(--lcars-cyan)",
    fontSize: 11,
    textDecoration: "none",
  },
  timelineList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  },
  timelineRow: {
    display: "grid",
    gridTemplateColumns: "130px 1fr",
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
  detailLink: {
    color: "var(--lcars-cyan)",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 11,
    letterSpacing: "1px",
    textDecoration: "none",
  },
};

export default Issues;
