import { useCallback, useEffect, useState } from "react";
import type React from "react";
import { useInvoke } from "../hooks/useInvoke";
import { exportCsv } from "../lib/export";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";
import { SkeletonCard, SkeletonTable } from "../components/ui/Skeleton";
import type {
  ExecutionProjectView,
  TeamforgeProjectControlPlane,
  TeamforgeProjectGraph,
  TeamforgeProjectInput,
  TeamforgeSyncEntityMapping,
} from "../lib/types";

type Mode = "execution" | "control";

interface RegistryDraft {
  id?: string;
  name: string;
  slug: string;
  portfolioName: string;
  clientName: string;
  projectType: string;
  status: string;
  syncMode: string;
  githubReposText: string;
  hulyLinksText: string;
  artifactsText: string;
  issuesEnabled: boolean;
  milestonesEnabled: boolean;
  componentsEnabled: boolean;
  templatesEnabled: boolean;
  issueOwnershipMode: string;
  engineeringSource: string;
  executionSource: string;
  milestoneAuthority: string;
  issueClassificationMode: string;
  directionMode: string;
}

const EMPTY_DRAFT: RegistryDraft = {
  name: "",
  slug: "",
  portfolioName: "",
  clientName: "",
  projectType: "",
  status: "active",
  syncMode: "hybrid",
  githubReposText: "",
  hulyLinksText: "",
  artifactsText: "",
  issuesEnabled: true,
  milestonesEnabled: true,
  componentsEnabled: false,
  templatesEnabled: false,
  issueOwnershipMode: "split",
  engineeringSource: "github",
  executionSource: "huly",
  milestoneAuthority: "github",
  issueClassificationMode: "hybrid",
  directionMode: "review_gate",
};

