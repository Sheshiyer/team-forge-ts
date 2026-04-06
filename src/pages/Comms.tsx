import { useState, useEffect, useCallback } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { SkeletonTable } from "../components/ui/Skeleton";
import Avatar from "../components/ui/Avatar";
import type { ChatActivityView, MeetingLoadView } from "../lib/types";

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "--";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "JUST NOW";
  if (mins < 60) return `${mins}M AGO`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}H AGO`;
  const days = Math.floor(hrs / 24);
  return `${days}D AGO`;
}

function meetingRatioColor(ratio: number): string {
  if (ratio < 0.3) return "var(--lcars-green)";
  if (ratio < 0.5) return "var(--lcars-yellow)";
  return "var(--lcars-red)";
}

function MeetingRatioBar({ ratio }: { ratio: number }) {
  const pct = Math.min(ratio * 100, 100);
  const color = meetingRatioColor(ratio);
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
      <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: "var(--lcars-lavender)", whiteSpace: "nowrap" }}>
        {(ratio * 100).toFixed(0)}%
      </span>
    </div>
  );
}

function Comms() {
  const api = useInvoke();
  const [chatActivity, setChatActivity] = useState<ChatActivityView[]>([]);
  const [meetingLoad, setMeetingLoad] = useState<MeetingLoadView[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [chat, meetings] = await Promise.all([
        api.getChatActivity(),
        api.getMeetingLoad(),
      ]);
      setChatActivity([...chat].sort((a, b) => b.messageCount - a.messageCount));
      setMeetingLoad(meetings);
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
        <h1 style={styles.pageTitle}>COMMUNICATIONS</h1>
        <div style={styles.pageTitleBar} />
        <div style={styles.card}><SkeletonTable rows={5} cols={4} /></div>
        <div style={styles.card}><SkeletonTable rows={5} cols={5} /></div>
      </div>
    );
  }

  const maxMessages = chatActivity.length > 0 ? chatActivity[0].messageCount : 0;
  const totalMeetings = meetingLoad.reduce((s, m) => s + m.meetingsThisWeek, 0);
  const totalMeetingHours = meetingLoad.reduce((s, m) => s + m.totalMeetingHours, 0);
  const totalWorkHours = meetingLoad.reduce((s, m) => s + m.workHours, 0);
  const avgRatio = totalWorkHours > 0 ? totalMeetingHours / totalWorkHours : 0;

  return (
    <div>
      <h1 style={styles.pageTitle}>COMMUNICATIONS</h1>
      <div style={styles.pageTitleBar} />

      {/* Chat Activity */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>CHAT ACTIVITY (LAST 7 DAYS)</h2>
        <div style={styles.sectionDivider} />
        {chatActivity.length === 0 ? (
          <p style={styles.emptyText}>NO CHAT ACTIVITY DATA AVAILABLE</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>CREW MEMBER</th>
                <th style={styles.th}>MESSAGES</th>
                <th style={styles.th}>CHANNELS ACTIVE</th>
                <th style={styles.th}>LAST MESSAGE</th>
              </tr>
            </thead>
            <tbody>
              {chatActivity.map((c, idx) => {
                const isMostActive = idx === 0 && c.messageCount > 0;
                const isSilent = c.messageCount === 0;
                return (
                  <tr
                    key={c.employeeName}
                    style={{
                      cursor: "default",
                      backgroundColor: isSilent ? "rgba(204, 51, 51, 0.04)" : "transparent",
                    }}
                  >
                    <td style={styles.td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Avatar name={c.employeeName} size={24} />
                        <span style={{ color: "var(--lcars-orange)" }}>{c.employeeName}</span>
                        {isMostActive && maxMessages > 0 && (
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
                            MOST ACTIVE
                          </span>
                        )}
                      </div>
                    </td>
                    <td
                      style={{
                        ...styles.tdMono,
                        color: isSilent ? "var(--lcars-yellow)" : "var(--lcars-lavender)",
                        fontWeight: isSilent ? 600 : 400,
                      }}
                    >
                      {c.messageCount}
                    </td>
                    <td style={styles.tdMono}>{c.channelsActive}</td>
                    <td style={styles.tdMono}>{formatRelativeTime(c.lastMessageAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Meeting Load */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>MEETING LOAD (THIS WEEK)</h2>
        <div style={styles.sectionDivider} />
        {meetingLoad.length === 0 ? (
          <p style={styles.emptyText}>NO MEETING DATA AVAILABLE</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>CREW MEMBER</th>
                <th style={styles.th}>MEETINGS</th>
                <th style={styles.th}>MEETING HOURS</th>
                <th style={styles.th}>WORK HOURS</th>
                <th style={{ ...styles.th, minWidth: 140 }}>MEETING RATIO</th>
              </tr>
            </thead>
            <tbody>
              {meetingLoad.map((m) => (
                <tr key={m.employeeName} style={{ cursor: "default" }}>
                  <td style={styles.td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Avatar name={m.employeeName} size={24} />
                      <span style={{ color: "var(--lcars-orange)" }}>{m.employeeName}</span>
                    </div>
                  </td>
                  <td style={styles.tdMono}>{m.meetingsThisWeek}</td>
                  <td style={styles.tdMono}>{m.totalMeetingHours.toFixed(1)}h</td>
                  <td style={styles.tdMono}>{m.workHours.toFixed(1)}h</td>
                  <td style={styles.td}><MeetingRatioBar ratio={m.meetingRatio} /></td>
                </tr>
              ))}
              {/* Total row */}
              <tr style={{ cursor: "default", background: "rgba(255, 153, 0, 0.04)" }}>
                <td style={{ ...styles.td, fontWeight: 600, color: "var(--lcars-orange)" }}>TOTAL</td>
                <td style={{ ...styles.tdMono, fontWeight: 600 }}>{totalMeetings}</td>
                <td style={{ ...styles.tdMono, fontWeight: 600 }}>{totalMeetingHours.toFixed(1)}h</td>
                <td style={{ ...styles.tdMono, fontWeight: 600 }}>{totalWorkHours.toFixed(1)}h</td>
                <td style={{ ...styles.td, fontWeight: 600 }}><MeetingRatioBar ratio={avgRatio} /></td>
              </tr>
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
    borderLeft: "4px solid var(--lcars-cyan)",
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

export default Comms;
