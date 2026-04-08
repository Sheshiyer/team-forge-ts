import { useState, useEffect, useCallback } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { useViewportWidth } from "../hooks/useViewportWidth";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";
import { SkeletonTable } from "../components/ui/Skeleton";
import Avatar from "../components/ui/Avatar";
import type {
  DepartmentView,
  Employee,
  HolidayView,
  LeaveView,
  ManualHolidayInput,
  ManualLeaveInput,
  OrgChartView,
  OrgDepartmentMappingView,
  OrgPersonView,
  TeamSnapshotView,
} from "../lib/types";

type RoleField = "headPersonId" | "teamLeadPersonId";
type DragPayload =
  | { kind: "person"; personId: string }
  | { kind: "department"; departmentId: string };

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

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.min((current / total) * 100, 100) : 0;
  const color =
    pct >= 80
      ? "var(--lcars-green)"
      : pct >= 50
        ? "var(--lcars-orange)"
        : "var(--lcars-yellow)";
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
      <span
        style={{
          fontSize: 12,
          fontFamily: "'JetBrains Mono', monospace",
          color: "var(--lcars-lavender)",
          whiteSpace: "nowrap",
        }}
      >
        {current.toFixed(0)}h / {total.toFixed(0)}h
      </span>
    </div>
  );
}

function parseTeamDate(dateStr: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  return new Date(dateStr);
}

function isCurrentlyOnLeave(dateFrom: string, dateTo: string): boolean {
  const now = new Date();
  const start = parseTeamDate(dateFrom);
  const end = parseTeamDate(dateTo);
  end.setHours(23, 59, 59, 999);
  return now >= start && now <= end;
}

