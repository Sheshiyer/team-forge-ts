import { useState, useEffect, useCallback } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { SkeletonTable } from "../components/ui/Skeleton";
import Avatar from "../components/ui/Avatar";
import type { DepartmentView, LeaveView, HolidayView } from "../lib/types";

function StatusPill({ status }: { status: string }) {
  let borderColor: string;

  switch (status.toLowerCase()) {
    case "approved":
      borderColor = "var(--lcars-green)";
      break;
    case "pending":
      borderColor = "var(--lcars-yellow)";
      break;
    case "rejected":
      borderColor = "var(--lcars-red)";
      break;
    default:
      borderColor = "var(--text-quaternary)";
  }

  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 2,
        backgroundColor: "transparent",
        border: `1px solid ${borderColor}`,
        color: borderColor,
        fontSize: 10,
        fontWeight: 600,
        fontFamily: "'Orbitron', sans-serif",
        lineHeight: "18px",
        letterSpacing: "1px",
        textTransform: "uppercase" as const,
        boxShadow: `0 0 8px ${borderColor}33`,
      }}
    >
      {status.toUpperCase()}
    </span>
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.min((current / total) * 100, 100) : 0;
  const color = pct >= 80 ? "var(--lcars-green)" : pct >= 50 ? "var(--lcars-orange)" : "var(--lcars-yellow)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          flex: 1,
          height: 6,
          background: "rgba(153, 153, 204, 0.1)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: color,
            transition: "width 0.4s ease",
            boxShadow: `0 0 6px ${color}44`,
          }}
        />
      </div>
      <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: "var(--lcars-lavender)", whiteSpace: "nowrap" }}>
        {current.toFixed(0)}h / {total.toFixed(0)}h
      </span>
    </div>
  );
}

