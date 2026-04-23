import { useState, useEffect, useCallback } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";
import { SkeletonCard, SkeletonTable } from "../components/ui/Skeleton";
import Avatar from "../components/ui/Avatar";
import type { ClientView, ClientDetailView, ActivityItem } from "../lib/types";

// ── Tier colors ───────────────────────────────────────────────

function tierColor(tier: string): string {
  switch (tier.toLowerCase()) {
    case "tier 1":
      return "var(--lcars-orange)";
    case "tier 2":
      return "var(--lcars-cyan)";
    case "tier 3":
      return "var(--lcars-lavender)";
    case "tier 4":
      return "var(--lcars-tan)";
    case "r&d":
      return "var(--lcars-peach)";
    default:
      return "var(--lcars-lavender)";
  }
}

// ── MetricCard ────────────────────────────────────────────────

const METRIC_COLORS = [
  "var(--lcars-orange)",
  "var(--lcars-cyan)",
  "var(--lcars-green)",
  "var(--lcars-red)",
];

function formatHours(hours: number): string {
  return `${hours.toFixed(1)}H`;
}

function MetricCard({
  label,
  value,
  colorIndex = 0,
}: {
  label: string;
  value: string;
  colorIndex?: number;
}) {
  const barColor = METRIC_COLORS[colorIndex % METRIC_COLORS.length];
  return (
    <div style={styles.metricCard}>
      <div style={{ ...styles.metricCardBar, backgroundColor: barColor }} />
      <div style={styles.metricLabel}>{label}</div>
      <div style={styles.metricValue}>{value}</div>
    </div>
  );
}

// ── TierBadge ─────────────────────────────────────────────────

function TierBadge({ tier }: { tier: string }) {
  const color = tierColor(tier);
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 2,
        backgroundColor: "transparent",
        border: `1px solid ${color}`,
        color,
        fontSize: 10,
        fontWeight: 600,
        fontFamily: "'Orbitron', sans-serif",
        lineHeight: "18px",
        letterSpacing: "1px",
        textTransform: "uppercase" as const,
      }}
    >
      {tier.toUpperCase()}
    </span>
  );
}

// ── ContractBadge ─────────────────────────────────────────────

function ContractBadge({
  status,
  daysRemaining,
}: {
  status: string;
  daysRemaining: number | null;
}) {
  const isUrgent = daysRemaining !== null && daysRemaining < 30;
  const color = isUrgent ? "var(--lcars-red)" : "var(--lcars-green)";
  const label =
    isUrgent && daysRemaining !== null
      ? `${daysRemaining}D LEFT`
      : status.toUpperCase();

  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 2,
        backgroundColor: "transparent",
        border: `1px solid ${color}`,
        color,
        fontSize: 10,
        fontWeight: 600,
        fontFamily: "'Orbitron', sans-serif",
        lineHeight: "18px",
        letterSpacing: "1px",
        textTransform: "uppercase" as const,
        boxShadow: isUrgent ? `0 0 8px ${color}33` : "none",
      }}
    >
      {label}
    </span>
  );
}

// ── TechTag ───────────────────────────────────────────────────

function TechTag({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 8px",
        borderRadius: 2,
        border: "1px solid rgba(153, 153, 204, 0.22)",
        color: "var(--lcars-lavender)",
        fontSize: 9,
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: "0.5px",
        background: "rgba(153, 153, 204, 0.06)",
      }}
    >
      {label.toUpperCase()}
    </span>
  );
}

function SourcePill({ source }: { source: string }) {
  const hasGithub = source.toLowerCase().includes("github");
  const color = hasGithub ? "var(--lcars-cyan)" : "var(--lcars-orange)";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 2,
        border: `1px solid ${color}`,
        color,
        fontSize: 9,
        fontFamily: "'Orbitron', sans-serif",
        letterSpacing: "1px",
      }}
    >
      {source.toUpperCase()}
    </span>
  );
}

// ── ClientCard ────────────────────────────────────────────────