function isToday(dateStr: string): boolean {
  const d = parseTeamDate(dateStr);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function formatDate(dateStr: string): string {
  return parseTeamDate(dateStr).toLocaleDateString("en-US", {
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

function yearFromDate(dateStr: string): number {
  return parseTeamDate(dateStr).getFullYear();
}

function monthFromDate(dateStr: string): number {
  return parseTeamDate(dateStr).getMonth();
}

function formatSnapshotTimestamp(value: string): string {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function dedupe(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

function normalizeDraftDepartments(
  departments: OrgDepartmentMappingView[]
): OrgDepartmentMappingView[] {
  return departments.map((department) => {
    const memberPersonIds = dedupe([
      ...department.memberPersonIds,
      ...(department.headPersonId ? [department.headPersonId] : []),
      ...(department.teamLeadPersonId ? [department.teamLeadPersonId] : []),
    ]);

    return {
      ...department,
      memberPersonIds,
    };
  });
}

function removePersonFromDepartment(
  department: OrgDepartmentMappingView,
  personId: string
): OrgDepartmentMappingView {
  return {
    ...department,
    memberPersonIds: department.memberPersonIds.filter((id) => id !== personId),
    headPersonId:
      department.headPersonId === personId ? null : department.headPersonId,
    teamLeadPersonId:
      department.teamLeadPersonId === personId
        ? null
        : department.teamLeadPersonId,
  };
}

function movePersonToDepartment(
  departments: OrgDepartmentMappingView[],
  personId: string,
  departmentId: string
): OrgDepartmentMappingView[] {
  return normalizeDraftDepartments(
    departments.map((department) => {
      const cleared = removePersonFromDepartment(department, personId);
      if (department.id !== departmentId) {
        return cleared;
      }

      return {
        ...cleared,
        memberPersonIds: dedupe([...cleared.memberPersonIds, personId]),
      };
    })
  );
}

function unassignPerson(
  departments: OrgDepartmentMappingView[],
  personId: string
): OrgDepartmentMappingView[] {
  return normalizeDraftDepartments(
    departments.map((department) => removePersonFromDepartment(department, personId))
  );
}

function reorderItems(ids: string[], draggedId: string, targetId: string): string[] {
  if (draggedId === targetId) return ids;

  const withoutDragged = ids.filter((id) => id !== draggedId);
  const targetIndex = withoutDragged.indexOf(targetId);
  if (targetIndex === -1) {
    return ids;
  }

  withoutDragged.splice(targetIndex, 0, draggedId);
  return withoutDragged;
}

function roleBadge(label: string, color: string) {
  return (
    <span
      style={{
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 8,
        fontWeight: 600,
        color,
        border: `1px solid ${color}`,
        padding: "1px 6px",
        borderRadius: 2,
        letterSpacing: "1px",
      }}
    >
      {label}
    </span>
  );
}

function personMatchesSearch(person: OrgPersonView, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  const haystack = [person.name, person.email ?? "", person.personId]
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

function departmentAccent(name: string): string {
  switch (name.toLowerCase()) {
    case "leadership":
      return "var(--lcars-peach)";
    case "engineering":
      return "var(--lcars-cyan)";
    case "marketing":
      return "var(--lcars-orange)";
    case "organization":
      return "var(--lcars-lavender)";
    default:
      return "var(--lcars-peach)";
  }
}

function dropShadow(color: string): string {
  return `0 0 0 1px ${color}55, 0 0 18px ${color}22`;
}

type CrewCardProps = {
  person: OrgPersonView;
  subtitle: string;
  badges?: React.ReactNode;
  accent: string;
  compact?: boolean;
  draggable?: boolean;
  dragging?: boolean;
  onDragStart?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  onRemove?: () => void;
};

function CrewCard({
  person,
  subtitle,
  badges,
  accent,
  compact = false,
  draggable = false,
  dragging = false,
  onDragStart,
  onDragEnd,
  onRemove,
}: CrewCardProps) {
  return (
    <div
      draggable={draggable}
      onDragStart={(event) => {
        event.stopPropagation();
        onDragStart?.(event);
      }}
      onDragEnd={(event) => {
        event.stopPropagation();
        onDragEnd?.();
      }}
      style={{
        ...styles.crewCard,
        ...(compact ? styles.crewCardCompact : null),
        borderLeft: `3px solid ${accent}`,
        cursor: draggable ? "grab" : "default",
        opacity: dragging ? 0.55 : person.active ? 1 : 0.68,
      }}
    >
      <Avatar name={person.name} size={compact ? 22 : 28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={styles.crewCardTitleRow}>
          <span style={styles.crewCardName}>{person.name}</span>
          {badges}
          {!person.active && roleBadge("INACTIVE", "var(--lcars-yellow)")}
        </div>
        <div style={styles.crewCardMeta}>{subtitle}</div>
      </div>
      {onRemove ? (
        <button
          onClick={onRemove}
          style={styles.cardRemoveButton}
          aria-label={`Remove ${person.name}`}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

const EMPTY_LEAVE_FORM: ManualLeaveInput = {
  id: null,
  employeeId: "",
  leaveType: "Vacation",
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

function Team() {
  const api = useInvoke();
  const viewportWidth = useViewportWidth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<DepartmentView[]>([]);
  const [orgChart, setOrgChart] = useState<OrgChartView | null>(null);
  const [draftDepartments, setDraftDepartments] = useState<
    OrgDepartmentMappingView[]
  >([]);
  const [departmentOrder, setDepartmentOrder] = useState<string[]>([]);
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null);
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const [peopleSearch, setPeopleSearch] = useState("");
  const [orgMessage, setOrgMessage] = useState<string | null>(null);
  const [orgSaving, setOrgSaving] = useState(false);
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
  const [teamActionMessage, setTeamActionMessage] = useState<string | null>(null);
  const [selectedHolidayYear, setSelectedHolidayYear] = useState<number>(
    new Date().getFullYear()
  );
  const isCompactLayout = viewportWidth < 1180;
  const isTightForms = viewportWidth < 920;

  const applySnapshot = useCallback((snapshot: TeamSnapshotView) => {
    setDepartments(snapshot.departments);
    setLeaves(snapshot.leaves);
    setHolidays(snapshot.holidays);
    setCacheUpdatedAt(snapshot.cacheUpdatedAt);

    if (snapshot.orgChart) {
      const normalized = normalizeDraftDepartments(snapshot.orgChart.departments);
      setOrgChart(snapshot.orgChart);
      setDraftDepartments(normalized);
      setDepartmentOrder(normalized.map((department) => department.id));
      setOrgMessage(null);
    } else {
      setOrgChart(null);
      setDraftDepartments([]);
      setDepartmentOrder([]);
      setOrgMessage(
        snapshot.hulyError
          ? `Error: ${String(snapshot.hulyError)}`
          : "HULY ORG CHART DATA IS NOT AVAILABLE"
      );
    }
  }, []);

  const load = useCallback(async () => {
    let cachedSnapshot: TeamSnapshotView | null = null;

    setLoading(true);
    setRefreshing(true);
    setSnapshotMessage(null);
    setTeamActionMessage(null);
    setOrgMessage(null);

    try {
      const roster = await api.getEmployees();
      setEmployees(roster);
      setLeaveForm((current) =>
        current.employeeId || roster.length === 0
          ? current
          : { ...current, employeeId: roster.find((item) => item.isActive)?.id ?? roster[0].id }
      );
    } catch (err) {
      setEmployees([]);
      setSnapshotMessage(`Team roster read failed: ${String(err)}`);
    }

    try {
      cachedSnapshot = await api.getTeamSnapshot();
      applySnapshot(cachedSnapshot);

      if (cachedSnapshot.cacheUpdatedAt) {
        setSnapshotMessage("Showing cached Team data while live Huly refresh runs.");
      } else {
        setSnapshotMessage("No Team cache yet. Hydrating Team data from Huly.");
      }
    } catch (err) {
      setDepartments([]);
      setLeaves([]);
      setHolidays([]);
      setOrgChart(null);
      setDraftDepartments([]);
      setDepartmentOrder([]);
      setCacheUpdatedAt(null);
      setOrgMessage(null);
      setSnapshotMessage(`Team cache read failed: ${String(err)}`);
    } finally {
      setLoading(false);
    }

    try {
      const refreshed = await api.refreshTeamSnapshot();
      applySnapshot(refreshed);
      if (refreshed.hulyError) {
        setSnapshotMessage(
          `Live Huly refresh failed. Showing cached Team data. Details: ${refreshed.hulyError}`
        );
      } else {
        setSnapshotMessage("Live Team refresh complete.");
      }
    } catch (err) {
      if (cachedSnapshot?.cacheUpdatedAt) {
        setSnapshotMessage(
          `Live Huly refresh failed. Showing cached Team data. Details: ${String(err)}`
        );
      } else {
        setSnapshotMessage(`Live Team refresh failed: ${String(err)}`);
      }
    } finally {
      setRefreshing(false);
    }
  }, [api, applySnapshot]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setDepartmentOrder((current) => {
      const ids = draftDepartments.map((department) => department.id);
      if (ids.length === 0) return [];
      const retained = current.filter((id) => ids.includes(id));
      const missing = ids.filter((id) => !retained.includes(id));
      return [...retained, ...missing];
    });
  }, [draftDepartments]);

  const activeEmployees = employees.filter((employee) => employee.isActive);
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

  function resetLeaveForm() {
    setLeaveForm({
      ...EMPTY_LEAVE_FORM,
      employeeId: activeEmployees[0]?.id ?? "",
    });
  }

  function resetHolidayForm() {
    setHolidayForm(EMPTY_HOLIDAY_FORM);
  }

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
    setTeamActionMessage(`Editing local leave entry for ${leave.employeeName}.`);
  }

  function beginEditHoliday(holiday: HolidayView) {
    setHolidayForm({
      id: holiday.id,
      title: holiday.title,
      date: holiday.date,
      note: holiday.note ?? "",
    });
    setSelectedHolidayYear(yearFromDate(holiday.date));
    setTeamActionMessage(`Editing local holiday ${holiday.title}.`);
  }

  async function handleSaveLeave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLeaveSaving(true);
    setTeamActionMessage(null);

    try {
      const snapshot = await api.saveManualLeave({
        ...leaveForm,
        note: leaveForm.note?.trim() || null,
      });
      applySnapshot(snapshot);
      resetLeaveForm();
      setTeamActionMessage("Local leave tracker updated.");
    } catch (err) {
      setTeamActionMessage(`Leave save failed: ${String(err)}`);
    } finally {
      setLeaveSaving(false);
    }
  }

  async function handleDeleteLeave(id: string) {
    setLeaveSaving(true);
    setTeamActionMessage(null);

    try {
      const snapshot = await api.deleteManualLeave(id);
      applySnapshot(snapshot);
      if (leaveForm.id === id) {
        resetLeaveForm();
      }
      setTeamActionMessage("Local leave entry removed.");
    } catch (err) {
      setTeamActionMessage(`Leave delete failed: ${String(err)}`);
    } finally {
      setLeaveSaving(false);
    }
  }

  async function handleSaveHoliday(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHolidaySaving(true);
    setTeamActionMessage(null);

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
      setTeamActionMessage("Holiday calendar updated.");
    } catch (err) {
      setTeamActionMessage(`Holiday save failed: ${String(err)}`);
    } finally {
      setHolidaySaving(false);
    }
  }

  async function handleDeleteHoliday(id: string) {
    setHolidaySaving(true);
    setTeamActionMessage(null);

    try {
      const snapshot = await api.deleteManualHoliday(id);
      applySnapshot(snapshot);
      if (holidayForm.id === id) {
        resetHolidayForm();
      }
      setTeamActionMessage("Local holiday removed.");
    } catch (err) {
      setTeamActionMessage(`Holiday delete failed: ${String(err)}`);
    } finally {
      setHolidaySaving(false);
    }
  }

  function clearDragState() {
    setDragPayload(null);
    setDragTarget(null);
  }

  function updateRole(
    departmentId: string,
    role: RoleField,
    personId: string | null
  ) {
    setDraftDepartments((current) => {
      let next = current;
      if (personId) {
        next = movePersonToDepartment(current, personId, departmentId);
      }
      return normalizeDraftDepartments(
        next.map((department) =>
          department.id === departmentId
            ? { ...department, [role]: personId }
            : department
        )
      );
    });
  }

  function removeRoleOccupant(departmentId: string, role: RoleField) {
    setDraftDepartments((current) =>
      normalizeDraftDepartments(
        current.map((department) =>
          department.id === departmentId
            ? { ...department, [role]: null }
            : department
        )
      )
    );
  }

  function removeDepartmentMember(departmentId: string, personId: string) {
    setDraftDepartments((current) =>
      normalizeDraftDepartments(
        current.map((department) =>
          department.id === departmentId
            ? removePersonFromDepartment(department, personId)
            : department
        )
      )
    );
  }

  function assignDraggedPersonToDepartment(departmentId: string) {
    if (!dragPayload || dragPayload.kind !== "person") return;
    setDraftDepartments((current) =>
      movePersonToDepartment(current, dragPayload.personId, departmentId)
    );
    clearDragState();
  }

  function assignDraggedPersonToRole(departmentId: string, role: RoleField) {
    if (!dragPayload || dragPayload.kind !== "person") return;
    updateRole(departmentId, role, dragPayload.personId);
    clearDragState();
  }

  function unassignDraggedPerson() {
    if (!dragPayload || dragPayload.kind !== "person") return;
    setDraftDepartments((current) =>
      unassignPerson(current, dragPayload.personId)
    );
    clearDragState();
  }

  function reorderDepartmentCards(targetDepartmentId: string) {
    if (!dragPayload || dragPayload.kind !== "department") return;
    setDepartmentOrder((current) =>
      reorderItems(current, dragPayload.departmentId, targetDepartmentId)
    );
    clearDragState();
  }

  async function handleSaveOrgChart() {
    if (!orgChart) return;
    setOrgSaving(true);
    setOrgMessage(null);
    try {
      const result = await api.applyOrgChartMapping(
        draftDepartments.map((department) => ({
          departmentId: department.id,
          headPersonId: department.headPersonId,
          teamLeadPersonId: department.teamLeadPersonId,
          memberPersonIds: department.memberPersonIds,
        }))
      );
      setOrgMessage(result);
      const refreshed = await api.getOrgChart();
      const normalized = normalizeDraftDepartments(refreshed.departments);
      setOrgChart(refreshed);
      setDraftDepartments(normalized);
      setDepartmentOrder(normalized.map((department) => department.id));
    } catch (err) {
      setOrgMessage(`Error: ${String(err)}`);
    } finally {
      setOrgSaving(false);
    }
  }

  function handleResetOrgChart() {
    if (!orgChart) return;
    const normalized = normalizeDraftDepartments(orgChart.departments);
    setDraftDepartments(normalized);
    setDepartmentOrder(normalized.map((department) => department.id));
    setOrgMessage("Draft reset to live Huly state");
  }

  if (loading) {
    return (
      <div>
        <h1 style={styles.pageTitle}>TEAM</h1>
        <div style={styles.pageTitleBar} />
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

  const people = orgChart?.people ?? [];
  const peopleById = new Map(people.map((person) => [person.personId, person]));
  const departmentById = new Map(
    draftDepartments.map((department) => [department.id, department])
  );
  const assignedDepartmentByPerson = new Map<string, string>();

  for (const department of draftDepartments) {
    for (const personId of department.memberPersonIds) {
      if (!assignedDepartmentByPerson.has(personId)) {
        assignedDepartmentByPerson.set(personId, department.id);
      }
    }
  }

  const unassignedPeople = people.filter(
    (person) => !assignedDepartmentByPerson.has(person.personId)
  );

  const visibleDirectoryPeople = [...people]
    .filter((person) => personMatchesSearch(person, peopleSearch))
    .sort((left, right) => {
      const leftUnassigned = assignedDepartmentByPerson.has(left.personId) ? 1 : 0;
      const rightUnassigned = assignedDepartmentByPerson.has(right.personId) ? 1 : 0;
      return (
        leftUnassigned - rightUnassigned ||
        Number(right.active) - Number(left.active) ||
        left.name.localeCompare(right.name)
      );
    });

  const visibleUnassignedPeople = visibleDirectoryPeople.filter(
    (person) => !assignedDepartmentByPerson.has(person.personId)
  );

  const liveDraftSignature = JSON.stringify(
    normalizeDraftDepartments(orgChart?.departments ?? [])
  );
  const currentDraftSignature = JSON.stringify(
    normalizeDraftDepartments(draftDepartments)
  );
  const hasDraftChanges = liveDraftSignature !== currentDraftSignature;
  const assignedCount = people.length - unassignedPeople.length;

  const orderedDepartments = departmentOrder
    .map((departmentId) => departmentById.get(departmentId))
    .filter((department): department is OrgDepartmentMappingView => Boolean(department));

  const dragPersonId = dragPayload?.kind === "person" ? dragPayload.personId : null;
  const dragDepartmentId =
    dragPayload?.kind === "department" ? dragPayload.departmentId : null;
  const orgWorkspaceStyle = {
    ...styles.orgWorkspace,
    gridTemplateColumns: isCompactLayout ? "1fr" : styles.orgWorkspace.gridTemplateColumns,
  };
  const teamRailStyle = {
    ...styles.teamRail,
    position: isCompactLayout ? "static" : styles.teamRail.position,
    top: isCompactLayout ? undefined : styles.teamRail.top,
  };
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

  return (
    <div>
      <h1 style={styles.pageTitle}>TEAM</h1>
      <div style={styles.pageTitleBar} />
      {(snapshotMessage || cacheUpdatedAt || refreshing) && (
        <div style={styles.statusBanner}>
          <div>
            <div style={styles.statusBannerLabel}>
              {refreshing ? "SYNCING SQLITE CACHE" : "TEAM CACHE"}
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
      {teamActionMessage ? (
        <div style={styles.actionBanner}>{teamActionMessage}</div>
      ) : null}

      <div style={{ ...styles.card, borderLeftColor: "var(--lcars-cyan)" }}>
        <h2 style={styles.sectionTitle}>ORG CHART MAPPING</h2>
        <div style={styles.sectionDivider} />

        {!orgChart ? (
          <p style={styles.emptyText}>
            {orgMessage
              ? orgMessage.toUpperCase()
              : "HULY ORG CHART DATA IS NOT AVAILABLE"}
          </p>
        ) : (
          <>
            <div style={styles.orgTopBar}>
              <div style={styles.orgStatGrid}>
                <div style={styles.orgStatCard}>
                  <div style={styles.orgStatValue}>{draftDepartments.length}</div>
                  <div style={styles.orgStatLabel}>DEPARTMENTS</div>
                </div>
                <div style={styles.orgStatCard}>
                  <div style={styles.orgStatValue}>{assignedCount}</div>
                  <div style={styles.orgStatLabel}>ASSIGNED CREW</div>
                </div>
                <div style={styles.orgStatCard}>
                  <div style={styles.orgStatValue}>{unassignedPeople.length}</div>
                  <div style={styles.orgStatLabel}>UNASSIGNED</div>
                </div>
              </div>

              <div style={styles.buttonRow}>
                <button
                  onClick={handleSaveOrgChart}
                  disabled={orgSaving || !hasDraftChanges}
                  style={{
                    ...styles.primaryButton,
                    opacity: orgSaving || !hasDraftChanges ? 0.5 : 1,
                  }}
                >
                  {orgSaving ? "SAVING..." : "SAVE ORG CHART"}
                </button>
                <button
                  onClick={handleResetOrgChart}
                  disabled={!hasDraftChanges || orgSaving}
                  style={{
                    ...styles.ghostButton,
                    opacity: !hasDraftChanges || orgSaving ? 0.5 : 1,
                  }}
                >
                  RESET DRAFT
                </button>
                {orgMessage && (
                  <span
                    style={{
                      ...styles.label,
                      color: orgMessage.startsWith("Error")
                        ? "var(--lcars-red)"
                        : "var(--lcars-green)",
                    }}
                  >
                    {orgMessage.toUpperCase()}
                  </span>
                )}
              </div>

              <div style={styles.helperText}>
                DRAG CREW FROM THE LEFT RAIL INTO HEAD, TEAM LEAD, OR MEMBER DROP
                ZONES. DRAG A DEPARTMENT CARD BY ITS HEADER TO REORDER THE BENTO
                GRID. PEOPLE EXCLUDED IN SETTINGS ARE HIDDEN FROM THIS MAPPING
                VIEW.
              </div>
            </div>

            <div style={orgWorkspaceStyle}>
              <aside style={teamRailStyle}>
                <div style={styles.teamRailHeader}>
                  <div style={styles.teamRailTitle}>CREW DIRECTORY</div>
                  <div style={styles.teamRailMeta}>
                    {visibleDirectoryPeople.length} VISIBLE • {people.length} TOTAL
                  </div>
                </div>

                <div style={styles.field}>
                  <label style={styles.label}>SEARCH TEAM</label>
                  <input
                    value={peopleSearch}
                    onChange={(event) => setPeopleSearch(event.target.value)}
                    placeholder="SEARCH NAME OR EMAIL"
                    style={styles.input}
                  />
                </div>

                <div
                  onDragOver={(event) => {
                    if (!dragPersonId) return;
                    event.preventDefault();
                    setDragTarget("unassigned-zone");
                  }}
                  onDragLeave={() => {
                    if (dragTarget === "unassigned-zone") {
                      setDragTarget(null);
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    unassignDraggedPerson();
                  }}
                  style={{
                    ...styles.unassignedDropZone,
                    boxShadow:
                      dragTarget === "unassigned-zone" && dragPersonId
                        ? dropShadow("var(--lcars-yellow)")
                        : "none",
                  }}
                >
                  <div style={styles.dropZoneLabelRow}>
                    <span style={styles.orgDepartmentTitle}>UNASSIGNED TRAY</span>
                    <span style={styles.orgDepartmentMeta}>
                      {visibleUnassignedPeople.length} READY
                    </span>
                  </div>
                  {visibleUnassignedPeople.length === 0 ? (
                    <div style={styles.helperText}>
                      DROP A PERSON HERE TO CLEAR THEIR DEPARTMENT ASSIGNMENT.
                    </div>
                  ) : (
                    <div style={styles.leftRailList}>
                      {visibleUnassignedPeople.map((person) => (
                        <CrewCard
                          key={`unassigned-${person.personId}`}
                          person={person}
                          subtitle={person.email || "NO EMAIL"}
                          accent="var(--lcars-yellow)"
                          compact
                          draggable
                          dragging={dragPersonId === person.personId}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            setDragPayload({ kind: "person", personId: person.personId });
                          }}
                          onDragEnd={clearDragState}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div style={styles.teamRailHeader}>
                  <div style={styles.teamRailTitle}>FULL ROSTER</div>
                  <div style={styles.teamRailMeta}>DRAG TO ASSIGN</div>
                </div>

                <div style={styles.leftRailList}>
                  {visibleDirectoryPeople.map((person) => {
                    const assignedDepartmentId = assignedDepartmentByPerson.get(
                      person.personId
                    );
                    const assignedDepartment = assignedDepartmentId
                      ? departmentById.get(assignedDepartmentId)
                      : null;
                    const subtitle = person.email
                      ? assignedDepartment
                        ? `${person.email} • ${assignedDepartment.name.toUpperCase()}`
                        : `${person.email} • UNASSIGNED`
                      : assignedDepartment
                        ? `NO EMAIL • ${assignedDepartment.name.toUpperCase()}`
                        : "NO EMAIL • UNASSIGNED";

                    return (
                      <CrewCard
                        key={person.personId}
                        person={person}
                        subtitle={subtitle}
                        accent={
                          assignedDepartment
                            ? departmentAccent(assignedDepartment.name)
                            : "var(--lcars-yellow)"
                        }
                        draggable
                        dragging={dragPersonId === person.personId}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move";
                          setDragPayload({ kind: "person", personId: person.personId });
                        }}
                        onDragEnd={clearDragState}
                      />
                    );
                  })}
                </div>
              </aside>

              <div style={styles.orgCanvas}>
                <div style={styles.bentoGrid}>
                  {orderedDepartments.map((department) => {
                    const accent = departmentAccent(department.name);
                    const memberOnlyPeople = department.memberPersonIds
                      .filter(
                        (personId) =>
                          personId !== department.headPersonId &&
                          personId !== department.teamLeadPersonId
                      )
                      .map((personId) => peopleById.get(personId))
                      .filter((person): person is OrgPersonView => Boolean(person));
                    const headPerson = department.headPersonId
                      ? peopleById.get(department.headPersonId) ?? null
                      : null;
                    const leadPerson = department.teamLeadPersonId
                      ? peopleById.get(department.teamLeadPersonId) ?? null
                      : null;
                    const isLegacyDepartment =
                      department.name.toLowerCase() === "organization";
                    const memberDropKey = `members-${department.id}`;
                    const headDropKey = `head-${department.id}`;
                    const leadDropKey = `lead-${department.id}`;
                    const cardDropKey = `card-${department.id}`;
                    const isDepartmentDragging = dragDepartmentId === department.id;
                    const spansWide =
                      isLegacyDepartment || department.memberPersonIds.length >= 4;

                    return (
                      <section
                        key={department.id}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move";
                          setDragPayload({
                            kind: "department",
                            departmentId: department.id,
                          });
                        }}
                        onDragEnd={clearDragState}
                        onDragOver={(event) => {
                          if (dragPayload?.kind !== "department") return;
                          event.preventDefault();
                          setDragTarget(cardDropKey);
                        }}
                        onDragLeave={() => {
                          if (dragTarget === cardDropKey) {
                            setDragTarget(null);
                          }
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          reorderDepartmentCards(department.id);
                        }}
                        style={{
                          ...styles.bentoCard,
                          ...(spansWide && !isCompactLayout ? styles.bentoCardWide : null),
                          borderTop: `3px solid ${accent}`,
                          opacity: isDepartmentDragging ? 0.6 : 1,
                          boxShadow:
                            dragTarget === cardDropKey &&
                            dragPayload?.kind === "department"
                              ? dropShadow(accent)
                              : "none",
                        }}
                      >
                        <div style={styles.bentoHeader}>
                          <div>
                            <div style={styles.orgDepartmentTitle}>
                              {department.name.toUpperCase()}
                            </div>
                            <div style={styles.orgDepartmentMeta}>
                              {department.memberPersonIds.length} MEMBERS
                              {isLegacyDepartment ? " • LEGACY CATCH-ALL" : ""}
                            </div>
                          </div>
                          <div style={styles.bentoHeaderMeta}>
                            <span style={styles.bentoMetaPill}>DRAG CARD</span>
                          </div>
                        </div>

                        <div style={styles.roleGrid}>
                          <div
                            onDragOver={(event) => {
                              if (!dragPersonId) return;
                              event.preventDefault();
                              setDragTarget(headDropKey);
                            }}
                            onDragLeave={() => {
                              if (dragTarget === headDropKey) {
                                setDragTarget(null);
                              }
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              assignDraggedPersonToRole(department.id, "headPersonId");
                            }}
                            style={{
                              ...styles.roleDropZone,
                              boxShadow:
                                dragTarget === headDropKey && dragPersonId
                                  ? dropShadow(accent)
                                  : "none",
                            }}
                          >
                            <div style={styles.dropZoneLabelRow}>
                              <span style={styles.label}>HEAD</span>
                              <button
                                onClick={() =>
                                  removeRoleOccupant(department.id, "headPersonId")
                                }
                                disabled={!headPerson}
                                style={{
                                  ...styles.roleActionButton,
                                  opacity: headPerson ? 1 : 0.35,
                                }}
                              >
                                CLEAR
                              </button>
                            </div>
                            {headPerson ? (
                              <CrewCard
                                person={headPerson}
                                subtitle={headPerson.email || "NO EMAIL"}
                                badges={roleBadge("HEAD", accent)}
                                accent={accent}
                                compact
                                draggable
                                dragging={dragPersonId === headPerson.personId}
                                onDragStart={(event) => {
                                  event.dataTransfer.effectAllowed = "move";
                                  setDragPayload({
                                    kind: "person",
                                    personId: headPerson.personId,
                                  });
                                }}
                                onDragEnd={clearDragState}
                              />
                            ) : (
                              <div style={styles.dropPlaceholder}>
                                DROP A CREW MEMBER HERE
                              </div>
                            )}
                          </div>

                          <div
                            onDragOver={(event) => {
                              if (!dragPersonId) return;
                              event.preventDefault();
                              setDragTarget(leadDropKey);
                            }}
                            onDragLeave={() => {
                              if (dragTarget === leadDropKey) {
                                setDragTarget(null);
                              }
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              assignDraggedPersonToRole(
                                department.id,
                                "teamLeadPersonId"
                              );
                            }}
                            style={{
                              ...styles.roleDropZone,
                              boxShadow:
                                dragTarget === leadDropKey && dragPersonId
                                  ? dropShadow(accent)
                                  : "none",
                            }}
                          >
                            <div style={styles.dropZoneLabelRow}>
                              <span style={styles.label}>TEAM LEAD</span>
                              <button
                                onClick={() =>
                                  removeRoleOccupant(
                                    department.id,
                                    "teamLeadPersonId"
                                  )
                                }
                                disabled={!leadPerson}
                                style={{
                                  ...styles.roleActionButton,
                                  opacity: leadPerson ? 1 : 0.35,
                                }}
                              >
                                CLEAR
                              </button>
                            </div>
                            {leadPerson ? (
                              <CrewCard
                                person={leadPerson}
                                subtitle={leadPerson.email || "NO EMAIL"}
                                badges={roleBadge("TEAM LEAD", accent)}
                                accent={accent}
                                compact
                                draggable
                                dragging={dragPersonId === leadPerson.personId}
                                onDragStart={(event) => {
                                  event.dataTransfer.effectAllowed = "move";
                                  setDragPayload({
                                    kind: "person",
                                    personId: leadPerson.personId,
                                  });
                                }}
                                onDragEnd={clearDragState}
                              />
                            ) : (
                              <div style={styles.dropPlaceholder}>
                                DROP A CREW MEMBER HERE
                              </div>
                            )}
                          </div>
                        </div>

                        <div
                          onDragOver={(event) => {
                            if (!dragPersonId) return;
                            event.preventDefault();
                            setDragTarget(memberDropKey);
                          }}
                          onDragLeave={() => {
                            if (dragTarget === memberDropKey) {
                              setDragTarget(null);
                            }
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            assignDraggedPersonToDepartment(department.id);
                          }}
                          style={{
                            ...styles.memberDropZone,
                            boxShadow:
                              dragTarget === memberDropKey && dragPersonId
                                ? dropShadow(accent)
                                : "none",
                          }}
                        >
                          <div style={styles.dropZoneLabelRow}>
                            <span style={styles.label}>MEMBERS</span>
                            <span style={styles.orgDepartmentMeta}>
                              DROP TO ASSIGN
                            </span>
                          </div>
                          {memberOnlyPeople.length === 0 ? (
                            <div style={styles.dropPlaceholder}>
                              DROP A CREW MEMBER HERE OR USE HEAD / TEAM LEAD
                              ABOVE.
                            </div>
                          ) : (
                            <div style={styles.memberGrid}>
                              {memberOnlyPeople.map((person) => (
                                <CrewCard
                                  key={`${department.id}-${person.personId}`}
                                  person={person}
                                  subtitle={person.email || "NO EMAIL"}
                                  accent={accent}
                                  compact
                                  draggable
                                  dragging={dragPersonId === person.personId}
                                  onDragStart={(event) => {
                                    event.dataTransfer.effectAllowed = "move";
                                    setDragPayload({
                                      kind: "person",
                                      personId: person.personId,
                                    });
                                  }}
                                  onDragEnd={clearDragState}
                                  onRemove={() =>
                                    removeDepartmentMember(
                                      department.id,
                                      person.personId
                                    )
                                  }
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div style={{ ...styles.card, borderLeftColor: "var(--lcars-peach)" }}>
        <h2 style={styles.sectionTitle}>DEPARTMENT STRUCTURE</h2>
        <div style={styles.sectionDivider} />
        {departments.length === 0 ? (
          <p style={styles.emptyText}>NO DEPARTMENT DATA AVAILABLE</p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 12,
            }}
          >
            {departments.map((dept) => (
              <div
                key={dept.id}
                style={{
                  ...lcarsPageStyles.subtleCard,
                  borderLeftColor: "var(--lcars-peach)",
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
                    <div
                      style={{
                        fontFamily: "'Orbitron', sans-serif",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--lcars-orange)",
                        letterSpacing: "1px",
                      }}
                    >
                      {dept.name.toUpperCase()}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--lcars-lavender)",
                        marginTop: 2,
                      }}
                    >
                      {dept.headName
                        ? `HEAD: ${dept.headName.toUpperCase()}`
                        : "NO HEAD ASSIGNED"}
                    </div>
                  </div>
                  <div
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 11,
                      color: "var(--lcars-lavender)",
                      background: "rgba(153, 153, 204, 0.1)",
                      padding: "2px 8px",
                      borderRadius: "0 10px 10px 0",
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

      <div style={{ ...styles.card, borderLeftColor: "var(--lcars-green)" }}>
        <div style={styles.sectionHeaderRow}>
          <div>
            <h2 style={styles.sectionTitle}>LEAVE TRACKER</h2>
            <p style={styles.sectionHelperText}>
              Add or edit local leave entries here. Huly leave rows remain
              visible but read-only.
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
                      cursor: "default",
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
              Maintain a local yearly holiday calendar here. Huly holidays stay
              read-only and merge into the same Team view.
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
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
                      {isToday(holiday.date) && (
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
                    {holiday.note ? (
                      <div style={styles.inlineNote}>{holiday.note}</div>
                    ) : null}
                  </div>
                </div>
                <div style={styles.inlineActionRow}>
                  <span
                    style={{
                      fontSize: 12,
                      fontFamily: "'JetBrains Mono', monospace",
                      color: "var(--lcars-lavender)",
                    }}
                  >
                    {formatDate(holiday.date)}
                  </span>
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
                            {parseTeamDate(holiday.date).toLocaleDateString("en-US", {
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
  card: lcarsPageStyles.card,
  sectionTitle: lcarsPageStyles.sectionTitle,
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
  sectionDivider: lcarsPageStyles.sectionDivider,
  field: {
    marginBottom: 14,
  },
  label: {
    display: "block",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    color: "var(--lcars-lavender)",
    marginBottom: 6,
    letterSpacing: "1.5px",
    textTransform: "uppercase" as const,
  },
  input: lcarsPageStyles.input,
  editorGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    marginBottom: 18,
    alignItems: "end",
  },
  table: lcarsPageStyles.table,
  th: lcarsPageStyles.th,
  td: lcarsPageStyles.td,
  tdMono: lcarsPageStyles.tdMono,
  emptyText: lcarsPageStyles.emptyText,
  buttonRow: lcarsPageStyles.buttonRow,
  primaryButton: lcarsPageStyles.primaryButton,
  ghostButton: lcarsPageStyles.ghostButton,
  helperText: lcarsPageStyles.helperText,
  inlineNote: {
    color: "var(--lcars-lavender)",
    fontSize: 11,
    lineHeight: 1.45,
  },
  inlineActionRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap" as const,
  },
  inlineActionButton: {
    background: "transparent",
    border: "1px solid rgba(153, 153, 204, 0.24)",
    color: "var(--lcars-lavender)",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    letterSpacing: "1px",
    padding: "5px 8px",
    cursor: "pointer",
  },
  rowMetaText: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    color: "var(--lcars-lavender)",
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
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    color: "var(--lcars-orange)",
    letterSpacing: "1.4px",
    textTransform: "uppercase" as const,
  },
  yearCalendarGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
    marginTop: 18,
  },
  monthCard: {
    background: "var(--bg-console-soft)",
    border: "1px solid rgba(153, 153, 204, 0.14)",
    padding: 14,
    minHeight: 150,
    borderRadius: "0 18px 18px 0",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
  },
  monthCardHeader: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 11,
    color: "var(--lcars-orange)",
    letterSpacing: "1.4px",
    marginBottom: 10,
    textTransform: "uppercase" as const,
  },
  monthCardEmpty: {
    color: "var(--text-quaternary)",
    fontSize: 11,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: "1px",
    textTransform: "uppercase" as const,
  },
  monthHolidayList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  },
  monthHolidayItem: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
  },
  monthHolidayDate: {
    color: "var(--lcars-cyan)",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    whiteSpace: "nowrap" as const,
  },
  monthHolidayTitle: {
    color: "var(--lcars-tan)",
    fontSize: 12,
    lineHeight: 1.4,
  },
  orgTopBar: {
    marginBottom: 20,
  },
  orgStatGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 12,
    marginBottom: 16,
  },
  orgStatCard: {
    ...lcarsPageStyles.subtleCard,
    borderLeftColor: "var(--lcars-orange)",
    padding: 14,
  },
  orgStatValue: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 24,
    color: "var(--lcars-orange)",
    letterSpacing: "1px",
  },
  orgStatLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    color: "var(--lcars-lavender)",
    letterSpacing: "1.5px",
    marginTop: 4,
  },
  orgWorkspace: {
    display: "grid",
    gridTemplateColumns: "280px minmax(0, 1fr)",
    gap: 18,
    alignItems: "start",
  },
  teamRail: {
    position: "sticky" as const,
    top: 0,
    display: "flex",
    flexDirection: "column" as const,
    gap: 14,
    background: "var(--bg-console-soft)",
    border: "1px solid rgba(153, 153, 204, 0.12)",
    padding: 16,
    borderRadius: "0 18px 18px 0",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
  },
  teamRailHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 8,
  },
  teamRailTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 11,
    color: "var(--lcars-orange)",
    letterSpacing: "1.5px",
  },
  teamRailMeta: {
    fontSize: 10,
    color: "var(--lcars-lavender)",
    letterSpacing: "1px",
  },
  leftRailList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
    maxHeight: 420,
    overflowY: "auto" as const,
    paddingRight: 4,
  },
  unassignedDropZone: {
    background: "rgba(18, 18, 34, 0.88)",
    border: "1px dashed rgba(255, 204, 0, 0.35)",
    padding: 12,
    borderRadius: "0 16px 16px 0",
  },
  orgCanvas: {
    minWidth: 0,
  },
  bentoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 16,
    alignItems: "start",
  },
  bentoCard: {
    background: "var(--bg-console-soft)",
    border: "1px solid rgba(153, 153, 204, 0.14)",
    padding: 16,
    minHeight: 260,
    borderRadius: "0 20px 20px 0",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
  },
  bentoCardWide: {
    gridColumn: "span 2",
  },
  bentoHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  },
  bentoHeaderMeta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  bentoMetaPill: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    color: "var(--lcars-lavender)",
    border: "1px solid rgba(153, 153, 204, 0.24)",
    padding: "3px 8px",
    letterSpacing: "1px",
  },
  orgDepartmentTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 12,
    fontWeight: 700,
    color: "var(--lcars-orange)",
    letterSpacing: "1.5px",
  },
  orgDepartmentMeta: {
    fontSize: 11,
    color: "var(--lcars-lavender)",
    marginTop: 4,
    letterSpacing: "0.6px",
  },
  roleGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
    marginBottom: 12,
  },
  roleDropZone: {
    background: "rgba(18, 18, 34, 0.92)",
    border: "1px solid rgba(153, 153, 204, 0.18)",
    padding: 12,
    minHeight: 92,
    borderRadius: "0 14px 14px 0",
  },
  memberDropZone: {
    background: "rgba(18, 18, 34, 0.92)",
    border: "1px solid rgba(153, 153, 204, 0.18)",
    padding: 12,
    minHeight: 128,
    borderRadius: "0 14px 14px 0",
  },
  dropZoneLabelRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  roleActionButton: {
    background: "transparent",
    border: "none",
    color: "var(--lcars-lavender)",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    letterSpacing: "1px",
    cursor: "pointer",
    padding: 0,
  },
  dropPlaceholder: {
    minHeight: 54,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center" as const,
    color: "var(--text-quaternary)",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    lineHeight: 1.5,
    letterSpacing: "1px",
    textTransform: "uppercase" as const,
  },
  memberGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 8,
  },
  crewCard: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "rgba(26, 26, 46, 0.92)",
    padding: "10px 12px",
    minWidth: 0,
    borderRadius: "0 14px 14px 0",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
  },
  crewCardCompact: {
    padding: "8px 10px",
  },
  crewCardTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap" as const,
    marginBottom: 2,
  },
  crewCardName: {
    color: "var(--lcars-tan)",
    fontSize: 13,
    fontWeight: 500,
    minWidth: 0,
  },
  crewCardMeta: {
    color: "var(--lcars-lavender)",
    fontSize: 11,
    lineHeight: 1.45,
    wordBreak: "break-word" as const,
  },
  cardRemoveButton: {
    background: "transparent",
    border: "none",
    color: "var(--lcars-lavender)",
    fontSize: 18,
    lineHeight: 1,
    cursor: "pointer",
    padding: 0,
  },
};

export default Team;