function Projects() {
  const api = useInvoke();
  const [mode, setMode] = useState<Mode>("execution");

  const [projects, setProjects] = useState<ExecutionProjectView[]>([]);
  const [executionLoading, setExecutionLoading] = useState(true);
  const [executionLoadedOnce, setExecutionLoadedOnce] = useState(false);

  const [teamforgeProjects, setTeamforgeProjects] = useState<TeamforgeProjectGraph[]>([]);
  const [registryLoading, setRegistryLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [controlPlane, setControlPlane] = useState<TeamforgeProjectControlPlane | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [draft, setDraft] = useState<RegistryDraft>(EMPTY_DRAFT);
  const [controlMessage, setControlMessage] = useState<string | null>(null);
  const [savingRegistry, setSavingRegistry] = useState(false);
  const [runningAction, setRunningAction] = useState<string | null>(null);

  const loadExecution = useCallback(async (): Promise<boolean> => {
    try {
      setProjects(await api.getExecutionProjects());
      setExecutionLoadedOnce(true);
      setExecutionLoading(false);
      return true;
    } catch {
      if (executionLoadedOnce) {
        setExecutionLoading(false);
      } else {
        setExecutionLoading(true);
      }
      return false;
    }
  }, [api, executionLoadedOnce]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
      if (cancelled) return;
      const ok = await loadExecution();
      if (cancelled) return;
      timer = setTimeout(run, ok ? 60_000 : 2_000);
    };

    run();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [loadExecution]);

  const loadRegistry = useCallback(async () => {
    setRegistryLoading(true);
    try {
      const graphs = await api.getTeamforgeProjects();
      setTeamforgeProjects(graphs);
      setSelectedProjectId((current) => {
        if (current && graphs.some((graph) => graph.project.id === current)) {
          return current;
        }
        return graphs[0]?.project.id ?? null;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load TeamForge registry.";
      setControlMessage(message);
    } finally {
      setRegistryLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadRegistry();
  }, [loadRegistry]);

  const loadControlPlane = useCallback(async (projectId: string) => {
    setDetailLoading(true);
    try {
      const detail = await api.getTeamforgeProjectControlPlane(projectId);
      setControlPlane(detail);
      setDraft(buildDraft(detail));
      setControlMessage(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load TeamForge control plane.";
      setControlMessage(message);
      setControlPlane(null);
    } finally {
      setDetailLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (!selectedProjectId) {
      setControlPlane(null);
      setDraft(EMPTY_DRAFT);
      return;
    }
    loadControlPlane(selectedProjectId);
  }, [selectedProjectId, loadControlPlane]);

  const totalHours = projects.reduce((sum, project) => sum + project.totalHours, 0);
  const githubProjects = projects.filter((project) => project.source === "github");
  const openIssues = githubProjects.reduce((sum, project) => sum + project.openIssues, 0);
  const totalIssues = githubProjects.reduce((sum, project) => sum + project.totalIssues, 0);
  const completedIssues = githubProjects.reduce((sum, project) => sum + project.closedIssues, 0);
  const openPrs = githubProjects.reduce((sum, project) => sum + project.openPrs, 0);
  const failingChecks = githubProjects.reduce((sum, project) => sum + project.failingChecks, 0);
  const avgUtilization =
    projects.length > 0
      ? projects.reduce((sum, project) => sum + project.utilization, 0) / projects.length
      : 0;

  const controlSummary = controlPlane?.summary ?? {
    openConflicts: 0,
    mappedMilestones: 0,
    engineeringIssues: 0,
    executionIssues: 0,
    recentFailures: 0,
  };

  const selectedProject =
    teamforgeProjects.find((graph) => graph.project.id === selectedProjectId) ?? null;

  const handleExport = () => {
    const headers = [
      "Project",
      "Source",
      "Repo",
      "Milestone",
      "Status",
      "Total Issues",
      "Open Issues",
      "Closed Issues",
      "Open PRs",
      "Branches",
      "Failing Checks",
      "Total Hours",
      "Billable Hours",
      "Team Members",
      "Progress %",
    ];
    const rows = projects.map((project) => [
      project.title,
      project.source,
      project.repo ?? "",
      project.milestone ?? "",
      project.status,
      String(project.totalIssues),
      String(project.openIssues),
      String(project.closedIssues),
      String(project.openPrs),
      String(project.branches),
      String(project.failingChecks),
      project.totalHours.toFixed(2),
      project.billableHours.toFixed(2),
      String(project.teamMembers),
      (project.percentComplete * 100).toFixed(1),
    ]);
    exportCsv("projects.csv", headers, rows);
  };

  const updateDraft = <K extends keyof RegistryDraft>(key: K, value: RegistryDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const handleSaveRegistry = async () => {
    setSavingRegistry(true);
    try {
      const input: TeamforgeProjectInput = {
        id: draft.id,
        name: draft.name.trim(),
        slug: draft.slug.trim() || null,
        portfolioName: blankToNull(draft.portfolioName),
        clientName: blankToNull(draft.clientName),
        projectType: blankToNull(draft.projectType),
        status: blankToNull(draft.status),
        syncMode: blankToNull(draft.syncMode),
        githubRepos: parseGithubRepoText(draft.githubReposText),
        hulyLinks: parseHulyLinkText(draft.hulyLinksText),
        artifacts: parseArtifactText(draft.artifactsText),
        policy: {
          issuesEnabled: draft.issuesEnabled,
          milestonesEnabled: draft.milestonesEnabled,
          componentsEnabled: draft.componentsEnabled,
          templatesEnabled: draft.templatesEnabled,
          issueOwnershipMode: draft.issueOwnershipMode,
          engineeringSource: draft.engineeringSource,
          executionSource: draft.executionSource,
          milestoneAuthority: draft.milestoneAuthority,
          issueClassificationMode: draft.issueClassificationMode,
          directionMode: draft.directionMode,
        },
      };
      await api.saveTeamforgeProject(input);
      await loadRegistry();
      if (draft.id ?? selectedProjectId) {
        await loadControlPlane((draft.id ?? selectedProjectId)!);
      }
      setControlMessage("Project registry saved.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save TeamForge registry.";
      setControlMessage(message);
    } finally {
      setSavingRegistry(false);
    }
  };

  const runProjectAction = async (
    action: string,
    extra: Partial<{
      mappingId: string;
      ownershipDomain: string;
      reason: string;
      conflictId: string;
      resolutionNote: string;
    }> = {},
  ) => {
    if (!selectedProjectId) return;
    setRunningAction(action);
    try {
      const detail = await api.runTeamforgeProjectAction({
        projectId: selectedProjectId,
        action,
        actorId: "desktop-operator",
        mappingId: extra.mappingId ?? null,
        ownershipDomain: extra.ownershipDomain ?? null,
        reason: extra.reason ?? null,
        conflictId: extra.conflictId ?? null,
        resolutionNote: extra.resolutionNote ?? null,
      });
      setControlPlane(detail);
      setDraft(buildDraft(detail));
      await loadRegistry();
      setControlMessage(
        action === "sync_now"
          ? "Project sync completed."
          : action === "pause"
            ? "Project sync paused."
            : action === "resume"
              ? "Project sync resumed."
              : action === "retry"
                ? "Project sync retried."
                : "Project action applied.",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Project action failed.";
      setControlMessage(message);
    } finally {
      setRunningAction(null);
    }
  };

  const handleClassification = async (mapping: TeamforgeSyncEntityMapping, ownershipDomain: string) => {
    await runProjectAction("set_classification", {
      mappingId: mapping.id,
      ownershipDomain,
      reason:
        ownershipDomain === "engineering"
          ? "Promoted to engineering scope from the control plane."
          : "Forced to execution/admin scope from the control plane.",
    });
  };

  return (
    <div>
      <div style={styles.headerRow}>
        <h1 style={styles.pageTitle}>PROJECTS</h1>
        <div style={styles.headerActions}>
          <div style={styles.modeSwitch}>
            <button
              onClick={() => setMode("execution")}
              style={{
                ...styles.modeButton,
                ...(mode === "execution" ? styles.modeButtonActive : null),
              }}
            >
              EXECUTION
            </button>
            <button
              onClick={() => setMode("control")}
              style={{
                ...styles.modeButton,
                ...(mode === "control" ? styles.modeButtonActive : null),
              }}
            >
              CONTROL PLANE
            </button>
          </div>
          {mode === "execution" && (
            <button onClick={handleExport} style={styles.ghostBtn}>
              EXPORT CSV
            </button>
          )}
        </div>
      </div>
      <div style={styles.pageTitleBar} />

      {mode === "execution" ? (
        <>
          {executionLoading ? (
            <div style={styles.summaryRow}>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : (
            <div style={styles.summaryRow}>
              <div style={{ ...styles.summaryCard, borderLeftColor: "var(--lcars-orange)" }}>
                <div style={styles.summaryLabel}>TOTAL HOURS</div>
                <div style={styles.summaryValue}>{totalHours.toFixed(1)}H</div>
              </div>
              <div style={{ ...styles.summaryCard, borderLeftColor: "var(--lcars-cyan)" }}>
                <div style={styles.summaryLabel}>AVG UTILIZATION</div>
                <div style={styles.summaryValue}>
                  {(avgUtilization * 100).toFixed(1)}%
                </div>
              </div>
              <div style={{ ...styles.summaryCard, borderLeftColor: "var(--lcars-lavender)" }}>
                <div style={styles.summaryLabel}>GITHUB PROJECTS</div>
                <div style={styles.summaryValue}>{githubProjects.length}</div>
                <div style={styles.summaryHint}>
                  {completedIssues}/{totalIssues} ISSUES CLOSED
                </div>
              </div>
              <div style={{ ...styles.summaryCard, borderLeftColor: "var(--lcars-peach)" }}>
                <div style={styles.summaryLabel}>OPEN ISSUES</div>
                <div style={styles.summaryValue}>{openIssues}</div>
                <div style={styles.summaryHint}>
                  {openPrs} OPEN PRS · {failingChecks} FAILING CHECKS
                </div>
              </div>
            </div>
          )}

          <div style={styles.card}>
            {executionLoading ? (
              <SkeletonTable rows={5} cols={5} />
            ) : projects.length === 0 ? (
              <p style={styles.emptyText}>
                NO EXECUTION PROJECTS FOUND. SYNC GITHUB PLANS IN SETTINGS.
              </p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>PROJECT</th>
                    <th style={styles.th}>SOURCE</th>
                    <th style={styles.th}>ISSUES</th>
                    <th style={styles.th}>PRS</th>
                    <th style={styles.th}>CHECKS</th>
                    <th style={styles.th}>OPEN</th>
                    <th style={styles.th}>HOURS</th>
                    <th style={styles.th}>CREW</th>
                    <th style={{ ...styles.th, minWidth: 180 }}>PROGRESS</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((project) => (
                    <tr key={project.id}>
                      <td style={{ ...styles.td, fontWeight: 600, color: "var(--lcars-orange)" }}>
                        <div>{project.title}</div>
                        {project.repo && (
                          <div style={styles.projectSubtext}>
                            {project.repo}
                            {project.milestone ? ` · ${project.milestone}` : ""}
                          </div>
                        )}
                      </td>
                      <td style={styles.td}>
                        <SourceBadge source={project.source} />
                      </td>
                      <td style={styles.tdMono}>{project.totalIssues}</td>
                      <td style={styles.tdMono}>
                        {project.openPrs}/{project.totalPrs}
                      </td>
                      <td style={styles.tdMono}>{project.failingChecks}</td>
                      <td style={styles.tdMono}>{project.openIssues}</td>
                      <td style={styles.tdMono}>{project.totalHours.toFixed(1)}h</td>
                      <td style={styles.tdMono}>{project.teamMembers}</td>
                      <td style={styles.td}>
                        <div style={styles.progressRow}>
                          <div style={styles.barTrack}>
                            <div
                              style={{
                                ...styles.barFill,
                                width: `${Math.min(project.percentComplete * 100, 100)}%`,
                                backgroundColor: progressColor(project),
                                boxShadow: `0 0 6px ${progressColor(project)}44`,
                              }}
                            />
                          </div>
                          <span style={styles.progressLabel}>
                            {(project.percentComplete * 100).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : (
        <>
          <div style={styles.summaryRow}>
            <div style={{ ...styles.summaryCard, borderLeftColor: "var(--lcars-orange)" }}>
              <div style={styles.summaryLabel}>OPEN CONFLICTS</div>
              <div style={styles.summaryValue}>{controlSummary.openConflicts}</div>
            </div>
            <div style={{ ...styles.summaryCard, borderLeftColor: "var(--lcars-cyan)" }}>
              <div style={styles.summaryLabel}>MAPPED MILESTONES</div>
              <div style={styles.summaryValue}>{controlSummary.mappedMilestones}</div>
            </div>
            <div style={{ ...styles.summaryCard, borderLeftColor: "var(--lcars-lavender)" }}>
              <div style={styles.summaryLabel}>ENGINEERING ISSUES</div>
              <div style={styles.summaryValue}>{controlSummary.engineeringIssues}</div>
            </div>
            <div style={{ ...styles.summaryCard, borderLeftColor: "var(--lcars-peach)" }}>
              <div style={styles.summaryLabel}>EXECUTION ISSUES</div>
              <div style={styles.summaryValue}>{controlSummary.executionIssues}</div>
              <div style={styles.summaryHint}>
                {controlSummary.recentFailures} RECENT FAILURES
              </div>
            </div>
          </div>

          <div style={styles.controlGrid}>
            <div style={styles.registryRail}>
              <div style={styles.card}>
                <div style={styles.sectionLabel}>TEAMFORGE REGISTRY</div>
                {registryLoading ? (
                  <SkeletonTable rows={6} cols={1} />
                ) : teamforgeProjects.length === 0 ? (
                  <p style={styles.emptyText}>NO TEAMFORGE PROJECTS FOUND.</p>
                ) : (
                  <div style={styles.projectList}>
                    {teamforgeProjects.map((graph) => (
                      <button
                        key={graph.project.id}
                        onClick={() => setSelectedProjectId(graph.project.id)}
                        style={{
                          ...styles.projectListButton,
                          ...(selectedProjectId === graph.project.id ? styles.projectListButtonActive : null),
                        }}
                      >
                        <span>{graph.project.name}</span>
                        <span style={styles.projectListMeta}>
                          {graph.githubRepos.length} GH · {graph.hulyLinks.length} HULY
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={styles.detailRail}>
              <div style={styles.card}>
                <div style={styles.sectionLabel}>CONTROL SURFACE</div>
                {controlMessage && <div style={styles.message}>{controlMessage}</div>}
                {detailLoading ? (
                  <SkeletonTable rows={6} cols={4} />
                ) : !selectedProjectId || !selectedProject ? (
                  <p style={styles.emptyText}>SELECT A TEAMFORGE PROJECT TO MANAGE IT.</p>
                ) : (
                  <>
                    <div style={styles.actionRow}>
                      <button
                        onClick={() => runProjectAction("sync_now")}
                        style={styles.primaryButton}
                        disabled={runningAction !== null}
                      >
                        {runningAction === "sync_now" ? "SYNCING..." : "SYNC NOW"}
                      </button>
                      <button
                        onClick={() => runProjectAction("pause")}
                        style={styles.secondaryButton}
                        disabled={runningAction !== null}
                      >
                        PAUSE
                      </button>
                      <button
                        onClick={() => runProjectAction("resume")}
                        style={styles.secondaryButton}
                        disabled={runningAction !== null}
                      >
                        RESUME
                      </button>
                      <button
                        onClick={() => runProjectAction("retry")}
                        style={styles.secondaryButton}
                        disabled={runningAction !== null}
                      >
                        RETRY
                      </button>
                      <div style={styles.statusPill}>
                        {(controlPlane?.policyState.syncState ?? "active").toUpperCase()}
                      </div>
                    </div>

                    <div style={styles.registryForm}>
                      <div style={styles.fieldBlock}>
                        <label style={styles.fieldLabel}>NAME</label>
                        <input
                          value={draft.name}
                          onChange={(event) => updateDraft("name", event.target.value)}
                          style={styles.input}
                        />
                      </div>
                      <div style={styles.fieldBlock}>
                        <label style={styles.fieldLabel}>SLUG</label>
                        <input
                          value={draft.slug}
                          onChange={(event) => updateDraft("slug", event.target.value)}
                          style={styles.input}
                        />
                      </div>
                      <div style={styles.fieldBlock}>
                        <label style={styles.fieldLabel}>PORTFOLIO</label>
                        <input
                          value={draft.portfolioName}
                          onChange={(event) => updateDraft("portfolioName", event.target.value)}
                          style={styles.input}
                        />
                      </div>
                      <div style={styles.fieldBlock}>
                        <label style={styles.fieldLabel}>CLIENT</label>
                        <input
                          value={draft.clientName}
                          onChange={(event) => updateDraft("clientName", event.target.value)}
                          style={styles.input}
                        />
                      </div>
                      <div style={styles.fieldBlock}>
                        <label style={styles.fieldLabel}>TYPE</label>
                        <input
                          value={draft.projectType}
                          onChange={(event) => updateDraft("projectType", event.target.value)}
                          style={styles.input}
                        />
                      </div>
                      <div style={styles.fieldBlock}>
                        <label style={styles.fieldLabel}>STATUS</label>
                        <select
                          value={draft.status}
                          onChange={(event) => updateDraft("status", event.target.value)}
                          style={styles.select}
                        >
                          <option value="active">ACTIVE</option>
                          <option value="paused">PAUSED</option>
                          <option value="archived">ARCHIVED</option>
                        </select>
                      </div>
                      <div style={styles.fieldBlock}>
                        <label style={styles.fieldLabel}>SYNC MODE</label>
                        <select
                          value={draft.syncMode}
                          onChange={(event) => updateDraft("syncMode", event.target.value)}
                          style={styles.select}
                        >
                          <option value="manual">MANUAL</option>
                          <option value="scheduled">SCHEDULED</option>
                          <option value="event-driven">EVENT-DRIVEN</option>
                          <option value="hybrid">HYBRID</option>
                        </select>
                      </div>
                      <div style={styles.fieldBlock}>
                        <label style={styles.fieldLabel}>OWNERSHIP MODE</label>
                        <select
                          value={draft.issueOwnershipMode}
                          onChange={(event) => updateDraft("issueOwnershipMode", event.target.value)}
                          style={styles.select}
                        >
                          <option value="split">SPLIT</option>
                          <option value="github">GITHUB</option>
                          <option value="huly">HULY</option>
                        </select>
                      </div>
                      <div style={styles.fieldBlock}>
                        <label style={styles.fieldLabel}>MILESTONE AUTHORITY</label>
                        <select
                          value={draft.milestoneAuthority}
                          onChange={(event) => updateDraft("milestoneAuthority", event.target.value)}
                          style={styles.select}
                        >
                          <option value="github">GITHUB</option>
                          <option value="teamforge">TEAMFORGE</option>
                          <option value="review_gate">REVIEW GATE</option>
                        </select>
                      </div>
                      <div style={styles.fieldBlock}>
                        <label style={styles.fieldLabel}>DIRECTION MODE</label>
                        <select
                          value={draft.directionMode}
                          onChange={(event) => updateDraft("directionMode", event.target.value)}
                          style={styles.select}
                        >
                          <option value="review_gate">REVIEW GATE</option>
                          <option value="github_to_huly">GITHUB TO HULY</option>
                          <option value="huly_to_github">HULY TO GITHUB</option>
                          <option value="bidirectional">BIDIRECTIONAL</option>
                        </select>
                      </div>
                      <div style={styles.fieldBlockWide}>
                        <label style={styles.fieldLabel}>GITHUB REPOS</label>
                        <textarea
                          value={draft.githubReposText}
                          onChange={(event) => updateDraft("githubReposText", event.target.value)}
                          style={styles.textarea}
                        />
                        <div style={styles.fieldHint}>One per line: `owner/repo` or `owner/repo|Display Name|primary`</div>
                      </div>
                      <div style={styles.fieldBlockWide}>
                        <label style={styles.fieldLabel}>HULY PROJECT LINKS</label>
                        <textarea
                          value={draft.hulyLinksText}
                          onChange={(event) => updateDraft("hulyLinksText", event.target.value)}
                          style={styles.textarea}
                        />
                        <div style={styles.fieldHint}>One Huly project id per line.</div>
                      </div>
                      <div style={styles.fieldBlockWide}>
                        <label style={styles.fieldLabel}>ARTIFACTS</label>
                        <textarea
                          value={draft.artifactsText}
                          onChange={(event) => updateDraft("artifactsText", event.target.value)}
                          style={styles.textarea}
                        />
                        <div style={styles.fieldHint}>One per line: `type|title|url|source`</div>
                      </div>
                    </div>

                    <div style={styles.checkboxRow}>
                      <label style={styles.checkboxLabel}>
                        <input
                          type="checkbox"
                          checked={draft.issuesEnabled}
                          onChange={(event) => updateDraft("issuesEnabled", event.target.checked)}
                        />
                        ISSUES
                      </label>
                      <label style={styles.checkboxLabel}>
                        <input
                          type="checkbox"
                          checked={draft.milestonesEnabled}
                          onChange={(event) => updateDraft("milestonesEnabled", event.target.checked)}
                        />
                        MILESTONES
                      </label>
                      <label style={styles.checkboxLabel}>
                        <input
                          type="checkbox"
                          checked={draft.componentsEnabled}
                          onChange={(event) => updateDraft("componentsEnabled", event.target.checked)}
                        />
                        COMPONENTS
                      </label>
                      <label style={styles.checkboxLabel}>
                        <input
                          type="checkbox"
                          checked={draft.templatesEnabled}
                          onChange={(event) => updateDraft("templatesEnabled", event.target.checked)}
                        />
                        TEMPLATES
                      </label>
                    </div>

                    <div style={styles.actionRow}>
                      <button
                        onClick={handleSaveRegistry}
                        style={styles.primaryButton}
                        disabled={savingRegistry}
                      >
                        {savingRegistry ? "SAVING..." : "SAVE REGISTRY"}
                      </button>
                      <div style={styles.statusText}>
                        LAST SYNC: {controlPlane?.policyState.lastSyncAt ?? "NEVER"}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div style={styles.card}>
                <div style={styles.sectionLabel}>ENTITY MAPPINGS</div>
                {!controlPlane ? (
                  <p style={styles.emptyText}>NO PROJECT DETAIL LOADED.</p>
                ) : controlPlane.entityMappings.length === 0 ? (
                  <p style={styles.emptyText}>NO MAPPINGS YET. RUN SYNC TO BUILD THE CONTROL PLANE.</p>
                ) : (
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>TITLE</th>
                        <th style={styles.th}>TYPE</th>
                        <th style={styles.th}>OWNER</th>
                        <th style={styles.th}>STATUS</th>
                        <th style={styles.th}>REFS</th>
                        <th style={styles.th}>ACTION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {controlPlane.entityMappings.map((mapping) => (
                        <tr key={mapping.id}>
                          <td style={styles.td}>
                            <div style={{ color: "var(--lcars-orange)" }}>{mapping.title}</div>
                            <div style={styles.projectSubtext}>
                              {mapping.classificationSource}
                              {mapping.classificationReason ? ` · ${mapping.classificationReason}` : ""}
                            </div>
                          </td>
                          <td style={styles.tdMono}>{mapping.entityType}</td>
                          <td style={styles.tdMono}>{mapping.ownershipDomain}</td>
                          <td style={styles.tdMono}>{mapping.mappingStatus}</td>
                          <td style={styles.tdMono}>
                            {mapping.githubRepo && mapping.githubNumber
                              ? `${mapping.githubRepo}#${mapping.githubNumber}`
                              : mapping.hulyEntityId ?? "—"}
                          </td>
                          <td style={styles.td}>
                            {mapping.entityType === "issue" && (
                              <div style={styles.inlineActions}>
                                <button
                                  onClick={() => handleClassification(mapping, "engineering")}
                                  style={styles.miniButton}
                                  disabled={runningAction !== null}
                                >
                                  ENGINEER
                                </button>
                                <button
                                  onClick={() => handleClassification(mapping, "execution_admin")}
                                  style={styles.miniButton}
                                  disabled={runningAction !== null}
                                >
                                  EXECUTE
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div style={styles.card}>
                <div style={styles.sectionLabel}>CONFLICT INBOX</div>
                {!controlPlane ? (
                  <p style={styles.emptyText}>NO CONFLICT DATA LOADED.</p>
                ) : controlPlane.conflicts.length === 0 ? (
                  <p style={styles.emptyText}>NO OPEN OR RECENT CONFLICTS.</p>
                ) : (
                  <div style={styles.stack}>
                    {controlPlane.conflicts.map((conflict) => (
                      <div key={conflict.id} style={styles.conflictCard}>
                        <div style={styles.conflictHeader}>
                          <div>
                            <div style={styles.conflictTitle}>{conflict.summary}</div>
                            <div style={styles.projectSubtext}>
                              {conflict.entityType} · {conflict.conflictType} · {conflict.status}
                            </div>
                          </div>
                          {conflict.status === "open" && (
                            <button
                              onClick={() =>
                                runProjectAction("resolve_conflict", {
                                  conflictId: conflict.id,
                                  resolutionNote: "Accepted current canonical state from control plane.",
                                })
                              }
                              style={styles.miniButton}
                              disabled={runningAction !== null}
                            >
                              RESOLVE
                            </button>
                          )}
                        </div>
                        <div style={styles.payloadRow}>
                          <pre style={styles.payloadBox}>{truncatePayload(conflict.githubPayloadJson)}</pre>
                          <pre style={styles.payloadBox}>{truncatePayload(conflict.hulyPayloadJson)}</pre>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={styles.card}>
                <div style={styles.sectionLabel}>SYNC JOURNAL</div>
                {!controlPlane ? (
                  <p style={styles.emptyText}>NO JOURNAL DATA LOADED.</p>
                ) : controlPlane.journal.length === 0 ? (
                  <p style={styles.emptyText}>NO JOURNAL ENTRIES YET.</p>
                ) : (
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>WHEN</th>
                        <th style={styles.th}>FLOW</th>
                        <th style={styles.th}>ACTION</th>
                        <th style={styles.th}>STATUS</th>
                        <th style={styles.th}>PAYLOAD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {controlPlane.journal.map((entry) => (
                        <tr key={entry.id}>
                          <td style={styles.tdMono}>{formatShortDate(entry.createdAt)}</td>
                          <td style={styles.tdMono}>
                            {entry.sourceSystem}→{entry.destinationSystem}
                          </td>
                          <td style={styles.tdMono}>{entry.action}</td>
                          <td style={styles.tdMono}>{entry.status}</td>
                          <td style={styles.td}>
                            <div style={styles.projectSubtext}>{truncateInline(entry.payloadJson)}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function buildDraft(detail: TeamforgeProjectControlPlane): RegistryDraft {
  const policy = detail.policy;
  return {
    id: detail.project.project.id,
    name: detail.project.project.name,
    slug: detail.project.project.slug ?? "",
    portfolioName: detail.project.project.portfolioName ?? "",
    clientName: detail.project.project.clientName ?? "",
    projectType: detail.project.project.projectType ?? "",
    status: detail.project.project.status,
    syncMode: detail.project.project.syncMode,
    githubReposText: detail.project.githubRepos
      .map((repo) => `${repo.repo}${repo.displayName ? `|${repo.displayName}` : ""}${repo.isPrimary ? "|primary" : ""}`)
      .join("\n"),
    hulyLinksText: detail.project.hulyLinks.map((link) => link.hulyProjectId).join("\n"),
    artifactsText: detail.project.artifacts
      .map((artifact) => `${artifact.artifactType}|${artifact.title}|${artifact.url}|${artifact.source}`)
      .join("\n"),
    issuesEnabled: policy?.issuesEnabled ?? true,
    milestonesEnabled: policy?.milestonesEnabled ?? true,
    componentsEnabled: policy?.componentsEnabled ?? false,
    templatesEnabled: policy?.templatesEnabled ?? false,
    issueOwnershipMode: policy?.issueOwnershipMode ?? "split",
    engineeringSource: policy?.engineeringSource ?? "github",
    executionSource: policy?.executionSource ?? "huly",
    milestoneAuthority: policy?.milestoneAuthority ?? "github",
    issueClassificationMode: policy?.issueClassificationMode ?? "hybrid",
    directionMode: policy?.directionMode ?? "review_gate",
  };
}

function parseGithubRepoText(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [repo, displayName, roleFlag] = line.split("|").map((part) => part.trim());
      return {
        repo,
        displayName: blankToNull(displayName),
        isPrimary: roleFlag?.toLowerCase() === "primary",
        syncIssues: true,
        syncMilestones: true,
      };
    });
}

function parseHulyLinkText(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((hulyProjectId) => ({
      hulyProjectId,
      syncIssues: true,
      syncMilestones: true,
      syncComponents: false,
      syncTemplates: false,
    }));
}

function parseArtifactText(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [artifactType, title, url, source] = line.split("|").map((part) => part.trim());
      return {
        artifactType,
        title,
        url,
        source,
        isPrimary: false,
      };
    });
}

function blankToNull(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function truncateInline(value: string | null) {
  if (!value) return "—";
  return value.length > 120 ? `${value.slice(0, 120)}...` : value;
}

function truncatePayload(value: string | null) {
  if (!value) return "—";
  return value.length > 280 ? `${value.slice(0, 280)}...` : value;
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function SourceBadge({ source }: { source: string }) {
  const isGitHub = source === "github";
  return (
    <span
      style={{
        ...styles.sourceBadge,
        borderColor: isGitHub ? "var(--lcars-cyan)" : "var(--lcars-orange)",
        color: isGitHub ? "var(--lcars-cyan)" : "var(--lcars-orange)",
      }}
    >
      {source.toUpperCase()}
    </span>
  );
}

function progressColor(project: ExecutionProjectView): string {
  if (project.totalIssues === 0) return "var(--lcars-orange)";
  if (project.openIssues === 0) return "var(--lcars-green)";
  if (project.percentComplete >= 0.5) return "var(--lcars-yellow)";
  return "var(--lcars-red)";
}

const styles: Record<string, React.CSSProperties> = {
  pageTitle: {
    ...lcarsPageStyles.pageTitle,
    marginBottom: 0,
  },
  pageTitleBar: lcarsPageStyles.pageTitleBar,
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    marginBottom: 8,
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  modeSwitch: {
    display: "flex",
    alignItems: "center",
    border: "1px solid rgba(153, 153, 204, 0.25)",
  },
  modeButton: {
    ...lcarsPageStyles.ghostButton,
    padding: "8px 14px",
    border: "none",
    borderRight: "1px solid rgba(153, 153, 204, 0.18)",
    color: "var(--text-secondary)",
  },
  modeButtonActive: {
    background: "rgba(255, 153, 0, 0.18)",
    color: "var(--lcars-orange)",
  },
  ghostBtn: {
    ...lcarsPageStyles.ghostButton,
    color: "var(--lcars-orange)",
    borderColor: "rgba(255, 153, 0, 0.28)",
    padding: "8px 14px",
  },
  summaryRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 16,
    marginBottom: 20,
  },
  summaryCard: {
    ...lcarsPageStyles.card,
    borderLeft: "8px solid var(--lcars-orange)",
    padding: 24,
  },
  summaryLabel: lcarsPageStyles.metricLabel,
  summaryValue: lcarsPageStyles.metricValue,
  summaryHint: {
    marginTop: 8,
    color: "var(--text-quaternary)",
    fontSize: 10,
    letterSpacing: "0.9px",
    fontFamily: "'Orbitron', sans-serif",
  },
  card: {
    ...lcarsPageStyles.card,
    borderLeftColor: "var(--lcars-tan)",
    marginBottom: 18,
  },
  controlGrid: {
    display: "grid",
    gridTemplateColumns: "320px minmax(0, 1fr)",
    gap: 18,
    alignItems: "start",
  },
  registryRail: {
    position: "sticky",
    top: 0,
  },
  detailRail: {
    minWidth: 0,
  },
  sectionLabel: {
    ...lcarsPageStyles.metricLabel,
    marginBottom: 12,
  },
  projectList: {
    display: "grid",
    gap: 8,
  },
  projectListButton: {
    background: "rgba(153, 153, 204, 0.06)",
    border: "1px solid rgba(153, 153, 204, 0.16)",
    color: "var(--text-primary)",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 6,
    padding: "12px 14px",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 11,
    letterSpacing: "0.7px",
    cursor: "pointer",
  },
  projectListButtonActive: {
    borderColor: "rgba(255, 153, 0, 0.35)",
    background: "rgba(255, 153, 0, 0.1)",
    color: "var(--lcars-orange)",
  },
  projectListMeta: {
    fontSize: 9,
    color: "var(--text-quaternary)",
    fontFamily: "'JetBrains Mono', monospace",
  },
  actionRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
    marginBottom: 16,
  },
  primaryButton: {
    ...lcarsPageStyles.primaryButton,
    padding: "10px 18px",
  },
  secondaryButton: {
    ...lcarsPageStyles.ghostButton,
    padding: "10px 14px",
  },
  miniButton: {
    ...lcarsPageStyles.ghostButton,
    padding: "6px 10px",
    fontSize: 10,
    color: "var(--lcars-cyan)",
    borderColor: "rgba(153, 204, 255, 0.24)",
  },
  statusPill: {
    padding: "6px 10px",
    border: "1px solid rgba(153, 204, 255, 0.2)",
    color: "var(--lcars-cyan)",
    fontSize: 10,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: "1px",
  },
  statusText: {
    color: "var(--text-secondary)",
    fontSize: 10,
    letterSpacing: "0.9px",
    fontFamily: "'Orbitron', sans-serif",
  },
  registryForm: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 12,
    marginBottom: 14,
  },
  fieldBlock: {
    display: "grid",
    gap: 6,
  },
  fieldBlockWide: {
    display: "grid",
    gap: 6,
    gridColumn: "1 / -1",
  },
  fieldLabel: {
    ...lcarsPageStyles.metricLabel,
    fontSize: 9,
  },
  input: {
    ...lcarsPageStyles.input,
    width: "100%",
  },
  select: {
    ...lcarsPageStyles.input,
    width: "100%",
  },
  textarea: {
    ...lcarsPageStyles.input,
    minHeight: 84,
    width: "100%",
    resize: "vertical",
  },
  fieldHint: {
    color: "var(--text-quaternary)",
    fontSize: 9,
    fontFamily: "'JetBrains Mono', monospace",
  },
  checkboxRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 18,
    marginBottom: 14,
  },
  checkboxLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    color: "var(--text-secondary)",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    letterSpacing: "0.8px",
  },
  table: lcarsPageStyles.table,
  th: lcarsPageStyles.th,
  td: lcarsPageStyles.td,
  tdMono: lcarsPageStyles.tdMono,
  projectSubtext: {
    marginTop: 4,
    color: "var(--text-quaternary)",
    fontSize: 10,
    fontFamily: "'JetBrains Mono', monospace",
    textTransform: "none",
  },
  sourceBadge: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 2,
    fontSize: 9,
    fontWeight: 600,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: "1px",
    border: "1px solid var(--lcars-orange)",
  },
  progressRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: 0,
    background: "rgba(153, 153, 204, 0.1)",
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 0,
    transition: "width 0.4s ease",
  },
  progressLabel: {
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    color: "var(--lcars-lavender)",
    minWidth: 40,
  },
  message: {
    marginBottom: 12,
    padding: "10px 12px",
    color: "var(--lcars-cyan)",
    background: "rgba(153, 204, 255, 0.08)",
    borderLeft: "4px solid rgba(153, 204, 255, 0.35)",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
  },
  emptyText: lcarsPageStyles.emptyText,
  inlineActions: {
    display: "flex",
    gap: 6,
  },
  stack: {
    display: "grid",
    gap: 12,
  },
  conflictCard: {
    border: "1px solid rgba(255, 153, 0, 0.18)",
    background: "rgba(255, 153, 0, 0.04)",
    padding: 14,
  },
  conflictHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    marginBottom: 10,
  },
  conflictTitle: {
    color: "var(--lcars-orange)",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 12,
    letterSpacing: "0.8px",
  },
  payloadRow: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
  },
  payloadBox: {
    margin: 0,
    padding: 10,
    background: "rgba(0, 0, 0, 0.25)",
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontSize: 10,
    fontFamily: "'JetBrains Mono', monospace",
  },
};

export default Projects;
