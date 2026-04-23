import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import Avatar from "../components/ui/Avatar";
import EmployeeSummaryPanel from "../components/team/EmployeeSummaryPanel";
import { SkeletonTable } from "../components/ui/Skeleton";
import { useInvoke } from "../hooks/useInvoke";
import { useViewportWidth } from "../hooks/useViewportWidth";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";
import type {
  Employee,
  EmployeeSummaryView,
  MonthlyHoursView,
  TeamSnapshotView,
  VaultTeamProfileView,
} from "../lib/types";

type DepartmentCapacitySummary = {
  name: string;
  memberCount: number;
  totalHours: number;
  quotaTotal: number;
};

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.min((current / total) * 100, 100) : 0;
  const color =
    pct >= 80
      ? "var(--lcars-green)"
      : pct >= 50
        ? "var(--lcars-orange)"
        : "var(--lcars-yellow)";
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
      <span
        style={{
          fontSize: 12,
          fontFamily: "'JetBrains Mono', monospace",
          color: "var(--lcars-lavender)",
          whiteSpace: "nowrap",
        }}
      >
        {current.toFixed(0)}h / {total.toFixed(0)}h
      </span>
    </div>
  );
}

function formatSnapshotTimestamp(value: string): string {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function profileMatchesSearch(profile: VaultTeamProfileView, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  const haystack = [
    profile.displayName,
    profile.memberId,
    profile.role ?? "",
    profile.department ?? "",
    profile.contactEmail ?? "",
    profile.primaryProjects.join(" "),
    profile.scope.join(" "),
    profile.teamTags.join(" "),
    profile.onboardingStage.join(" "),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

function truncateSummary(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length <= 220) return trimmed;
  return `${trimmed.slice(0, 217).trimEnd()}...`;
}

function Team() {
  const api = useInvoke();
  const navigate = useNavigate();
  const viewportWidth = useViewportWidth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [vaultProfiles, setVaultProfiles] = useState<VaultTeamProfileView[]>([]);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [snapshotMessage, setSnapshotMessage] = useState<string | null>(null);
  const [cacheUpdatedAt, setCacheUpdatedAt] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [employeeSummary, setEmployeeSummary] =
    useState<EmployeeSummaryView | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [monthlyHours, setMonthlyHours] = useState<MonthlyHoursView[]>([]);
  const [rosterSearch, setRosterSearch] = useState("");
  const isNarrowLayout = viewportWidth < 940;
  const isMobileLayout = viewportWidth < 760;

  const applySnapshot = useCallback((snapshot: TeamSnapshotView) => {
    setVaultProfiles(snapshot.vaultProfiles.filter((profile) => profile.active));
    setVaultError(snapshot.vaultError);
    setCacheUpdatedAt(snapshot.cacheUpdatedAt);
  }, []);

  const load = useCallback(async () => {
    let cachedSnapshot: TeamSnapshotView | null = null;

    setLoading(true);
    setRefreshing(true);
    setSnapshotMessage(null);

    try {
      const roster = await api.getEmployees();
      setEmployees(roster);
    } catch (err) {
      setEmployees([]);
      setSnapshotMessage(`Team roster read failed: ${String(err)}`);
    }

    try {
      const hours = await api.getMonthlyHours();
      setMonthlyHours(hours);
    } catch {
      setMonthlyHours([]);
    }

    try {
      cachedSnapshot = await api.getTeamSnapshot();
      applySnapshot(cachedSnapshot);

      if (cachedSnapshot.cacheUpdatedAt) {
        setSnapshotMessage("USING CACHED TEAM DATA");
      } else {
        setSnapshotMessage("LOADING TEAM DATA");
      }
    } catch (err) {
      setVaultProfiles([]);
      setVaultError(`Team snapshot read failed: ${String(err)}`);
      setCacheUpdatedAt(null);
      setSnapshotMessage(`Team snapshot read failed: ${String(err)}`);
    } finally {
      setLoading(false);
    }

    try {
      const refreshed = await api.refreshTeamSnapshot();
      applySnapshot(refreshed);
      if (refreshed.hulyError) {
        setSnapshotMessage(`CACHE ACTIVE • ${refreshed.hulyError}`);
      } else {
        setSnapshotMessage("TEAM DATA CURRENT");
      }
    } catch (err) {
      if (cachedSnapshot?.cacheUpdatedAt) {
        setSnapshotMessage(`CACHE ACTIVE • ${String(err)}`);
      } else {
        setSnapshotMessage(`TEAM DATA ERROR • ${String(err)}`);
      }
    } finally {
      setRefreshing(false);
    }
  }, [api, applySnapshot]);

  useEffect(() => {
    load();
  }, [load]);

  const activeEmployees = employees.filter((employee) => employee.isActive);
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const profileByEmployeeId = new Map(
    vaultProfiles
      .filter((profile) => profile.employeeId)
      .map((profile) => [profile.employeeId as string, profile])
  );
  const selectableEmployees = activeEmployees.filter((employee) =>
    profileByEmployeeId.has(employee.id)
  );
  const crewEmployees =
    selectableEmployees.length > 0 ? selectableEmployees : activeEmployees;

  useEffect(() => {
    if (crewEmployees.length === 0) {
      setSelectedEmployeeId("");
      return;
    }

    setSelectedEmployeeId((current) =>
      current && crewEmployees.some((employee) => employee.id === current)
        ? current
        : crewEmployees[0].id
    );
  }, [crewEmployees]);

  useEffect(() => {
    if (!selectedEmployeeId) {
      setEmployeeSummary(null);
      setSummaryError(null);
      setSummaryLoading(false);
      return;
    }

    let cancelled = false;
    setSummaryLoading(true);
    setSummaryError(null);

    api
      .getEmployeeSummary(selectedEmployeeId)
      .then((summary) => {
        if (!cancelled) {
          setEmployeeSummary(summary);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setEmployeeSummary(null);
          setSummaryError(String(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSummaryLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api, selectedEmployeeId]);

  if (loading) {
    return (
      <div>
        <h1 style={styles.pageTitle}>TEAM</h1>
        <div style={styles.pageTitleBar} />
        <div style={styles.card}>
          <SkeletonTable rows={4} cols={4} />
        </div>
        <div style={styles.card}>
          <SkeletonTable rows={5} cols={6} />
        </div>
      </div>
    );
  }

  const activeProfiles = vaultProfiles.filter((profile) => profile.active);
  const visibleProfiles = activeProfiles.filter((profile) =>
    profileMatchesSearch(profile, rosterSearch)
  );
  const uniqueProjectCount = new Set(
    activeProfiles.flatMap((profile) =>
      profile.primaryProjects.map((project) => project.trim()).filter(Boolean)
    )
  ).size;
  const onboardingActiveCount = activeProfiles.filter(
    (profile) => profile.onboardingStage.length > 0
  ).length;
  const latestVaultSourceAt = activeProfiles.reduce<string | null>((latest, profile) => {
    if (!profile.sourceLastModifiedAt) return latest;
    if (!latest) return profile.sourceLastModifiedAt;
    return profile.sourceLastModifiedAt > latest ? profile.sourceLastModifiedAt : latest;
  }, null);
  const departmentMap = new Map<string, VaultTeamProfileView[]>();
  for (const profile of visibleProfiles) {
    const key = (profile.department ?? "Unassigned").trim() || "Unassigned";
    const current = departmentMap.get(key) ?? [];
    current.push(profile);
    departmentMap.set(key, current);
  }
  const rosterDepartments = [...departmentMap.entries()]
    .map(([name, profiles]) => ({
      name,
      profiles: [...profiles].sort((left, right) =>
        left.displayName.localeCompare(right.displayName)
      ),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const unmappedProfiles = activeProfiles.filter((profile) => !profile.employeeId).length;
  const mappedProfiles = activeProfiles.filter((profile) => profile.employeeId).length;
  const remoteCrewCount = monthlyHours.filter((row) => row.isRemote).length;

  const monthlyHoursByEmployeeName = new Map(
    monthlyHours.map((row) => [row.employeeName.toLowerCase(), row])
  );
  const departmentCapacityMap = new Map<string, DepartmentCapacitySummary>();
  for (const profile of activeProfiles) {
    if (!profile.employeeId) continue;
    const employee = employeeById.get(profile.employeeId);
    if (!employee) continue;
    const departmentName = (profile.department ?? "Unassigned").trim() || "Unassigned";
    const current =
      departmentCapacityMap.get(departmentName) ?? {
        name: departmentName,
        memberCount: 0,
        totalHours: 0,
        quotaTotal: 0,
      };
    const monthlyRow = monthlyHoursByEmployeeName.get(employee.name.toLowerCase());
    current.memberCount += 1;
    current.totalHours += monthlyRow?.actualHours ?? 0;
    current.quotaTotal += employee.monthlyQuotaHours;
    departmentCapacityMap.set(departmentName, current);
  }
  const departmentCapacity = [...departmentCapacityMap.values()].sort((left, right) =>
    left.name.localeCompare(right.name)
  );

  const monthlyCapacityRows = crewEmployees
    .map((employee) => {
      const monthlyRow =
        monthlyHoursByEmployeeName.get(employee.name.toLowerCase()) ?? null;
      const profile = profileByEmployeeId.get(employee.id) ?? null;
      return {
        employee,
        monthlyRow,
        profile,
      };
    })
    .sort((left, right) => left.employee.name.localeCompare(right.employee.name));

  const rosterGridStyle = {
    ...styles.rosterGrid,
    gridTemplateColumns: isMobileLayout
      ? "1fr"
      : isNarrowLayout
        ? "repeat(auto-fit, minmax(240px, 1fr))"
        : (styles.rosterGrid.gridTemplateColumns as string),
  };
  const statsGridStyle = {
    ...styles.statsGrid,
    gridTemplateColumns: isMobileLayout
      ? "repeat(2, minmax(0, 1fr))"
      : (styles.statsGrid.gridTemplateColumns as string),
  };
  const departmentGridStyle = {
    ...styles.departmentGrid,
    gridTemplateColumns: isMobileLayout
      ? "1fr"
      : (styles.departmentGrid.gridTemplateColumns as string),
  };
  const overviewDeckStyle = {
    ...styles.overviewDeck,
    gridTemplateColumns: isMobileLayout
      ? "repeat(2, minmax(0, 1fr))"
      : (styles.overviewDeck.gridTemplateColumns as string),
  };
  const subrouteNavStyle = {
    ...styles.subrouteNav,
    gridTemplateColumns: isMobileLayout
      ? "1fr"
      : (styles.subrouteNav.gridTemplateColumns as string),
  };
  const monthlyHoursTableStyle = {
    ...styles.table,
    minWidth: isMobileLayout ? 860 : 980,
  };
  const statusTone = vaultError
    ? "var(--lcars-red)"
    : refreshing
      ? "var(--lcars-cyan)"
      : cacheUpdatedAt
        ? "var(--lcars-green)"
        : "var(--lcars-yellow)";
  const statusLabel = vaultError
    ? "VAULT ERROR"
    : refreshing
      ? "UPDATING"
      : cacheUpdatedAt
        ? "CACHE READY"
        : "LIVE";

  return (
    <div>
      <h1 style={styles.pageTitle}>TEAM</h1>
      <div style={styles.pageTitleBar} />
      {(snapshotMessage || cacheUpdatedAt || refreshing) && (
        <div style={{ ...styles.statusBanner, borderLeftColor: statusTone }}>
          <div>
            <div style={{ ...styles.statusBannerLabel, color: statusTone }}>{statusLabel}</div>
            {snapshotMessage ? (
              <div style={styles.statusBannerText}>{snapshotMessage}</div>
            ) : null}
            <div style={styles.statusBannerText}>
              VAULT SOURCE
              {latestVaultSourceAt
                ? ` • ${formatSnapshotTimestamp(latestVaultSourceAt)}`
                : ""}
            </div>
          </div>
          {cacheUpdatedAt ? (
            <div style={styles.statusBannerMeta}>
              CACHE {formatSnapshotTimestamp(cacheUpdatedAt)}
            </div>
          ) : null}
        </div>
      )}
      {vaultError ? <div style={styles.errorBanner}>{vaultError}</div> : null}

      <div style={overviewDeckStyle}>
        <div style={{ ...styles.overviewCard, borderLeftColor: "var(--lcars-cyan)" }}>
          <div style={styles.overviewLabel}>ACTIVE CREW</div>
          <div style={styles.overviewValue}>{activeProfiles.length}</div>
          <div style={styles.overviewMeta}>{mappedProfiles} LINKED TO APP</div>
        </div>
        <div style={{ ...styles.overviewCard, borderLeftColor: "var(--lcars-peach)" }}>
          <div style={styles.overviewLabel}>DEPARTMENTS</div>
          <div style={styles.overviewValue}>{rosterDepartments.length}</div>
          <div style={styles.overviewMeta}>{uniqueProjectCount} ACTIVE PROJECTS</div>
        </div>
        <div style={{ ...styles.overviewCard, borderLeftColor: "var(--lcars-yellow)" }}>
          <div style={styles.overviewLabel}>ONBOARDING</div>
          <div style={styles.overviewValue}>{onboardingActiveCount}</div>
          <div style={styles.overviewMeta}>{unmappedProfiles} UNMAPPED NOTES</div>
        </div>
        <div style={{ ...styles.overviewCard, borderLeftColor: "var(--lcars-green)" }}>
          <div style={styles.overviewLabel}>REMOTE CREW</div>
          <div style={styles.overviewValue}>{remoteCrewCount}</div>
          <div style={styles.overviewMeta}>
            {latestVaultSourceAt
              ? `LATEST NOTE ${formatSnapshotTimestamp(latestVaultSourceAt)}`
              : "NO NOTE TIMESTAMP"}
          </div>
        </div>
      </div>

      <div style={subrouteNavStyle}>
        <NavLink
          to="/team/roster"
          end
          style={({ isActive }) => ({
            ...styles.subrouteLink,
            ...(isActive ? styles.subrouteLinkActive : null),
          })}
        >
          ROSTER
        </NavLink>
        <NavLink
          to="/team/capacity"
          end
          style={({ isActive }) => ({
            ...styles.subrouteLink,
            ...(isActive ? styles.subrouteLinkActive : null),
          })}
        >
          CAPACITY
        </NavLink>
        <NavLink
          to="/team/crew"
          end
          style={({ isActive }) => ({
            ...styles.subrouteLink,
            ...(isActive ? styles.subrouteLinkActive : null),
          })}
        >
          CREW PROFILE
        </NavLink>
      </div>

      <Routes>
        <Route index element={<Navigate to="roster" replace />} />
        <Route
          path="roster"
          element={
            <>
              <div style={{ ...styles.card, borderLeftColor: "var(--lcars-cyan)" }}>
                <div style={styles.sectionHeader}>
                  <div>
                    <h2 style={styles.sectionTitle}>ROSTER</h2>
                    <div style={styles.sectionCaption}>VAULT NOTES / CREW LINKING</div>
                  </div>
                  <div style={styles.searchWrap}>
                    <label style={styles.searchLabel}>FILTER</label>
                    <input
                      value={rosterSearch}
                      onChange={(event) => setRosterSearch(event.target.value)}
                      placeholder="Search role, department, project, tag..."
                      style={styles.input}
                    />
                  </div>
                </div>
                <div style={styles.sectionDivider} />

                <div style={statsGridStyle}>
                  <div style={styles.statCard}>
                    <div style={styles.statValue}>{activeProfiles.length}</div>
                    <div style={styles.statLabel}>NOTES</div>
                  </div>
                  <div style={styles.statCard}>
                    <div style={styles.statValue}>{mappedProfiles}</div>
                    <div style={styles.statLabel}>LINKED</div>
                  </div>
                  <div style={styles.statCard}>
                    <div style={styles.statValue}>{rosterDepartments.length}</div>
                    <div style={styles.statLabel}>GROUPS</div>
                  </div>
                  <div style={styles.statCard}>
                    <div style={styles.statValue}>{unmappedProfiles}</div>
                    <div style={styles.statLabel}>UNMAPPED</div>
                  </div>
                </div>
              </div>

              {rosterDepartments.length === 0 ? (
                <div style={styles.card}>
                  <p style={styles.emptyText}>
                    {vaultError
                      ? "TEAM VAULT COULD NOT BE READ."
                      : "NO ACTIVE TEAM NOTES."}
                  </p>
                </div>
              ) : (
                rosterDepartments.map((department) => (
                  <div
                    key={department.name}
                    style={{ ...styles.card, borderLeftColor: "var(--lcars-peach)" }}
                  >
                    <div style={styles.departmentHeader}>
                      <div>
                        <div style={styles.departmentTitle}>
                          {department.name.toUpperCase()}
                        </div>
                        <div style={styles.departmentCaption}>
                          {department.profiles.length} CREW
                        </div>
                      </div>
                    </div>
                    <div style={styles.sectionDivider} />
                    <div style={rosterGridStyle}>
                      {department.profiles.map((profile) => {
                        const selectable = Boolean(profile.employeeId);
                        return (
                          <button
                            key={profile.sourceRelativePath}
                            type="button"
                            disabled={!selectable}
                            onClick={() => {
                              if (!profile.employeeId) return;
                              setSelectedEmployeeId(profile.employeeId);
                              navigate("/team/crew");
                            }}
                            style={{
                              ...styles.rosterCard,
                              opacity: selectable ? 1 : 0.72,
                              cursor: selectable ? "pointer" : "default",
                            }}
                          >
                            <div style={styles.rosterIdentity}>
                              <Avatar name={profile.displayName} size={34} />
                              <div style={{ minWidth: 0 }}>
                                <div style={styles.rosterName}>
                                  {profile.displayName}
                                </div>
                                <div style={styles.rosterMeta}>
                                  {profile.role ?? "Role not specified"}
                                </div>
                              </div>
                            </div>

                            <div style={styles.pillRow}>
                              <span style={styles.departmentPill}>
                                {(profile.department ?? "Unassigned").toUpperCase()}
                              </span>
                              {profile.probation ? (
                                <span style={styles.rolePill}>
                                  {profile.probation.toUpperCase()}
                                </span>
                              ) : null}
                              {!profile.employeeId ? (
                                <span style={styles.warningPill}>UNMAPPED</span>
                              ) : null}
                            </div>

                            {truncateSummary(profile.summaryMarkdown) ? (
                              <div style={styles.rosterSummary}>
                                {truncateSummary(profile.summaryMarkdown)}
                              </div>
                            ) : null}

                            {profile.primaryProjects.length > 0 ? (
                              <div style={styles.dataGroup}>
                                <div style={styles.dataGroupLabel}>PROJECTS</div>
                                <div style={styles.tagRow}>
                                  {profile.primaryProjects.map((project) => (
                                    <span key={project} style={styles.dataTag}>
                                      {project.toUpperCase()}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            {profile.onboardingStage.length > 0 ? (
                              <div style={styles.dataGroup}>
                                <div style={styles.dataGroupLabel}>ONBOARDING</div>
                                <div style={styles.tagRow}>
                                  {profile.onboardingStage.map((stage) => (
                                    <span key={stage} style={styles.dataTagMuted}>
                                      {stage.toUpperCase()}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            <div style={styles.rosterFooter}>
                              NOTE {profile.sourceRelativePath}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </>
          }
        />

        <Route
          path="capacity"
          element={
            <>
              <div style={{ ...styles.card, borderLeftColor: "var(--lcars-peach)" }}>
                <div style={styles.sectionHeader}>
                  <div>
                    <h2 style={styles.sectionTitle}>CAPACITY</h2>
                    <div style={styles.sectionCaption}>DEPARTMENT LOAD / MONTHLY HOURS</div>
                  </div>
                </div>
                <div style={styles.sectionDivider} />
                {departmentCapacity.length === 0 ? (
                  <p style={styles.emptyText}>
                    NO LINKED CREW AVAILABLE
                  </p>
                ) : (
                  <div style={departmentGridStyle}>
                    {departmentCapacity.map((department) => (
                      <div
                        key={department.name}
                        style={{
                          ...lcarsPageStyles.subtleCard,
                          borderLeftColor: "var(--lcars-peach)",
                        }}
                      >
                        <div style={styles.capacityHeader}>
                          <div>
                            <div style={styles.capacityTitle}>
                              {department.name.toUpperCase()}
                            </div>
                            <div style={styles.capacityCaption}>
                              {department.memberCount} mapped crew
                            </div>
                          </div>
                          <div style={styles.capacityBadge}>
                            {department.memberCount} CREW
                          </div>
                        </div>
                        <ProgressBar
                          current={department.totalHours}
                          total={department.quotaTotal}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ ...styles.card, borderLeftColor: "var(--lcars-tan)" }}>
                <h2 style={styles.sectionTitle}>MONTHLY LOAD</h2>
                <div style={styles.sectionDivider} />
                {monthlyCapacityRows.length === 0 ? (
                  <p style={styles.emptyText}>
                    NO MONTHLY HOURS DATA
                  </p>
                ) : (
                  <div style={styles.tableScrollWrap}>
                    <table style={monthlyHoursTableStyle}>
                      <thead>
                        <tr>
                          <th style={styles.th}>CREW MEMBER</th>
                          <th style={styles.th}>DEPARTMENT</th>
                          <th style={styles.th}>ROLE</th>
                          <th style={styles.th}>ACTUAL HOURS</th>
                          <th style={styles.th}>EXPECTED HOURS</th>
                          <th style={styles.th}>STATUS</th>
                          <th style={styles.th}>REMOTE</th>
                          <th style={styles.th}>TIMEZONE</th>
                          <th style={styles.th}>LEAVE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyCapacityRows.map(({ employee, monthlyRow, profile }) => {
                          const status = monthlyRow?.status ?? "under";
                          const statusColor =
                            status === "under"
                              ? "var(--lcars-red)"
                              : status === "over"
                                ? "var(--lcars-yellow)"
                                : "var(--lcars-green)";
                          const statusLabel =
                            status === "under"
                              ? "UNDER (<120H)"
                              : status === "over"
                                ? "OVER (>180H)"
                                : "NORMAL";
                          return (
                            <tr key={employee.id}>
                              <td style={styles.td}>
                                <div style={styles.tableIdentity}>
                                  <Avatar name={employee.name} size={22} />
                                  <span style={{ color: "var(--lcars-tan)" }}>
                                    {employee.name}
                                  </span>
                                </div>
                              </td>
                              <td style={styles.td}>
                                {profile?.department ?? "--"}
                              </td>
                              <td style={styles.td}>
                                {profile?.role ?? "--"}
                              </td>
                              <td style={styles.tdMono}>
                                {(monthlyRow?.actualHours ?? 0).toFixed(1)}h
                              </td>
                              <td style={styles.tdMono}>
                                {(monthlyRow?.expectedHours ?? employee.monthlyQuotaHours).toFixed(1)}
                                h
                              </td>
                              <td
                                style={{
                                  ...styles.td,
                                  color: statusColor,
                                  fontWeight: 600,
                                  fontSize: 11,
                                }}
                              >
                                {statusLabel}
                              </td>
                              <td style={styles.td}>
                                {monthlyRow?.isRemote ? (
                                  <span style={styles.remotePill}>REMOTE</span>
                                ) : (
                                  <span style={styles.tableMuted}>ONSITE</span>
                                )}
                              </td>
                              <td style={styles.tdMono}>
                                {monthlyRow?.timezone ?? "--"}
                              </td>
                              <td style={styles.td}>
                                {monthlyRow?.onLeave ? (
                                  <span style={styles.leavePill}>YES</span>
                                ) : (
                                  <span style={styles.tableMuted}>NO</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          }
        />

        <Route
          path="crew"
          element={
            <EmployeeSummaryPanel
              employees={crewEmployees}
              selectedEmployeeId={selectedEmployeeId}
              onSelectEmployee={setSelectedEmployeeId}
              summary={employeeSummary}
              loading={summaryLoading}
              error={summaryError}
            />
          }
        />
        <Route path="*" element={<Navigate to="roster" replace />} />
      </Routes>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  pageTitle: lcarsPageStyles.pageTitle,
  pageTitleBar: lcarsPageStyles.pageTitleBar,
  card: lcarsPageStyles.card,
  sectionTitle: lcarsPageStyles.sectionTitle,
  sectionCaption: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    color: "var(--lcars-lavender)",
    letterSpacing: "1.4px",
    textTransform: "uppercase",
  },
  helperText: {
    ...lcarsPageStyles.helperText,
    maxWidth: 680,
    marginBottom: 0,
  },
  sectionDivider: lcarsPageStyles.sectionDivider,
  input: lcarsPageStyles.input,
  emptyText: lcarsPageStyles.emptyText,
  overviewDeck: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 12,
    marginBottom: 18,
  },
  overviewCard: {
    ...lcarsPageStyles.subtleCard,
    minHeight: 104,
    padding: "14px 16px",
  },
  overviewLabel: {
    ...lcarsPageStyles.metricLabel,
    marginBottom: 10,
  },
  overviewValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 28,
    fontWeight: 700,
    color: "var(--lcars-orange)",
    lineHeight: 1,
    letterSpacing: "-0.04em",
  },
  overviewMeta: {
    marginTop: 10,
    fontSize: 10,
    color: "var(--lcars-lavender)",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    lineHeight: 1.5,
  },
  statusBanner: {
    ...lcarsPageStyles.subtleCard,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 20,
    padding: "12px 16px",
    borderLeftWidth: 8,
  },
  statusBannerLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    letterSpacing: "0.18em",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  statusBannerText: {
    fontSize: 12,
    color: "var(--lcars-tan)",
    lineHeight: 1.6,
  },
  statusBannerMeta: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: "var(--lcars-lavender)",
  },
  errorBanner: {
    marginBottom: 20,
    padding: "10px 14px",
    borderLeft: "4px solid var(--lcars-red)",
    background: "rgba(102, 34, 34, 0.2)",
    color: "var(--lcars-yellow)",
    borderRadius: 8,
    fontSize: 13,
  },
  subrouteNav: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 12,
    marginBottom: 18,
  },
  subrouteLink: {
    padding: "12px 14px",
    borderRadius: "0 18px 18px 0",
    border: "1px solid rgba(153, 153, 204, 0.18)",
    borderLeft: "6px solid rgba(153, 153, 204, 0.18)",
    color: "var(--lcars-lavender)",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    letterSpacing: "0.18em",
    textDecoration: "none",
    background: "rgba(10, 12, 24, 0.82)",
    textAlign: "center",
  },
  subrouteLinkActive: {
    color: "#08111f",
    background: "linear-gradient(90deg, var(--lcars-cyan), #6de7ff)",
    borderColor: "transparent",
    borderLeftColor: "transparent",
    boxShadow: "0 0 18px rgba(0, 204, 255, 0.18)",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
  },
  searchWrap: {
    minWidth: 260,
    flex: "0 0 320px",
  },
  searchLabel: {
    ...lcarsPageStyles.metricLabel,
    marginBottom: 6,
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 12,
  },
  statCard: {
    ...lcarsPageStyles.subtleCard,
    borderLeftColor: "var(--lcars-cyan)",
    minHeight: 88,
  },
  statValue: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 28,
    color: "var(--lcars-cyan)",
    marginBottom: 6,
  },
  statLabel: {
    fontSize: 11,
    color: "var(--lcars-lavender)",
    letterSpacing: "0.1em",
  },
  departmentHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
  },
  departmentTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--lcars-orange)",
    letterSpacing: "0.12em",
  },
  departmentCaption: {
    marginTop: 4,
    fontSize: 12,
    color: "var(--lcars-lavender)",
  },
  rosterGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 14,
  },
  rosterCard: {
    ...lcarsPageStyles.subtleCard,
    borderLeftColor: "var(--lcars-peach)",
    width: "100%",
    textAlign: "left",
    background: "rgba(7, 10, 24, 0.88)",
    color: "inherit",
    border: "1px solid rgba(153, 153, 204, 0.14)",
  },
  rosterIdentity: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  rosterName: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 14,
    color: "var(--lcars-tan)",
    letterSpacing: "0.04em",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rosterMeta: {
    marginTop: 4,
    color: "var(--lcars-lavender)",
    fontSize: 12,
    lineHeight: 1.5,
  },
  pillRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 12,
  },
  departmentPill: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    letterSpacing: "0.12em",
    padding: "4px 8px",
    borderRadius: 999,
    background: "rgba(255, 153, 0, 0.12)",
    color: "var(--lcars-orange)",
    border: "1px solid rgba(255, 153, 0, 0.2)",
  },
  rolePill: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    letterSpacing: "0.12em",
    padding: "4px 8px",
    borderRadius: 999,
    background: "rgba(0, 204, 255, 0.12)",
    color: "var(--lcars-cyan)",
    border: "1px solid rgba(0, 204, 255, 0.2)",
  },
  warningPill: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    letterSpacing: "0.12em",
    padding: "4px 8px",
    borderRadius: 999,
    background: "rgba(255, 204, 0, 0.12)",
    color: "var(--lcars-yellow)",
    border: "1px solid rgba(255, 204, 0, 0.2)",
  },
  rosterSummary: {
    fontSize: 12,
    color: "var(--text-secondary)",
    lineHeight: 1.6,
    marginBottom: 12,
  },
  dataGroup: {
    marginBottom: 10,
  },
  dataGroupLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    color: "var(--text-quaternary)",
    letterSpacing: "1px",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  tagRow: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
  },
  dataTag: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 8,
    color: "var(--lcars-orange)",
    border: "1px solid rgba(255, 153, 0, 0.24)",
    padding: "3px 7px",
    borderRadius: 999,
    letterSpacing: "1px",
    textTransform: "uppercase",
    background: "rgba(255, 153, 0, 0.08)",
  },
  dataTagMuted: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 8,
    color: "var(--lcars-cyan)",
    border: "1px solid rgba(0, 204, 255, 0.2)",
    padding: "3px 7px",
    borderRadius: 999,
    letterSpacing: "1px",
    textTransform: "uppercase",
    background: "rgba(0, 204, 255, 0.08)",
  },
  metaList: {
    display: "grid",
    gridTemplateColumns: "92px 1fr",
    gap: 10,
    alignItems: "start",
    marginBottom: 8,
  },
  metaLabel: {
    fontSize: 11,
    color: "var(--lcars-lavender)",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  metaValue: {
    fontSize: 12,
    color: "var(--lcars-tan)",
    lineHeight: 1.5,
  },
  rosterFooter: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: "1px solid rgba(153, 153, 204, 0.12)",
    fontSize: 11,
    color: "var(--text-quaternary)",
    fontFamily: "'JetBrains Mono', monospace",
  },
  departmentGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 14,
  },
  capacityHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
  },
  capacityTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--lcars-orange)",
    letterSpacing: "0.1em",
  },
  capacityCaption: {
    marginTop: 2,
    fontSize: 11,
    color: "var(--lcars-lavender)",
  },
  capacityBadge: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: "var(--lcars-lavender)",
    background: "rgba(153, 153, 204, 0.1)",
    padding: "2px 8px",
    borderRadius: "0 10px 10px 0",
  },
  tableScrollWrap: {
    overflowX: "auto",
  },
  table: lcarsPageStyles.table,
  th: lcarsPageStyles.th,
  td: lcarsPageStyles.td,
  tdMono: {
    ...lcarsPageStyles.td,
    fontFamily: "'JetBrains Mono', monospace",
  },
  tableIdentity: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  remotePill: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 8,
    fontWeight: 600,
    color: "var(--lcars-cyan)",
    border: "1px solid var(--lcars-cyan)",
    padding: "1px 6px",
    borderRadius: 2,
    letterSpacing: "0.1em",
  },
  leavePill: {
    color: "var(--lcars-yellow)",
    fontWeight: 600,
    fontSize: 11,
  },
  tableMuted: {
    color: "var(--text-quaternary)",
    fontSize: 11,
  },
};

export default Team;
