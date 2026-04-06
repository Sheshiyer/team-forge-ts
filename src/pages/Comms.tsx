import { useState, useEffect, useCallback } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { SkeletonTable } from "../components/ui/Skeleton";
import Avatar from "../components/ui/Avatar";
import type { ChatActivityView, MeetingLoadView } from "../lib/types";

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "--";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function meetingRatioColor(ratio: number): string {
  if (ratio < 0.3) return "var(--status-success)";
  if (ratio < 0.5) return "var(--status-warning)";
  return "var(--status-critical)";
}

function MeetingRatioBar({ ratio }: { ratio: number }) {
  const pct = Math.min(ratio * 100, 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          flex: 1,
          height: 6,
          borderRadius: 3,
          background: "rgba(255,255,255,0.05)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: 3,
            background: meetingRatioColor(ratio),
            transition: "width 0.4s ease",
          }}
        />
      </div>
      <span style={{ fontSize: 12, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
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

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div>
        <h1 style={styles.pageTitle}>Communications</h1>
        <div style={styles.card}>
          <SkeletonTable rows={5} cols={4} />
        </div>
        <div style={styles.card}>
          <SkeletonTable rows={5} cols={5} />
        </div>
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
      <h1 style={styles.pageTitle}>Communications</h1>

      {/* Chat Activity */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>Chat Activity (Last 7 Days)</h2>
        {chatActivity.length === 0 ? (
          <p style={styles.emptyText}>No chat activity data available.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Employee</th>
                <th style={styles.th}>Messages</th>
                <th style={styles.th}>Channels Active</th>
                <th style={styles.th}>Last Message</th>
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
                      backgroundColor: isSilent ? "rgba(239, 68, 68, 0.04)" : "transparent",
                    }}
                  >
                    <td style={styles.td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Avatar name={c.employeeName} size={24} />
                        {c.employeeName}
                        {isMostActive && maxMessages > 0 && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              color: "var(--accent-brand)",
                              background: "rgba(94, 106, 210, 0.12)",
                              padding: "1px 6px",
                              borderRadius: "var(--radius-full)",
                              letterSpacing: "0.04em",
                            }}
                          >
                            Most Active
                          </span>
                        )}
                      </div>
                    </td>
                    <td
                      style={{
                        ...styles.td,
                        color: isSilent ? "var(--status-warning)" : "var(--text-secondary)",
                        fontWeight: isSilent ? 510 : 400,
                      }}
                    >
                      {c.messageCount}
                    </td>
                    <td style={styles.td}>{c.channelsActive}</td>
                    <td style={styles.td}>{formatRelativeTime(c.lastMessageAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Meeting Load */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>Meeting Load (This Week)</h2>
        {meetingLoad.length === 0 ? (
          <p style={styles.emptyText}>No meeting data available.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Employee</th>
                <th style={styles.th}>Meetings</th>
                <th style={styles.th}>Meeting Hours</th>
                <th style={styles.th}>Work Hours</th>
                <th style={{ ...styles.th, minWidth: 140 }}>Meeting Ratio</th>
              </tr>
            </thead>
            <tbody>
              {meetingLoad.map((m) => (
                <tr key={m.employeeName} style={{ cursor: "default" }}>
                  <td style={styles.td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Avatar name={m.employeeName} size={24} />
                      {m.employeeName}
                    </div>
                  </td>
                  <td style={styles.td}>{m.meetingsThisWeek}</td>
                  <td style={styles.td}>{m.totalMeetingHours.toFixed(1)}h</td>
                  <td style={styles.td}>{m.workHours.toFixed(1)}h</td>
                  <td style={styles.td}>
                    <MeetingRatioBar ratio={m.meetingRatio} />
                  </td>
                </tr>
              ))}
              {/* Total row */}
              <tr
                style={{
                  cursor: "default",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <td style={{ ...styles.td, fontWeight: 510, color: "var(--text-primary)" }}>
                  Total
                </td>
                <td style={{ ...styles.td, fontWeight: 510 }}>{totalMeetings}</td>
                <td style={{ ...styles.td, fontWeight: 510 }}>{totalMeetingHours.toFixed(1)}h</td>
                <td style={{ ...styles.td, fontWeight: 510 }}>{totalWorkHours.toFixed(1)}h</td>
                <td style={{ ...styles.td, fontWeight: 510 }}>
                  <MeetingRatioBar ratio={avgRatio} />
                </td>
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

export default Comms;
