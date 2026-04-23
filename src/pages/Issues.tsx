import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";
import { SkeletonTable } from "../components/ui/Skeleton";
import { useInvoke } from "../hooks/useInvoke";
import type { ActiveProjectIssueView } from "../lib/types";

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
        background: active
          ? "rgba(255, 153, 0, 0.12)"
          : "rgba(10, 10, 20, 0.68)",
        border: `1px solid ${active ? "var(--lcars-orange)" : "rgba(153, 153, 204, 0.25)"}`,
        color: active ? "var(--lcars-orange)" : "var(--lcars-lavender)",
      }}
    >
      {label.toUpperCase()}
    </button>
  );
}

function IssueDetail({ issue }: { issue: ActiveProjectIssueView }) {
  return (
    <tr>
      <td colSpan={5} style={{ padding: 0 }}>
        <div style={styles.expandedRow}>
          <div style={styles.expandedGrid}>
            <div>
              <div style={styles.expandedLabel}>REPOSITORY</div>
              <div style={styles.expandedValueMono}>{issue.repo}</div>
            </div>
            <div>
              <div style={styles.expandedLabel}>LABELS</div>
              <div style={styles.expandedValue}>
                {issue.labels.length > 0 ? issue.labels.join(", ") : "—"}
              </div>
            </div>
            <div>
              <div style={styles.expandedLabel}>ASSIGNEES</div>
              <div style={styles.expandedValue}>
                {issue.assignees.length > 0 ? issue.assignees.join(", ") : "UNASSIGNED"}
              </div>
            </div>
            <div>
              <div style={styles.expandedLabel}>ISSUE LINK</div>
              <a
                href={issue.url}
                target="_blank"
                rel="noopener noreferrer"
                style={styles.expandedLink}
              >
                OPEN ISSUE ↗
              </a>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

type ProjectIssueGroup = {
  key: string;
  projectName: string;
  clientName: string | null;
  repoSet: string[];
  issues: ActiveProjectIssueView[];
};

function Issues() {
  const api = useInvoke();
  const [issues, setIssues] = useState<ActiveProjectIssueView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterClient, setFilterClient] = useState<string | null>(null);
  const [filterProject, setFilterProject] = useState<string | null>(null);
  const [filterState, setFilterState] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getActiveProjectIssues();
      setIssues(data);
      setLoadError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLoadError(
        `ACTIVE PROJECT ISSUES UNAVAILABLE. ${message.toUpperCase()}`,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const clients = useMemo(
    () =>
      [...new Set(issues.map((issue) => issue.clientName).filter(Boolean))] as string[],
    [issues],
  );

  const projects = useMemo(
    () => [...new Set(issues.map((issue) => issue.projectName))],
    [issues],
  );

  const states = useMemo(
    () => [...new Set(issues.map((issue) => issue.state))],
    [issues],
  );

  const filteredIssues = useMemo(
    () =>
      issues.filter((issue) => {
        if (filterClient && issue.clientName !== filterClient) return false;
        if (filterProject && issue.projectName !== filterProject) return false;
        if (filterState && issue.state !== filterState) return false;
        return true;
      }),
    [issues, filterClient, filterProject, filterState],
  );

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

  const openCount = filteredIssues.filter((issue) =>
    issue.state.trim().toLowerCase() === "open",
  ).length;

  const hasActiveFilters = filterClient || filterProject || filterState;

  if (loading) {
    return (
      <div>
        <h1 style={styles.pageTitle}>ISSUES</h1>
        <div style={styles.pageTitleBar} />
        <div style={styles.card}>
          <SkeletonTable rows={8} cols={5} />
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
            <FilterPill
              label="ALL"
              active={filterClient === null}
              onClick={() => setFilterClient(null)}
            />
            {clients.map((client) => (
              <FilterPill
                key={client}
                label={client}
                active={filterClient === client}
                onClick={() => setFilterClient(filterClient === client ? null : client)}
              />
            ))}
          </div>
        </div>

        <div style={styles.filterGroup}>
          <div style={styles.filterLabel}>PROJECT</div>
          <div style={styles.filterPills}>
            <FilterPill
              label="ALL"
              active={filterProject === null}
              onClick={() => setFilterProject(null)}
            />
            {projects.map((project) => (
              <FilterPill
                key={project}
                label={project}
                active={filterProject === project}
                onClick={() => setFilterProject(filterProject === project ? null : project)}
              />
            ))}
          </div>
        </div>

        <div style={styles.filterGroup}>
          <div style={styles.filterLabel}>STATUS</div>
          <div style={styles.filterPills}>
            <FilterPill
              label="ALL"
              active={filterState === null}
              onClick={() => setFilterState(null)}
            />
            {states.map((state) => (
              <FilterPill
                key={state}
                label={state}
                active={filterState === state}
                onClick={() => setFilterState(filterState === state ? null : state)}
              />
            ))}
          </div>
        </div>

        {hasActiveFilters && (
          <button
            onClick={() => {
              setFilterClient(null);
              setFilterProject(null);
              setFilterState(null);
            }}
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
        )}
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

      {loadError ? (
        <div style={styles.card}>
          <p style={styles.emptyText}>{loadError}</p>
        </div>
      ) : issues.length === 0 ? (
        <div style={styles.card}>
          <p style={styles.emptyText}>
            NO ACTIVE PROJECT ISSUES.
          </p>
        </div>
      ) : groupedIssues.length === 0 ? (
        <div style={styles.card}>
          <p style={styles.emptyText}>NO ISSUES MATCH CURRENT FILTERS.</p>
        </div>
      ) : (
        groupedIssues.map((group) => {
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
                    const isExpanded = expandedId === issue.id;
                    return (
                      <Fragment key={issue.id}>
                        <tr
                          onClick={() => setExpandedId(isExpanded ? null : issue.id)}
                          style={{
                            cursor: "pointer",
                            background: isExpanded
                              ? "rgba(255, 153, 0, 0.04)"
                              : "transparent",
                          }}
                        >
                          <td
                            style={{
                              ...styles.td,
                              color: "var(--lcars-orange)",
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
                            {issue.assignees.length > 0 ? (
                              issue.assignees.join(", ")
                            ) : (
                              <span style={styles.mutedText}>UNASSIGNED</span>
                            )}
                          </td>
                          <td style={styles.td}>
                            <StatePill state={issue.state} />
                          </td>
                          <td style={styles.tdMono}>
                            {issue.updatedAt
                              ? new Date(issue.updatedAt).toLocaleDateString()
                              : "—"}
                          </td>
                        </tr>
                        {isExpanded && <IssueDetail issue={issue} />}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })
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
  },
  expandedRow: {
    background: "rgba(0, 204, 255, 0.03)",
    borderLeft: "4px solid var(--lcars-cyan)",
    padding: "14px 20px",
    borderBottom: "1px solid rgba(153, 153, 204, 0.08)",
  },
  expandedGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 16,
  },
  expandedLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    color: "var(--lcars-lavender)",
    letterSpacing: "1px",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  expandedValue: {
    color: "var(--lcars-tan)",
    fontSize: 12,
    lineHeight: 1.5,
  },
  expandedValueMono: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    color: "var(--lcars-orange)",
  },
  expandedLink: {
    color: "var(--lcars-cyan)",
    fontSize: 11,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: "1px",
    textDecoration: "none",
  },
};

export default Issues;
