import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Avatar from "../components/ui/Avatar";
import { SkeletonTable } from "../components/ui/Skeleton";
import { useInvoke } from "../hooks/useInvoke";
import { useViewportWidth } from "../hooks/useViewportWidth";
import { timeAgo } from "../lib/format";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";
import type {
  ChatActivityView,
  Employee,
  MeetingLoadView,
  SyncState,
} from "../lib/types";

type CrewCommsRow = {
  name: string;
  employee: Employee | null;
  chat: ChatActivityView | null;
  meeting: MeetingLoadView | null;
};

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function meetingRatioColor(ratio: number): string {
  if (ratio < 0.3) return "var(--lcars-green)";
  if (ratio < 0.5) return "var(--lcars-yellow)";
  return "var(--lcars-red)";
}

function formatSyncLabel(state: SyncState): string {
  const source = state.source.replace(/_/g, " ").toUpperCase();
  const entity = state.entity.replace(/_/g, " ").toUpperCase();
  return `${source} / ${entity}`;
}

function formatLastSeen(value: string | null): string {
  if (!value) return "--";
  return timeAgo(value).toUpperCase();
}

function MeetingRatioBar({ ratio }: { ratio: number }) {
  const pct = Math.min(ratio * 100, 100);
  const color = meetingRatioColor(ratio);

  return (
    <div style={styles.ratioWrap}>
      <div style={styles.ratioBarTrack}>
        <div
          style={{
            ...styles.ratioBarFill,
            width: `${pct}%`,
            background: color,
            boxShadow: `0 0 6px ${color}44`,
          }}
        />
      </div>
      <span style={{ ...styles.ratioText, color }}>{pct.toFixed(0)}%</span>
    </div>
  );
}

function MetricCard({
  label,
  value,
  meta,
  tone,
}: {
  label: string;
  value: string;
  meta: string;
  tone: string;
}) {
  return (
    <div style={{ ...styles.metricCard, borderLeftColor: tone }}>
      <div style={styles.metricLabel}>{label}</div>
      <div style={{ ...styles.metricValue, color: tone }}>{value}</div>
      <div style={styles.metricMeta}>{meta}</div>
    </div>
  );
}

function LeaderList({
  title,
  caption,
  emptyLabel,
  children,
}: {
  title: string;
  caption: string;
  emptyLabel: string;
  children: ReactNode;
}) {
  return (
    <div style={styles.panelCard}>
      <div style={styles.panelHeader}>
        <div>
          <div style={styles.sectionTitle}>{title}</div>
          <div style={styles.sectionCaption}>{caption}</div>
        </div>
      </div>
      <div style={styles.sectionDivider} />
      {children ? children : <div style={styles.emptyText}>{emptyLabel}</div>}
    </div>
  );
}

