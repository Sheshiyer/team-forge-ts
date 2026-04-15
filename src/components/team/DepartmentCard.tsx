import Avatar from "../ui/Avatar";
import RolePicker from "./RolePicker";
import type { OrgDepartmentMappingView, OrgPersonView } from "../../lib/types";

type DepartmentCardProps = {
  department: OrgDepartmentMappingView;
  displayName: string;
  accent: string;
  assignablePeople: OrgPersonView[];
  peopleById: Map<string, OrgPersonView>;
  isCompactLayout: boolean;
  onUpdateRole: (departmentId: string, role: "headPersonId" | "teamLeadPersonId", personId: string | null) => void;
  onRemoveRoleOccupant: (departmentId: string, role: "headPersonId" | "teamLeadPersonId") => void;
  onRemoveDepartmentMember: (departmentId: string, personId: string) => void;
};

function DepartmentCard({
  department,
  displayName,
  accent,
  assignablePeople,
  peopleById,
  isCompactLayout,
  onUpdateRole,
  onRemoveRoleOccupant,
  onRemoveDepartmentMember,
}: DepartmentCardProps) {
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

  const isLegacyDepartment = department.name.toLowerCase() === "organization";
  const spansWide = isLegacyDepartment || department.memberPersonIds.length >= 4;

  return (
    <section
      style={{
        ...styles.card,
        ...(spansWide && !isCompactLayout ? styles.cardWide : null),
        borderTop: `3px solid ${accent}`,
      }}
    >
      <div style={styles.header}>
        <div>
          <div style={styles.title}>{displayName}</div>
          <div style={styles.meta}>
            {department.memberPersonIds.length} MEMBERS
            {isLegacyDepartment ? " • LEGACY CATCH-ALL" : ""}
          </div>
        </div>
        <div style={styles.headerMeta}>
          <span style={styles.metaPill}>ROLE CONTROLS</span>
        </div>
      </div>

      <div style={styles.roleGrid}>
        <RolePicker
          label="HEAD"
          value={department.headPersonId}
          people={assignablePeople}
          onChange={(personId) =>
            onUpdateRole(department.id, "headPersonId", personId)
          }
          onClear={() => onRemoveRoleOccupant(department.id, "headPersonId")}
          ariaLabel={`${displayName} head`}
          occupant={headPerson}
          badgeLabel="HEAD"
          accent={accent}
        />

        <RolePicker
          label="TEAM LEAD"
          value={department.teamLeadPersonId}
          people={assignablePeople}
          onChange={(personId) =>
            onUpdateRole(department.id, "teamLeadPersonId", personId)
          }
          onClear={() => onRemoveRoleOccupant(department.id, "teamLeadPersonId")}
          ariaLabel={`${displayName} team lead`}
          occupant={leadPerson}
          badgeLabel="TEAM LEAD"
          accent={accent}
        />
      </div>

      <div style={styles.memberPanel}>
        <div style={styles.memberHeader}>
          <span style={styles.memberLabel}>MEMBERS</span>
          <span style={styles.memberMeta}>{memberOnlyPeople.length} ASSIGNED</span>
        </div>
        {memberOnlyPeople.length === 0 ? (
          <div style={styles.placeholder}>
            USE THE ROSTER ASSIGN CONTROL TO ADD MEMBERS HERE.
          </div>
        ) : (
          <div style={styles.memberGrid}>
            {memberOnlyPeople.map((person) => (
              <div
                key={`${department.id}-${person.personId}`}
                style={{ ...styles.memberCard, borderLeft: `3px solid ${accent}` }}
              >
                <Avatar name={person.name} size={20} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={styles.memberName}>{person.name}</div>
                  <div style={styles.memberMetaText}>{person.email || "NO EMAIL"}</div>
                </div>
                <button
                  onClick={() => onRemoveDepartmentMember(department.id, person.personId)}
                  style={styles.removeButton}
                  aria-label={`Remove ${person.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: "var(--bg-console-soft)",
    border: "1px solid rgba(153, 153, 204, 0.14)",
    padding: 16,
    minHeight: 260,
    borderRadius: "0 20px 20px 0",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
  },
  cardWide: {
    gridColumn: "span 2",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  },
  headerMeta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  metaPill: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    color: "var(--lcars-lavender)",
    border: "1px solid rgba(153, 153, 204, 0.24)",
    padding: "3px 8px",
    letterSpacing: "1px",
  },
  title: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 12,
    fontWeight: 700,
    color: "var(--lcars-orange)",
    letterSpacing: "1.5px",
  },
  meta: {
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
  memberPanel: {
    background: "rgba(18, 18, 34, 0.92)",
    border: "1px solid rgba(153, 153, 204, 0.18)",
    padding: 12,
    minHeight: 128,
    borderRadius: "0 14px 14px 0",
  },
  memberHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  memberLabel: {
    display: "block",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    color: "var(--lcars-lavender)",
    letterSpacing: "1.5px",
    textTransform: "uppercase",
  },
  memberMeta: {
    fontSize: 11,
    color: "var(--lcars-lavender)",
    marginTop: 4,
    letterSpacing: "0.6px",
  },
  placeholder: {
    minHeight: 54,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    color: "var(--text-quaternary)",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    lineHeight: 1.5,
    letterSpacing: "1px",
    textTransform: "uppercase",
  },
  memberGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 8,
  },
  memberCard: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "rgba(26, 26, 46, 0.92)",
    padding: "8px 10px",
    minWidth: 0,
    borderRadius: "0 12px 12px 0",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
  },
  memberName: {
    color: "var(--lcars-tan)",
    fontSize: 12,
    fontWeight: 500,
    minWidth: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  memberMetaText: {
    color: "var(--lcars-lavender)",
    fontSize: 10,
    lineHeight: 1.4,
    wordBreak: "break-word",
  },
  removeButton: {
    background: "transparent",
    border: "none",
    color: "var(--lcars-lavender)",
    fontSize: 18,
    lineHeight: 1,
    cursor: "pointer",
    padding: 0,
  },
};

export default DepartmentCard;
