import { useState, useEffect, useCallback } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { useViewportWidth } from "../hooks/useViewportWidth";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";
import { SkeletonTable } from "../components/ui/Skeleton";
import Avatar from "../components/ui/Avatar";
import EmployeeSummaryPanel from "../components/team/EmployeeSummaryPanel";
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
  personId: string
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

  return `${department.name.toUpperCase()} • ${assignmentRoleLabel(assignment.role)}`;
}

type CrewCardProps = {
  person: OrgPersonView;
  subtitle: string;
  badges?: React.ReactNode;
  accent: string;
  compact?: boolean;
  controls?: React.ReactNode;
  onRemove?: () => void;
};

function CrewCard({
  person,
  subtitle,
  badges,
  accent,
  compact = false,
  controls,
  onRemove,
}: CrewCardProps) {
  return (
    <div
      style={{
        ...styles.crewCard,
        ...(compact ? styles.crewCardCompact : null),
        borderLeft: `3px solid ${accent}`,
        opacity: person.active ? 1 : 0.68,
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
      {(controls || onRemove) ? (
        <div style={controls ? styles.crewCardActions : styles.crewCardActionsTight}>
          {controls}
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
      ) : null}
    </div>
  );
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
  const assignablePeople = [...people].sort(
    (left, right) =>
      Number(right.active) - Number(left.active) ||
      left.name.localeCompare(right.name)
  );
  const rosterAssignmentOptions = orderedDepartments.flatMap((department) => [
    {
      value: encodeAssignmentValue(department.id, "member"),
      label: `${department.name.toUpperCase()} • MEMBER`,
    },
    {
      value: encodeAssignmentValue(department.id, "headPersonId"),
      label: `${department.name.toUpperCase()} • HEAD`,
    },
    {
      value: encodeAssignmentValue(department.id, "teamLeadPersonId"),
      label: `${department.name.toUpperCase()} • TEAM LEAD`,
    },
  ]);
  const orgWorkspaceStyle = {
    ...styles.orgWorkspace,
    gridTemplateColumns: isCompactLayout
      ? "1fr"
      : (styles.orgWorkspace.gridTemplateColumns as string),
    gap: isNarrowLayout ? 14 : (styles.orgWorkspace.gap as number),
  };
  const teamRailStyle = {
    ...styles.teamRail,
    position: isCompactLayout ? "static" : styles.teamRail.position,
    top: isCompactLayout ? undefined : styles.teamRail.top,
    padding: isMobileLayout ? "12px" : styles.teamRail.padding,
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
  const roleGridStyle = {
    ...styles.roleGrid,
    gridTemplateColumns: isMobileLayout
      ? "1fr"
      : (styles.roleGrid.gridTemplateColumns as string),
  };
  const memberGridStyle = {
    ...styles.memberGrid,
    gridTemplateColumns: isMobileLayout
      ? "1fr"
      : (styles.memberGrid.gridTemplateColumns as string),
  };
  const directoryListStyle = {
    ...styles.leftRailList,
    maxHeight: isCompactLayout ? 280 : styles.leftRailList.maxHeight,
  };
  const cardSelectStyle = {
    ...styles.cardSelect,
    minWidth: isNarrowLayout ? 0 : styles.cardSelect.minWidth,
    maxWidth: isNarrowLayout ? "100%" : styles.cardSelect.maxWidth,
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
                USE THE ASSIGN DROPDOWNS TO PLACE PEOPLE INTO A DEPARTMENT ROLE.
                THE ROSTER CONTROL CAN SET MEMBER, HEAD, OR TEAM LEAD, AND EACH
                DEPARTMENT CARD HAS DIRECT ROLE PICKERS FOR QUICK ADJUSTMENTS.
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

                <div style={styles.unassignedPanel}>
                  <div style={styles.dropZoneLabelRow}>
                    <span style={styles.orgDepartmentTitle}>UNASSIGNED TRAY</span>
                    <span style={styles.orgDepartmentMeta}>
                      {visibleUnassignedPeople.length} READY
                    </span>
                  </div>
                  {visibleUnassignedPeople.length === 0 ? (
                    <div style={styles.helperText}>
                      EVERY VISIBLE PERSON IS CURRENTLY MAPPED TO A DEPARTMENT.
                    </div>
                  ) : (
                    <div style={directoryListStyle}>
                      {visibleUnassignedPeople.map((person) => {
                        const assignmentValue = currentAssignmentValue(
                          draftDepartments,
                          person.personId
                        );

                        return (
                          <CrewCard
                            key={`unassigned-${person.personId}`}
                            person={person}
                            subtitle={person.email || "NO EMAIL"}
                            accent="var(--lcars-yellow)"
                            compact
                            controls={
                              <select
                                value={assignmentValue}
                                onChange={(event) =>
                                  applyAssignmentSelection(
                                    person.personId,
                                    event.target.value
                                  )
                                }
                                style={cardSelectStyle}
                                aria-label={`Assign ${person.name}`}
                              >
                                <option value="unassigned">UNASSIGNED</option>
                                {rosterAssignmentOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            }
                          />
                        );
                      })}
                    </div>
                  )}
                </div>

                <div style={styles.teamRailHeader}>
                  <div style={styles.teamRailTitle}>FULL ROSTER</div>
                  <div style={styles.teamRailMeta}>DIRECT ROLE ASSIGNMENT</div>
                </div>

                <div style={directoryListStyle}>
                  {visibleDirectoryPeople.map((person) => {
                    const assignmentValue = currentAssignmentValue(
                      draftDepartments,
                      person.personId
                    );
                    const assignedDepartmentId = assignedDepartmentByPerson.get(
                      person.personId
                    );
                    const assignedDepartment = assignedDepartmentId
                      ? departmentById.get(assignedDepartmentId)
                      : null;
                    const assignmentSummary = describeAssignment(
                      draftDepartments,
                      person.personId
                    );
                    const subtitle = person.email
                      ? `${person.email} • ${assignmentSummary}`
                      : `NO EMAIL • ${assignmentSummary}`;

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
                        controls={
                          <select
                            value={assignmentValue}
                            onChange={(event) =>
                              applyAssignmentSelection(
                                person.personId,
                                event.target.value
                              )
                            }
                            style={cardSelectStyle}
                            aria-label={`Assign ${person.name}`}
                          >
                            <option value="unassigned">UNASSIGNED</option>
                            {rosterAssignmentOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        }
                      />
                    );
                  })}
                </div>
              </aside>

              <div style={orgCanvasStyle}>
                <div style={bentoGridStyle}>
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
                    const spansWide =
                      isLegacyDepartment || department.memberPersonIds.length >= 4;

                    return (
                      <section
                        key={department.id}
                        style={{
                          ...styles.bentoCard,
                          ...(spansWide && !isCompactLayout ? styles.bentoCardWide : null),
                          borderTop: `3px solid ${accent}`,
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
                            <span style={styles.bentoMetaPill}>ROLE CONTROLS</span>
                          </div>
                        </div>

                        <div style={roleGridStyle}>
                          <div style={styles.rolePanel}>
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
                            <select
                              value={department.headPersonId ?? ""}
                              onChange={(event) =>
                                updateRole(
                                  department.id,
                                  "headPersonId",
                                  event.target.value || null
                                )
                              }
                              style={styles.roleSelect}
                              aria-label={`${department.name} head`}
                            >
                              <option value="">UNASSIGNED</option>
                              {assignablePeople.map((person) => (
                                <option
                                  key={`head-${department.id}-${person.personId}`}
                                  value={person.personId}
                                >
                                  {person.name}
                                  {person.active ? "" : " • INACTIVE"}
                                </option>
                              ))}
                            </select>
                            {headPerson ? (
                              <CrewCard
                                person={headPerson}
                                subtitle={headPerson.email || "NO EMAIL"}
                                badges={roleBadge("HEAD", accent)}
                                accent={accent}
                                compact
                              />
                            ) : (
                              <div style={styles.dropPlaceholder}>
                                SELECT A CREW MEMBER ABOVE
                              </div>
                            )}
                          </div>

                          <div style={styles.rolePanel}>
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
                            <select
                              value={department.teamLeadPersonId ?? ""}
                              onChange={(event) =>
                                updateRole(
                                  department.id,
                                  "teamLeadPersonId",
                                  event.target.value || null
                                )
                              }
                              style={styles.roleSelect}
                              aria-label={`${department.name} team lead`}
                            >
                              <option value="">UNASSIGNED</option>
                              {assignablePeople.map((person) => (
                                <option
                                  key={`lead-${department.id}-${person.personId}`}
                                  value={person.personId}
                                >
                                  {person.name}
                                  {person.active ? "" : " • INACTIVE"}
                                </option>
                              ))}
                            </select>
                            {leadPerson ? (
                              <CrewCard
                                person={leadPerson}
                                subtitle={leadPerson.email || "NO EMAIL"}
                                badges={roleBadge("TEAM LEAD", accent)}
                                accent={accent}
                                compact
                              />
                            ) : (
                              <div style={styles.dropPlaceholder}>
                                SELECT A CREW MEMBER ABOVE
                              </div>
                            )}
                          </div>
                        </div>

                        <div style={styles.memberPanel}>
                          <div style={styles.dropZoneLabelRow}>
                            <span style={styles.label}>MEMBERS</span>
                            <span style={styles.orgDepartmentMeta}>
                              {memberOnlyPeople.length} ASSIGNED
                            </span>
                          </div>
                          {memberOnlyPeople.length === 0 ? (
                            <div style={styles.dropPlaceholder}>
                              USE THE ROSTER ASSIGN CONTROL TO ADD MEMBERS HERE.
                            </div>
                          ) : (
                            <div style={memberGridStyle}>
                              {memberOnlyPeople.map((person) => (
                                <CrewCard
                                  key={`${department.id}-${person.personId}`}
                                  person={person}
                                  subtitle={person.email || "NO EMAIL"}
                                  accent={accent}
                                  compact
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
          <div style={departmentGridStyle}>
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

      {/* Monthly Hours & Remote Visibility (#9) */}
      <div style={{ ...styles.card, borderLeftColor: "var(--lcars-tan)" }}>
        <h2 style={styles.sectionTitle}>MONTHLY HOURS & REMOTE VISIBILITY</h2>
        <div style={styles.sectionDivider} />
        {monthlyHours.length === 0 ? (
          <p style={styles.emptyText}>NO MONTHLY HOURS DATA. SYNC CLOCKIFY + HULY FIRST.</p>
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

      <EmployeeSummaryPanel
        employees={activeEmployees}
        selectedEmployeeId={selectedEmployeeId}
        onSelectEmployee={setSelectedEmployeeId}
        summary={employeeSummary}
        loading={summaryLoading}
        error={summaryError}
      />
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
    maxHeight: 360,
    overflowY: "auto" as const,
    paddingRight: 4,
  },
  unassignedPanel: {
    background: "rgba(18, 18, 34, 0.88)",
    border: "1px dashed rgba(255, 204, 0, 0.35)",
    padding: 12,
    borderRadius: "0 16px 16px 0",
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
  cardSelect: {
    ...lcarsPageStyles.input,
    minWidth: 148,
    width: "100%",
    maxWidth: 220,
    height: 34,
    padding: "6px 8px",
    marginBottom: 0,
    fontSize: 10,
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
