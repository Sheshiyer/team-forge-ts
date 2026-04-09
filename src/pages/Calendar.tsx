import type React from "react";
import { useState, useEffect, useCallback } from "react";
import Avatar from "../components/ui/Avatar";
import { SkeletonTable } from "../components/ui/Skeleton";
import { useInvoke } from "../hooks/useInvoke";
import { useViewportWidth } from "../hooks/useViewportWidth";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";
import type {
  Employee,
  HolidayView,
  LeaveView,
  ManualHolidayInput,
  ManualLeaveInput,
  TeamSnapshotView,
} from "../lib/types";

const EMPTY_LEAVE_FORM: ManualLeaveInput = {
  id: null,
  employeeId: "",
  leaveType: "",
  dateFrom: "",
  dateTo: "",
  status: "Approved",
  note: "",
};

const EMPTY_HOLIDAY_FORM: ManualHolidayInput = {
  id: null,
  title: "",
  date: "",
  note: "",
};

function StatusPill({ status }: { status: string }) {
  let borderColor = "var(--text-quaternary)";

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
  }

  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 2,
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

function SourcePill({ source }: { source: string }) {
  const isManual = source.toLowerCase() === "manual";
  const color = isManual ? "var(--lcars-cyan)" : "var(--lcars-lavender)";

  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 2,
        border: `1px solid ${color}`,
        color,
        fontSize: 9,
        fontWeight: 600,
        fontFamily: "'Orbitron', sans-serif",
        letterSpacing: "1px",
        textTransform: "uppercase" as const,
      }}
    >
      {isManual ? "LOCAL" : "HULY"}
    </span>
  );
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

function parseCalendarDate(dateStr: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  return new Date(dateStr);
}

