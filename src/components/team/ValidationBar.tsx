import type { ReactNode } from "react";

export type ValidationIssue = {
  id: string;
  title: string;
  detail: string;
  blocking: boolean;
  actionLabel?: string;
  onAction?: () => void;
};

type ValidationStat = {
  label: string;
  value: number;
  color: string;
};

type ValidationBarProps = {
  stats: ValidationStat[];
  issues: ValidationIssue[];
  footer?: ReactNode;
};

function ValidationBar({ stats, issues, footer }: ValidationBarProps) {
  return (
    <div style={styles.wrap}>
      <div style={styles.statGrid}>
        {stats.map((stat) => (
          <div key={stat.label} style={styles.statRow}>
            <span style={styles.statLabel}>{stat.label}</span>
            <span style={{ ...styles.statValue, color: stat.color }}>{stat.value}</span>
          </div>
        ))}
      </div>

      {issues.length > 0 ? (
        <div style={styles.issueList}>
          {issues.map((issue) => (
            <div
              key={issue.id}
              style={{
                ...styles.issueItem,
                borderLeftColor: issue.blocking
                  ? "var(--lcars-red)"
                  : "var(--lcars-yellow)",
              }}
            >
              <div style={styles.issueTextWrap}>
                <div
                  style={{
                    ...styles.issueTitle,
                    color: issue.blocking
                      ? "var(--lcars-red)"
                      : "var(--lcars-yellow)",
                  }}
                >
                  {issue.title}
                </div>
                <div style={styles.issueDetail}>{issue.detail}</div>
              </div>
              {issue.actionLabel && issue.onAction ? (
                <button onClick={issue.onAction} style={styles.actionButton}>
                  {issue.actionLabel}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div style={styles.passBanner}>VALIDATION PASS: READY TO SAVE</div>
      )}

      {footer}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: "grid",
    gap: 8,
  },
  statGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 6,
    padding: "10px 12px",
    border: "1px solid rgba(153, 153, 204, 0.18)",
    borderRadius: "0 14px 14px 0",
    background: "rgba(12, 12, 26, 0.78)",
  },
  statRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  statLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    letterSpacing: "1.1px",
    color: "var(--lcars-lavender)",
  },
  statValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    fontWeight: 600,
  },
  issueList: {
    display: "grid",
    gap: 6,
  },
  issueItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    borderLeft: "3px solid",
    background: "rgba(18, 18, 34, 0.9)",
    borderTop: "1px solid rgba(153, 153, 204, 0.18)",
    borderRight: "1px solid rgba(153, 153, 204, 0.18)",
    borderBottom: "1px solid rgba(153, 153, 204, 0.18)",
    borderRadius: "0 12px 12px 0",
    padding: "8px 10px",
  },
  issueTextWrap: {
    minWidth: 0,
    flex: 1,
  },
  issueTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    letterSpacing: "1px",
    textTransform: "uppercase" as const,
    marginBottom: 2,
  },
  issueDetail: {
    color: "var(--lcars-lavender)",
    fontSize: 10,
    lineHeight: 1.4,
  },
  actionButton: {
    background: "transparent",
    border: "1px solid rgba(153, 153, 204, 0.34)",
    color: "var(--lcars-tan)",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    letterSpacing: "1px",
    padding: "6px 8px",
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  },
  passBanner: {
    borderLeft: "3px solid var(--lcars-green)",
    background: "rgba(18, 34, 22, 0.45)",
    borderTop: "1px solid rgba(51, 204, 102, 0.26)",
    borderRight: "1px solid rgba(51, 204, 102, 0.26)",
    borderBottom: "1px solid rgba(51, 204, 102, 0.26)",
    borderRadius: "0 12px 12px 0",
    color: "var(--lcars-green)",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    letterSpacing: "1px",
    textTransform: "uppercase" as const,
    padding: "8px 10px",
  },
};

export default ValidationBar;
