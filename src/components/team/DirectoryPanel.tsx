import Avatar from "../ui/Avatar";
import type { ReactNode } from "react";
import type { OrgPersonView } from "../../lib/types";
import type { DirectoryMode } from "./types";

export type DirectoryAssignmentOption = {
  value: string;
  label: string;
};

export type DirectoryEntry = {
  person: OrgPersonView;
  accent: string;
  assignmentSummary: string;
  assignmentValue: string;
};

type DirectoryPanelProps = {
  searchValue: string;
  onSearchChange: (value: string) => void;
  mode: DirectoryMode;
  onModeChange: (mode: DirectoryMode) => void;
  unassignedCount: number;
  visibleCount: number;
  showingCount: number;
  totalCount: number;
  entries: DirectoryEntry[];
  assignmentOptions: DirectoryAssignmentOption[];
  onAssignmentChange: (personId: string, value: string) => void;
  validationBar: ReactNode;
};

function inactiveBadge() {
  return (
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
      INACTIVE
    </span>
  );
}

function DirectoryPanel({
  searchValue,
  onSearchChange,
  mode,
  onModeChange,
  unassignedCount,
  visibleCount,
  showingCount,
  totalCount,
  entries,
  assignmentOptions,
  onAssignmentChange,
  validationBar,
}: DirectoryPanelProps) {
  return (
    <aside style={styles.teamRail}>
      <div style={styles.teamRailHeader}>
        <div style={styles.teamRailTitle}>CREW DIRECTORY</div>
        <div style={styles.teamRailMeta}>
          {showingCount} SHOWING • {totalCount} TOTAL
        </div>
      </div>

      <div style={styles.field}>
        <label style={styles.label}>SEARCH TEAM</label>
        <input
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="SEARCH NAME OR EMAIL"
          style={styles.input}
        />
      </div>

      <div style={styles.modeRow}>
        <button
          onClick={() => onModeChange("unassigned")}
          style={{
            ...styles.modeButton,
            ...(mode === "unassigned" ? styles.modeButtonActive : null),
          }}
        >
          UNASSIGNED ({unassignedCount})
        </button>
        <button
          onClick={() => onModeChange("all")}
          style={{
            ...styles.modeButton,
            ...(mode === "all" ? styles.modeButtonActive : null),
          }}
        >
          ALL CREW ({visibleCount})
        </button>
      </div>

      {validationBar}

      <div style={styles.list}>
        {entries.length === 0 ? (
          <div style={styles.placeholder}>
            {mode === "unassigned"
              ? "EVERY VISIBLE CREW MEMBER IS ALREADY ASSIGNED."
              : "NO CREW MATCH THE CURRENT SEARCH."}
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.person.personId}
              style={{
                ...styles.card,
                borderLeft: `3px solid ${entry.accent}`,
                opacity: entry.person.active ? 1 : 0.72,
              }}
            >
              <div style={styles.identityRow}>
                <Avatar name={entry.person.name} size={22} />
                <div style={styles.identityText}>
                  <div style={styles.personName}>{entry.person.name}</div>
                  <div style={styles.personMeta}>{entry.person.email || "NO EMAIL"}</div>
                </div>
                {!entry.person.active ? inactiveBadge() : null}
              </div>

              <div style={styles.assignmentRow}>
                <span
                  style={{
                    ...styles.assignmentPill,
                    color: entry.accent,
                    borderColor: `${entry.accent}80`,
                  }}
                >
                  {entry.assignmentSummary}
                </span>
                <select
                  value={entry.assignmentValue}
                  onChange={(event) =>
                    onAssignmentChange(entry.person.personId, event.target.value)
                  }
                  style={styles.select}
                  aria-label={`Assign ${entry.person.name}`}
                >
                  <option value="unassigned">UNASSIGNED</option>
                  {assignmentOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  teamRail: {
    position: "sticky",
    top: 0,
    display: "flex",
    flexDirection: "column",
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
  field: {
    marginBottom: 2,
  },
  label: {
    display: "block",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    color: "var(--lcars-lavender)",
    marginBottom: 6,
    letterSpacing: "1.5px",
    textTransform: "uppercase",
  },
  input: {
    width: "100%",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    border: "1px solid rgba(153, 153, 204, 0.2)",
    borderRadius: 2,
    padding: "8px 10px",
    marginBottom: 0,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    letterSpacing: "0.4px",
    minHeight: 34,
    outline: "none",
  },
  modeRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
  },
  modeButton: {
    background: "rgba(153, 153, 204, 0.08)",
    border: "1px solid rgba(153, 153, 204, 0.22)",
    color: "var(--lcars-lavender)",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    letterSpacing: "1px",
    padding: "8px 10px",
    textAlign: "center",
    cursor: "pointer",
  },
  modeButtonActive: {
    borderColor: "var(--lcars-cyan)",
    color: "var(--lcars-cyan)",
    background: "rgba(0, 204, 255, 0.12)",
    boxShadow: "inset 0 0 0 1px rgba(0, 204, 255, 0.14)",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    maxHeight: 420,
    overflowY: "auto",
    paddingRight: 4,
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
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    background: "rgba(26, 26, 46, 0.92)",
    padding: "10px 12px",
    minWidth: 0,
    borderRadius: "0 14px 14px 0",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
  },
  identityRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  identityText: {
    minWidth: 0,
    flex: 1,
  },
  personName: {
    color: "var(--lcars-tan)",
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: "0.2px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  personMeta: {
    color: "var(--lcars-lavender)",
    fontSize: 10,
    letterSpacing: "0.4px",
    marginTop: 2,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  assignmentRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: 6,
  },
  assignmentPill: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    letterSpacing: "1px",
    textTransform: "uppercase",
    padding: "3px 8px",
    border: "1px solid",
    width: "fit-content",
  },
  select: {
    width: "100%",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    border: "1px solid rgba(153, 153, 204, 0.2)",
    borderRadius: 2,
    padding: "6px 8px",
    marginBottom: 0,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    letterSpacing: "0.4px",
    height: 34,
    outline: "none",
  },
};

export default DirectoryPanel;
