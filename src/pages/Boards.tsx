import { useState, useEffect, useCallback } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { SkeletonTable } from "../components/ui/Skeleton";
import Avatar from "../components/ui/Avatar";
import type { BoardCardView } from "../lib/types";

function daysColor(days: number): string {
  if (days <= 3) return "var(--status-success)";
  if (days <= 7) return "var(--status-warning)";
  return "var(--status-critical)";
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: "var(--radius-full)",
        backgroundColor: "var(--text-quaternary)",
        color: "#fff",
        fontSize: 12,
        fontWeight: 510,
        lineHeight: "20px",
        textTransform: "capitalize",
      }}
    >
      {status}
    </span>
  );
}

function Boards() {
  const api = useInvoke();
  const [cards, setCards] = useState<BoardCardView[]>([]);
  const [loading, setLoading] = useState(true);
  const [stuckOnly, setStuckOnly] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getBoardCards();
      // Sort by daysInStatus descending
      setCards([...data].sort((a, b) => b.daysInStatus - a.daysInStatus));
    } catch {
      // data may not exist yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div>
        <h1 style={styles.pageTitle}>Boards</h1>
        <div style={styles.card}>
          <SkeletonTable rows={6} cols={5} />
        </div>
      </div>
    );
  }

  const filtered = stuckOnly ? cards.filter((c) => c.daysInStatus > 7) : cards;
  const stuckCount = cards.filter((c) => c.daysInStatus > 7).length;

  return (
    <div>
      <h1 style={styles.pageTitle}>Boards</h1>

      <div style={styles.card}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <h2 style={{ ...styles.sectionTitle, marginBottom: 0 }}>Board Cards</h2>
          <button
            onClick={() => setStuckOnly(!stuckOnly)}
            style={{
              background: stuckOnly ? "rgba(239, 68, 68, 0.12)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${stuckOnly ? "rgba(239, 68, 68, 0.3)" : "var(--border-subtle)"}`,
              borderRadius: "var(--radius-full)",
              padding: "4px 12px",
              fontSize: 12,
              fontWeight: 510,
              color: stuckOnly ? "var(--status-critical)" : "var(--text-tertiary)",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            Stuck Cards ({stuckCount})
          </button>
        </div>

        {filtered.length === 0 ? (
          <p style={styles.emptyText}>
            {stuckOnly ? "No stuck cards found." : "No board cards found. Sync Huly data first."}
          </p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Card</th>
                <th style={styles.th}>Board</th>
                <th style={styles.th}>Assignee</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Days in Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} style={{ cursor: "default" }}>
                  <td style={{ ...styles.td, color: "var(--text-primary)", fontWeight: 500 }}>
                    {c.title}
                  </td>
                  <td style={styles.td}>{c.boardName ?? "--"}</td>
                  <td style={styles.td}>
                    {c.assigneeName ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Avatar name={c.assigneeName} size={24} />
                        {c.assigneeName}
                      </div>
                    ) : (
                      <span style={{ color: "var(--text-quaternary)" }}>Unassigned</span>
                    )}
                  </td>
                  <td style={styles.td}>
                    <StatusPill status={c.status} />
                  </td>
                  <td
                    style={{
                      ...styles.td,
                      color: daysColor(c.daysInStatus),
                      fontWeight: 510,
                    }}
                  >
                    {c.daysInStatus}d
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageTitle: {
    fontSize: 20,
    fontWeight: 600,
    marginBottom: 24,
    color: "var(--text-primary)",
    letterSpacing: "-0.02em",
  },
  card: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid var(--border-standard)",
    borderRadius: "var(--radius-lg)",
    padding: 24,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 510,
    color: "var(--text-primary)",
    marginBottom: 16,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 13,
  },
  th: {
    textAlign: "left" as const,
    color: "var(--text-tertiary)",
    fontWeight: 500,
    padding: "8px 12px",
    borderBottom: "1px solid var(--border-subtle)",
    fontSize: 12,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  td: {
    padding: "10px 12px",
    color: "var(--text-secondary)",
    borderBottom: "1px solid var(--border-subtle)",
  },
  emptyText: {
    fontSize: 13,
    color: "var(--text-tertiary)",
  },
};

export default Boards;
