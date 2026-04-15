import Avatar from "../ui/Avatar";
import type { OrgPersonView } from "../../lib/types";

type RolePickerProps = {
  label: string;
  value: string | null;
  people: OrgPersonView[];
  onChange: (personId: string | null) => void;
  onClear: () => void;
  ariaLabel: string;
  occupant: OrgPersonView | null;
  badgeLabel: string;
  accent: string;
};

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

function RolePicker({
  label,
  value,
  people,
  onChange,
  onClear,
  ariaLabel,
  occupant,
  badgeLabel,
  accent,
}: RolePickerProps) {
  return (
    <div style={styles.rolePanel}>
      <div style={styles.labelRow}>
        <span style={styles.label}>{label}</span>
        <button
          onClick={onClear}
          disabled={!occupant}
          style={{
            ...styles.clearButton,
            opacity: occupant ? 1 : 0.35,
          }}
        >
          CLEAR
        </button>
      </div>

      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
        style={styles.select}
        aria-label={ariaLabel}
      >
        <option value="">UNASSIGNED</option>
        {people.map((person) => (
          <option key={`${ariaLabel}-${person.personId}`} value={person.personId}>
            {person.name}
            {person.active ? "" : " • INACTIVE"}
          </option>
        ))}
      </select>

      {occupant ? (
        <div style={{ ...styles.personCard, borderLeft: `3px solid ${accent}` }}>
          <Avatar name={occupant.name} size={20} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={styles.personRow}>
              <span style={styles.personName}>{occupant.name}</span>
              {roleBadge(badgeLabel, accent)}
              {!occupant.active ? roleBadge("INACTIVE", "var(--lcars-yellow)") : null}
            </div>
            <div style={styles.personMeta}>{occupant.email || "NO EMAIL"}</div>
          </div>
        </div>
      ) : (
        <div style={styles.placeholder}>SELECT A CREW MEMBER ABOVE</div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  rolePanel: {
    background: "rgba(18, 18, 34, 0.92)",
    border: "1px solid rgba(153, 153, 204, 0.18)",
    padding: 12,
    minHeight: 92,
    borderRadius: "0 14px 14px 0",
  },
  labelRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  label: {
    display: "block",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    color: "var(--lcars-lavender)",
    letterSpacing: "1.5px",
    textTransform: "uppercase" as const,
  },
  clearButton: {
    background: "transparent",
    border: "none",
    color: "var(--lcars-lavender)",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    letterSpacing: "1px",
    cursor: "pointer",
    padding: 0,
  },
  select: {
    width: "100%",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    border: "1px solid rgba(153, 153, 204, 0.2)",
    borderRadius: 2,
    padding: "8px 10px",
    marginBottom: 10,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    letterSpacing: "0.4px",
    height: 38,
  },
  personCard: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "rgba(26, 26, 46, 0.92)",
    padding: "8px 10px",
    minWidth: 0,
    borderRadius: "0 12px 12px 0",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
  },
  personRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap" as const,
    marginBottom: 2,
  },
  personName: {
    color: "var(--lcars-tan)",
    fontSize: 12,
    fontWeight: 500,
    minWidth: 0,
  },
  personMeta: {
    color: "var(--lcars-lavender)",
    fontSize: 10,
    lineHeight: 1.4,
    wordBreak: "break-word" as const,
  },
  placeholder: {
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
};

export default RolePicker;
