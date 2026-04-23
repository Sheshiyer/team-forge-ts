import { useState, useEffect, useCallback } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stuckOnly, setStuckOnly] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getBoardCards();
      setCards([...data].sort((a, b) => b.daysInStatus - a.daysInStatus));
      setLoadError(null);
    } catch {
      setLoadError(
        "BOARD CARDS UNAVAILABLE.",
      );
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
              ...lcarsPageStyles.ghostButton,
              background: stuckOnly ? "rgba(204, 51, 51, 0.1)" : "rgba(10, 10, 20, 0.68)",
              border: `1px solid ${stuckOnly ? "var(--lcars-red)" : "rgba(255, 153, 0, 0.28)"}`,
              padding: "4px 12px",
              color: stuckOnly ? "var(--lcars-red)" : "var(--lcars-lavender)",
            }}
          >
            STUCK CARDS ({stuckCount})
          </button>
        </div>
        <div style={styles.sectionDivider} />

        {loadError ? (
          <p style={styles.emptyText}>{loadError}</p>
        ) : filtered.length === 0 ? (
          <p style={styles.emptyText}>
            {stuckOnly
              ? "NO STUCK CARDS FOUND"
              : "NO BOARD CARDS."}
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
  pageTitle: lcarsPageStyles.pageTitle,
  pageTitleBar: lcarsPageStyles.pageTitleBar,
  card: {
    ...lcarsPageStyles.card,
    borderLeftColor: "var(--lcars-tan)",
  },
  sectionTitle: lcarsPageStyles.sectionTitle,
  sectionDivider: lcarsPageStyles.sectionDivider,
  table: lcarsPageStyles.table,
  th: lcarsPageStyles.th,
  td: lcarsPageStyles.td,
  tdMono: lcarsPageStyles.tdMono,
  emptyText: lcarsPageStyles.emptyText,
};

export default Boards;
