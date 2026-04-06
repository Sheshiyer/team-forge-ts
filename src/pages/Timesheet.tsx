import { useState, useEffect, useCallback } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { formatDuration } from "../lib/format";
import { exportCsv } from "../lib/export";
import { SkeletonTable } from "../components/ui/Skeleton";
import Avatar from "../components/ui/Avatar";
import type { TimeEntry, Employee } from "../lib/types";

type DateRange = "week" | "month";

function getDateRange(range: DateRange): { start: string; end: string } {
  const now = new Date();
  if (range === "week") {
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((day + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 7);
    return {
      start: monday.toISOString().split("T")[0],
      end: sunday.toISOString().split("T")[0],
    };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
}

function Timesheet() {
  const api = useInvoke();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [range, setRange] = useState<DateRange>("week");
  const [filterEmployee, setFilterEmployee] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<string>("startTime");
  const [sortAsc, setSortAsc] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange(range);
      const [data, emps] = await Promise.all([
        api.getTimeEntries(filterEmployee, start, end),
        api.getEmployees(),
      ]);
      setEntries(data);
      setEmployees(emps);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [range, filterEmployee]);

  useEffect(() => {
    load();
  }, [load]);

  const empMap = new Map(employees.map((e) => [e.id, e.name]));

  const sorted = [...entries].sort((a, b) => {
    let cmp = 0;
    switch (sortCol) {
      case "startTime":
        cmp = a.startTime.localeCompare(b.startTime);
        break;
      case "employee":
        cmp = (empMap.get(a.employeeId) ?? "").localeCompare(
          empMap.get(b.employeeId) ?? ""
        );
        break;
      case "duration":
        cmp = (a.durationSeconds ?? 0) - (b.durationSeconds ?? 0);
        break;
      default:
        cmp = 0;
    }
    return sortAsc ? cmp : -cmp;
  });

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(true);
    }
  };

  const sortIndicator = (col: string) =>
    sortCol === col ? (sortAsc ? " \u25B2" : " \u25BC") : "";

  const handleExport = () => {
    const headers = ["Date", "Employee", "Project", "Description", "Hours", "Billable"];
    const rows = sorted.map((entry) => [
      entry.startTime.split("T")[0],
      empMap.get(entry.employeeId) ?? entry.employeeId,
      entry.projectId ?? "",
      entry.description ?? "",
      entry.durationSeconds != null ? (entry.durationSeconds / 3600).toFixed(2) : "",
      entry.isBillable ? "Yes" : "No",
    ]);
    exportCsv(`timesheet-${range}.csv`, headers, rows);
  };

  return (
    <div>
      <h1 style={styles.pageTitle}>TIMESHEET</h1>
      <div style={styles.pageTitleBar} />

      {/* Controls */}
      <div style={styles.controls}>
        <div style={styles.toggleGroup}>
          <button
            onClick={() => setRange("week")}
            style={{
              ...styles.toggleBtn,
              ...(range === "week" ? styles.toggleActive : {}),
            }}
          >
            THIS WEEK
          </button>
          <button
            onClick={() => setRange("month")}
            style={{
              ...styles.toggleBtn,
              ...(range === "month" ? styles.toggleActive : {}),
            }}
          >
            THIS MONTH
          </button>
        </div>

        <select
          value={filterEmployee ?? ""}
          onChange={(e) => setFilterEmployee(e.target.value || null)}
          style={styles.select}
        >
          <option value="">ALL CREW</option>
          {employees
            .filter((e) => e.isActive)
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
        </select>

        <button onClick={handleExport} style={styles.ghostBtn}>
          EXPORT CSV
        </button>
      </div>

      {/* Table */}
      <div style={styles.card}>
        {loading ? (
          <SkeletonTable rows={8} cols={6} />
        ) : sorted.length === 0 ? (
          <p style={styles.emptyText}>
            NO TIME ENTRIES FOUND FOR THIS PERIOD
          </p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th
                  style={{ ...styles.th, cursor: "pointer" }}
                  onClick={() => handleSort("startTime")}
                >
                  DATE{sortIndicator("startTime")}
                </th>
                <th
                  style={{ ...styles.th, cursor: "pointer" }}
                  onClick={() => handleSort("employee")}
                >
                  CREW{sortIndicator("employee")}
                </th>
                <th style={styles.th}>PROJECT</th>
                <th style={styles.th}>DESCRIPTION</th>
                <th
                  style={{ ...styles.th, cursor: "pointer" }}
                  onClick={() => handleSort("duration")}
                >
                  HOURS{sortIndicator("duration")}
                </th>
                <th style={styles.th}>BILLABLE</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((entry) => (
                <tr key={entry.id}>
                  <td style={styles.tdMono}>
                    {entry.startTime.split("T")[0]}
                  </td>
                  <td style={styles.td}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <Avatar
                        name={empMap.get(entry.employeeId) ?? entry.employeeId}
                        size={22}
                      />
                      <span style={{ color: "var(--lcars-orange)" }}>
                        {empMap.get(entry.employeeId) ?? entry.employeeId}
                      </span>
                    </div>
                  </td>
                  <td style={styles.td}>{entry.projectId ?? "--"}</td>
                  <td
                    style={{
                      ...styles.td,
                      maxWidth: 240,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {entry.description ?? "--"}
                  </td>
                  <td style={styles.tdMono}>
                    {entry.durationSeconds != null
                      ? formatDuration(entry.durationSeconds)
                      : "--"}
                  </td>
                  <td style={styles.td}>
                    <span
                      style={{
                        display: "inline-block",
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        backgroundColor: entry.isBillable
                          ? "var(--lcars-green)"
                          : "var(--text-quaternary)",
                        boxShadow: entry.isBillable
                          ? "0 0 6px rgba(51, 204, 102, 0.4)"
                          : "none",
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
  controls: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    marginBottom: 20,
  },
  toggleGroup: {
    display: "flex",
    border: "1px solid rgba(255, 153, 0, 0.3)",
    borderRadius: 2,
    overflow: "hidden",
  },
  toggleBtn: {
    background: "transparent",
    border: "none",
    borderRight: "1px solid rgba(255, 153, 0, 0.2)",
    color: "var(--lcars-lavender)",
    padding: "8px 16px",
    fontSize: 10,
    fontWeight: 600,
    fontFamily: "'Orbitron', sans-serif",
    cursor: "pointer",
    transition: "background 0.15s, color 0.15s",
    letterSpacing: "1px",
  },
  toggleActive: {
    background: "var(--lcars-orange)",
    color: "#000",
  },
  select: {
    background: "rgba(26, 26, 46, 0.8)",
    border: "1px solid rgba(255, 153, 0, 0.3)",
    borderRadius: 2,
    color: "var(--lcars-tan)",
    padding: "8px 14px",
    fontSize: 11,
    fontFamily: "'Orbitron', sans-serif",
    outline: "none",
    letterSpacing: "1px",
    textTransform: "uppercase" as const,
  },
  ghostBtn: {
    background: "transparent",
    border: "1px solid rgba(255, 153, 0, 0.3)",
    borderRadius: 2,
    color: "var(--lcars-orange)",
    padding: "8px 14px",
    fontSize: 10,
    fontWeight: 600,
    fontFamily: "'Orbitron', sans-serif",
    cursor: "pointer",
    transition: "background 0.15s, color 0.15s",
    marginLeft: "auto",
    letterSpacing: "1px",
    textTransform: "uppercase" as const,
  },
  card: {
    background: "rgba(26, 26, 46, 0.6)",
    borderLeft: "4px solid var(--lcars-blue)",
    padding: 24,
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
    userSelect: "none" as const,
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

export default Timesheet;
