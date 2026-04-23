import { useState, useEffect, useCallback, useMemo } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";
import { SkeletonTable } from "../components/ui/Skeleton";
import Avatar from "../components/ui/Avatar";
import type { DeviceView } from "../lib/types";

// ── Status color mapping ──────────────────────────────────────

function statusColor(status: string): string {
  switch (status.toLowerCase()) {
    case "not started":
      return "var(--text-quaternary)";
    case "in progress":
      return "var(--lcars-cyan)";
    case "testing":
      return "var(--lcars-yellow)";
    case "deployed":
      return "var(--lcars-green)";
    case "issue":
      return "var(--lcars-red)";
    default:
      return "var(--lcars-lavender)";
  }
}

// ── StatusPill ─────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const color = statusColor(status);
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
        boxShadow: `0 0 8px ${color}33`,
      }}
    >
      {status.toUpperCase()}
    </span>
  );
}

// ── FilterPill ─────────────────────────────────────────────────

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...lcarsPageStyles.ghostButton,
        padding: "4px 12px",
        fontSize: 10,
        background: active
          ? "rgba(255, 153, 0, 0.12)"
          : "rgba(10, 10, 20, 0.68)",
        border: `1px solid ${active ? "var(--lcars-orange)" : "rgba(153, 153, 204, 0.25)"}`,
        color: active ? "var(--lcars-orange)" : "var(--lcars-lavender)",
      }}
    >
      {label.toUpperCase()}
    </button>
  );
}

// ── Expanded row detail ───────────────────────────────────────

