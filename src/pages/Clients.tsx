import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SkeletonCard, SkeletonTable } from "../components/ui/Skeleton";
import { useInvoke } from "../hooks/useInvoke";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";
import type { ActivityItem, ClientDetailView, ClientView } from "../lib/types";

function formatHours(hours: number): string {
  return `${hours.toFixed(1)}H`;
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function normalizeClientFilter(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized.toLowerCase() : null;
}

function matchesClientReference(client: ClientView, reference: string | null): boolean {
  const normalizedReference = normalizeClientFilter(reference);
  if (!normalizedReference) return true;

  return (
    client.id.toLowerCase() === normalizedReference ||
    client.name.trim().toLowerCase() === normalizedReference
  );
}

function clientHasContractRisk(client: ClientView): boolean {
  const daysRemaining = client.operationalSignals.daysRemaining;
  return daysRemaining !== null && daysRemaining < 30;
}

function clientAccent(client: ClientView): string {
  if (
    client.operationalSignals.daysRemaining !== null &&
    client.operationalSignals.daysRemaining < 30
  ) {
    return "var(--lcars-red)";
  }
  return client.registryStatus === "canonical"
    ? "var(--lcars-cyan)"
    : "var(--lcars-orange)";
}

function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div style={{ ...styles.metricCard, borderLeftColor: color }}>
      <div style={{ ...styles.metricBar, backgroundColor: color }} />
      <div style={styles.metricLabel}>{label}</div>
      <div style={styles.metricValue}>{value}</div>
    </div>
  );
}

function RegistryPill({ status }: { status: ClientView["registryStatus"] }) {
  const color =
    status === "canonical" ? "var(--lcars-cyan)" : "var(--lcars-orange)";
  const label =
    status === "canonical" ? "CORE PROFILE" : "NEEDS PROFILE";
  return (
    <span
      style={{
        ...styles.pill,
        borderColor: color,
        color,
      }}
    >
      {label}
    </span>
  );
}

function SourcePill({ source }: { source: string }) {
  return (
    <span style={styles.sourcePill}>{source.toUpperCase()}</span>
  );
}

function ContractBadge({
  status,
  daysRemaining,
}: {
  status: string | null;
  daysRemaining: number | null;
}) {
  if (!status && daysRemaining === null) return null;

  const urgent = daysRemaining !== null && daysRemaining < 30;
  const color = urgent ? "var(--lcars-red)" : "var(--lcars-green)";
  const label =
    urgent && daysRemaining !== null
      ? `${daysRemaining}D LEFT`
      : (status ?? "UNKNOWN").toUpperCase();

  return (
    <span
      style={{
        ...styles.pill,
        borderColor: color,
        color,
      }}
    >
      {label}
    </span>
  );
}

function SignalTag({ label }: { label: string }) {
  return <span style={styles.signalTag}>{label.toUpperCase()}</span>;
}

