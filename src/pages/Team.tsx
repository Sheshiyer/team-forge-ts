import { useState, useEffect, useCallback } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { SkeletonTable } from "../components/ui/Skeleton";
import Avatar from "../components/ui/Avatar";
import type {
  DepartmentView,
  HolidayView,
  LeaveView,
  OrgChartView,
  OrgDepartmentMappingView,
  OrgPersonView,
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

function isCurrentlyOnLeave(dateFrom: string, dateTo: string): boolean {
  const now = new Date();
  return now >= new Date(dateFrom) && now <= new Date(dateTo);
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

function Team() {
  const api = useInvoke();
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

  const load = useCallback(async () => {
    setLoading(true);
    setOrgMessage(null);

    const [departmentResult, leaveResult, holidayResult, orgChartResult] =
      await Promise.allSettled([
        api.getDepartments(),
        api.getLeaveRequests(),
        api.getHolidays(),
        api.getOrgChart(),
      ]);

    if (departmentResult.status === "fulfilled") {
      setDepartments(departmentResult.value);
    }
    if (leaveResult.status === "fulfilled") {
      setLeaves(leaveResult.value);
    }
    if (holidayResult.status === "fulfilled") {
      setHolidays(holidayResult.value);
    }
    if (orgChartResult.status === "fulfilled") {
      const normalized = normalizeDraftDepartments(orgChartResult.value.departments);
      setOrgChart(orgChartResult.value);
      setDraftDepartments(normalized);
      setDepartmentOrder(normalized.map((department) => department.id));
    } else {
      setOrgChart(null);
      setDraftDepartments([]);
      setDepartmentOrder([]);
      setOrgMessage(`Error: ${String(orgChartResult.reason)}`);
    }

    setLoading(false);
  }, [api]);

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

  return (
    <div>
      <h1 style={styles.pageTitle}>TEAM</h1>
      <div style={styles.pageTitleBar} />

      <div style={styles.card}>
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
                GRID. PEOPLE MATCHING THE IGNORED EMAILS LIST IN SETTINGS ARE
                EXCLUDED FROM THIS MAPPING VIEW.
              </div>
            </div>

            <div style={styles.orgWorkspace}>
              <aside style={styles.teamRail}>
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
                          ...(spansWide ? styles.bentoCardWide : null),
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
              {leaves.map((leave, idx) => {
                const onLeave = isCurrentlyOnLeave(leave.dateFrom, leave.dateTo);
                return (
                  <tr
                    key={`${leave.employeeName}-${idx}`}
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
                        <span style={{ color: "var(--lcars-orange)" }}>
                          {leave.employeeName}
                        </span>
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
                    <td style={{ ...styles.td, textTransform: "uppercase" as const }}>
                      {leave.leaveType}
                    </td>
                    <td style={styles.tdMono}>{formatDate(leave.dateFrom)}</td>
                    <td style={styles.tdMono}>{formatDate(leave.dateTo)}</td>
                    <td style={styles.tdMono}>{leave.days}</td>
                    <td style={styles.td}>
                      <StatusPill status={leave.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>UPCOMING HOLIDAYS</h2>
        <div style={styles.sectionDivider} />
        {holidays.length === 0 ? (
          <p style={styles.emptyText}>NO HOLIDAYS CONFIGURED</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {holidays.map((holiday, idx) => (
              <div
                key={idx}
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
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      fontSize: 13,
                      color: "var(--lcars-orange)",
                      fontWeight: 500,
                    }}
                  >
                    {holiday.title.toUpperCase()}
                  </span>
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
                <span
                  style={{
                    fontSize: 12,
                    fontFamily: "'JetBrains Mono', monospace",
                    color: "var(--lcars-lavender)",
                  }}
                >
                  {formatDate(holiday.date)}
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
  input: {
    width: "100%",
    background: "rgba(10, 10, 20, 0.75)",
    border: "1px solid rgba(153, 153, 204, 0.18)",
    color: "var(--lcars-tan)",
    padding: "10px 12px",
    fontSize: 13,
    fontFamily: "'JetBrains Mono', monospace",
    outline: "none",
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
  buttonRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap" as const,
    marginBottom: 12,
  },
  primaryButton: {
    background: "var(--lcars-orange)",
    color: "#111",
    border: "none",
    padding: "10px 16px",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "1px",
    cursor: "pointer",
  },
  ghostButton: {
    background: "transparent",
    color: "var(--lcars-lavender)",
    border: "1px solid rgba(153, 153, 204, 0.25)",
    padding: "10px 16px",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "1px",
    cursor: "pointer",
  },
  helperText: {
    fontSize: 11,
    color: "var(--lcars-lavender)",
    lineHeight: 1.6,
    letterSpacing: "0.45px",
  },
  orgTopBar: {
    marginBottom: 20,
  },
  orgStatGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 12,
    marginBottom: 16,
  },
  orgStatCard: {
    background: "rgba(10, 10, 20, 0.72)",
    border: "1px solid rgba(153, 153, 204, 0.12)",
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
    background: "rgba(10, 10, 20, 0.82)",
    border: "1px solid rgba(153, 153, 204, 0.12)",
    padding: 16,
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
    background: "rgba(26, 26, 46, 0.82)",
    border: "1px dashed rgba(255, 204, 0, 0.35)",
    padding: 12,
  },
  orgCanvas: {
    minWidth: 0,
  },
  bentoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 16,
    alignItems: "start",
  },
  bentoCard: {
    background: "rgba(10, 10, 20, 0.84)",
    border: "1px solid rgba(153, 153, 204, 0.14)",
    padding: 16,
    minHeight: 260,
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
    background: "rgba(18, 18, 34, 0.9)",
    border: "1px solid rgba(153, 153, 204, 0.18)",
    padding: 12,
    minHeight: 92,
  },
  memberDropZone: {
    background: "rgba(18, 18, 34, 0.9)",
    border: "1px solid rgba(153, 153, 204, 0.18)",
    padding: 12,
    minHeight: 128,
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
    background: "rgba(26, 26, 46, 0.88)",
    padding: "10px 12px",
    minWidth: 0,
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
