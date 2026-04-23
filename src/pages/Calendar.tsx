import {
  useState,
  useEffect,
  useCallback,
  type CSSProperties,
  type FormEvent,
} from "react";
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
  let background = "rgba(153, 153, 204, 0.08)";

  switch (status.toLowerCase()) {
    case "approved":
      borderColor = "var(--lcars-green)";
      background = "rgba(51, 204, 102, 0.08)";
      break;
    case "pending":
      borderColor = "var(--lcars-yellow)";
      background = "rgba(255, 204, 0, 0.08)";
      break;
    case "rejected":
      borderColor = "var(--lcars-red)";
      background = "rgba(204, 51, 51, 0.08)";
      break;
  }

  return (
    <span
      style={{
        ...styles.statusPill,
        borderColor,
        color: borderColor,
        background,
      }}
    >
      {status.toUpperCase()}
    </span>
  );
}

function SourcePill({ source }: { source: string }) {
  const isManual = source.toLowerCase() === "manual";
  const color = isManual ? "var(--lcars-cyan)" : "var(--lcars-lavender)";
  const background = isManual
    ? "rgba(0, 204, 255, 0.08)"
    : "rgba(153, 153, 204, 0.08)";

  return (
    <span
      style={{
        ...styles.sourcePill,
        borderColor: color,
        color,
        background,
      }}
    >
      {isManual ? "LOCAL" : "HULY"}
    </span>
  );
}