function ClientCard({
  client,
  onSelect,
}: {
  client: ClientView;
  onSelect: (id: string) => void;
}) {
  const profile = client.profile;
  const signals = client.operationalSignals;
  const canonical = client.registryStatus === "canonical";
  const accent = clientAccent(client);
  const subtitle = canonical
    ? profile?.industry ?? profile?.engagementModel ?? "TEAMFORGE PROFILE"
    : signals.inferredIndustry ?? "UNMAPPED OPERATIONAL SIGNAL";
  const contact = canonical
    ? profile?.primaryContact
    : signals.inferredPrimaryContact;
  const fitPreview = profile?.strategicFit.slice(0, 2) ?? [];

  return (
    <button
      type="button"
      onClick={() => onSelect(client.id)}
      style={{
        ...styles.clientCard,
        borderLeftColor: accent,
      }}
    >
      <div style={styles.clientHeader}>
        <div>
          <div style={styles.clientName}>{client.name.toUpperCase()}</div>
          <div style={styles.clientSubtitle}>{subtitle.toUpperCase()}</div>
        </div>
        <RegistryPill status={client.registryStatus} />
      </div>

      {signals.sources.length > 0 ? (
        <div style={styles.pillRow}>
          {signals.sources.map((source) => (
            <SourcePill key={source} source={source} />
          ))}
        </div>
      ) : null}

      <div style={styles.metricStrip}>
        <div>
          <div style={styles.stripLabel}>BILLABLE HOURS</div>
          <div style={styles.stripValue}>
            {formatHours(signals.monthBillableHours)}
          </div>
        </div>
        <div>
          <div style={styles.stripLabel}>ACTIVE PROJECTS</div>
          <div style={styles.stripValue}>{signals.activeProjects}</div>
        </div>
        <div>
          <div style={styles.stripLabel}>GITHUB OPEN</div>
          <div style={styles.stripValue}>{signals.githubOpenIssues}</div>
        </div>
      </div>

      {canonical ? (
        <div style={styles.cardSection}>
          <div style={styles.cardMetaLine}>
            <span style={styles.metaPill}>
              {(profile?.engagementModel ?? "UNSPECIFIED").toUpperCase()}
            </span>
            <span style={styles.metaText}>
              PROFILE {profile?.profileCompleteness.toFixed(0) ?? "0"}%
            </span>
          </div>
          {contact ? (
            <div style={styles.cardSubtext}>PRIMARY CONTACT: {contact}</div>
          ) : null}
          {profile?.stakeholders.length ? (
            <div style={styles.cardSubtext}>
              STAKEHOLDERS: {profile.stakeholders.slice(0, 3).join(", ")}
            </div>
          ) : null}
          {fitPreview.length > 0 ? (
            <div style={styles.tagRow}>
              {fitPreview.map((item) => (
                <SignalTag key={item} label={item} />
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div style={styles.cardSection}>
          <div style={styles.cardSubtext}>
            Needs a client profile before it appears in the main client
            directory.
          </div>
          {contact ? (
            <div style={styles.cardSubtext}>CONTACT SIGNAL: {contact}</div>
          ) : null}
          {signals.inferredTier ? (
            <div style={styles.cardSubtext}>TIER SIGNAL: {signals.inferredTier}</div>
          ) : null}
        </div>
      )}

      <div style={styles.cardFooter}>
        <ContractBadge
          status={signals.inferredContractStatus}
          daysRemaining={signals.daysRemaining}
        />
        {signals.inferredTechStack.length > 0 ? (
          <div style={styles.tagRow}>
            {signals.inferredTechStack.slice(0, 3).map((tech) => (
              <SignalTag key={tech} label={tech} />
            ))}
          </div>
        ) : null}
      </div>
    </button>
  );
}

function DetailPanel({
  detail,
  onClose,
}: {
  detail: ClientDetailView;
  onClose: () => void;
}) {
  const client = detail.client;
  const profile = client.profile;
  const signals = client.operationalSignals;
  const accent = clientAccent(client);
  const hasOperationalSignals =
    signals.sources.length > 0 ||
    signals.monthBillableHours > 0 ||
    signals.activeProjects > 0 ||
    signals.githubTotalIssues > 0 ||
    Boolean(signals.latestActivityAt) ||
    Boolean(signals.inferredIndustry) ||
    Boolean(signals.inferredPrimaryContact) ||
    Boolean(signals.inferredContractStatus) ||
    signals.inferredTechStack.length > 0;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={{ ...styles.detailPanel, borderLeftColor: accent }} onClick={(event) => event.stopPropagation()}>
        <div style={styles.detailHeader}>
          <div>
            <div style={styles.detailTitle}>{client.name.toUpperCase()}</div>
            <div style={styles.headerPills}>
              <RegistryPill status={client.registryStatus} />
              {signals.sources.map((source) => (
                <SourcePill key={source} source={source} />
              ))}
            </div>
          </div>
          <button onClick={onClose} style={styles.closeButton}>
            ×
          </button>
        </div>

        <div style={styles.detailDivider} />

        <div style={styles.detailSection}>
          <div style={styles.detailSectionTitle}>CLIENT PROFILE</div>
          {!profile ? (
            <div style={styles.emptyText}>
              No client profile yet. This record is still showing raw activity
              only.
            </div>
          ) : (
            <>
              <div style={styles.detailGrid}>
                <div>
                  <div style={styles.detailLabel}>ENGAGEMENT MODEL</div>
                  <div style={styles.detailValueMono}>
                    {(profile.engagementModel ?? "—").toUpperCase()}
                  </div>
                </div>
                <div>
                  <div style={styles.detailLabel}>PROFILE COMPLETENESS</div>
                  <div style={styles.detailValueMono}>
                    {profile.profileCompleteness.toFixed(0)}%
                  </div>
                </div>
                <div>
                  <div style={styles.detailLabel}>ONBOARDED</div>
                  <div style={styles.detailValueMono}>
                    {profile.onboarded
                      ? new Date(profile.onboarded).toLocaleDateString()
                      : "—"}
                  </div>
                </div>
                <div>
                  <div style={styles.detailLabel}>PROJECT IDS</div>
                  <div style={styles.detailText}>
                    {profile.projectIds.length > 0
                      ? profile.projectIds.join(", ")
                      : "—"}
                  </div>
                </div>
              </div>

              <div style={styles.profileColumns}>
                <div>
                  <div style={styles.detailLabel}>STAKEHOLDERS</div>
                  {profile.stakeholders.length === 0 ? (
                    <div style={styles.emptyText}>NO STAKEHOLDERS LISTED</div>
                  ) : (
                    <div style={styles.profileList}>
                      {profile.stakeholders.map((stakeholder) => (
                        <div key={stakeholder} style={styles.profileListItem}>
                          {stakeholder}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <div style={styles.detailLabel}>STRATEGIC FIT</div>
                  {profile.strategicFit.length === 0 ? (
                    <div style={styles.emptyText}>NO STRATEGIC FIT NOTES</div>
                  ) : (
                    <div style={styles.profileList}>
                      {profile.strategicFit.map((item) => (
                        <div key={item} style={styles.profileListItem}>
                          {item}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div style={styles.profileColumns}>
                <div>
                  <div style={styles.detailLabel}>RISKS / WATCH-OUTS</div>
                  {profile.risks.length === 0 ? (
                    <div style={styles.emptyText}>NO RISKS RECORDED</div>
                  ) : (
                    <div style={styles.profileList}>
                      {profile.risks.map((risk) => (
                        <div key={risk} style={styles.profileListItem}>
                          {risk}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <div style={styles.detailLabel}>RESOURCE LINKS</div>
                  {profile.resourceLinks.length === 0 ? (
                    <div style={styles.emptyText}>NO VAULT RESOURCE LINKS</div>
                  ) : (
                    <div style={styles.profileList}>
                      {profile.resourceLinks.map((link) => (
                        <a
                          key={link}
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={styles.detailLink}
                        >
                          {link}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div style={styles.detailDivider} />

        <div style={styles.detailSection}>
          <div style={styles.detailSectionTitle}>OPERATIONAL SIGNALS</div>
          {!hasOperationalSignals ? (
            <div style={styles.emptyText}>NO SECONDARY SIGNALS CACHED.</div>
          ) : (
            <>
              <div style={styles.detailGrid}>
                <div>
                  <div style={styles.detailLabel}>BILLABLE HOURS</div>
                  <div style={styles.detailValueMono}>
                    {formatHours(signals.monthBillableHours)}
                  </div>
                </div>
                <div>
                  <div style={styles.detailLabel}>ACTIVE PROJECTS</div>
                  <div style={styles.detailValueMono}>{signals.activeProjects}</div>
                </div>
                <div>
                  <div style={styles.detailLabel}>GITHUB ISSUES</div>
                  <div style={styles.detailValueMono}>
                    {signals.githubOpenIssues}/{signals.githubTotalIssues} OPEN
                  </div>
                </div>
                <div>
                  <div style={styles.detailLabel}>LATEST SIGNAL</div>
                  <div style={styles.detailValueMono}>
                    {formatDateTime(signals.latestActivityAt)}
                  </div>
                </div>
                <div>
                  <div style={styles.detailLabel}>CONTACT SIGNAL</div>
                  <div style={styles.detailText}>
                    {signals.inferredPrimaryContact ?? "—"}
                  </div>
                </div>
                <div>
                  <div style={styles.detailLabel}>CONTRACT SIGNAL</div>
                  <div style={styles.detailText}>
                    {signals.inferredContractStatus ? (
                      <ContractBadge
                        status={signals.inferredContractStatus}
                        daysRemaining={signals.daysRemaining}
                      />
                    ) : (
                      "—"
                    )}
                  </div>
                </div>
                <div>
                  <div style={styles.detailLabel}>INDUSTRY SIGNAL</div>
                  <div style={styles.detailText}>
                    {signals.inferredIndustry ?? "—"}
                  </div>
                </div>
                <div>
                  <div style={styles.detailLabel}>TIER SIGNAL</div>
                  <div style={styles.detailText}>{signals.inferredTier ?? "—"}</div>
                </div>
              </div>

              {signals.inferredTechStack.length > 0 ? (
                <div style={{ marginTop: 14 }}>
                  <div style={styles.detailLabel}>TECH STACK SIGNALS</div>
                  <div style={styles.tagRow}>
                    {signals.inferredTechStack.map((tech) => (
                      <SignalTag key={tech} label={tech} />
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div style={styles.detailDivider} />

        <div style={styles.detailSection}>
          <div style={styles.detailSectionTitle}>
            LINKED PROJECTS ({detail.linkedProjects.length})
          </div>
          {detail.linkedProjects.length === 0 ? (
            <div style={styles.emptyText}>NO LINKED PROJECTS</div>
          ) : (
            <div style={styles.listColumn}>
              {detail.linkedProjects.map((project) => (
                <div
                  key={project.id}
                  style={{
                    ...styles.listItem,
                    borderLeftColor: accent,
                  }}
                >
                  <div>
                    {project.sourceUrl ? (
                      <a
                        href={project.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ ...styles.detailLink, color: "var(--lcars-tan)" }}
                      >
                        {project.name}
                      </a>
                    ) : (
                      <span style={styles.detailText}>{project.name}</span>
                    )}
                    <div style={styles.listItemMeta}>
                      {project.source.toUpperCase()}
                      {project.repo ? ` · ${project.repo}` : ""}
                      {project.totalIssues > 0
                        ? ` · ${project.openIssues}/${project.totalIssues} OPEN`
                        : ""}
                    </div>
                  </div>
                  <span style={styles.listItemPill}>{project.status.toUpperCase()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={styles.detailDivider} />

        <div style={styles.detailSection}>
          <div style={styles.detailSectionTitle}>
            RESOURCES ({detail.resources.length})
          </div>
          {detail.resources.length === 0 ? (
            <div style={styles.emptyText}>NO RESOURCES</div>
          ) : (
            <div style={styles.listColumn}>
              {detail.resources.map((resource, index) => (
                <div
                  key={`${resource.name}-${index}`}
                  style={{
                    ...styles.listItem,
                    borderLeftColor: "var(--lcars-peach)",
                  }}
                >
                  <span style={styles.detailText}>{resource.name}</span>
                  <div style={styles.resourceMeta}>
                    <span style={styles.listItemPill}>{resource.type.toUpperCase()}</span>
                    {resource.url ? (
                      <a
                        href={resource.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={styles.detailLink}
                      >
                        ↗
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={styles.detailDivider} />

        <div style={styles.detailSection}>
          <div style={styles.detailSectionTitle}>
            RECENT ACTIVITY ({detail.recentActivity.length})
          </div>
          {detail.recentActivity.length === 0 ? (
            <div style={styles.emptyText}>NO RECENT ACTIVITY</div>
          ) : (
            <div style={styles.listColumn}>
              {detail.recentActivity.map((activity: ActivityItem, index: number) => (
                <div
                  key={`activity-${index}`}
                  style={{
                    ...styles.listItem,
                    borderLeftColor: "var(--lcars-orange)",
                  }}
                >
                  <div>
                    <div style={styles.detailText}>
                      {activity.employeeName} — {activity.action}
                    </div>
                    {activity.detail ? (
                      <div style={styles.listItemMeta}>{activity.detail}</div>
                    ) : null}
                  </div>
                  <span style={styles.listItemMeta}>
                    {formatDateTime(activity.occurredAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Clients() {
  const api = useInvoke();
  const [searchParams, setSearchParams] = useSearchParams();
  const [clients, setClients] = useState<ClientView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClientDetailView | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const registryFilter = searchParams.get("registry");
  const activeRegistryFilter =
    registryFilter === "canonical" || registryFilter === "operational"
      ? registryFilter
      : null;
  const contractRiskFilter = searchParams.get("risk") === "contract";
  const selectedClientRef = searchParams.get("client");

  const load = useCallback(async () => {
    try {
      const data = await api.getClients();
      setClients(data);
      setLoadError(null);
    } catch {
      setLoadError("CLIENT DATA UNAVAILABLE.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const updateSearchParam = useCallback(
    (key: string, value: string | null) => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        if (value && value.trim()) {
          next.set(key, value);
        } else {
          next.delete(key);
        }
        return next;
      });
    },
    [setSearchParams],
  );

  const clearFilters = useCallback(() => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("registry");
      next.delete("risk");
      next.delete("client");
      return next;
    });
  }, [setSearchParams]);

  const handleSelectClient = useCallback(
    (clientId: string) => {
      updateSearchParam("client", clientId);
    },
    [updateSearchParam],
  );

  const handleCloseDetail = useCallback(() => {
    setDetail(null);
    setDetailError(null);
    updateSearchParam("client", null);
  }, [updateSearchParam]);

  const filteredClients = useMemo(
    () =>
      clients.filter((client) => {
        if (activeRegistryFilter && client.registryStatus !== activeRegistryFilter) {
          return false;
        }
        if (contractRiskFilter && !clientHasContractRisk(client)) {
          return false;
        }
        if (selectedClientRef && !matchesClientReference(client, selectedClientRef)) {
          return false;
        }
        return true;
      }),
    [clients, activeRegistryFilter, contractRiskFilter, selectedClientRef],
  );

  const resolvedSelectedClient = useMemo(
    () =>
      selectedClientRef
        ? clients.find((client) => matchesClientReference(client, selectedClientRef)) ?? null
        : null,
    [clients, selectedClientRef],
  );

  useEffect(() => {
    if (!selectedClientRef) {
      setDetail(null);
      setDetailLoading(false);
      setDetailError(null);
      return;
    }

    if (!resolvedSelectedClient) {
      setDetail(null);
      setDetailLoading(false);
      setDetailError(null);
      return;
    }

    let cancelled = false;

    setDetailLoading(true);
    setDetail(null);
    setDetailError(null);

    void api
      .getClientDetail(resolvedSelectedClient.id)
      .then((data) => {
        if (!cancelled) {
          setDetail(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDetailError("CLIENT DETAIL UNAVAILABLE.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api, resolvedSelectedClient, selectedClientRef]);

  const canonicalClients = filteredClients.filter(
    (client) => client.registryStatus === "canonical"
  );
  const operationalOnlyClients = filteredClients.filter(
    (client) => client.registryStatus === "operational"
  );
  const monthBillableHours = filteredClients.reduce(
    (sum, client) => sum + client.operationalSignals.monthBillableHours,
    0
  );
  const openGithubIssues = filteredClients.reduce(
    (sum, client) => sum + client.operationalSignals.githubOpenIssues,
    0
  );
  const hasActiveFilters =
    activeRegistryFilter !== null || contractRiskFilter || Boolean(selectedClientRef);

  if (loading) {
    return (
      <div>
        <h1 style={styles.pageTitle}>CLIENTS</h1>
        <div style={styles.pageTitleBar} />
        <div style={styles.metricsRow}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div style={styles.card}>
          <SkeletonTable rows={6} cols={4} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={styles.pageTitle}>CLIENTS</h1>
      <div style={styles.pageTitleBar} />

      <div style={styles.metricsRow}>
        <MetricCard
          label="CORE CLIENTS"
          value={String(canonicalClients.length)}
          color="var(--lcars-cyan)"
        />
        <MetricCard
          label="NEEDS MAPPING"
          value={String(operationalOnlyClients.length)}
          color="var(--lcars-orange)"
        />
        <MetricCard
          label="BILLABLE HOURS"
          value={formatHours(monthBillableHours)}
          color="var(--lcars-green)"
        />
        <MetricCard
          label="GITHUB OPEN"
          value={String(openGithubIssues)}
          color="var(--lcars-lavender)"
        />
      </div>

      {hasActiveFilters ? (
        <div style={styles.filterBanner}>
          <div style={styles.filterBannerText}>
            FOCUSED VIEW
            {activeRegistryFilter ? ` · ${activeRegistryFilter.toUpperCase()} REGISTRY` : ""}
            {contractRiskFilter ? " · CONTRACT RISK" : ""}
            {resolvedSelectedClient ? ` · ${resolvedSelectedClient.name.toUpperCase()}` : ""}
          </div>
          <button
            type="button"
            onClick={clearFilters}
            style={styles.filterClearButton}
          >
            CLEAR DRILL-DOWN
          </button>
        </div>
      ) : null}

      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>CLIENT DIRECTORY</h2>
        <div style={styles.sectionDivider} />
        {loadError ? (
          <p style={styles.emptyText}>{loadError}</p>
        ) : canonicalClients.length === 0 ? (
          <p style={styles.emptyText}>NO CLIENT PROFILES YET.</p>
        ) : (
          <div style={styles.clientGrid}>
            {canonicalClients.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                onSelect={handleSelectClient}
              />
            ))}
          </div>
        )}
      </div>

      <div style={{ ...styles.card, borderLeftColor: "var(--lcars-orange)" }}>
        <h2 style={styles.sectionTitle}>UNLINKED SIGNALS</h2>
        <div style={styles.sectionDivider} />
        <div style={styles.helperText}>
          These records still need a client profile before they move into the
          main directory.
        </div>
        {loadError ? (
          <p style={styles.emptyText}>{loadError}</p>
        ) : operationalOnlyClients.length === 0 ? (
          <p style={styles.emptyText}>NO UNMAPPED CLIENT SIGNALS.</p>
        ) : (
          <div style={styles.clientGrid}>
            {operationalOnlyClients.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                onSelect={handleSelectClient}
              />
            ))}
          </div>
        )}
      </div>

      {selectedClientRef ? (
        detailLoading ? (
          <div style={styles.overlay} onClick={handleCloseDetail}>
            <div style={styles.detailPanel} onClick={(event) => event.stopPropagation()}>
              <div style={styles.detailHeader}>
                <div style={styles.detailTitle}>LOADING...</div>
                <button onClick={handleCloseDetail} style={styles.closeButton}>
                  ×
                </button>
              </div>
              <div style={{ padding: 24 }}>
                <SkeletonTable rows={8} cols={2} />
              </div>
            </div>
          </div>
        ) : detail ? (
          <DetailPanel detail={detail} onClose={handleCloseDetail} />
        ) : (
          <div style={styles.overlay} onClick={handleCloseDetail}>
            <div style={styles.detailPanel} onClick={(event) => event.stopPropagation()}>
              <div style={styles.detailHeader}>
                <div style={styles.detailTitle}>ERROR</div>
                <button onClick={handleCloseDetail} style={styles.closeButton}>
                  ×
                </button>
              </div>
              <div style={{ padding: 24 }}>
                <p style={styles.emptyText}>
                  {detailError ?? "CLIENT DETAIL UNAVAILABLE."}
                </p>
              </div>
            </div>
          </div>
        )
      ) : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageTitle: lcarsPageStyles.pageTitle,
  pageTitleBar: lcarsPageStyles.pageTitleBar,
  metricsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 16,
    marginBottom: 20,
  },
  metricCard: {
    ...lcarsPageStyles.subtleCard,
    minHeight: 100,
    padding: 20,
    position: "relative" as const,
  },
  metricBar: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  metricLabel: lcarsPageStyles.metricLabel,
  metricValue: lcarsPageStyles.metricValue,
  card: {
    ...lcarsPageStyles.card,
    borderLeftColor: "var(--lcars-cyan)",
  },
  sectionTitle: lcarsPageStyles.sectionTitle,
  sectionDivider: lcarsPageStyles.sectionDivider,
  emptyText: lcarsPageStyles.emptyText,
  helperText: lcarsPageStyles.helperText,
  filterBanner: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap" as const,
    marginBottom: 20,
    padding: "12px 16px",
    background: "rgba(0, 204, 255, 0.05)",
    border: "1px solid rgba(0, 204, 255, 0.14)",
    borderLeft: "6px solid var(--lcars-cyan)",
    borderRadius: "0 18px 18px 0",
  },
  filterBannerText: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    color: "var(--lcars-cyan)",
    letterSpacing: "1px",
    textTransform: "uppercase" as const,
  },
  filterClearButton: {
    ...lcarsPageStyles.ghostButton,
    padding: "6px 12px",
    fontSize: 10,
    color: "var(--lcars-cyan)",
    border: "1px solid rgba(0, 204, 255, 0.3)",
  },
  clientGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
    gap: 16,
  },
  clientCard: {
    ...lcarsPageStyles.subtleCard,
    width: "100%",
    textAlign: "left" as const,
    borderLeftColor: "var(--lcars-orange)",
    cursor: "pointer",
    background: "rgba(8, 12, 26, 0.92)",
  },
  clientHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 10,
  },
  clientName: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 13,
    fontWeight: 700,
    color: "var(--lcars-orange)",
    letterSpacing: "0.12em",
  },
  clientSubtitle: {
    marginTop: 4,
    fontSize: 10,
    color: "var(--lcars-lavender)",
    letterSpacing: "0.08em",
  },
  pill: {
    display: "inline-block",
    padding: "2px 10px",
    borderRadius: 2,
    border: "1px solid",
    fontSize: 9,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: "0.12em",
    whiteSpace: "nowrap" as const,
  },
  sourcePill: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 2,
    border: "1px solid rgba(153, 153, 204, 0.26)",
    color: "var(--lcars-lavender)",
    fontSize: 9,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: "0.12em",
  },
  pillRow: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap" as const,
    marginBottom: 10,
  },
  metricStrip: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 12,
    marginBottom: 12,
  },
  stripLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    color: "var(--lcars-lavender)",
    letterSpacing: "0.08em",
    marginBottom: 3,
  },
  stripValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 16,
    fontWeight: 600,
    color: "var(--lcars-tan)",
  },
  cardSection: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  },
  cardMetaLine: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap" as const,
  },
  metaPill: {
    display: "inline-block",
    padding: "2px 8px",
    border: "1px solid rgba(0, 204, 255, 0.3)",
    color: "var(--lcars-cyan)",
    fontSize: 9,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: "0.1em",
  },
  metaText: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    color: "var(--lcars-lavender)",
  },
  cardSubtext: {
    color: "var(--text-secondary)",
    fontSize: 11,
    lineHeight: 1.6,
  },
  tagRow: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap" as const,
  },
  signalTag: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    border: "1px solid rgba(255, 204, 102, 0.26)",
    color: "var(--lcars-peach)",
    fontSize: 9,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: "0.08em",
    background: "rgba(255, 204, 102, 0.08)",
  },
  cardFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap" as const,
    marginTop: 12,
  },
  overlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0, 0, 0, 0.65)",
    zIndex: 1000,
    display: "flex",
    justifyContent: "flex-end",
  },
  detailPanel: {
    width: "min(520px, 92vw)",
    height: "100vh",
    background: "var(--bg-console)",
    borderLeft: "4px solid var(--lcars-orange)",
    overflowY: "auto" as const,
    boxShadow: "-8px 0 32px rgba(0, 0, 0, 0.5)",
  },
  detailHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    padding: "20px 20px 12px 20px",
  },
  detailTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 16,
    fontWeight: 700,
    color: "var(--lcars-orange)",
    letterSpacing: "0.14em",
  },
  headerPills: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap" as const,
    marginTop: 8,
  },
  closeButton: {
    background: "transparent",
    border: "1px solid rgba(153, 153, 204, 0.25)",
    color: "var(--lcars-lavender)",
    fontSize: 20,
    lineHeight: 1,
    cursor: "pointer",
    padding: "4px 10px",
    borderRadius: "0 10px 10px 0",
    fontFamily: "'Orbitron', sans-serif",
  },
  detailDivider: {
    height: 1,
    background:
      "linear-gradient(90deg, rgba(255, 153, 0, 0.35), rgba(153, 153, 204, 0.1) 70%, transparent)",
    margin: "0 20px",
  },
  detailSection: {
    padding: "14px 20px",
  },
  detailSectionTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 11,
    fontWeight: 600,
    color: "var(--lcars-orange)",
    letterSpacing: "0.12em",
    marginBottom: 10,
    textTransform: "uppercase" as const,
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
  },
  detailLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    color: "var(--lcars-lavender)",
    letterSpacing: "0.1em",
    marginBottom: 4,
    textTransform: "uppercase" as const,
  },
  detailValueMono: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 14,
    fontWeight: 600,
    color: "var(--lcars-tan)",
  },
  detailText: {
    color: "var(--lcars-tan)",
    fontSize: 12,
    lineHeight: 1.6,
  },
  detailLink: {
    color: "var(--lcars-cyan)",
    fontSize: 11,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: "0.08em",
    textDecoration: "none",
  },
  profileColumns: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 16,
    marginTop: 14,
  },
  profileList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
    marginTop: 6,
  },
  profileListItem: {
    padding: "6px 10px",
    background: "rgba(153, 153, 204, 0.04)",
    borderLeft: "3px solid var(--lcars-cyan)",
    color: "var(--lcars-tan)",
    fontSize: 12,
    lineHeight: 1.5,
  },
  listColumn: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  },
  listItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "8px 10px",
    background: "rgba(153, 153, 204, 0.04)",
    borderLeft: "3px solid var(--lcars-orange)",
  },
  listItemMeta: {
    marginTop: 3,
    color: "var(--text-quaternary)",
    fontSize: 10,
    fontFamily: "'JetBrains Mono', monospace",
    lineHeight: 1.5,
  },
  listItemPill: {
    color: "var(--lcars-lavender)",
    fontSize: 10,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: "0.08em",
    whiteSpace: "nowrap" as const,
  },
  resourceMeta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
};

export default Clients;