function formatDate(dateStr: string): string {
  return parseCalendarDate(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatMonthLabel(year: number, monthIndex: number): string {
  return new Date(year, monthIndex, 1).toLocaleDateString("en-US", {
    month: "long",
  });
}

function formatSnapshotTimestamp(value: string): string {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isCurrentlyOnLeave(dateFrom: string, dateTo: string): boolean {
  const now = new Date();
  const start = parseCalendarDate(dateFrom);
  const end = parseCalendarDate(dateTo);
  end.setHours(23, 59, 59, 999);
  return now >= start && now <= end;
}

function isToday(dateStr: string): boolean {
  const date = parseCalendarDate(dateStr);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function yearFromDate(dateStr: string): number {
  return parseCalendarDate(dateStr).getFullYear();
}

function monthFromDate(dateStr: string): number {
  return parseCalendarDate(dateStr).getMonth();
}

export default function Calendar() {
  const api = useInvoke();
  const viewportWidth = useViewportWidth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaves, setLeaves] = useState<LeaveView[]>([]);
  const [holidays, setHolidays] = useState<HolidayView[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [snapshotMessage, setSnapshotMessage] = useState<string | null>(null);
  const [cacheUpdatedAt, setCacheUpdatedAt] = useState<string | null>(null);
  const [leaveForm, setLeaveForm] = useState<ManualLeaveInput>(EMPTY_LEAVE_FORM);
  const [holidayForm, setHolidayForm] =
    useState<ManualHolidayInput>(EMPTY_HOLIDAY_FORM);
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [holidaySaving, setHolidaySaving] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [selectedHolidayYear, setSelectedHolidayYear] = useState<number>(
    new Date().getFullYear()
  );
  const isCompactLayout = viewportWidth < 1180;
  const isTightForms = viewportWidth < 920;

  const applySnapshot = useCallback((snapshot: TeamSnapshotView) => {
    setLeaves(snapshot.leaves);
    setHolidays(snapshot.holidays);
    setCacheUpdatedAt(snapshot.cacheUpdatedAt);
  }, []);

  const load = useCallback(async () => {
    let cachedSnapshot: TeamSnapshotView | null = null;

    setLoading(true);
    setRefreshing(true);
    setSnapshotMessage(null);
    setActionMessage(null);

    try {
      const roster = await api.getEmployees();
      setEmployees(roster);
      setLeaveForm((current) =>
        current.employeeId || roster.length === 0
          ? current
          : {
              ...current,
              employeeId: roster.find((item) => item.isActive)?.id ?? roster[0].id,
            }
      );
    } catch (err) {
      setEmployees([]);
      setSnapshotMessage(`Team roster read failed: ${String(err)}`);
    }

    try {
      cachedSnapshot = await api.getTeamSnapshot();
      applySnapshot(cachedSnapshot);
      setSnapshotMessage(
        cachedSnapshot.cacheUpdatedAt
          ? "Showing cached calendar data while live Huly refresh runs."
          : "No calendar cache yet. Hydrating Team data from Huly."
      );
    } catch (err) {
      setLeaves([]);
      setHolidays([]);
      setCacheUpdatedAt(null);
      setSnapshotMessage(`Calendar cache read failed: ${String(err)}`);
    } finally {
      setLoading(false);
    }

    try {
      const refreshed = await api.refreshTeamSnapshot();
      applySnapshot(refreshed);
      if (refreshed.hulyError) {
        setSnapshotMessage(
          `Live Huly refresh failed. Showing cached calendar data. Details: ${refreshed.hulyError}`
        );
      } else {
        setSnapshotMessage("Live calendar refresh complete.");
      }
    } catch (err) {
      if (cachedSnapshot?.cacheUpdatedAt) {
        setSnapshotMessage(
          `Live Huly refresh failed. Showing cached calendar data. Details: ${String(err)}`
        );
      } else {
        setSnapshotMessage(`Live calendar refresh failed: ${String(err)}`);
      }
    } finally {
      setRefreshing(false);
    }
  }, [api, applySnapshot]);

  useEffect(() => {
    load();
  }, [load]);

  const activeEmployees = employees.filter((employee) => employee.isActive);
  const activeLeaveCount = leaves.filter((leave) =>
    isCurrentlyOnLeave(leave.dateFrom, leave.dateTo)
  ).length;
  const pendingLeaveCount = leaves.filter(
    (leave) => leave.status.toLowerCase() === "pending"
  ).length;
  const holidayYears = Array.from(
    new Set([
      selectedHolidayYear,
      new Date().getFullYear(),
      ...holidays.map((holiday) => yearFromDate(holiday.date)),
    ])
  ).sort((left, right) => left - right);
  const yearHolidays = holidays.filter(
    (holiday) => yearFromDate(holiday.date) === selectedHolidayYear
  );
  const holidayMonths = Array.from({ length: 12 }, (_, monthIndex) => ({
    monthIndex,
    label: formatMonthLabel(selectedHolidayYear, monthIndex),
    holidays: yearHolidays.filter(
      (holiday) => monthFromDate(holiday.date) === monthIndex
    ),
  }));
  const editorGridStyle = {
    ...styles.editorGrid,
    gridTemplateColumns: isTightForms ? "1fr" : styles.editorGrid.gridTemplateColumns,
  };
  const holidayCalendarGridStyle = {
    ...styles.yearCalendarGrid,
    gridTemplateColumns: isCompactLayout
      ? "repeat(auto-fit, minmax(180px, 1fr))"
      : styles.yearCalendarGrid.gridTemplateColumns,
  };

  useEffect(() => {
    if (activeEmployees.length === 0) return;

    setLeaveForm((current) => {
      if (
        current.employeeId &&
        activeEmployees.some((employee) => employee.id === current.employeeId)
      ) {
        return current;
      }

      return { ...current, employeeId: activeEmployees[0].id };
    });
  }, [activeEmployees]);

  function resetLeaveForm() {
    setLeaveForm({
      ...EMPTY_LEAVE_FORM,
      employeeId: activeEmployees[0]?.id ?? "",
    });
  }

  function resetHolidayForm() {
    setHolidayForm(EMPTY_HOLIDAY_FORM);
  }

  function beginEditLeave(leave: LeaveView) {
    setLeaveForm({
      id: leave.id,
      employeeId: leave.employeeId ?? "",
      leaveType: leave.leaveType,
      dateFrom: leave.dateFrom,
      dateTo: leave.dateTo,
      status: leave.status,
      note: leave.note ?? "",
    });
    setActionMessage(`Editing local leave entry for ${leave.employeeName}.`);
  }

  function beginEditHoliday(holiday: HolidayView) {
    setHolidayForm({
      id: holiday.id,
      title: holiday.title,
      date: holiday.date,
      note: holiday.note ?? "",
    });
    setSelectedHolidayYear(yearFromDate(holiday.date));
    setActionMessage(`Editing local holiday ${holiday.title}.`);
  }

  async function handleSaveLeave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLeaveSaving(true);
    setActionMessage(null);

    try {
      const snapshot = await api.saveManualLeave({
        ...leaveForm,
        note: leaveForm.note?.trim() || null,
      });
      applySnapshot(snapshot);
      resetLeaveForm();
      setActionMessage("Local leave tracker updated.");
    } catch (err) {
      setActionMessage(`Leave save failed: ${String(err)}`);
    } finally {
      setLeaveSaving(false);
    }
  }

  async function handleDeleteLeave(id: string) {
    setLeaveSaving(true);
    setActionMessage(null);

    try {
      const snapshot = await api.deleteManualLeave(id);
      applySnapshot(snapshot);
      if (leaveForm.id === id) {
        resetLeaveForm();
      }
      setActionMessage("Local leave entry removed.");
    } catch (err) {
      setActionMessage(`Leave delete failed: ${String(err)}`);
    } finally {
      setLeaveSaving(false);
    }
  }

  async function handleSaveHoliday(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHolidaySaving(true);
    setActionMessage(null);

    try {
      const snapshot = await api.saveManualHoliday({
        ...holidayForm,
        note: holidayForm.note?.trim() || null,
      });
      applySnapshot(snapshot);
      if (holidayForm.date) {
        setSelectedHolidayYear(yearFromDate(holidayForm.date));
      }
      resetHolidayForm();
      setActionMessage("Holiday calendar updated.");
    } catch (err) {
      setActionMessage(`Holiday save failed: ${String(err)}`);
    } finally {
      setHolidaySaving(false);
    }
  }

  async function handleDeleteHoliday(id: string) {
    setHolidaySaving(true);
    setActionMessage(null);

    try {
      const snapshot = await api.deleteManualHoliday(id);
      applySnapshot(snapshot);
      if (holidayForm.id === id) {
        resetHolidayForm();
      }
      setActionMessage("Local holiday removed.");
    } catch (err) {
      setActionMessage(`Holiday delete failed: ${String(err)}`);
    } finally {
      setHolidaySaving(false);
    }
  }

  if (loading) {
    return (
      <div>
        <h1 style={styles.pageTitle}>CALENDAR</h1>
        <div style={styles.pageTitleBar} />
        <div style={styles.card}>
          <SkeletonTable rows={3} cols={4} />
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
      <h1 style={styles.pageTitle}>CALENDAR</h1>
      <div style={styles.pageTitleBar} />

      {(snapshotMessage || cacheUpdatedAt || refreshing) && (
        <div style={styles.statusBanner}>
          <div>
            <div style={styles.statusBannerLabel}>
              {refreshing ? "SYNCING SQLITE CACHE" : "CALENDAR CACHE"}
            </div>
            {snapshotMessage ? (
              <div style={styles.statusBannerText}>{snapshotMessage}</div>
            ) : null}
          </div>
          {cacheUpdatedAt ? (
            <div style={styles.statusBannerMeta}>
              LAST CACHE {formatSnapshotTimestamp(cacheUpdatedAt)}
            </div>
          ) : null}
        </div>
      )}

      {actionMessage ? <div style={styles.actionBanner}>{actionMessage}</div> : null}

      <div style={styles.metricsGrid}>
        <MetricTile
          label="ACTIVE LEAVE"
          value={`${activeLeaveCount}`}
          accent="var(--lcars-green)"
        />
        <MetricTile
          label="PENDING REQUESTS"
          value={`${pendingLeaveCount}`}
          accent="var(--lcars-yellow)"
        />
        <MetricTile
          label={`HOLIDAYS ${selectedHolidayYear}`}
          value={`${yearHolidays.length}`}
          accent="var(--lcars-orange)"
        />
        <MetricTile
          label="ACTIVE CREW"
          value={`${activeEmployees.length}`}
          accent="var(--lcars-cyan)"
        />
      </div>

      <div style={{ ...styles.card, borderLeftColor: "var(--lcars-green)" }}>
        <div style={styles.sectionHeaderRow}>
          <div>
            <h2 style={styles.sectionTitle}>LEAVE TRACKER</h2>
            <p style={styles.sectionHelperText}>
              Local leave ops live here now. Huly leave rows stay visible but
              read-only.
            </p>
          </div>
        </div>
        <div style={styles.sectionDivider} />
        <form onSubmit={handleSaveLeave} style={editorGridStyle}>
          <div style={styles.field}>
            <label style={styles.label}>Crew Member</label>
            <select
              value={leaveForm.employeeId}
              onChange={(event) =>
                setLeaveForm((current) => ({
                  ...current,
                  employeeId: event.target.value,
                }))
              }
              style={styles.input}
              disabled={leaveSaving || activeEmployees.length === 0}
            >
              {activeEmployees.length === 0 ? (
                <option value="">No active crew available</option>
              ) : null}
              {activeEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Leave Type</label>
            <input
              value={leaveForm.leaveType}
              onChange={(event) =>
                setLeaveForm((current) => ({
                  ...current,
                  leaveType: event.target.value,
                }))
              }
              placeholder="Vacation"
              style={styles.input}
              disabled={leaveSaving}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>From</label>
            <input
              type="date"
              value={leaveForm.dateFrom}
              onChange={(event) =>
                setLeaveForm((current) => ({
                  ...current,
                  dateFrom: event.target.value,
                }))
              }
              style={styles.input}
              disabled={leaveSaving}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>To</label>
            <input
              type="date"
              value={leaveForm.dateTo}
              onChange={(event) =>
                setLeaveForm((current) => ({
                  ...current,
                  dateTo: event.target.value,
                }))
              }
              style={styles.input}
              disabled={leaveSaving}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Status</label>
            <select
              value={leaveForm.status}
              onChange={(event) =>
                setLeaveForm((current) => ({
                  ...current,
                  status: event.target.value,
                }))
              }
              style={styles.input}
              disabled={leaveSaving}
            >
              <option value="Approved">Approved</option>
              <option value="Pending">Pending</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>
          <div style={{ ...styles.field, gridColumn: "1 / -1" }}>
            <label style={styles.label}>Note</label>
            <textarea
              value={leaveForm.note ?? ""}
              onChange={(event) =>
                setLeaveForm((current) => ({
                  ...current,
                  note: event.target.value,
                }))
              }
              placeholder="Optional context for the leave entry"
              style={{ ...styles.input, minHeight: 76, resize: "vertical" }}
              disabled={leaveSaving}
            />
          </div>
          <div style={styles.buttonRow}>
            <button
              type="submit"
              disabled={leaveSaving || activeEmployees.length === 0}
              style={{
                ...styles.primaryButton,
                opacity: leaveSaving || activeEmployees.length === 0 ? 0.55 : 1,
              }}
            >
              {leaveSaving
                ? "Saving..."
                : leaveForm.id
                  ? "Update Leave"
                  : "Add Leave"}
            </button>
            <button
              type="button"
              onClick={resetLeaveForm}
              style={styles.ghostButton}
              disabled={leaveSaving}
            >
              Clear
            </button>
          </div>
        </form>
        {leaves.length === 0 ? (
          <p style={styles.emptyText}>NO LEAVE REQUESTS FOUND</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>CREW MEMBER</th>
                <th style={styles.th}>SOURCE</th>
                <th style={styles.th}>TYPE</th>
                <th style={styles.th}>FROM</th>
                <th style={styles.th}>TO</th>
                <th style={styles.th}>DAYS</th>
                <th style={styles.th}>STATUS</th>
                <th style={styles.th}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {leaves.map((leave) => {
                const onLeave = isCurrentlyOnLeave(leave.dateFrom, leave.dateTo);
                return (
                  <tr
                    key={leave.id}
                    style={{
                      backgroundColor: onLeave
                        ? "rgba(51, 204, 102, 0.04)"
                        : "transparent",
                    }}
                  >
                    <td style={styles.td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Avatar name={leave.employeeName} size={24} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ color: "var(--lcars-orange)" }}>
                            {leave.employeeName}
                          </div>
                          {leave.note ? (
                            <div style={styles.inlineNote}>{leave.note}</div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td style={styles.td}>
                      <SourcePill source={leave.source} />
                    </td>
                    <td style={{ ...styles.td, textTransform: "uppercase" as const }}>
                      {leave.leaveType}
                    </td>
                    <td style={styles.tdMono}>{formatDate(leave.dateFrom)}</td>
                    <td style={styles.tdMono}>{formatDate(leave.dateTo)}</td>
                    <td style={styles.tdMono}>{leave.days}</td>
                    <td style={styles.td}>
                      <StatusPill status={leave.status} />
                    </td>
                    <td style={styles.td}>
                      {leave.editable ? (
                        <div style={styles.inlineActionRow}>
                          <button
                            type="button"
                            onClick={() => beginEditLeave(leave)}
                            style={styles.inlineActionButton}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteLeave(leave.id)}
                            style={styles.inlineActionButton}
                            disabled={leaveSaving}
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <span style={styles.rowMetaText}>SYNCED</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ ...styles.card, borderLeftColor: "var(--lcars-orange)" }}>
        <div style={styles.sectionHeaderRow}>
          <div>
            <h2 style={styles.sectionTitle}>HOLIDAY TRACKER</h2>
            <p style={styles.sectionHelperText}>
              Maintain the yearly holiday calendar here. Huly holidays stay
              read-only and merge into the same route.
            </p>
          </div>
        </div>
        <div style={styles.sectionDivider} />
        <form onSubmit={handleSaveHoliday} style={editorGridStyle}>
          <div style={styles.field}>
            <label style={styles.label}>Holiday Name</label>
            <input
              value={holidayForm.title}
              onChange={(event) =>
                setHolidayForm((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              placeholder="Republic Day"
              style={styles.input}
              disabled={holidaySaving}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Date</label>
            <input
              type="date"
              value={holidayForm.date}
              onChange={(event) =>
                setHolidayForm((current) => ({
                  ...current,
                  date: event.target.value,
                }))
              }
              style={styles.input}
              disabled={holidaySaving}
            />
          </div>
          <div style={{ ...styles.field, gridColumn: "1 / -1" }}>
            <label style={styles.label}>Note</label>
            <textarea
              value={holidayForm.note ?? ""}
              onChange={(event) =>
                setHolidayForm((current) => ({
                  ...current,
                  note: event.target.value,
                }))
              }
              placeholder="Optional note or office-closure context"
              style={{ ...styles.input, minHeight: 76, resize: "vertical" }}
              disabled={holidaySaving}
            />
          </div>
          <div style={styles.buttonRow}>
            <button
              type="submit"
              disabled={holidaySaving}
              style={{
                ...styles.primaryButton,
                opacity: holidaySaving ? 0.55 : 1,
              }}
            >
              {holidaySaving
                ? "Saving..."
                : holidayForm.id
                  ? "Update Holiday"
                  : "Add Holiday"}
            </button>
            <button
              type="button"
              onClick={resetHolidayForm}
              style={styles.ghostButton}
              disabled={holidaySaving}
            >
              Clear
            </button>
          </div>
        </form>
        <div style={styles.yearToolbar}>
          <div style={styles.yearToolbarLabel}>Year View</div>
          <select
            value={selectedHolidayYear}
            onChange={(event) => setSelectedHolidayYear(Number(event.target.value))}
            style={{ ...styles.input, width: 180 }}
          >
            {holidayYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
          <div style={styles.rowMetaText}>
            {yearHolidays.length} HOLIDAY{yearHolidays.length === 1 ? "" : "S"} IN{" "}
            {selectedHolidayYear}
          </div>
        </div>
        {holidays.length === 0 ? (
          <p style={styles.emptyText}>NO HOLIDAYS CONFIGURED</p>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {yearHolidays.length === 0 ? (
                <p style={styles.emptyText}>
                  NO HOLIDAYS SAVED FOR {selectedHolidayYear}
                </p>
              ) : (
                yearHolidays.map((holiday) => (
                  <div
                    key={holiday.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      background: isToday(holiday.date)
                        ? "rgba(255, 153, 0, 0.06)"
                        : "transparent",
                      borderBottom: "1px solid rgba(153, 153, 204, 0.08)",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: holiday.note ? 4 : 0,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 13,
                            color: "var(--lcars-orange)",
                            fontWeight: 500,
                          }}
                        >
                          {holiday.title.toUpperCase()}
                        </span>
                        <SourcePill source={holiday.source} />
                        {isToday(holiday.date) ? (
                          <span style={styles.todayPill}>TODAY</span>
                        ) : null}
                      </div>
                      {holiday.note ? (
                        <div style={styles.inlineNote}>{holiday.note}</div>
                      ) : null}
                    </div>
                    <div style={styles.inlineActionRow}>
                      <span style={styles.dateMeta}>{formatDate(holiday.date)}</span>
                      {holiday.editable ? (
                        <>
                          <button
                            type="button"
                            onClick={() => beginEditHoliday(holiday)}
                            style={styles.inlineActionButton}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteHoliday(holiday.id)}
                            style={styles.inlineActionButton}
                            disabled={holidaySaving}
                          >
                            Remove
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div style={holidayCalendarGridStyle}>
              {holidayMonths.map((month) => (
                <div key={month.monthIndex} style={styles.monthCard}>
                  <div style={styles.monthCardHeader}>{month.label}</div>
                  {month.holidays.length === 0 ? (
                    <div style={styles.monthCardEmpty}>No holidays</div>
                  ) : (
                    <div style={styles.monthHolidayList}>
                      {month.holidays.map((holiday) => (
                        <div key={holiday.id} style={styles.monthHolidayItem}>
                          <span style={styles.monthHolidayDate}>
                            {parseCalendarDate(holiday.date).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                          <span style={styles.monthHolidayTitle}>{holiday.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageTitle: lcarsPageStyles.pageTitle,
  pageTitleBar: lcarsPageStyles.pageTitleBar,
  card: lcarsPageStyles.card,
  metricTile: {
    ...lcarsPageStyles.subtleCard,
    padding: 16,
  },
  metricLabel: lcarsPageStyles.metricLabel,
  metricValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 22,
    fontWeight: 600,
    color: "var(--lcars-orange)",
  },
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    marginBottom: 20,
  },
  statusBanner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap" as const,
    gap: 16,
    marginBottom: 20,
    padding: "12px 16px",
    background: "var(--bg-console-soft)",
    border: "1px solid rgba(153, 153, 204, 0.16)",
    borderLeft: "8px solid var(--lcars-cyan)",
    borderRadius: "0 18px 18px 0",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
  },
  statusBannerLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    color: "var(--lcars-cyan)",
    letterSpacing: "1.6px",
    textTransform: "uppercase" as const,
    marginBottom: 4,
  },
  statusBannerText: {
    fontSize: 12,
    color: "var(--lcars-tan)",
    lineHeight: 1.5,
  },
  statusBannerMeta: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: "var(--lcars-lavender)",
    whiteSpace: "nowrap" as const,
  },
  actionBanner: {
    marginBottom: 20,
    padding: "10px 14px",
    background: "var(--bg-console-soft)",
    border: "1px solid rgba(0, 204, 255, 0.18)",
    borderLeft: "8px solid var(--lcars-cyan)",
    color: "var(--lcars-tan)",
    fontSize: 12,
    lineHeight: 1.5,
    borderRadius: "0 16px 16px 0",
  },
  sectionTitle: lcarsPageStyles.sectionTitle,
  sectionDivider: lcarsPageStyles.sectionDivider,
  sectionHeaderRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap" as const,
    gap: 16,
  },
  sectionHelperText: {
    ...lcarsPageStyles.helperText,
    marginBottom: 8,
  },
  field: {
    marginBottom: 14,
  },
  label: lcarsPageStyles.metricLabel,
  input: lcarsPageStyles.input,
  editorGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
    gap: 12,
    marginBottom: 20,
  },
  buttonRow: lcarsPageStyles.buttonRow,
  primaryButton: lcarsPageStyles.primaryButton,
  ghostButton: lcarsPageStyles.ghostButton,
  table: lcarsPageStyles.table,
  th: lcarsPageStyles.th,
  td: lcarsPageStyles.td,
  tdMono: lcarsPageStyles.tdMono,
  emptyText: lcarsPageStyles.emptyText,
  inlineNote: {
    fontSize: 11,
    color: "var(--text-quaternary)",
    lineHeight: 1.4,
    marginTop: 3,
  },
  inlineActionRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap" as const,
  },
  inlineActionButton: {
    background: "transparent",
    border: "1px solid rgba(153, 153, 204, 0.24)",
    color: "var(--lcars-lavender)",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    letterSpacing: "1px",
    padding: "4px 8px",
    cursor: "pointer",
  },
  rowMetaText: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    color: "var(--text-quaternary)",
    letterSpacing: "1px",
  },
  yearToolbar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap" as const,
    marginBottom: 16,
  },
  yearToolbarLabel: {
    ...lcarsPageStyles.metricLabel,
    marginBottom: 0,
  },
  dateMeta: {
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    color: "var(--lcars-lavender)",
  },
  todayPill: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 8,
    fontWeight: 600,
    color: "var(--lcars-cyan)",
    border: "1px solid var(--lcars-cyan)",
    padding: "1px 6px",
    borderRadius: 2,
    letterSpacing: "1px",
  },
  yearCalendarGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 12,
    marginTop: 20,
  },
  monthCard: {
    ...lcarsPageStyles.subtleCard,
    borderLeftColor: "var(--lcars-orange)",
  },
  monthCardHeader: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 11,
    color: "var(--lcars-orange)",
    letterSpacing: "1px",
    marginBottom: 10,
  },
  monthCardEmpty: {
    fontSize: 11,
    color: "var(--text-quaternary)",
  },
  monthHolidayList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  monthHolidayItem: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    fontSize: 11,
  },
  monthHolidayDate: {
    color: "var(--lcars-lavender)",
    fontFamily: "'JetBrains Mono', monospace",
    flexShrink: 0,
  },
  monthHolidayTitle: {
    color: "var(--lcars-tan)",
    textAlign: "right" as const,
  },
};