function MetricCard({
  label,
  value,
  meta,
  tone,
}: {
  label: string;
  value: string;
  meta: string;
  tone: string;
}) {
  return (
    <div style={{ ...styles.metricCard, borderLeftColor: tone }}>
      <div style={styles.metricLabel}>{label}</div>
      <div style={{ ...styles.metricValue, color: tone }}>{value}</div>
      <div style={styles.metricMeta}>{meta}</div>
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
      setSnapshotMessage(`CALENDAR ERROR • ${String(err)}`);
    }

    try {
      cachedSnapshot = await api.getTeamSnapshot();
      applySnapshot(cachedSnapshot);
      setSnapshotMessage(
        cachedSnapshot.cacheUpdatedAt
          ? "USING CACHED CALENDAR DATA"
          : "LOADING CALENDAR DATA"
      );
    } catch (err) {
      setLeaves([]);
      setHolidays([]);
      setCacheUpdatedAt(null);
      setSnapshotMessage(`CALENDAR ERROR • ${String(err)}`);
    } finally {
      setLoading(false);
    }

    try {
      const refreshed = await api.refreshTeamSnapshot();
      applySnapshot(refreshed);
      if (refreshed.hulyError) {
        setSnapshotMessage(`CACHE ACTIVE • ${refreshed.hulyError}`);
      } else {
        setSnapshotMessage("CALENDAR DATA CURRENT");
      }
    } catch (err) {
      if (cachedSnapshot?.cacheUpdatedAt) {
        setSnapshotMessage(`CACHE ACTIVE • ${String(err)}`);
      } else {
        setSnapshotMessage(`CALENDAR ERROR • ${String(err)}`);
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
  const editableLeaveCount = leaves.filter((leave) => leave.editable).length;
  const holidayYears = Array.from(
    new Set([
      selectedHolidayYear,
      new Date().getFullYear(),
      ...holidays.map((holiday) => yearFromDate(holiday.date)),
    ])
  ).sort((left, right) => left - right);
  const yearHolidays = [...holidays]
    .filter((holiday) => yearFromDate(holiday.date) === selectedHolidayYear)
    .sort((left, right) => left.date.localeCompare(right.date));
  const nextHoliday =
    [...holidays]
      .filter((holiday) => {
        const date = parseCalendarDate(holiday.date);
        date.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return date >= today;
      })
      .sort((left, right) => left.date.localeCompare(right.date))[0] ?? null;
  const holidayMonths = Array.from({ length: 12 }, (_, monthIndex) => ({
    monthIndex,
    label: formatMonthLabel(selectedHolidayYear, monthIndex),
    holidays: yearHolidays.filter(
      (holiday) => monthFromDate(holiday.date) === monthIndex
    ),
  }));

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
    setActionMessage(`EDITING LEAVE • ${leave.employeeName.toUpperCase()}`);
  }

  function beginEditHoliday(holiday: HolidayView) {
    setHolidayForm({
      id: holiday.id,
      title: holiday.title,
      date: holiday.date,
      note: holiday.note ?? "",
    });
    setSelectedHolidayYear(yearFromDate(holiday.date));
    setActionMessage(`EDITING HOLIDAY • ${holiday.title.toUpperCase()}`);
  }

  async function handleSaveLeave(event: FormEvent<HTMLFormElement>) {
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
      setActionMessage("LEAVE UPDATED");
    } catch (err) {
      setActionMessage(`LEAVE SAVE FAILED • ${String(err)}`);
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
      setActionMessage("LEAVE REMOVED");
    } catch (err) {
      setActionMessage(`LEAVE DELETE FAILED • ${String(err)}`);
    } finally {
      setLeaveSaving(false);
    }
  }

  async function handleSaveHoliday(event: FormEvent<HTMLFormElement>) {
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
      setActionMessage("HOLIDAY UPDATED");
    } catch (err) {
      setActionMessage(`HOLIDAY SAVE FAILED • ${String(err)}`);
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
      setActionMessage("HOLIDAY REMOVED");
    } catch (err) {
      setActionMessage(`HOLIDAY DELETE FAILED • ${String(err)}`);
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
          <SkeletonTable rows={3} cols={3} />
        </div>
      </div>
    );
  }

  const statusTone = snapshotMessage?.includes("ERROR")
    ? "var(--lcars-red)"
    : refreshing
      ? "var(--lcars-cyan)"
      : cacheUpdatedAt
        ? "var(--lcars-green)"
        : "var(--lcars-orange)";
  const statusLabel = snapshotMessage?.includes("ERROR")
    ? "ERROR"
    : refreshing
      ? "UPDATING"
      : cacheUpdatedAt
        ? "CACHE READY"
        : "LIVE";

  const metricsGridStyle = {
    ...styles.metricsGrid,
    gridTemplateColumns:
      viewportWidth < 760 ? "repeat(2, minmax(0, 1fr))" : styles.metricsGrid.gridTemplateColumns,
  };
  const splitGridStyle = {
    ...styles.splitGrid,
    gridTemplateColumns:
      viewportWidth < 1040 ? "1fr" : (styles.splitGrid.gridTemplateColumns as string),
  };
  const monthGridStyle = {
    ...styles.monthGrid,
    gridTemplateColumns:
      viewportWidth < 1180
        ? "repeat(auto-fit, minmax(180px, 1fr))"
        : (styles.monthGrid.gridTemplateColumns as string),
  };

  return (
    <div>
      <h1 style={styles.pageTitle}>CALENDAR</h1>
      <div style={styles.pageTitleBar} />

      {(snapshotMessage || cacheUpdatedAt || refreshing) && (
        <div style={{ ...styles.statusBanner, borderLeftColor: statusTone }}>
          <div>
            <div style={{ ...styles.statusLabel, color: statusTone }}>{statusLabel}</div>
            {snapshotMessage ? (
              <div style={styles.statusText}>{snapshotMessage}</div>
            ) : null}
          </div>
          {cacheUpdatedAt ? (
            <div style={styles.statusMeta}>
              CACHE {formatSnapshotTimestamp(cacheUpdatedAt)}
            </div>
          ) : null}
        </div>
      )}

      {actionMessage ? <div style={styles.actionBanner}>{actionMessage}</div> : null}

      <div style={metricsGridStyle}>
        <MetricCard
          label="CREW WINDOW"
          value={`${activeEmployees.length}`}
          meta={`${leaves.length} LEAVE ROWS`}
          tone="var(--lcars-cyan)"
        />
        <MetricCard
          label="ACTIVE LEAVE"
          value={`${activeLeaveCount}`}
          meta={`${pendingLeaveCount} PENDING`}
          tone="var(--lcars-green)"
        />
        <MetricCard
          label="HOLIDAY WINDOW"
          value={`${yearHolidays.length}`}
          meta={`${selectedHolidayYear}`}
          tone="var(--lcars-orange)"
        />
        <MetricCard
          label="NEXT HOLIDAY"
          value={nextHoliday ? formatDate(nextHoliday.date).toUpperCase() : "NONE"}
          meta={nextHoliday ? nextHoliday.title.toUpperCase() : "CLEAR"}
          tone="var(--lcars-yellow)"
        />
      </div>

      <div style={styles.card}>
        <div style={styles.panelHeader}>
          <div>
            <div style={styles.sectionTitle}>LEAVE CONTROL</div>
            <div style={styles.sectionCaption}>LOCAL TRACKER / HULY OVERLAY</div>
          </div>
          <div style={styles.headerMeta}>{editableLeaveCount} LOCAL EDITS</div>
        </div>
        <div style={styles.sectionDivider} />
        <div style={splitGridStyle}>
          <div style={styles.controlCard}>
            <div style={styles.controlTitle}>
              {leaveForm.id ? "EDIT LEAVE" : "ADD LEAVE"}
            </div>
            <div style={styles.controlCaption}>MANUAL ENTRIES STAY EDITABLE</div>
            <form onSubmit={handleSaveLeave} style={styles.formStack}>
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
                    <option value="">No active crew</option>
                  ) : null}
                  {activeEmployees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={styles.fieldRow}>
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
              </div>
              <div style={styles.fieldRow}>
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
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Note</label>
                <textarea
                  value={leaveForm.note ?? ""}
                  onChange={(event) =>
                    setLeaveForm((current) => ({
                      ...current,
                      note: event.target.value,
                    }))
                  }
                  placeholder="Optional context"
                  style={styles.textarea}
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
                  {leaveSaving ? "Saving..." : leaveForm.id ? "Update Leave" : "Add Leave"}
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
          </div>

          <div style={styles.surfaceCard}>
            <div style={styles.surfaceHeader}>
              <div style={styles.controlTitle}>LEAVE WATCH</div>
              <div style={styles.headerMeta}>{activeLeaveCount} ACTIVE</div>
            </div>
            <div style={styles.sectionDivider} />
            {leaves.length === 0 ? (
              <div style={styles.emptyText}>NO LEAVE REQUESTS</div>
            ) : (
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>CREW</th>
                      <th style={styles.th}>SOURCE</th>
                      <th style={styles.th}>TYPE</th>
                      <th style={styles.th}>WINDOW</th>
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
                            <div style={styles.personWrap}>
                              <Avatar name={leave.employeeName} size={24} />
                              <div>
                                <div style={styles.tablePrimary}>{leave.employeeName}</div>
                                {leave.note ? (
                                  <div style={styles.tableSecondary}>{leave.note}</div>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td style={styles.td}>
                            <SourcePill source={leave.source} />
                          </td>
                          <td style={styles.td}>{leave.leaveType.toUpperCase()}</td>
                          <td style={styles.tdMono}>
                            {formatDate(leave.dateFrom)} to {formatDate(leave.dateTo)}
                          </td>
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
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.panelHeader}>
          <div>
            <div style={styles.sectionTitle}>HOLIDAY CALENDAR</div>
            <div style={styles.sectionCaption}>YEAR VIEW / LOCAL OVERRIDES</div>
          </div>
          <div style={styles.headerMeta}>{yearHolidays.length} IN VIEW</div>
        </div>
        <div style={styles.sectionDivider} />
        <div style={splitGridStyle}>
          <div style={styles.controlCard}>
            <div style={styles.controlTitle}>
              {holidayForm.id ? "EDIT HOLIDAY" : "ADD HOLIDAY"}
            </div>
            <div style={styles.controlCaption}>LOCAL HOLIDAYS MERGE INTO THE SHARED VIEW</div>
            <div style={styles.field}>
              <label style={styles.label}>Year View</label>
              <select
                value={selectedHolidayYear}
                onChange={(event) => setSelectedHolidayYear(Number(event.target.value))}
                style={styles.input}
              >
                {holidayYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
            <form onSubmit={handleSaveHoliday} style={styles.formStack}>
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
              <div style={styles.field}>
                <label style={styles.label}>Note</label>
                <textarea
                  value={holidayForm.note ?? ""}
                  onChange={(event) =>
                    setHolidayForm((current) => ({
                      ...current,
                      note: event.target.value,
                    }))
                  }
                  placeholder="Office closure or regional note"
                  style={styles.textarea}
                  disabled={holidaySaving}
                />
              </div>
              <div style={styles.buttonRow}>
                <button
                  type="submit"
                  disabled={holidaySaving}
                  style={{ ...styles.primaryButton, opacity: holidaySaving ? 0.55 : 1 }}
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
          </div>

          <div style={styles.surfaceCard}>
            <div style={styles.surfaceHeader}>
              <div style={styles.controlTitle}>HOLIDAY WINDOW</div>
              <div style={styles.headerMeta}>{selectedHolidayYear}</div>
            </div>
            <div style={styles.sectionDivider} />
            {holidays.length === 0 ? (
              <div style={styles.emptyText}>NO HOLIDAYS CONFIGURED</div>
            ) : yearHolidays.length === 0 ? (
              <div style={styles.emptyText}>NO HOLIDAYS FOR {selectedHolidayYear}</div>
            ) : (
              <div style={styles.holidayList}>
                {yearHolidays.map((holiday) => (
                  <div
                    key={holiday.id}
                    style={{
                      ...styles.holidayRow,
                      background: isToday(holiday.date)
                        ? "rgba(255, 153, 0, 0.06)"
                        : "transparent",
                    }}
                  >
                    <div>
                      <div style={styles.holidayTitleRow}>
                        <span style={styles.tablePrimary}>{holiday.title.toUpperCase()}</span>
                        <SourcePill source={holiday.source} />
                        {isToday(holiday.date) ? (
                          <span style={styles.todayPill}>TODAY</span>
                        ) : null}
                      </div>
                      <div style={styles.tableSecondary}>{formatDate(holiday.date)}</div>
                      {holiday.note ? (
                        <div style={styles.tableSecondary}>{holiday.note}</div>
                      ) : null}
                    </div>
                    <div style={styles.inlineActionRow}>
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
                      ) : (
                        <span style={styles.rowMetaText}>SYNCED</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={monthGridStyle}>
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
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  pageTitle: lcarsPageStyles.pageTitle,
  pageTitleBar: lcarsPageStyles.pageTitleBar,
  card: lcarsPageStyles.card,
  sectionTitle: lcarsPageStyles.sectionTitle,
  sectionCaption: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    color: "var(--lcars-lavender)",
    letterSpacing: "1.4px",
    textTransform: "uppercase",
  },
  sectionDivider: lcarsPageStyles.sectionDivider,
  statusBanner: {
    ...lcarsPageStyles.subtleCard,
    borderLeftWidth: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 18,
  },
  statusLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  statusText: {
    color: "var(--lcars-tan)",
    fontSize: 12,
    lineHeight: 1.6,
  },
  statusMeta: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: "var(--lcars-lavender)",
  },
  actionBanner: {
    ...lcarsPageStyles.subtleCard,
    borderLeftColor: "var(--lcars-cyan)",
    borderLeftWidth: 8,
    marginBottom: 18,
    color: "var(--lcars-tan)",
    fontSize: 12,
    lineHeight: 1.5,
  },
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 12,
    marginBottom: 18,
  },
  metricCard: {
    ...lcarsPageStyles.subtleCard,
    minHeight: 102,
    padding: "14px 16px",
  },
  metricLabel: {
    ...lcarsPageStyles.metricLabel,
    marginBottom: 10,
  },
  metricValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 24,
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: "-0.04em",
  },
  metricMeta: {
    marginTop: 10,
    fontSize: 10,
    color: "var(--lcars-lavender)",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    lineHeight: 1.5,
  },
  panelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
  },
  headerMeta: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: "var(--lcars-lavender)",
  },
  splitGrid: {
    display: "grid",
    gridTemplateColumns: "360px minmax(0, 1fr)",
    gap: 18,
  },
  controlCard: {
    ...lcarsPageStyles.subtleCard,
    borderLeftColor: "var(--lcars-cyan)",
  },
  surfaceCard: {
    ...lcarsPageStyles.subtleCard,
    borderLeftColor: "var(--lcars-orange)",
  },
  controlTitle: {
    color: "var(--lcars-orange)",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 12,
    letterSpacing: "0.12em",
  },
  controlCaption: {
    marginTop: 6,
    marginBottom: 14,
    fontSize: 11,
    color: "var(--lcars-lavender)",
    lineHeight: 1.6,
  },
  surfaceHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  formStack: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  fieldRow: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
  },
  label: {
    ...lcarsPageStyles.metricLabel,
    marginBottom: 0,
  },
  input: lcarsPageStyles.input,
  textarea: {
    ...lcarsPageStyles.input,
    minHeight: 78,
    resize: "vertical",
  },
  buttonRow: lcarsPageStyles.buttonRow,
  primaryButton: lcarsPageStyles.primaryButton,
  ghostButton: lcarsPageStyles.ghostButton,
  emptyText: lcarsPageStyles.emptyText,
  tableWrap: {
    overflowX: "auto",
  },
  table: {
    ...lcarsPageStyles.table,
    minWidth: 840,
  },
  th: lcarsPageStyles.th,
  td: lcarsPageStyles.td,
  tdMono: lcarsPageStyles.tdMono,
  personWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  tablePrimary: {
    color: "var(--lcars-tan)",
    fontSize: 12,
  },
  tableSecondary: {
    marginTop: 4,
    fontSize: 11,
    color: "var(--text-quaternary)",
    lineHeight: 1.5,
  },
  statusPill: {
    display: "inline-flex",
    alignItems: "center",
    border: "1px solid rgba(153, 153, 204, 0.24)",
    padding: "3px 8px",
    borderRadius: 999,
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    letterSpacing: "1px",
  },
  sourcePill: {
    display: "inline-flex",
    alignItems: "center",
    border: "1px solid rgba(153, 153, 204, 0.24)",
    padding: "3px 8px",
    borderRadius: 999,
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    letterSpacing: "1px",
  },
  inlineActionRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
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
  holidayList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginBottom: 18,
  },
  holidayRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderBottom: "1px solid rgba(153, 153, 204, 0.08)",
  },
  holidayTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 4,
  },
  todayPill: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 8,
    fontWeight: 600,
    color: "var(--lcars-cyan)",
    border: "1px solid var(--lcars-cyan)",
    padding: "1px 6px",
    borderRadius: 999,
    letterSpacing: "1px",
  },
  monthGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 12,
  },
  monthCard: {
    ...lcarsPageStyles.subtleCard,
    borderLeftColor: "var(--lcars-peach)",
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
    lineHeight: 1.45,
    textAlign: "right",
  },
};