function isCurrentlyOnLeave(dateFrom: string, dateTo: string): boolean {
  const now = new Date();
  return now >= new Date(dateFrom) && now <= new Date(dateTo);
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div>
        <h1 style={styles.pageTitle}>TEAM</h1>
        <div style={styles.pageTitleBar} />
        <div style={styles.card}><SkeletonTable rows={4} cols={4} /></div>
        <div style={styles.card}><SkeletonTable rows={5} cols={6} /></div>
        <div style={styles.card}><SkeletonTable rows={3} cols={2} /></div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={styles.pageTitle}>TEAM</h1>
      <div style={styles.pageTitleBar} />

      {/* Departments */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>DEPARTMENT STRUCTURE</h2>
        <div style={styles.sectionDivider} />
        {departments.length === 0 ? (
          <p style={styles.emptyText}>NO DEPARTMENT DATA AVAILABLE</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {departments.map((dept) => (
              <div
                key={dept.id}
                style={{
                  background: "rgba(26, 26, 46, 0.8)",
                  borderLeft: "3px solid var(--lcars-peach)",
                  padding: 16,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 12, fontWeight: 600, color: "var(--lcars-orange)", letterSpacing: "1px" }}>
                      {dept.name.toUpperCase()}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--lcars-lavender)", marginTop: 2 }}>
                      {dept.headName ? `HEAD: ${dept.headName.toUpperCase()}` : "NO HEAD ASSIGNED"}
                    </div>
                  </div>
                  <div
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 11,
                      color: "var(--lcars-lavender)",
                      background: "rgba(153, 153, 204, 0.1)",
                      padding: "2px 8px",
                      borderRadius: 2,
                    }}
                  >
                    {dept.memberCount} CREW
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
        <h2 style={styles.sectionTitle}>LEAVE CALENDAR</h2>
        <div style={styles.sectionDivider} />
        {leaves.length === 0 ? (
          <p style={styles.emptyText}>NO LEAVE REQUESTS FOUND</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>CREW MEMBER</th>
                <th style={styles.th}>TYPE</th>
                <th style={styles.th}>FROM</th>
                <th style={styles.th}>TO</th>
                <th style={styles.th}>DAYS</th>
                <th style={styles.th}>STATUS</th>
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
                      backgroundColor: onLeave ? "rgba(51, 204, 102, 0.04)" : "transparent",
                    }}
                  >
                    <td style={styles.td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Avatar name={l.employeeName} size={24} />
                        <span style={{ color: "var(--lcars-orange)" }}>{l.employeeName}</span>
                        {onLeave && (
                          <span
                            style={{
                              fontFamily: "'Orbitron', sans-serif",
                              fontSize: 8,
                              fontWeight: 600,
                              color: "var(--lcars-green)",
                              border: "1px solid var(--lcars-green)",
                              padding: "1px 6px",
                              borderRadius: 2,
                              letterSpacing: "1px",
                            }}
                          >
                            ON LEAVE
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ ...styles.td, textTransform: "uppercase" as const }}>{l.leaveType}</td>
                    <td style={styles.tdMono}>{formatDate(l.dateFrom)}</td>
                    <td style={styles.tdMono}>{formatDate(l.dateTo)}</td>
                    <td style={styles.tdMono}>{l.days}</td>
                    <td style={styles.td}><StatusPill status={l.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Holidays */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>UPCOMING HOLIDAYS</h2>
        <div style={styles.sectionDivider} />
        {holidays.length === 0 ? (
          <p style={styles.emptyText}>NO HOLIDAYS CONFIGURED</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {holidays.map((h, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  background: isToday(h.date) ? "rgba(255, 153, 0, 0.06)" : "transparent",
                  borderBottom: "1px solid rgba(153, 153, 204, 0.08)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, color: "var(--lcars-orange)", fontWeight: 500 }}>
                    {h.title.toUpperCase()}
                  </span>
                  {isToday(h.date) && (
                    <span
                      style={{
                        fontFamily: "'Orbitron', sans-serif",
                        fontSize: 8,
                        fontWeight: 600,
                        color: "var(--lcars-cyan)",
                        border: "1px solid var(--lcars-cyan)",
                        padding: "1px 6px",
                        borderRadius: 2,
                        letterSpacing: "1px",
                      }}
                    >
                      TODAY
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: "var(--lcars-lavender)" }}>
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
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 8,
    color: "var(--lcars-orange)",
    letterSpacing: "4px",
    textTransform: "uppercase" as const,
  },
  pageTitleBar: {
    height: 3,
    background: "linear-gradient(90deg, var(--lcars-orange), transparent)",
    marginBottom: 24,
  },
  card: {
    background: "rgba(26, 26, 46, 0.6)",
    borderLeft: "4px solid var(--lcars-peach)",
    padding: 24,
    marginBottom: 20,
  },
  sectionTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--lcars-orange)",
    marginBottom: 8,
    letterSpacing: "2px",
    textTransform: "uppercase" as const,
  },
  sectionDivider: {
    height: 2,
    background: "rgba(153, 153, 204, 0.15)",
    marginBottom: 16,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 13,
  },
  th: {
    textAlign: "left" as const,
    color: "var(--lcars-lavender)",
    fontFamily: "'Orbitron', sans-serif",
    fontWeight: 500,
    padding: "8px 12px",
    borderBottom: "1px solid rgba(255, 153, 0, 0.15)",
    fontSize: 10,
    textTransform: "uppercase" as const,
    letterSpacing: "1.5px",
    background: "rgba(255, 153, 0, 0.05)",
  },
  td: {
    padding: "10px 12px",
    color: "var(--lcars-tan)",
    borderBottom: "1px solid rgba(153, 153, 204, 0.08)",
  },
  tdMono: {
    padding: "10px 12px",
    color: "var(--lcars-lavender)",
    borderBottom: "1px solid rgba(153, 153, 204, 0.08)",
    fontFamily: "'JetBrains Mono', monospace",
  },
  emptyText: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 11,
    color: "var(--text-quaternary)",
    letterSpacing: "2px",
    textTransform: "uppercase" as const,
  },
};

export default Team;
