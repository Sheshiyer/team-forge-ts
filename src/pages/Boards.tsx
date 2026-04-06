import { useState, useEffect, useCallback } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { SkeletonTable } from "../components/ui/Skeleton";
import Avatar from "../components/ui/Avatar";
import type { BoardCardView } from "../lib/types";

function daysColor(days: number): string {
  if (days <= 3) return "var(--lcars-green)";
  if (days <= 7) return "var(--lcars-yellow)";
  return "var(--lcars-red)";
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 2,
        backgroundColor: "transparent",
        border: "1px solid var(--text-quaternary)",
        color: "var(--lcars-lavender)",
        fontSize: 10,
        fontWeight: 600,
        fontFamily: "'Orbitron', sans-serif",
        lineHeight: "18px",
        letterSpacing: "1px",
        textTransform: "uppercase" as const,
      }}
    >
      {status.toUpperCase()}
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
      setCards([...data].sort((a, b) => b.daysInStatus - a.daysInStatus));
    } catch {
      // data may not exist yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div>
        <h1 style={styles.pageTitle}>BOARDS</h1>
        <div style={styles.pageTitleBar} />
        <div style={styles.card}><SkeletonTable rows={6} cols={5} /></div>
      </div>
    );
  }

  const filtered = stuckOnly ? cards.filter((c) => c.daysInStatus > 7) : cards;
  const stuckCount = cards.filter((c) => c.daysInStatus > 7).length;

  return (
    <div>
      <h1 style={styles.pageTitle}>BOARDS</h1>
      <div style={styles.pageTitleBar} />

      <div style={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h2 style={{ ...styles.sectionTitle, marginBottom: 0 }}>BOARD CARDS</h2>
          <button
            onClick={() => setStuckOnly(!stuckOnly)}
            style={{
              background: stuckOnly ? "rgba(204, 51, 51, 0.1)" : "transparent",
              border: `1px solid ${stuckOnly ? "var(--lcars-red)" : "rgba(255, 153, 0, 0.3)"}`,
              borderRadius: 2,
              padding: "4px 12px",
              fontSize: 10,
              fontWeight: 600,
              fontFamily: "'Orbitron', sans-serif",
              color: stuckOnly ? "var(--lcars-red)" : "var(--lcars-lavender)",
              cursor: "pointer",
              letterSpacing: "1px",
              textTransform: "uppercase" as const,
            }}
          >
            STUCK CARDS ({stuckCount})
          </button>
        </div>
        <div style={styles.sectionDivider} />

        {filtered.length === 0 ? (
          <p style={styles.emptyText}>
            {stuckOnly ? "NO STUCK CARDS FOUND" : "NO BOARD CARDS FOUND. SYNC HULY DATA FIRST."}
          </p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>CARD</th>
                <th style={styles.th}>BOARD</th>
                <th style={styles.th}>ASSIGNEE</th>
                <th style={styles.th}>STATUS</th>
                <th style={styles.th}>DAYS IN STATUS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} style={{ cursor: "default" }}>
                  <td style={{ ...styles.td, color: "var(--lcars-orange)", fontWeight: 600 }}>
                    {c.title}
                  </td>
                  <td style={styles.td}>{c.boardName ?? "--"}</td>
                  <td style={styles.td}>
                    {c.assigneeName ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Avatar name={c.assigneeName} size={24} />
                        <span style={{ color: "var(--lcars-tan)" }}>{c.assigneeName}</span>
                      </div>
                    ) : (
                      <span style={{ color: "var(--text-quaternary)" }}>UNASSIGNED</span>
                    )}
                  </td>
                  <td style={styles.td}><StatusPill status={c.status} /></td>
                  <td
                    style={{
                      ...styles.tdMono,
                      color: daysColor(c.daysInStatus),
                      fontWeight: 600,
                      textShadow: c.daysInStatus > 7 ? `0 0 6px ${daysColor(c.daysInStatus)}44` : "none",
                    }}
                  >
                    {c.daysInStatus}D
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
    borderLeft: "4px solid var(--lcars-tan)",
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
};

export default Boards;
