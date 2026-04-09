import type React from "react";
import Avatar from "../ui/Avatar";
import { lcarsPageStyles } from "../../lib/lcarsPageStyles";
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
  return (
    <div style={styles.card}>
      <div style={styles.headerRow}>
        <div>
          <h2 style={styles.sectionTitle}>EMPLOYEE OPERATIONS SUMMARY</h2>
          <p style={styles.helperText}>
            Standups, leave, work hours, and near-term schedule for one crew
            member.
          </p>
        </div>
        <div style={styles.selectorWrap}>
          <label style={styles.selectorLabel}>Crew Member</label>
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

      {error ? <p style={styles.emptyText}>{error.toUpperCase()}</p> : null}
      {!error && loading ? <p style={styles.loadingText}>LOADING EMPLOYEE SUMMARY...</p> : null}
      {!error && !loading && !summary ? (
        <p style={styles.emptyText}>SELECT A CREW MEMBER TO LOAD THEIR SUMMARY</p>
      ) : null}

      {!error && !loading && summary ? (
        <>
          <div style={styles.identityCard}>
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
                  {summary.roleLabels.length > 0
                    ? summary.roleLabels.map((role) => (
                        <span key={role} style={styles.rolePill}>
                          {role.toUpperCase()}
                        </span>
                      ))
                    : summary.departmentNames.map((department) => (
                        <span key={department} style={styles.departmentPill}>
                          {department.toUpperCase()}
                        </span>
                      ))}
                  {summary.departmentNames.length === 0 &&
                  summary.roleLabels.length === 0 ? (
                    <span style={styles.departmentPill}>UNASSIGNED</span>
                  ) : null}
                </div>
              </div>
            </div>
            <div style={styles.identityAside}>
              <div style={styles.metricLabel}>MONTHLY QUOTA</div>
              <div style={styles.metricValue}>
                {summary.employee.monthlyQuotaHours.toFixed(0)}H
              </div>
            </div>
          </div>

          <div style={styles.metricsGrid}>
            <MetricTile
              label="WORK THIS WEEK"
              value={`${summary.workHoursThisWeek.toFixed(1)}H`}
              accent="var(--lcars-orange)"
            />
            <MetricTile
              label="WORK THIS MONTH"
              value={`${summary.workHoursThisMonth.toFixed(1)}H`}
              accent="var(--lcars-cyan)"
            />
            <MetricTile
              label="MEETINGS THIS WEEK"
              value={`${summary.meetingsThisWeek} / ${summary.meetingHoursThisWeek.toFixed(1)}H`}
              accent="var(--lcars-yellow)"
            />
            <MetricTile
              label="STANDUPS 7D"
              value={
                summary.standupsLast7Days > 0
                  ? `${summary.standupsLast7Days} · ${formatDateTime(
                      summary.lastStandupAt
                    )}`
                  : "0 · --"
              }
              accent="var(--lcars-green)"
            />
            <MetricTile
              label="MESSAGES 7D"
              value={
                summary.messagesLast7Days > 0
                  ? `${summary.messagesLast7Days} · ${formatDateTime(
                      summary.lastMessageAt
                    )}`
                  : "0 · --"
              }
              accent="var(--lcars-lavender)"
            />
          </div>

          <div style={styles.detailGrid}>
            <DetailList
              title="Current Leave"
              emptyLabel="NO ACTIVE LEAVE"
            >
              {summary.currentLeave ? (
                <div style={styles.detailList}>
                  <div style={styles.detailRow}>
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

            <DetailList
              title="Upcoming Leave"
              emptyLabel="NO UPCOMING LEAVE"
            >
              {summary.upcomingLeaves.length > 0 ? (
                <div style={styles.detailList}>
                  {summary.upcomingLeaves.map((leave) => (
                    <div key={leave.id} style={styles.listItem}>
                      <div style={styles.detailRow}>
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

            <DetailList
              title="Upcoming Schedule"
              emptyLabel="NO UPCOMING EVENTS"
            >
              {summary.upcomingEvents.length > 0 ? (
                <div style={styles.detailList}>
                  {summary.upcomingEvents.map((event) => (
                    <div key={event.id} style={styles.listItem}>
                      <div style={styles.detailRow}>
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
  helperText: {
    ...lcarsPageStyles.helperText,
    marginBottom: 0,
    maxWidth: 420,
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
  identityCard: {
    ...lcarsPageStyles.subtleCard,
    borderLeftColor: "var(--lcars-cyan)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 20,
    marginBottom: 16,
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
    padding: "3px 8px",
    fontSize: 9,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: "1px",
    borderRadius: 2,
  },
  departmentPill: {
    border: "1px solid rgba(255, 153, 0, 0.45)",
    color: "var(--lcars-orange)",
    padding: "3px 8px",
    fontSize: 9,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: "1px",
    borderRadius: 2,
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
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 12,
  },
  detailCard: {
    ...lcarsPageStyles.subtleCard,
    borderLeftColor: "var(--lcars-peach)",
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
