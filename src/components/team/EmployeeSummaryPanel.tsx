import type React from "react";
import Avatar from "../ui/Avatar";
import { lcarsPageStyles } from "../../lib/lcarsPageStyles";
import { useViewportWidth } from "../../hooks/useViewportWidth";
import type { Employee, EmployeeSummaryView } from "../../lib/types";

type EmployeeSummaryPanelProps = {
  employees: Employee[];
  selectedEmployeeId: string;
  onSelectEmployee: (employeeId: string) => void;
  summary: EmployeeSummaryView | null;
  loading: boolean;
  error: string | null;
};

function formatDate(value: string | null): string {
  if (!value) return "--";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value: string | null): string {
  if (!value) return "--";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function stripMarkdown(value: string): string {
  return value.replace(/\*\*/g, "").replace(/`/g, "").trim();
}

function toneForKpiStatus(
  status: EmployeeSummaryView["kpiStatus"]["status"],
): "good" | "warn" | "info" | "neutral" {
  switch (status) {
    case "onTrack":
      return "good";
    case "watch":
      return "info";
    case "drift":
      return "warn";
    case "missingInputs":
      return "neutral";
  }
}

function humanizeSignalCode(value: string): string {
  return value.replace(/[-_]/g, " ").toUpperCase();
}

function MetricTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div style={{ ...styles.metricTile, borderLeftColor: accent }}>
      <div style={styles.metricLabel}>{label}</div>
      <div style={{ ...styles.metricValue, color: accent }}>{value}</div>
    </div>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "good" | "warn" | "info" | "neutral";
}) {
  const colorByTone = {
    good: "var(--lcars-green)",
    warn: "var(--lcars-orange)",
    info: "var(--lcars-cyan)",
    neutral: "var(--lcars-lavender)",
  } satisfies Record<typeof tone, string>;
  const backgroundByTone = {
    good: "rgba(51, 204, 102, 0.08)",
    warn: "rgba(255, 153, 0, 0.08)",
    info: "rgba(0, 204, 255, 0.08)",
    neutral: "rgba(153, 153, 204, 0.08)",
  } satisfies Record<typeof tone, string>;

  const color = colorByTone[tone];
  return (
    <span
      style={{
        ...styles.statusPill,
        color,
        borderColor: color,
        background: backgroundByTone[tone],
      }}
    >
      {label}
    </span>
  );
}

function DetailList({
  title,
  emptyLabel,
  children,
}: {
  title: string;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div style={styles.detailCard}>
      <div style={styles.detailTitle}>{title}</div>
      <div style={styles.detailDivider} />
      {children ? children : <div style={styles.emptyText}>{emptyLabel}</div>}
    </div>
  );
}

export default function EmployeeSummaryPanel({
  employees,
  selectedEmployeeId,
  onSelectEmployee,
  summary,
  loading,
  error,
}: EmployeeSummaryPanelProps) {
  const viewportWidth = useViewportWidth();
  const isNarrowLayout = viewportWidth < 940;
  const isMobileLayout = viewportWidth < 760;

  const headerRowStyle = {
    ...styles.headerRow,
    flexDirection: isMobileLayout ? "column" : styles.headerRow.flexDirection,
    alignItems: isMobileLayout ? "stretch" : styles.headerRow.alignItems,
  };
  const selectorWrapStyle = {
    ...styles.selectorWrap,
    minWidth: isMobileLayout ? 0 : styles.selectorWrap.minWidth,
    flex: isMobileLayout ? "1 1 auto" : styles.selectorWrap.flex,
  };
  const identityCardStyle = {
    ...styles.identityCard,
    flexDirection: isNarrowLayout ? "column" : styles.identityCard.flexDirection,
    alignItems: isNarrowLayout ? "stretch" : styles.identityCard.alignItems,
  };
  const identityAsideStyle = {
    ...styles.identityAside,
    minWidth: isNarrowLayout ? 0 : styles.identityAside.minWidth,
    textAlign: isNarrowLayout ? "left" : styles.identityAside.textAlign,
  };
  const metricsGridStyle = {
    ...styles.metricsGrid,
    gridTemplateColumns: isMobileLayout
      ? "1fr"
      : (styles.metricsGrid.gridTemplateColumns as string),
  };
  const detailGridStyle = {
    ...styles.detailGrid,
    gridTemplateColumns: isMobileLayout
      ? "1fr"
      : (styles.detailGrid.gridTemplateColumns as string),
  };
  const kpiGridStyle = {
    ...styles.kpiGrid,
    gridTemplateColumns: isMobileLayout
      ? "1fr"
      : (styles.kpiGrid.gridTemplateColumns as string),
  };
  const detailRowStyle = {
    ...styles.detailRow,
    flexDirection: isMobileLayout ? "column" : styles.detailRow.flexDirection,
    alignItems: isMobileLayout ? "flex-start" : styles.detailRow.alignItems,
    gap: isMobileLayout ? 4 : styles.detailRow.gap,
  };
  const rolePills =
    summary?.roleLabels.length
      ? summary.roleLabels
      : summary?.vaultProfile?.role
        ? [summary.vaultProfile.role]
        : [];
  const departmentPills =
    summary?.departmentNames.length
      ? summary.departmentNames
      : summary?.vaultProfile?.department
        ? [summary.vaultProfile.department]
        : [];
  const kpiStatus = summary?.kpiStatus ?? null;
  const hasEvents = Boolean(summary?.upcomingEvents.length);
  const hasCurrentLeave = Boolean(summary?.currentLeave);
  const hasKpi = Boolean(summary?.kpiSnapshot);
  const hasVaultProfile = Boolean(summary?.vaultProfile);

  return (
    <div style={styles.card}>
      <div style={headerRowStyle}>
        <div>
          <h2 style={styles.sectionTitle}>CREW PROFILE</h2>
          <div style={styles.sectionCaption}>IDENTITY / WORKLOAD / KPI</div>
        </div>
        <div style={selectorWrapStyle}>
          <label style={styles.selectorLabel}>PROFILE</label>
          <select
            value={selectedEmployeeId}
            onChange={(event) => onSelectEmployee(event.target.value)}
            style={styles.input}
            disabled={employees.length === 0}
          >
            {employees.length === 0 ? <option value="">No active crew</option> : null}
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div style={styles.sectionDivider} />

      {error ? <p style={styles.errorText}>{error.toUpperCase()}</p> : null}
      {!error && loading ? <p style={styles.loadingText}>LOADING PROFILE...</p> : null}
      {!error && !loading && !summary ? <p style={styles.emptyText}>SELECT CREW</p> : null}

      {!error && !loading && summary ? (
        <>
          <div style={identityCardStyle}>
            <div style={styles.identityRow}>
              <Avatar
                name={summary.employee.name}
                size={42}
                src={summary.employee.avatarUrl}
              />
              <div style={{ minWidth: 0 }}>
                <div style={styles.identityName}>{summary.employee.name}</div>
                <div style={styles.identityMeta}>{summary.employee.email}</div>
                <div style={styles.pillRow}>
                  {rolePills.length > 0
                    ? rolePills.map((role) => (
                        <span key={role} style={styles.rolePill}>
                          {role.toUpperCase()}
                        </span>
                      ))
                    : null}
                  {departmentPills.length > 0
                    ? departmentPills.map((department) => (
                        <span key={department} style={styles.departmentPill}>
                          {department.toUpperCase()}
                        </span>
                      ))
                    : null}
                  {departmentPills.length === 0 && rolePills.length === 0 ? (
                    <span style={styles.departmentPill}>UNASSIGNED</span>
                  ) : null}
                </div>
              </div>
            </div>
            <div style={identityAsideStyle}>
              <div style={styles.metricLabel}>MONTHLY QUOTA</div>
              <div style={styles.metricValue}>
                {summary.employee.monthlyQuotaHours.toFixed(0)}H
              </div>
            </div>
          </div>

          <div style={styles.statusStrip}>
            <StatusPill label={hasVaultProfile ? "VAULT LINKED" : "NO VAULT"} tone={hasVaultProfile ? "good" : "warn"} />
            <StatusPill label={hasKpi ? "KPI READY" : "NO KPI"} tone={hasKpi ? "info" : "neutral"} />
            {kpiStatus ? (
              <StatusPill
                label={`${kpiStatus.label} · ${kpiStatus.scorePercent}%`}
                tone={toneForKpiStatus(kpiStatus.status)}
              />
            ) : null}
            <StatusPill label={hasCurrentLeave ? "ON LEAVE" : "AVAILABLE"} tone={hasCurrentLeave ? "warn" : "good"} />
            <StatusPill label={hasEvents ? "SCHEDULED" : "OPEN CALENDAR"} tone={hasEvents ? "info" : "neutral"} />
          </div>

          <div style={metricsGridStyle}>
            <MetricTile
              label="WORK WEEK"
              value={`${summary.workHoursThisWeek.toFixed(1)}H`}
              accent="var(--lcars-orange)"
            />
            <MetricTile
              label="WORK MONTH"
              value={`${summary.workHoursThisMonth.toFixed(1)}H`}
              accent="var(--lcars-cyan)"
            />
            <MetricTile
              label="MEETING LOAD"
              value={`${summary.meetingsThisWeek} / ${summary.meetingHoursThisWeek.toFixed(1)}H`}
              accent="var(--lcars-yellow)"
            />
            <MetricTile
              label="SIGNALS 7D"
              value={`${summary.standupsLast7Days} STANDUPS · ${summary.messagesLast7Days} MSG`}
              accent="var(--lcars-green)"
            />
          </div>

          <div style={styles.vaultCard}>
            <div style={styles.cardHeader}>
              <div>
                <div style={styles.detailTitle}>VAULT PROFILE</div>
                <div style={styles.sectionCaption}>ROLE / PROJECTS / NOTE</div>
              </div>
              {summary.vaultProfile ? (
                <div style={styles.metaPillRow}>
                  <span style={styles.metaPill}>
                    {summary.vaultProfile.memberId.toUpperCase()}
                  </span>
                  <span style={styles.metaPill}>
                    SOURCE {formatDateTime(summary.vaultProfile.sourceLastModifiedAt)}
                  </span>
                </div>
              ) : null}
            </div>
            <div style={styles.detailDivider} />

            {summary.vaultProfile ? (
              <>
                <div style={styles.kpiIdentity}>
                  <div>
                    <div style={styles.kpiTitle}>
                      {summary.vaultProfile.displayName.toUpperCase()}
                    </div>
                    <div style={styles.kpiCaption}>
                      {summary.vaultProfile.role ?? "Role not set"}
                      {summary.vaultProfile.department
                        ? ` · ${summary.vaultProfile.department}`
                        : ""}
                    </div>
                  </div>
                  <div style={styles.metaPillRow}>
                    {summary.vaultProfile.joined ? (
                      <span style={styles.metaPill}>
                        JOINED {formatDate(summary.vaultProfile.joined)}
                      </span>
                    ) : null}
                    {summary.vaultProfile.contractEffective ? (
                      <span style={styles.metaPill}>
                        CONTRACT {formatDate(summary.vaultProfile.contractEffective)}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div style={styles.pillRow}>
                  {summary.vaultProfile.onboardingStage.map((stage) => (
                    <span key={stage} style={styles.departmentPill}>
                      {stage.toUpperCase()}
                    </span>
                  ))}
                  {summary.vaultProfile.probation ? (
                    <span style={styles.rolePill}>
                      {summary.vaultProfile.probation.toUpperCase()}
                    </span>
                  ) : null}
                  {summary.vaultProfile.clockifyStatus ? (
                    <span style={styles.rolePill}>
                      {summary.vaultProfile.clockifyStatus.toUpperCase()}
                    </span>
                  ) : null}
                </div>

                {summary.vaultProfile.summaryMarkdown ? (
                  <div style={styles.kpiScope}>
                    {summary.vaultProfile.summaryMarkdown}
                  </div>
                ) : null}

                <div style={detailGridStyle}>
                  <DetailList title="PRIMARY PROJECTS" emptyLabel="NO PRIMARY PROJECTS">
                    {summary.vaultProfile.primaryProjects.length > 0 ? (
                      <div style={styles.detailList}>
                        {summary.vaultProfile.primaryProjects.map((item) => (
                          <div key={item} style={styles.listItem}>
                            <div style={styles.detailPrimary}>{item.toUpperCase()}</div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </DetailList>

                  <DetailList title="SCOPE" emptyLabel="NO SCOPE TAGS">
                    {summary.vaultProfile.scope.length > 0 ? (
                      <div style={styles.detailList}>
                        {summary.vaultProfile.scope.map((item) => (
                          <div key={item} style={styles.listItem}>
                            <div style={styles.detailPrimary}>{item}</div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </DetailList>

                  <DetailList title="TEAM TAGS" emptyLabel="NO TEAM TAGS">
                    {summary.vaultProfile.teamTags.length > 0 ? (
                      <div style={styles.detailList}>
                        {summary.vaultProfile.teamTags.map((item) => (
                          <div key={item} style={styles.listItem}>
                            <div style={styles.detailPrimary}>{item}</div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </DetailList>

                  <DetailList title="SOURCE NOTE" emptyLabel="NO SOURCE NOTE">
                    <div style={styles.detailList}>
                      <div style={styles.detailPrimary}>
                        {summary.vaultProfile.sourceRelativePath}
                      </div>
                      {summary.vaultProfile.contactEmail ? (
                        <div style={styles.detailSubtle}>
                          CONTACT {summary.vaultProfile.contactEmail}
                        </div>
                      ) : null}
                    </div>
                  </DetailList>
                </div>

                {summary.vaultProfile.roleScopeMarkdown ? (
                  <div style={styles.cardFooter}>
                    NOTE {summary.vaultProfile.roleScopeMarkdown}
                  </div>
                ) : null}
              </>
            ) : (
              <div style={styles.emptyText}>NO VAULT PROFILE</div>
            )}
          </div>

          <div style={detailGridStyle}>
            <DetailList title="CURRENT LEAVE" emptyLabel="NO ACTIVE LEAVE">
              {summary.currentLeave ? (
                <div style={styles.detailList}>
                  <div style={detailRowStyle}>
                    <span style={styles.detailPrimary}>
                      {summary.currentLeave.leaveType.toUpperCase()}
                    </span>
                    <span style={styles.detailMeta}>
                      {summary.currentLeave.status.toUpperCase()}
                    </span>
                  </div>
                  <div style={styles.detailSubtle}>
                    {formatDate(summary.currentLeave.dateFrom)} to{" "}
                    {formatDate(summary.currentLeave.dateTo)}
                  </div>
                  {summary.currentLeave.note ? (
                    <div style={styles.detailNote}>{summary.currentLeave.note}</div>
                  ) : null}
                </div>
              ) : null}
            </DetailList>

            <DetailList title="UPCOMING LEAVE" emptyLabel="NO UPCOMING LEAVE">
              {summary.upcomingLeaves.length > 0 ? (
                <div style={styles.detailList}>
                  {summary.upcomingLeaves.map((leave) => (
                    <div key={leave.id} style={styles.listItem}>
                      <div style={detailRowStyle}>
                        <span style={styles.detailPrimary}>
                          {leave.leaveType.toUpperCase()}
                        </span>
                        <span style={styles.detailMeta}>{leave.status.toUpperCase()}</span>
                      </div>
                      <div style={styles.detailSubtle}>
                        {formatDate(leave.dateFrom)} to {formatDate(leave.dateTo)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </DetailList>

            <DetailList title="UPCOMING SCHEDULE" emptyLabel="NO UPCOMING EVENTS">
              {summary.upcomingEvents.length > 0 ? (
                <div style={styles.detailList}>
                  {summary.upcomingEvents.map((event) => (
                    <div key={event.id} style={styles.listItem}>
                      <div style={detailRowStyle}>
                        <span style={styles.detailPrimary}>
                          {event.title.toUpperCase()}
                        </span>
                        <span style={styles.detailMeta}>{event.source.toUpperCase()}</span>
                      </div>
                      <div style={styles.detailSubtle}>
                        {formatDateTime(event.startsAt)}
                        {event.endsAt ? ` to ${formatDateTime(event.endsAt)}` : ""}
                      </div>
                      {event.space ? (
                        <div style={styles.detailNote}>{event.space}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </DetailList>
          </div>

          <div style={styles.kpiCard}>
            <div style={styles.cardHeader}>
              <div>
                <div style={styles.detailTitle}>KPI SNAPSHOT</div>
                <div style={styles.sectionCaption}>MONTH / QUARTER / EVIDENCE</div>
              </div>
              {summary.kpiSnapshot ? (
                <div style={styles.metaPillRow}>
                  <span style={styles.metaPill}>
                    {summary.kpiStatus.label} {summary.kpiStatus.scorePercent}%
                  </span>
                  <span style={styles.metaPill}>
                    {summary.kpiSnapshot.kpiVersion.toUpperCase()}
                  </span>
                  <span style={styles.metaPill}>
                    SOURCE {formatDateTime(summary.kpiSnapshot.sourceLastModifiedAt)}
                  </span>
                </div>
              ) : null}
            </div>
            <div style={styles.detailDivider} />

            {summary.kpiSnapshot ? (
              <>
                <div style={styles.kpiIdentity}>
                  <div>
                    <div style={styles.kpiTitle}>
                      {summary.kpiSnapshot.title.toUpperCase()}
                    </div>
                    <div style={styles.kpiCaption}>
                      {summary.kpiSnapshot.roleTemplate ?? "Role template not set"}
                      {summary.kpiSnapshot.reportsTo
                        ? ` · ${summary.kpiSnapshot.reportsTo}`
                        : ""}
                    </div>
                  </div>
                  <div style={styles.metaPillRow}>
                    {summary.kpiSnapshot.lastReviewed ? (
                      <span style={styles.metaPill}>
                        REVIEWED {formatDate(summary.kpiSnapshot.lastReviewed)}
                      </span>
                    ) : null}
                    <span style={styles.metaPill}>
                      IMPORTED {formatDateTime(summary.kpiSnapshot.importedAt)}
                    </span>
                  </div>
                </div>

                {summary.kpiSnapshot.tags.length > 0 ? (
                  <div style={styles.pillRow}>
                    {summary.kpiSnapshot.tags.map((tag) => (
                      <span key={tag} style={styles.departmentPill}>
                        {tag.toUpperCase()}
                      </span>
                    ))}
                  </div>
                ) : null}

                {summary.kpiSnapshot.roleScopeMarkdown ? (
                  <div style={styles.kpiScope}>
                    {summary.kpiSnapshot.roleScopeMarkdown}
                  </div>
                ) : null}

                <div style={styles.kpiStatusCard}>
                  <div style={detailRowStyle}>
                    <span style={styles.detailPrimary}>{summary.kpiStatus.label}</span>
                    <span style={styles.detailMeta}>
                      SCORE {summary.kpiStatus.scorePercent}%
                    </span>
                  </div>
                  <div style={styles.detailSubtle}>{summary.kpiStatus.summary}</div>
                  <div style={styles.pillRow}>
                    <StatusPill
                      label={
                        summary.kpiStatus.founderUpdateRequired
                          ? "FOUNDER UPDATE REQUIRED"
                          : "NO FOUNDER UPDATE"
                      }
                      tone={
                        summary.kpiStatus.founderUpdateRequired ? "warn" : "good"
                      }
                    />
                    {summary.kpiStatus.founderUpdateReasons.map((reason) => (
                      <span key={reason} style={styles.metaPill}>
                        {humanizeSignalCode(reason)}
                      </span>
                    ))}
                  </div>
                  {summary.kpiStatus.reasons.length > 0 ? (
                    <div style={styles.detailList}>
                      {summary.kpiStatus.reasons.map((reason) => (
                        <div key={reason} style={styles.listItem}>
                          <div style={styles.detailSubtle}>{reason}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div style={kpiGridStyle}>
                  <div style={styles.kpiSection}>
                    <div style={styles.kpiSectionTitle}>MONTHLY KPIS</div>
                    <div style={styles.kpiList}>
                      {summary.kpiSnapshot.monthlyKpis.map((item) => (
                        <div key={item} style={styles.kpiListItem}>
                          {stripMarkdown(item)}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={styles.kpiSection}>
                    <div style={styles.kpiSectionTitle}>QUARTERLY MILESTONES</div>
                    <div style={styles.kpiList}>
                      {summary.kpiSnapshot.quarterlyMilestones.map((item) => (
                        <div key={item} style={styles.kpiListItem}>
                          {stripMarkdown(item)}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={styles.kpiSection}>
                    <div style={styles.kpiSectionTitle}>EVIDENCE SOURCES</div>
                    <div style={styles.kpiList}>
                      {summary.kpiSnapshot.evidenceSources.map((item) => (
                        <div key={item} style={styles.kpiListItem}>
                          {stripMarkdown(item)}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={styles.kpiSection}>
                    <div style={styles.kpiSectionTitle}>GAP FLAGS</div>
                    <div style={styles.kpiList}>
                      {summary.kpiSnapshot.gapFlags.length > 0 ? (
                        summary.kpiSnapshot.gapFlags.map((item) => (
                          <div key={item} style={styles.kpiListItem}>
                            {stripMarkdown(item)}
                          </div>
                        ))
                      ) : (
                        <div style={styles.emptyText}>NO GAP FLAGS</div>
                      )}
                    </div>
                  </div>
                </div>

                <div style={styles.cardFooter}>
                  NOTE {summary.kpiSnapshot.sourceRelativePath}
                </div>
              </>
            ) : (
              <div style={styles.emptyText}>NO KPI SNAPSHOT</div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    ...lcarsPageStyles.card,
    borderLeftColor: "var(--lcars-cyan)",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap" as const,
  },
  sectionTitle: lcarsPageStyles.sectionTitle,
  sectionCaption: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    color: "var(--lcars-lavender)",
    letterSpacing: "1.4px",
    textTransform: "uppercase" as const,
  },
  selectorWrap: {
    minWidth: 240,
    flex: "0 0 280px",
  },
  selectorLabel: {
    ...lcarsPageStyles.metricLabel,
    marginBottom: 6,
  },
  input: lcarsPageStyles.input,
  sectionDivider: lcarsPageStyles.sectionDivider,
  loadingText: {
    ...lcarsPageStyles.emptyText,
    color: "var(--lcars-cyan)",
  },
  emptyText: lcarsPageStyles.emptyText,
  errorText: {
    ...lcarsPageStyles.emptyText,
    color: "var(--lcars-yellow)",
  },
  identityCard: {
    ...lcarsPageStyles.subtleCard,
    borderLeftColor: "var(--lcars-cyan)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 20,
    marginBottom: 12,
  },
  identityRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    minWidth: 0,
  },
  identityName: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 15,
    fontWeight: 700,
    color: "var(--lcars-orange)",
    letterSpacing: "1px",
  },
  identityMeta: {
    fontSize: 12,
    color: "var(--lcars-lavender)",
    marginTop: 4,
  },
  identityAside: {
    minWidth: 120,
    textAlign: "right" as const,
  },
  pillRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap" as const,
    marginTop: 10,
  },
  rolePill: {
    border: "1px solid var(--lcars-cyan)",
    color: "var(--lcars-cyan)",
    background: "rgba(0, 204, 255, 0.12)",
    padding: "4px 9px",
    fontSize: 9,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: "1px",
    borderRadius: 999,
  },
  departmentPill: {
    border: "1px solid rgba(255, 153, 0, 0.45)",
    color: "var(--lcars-orange)",
    background: "rgba(255, 153, 0, 0.12)",
    padding: "4px 9px",
    fontSize: 9,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: "1px",
    borderRadius: 999,
  },
  statusStrip: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap" as const,
    marginBottom: 16,
  },
  statusPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    border: "1px solid rgba(153, 153, 204, 0.24)",
    padding: "5px 10px",
    borderRadius: 999,
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    letterSpacing: "1px",
    textTransform: "uppercase" as const,
  },
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    marginBottom: 16,
  },
  metricTile: {
    ...lcarsPageStyles.subtleCard,
    borderLeftColor: "var(--lcars-orange)",
    padding: 14,
  },
  metricLabel: lcarsPageStyles.metricLabel,
  metricValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 18,
    fontWeight: 600,
    color: "var(--lcars-orange)",
    lineHeight: 1.35,
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap" as const,
  },
  metaPillRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap" as const,
    justifyContent: "flex-end",
  },
  metaPill: {
    border: "1px solid rgba(153, 153, 204, 0.28)",
    color: "var(--lcars-cyan)",
    padding: "4px 8px",
    fontSize: 10,
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: "0.6px",
    borderRadius: 2,
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 12,
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
    marginTop: 14,
  },
  detailCard: {
    ...lcarsPageStyles.subtleCard,
    borderLeftColor: "var(--lcars-peach)",
  },
  kpiCard: {
    ...lcarsPageStyles.subtleCard,
    borderLeftColor: "var(--lcars-cyan)",
    marginTop: 16,
  },
  vaultCard: {
    ...lcarsPageStyles.subtleCard,
    borderLeftColor: "var(--lcars-orange)",
    marginBottom: 16,
  },
  kpiIdentity: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap" as const,
  },
  kpiTitle: {
    color: "var(--lcars-orange)",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.8px",
  },
  kpiCaption: {
    color: "var(--lcars-lavender)",
    fontSize: 11,
    marginTop: 4,
  },
  kpiScope: {
    color: "var(--lcars-tan)",
    fontSize: 12,
    lineHeight: 1.6,
    marginTop: 12,
    whiteSpace: "pre-wrap" as const,
  },
  kpiSection: {
    ...lcarsPageStyles.subtleCard,
    borderLeftColor: "rgba(255, 153, 0, 0.28)",
    padding: 12,
  },
  kpiStatusCard: {
    ...lcarsPageStyles.subtleCard,
    borderLeftColor: "var(--lcars-green)",
    marginTop: 14,
    marginBottom: 2,
  },
  kpiSectionTitle: {
    ...lcarsPageStyles.metricLabel,
    marginBottom: 10,
  },
  kpiList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  kpiListItem: {
    color: "var(--lcars-tan)",
    fontSize: 12,
    lineHeight: 1.55,
    paddingBottom: 8,
    borderBottom: "1px solid rgba(153, 153, 204, 0.08)",
  },
  cardFooter: {
    color: "var(--text-quaternary)",
    fontSize: 11,
    marginTop: 12,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
  },
  detailTitle: lcarsPageStyles.sectionTitle,
  detailDivider: {
    ...lcarsPageStyles.sectionDivider,
    marginBottom: 12,
  },
  detailList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  listItem: {
    paddingBottom: 10,
    borderBottom: "1px solid rgba(153, 153, 204, 0.08)",
  },
  detailRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 12,
  },
  detailPrimary: {
    color: "var(--lcars-orange)",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.5px",
  },
  detailMeta: {
    color: "var(--lcars-lavender)",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
  },
  detailSubtle: {
    color: "var(--lcars-tan)",
    fontSize: 12,
    lineHeight: 1.5,
    marginTop: 4,
  },
  detailNote: {
    color: "var(--text-quaternary)",
    fontSize: 11,
    lineHeight: 1.5,
    marginTop: 4,
  },
};