function DeviceDetail({ device }: { device: DeviceView }) {
  return (
    <tr>
      <td colSpan={7} style={{ padding: 0 }}>
        <div style={styles.expandedRow}>
          <div style={styles.expandedGrid}>
            <div>
              <div style={styles.expandedLabel}>TECHNICAL NOTES</div>
              <div style={styles.expandedValue}>
                {device.technicalNotes || "—"}
              </div>
            </div>
            <div>
              <div style={styles.expandedLabel}>FIRMWARE VERSION</div>
              <div style={styles.expandedValueMono}>
                {device.firmwareVersion || "—"}
              </div>
            </div>
            <div>
              <div style={styles.expandedLabel}>API DOCS</div>
              {device.apiDocsLink ? (
                <a
                  href={device.apiDocsLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.expandedLink}
                >
                  VIEW DOCS ↗
                </a>
              ) : (
                <div style={styles.expandedValue}>—</div>
              )}
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Devices Page ──────────────────────────────────────────────

function Devices() {
  const api = useInvoke();
  const [devices, setDevices] = useState<DeviceView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterClient, setFilterClient] = useState<string | null>(null);
  const [filterPlatform, setFilterPlatform] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getDevices();
      setDevices(data);
      setLoadError(null);
    } catch {
      setLoadError(
        "DEVICE REGISTRY UNAVAILABLE.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ── Unique filter values ──────────────────────────────────

  const clients = useMemo(
    () =>
      [...new Set(devices.map((d) => d.clientName).filter(Boolean))] as string[],
    [devices],
  );
  const platforms = useMemo(
    () => [...new Set(devices.map((d) => d.platform))],
    [devices],
  );
  const statuses = useMemo(
    () => [...new Set(devices.map((d) => d.status))],
    [devices],
  );

  // ── Filtered devices ──────────────────────────────────────

  const filtered = useMemo(
    () =>
      devices.filter((d) => {
        if (filterClient && d.clientName !== filterClient) return false;
        if (filterPlatform && d.platform !== filterPlatform) return false;
        if (filterStatus && d.status !== filterStatus) return false;
        return true;
      }),
    [devices, filterClient, filterPlatform, filterStatus],
  );

  const hasActiveFilters = filterClient || filterPlatform || filterStatus;

  if (loading) {
    return (
      <div>
        <h1 style={styles.pageTitle}>DEVICES</h1>
        <div style={styles.pageTitleBar} />
        <div style={styles.card}>
          <SkeletonTable rows={8} cols={7} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={styles.pageTitle}>DEVICES</h1>
      <div style={styles.pageTitleBar} />

      {/* Filter bar */}
      <div style={styles.filterBar}>
        <div style={styles.filterGroup}>
          <div style={styles.filterLabel}>CLIENT</div>
          <div style={styles.filterPills}>
            <FilterPill
              label="ALL"
              active={filterClient === null}
              onClick={() => setFilterClient(null)}
            />
            {clients.map((c) => (
              <FilterPill
                key={c}
                label={c}
                active={filterClient === c}
                onClick={() =>
                  setFilterClient(filterClient === c ? null : c)
                }
              />
            ))}
          </div>
        </div>

        <div style={styles.filterGroup}>
          <div style={styles.filterLabel}>PLATFORM</div>
          <div style={styles.filterPills}>
            <FilterPill
              label="ALL"
              active={filterPlatform === null}
              onClick={() => setFilterPlatform(null)}
            />
            {platforms.map((p) => (
              <FilterPill
                key={p}
                label={p}
                active={filterPlatform === p}
                onClick={() =>
                  setFilterPlatform(filterPlatform === p ? null : p)
                }
              />
            ))}
          </div>
        </div>

        <div style={styles.filterGroup}>
          <div style={styles.filterLabel}>STATUS</div>
          <div style={styles.filterPills}>
            <FilterPill
              label="ALL"
              active={filterStatus === null}
              onClick={() => setFilterStatus(null)}
            />
            {statuses.map((s) => (
              <FilterPill
                key={s}
                label={s}
                active={filterStatus === s}
                onClick={() =>
                  setFilterStatus(filterStatus === s ? null : s)
                }
              />
            ))}
          </div>
        </div>

        {hasActiveFilters && (
          <button
            onClick={() => {
              setFilterClient(null);
              setFilterPlatform(null);
              setFilterStatus(null);
            }}
            style={{
              ...lcarsPageStyles.ghostButton,
              padding: "4px 12px",
              fontSize: 10,
              color: "var(--lcars-red)",
              border: "1px solid var(--lcars-red)",
            }}
          >
            CLEAR FILTERS
          </button>
        )}
      </div>

      {/* Devices Table */}
      <div style={styles.card}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <h2 style={{ ...styles.sectionTitle, marginBottom: 0 }}>
            DEVICE REGISTRY
          </h2>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              color: "var(--lcars-lavender)",
            }}
          >
            {filtered.length} / {devices.length} DEVICES
          </span>
        </div>
        <div style={styles.sectionDivider} />

        {loadError ? (
          <p style={styles.emptyText}>{loadError}</p>
        ) : devices.length === 0 ? (
          <p style={styles.emptyText}>
            NO ACTIVE DEVICE SIGNALS.
          </p>
        ) : filtered.length === 0 ? (
          <p style={styles.emptyText}>
            NO DEVICES MATCH CURRENT FILTERS.
          </p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>DEVICE NAME</th>
                <th style={styles.th}>MODEL</th>
                <th style={styles.th}>PLATFORM</th>
                <th style={styles.th}>CLIENT</th>
                <th style={styles.th}>STATUS</th>
                <th style={styles.th}>RESPONSIBLE DEV</th>
                <th style={styles.th}>ISSUES</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((device) => {
                const isExpanded = expandedId === device.id;
                return (
                  <>
                    <tr
                      key={device.id}
                      onClick={() =>
                        setExpandedId(isExpanded ? null : device.id)
                      }
                      style={{
                        cursor: "pointer",
                        background: isExpanded
                          ? "rgba(255, 153, 0, 0.04)"
                          : "transparent",
                      }}
                    >
                      <td
                        style={{
                          ...styles.td,
                          color: "var(--lcars-orange)",
                          fontWeight: 600,
                        }}
                      >
                        {device.name}
                      </td>
                      <td style={styles.td}>{device.model ?? "—"}</td>
                      <td style={styles.td}>
                        <span
                          style={{
                            fontFamily: "'Orbitron', sans-serif",
                            fontSize: 10,
                            letterSpacing: "1px",
                            color: "var(--lcars-cyan)",
                          }}
                        >
                          {device.platform.toUpperCase()}
                        </span>
                      </td>
                      <td style={styles.td}>
                        {device.clientName ?? (
                          <span style={{ color: "var(--text-quaternary)" }}>
                            UNASSIGNED
                          </span>
                        )}
                      </td>
                      <td style={styles.td}>
                        <StatusPill status={device.status} />
                      </td>
                      <td style={styles.td}>
                        {device.responsibleDev ? (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <Avatar name={device.responsibleDev} size={24} />
                            <span style={{ color: "var(--lcars-tan)" }}>
                              {device.responsibleDev}
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: "var(--text-quaternary)" }}>
                            UNASSIGNED
                          </span>
                        )}
                      </td>
                      <td
                        style={{
                          ...styles.tdMono,
                          color:
                            device.issueCount > 0
                              ? "var(--lcars-red)"
                              : "var(--lcars-green)",
                          fontWeight: 600,
                          textShadow:
                            device.issueCount > 0
                              ? "0 0 6px rgba(204, 51, 51, 0.3)"
                              : "none",
                        }}
                      >
                        {device.issueCount}
                      </td>
                    </tr>
                    {isExpanded && (
                      <DeviceDetail
                        key={`detail-${device.id}`}
                        device={device}
                      />
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  pageTitle: lcarsPageStyles.pageTitle,
  pageTitleBar: lcarsPageStyles.pageTitleBar,
  card: {
    ...lcarsPageStyles.card,
    borderLeftColor: "var(--lcars-cyan)",
  },
  sectionTitle: lcarsPageStyles.sectionTitle,
  sectionDivider: lcarsPageStyles.sectionDivider,
  table: lcarsPageStyles.table,
  th: lcarsPageStyles.th,
  td: lcarsPageStyles.td,
  tdMono: lcarsPageStyles.tdMono,
  emptyText: lcarsPageStyles.emptyText,

  // ── Filter bar ────────────────────────────────────────────
  filterBar: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 12,
    marginBottom: 20,
    padding: "16px 20px",
    background: "var(--bg-console-soft)",
    border: "1px solid rgba(153, 153, 204, 0.14)",
    borderLeft: "6px solid var(--lcars-cyan)",
    borderRadius: "0 18px 18px 0",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.03), 0 12px 24px rgba(0, 0, 0, 0.18)",
  },
  filterGroup: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap" as const,
  },
  filterLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    fontWeight: 600,
    color: "var(--lcars-lavender)",
    letterSpacing: "1.5px",
    minWidth: 72,
    textTransform: "uppercase" as const,
  },
  filterPills: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap" as const,
  },

  // ── Expanded row ──────────────────────────────────────────
  expandedRow: {
    background: "rgba(0, 204, 255, 0.03)",
    borderLeft: "4px solid var(--lcars-cyan)",
    padding: "14px 20px",
    borderBottom: "1px solid rgba(153, 153, 204, 0.08)",
  },
  expandedGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 16,
  },
  expandedLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    color: "var(--lcars-lavender)",
    letterSpacing: "1px",
    marginBottom: 4,
    textTransform: "uppercase" as const,
  },
  expandedValue: {
    color: "var(--lcars-tan)",
    fontSize: 12,
    lineHeight: 1.5,
  },
  expandedValueMono: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    color: "var(--lcars-orange)",
  },
  expandedLink: {
    color: "var(--lcars-cyan)",
    fontSize: 11,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: "1px",
    textDecoration: "none",
  },
};

export default Devices;