function ClientCard({
  client,
  onSelect,
}: {
  client: ClientView;
  onSelect: (id: string) => void;
}) {
  const accent = tierColor(client.tier);
  const profile = client.profile;
  const fitPreview = profile?.strategicFit.slice(0, 2) ?? [];

  return (
    <div
      onClick={() => onSelect(client.id)}
      style={{
        ...styles.clientCard,
        borderLeftColor: accent,
        cursor: "pointer",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 10,
        }}
      >
        <div>
          <div style={styles.clientName}>{client.name.toUpperCase()}</div>
          {client.industry && (
            <div style={styles.clientIndustry}>{client.industry.toUpperCase()}</div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <SourcePill source={client.planningSource} />
          <TierBadge tier={client.tier} />
        </div>
      </div>

      <div style={styles.clientMetricsRow}>
        <div>
          <div style={styles.clientMetricLabel}>BILLABLE HOURS (MONTH)</div>
          <div style={styles.clientMetricValue}>{formatHours(client.monthBillableHours)}</div>
        </div>
        <div>
          <div style={styles.clientMetricLabel}>ACTIVE PROJECTS</div>
          <div style={styles.clientMetricValue}>{client.activeProjects}</div>
        </div>
        <div>
          <div style={styles.clientMetricLabel}>GITHUB OPEN</div>
          <div style={styles.clientMetricValue}>{client.githubOpenIssues}</div>
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        {client.primaryContact && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Avatar name={client.primaryContact} size={20} />
            <span style={{ color: "var(--lcars-tan)", fontSize: 12 }}>
              {client.primaryContact}
            </span>
          </div>
        )}
        {profile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
              <span style={styles.profileMetaPill}>
                {(profile.engagementModel ?? "UNSPECIFIED").toUpperCase()}
              </span>
              <span style={styles.profileCompletenessText}>
                PROFILE {profile.profileCompleteness.toFixed(0)}%
              </span>
            </div>
            {fitPreview.length > 0 && (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
                {fitPreview.map((item) => (
                  <span key={item} style={styles.fitTag}>
                    {item.toUpperCase()}
                  </span>
                ))}
              </div>
            )}
            {profile.stakeholders.length > 0 && (
              <div style={styles.profileSubtext}>
                STAKEHOLDERS: {profile.stakeholders.slice(0, 3).join(", ")}
              </div>
            )}
          </div>
        ) : (
          <div style={styles.profileMissingText}>NO VAULT CLIENT PROFILE YET</div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <ContractBadge
          status={client.contractStatus}
          daysRemaining={client.daysRemaining}
        />
      </div>

      {client.techStack.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
          {client.techStack.map((tech) => (
            <TechTag key={tech} label={tech} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Detail Panel ──────────────────────────────────────────────

function DetailPanel({
  detail,
  onClose,
}: {
  detail: ClientDetailView;
  onClose: () => void;
}) {
  const client = detail.client;
  const accent = tierColor(client.tier);
  const profile = client.profile;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.detailPanel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.detailHeader}>
          <div>
            <div style={styles.detailTitle}>{client.name.toUpperCase()}</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
              <TierBadge tier={client.tier} />
              <SourcePill source={client.planningSource} />
              {client.industry && (
                <span style={styles.clientIndustry}>{client.industry.toUpperCase()}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={styles.closeButton}>
            ×
          </button>
        </div>

        <div style={styles.detailDivider} />

        <div style={styles.detailSection}>
          <div style={styles.detailSectionTitle}>VAULT PROFILE</div>
          {!profile ? (
            <div style={styles.emptyText}>
              NO VAULT CLIENT PROFILE YET. ADD A `client-profile.md` NOTE TO THE THOUGHTSEED VAULT TO POPULATE THIS SECTION.
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
                    {profile.onboarded ? new Date(profile.onboarded).toLocaleDateString() : "—"}
                  </div>
                </div>
                <div>
                  <div style={styles.detailLabel}>PROJECT IDS</div>
                  <div style={{ color: "var(--lcars-tan)", fontSize: 13 }}>
                    {profile.projectIds.length > 0 ? profile.projectIds.join(", ") : "—"}
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

        {/* Client info */}
        <div style={styles.detailSection}>
          <div style={styles.detailSectionTitle}>CLIENT INFO</div>
          <div style={styles.detailGrid}>
            <div>
              <div style={styles.detailLabel}>BILLABLE HOURS (MONTH)</div>
              <div style={styles.detailValueMono}>{formatHours(client.monthBillableHours)}</div>
            </div>
            <div>
              <div style={styles.detailLabel}>ACTIVE PROJECTS</div>
              <div style={styles.detailValueMono}>{client.activeProjects}</div>
            </div>
            <div>
              <div style={styles.detailLabel}>GITHUB ISSUES</div>
              <div style={styles.detailValueMono}>
                {client.githubOpenIssues}/{client.githubTotalIssues} OPEN
              </div>
            </div>
            <div>
              <div style={styles.detailLabel}>PRIMARY CONTACT</div>
              <div style={{ color: "var(--lcars-tan)", fontSize: 13 }}>
                {client.primaryContact ?? "—"}
              </div>
            </div>
            <div>
              <div style={styles.detailLabel}>CONTRACT</div>
              <ContractBadge
                status={client.contractStatus}
                daysRemaining={client.daysRemaining}
              />
            </div>
          </div>

          {client.techStack.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={styles.detailLabel}>TECH STACK</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const, marginTop: 4 }}>
                {client.techStack.map((tech) => (
                  <TechTag key={tech} label={tech} />
                ))}
              </div>
            </div>
          )}

          {(client.driveLink || client.chromeProfile) && (
            <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
              {client.driveLink && (
                <a
                  href={client.driveLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.detailLink}
                >
                  DRIVE FOLDER ↗
                </a>
              )}
              {client.chromeProfile && (
                <span style={{ color: "var(--lcars-lavender)", fontSize: 11 }}>
                  CHROME: {client.chromeProfile}
                </span>
              )}
            </div>
          )}
        </div>

        <div style={styles.detailDivider} />

        {/* Linked Projects */}
        <div style={styles.detailSection}>
          <div style={styles.detailSectionTitle}>
            LINKED PROJECTS ({detail.linkedProjects.length})
          </div>
          {detail.linkedProjects.length === 0 ? (
            <div style={styles.emptyText}>NO LINKED PROJECTS</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
              {detail.linkedProjects.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "6px 10px",
                    background: "rgba(153, 153, 204, 0.04)",
                    borderLeft: `3px solid ${accent}`,
                  }}
                >
                  <div>
                    {p.sourceUrl ? (
                      <a
                        href={p.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ ...styles.detailLink, color: "var(--lcars-tan)" }}
                      >
                        {p.name}
                      </a>
                    ) : (
                      <span style={{ color: "var(--lcars-tan)", fontSize: 12 }}>
                        {p.name}
                      </span>
                    )}
                    <div style={styles.projectMeta}>
                      {p.source.toUpperCase()}
                      {p.repo ? ` · ${p.repo}` : ""}
                      {p.totalIssues > 0 ? ` · ${p.openIssues}/${p.totalIssues} OPEN` : ""}
                    </div>
                  </div>
                  <span
                    style={{
                      color: "var(--lcars-lavender)",
                      fontSize: 10,
                      fontFamily: "'Orbitron', sans-serif",
                      letterSpacing: "1px",
                    }}
                  >
                    {p.status.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={styles.detailDivider} />

        {/* Linked Devices */}
        <div style={styles.detailSection}>
          <div style={styles.detailSectionTitle}>
            LINKED DEVICES ({detail.linkedDevices.length})
          </div>
          {detail.linkedDevicesUnavailable ? (
            <div style={styles.emptyText}>
              LINKED DEVICE DATA IS CURRENTLY UNAVAILABLE. HULY DEVICE SIGNALS COULD NOT BE LOADED.
            </div>
          ) : detail.linkedDevices.length === 0 ? (
            <div style={styles.emptyText}>NO LINKED DEVICES</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
              {detail.linkedDevices.map((d) => (
                <div
                  key={d.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "6px 10px",
                    background: "rgba(153, 153, 204, 0.04)",
                    borderLeft: "3px solid var(--lcars-cyan)",
                  }}
                >
                  <span style={{ color: "var(--lcars-tan)", fontSize: 12 }}>
                    {d.name}
                  </span>
                  <span
                    style={{
                      color: "var(--lcars-lavender)",
                      fontSize: 10,
                      fontFamily: "'Orbitron', sans-serif",
                      letterSpacing: "1px",
                    }}
                  >
                    {d.platform.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={styles.detailDivider} />

        {/* Resources */}
        <div style={styles.detailSection}>
          <div style={styles.detailSectionTitle}>
            RESOURCES ({detail.resources.length})
          </div>
          {detail.resources.length === 0 ? (
            <div style={styles.emptyText}>NO RESOURCES</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
              {detail.resources.map((r, i) => (
                <div
                  key={`${r.name}-${i}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "6px 10px",
                    background: "rgba(153, 153, 204, 0.04)",
                    borderLeft: "3px solid var(--lcars-peach)",
                  }}
                >
                  <span style={{ color: "var(--lcars-tan)", fontSize: 12 }}>
                    {r.name}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        color: "var(--lcars-lavender)",
                        fontSize: 10,
                        fontFamily: "'Orbitron', sans-serif",
                        letterSpacing: "1px",
                      }}
                    >
                      {r.type.toUpperCase()}
                    </span>
                    {r.url && (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={styles.detailLink}
                      >
                        ↗
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={styles.detailDivider} />

        {/* Recent Activity */}
        <div style={styles.detailSection}>
          <div style={styles.detailSectionTitle}>
            RECENT ACTIVITY ({detail.recentActivity.length})
          </div>
          {detail.recentActivity.length === 0 ? (
            <div style={styles.emptyText}>NO RECENT ACTIVITY</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
              {detail.recentActivity.map((a: ActivityItem, i: number) => (
                <div
                  key={`activity-${i}`}
                  style={{
                    padding: "6px 10px",
                    background: "rgba(153, 153, 204, 0.04)",
                    borderLeft: "3px solid var(--lcars-orange)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 2,
                    }}
                  >
                    <span style={{ color: "var(--lcars-tan)", fontSize: 12 }}>
                      {a.employeeName} — {a.action}
                    </span>
                    <span
                      style={{
                        color: "var(--text-quaternary)",
                        fontSize: 10,
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    >
                      {new Date(a.occurredAt).toLocaleDateString()}
                    </span>
                  </div>
                  {a.detail && (
                    <div style={{ color: "var(--lcars-lavender)", fontSize: 11 }}>
                      {a.detail}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Clients Page ──────────────────────────────────────────────

function Clients() {
  const api = useInvoke();
  const [clients, setClients] = useState<ClientView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClientDetailView | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getClients();
      setClients(data);
      setLoadError(null);
    } catch {
      setLoadError(
        "CLIENT DATA UNAVAILABLE.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSelectClient = useCallback(
    async (clientId: string) => {
      setSelectedClientId(clientId);
      setDetailLoading(true);
      setDetail(null);
      setDetailError(null);
      try {
        const data = await api.getClientDetail(clientId);
        setDetail(data);
      } catch {
        setDetailError(
          "CLIENT DETAIL UNAVAILABLE.",
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [api],
  );

  const handleCloseDetail = useCallback(() => {
    setSelectedClientId(null);
    setDetail(null);
  }, []);

  // ── Computed metrics ──────────────────────────────────────

  const activeClients = clients.filter(
    (c) => c.contractStatus.toLowerCase() !== "expired",
  );
  const monthBillableHours = clients.reduce(
    (sum, c) => sum + c.monthBillableHours,
    0,
  );
  const projectsInFlight = clients.reduce(
    (sum, c) => sum + c.activeProjects,
    0,
  );
  const atRiskCount = clients.filter(
    (c) => c.daysRemaining !== null && c.daysRemaining < 30,
  ).length;

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

      {/* Metric Cards Row */}
      <div style={styles.metricsRow}>
        <MetricCard
          label="ACTIVE CLIENTS"
          value={String(activeClients.length)}
          colorIndex={0}
        />
        <MetricCard
          label="BILLABLE HOURS (MONTH)"
          value={formatHours(monthBillableHours)}
          colorIndex={1}
        />
        <MetricCard
          label="PROJECTS IN FLIGHT"
          value={String(projectsInFlight)}
          colorIndex={2}
        />
        <MetricCard
          label="CLIENTS AT RISK"
          value={String(atRiskCount)}
          colorIndex={3}
        />
      </div>

      {/* Client Cards Grid */}
      <div style={styles.card}>
        <h2 style={{ ...styles.sectionTitle, marginBottom: 0 }}>CLIENT DIRECTORY</h2>
        <div style={{ ...styles.sectionDivider, marginTop: 8 }} />

        {loadError ? (
          <p style={styles.emptyText}>{loadError}</p>
        ) : clients.length === 0 ? (
          <p style={styles.emptyText}>
            NO CLIENTS FOUND.
          </p>
        ) : (
          <div style={styles.clientGrid}>
            {clients.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                onSelect={handleSelectClient}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail Slide-in Panel */}
      {selectedClientId && (
        <>
          {detailLoading ? (
            <div style={styles.overlay} onClick={handleCloseDetail}>
              <div
                style={styles.detailPanel}
                onClick={(e) => e.stopPropagation()}
              >
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
              <div
                style={styles.detailPanel}
                onClick={(e) => e.stopPropagation()}
              >
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
          )}
        </>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────

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
    background: "var(--bg-console-soft)",
    border: "1px solid rgba(153, 153, 204, 0.16)",
    borderLeft: "8px solid var(--lcars-orange)",
    borderRadius: "0 22px 0 0",
    padding: 24,
    position: "relative" as const,
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.03), 0 18px 30px rgba(0, 0, 0, 0.2)",
  },
  metricCardBar: {
    position: "absolute" as const,
    top: 0,
    left: -8,
    right: 0,
    height: 5,
  },
  metricLabel: lcarsPageStyles.metricLabel,
  metricValue: lcarsPageStyles.metricValue,
  card: {
    ...lcarsPageStyles.card,
    borderLeftColor: "var(--lcars-orange)",
  },
  sectionTitle: lcarsPageStyles.sectionTitle,
  sectionDivider: lcarsPageStyles.sectionDivider,
  emptyText: lcarsPageStyles.emptyText,
  clientGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
    gap: 16,
  },
  clientCard: {
    background: "var(--bg-console-soft)",
    border: "1px solid rgba(153, 153, 204, 0.14)",
    borderLeft: "6px solid var(--lcars-orange)",
    borderRadius: "0 18px 18px 0",
    padding: 16,
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.03), 0 12px 24px rgba(0, 0, 0, 0.18)",
    transition: "border-color 0.2s ease, box-shadow 0.2s ease",
  },
  clientName: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 13,
    fontWeight: 700,
    color: "var(--lcars-orange)",
    letterSpacing: "1.5px",
  },
  clientIndustry: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    color: "var(--lcars-lavender)",
    letterSpacing: "1px",
    marginTop: 2,
  },
  clientMetricsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 12,
    marginBottom: 10,
  },
  clientMetricLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    color: "var(--lcars-lavender)",
    letterSpacing: "1px",
    marginBottom: 2,
    textTransform: "uppercase" as const,
  },
  clientMetricValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 16,
    fontWeight: 600,
    color: "var(--lcars-orange)",
    letterSpacing: "-0.3px",
  },
  profileMetaPill: {
    display: "inline-block",
    padding: "2px 8px",
    border: "1px solid rgba(102, 204, 255, 0.35)",
    color: "var(--lcars-cyan)",
    fontSize: 9,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: "1px",
    borderRadius: 2,
  },
  profileCompletenessText: {
    color: "var(--lcars-lavender)",
    fontSize: 10,
    fontFamily: "'JetBrains Mono', monospace",
  },
  fitTag: {
    display: "inline-block",
    padding: "1px 8px",
    borderRadius: 2,
    border: "1px solid rgba(255, 204, 102, 0.3)",
    color: "var(--lcars-peach)",
    fontSize: 9,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: "0.8px",
  },
  profileSubtext: {
    color: "var(--text-quaternary)",
    fontSize: 10,
    fontFamily: "'JetBrains Mono', monospace",
    lineHeight: 1.5,
  },
  profileMissingText: {
    color: "var(--text-quaternary)",
    fontSize: 10,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: "1px",
  },

  // ── Detail panel ──────────────────────────────────────────
  overlay: {
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0, 0, 0, 0.65)",
    zIndex: 1000,
    display: "flex",
    justifyContent: "flex-end",
  },
  detailPanel: {
    width: "min(480px, 90vw)",
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
    padding: "20px 20px 12px 20px",
  },
  detailTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 16,
    fontWeight: 700,
    color: "var(--lcars-orange)",
    letterSpacing: "2px",
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
    letterSpacing: "1.5px",
    marginBottom: 10,
    textTransform: "uppercase" as const,
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },
  detailLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    color: "var(--lcars-lavender)",
    letterSpacing: "1px",
    marginBottom: 4,
    textTransform: "uppercase" as const,
  },
  detailValueMono: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 14,
    fontWeight: 600,
    color: "var(--lcars-orange)",
  },
  detailLink: {
    color: "var(--lcars-cyan)",
    fontSize: 11,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: "1px",
    textDecoration: "none",
  },
  profileColumns: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
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
  projectMeta: {
    marginTop: 3,
    color: "var(--text-quaternary)",
    fontSize: 9,
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: "0.3px",
  },
};

export default Clients;
