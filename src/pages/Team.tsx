import { useState, useEffect, useCallback } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useInvoke } from "../hooks/useInvoke";
import { useViewportWidth } from "../hooks/useViewportWidth";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";
import { SkeletonTable } from "../components/ui/Skeleton";
import Avatar from "../components/ui/Avatar";
import DepartmentCard from "../components/team/DepartmentCard";
import DirectoryPanel, {
  type DirectoryEntry,
} from "../components/team/DirectoryPanel";
import EmployeeSummaryPanel from "../components/team/EmployeeSummaryPanel";
import ValidationBar, {
  type ValidationIssue,
} from "../components/team/ValidationBar";
import type { DirectoryMode } from "../components/team/types";
import type {
  DepartmentView,
  Employee,
  EmployeeSummaryView,
  MonthlyHoursView,
  OrgChartView,
  OrgDepartmentMappingView,
  OrgPersonView,
  TeamSnapshotView,
} from "../lib/types";

type RoleField = "headPersonId" | "teamLeadPersonId";
type AssignmentRole = "member" | RoleField;

type DepartmentHealthSummary = {
  id: string;
  name: string;
  memberCount: number;
  totalHours: number;
  quotaTotal: number;
  headName: string | null;
};

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

function assignPersonToRole(
  departments: OrgDepartmentMappingView[],
  personId: string,
  departmentId: string,
  role: RoleField
): OrgDepartmentMappingView[] {
  const next = movePersonToDepartment(departments, personId, departmentId);
  return normalizeDraftDepartments(
    next.map((department) =>
      department.id === departmentId
        ? { ...department, [role]: personId }
        : department
    )
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

function summarizeDepartmentHealth(
  departments: DepartmentView[]
): DepartmentHealthSummary[] {
  const byName = new Map<string, DepartmentHealthSummary>();

  for (const department of departments) {
    const key = department.name.trim().toLowerCase();
    const current = byName.get(key);

    if (!current) {
      byName.set(key, {
        id: department.id,
        name: department.name,
        memberCount: department.memberCount,
        totalHours: department.totalHours,
        quotaTotal: department.quotaTotal,
        headName: department.headName,
      });
      continue;
    }

    current.memberCount += department.memberCount;
    current.totalHours += department.totalHours;
    current.quotaTotal += department.quotaTotal;
    if (!current.headName && department.headName) {
      current.headName = department.headName;
    }
  }

  return [...byName.values()].sort((left, right) =>
    left.name.localeCompare(right.name)
  );
}

function encodeAssignmentValue(
  departmentId: string,
  role: AssignmentRole
): string {
  return `${departmentId}::${role}`;
}

function parseAssignmentValue(
  value: string
): { departmentId: string; role: AssignmentRole } | null {
  if (value === "unassigned") return null;

  const [departmentId, role] = value.split("::");
  if (
    !departmentId ||
    (role !== "member" &&
      role !== "headPersonId" &&
      role !== "teamLeadPersonId")
  ) {
    return null;
  }

  return { departmentId, role };
}

function currentAssignmentValue(
  departments: OrgDepartmentMappingView[],
  personId: string
): string {
  for (const department of departments) {
    if (department.headPersonId === personId) {
      return encodeAssignmentValue(department.id, "headPersonId");
    }
    if (department.teamLeadPersonId === personId) {
      return encodeAssignmentValue(department.id, "teamLeadPersonId");
    }
    if (department.memberPersonIds.includes(personId)) {
      return encodeAssignmentValue(department.id, "member");
    }
  }

  return "unassigned";
}

function assignmentRoleLabel(role: AssignmentRole): string {
  switch (role) {
    case "headPersonId":
      return "HEAD";
    case "teamLeadPersonId":
      return "TEAM LEAD";
    default:
      return "MEMBER";
  }
}

function describeAssignment(
  departments: OrgDepartmentMappingView[],
  personId: string,
  departmentLabelsById?: Map<string, string>
): string {
  const assignment = parseAssignmentValue(
    currentAssignmentValue(departments, personId)
  );

  if (!assignment) {
    return "UNASSIGNED";
  }

  const department = departments.find((item) => item.id === assignment.departmentId);
  if (!department) {
    return "UNASSIGNED";
  }

  const departmentLabel =
    departmentLabelsById?.get(department.id) ?? department.name.toUpperCase();
  return `${departmentLabel} • ${assignmentRoleLabel(assignment.role)}`;
}

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
  const [peopleSearch, setPeopleSearch] = useState("");
  const [orgMessage, setOrgMessage] = useState<string | null>(null);
  const [orgSaving, setOrgSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [snapshotMessage, setSnapshotMessage] = useState<string | null>(null);
  const [cacheUpdatedAt, setCacheUpdatedAt] = useState<string | null>(null);
  const [teamActionMessage, setTeamActionMessage] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [directoryMode, setDirectoryMode] = useState<DirectoryMode>("unassigned");
  const [employeeSummary, setEmployeeSummary] =
    useState<EmployeeSummaryView | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [monthlyHours, setMonthlyHours] = useState<MonthlyHoursView[]>([]);
  const isCompactLayout = viewportWidth < 1180;
  const isNarrowLayout = viewportWidth < 980;
  const isMobileLayout = viewportWidth < 760;

  const applySnapshot = useCallback((snapshot: TeamSnapshotView) => {
    setDepartments(snapshot.departments);
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
      setSelectedEmployeeId((current) =>
        current && roster.some((item) => item.id === current && item.isActive)
          ? current
          : roster.find((item) => item.isActive)?.id ?? ""
      );
    } catch (err) {
      setEmployees([]);
      setSelectedEmployeeId("");
      setSnapshotMessage(`Team roster read failed: ${String(err)}`);
    }

    try {
      const hours = await api.getMonthlyHours();
      setMonthlyHours(hours);
    } catch {
      setMonthlyHours([]);
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

  useEffect(() => {
    if (activeEmployees.length === 0) {
      setSelectedEmployeeId("");
      return;
    }

    setSelectedEmployeeId((current) =>
      current && activeEmployees.some((employee) => employee.id === current)
        ? current
        : activeEmployees[0].id
    );
  }, [activeEmployees]);

  useEffect(() => {
    if (!selectedEmployeeId) {
      setEmployeeSummary(null);
      setSummaryError(null);
      setSummaryLoading(false);
      return;
    }

    let cancelled = false;
    setSummaryLoading(true);
    setSummaryError(null);

    api
      .getEmployeeSummary(selectedEmployeeId)
      .then((summary) => {
        if (!cancelled) {
          setEmployeeSummary(summary);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setEmployeeSummary(null);
          setSummaryError(String(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSummaryLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api, selectedEmployeeId]);

  function updateRole(
    departmentId: string,
    role: RoleField,
    personId: string | null
  ) {
    setDraftDepartments((current) => {
      if (!personId) {
        return normalizeDraftDepartments(
          current.map((department) =>
            department.id === departmentId
              ? { ...department, [role]: null }
              : department
          )
        );
      }

      return assignPersonToRole(current, personId, departmentId, role);
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

  function applyAssignmentSelection(personId: string, value: string) {
    const assignment = parseAssignmentValue(value);

    if (!assignment) {
      setDraftDepartments((current) => unassignPerson(current, personId));
      return;
    }

    setDraftDepartments((current) =>
      assignment.role === "member"
        ? movePersonToDepartment(current, personId, assignment.departmentId)
        : assignPersonToRole(
            current,
            personId,
            assignment.departmentId,
            assignment.role
          )
    );
  }

  async function handleSaveOrgChart() {
    if (!orgChart) return;
    if (duplicateDepartmentCount > 0 || openRoleCount > 0) {
      setOrgMessage(
        "Error: Resolve duplicate department names and missing leadership roles before saving."
      );
      return;
    }
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
  const directoryPeople =
    directoryMode === "unassigned" ? visibleUnassignedPeople : visibleDirectoryPeople;

  const autoFillLeadershipRoles = () => {
    setDraftDepartments((current) =>
      normalizeDraftDepartments(
        current.map((department) => {
          if (department.name.toLowerCase() === "organization") {
            return department;
          }

          const candidateIds = dedupe(department.memberPersonIds).filter(
            (personId) => peopleById.get(personId)?.active
          );

          if (candidateIds.length === 0) {
            return department;
          }

          let headPersonId = department.headPersonId;
          let teamLeadPersonId = department.teamLeadPersonId;

          if (!headPersonId) {
            headPersonId = candidateIds[0];
          }

          if (!teamLeadPersonId) {
            teamLeadPersonId =
              candidateIds.find((personId) => personId !== headPersonId) ??
              candidateIds[0];
          }

          return {
            ...department,
            headPersonId,
            teamLeadPersonId,
            memberPersonIds: dedupe([
              ...department.memberPersonIds,
              ...(headPersonId ? [headPersonId] : []),
              ...(teamLeadPersonId ? [teamLeadPersonId] : []),
            ]),
          };
        })
      )
    );
    setTeamActionMessage(
      "AUTO-FILLED MISSING LEADERSHIP ROLES USING ACTIVE DEPARTMENT MEMBERS."
    );
  };

  const unassignInactiveCrew = () => {
    setDraftDepartments((current) =>
      normalizeDraftDepartments(
        current.map((department) => ({
          ...department,
          memberPersonIds: department.memberPersonIds.filter(
            (personId) => peopleById.get(personId)?.active
          ),
          headPersonId:
            department.headPersonId && peopleById.get(department.headPersonId)?.active
              ? department.headPersonId
              : null,
          teamLeadPersonId:
            department.teamLeadPersonId &&
            peopleById.get(department.teamLeadPersonId)?.active
              ? department.teamLeadPersonId
              : null,
        }))
      )
    );
    setTeamActionMessage("UNASSIGNED INACTIVE CREW FROM ROLE AND MEMBER MAPPINGS.");
  };

  const departmentNameGroups = new Map<string, number>();
  for (const department of draftDepartments) {
    const key = department.name.trim().toLowerCase();
    departmentNameGroups.set(key, (departmentNameGroups.get(key) ?? 0) + 1);
  }
  const duplicateDepartmentCount = [...departmentNameGroups.values()].filter(
    (count) => count > 1
  ).length;
  const inactiveAssignedCount = people.filter(
    (person) =>
      assignedDepartmentByPerson.has(person.personId) && !person.active
  ).length;
  const openRoleCount = draftDepartments.reduce((count, department) => {
    if (department.name.toLowerCase() === "organization") {
      return count;
    }
    const missingHead = department.headPersonId ? 0 : 1;
    const missingLead = department.teamLeadPersonId ? 0 : 1;
    return count + missingHead + missingLead;
  }, 0);
  const departmentHealthSummaries = summarizeDepartmentHealth(departments);

  const orderedDepartments = departmentOrder
    .map((departmentId) => departmentById.get(departmentId))
    .filter((department): department is OrgDepartmentMappingView => Boolean(department));
  const departmentNameTotals = new Map<string, number>();
  for (const department of orderedDepartments) {
    const key = department.name.trim().toLowerCase();
    departmentNameTotals.set(key, (departmentNameTotals.get(key) ?? 0) + 1);
  }
  const departmentNameOrdinal = new Map<string, number>();
  const departmentDisplayNames = new Map<string, string>();
  for (const department of orderedDepartments) {
    const key = department.name.trim().toLowerCase();
    const ordinal = (departmentNameOrdinal.get(key) ?? 0) + 1;
    departmentNameOrdinal.set(key, ordinal);
    const total = departmentNameTotals.get(key) ?? 1;
    const suffix = total > 1 ? ` ${ordinal}` : "";
    departmentDisplayNames.set(
      department.id,
      `${department.name.toUpperCase()}${suffix}`
    );
  }
  const assignablePeople = [...people].sort(
    (left, right) =>
      Number(right.active) - Number(left.active) ||
      left.name.localeCompare(right.name)
  );
  const rosterAssignmentOptions = orderedDepartments.flatMap((department) => [
    {
      value: encodeAssignmentValue(department.id, "member"),
      label: `${departmentDisplayNames.get(department.id) ?? department.name.toUpperCase()} • MEMBER`,
    },
    {
      value: encodeAssignmentValue(department.id, "headPersonId"),
      label: `${departmentDisplayNames.get(department.id) ?? department.name.toUpperCase()} • HEAD`,
    },
    {
      value: encodeAssignmentValue(department.id, "teamLeadPersonId"),
      label: `${departmentDisplayNames.get(department.id) ?? department.name.toUpperCase()} • TEAM LEAD`,
    },
  ]);
  const directoryEntries: DirectoryEntry[] = directoryPeople.map((person) => {
    const assignedDepartmentId = assignedDepartmentByPerson.get(person.personId);
    const assignedDepartment = assignedDepartmentId
      ? departmentById.get(assignedDepartmentId)
      : null;
    return {
      person,
      accent: assignedDepartment
        ? departmentAccent(assignedDepartment.name)
        : "var(--lcars-yellow)",
      assignmentSummary: describeAssignment(
        draftDepartments,
        person.personId,
        departmentDisplayNames
      ),
      assignmentValue: currentAssignmentValue(draftDepartments, person.personId),
    };
  });

  const validationIssues: ValidationIssue[] = [];
  if (duplicateDepartmentCount > 0) {
    validationIssues.push({
      id: "duplicate-department-names",
      title: "DUPLICATE DEPARTMENT NAMES",
      detail:
        "MULTIPLE DEPARTMENTS SHARE THE SAME NAME. DISAMBIGUATE IN HULY OR RESET THIS DRAFT BEFORE SAVING.",
      blocking: true,
      actionLabel: "RESET DRAFT",
      onAction: handleResetOrgChart,
    });
  }
  if (openRoleCount > 0) {
    validationIssues.push({
      id: "missing-leadership-roles",
      title: "MISSING REQUIRED LEADERSHIP ROLES",
      detail:
        "EACH DEPARTMENT NEEDS A HEAD AND TEAM LEAD (EXCEPT ORGANIZATION). AUTO-FILL CAN ASSIGN FROM ACTIVE MEMBERS.",
      blocking: true,
      actionLabel: "AUTO-FILL ROLES",
      onAction: autoFillLeadershipRoles,
    });
  }
  if (inactiveAssignedCount > 0) {
    validationIssues.push({
      id: "inactive-assigned",
      title: "INACTIVE CREW STILL ASSIGNED",
      detail:
        "INACTIVE PEOPLE ARE MAPPED TO A ROLE OR MEMBER SLOT. REMOVE THEM TO AVOID STALE ASSIGNMENTS.",
      blocking: false,
      actionLabel: "UNASSIGN INACTIVE",
      onAction: unassignInactiveCrew,
    });
  }
  const canSaveOrgChart =
    hasDraftChanges &&
    !orgSaving &&
    validationIssues.every((issue) => !issue.blocking);

  const validationStats = [
    {
      label: "DUPLICATE DEPARTMENTS",
      value: duplicateDepartmentCount,
      color:
        duplicateDepartmentCount > 0 ? "var(--lcars-yellow)" : "var(--lcars-green)",
    },
    {
      label: "INACTIVE ASSIGNED",
      value: inactiveAssignedCount,
      color:
        inactiveAssignedCount > 0 ? "var(--lcars-yellow)" : "var(--lcars-green)",
    },
    {
      label: "OPEN LEADERSHIP ROLES",
      value: openRoleCount,
      color: openRoleCount > 0 ? "var(--lcars-orange)" : "var(--lcars-green)",
    },
  ];

  const orgWorkspaceStyle = {
    ...styles.orgWorkspace,
    gridTemplateColumns: isCompactLayout
      ? "1fr"
      : (styles.orgWorkspace.gridTemplateColumns as string),
    gap: isNarrowLayout ? 14 : (styles.orgWorkspace.gap as number),
  };
  const orgButtonRowStyle = {
    ...styles.buttonRow,
    alignItems: isNarrowLayout ? "stretch" : styles.buttonRow.alignItems,
    gap: isNarrowLayout ? 8 : styles.buttonRow.gap,
  };
  const orgCanvasStyle = {
    ...styles.orgCanvas,
    overflowX: isNarrowLayout ? "auto" : styles.orgCanvas.overflowX,
  };
  const bentoGridStyle = {
    ...styles.bentoGrid,
    gridTemplateColumns: isMobileLayout
      ? "1fr"
      : isNarrowLayout
        ? "repeat(auto-fit, minmax(240px, 1fr))"
        : (styles.bentoGrid.gridTemplateColumns as string),
  };
  const departmentGridStyle = {
    ...styles.departmentGrid,
    gridTemplateColumns: isMobileLayout
      ? "1fr"
      : (styles.departmentGrid.gridTemplateColumns as string),
  };
  const monthlyHoursTableStyle = {
    ...styles.table,
    minWidth: isMobileLayout ? 760 : 900,
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

      <div style={styles.subrouteNav}>
        <NavLink
          to="/team/mapping"
          end
          style={({ isActive }) => ({
            ...styles.subrouteLink,
            ...(isActive ? styles.subrouteLinkActive : null),
          })}
        >
          MAPPING
        </NavLink>
        <NavLink
          to="/team/capacity"
          end
          style={({ isActive }) => ({
            ...styles.subrouteLink,
            ...(isActive ? styles.subrouteLinkActive : null),
          })}
        >
          CAPACITY
        </NavLink>
        <NavLink
          to="/team/crew"
          end
          style={({ isActive }) => ({
            ...styles.subrouteLink,
            ...(isActive ? styles.subrouteLinkActive : null),
          })}
        >
          CREW PROFILE
        </NavLink>
      </div>

      <Routes>
        <Route index element={<Navigate to="mapping" replace />} />
        <Route
          path="mapping"
          element={
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

                    <div style={orgButtonRowStyle}>
                      <button
                        onClick={handleSaveOrgChart}
                        disabled={!canSaveOrgChart}
                        style={{
                          ...styles.primaryButton,
                          opacity: canSaveOrgChart ? 1 : 0.5,
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
                      USE THE ASSIGN DROPDOWNS TO PLACE PEOPLE INTO A DEPARTMENT ROLE.
                      THE ROSTER CONTROL CAN SET MEMBER, HEAD, OR TEAM LEAD, AND EACH
                      DEPARTMENT CARD HAS DIRECT ROLE PICKERS FOR QUICK ADJUSTMENTS.
                    </div>
                  </div>

                  <div style={orgWorkspaceStyle}>
                    <DirectoryPanel
                      searchValue={peopleSearch}
                      onSearchChange={setPeopleSearch}
                      mode={directoryMode}
                      onModeChange={setDirectoryMode}
                      unassignedCount={visibleUnassignedPeople.length}
                      visibleCount={visibleDirectoryPeople.length}
                      showingCount={directoryEntries.length}
                      totalCount={people.length}
                      entries={directoryEntries}
                      assignmentOptions={rosterAssignmentOptions}
                      onAssignmentChange={applyAssignmentSelection}
                      validationBar={
                        <ValidationBar
                          stats={validationStats}
                          issues={validationIssues}
                          footer={
                            validationIssues.some((issue) => issue.blocking) ? (
                              <div style={styles.saveGateHint}>
                                RESOLVE BLOCKING ISSUES BEFORE SAVING.
                              </div>
                            ) : null
                          }
                        />
                      }
                    />

                    <div style={orgCanvasStyle}>
                      <div style={bentoGridStyle}>
                        {orderedDepartments.map((department) => (
                          <DepartmentCard
                            key={department.id}
                            department={department}
                            displayName={
                              departmentDisplayNames.get(department.id) ??
                              department.name.toUpperCase()
                            }
                            accent={departmentAccent(department.name)}
                            assignablePeople={assignablePeople}
                            peopleById={peopleById}
                            isCompactLayout={isCompactLayout}
                            onUpdateRole={updateRole}
                            onRemoveRoleOccupant={removeRoleOccupant}
                            onRemoveDepartmentMember={removeDepartmentMember}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          }
        />

        <Route
          path="capacity"
          element={
            <>
              <div style={{ ...styles.card, borderLeftColor: "var(--lcars-peach)" }}>
                <h2 style={styles.sectionTitle}>DEPARTMENT STRUCTURE</h2>
                <div style={styles.sectionDivider} />
                {departmentHealthSummaries.length === 0 ? (
                  <p style={styles.emptyText}>NO DEPARTMENT DATA AVAILABLE</p>
                ) : (
                  <div style={departmentGridStyle}>
                    {departmentHealthSummaries.map((dept) => (
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

              <div style={{ ...styles.card, borderLeftColor: "var(--lcars-tan)" }}>
                <h2 style={styles.sectionTitle}>MONTHLY HOURS & REMOTE VISIBILITY</h2>
                <div style={styles.sectionDivider} />
                {monthlyHours.length === 0 ? (
                  <p style={styles.emptyText}>
                    NO MONTHLY HOURS DATA. SYNC CLOCKIFY + HULY FIRST.
                  </p>
                ) : (
                  <div style={styles.tableScrollWrap}>
                    <table style={monthlyHoursTableStyle}>
                      <thead>
                        <tr>
                          <th style={styles.th}>CREW MEMBER</th>
                          <th style={styles.th}>ACTUAL HOURS</th>
                          <th style={styles.th}>EXPECTED HOURS</th>
                          <th style={styles.th}>STATUS</th>
                          <th style={styles.th}>REMOTE</th>
                          <th style={styles.th}>TIMEZONE</th>
                          <th style={styles.th}>LEAVE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyHours.map((row) => {
                          const statusColor =
                            row.status === "under"
                              ? "var(--lcars-red)"
                              : row.status === "over"
                                ? "var(--lcars-yellow)"
                                : "var(--lcars-green)";
                          const statusLabel =
                            row.status === "under"
                              ? "UNDER (<120H)"
                              : row.status === "over"
                                ? "OVER (>180H)"
                                : "NORMAL";
                          return (
                            <tr key={row.employeeName}>
                              <td style={styles.td}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <Avatar name={row.employeeName} size={22} />
                                  <span style={{ color: "var(--lcars-tan)" }}>{row.employeeName}</span>
                                  {row.onLeave && (
                                    <span
                                      style={{
                                        fontFamily: "'Orbitron', sans-serif",
                                        fontSize: 8,
                                        fontWeight: 600,
                                        color: "var(--lcars-yellow)",
                                        border: "1px solid var(--lcars-yellow)",
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
                              <td style={styles.tdMono}>{row.actualHours.toFixed(1)}h</td>
                              <td style={styles.tdMono}>{row.expectedHours.toFixed(1)}h</td>
                              <td style={{ ...styles.td, color: statusColor, fontWeight: 600, fontSize: 11 }}>
                                {statusLabel}
                              </td>
                              <td style={styles.td}>
                                {row.isRemote ? (
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
                                    REMOTE
                                  </span>
                                ) : (
                                  <span style={{ color: "var(--text-quaternary)", fontSize: 11 }}>ONSITE</span>
                                )}
                              </td>
                              <td style={styles.tdMono}>{row.timezone ?? "--"}</td>
                              <td style={styles.td}>
                                {row.onLeave ? (
                                  <span style={{ color: "var(--lcars-yellow)", fontWeight: 600, fontSize: 11 }}>YES</span>
                                ) : (
                                  <span style={{ color: "var(--text-quaternary)", fontSize: 11 }}>NO</span>
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
            </>
          }
        />

        <Route
          path="crew"
          element={
            <>
              <div style={{ ...styles.card, borderLeftColor: "var(--lcars-cyan)" }}>
                <h2 style={styles.sectionTitle}>CREW PROFILE</h2>
                <div style={styles.sectionDivider} />
                <p style={styles.helperText}>
                  FOCUSED VIEW FOR STANDUPS, LEAVE, WORK HOURS, MESSAGE ACTIVITY, AND
                  INDIVIDUAL SCHEDULE SIGNALS.
                </p>
              </div>
              <EmployeeSummaryPanel
                employees={activeEmployees}
                selectedEmployeeId={selectedEmployeeId}
                onSelectEmployee={setSelectedEmployeeId}
                summary={employeeSummary}
                loading={summaryLoading}
                error={summaryError}
              />
            </>
          }
        />
        <Route path="*" element={<Navigate to="mapping" replace />} />
      </Routes>
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
  subrouteNav: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap" as const,
    marginBottom: 16,
  },
  subrouteLink: {
    border: "1px solid rgba(153, 153, 204, 0.22)",
    color: "var(--lcars-lavender)",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    letterSpacing: "1px",
    textDecoration: "none",
    padding: "8px 12px",
    borderRadius: "0 12px 12px 0",
    background: "rgba(153, 153, 204, 0.08)",
  },
  subrouteLinkActive: {
    borderColor: "var(--lcars-cyan)",
    color: "var(--lcars-cyan)",
    background: "rgba(0, 204, 255, 0.12)",
    boxShadow: "inset 0 0 0 1px rgba(0, 204, 255, 0.14)",
  },
  saveGateHint: {
    borderLeft: "3px solid var(--lcars-red)",
    background: "rgba(46, 20, 20, 0.45)",
    borderTop: "1px solid rgba(255, 77, 109, 0.28)",
    borderRight: "1px solid rgba(255, 77, 109, 0.28)",
    borderBottom: "1px solid rgba(255, 77, 109, 0.28)",
    borderRadius: "0 12px 12px 0",
    color: "var(--lcars-red)",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    letterSpacing: "1px",
    textTransform: "uppercase" as const,
    padding: "8px 10px",
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
    gridTemplateColumns: "320px minmax(0, 1fr)",
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
  directoryModeRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
  },
  directoryModeButton: {
    background: "rgba(153, 153, 204, 0.08)",
    border: "1px solid rgba(153, 153, 204, 0.22)",
    color: "var(--lcars-lavender)",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    letterSpacing: "1px",
    padding: "8px 10px",
    textAlign: "center" as const,
    cursor: "pointer",
  },
  directoryModeButtonActive: {
    borderColor: "var(--lcars-cyan)",
    color: "var(--lcars-cyan)",
    background: "rgba(0, 204, 255, 0.12)",
    boxShadow: "inset 0 0 0 1px rgba(0, 204, 255, 0.14)",
  },
  validationStrip: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 6,
    padding: "10px 12px",
    border: "1px solid rgba(153, 153, 204, 0.18)",
    borderRadius: "0 14px 14px 0",
    background: "rgba(12, 12, 26, 0.78)",
  },
  validationItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  validationLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    letterSpacing: "1.1px",
    color: "var(--lcars-lavender)",
  },
  validationValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    fontWeight: 600,
  },
  orgCanvas: {
    minWidth: 0,
    overflowX: "hidden" as const,
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
  rolePanel: {
    background: "rgba(18, 18, 34, 0.92)",
    border: "1px solid rgba(153, 153, 204, 0.18)",
    padding: 12,
    minHeight: 92,
    borderRadius: "0 14px 14px 0",
  },
  memberPanel: {
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
  roleSelect: {
    ...lcarsPageStyles.input,
    marginBottom: 10,
    height: 38,
    fontSize: 11,
    padding: "8px 10px",
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
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
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
  crewCardActions: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "flex-end",
    gap: 8,
    width: "min(220px, 100%)",
  },
  crewCardActionsTight: {
    display: "flex",
    alignItems: "flex-end",
    gap: 8,
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
  directoryCrewCard: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
    background: "rgba(26, 26, 46, 0.92)",
    padding: "10px 12px",
    minWidth: 0,
    borderRadius: "0 14px 14px 0",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
  },
  directoryIdentityRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  directoryIdentityText: {
    minWidth: 0,
    flex: 1,
  },
  directoryCrewName: {
    color: "var(--lcars-tan)",
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: "0.2px",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  directoryCrewMeta: {
    color: "var(--lcars-lavender)",
    fontSize: 10,
    letterSpacing: "0.4px",
    marginTop: 2,
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  directoryAssignmentRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: 6,
  },
  directoryAssignmentPill: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    letterSpacing: "1px",
    textTransform: "uppercase" as const,
    padding: "3px 8px",
    border: "1px solid",
    width: "fit-content",
  },
  directorySelect: {
    ...lcarsPageStyles.input,
    width: "100%",
    height: 34,
    padding: "6px 8px",
    marginBottom: 0,
    fontSize: 10,
  },
  departmentGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 12,
  },
  tableScrollWrap: {
    overflowX: "auto" as const,
    border: "1px solid rgba(153, 153, 204, 0.08)",
    borderRadius: "0 14px 14px 0",
    background: "rgba(0, 0, 0, 0.12)",
  },
};

export default Team;