export default function Comms() {
  const api = useInvoke();
  const viewportWidth = useViewportWidth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [chatActivity, setChatActivity] = useState<ChatActivityView[]>([]);
  const [meetingLoad, setMeetingLoad] = useState<MeetingLoadView[]>([]);
  const [syncStates, setSyncStates] = useState<SyncState[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    const [rosterResult, chatResult, meetingResult, syncResult] =
      await Promise.allSettled([
        api.getEmployees(),
        api.getChatActivity(),
        api.getMeetingLoad(),
        api.getSyncStatus(),
      ]);

    const issues: string[] = [];

    if (rosterResult.status === "fulfilled") {
      setEmployees(rosterResult.value);
    } else {
      setEmployees([]);
      issues.push("ROSTER OFFLINE");
    }

    if (chatResult.status === "fulfilled") {
      setChatActivity(
        [...chatResult.value].sort((left, right) => right.messageCount - left.messageCount)
      );
    } else {
      setChatActivity([]);
      issues.push("CHAT FEED OFFLINE");
    }

    if (meetingResult.status === "fulfilled") {
      setMeetingLoad(
        [...meetingResult.value].sort(
          (left, right) => right.meetingRatio - left.meetingRatio
        )
      );
    } else {
      setMeetingLoad([]);
      issues.push("MEETING FEED OFFLINE");
    }

    if (syncResult.status === "fulfilled") {
      setSyncStates(syncResult.value);
    } else {
      setSyncStates([]);
      issues.push("SYNC STATUS OFFLINE");
    }

    setStatusMessage(issues.length > 0 ? issues.join(" • ") : "CHAT / MEETINGS / ROSTER");
    setLoading(false);
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div>
        <h1 style={styles.pageTitle}>COMMUNICATIONS</h1>
        <div style={styles.pageTitleBar} />
        <div style={styles.card}>
          <SkeletonTable rows={3} cols={4} />
        </div>
        <div style={styles.splitGrid}>
          <div style={styles.panelCard}>
            <SkeletonTable rows={4} cols={3} />
          </div>
          <div style={styles.panelCard}>
            <SkeletonTable rows={4} cols={3} />
          </div>
        </div>
        <div style={styles.card}>
          <SkeletonTable rows={6} cols={6} />
        </div>
      </div>
    );
  }

  const activeEmployees = employees.filter((employee) => employee.isActive);
  const employeeByName = new Map(
    activeEmployees.map((employee) => [normalizeName(employee.name), employee])
  );
  const chatByName = new Map(
    chatActivity.map((row) => [normalizeName(row.employeeName), row])
  );
  const meetingByName = new Map(
    meetingLoad.map((row) => [normalizeName(row.employeeName), row])
  );
  const crewNames = new Set<string>([
    ...activeEmployees.map((employee) => employee.name),
    ...chatActivity.map((row) => row.employeeName),
    ...meetingLoad.map((row) => row.employeeName),
  ]);

  const crewRows: CrewCommsRow[] = [...crewNames]
    .map((name) => {
      const key = normalizeName(name);
      return {
        name,
        employee: employeeByName.get(key) ?? null,
        chat: chatByName.get(key) ?? null,
        meeting: meetingByName.get(key) ?? null,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  const liveChatCount = crewRows.filter((row) => (row.chat?.messageCount ?? 0) > 0).length;
  const totalMessages = chatActivity.reduce((sum, row) => sum + row.messageCount, 0);
  const totalMeetingHours = meetingLoad.reduce(
    (sum, row) => sum + row.totalMeetingHours,
    0
  );
  const highMeetingLoadCount = crewRows.filter(
    (row) => (row.meeting?.meetingRatio ?? 0) >= 0.5
  ).length;
  const quietCrewCount = crewRows.filter(
    (row) =>
      (row.chat?.messageCount ?? 0) === 0 && (row.meeting?.meetingsThisWeek ?? 0) === 0
  ).length;
  const syncRows = [...syncStates]
    .sort((left, right) => right.lastSyncAt.localeCompare(left.lastSyncAt))
    .slice(0, 6);
  const topChatRows = [...chatActivity].slice(0, 5);
  const topMeetingRows = [...meetingLoad]
    .sort((left, right) => right.meetingRatio - left.meetingRatio)
    .slice(0, 5);

  const splitGridStyle = {
    ...styles.splitGrid,
    gridTemplateColumns:
      viewportWidth < 920 ? "1fr" : (styles.splitGrid.gridTemplateColumns as string),
  };
  const metricsGridStyle = {
    ...styles.metricsGrid,
    gridTemplateColumns:
      viewportWidth < 760 ? "repeat(2, minmax(0, 1fr))" : styles.metricsGrid.gridTemplateColumns,
  };
  const signalRailStyle = {
    ...styles.signalRail,
    gridTemplateColumns:
      viewportWidth < 1080
        ? "repeat(2, minmax(0, 1fr))"
        : (styles.signalRail.gridTemplateColumns as string),
  };

  return (
    <div>
      <h1 style={styles.pageTitle}>COMMUNICATIONS</h1>
      <div style={styles.pageTitleBar} />

      <div style={styles.statusBanner}>
        <div>
          <div style={styles.statusLabel}>SIGNAL STATUS</div>
          <div style={styles.statusText}>{statusMessage}</div>
        </div>
        <div style={styles.statusMeta}>{crewRows.length} CREW SURFACES</div>
      </div>

      <div style={metricsGridStyle}>
        <MetricCard
          label="ACTIVE CREW"
          value={`${activeEmployees.length || crewRows.length}`}
          meta={`${quietCrewCount} QUIET`}
          tone="var(--lcars-cyan)"
        />
        <MetricCard
          label="CHAT LIVE"
          value={`${liveChatCount}`}
          meta={`${totalMessages} MSG / 7D`}
          tone="var(--lcars-orange)"
        />
        <MetricCard
          label="MEETING HOURS"
          value={`${totalMeetingHours.toFixed(1)}H`}
          meta={`${meetingLoad.length} TRACKED`}
          tone="var(--lcars-yellow)"
        />
        <MetricCard
          label="FOCUS RISK"
          value={`${highMeetingLoadCount}`}
          meta="RATIO >= 50%"
          tone="var(--lcars-green)"
        />
      </div>

      <div style={styles.card}>
        <div style={styles.panelHeader}>
          <div>
            <div style={styles.sectionTitle}>SIGNAL RAIL</div>
            <div style={styles.sectionCaption}>CHAT / MEETINGS / ROSTER</div>
          </div>
        </div>
        <div style={styles.sectionDivider} />
        {syncRows.length === 0 ? (
          <div style={styles.emptyText}>NO SYNC MARKERS</div>
        ) : (
          <div style={signalRailStyle}>
            {syncRows.map((state) => (
              <div key={`${state.source}-${state.entity}`} style={styles.signalCard}>
                <div style={styles.signalTitle}>{formatSyncLabel(state)}</div>
                <div style={styles.signalMeta}>{formatLastSeen(state.lastSyncAt)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={splitGridStyle}>
        <LeaderList
          title="CHAT LEADERS"
          caption="LAST 7 DAYS"
          emptyLabel="NO CHAT ACTIVITY"
        >
          {topChatRows.length > 0 ? (
            <div style={styles.leaderList}>
              {topChatRows.map((row) => (
                <div key={row.employeeName} style={styles.leaderRow}>
                  <div style={styles.personWrap}>
                    <Avatar name={row.employeeName} size={28} />
                    <div>
                      <div style={styles.personName}>{row.employeeName}</div>
                      <div style={styles.personMeta}>
                        {row.channelsActive} CHANNELS • {formatLastSeen(row.lastMessageAt)}
                      </div>
                    </div>
                  </div>
                  <div style={styles.leaderValue}>{row.messageCount}</div>
                </div>
              ))}
            </div>
          ) : null}
        </LeaderList>

        <LeaderList
          title="MEETING LOAD"
          caption="THIS WEEK"
          emptyLabel="NO MEETING DATA"
        >
          {topMeetingRows.length > 0 ? (
            <div style={styles.leaderList}>
              {topMeetingRows.map((row) => (
                <div key={row.employeeName} style={styles.leaderRow}>
                  <div style={styles.personWrap}>
                    <Avatar name={row.employeeName} size={28} />
                    <div>
                      <div style={styles.personName}>{row.employeeName}</div>
                      <div style={styles.personMeta}>
                        {row.meetingsThisWeek} MEETINGS • {row.totalMeetingHours.toFixed(1)}H
                      </div>
                    </div>
                  </div>
                  <div style={styles.ratioColumn}>
                    <MeetingRatioBar ratio={row.meetingRatio} />
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </LeaderList>
      </div>

      <div style={styles.card}>
        <div style={styles.panelHeader}>
          <div>
            <div style={styles.sectionTitle}>CREW MATRIX</div>
            <div style={styles.sectionCaption}>ROSTER-FIRST SIGNAL VIEW</div>
          </div>
        </div>
        <div style={styles.sectionDivider} />
        {crewRows.length === 0 ? (
          <div style={styles.emptyText}>NO CREW SIGNALS</div>
        ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>CREW</th>
                  <th style={styles.th}>CHAT</th>
                  <th style={styles.th}>CHANNELS</th>
                  <th style={styles.th}>LAST MESSAGE</th>
                  <th style={styles.th}>MEETINGS</th>
                  <th style={styles.th}>MEETING HOURS</th>
                  <th style={styles.th}>RATIO</th>
                </tr>
              </thead>
              <tbody>
                {crewRows.map((row) => (
                  <tr key={row.name}>
                    <td style={styles.td}>
                      <div style={styles.personWrap}>
                        <Avatar
                          name={row.name}
                          size={24}
                          src={row.employee?.avatarUrl ?? null}
                        />
                        <div>
                          <div style={styles.tablePrimary}>{row.name}</div>
                          <div style={styles.tableSecondary}>
                            {row.employee ? "ACTIVE CREW" : "SIGNAL ONLY"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={styles.tdMono}>{row.chat?.messageCount ?? 0}</td>
                    <td style={styles.tdMono}>{row.chat?.channelsActive ?? 0}</td>
                    <td style={styles.tdMono}>
                      {row.chat?.lastMessageAt ? formatLastSeen(row.chat.lastMessageAt) : "--"}
                    </td>
                    <td style={styles.tdMono}>{row.meeting?.meetingsThisWeek ?? 0}</td>
                    <td style={styles.tdMono}>
                      {(row.meeting?.totalMeetingHours ?? 0).toFixed(1)}H
                    </td>
                    <td style={styles.td}>
                      <MeetingRatioBar ratio={row.meeting?.meetingRatio ?? 0} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  pageTitle: lcarsPageStyles.pageTitle,
  pageTitleBar: lcarsPageStyles.pageTitleBar,
  card: lcarsPageStyles.card,
  panelCard: {
    ...lcarsPageStyles.card,
    borderLeftColor: "var(--lcars-cyan)",
  },
  sectionTitle: lcarsPageStyles.sectionTitle,
  sectionCaption: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    color: "var(--lcars-lavender)",
    letterSpacing: "1.4px",
    textTransform: "uppercase",
  },
  sectionDivider: lcarsPageStyles.sectionDivider,
  emptyText: lcarsPageStyles.emptyText,
  statusBanner: {
    ...lcarsPageStyles.subtleCard,
    borderLeftColor: "var(--lcars-cyan)",
    borderLeftWidth: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 18,
  },
  statusLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    color: "var(--lcars-cyan)",
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  statusText: {
    color: "var(--lcars-tan)",
    fontSize: 12,
    lineHeight: 1.6,
  },
  statusMeta: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: "var(--lcars-lavender)",
  },
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 12,
    marginBottom: 18,
  },
  metricCard: {
    ...lcarsPageStyles.subtleCard,
    minHeight: 102,
    padding: "14px 16px",
  },
  metricLabel: {
    ...lcarsPageStyles.metricLabel,
    marginBottom: 10,
  },
  metricValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 28,
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: "-0.04em",
  },
  metricMeta: {
    marginTop: 10,
    fontSize: 10,
    color: "var(--lcars-lavender)",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    lineHeight: 1.5,
  },
  panelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
  },
  signalRail: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 12,
  },
  signalCard: {
    ...lcarsPageStyles.subtleCard,
    borderLeftColor: "var(--lcars-peach)",
    minHeight: 82,
  },
  signalTitle: {
    color: "var(--lcars-orange)",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    letterSpacing: "0.12em",
    lineHeight: 1.6,
  },
  signalMeta: {
    marginTop: 10,
    color: "var(--lcars-lavender)",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
  },
  splitGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 18,
    marginBottom: 18,
  },
  leaderList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  leaderRow: {
    ...lcarsPageStyles.subtleCard,
    borderLeftColor: "var(--lcars-peach)",
    padding: "12px 14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  personWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  personName: {
    color: "var(--lcars-orange)",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 12,
    letterSpacing: "0.06em",
  },
  personMeta: {
    marginTop: 4,
    fontSize: 11,
    color: "var(--lcars-lavender)",
  },
  leaderValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 24,
    fontWeight: 700,
    color: "var(--lcars-cyan)",
    flexShrink: 0,
  },
  ratioColumn: {
    minWidth: 110,
  },
  ratioWrap: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  ratioBarTrack: {
    flex: 1,
    height: 6,
    background: "rgba(153, 153, 204, 0.1)",
    overflow: "hidden",
  },
  ratioBarFill: {
    height: "100%",
    transition: "width 0.4s ease",
  },
  ratioText: {
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    whiteSpace: "nowrap",
  },
  tableWrap: {
    overflowX: "auto",
  },
  table: {
    ...lcarsPageStyles.table,
    minWidth: 860,
  },
  th: lcarsPageStyles.th,
  td: lcarsPageStyles.td,
  tdMono: lcarsPageStyles.tdMono,
  tablePrimary: {
    color: "var(--lcars-tan)",
    fontSize: 12,
  },
  tableSecondary: {
    marginTop: 3,
    fontSize: 10,
    color: "var(--text-quaternary)",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
};
