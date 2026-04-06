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
  // month
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

  // Build employee lookup
  const empMap = new Map(employees.map((e) => [e.id, e.name]));

  // Sort entries
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
      <h1 style={styles.pageTitle}>Timesheet</h1>

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
            This Week
          </button>
          <button
            onClick={() => setRange("month")}
            style={{
              ...styles.toggleBtn,
              ...(range === "month" ? styles.toggleActive : {}),
            }}
          >
            This Month
          </button>
        </div>

        <select
          value={filterEmployee ?? ""}
          onChange={(e) => setFilterEmployee(e.target.value || null)}
          style={styles.select}
        >
          <option value="">All Employees</option>
          {employees
            .filter((e) => e.isActive)
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
        </select>

        <button onClick={handleExport} style={styles.ghostBtn}>
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div style={styles.card}>
        {loading ? (
          <SkeletonTable rows={8} cols={6} />
        ) : sorted.length === 0 ? (
          <p style={styles.emptyText}>
            No time entries found for this period.
          </p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th
                  style={{ ...styles.th, cursor: "pointer" }}
                  onClick={() => handleSort("startTime")}
                >
                  Date{sortIndicator("startTime")}
                </th>
                <th
                  style={{ ...styles.th, cursor: "pointer" }}
                  onClick={() => handleSort("employee")}
                >
                  Employee{sortIndicator("employee")}
                </th>
                <th style={styles.th}>Project</th>
                <th style={styles.th}>Description</th>
                <th
                  style={{ ...styles.th, cursor: "pointer" }}
                  onClick={() => handleSort("duration")}
                >
                  Hours{sortIndicator("duration")}
                </th>
                <th style={styles.th}>Billable</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((entry) => (
                <tr key={entry.id}>
                  <td style={styles.td}>
                    {entry.startTime.split("T")[0]}
                  </td>
                  <td
                    style={{
                      ...styles.td,
                      fontWeight: 510,
                      color: "var(--text-primary)",
                    }}
                  >
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
                      {empMap.get(entry.employeeId) ?? entry.employeeId}
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
                  <td style={styles.td}>
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
                          ? "var(--status-success)"
                          : "var(--text-quaternary)",
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
    fontSize: 20,
    fontWeight: 600,
    marginBottom: 24,
    color: "var(--text-primary)",
    letterSpacing: "-0.02em",
  },
  controls: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    marginBottom: 20,
  },
  toggleGroup: {
    display: "flex",
    border: "1px solid var(--border-standard)",
    borderRadius: "var(--radius-md)",
    overflow: "hidden",
  },
  toggleBtn: {
    background: "rgba(255,255,255,0.02)",
    border: "none",
    borderRight: "1px solid var(--border-standard)",
    color: "var(--text-tertiary)",
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 510,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
    transition: "background 0.15s, color 0.15s",
  },
  toggleActive: {
    background: "var(--bg-hover)",
    color: "var(--text-primary)",
  },
  select: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid var(--border-standard)",
    borderRadius: "var(--radius-md)",
    color: "var(--text-secondary)",
    padding: "8px 14px",
    fontSize: 13,
    fontFamily: "var(--font-sans)",
    outline: "none",
  },
  ghostBtn: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid var(--border-standard)",
    borderRadius: "var(--radius-md)",
    color: "var(--text-tertiary)",
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 510,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
    transition: "background 0.15s, color 0.15s",
    marginLeft: "auto",
  },
  card: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid var(--border-standard)",
    borderRadius: "var(--radius-lg)",
    padding: 24,
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
    userSelect: "none" as const,
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

export default Timesheet;
