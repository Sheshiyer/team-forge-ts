import { useState, useEffect, useCallback } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { SkeletonTable } from "../components/ui/Skeleton";
import Avatar from "../components/ui/Avatar";
import type { DepartmentView, LeaveView, HolidayView } from "../lib/types";

function StatusPill({ status }: { status: string }) {
  let bg: string;
  let color: string;

  switch (status.toLowerCase()) {
    case "approved":
      bg = "var(--status-success)";
      color = "#fff";
      break;
    case "pending":
      bg = "var(--status-warning)";
      color = "#1a1a1a";
      break;
    case "rejected":
      bg = "var(--status-critical)";
      color = "#fff";
      break;
    default:
      bg = "var(--text-quaternary)";
      color = "#fff";
  }

  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: "var(--radius-full)",
        backgroundColor: bg,
        color,
        fontSize: 12,
        fontWeight: 510,
        lineHeight: "20px",
        textTransform: "capitalize",
      }}
    >
      {status}
    </span>
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.min((current / total) * 100, 100) : 0;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <div
        style={{
          flex: 1,
          height: 6,
          borderRadius: 3,
          background: "rgba(255,255,255,0.05)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: 3,
            background:
              pct >= 80
                ? "var(--status-success)"
                : pct >= 50
                ? "var(--accent-brand)"
                : "var(--status-warning)",
            transition: "width 0.4s ease",
          }}
        />
      </div>
      <span style={{ fontSize: 12, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
        {current.toFixed(0)}h / {total.toFixed(0)}h
      </span>
    </div>
  );
}

function isCurrentlyOnLeave(dateFrom: string, dateTo: string): boolean {
  const now = new Date();
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  return now >= from && now <= to;
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function Team() {
  const api = useInvoke();
  const [departments, setDepartments] = useState<DepartmentView[]>([]);
  const [leaves, setLeaves] = useState<LeaveView[]>([]);
  const [holidays, setHolidays] = useState<HolidayView[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [d, l, h] = await Promise.all([
        api.getDepartments(),
        api.getLeaveRequests(),
        api.getHolidays(),
      ]);
      setDepartments(d);
      setLeaves(l);
      setHolidays(h);
    } catch {
      // data may not exist yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div>
        <h1 style={styles.pageTitle}>Team</h1>
        <div style={styles.card}>
          <SkeletonTable rows={4} cols={4} />
        </div>
        <div style={styles.card}>
          <SkeletonTable rows={5} cols={6} />
        </div>
        <div style={styles.card}>
          <SkeletonTable rows={3} cols={2} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={styles.pageTitle}>Team</h1>

      {/* Departments */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>Department Structure</h2>
        {departments.length === 0 ? (
          <p style={styles.emptyText}>No department data available.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {departments.map((dept) => (
              <div
                key={dept.id}
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  padding: 16,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 12,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 510, color: "var(--text-primary)" }}>
                      {dept.name}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                      {dept.headName ? `Head: ${dept.headName}` : "No head assigned"}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-tertiary)",
                      background: "rgba(255,255,255,0.04)",
                      padding: "2px 8px",
                      borderRadius: "var(--radius-full)",
                    }}
                  >
                    {dept.memberCount} members
                  </div>
                </div>
                <ProgressBar current={dept.totalHours} total={dept.quotaTotal} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Leave Calendar */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>Leave Calendar</h2>
        {leaves.length === 0 ? (
          <p style={styles.emptyText}>No leave requests found.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Employee</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>From</th>
                <th style={styles.th}>To</th>
                <th style={styles.th}>Days</th>
                <th style={styles.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {leaves.map((l, idx) => {
                const onLeave = isCurrentlyOnLeave(l.dateFrom, l.dateTo);
                return (
                  <tr
                    key={`${l.employeeName}-${idx}`}
                    style={{
                      cursor: "default",
                      backgroundColor: onLeave ? "rgba(39, 166, 68, 0.06)" : "transparent",
                    }}
                  >
                    <td style={styles.td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Avatar name={l.employeeName} size={24} />
                        {l.employeeName}
                        {onLeave && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              color: "var(--status-success)",
                              background: "rgba(39, 166, 68, 0.12)",
                              padding: "1px 6px",
                              borderRadius: "var(--radius-full)",
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                            }}
                          >
                            On Leave
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ ...styles.td, textTransform: "capitalize" }}>{l.leaveType}</td>
                    <td style={styles.td}>{formatDate(l.dateFrom)}</td>
                    <td style={styles.td}>{formatDate(l.dateTo)}</td>
                    <td style={styles.td}>{l.days}</td>
                    <td style={styles.td}>
                      <StatusPill status={l.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Holidays */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>Upcoming Holidays</h2>
        {holidays.length === 0 ? (
          <p style={styles.emptyText}>No holidays configured.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {holidays.map((h, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  borderRadius: "var(--radius-md)",
                  background: isToday(h.date) ? "rgba(94, 106, 210, 0.08)" : "transparent",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>
                    {h.title}
                  </span>
                  {isToday(h.date) && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: "var(--accent-brand)",
                        background: "rgba(94, 106, 210, 0.15)",
                        padding: "1px 6px",
                        borderRadius: "var(--radius-full)",
                        letterSpacing: "0.04em",
                      }}
                    >
                      TODAY
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                  {formatDate(h.date)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageTitle: {
    fontSize: 20,
    fontWeight: 600,
    marginBottom: 24,
    color: "var(--text-primary)",
    letterSpacing: "-0.02em",
  },
  card: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid var(--border-standard)",
    borderRadius: "var(--radius-lg)",
    padding: 24,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 510,
    color: "var(--text-primary)",
    marginBottom: 16,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 13,
  },
  th: {
    textAlign: "left" as const,
    color: "var(--text-tertiary)",
    fontWeight: 500,
    padding: "8px 12px",
    borderBottom: "1px solid var(--border-subtle)",
    fontSize: 12,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  td: {
    padding: "10px 12px",
    color: "var(--text-secondary)",
    borderBottom: "1px solid var(--border-subtle)",
  },
  emptyText: {
    fontSize: 13,
    color: "var(--text-tertiary)",
  },
};

export default Team;
