import { useState, useEffect, useCallback } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";
import type { VaultEntry } from "../lib/types";

interface SkillEntry {
  id: string;
  label: string;
  status: "production" | "validated" | "candidate";
  category: string;
  renderer: string;
  specPath: string;
}

const SKILL_REGISTRY: SkillEntry[] = [
  { id: "thoughtseed-invoice-generator", label: "Invoice Generator", status: "production", category: "finance", renderer: "html-pdf", specPath: "20-operations/skill-registry/specs/thoughtseed-invoice-generator.md" },
  { id: "thoughtseed-payslip-generator", label: "Payslip Generator", status: "production", category: "finance", renderer: "html-pdf", specPath: "20-operations/skill-registry/specs/thoughtseed-payslip-generator.md" },
  { id: "thoughtseed-letterhead", label: "Letterhead", status: "validated", category: "shared-doc", renderer: "html-pdf", specPath: "20-operations/skill-registry/specs/thoughtseed-letterhead.md" },
  { id: "thoughtseed-proposal-generator", label: "Proposal Generator", status: "production", category: "sales", renderer: "html-pdf", specPath: "20-operations/skill-registry/specs/thoughtseed-proposal-generator.md" },
  { id: "thoughtseed-contract-generator", label: "Contract Generator", status: "production", category: "sales", renderer: "docx", specPath: "20-operations/skill-registry/specs/thoughtseed-contract-generator.md" },
  { id: "thoughtseed-notebooklm-prompt", label: "NotebookLM Prompt", status: "production", category: "research", renderer: "markdown", specPath: "20-operations/skill-registry/specs/thoughtseed-notebooklm-prompt.md" },
  { id: "thoughtseed-offer-letter", label: "Offer Letter", status: "validated", category: "people", renderer: "docx", specPath: "20-operations/skill-registry/specs/thoughtseed-offer-letter.md" },
  { id: "thoughtseed-appointment-letter", label: "Appointment Letter", status: "validated", category: "people", renderer: "docx", specPath: "20-operations/skill-registry/specs/thoughtseed-appointment-letter.md" },
  { id: "thoughtseed-relieving-letter", label: "Relieving Letter", status: "validated", category: "people", renderer: "docx", specPath: "20-operations/skill-registry/specs/thoughtseed-relieving-letter.md" },
  { id: "thoughtseed-nda", label: "NDA", status: "validated", category: "governance", renderer: "docx", specPath: "20-operations/skill-registry/specs/thoughtseed-nda.md" },
  { id: "thoughtseed-team-member-bootstrap", label: "Team Member Bootstrap", status: "validated", category: "people", renderer: "markdown", specPath: "20-operations/skill-registry/specs/thoughtseed-team-member-bootstrap.md" },
  { id: "thoughtseed-kpi-instance", label: "KPI Instance", status: "validated", category: "people", renderer: "markdown", specPath: "20-operations/skill-registry/specs/thoughtseed-kpi-instance.md" },
  { id: "thoughtseed-compensation-record", label: "Compensation Record", status: "validated", category: "people", renderer: "markdown", specPath: "20-operations/skill-registry/specs/thoughtseed-compensation-record.md" },
  { id: "thoughtseed-employee-onboarding-flow", label: "Employee Onboarding", status: "validated", category: "people", renderer: "markdown", specPath: "20-operations/skill-registry/specs/thoughtseed-employee-onboarding-flow.md" },
  { id: "thoughtseed-job-post-generator", label: "Job Post Generator", status: "validated", category: "people", renderer: "markdown", specPath: "20-operations/skill-registry/specs/thoughtseed-job-post-generator.md" },
  { id: "thoughtseed-client-profile", label: "Client Profile", status: "validated", category: "delivery", renderer: "markdown", specPath: "20-operations/skill-registry/specs/thoughtseed-client-profile.md" },
  { id: "thoughtseed-client-onboarding-flow", label: "Client Onboarding", status: "validated", category: "delivery", renderer: "markdown", specPath: "20-operations/skill-registry/specs/thoughtseed-client-onboarding-flow.md" },
  { id: "thoughtseed-project-brief", label: "Project Brief", status: "validated", category: "delivery", renderer: "markdown", specPath: "20-operations/skill-registry/specs/thoughtseed-project-brief.md" },
  { id: "thoughtseed-technical-spec-scaffold", label: "Technical Spec", status: "validated", category: "delivery", renderer: "markdown", specPath: "20-operations/skill-registry/specs/thoughtseed-technical-spec-scaffold.md" },
  { id: "thoughtseed-milestone-signoff", label: "Milestone Signoff", status: "validated", category: "delivery", renderer: "html-pdf", specPath: "20-operations/skill-registry/specs/thoughtseed-milestone-signoff.md" },
  { id: "thoughtseed-change-request", label: "Change Request", status: "validated", category: "delivery", renderer: "html-pdf", specPath: "20-operations/skill-registry/specs/thoughtseed-change-request.md" },
  { id: "thoughtseed-closeout", label: "Closeout Report", status: "validated", category: "delivery", renderer: "markdown", specPath: "20-operations/skill-registry/specs/thoughtseed-closeout.md" },
  { id: "thoughtseed-board-resolution", label: "Board Resolution", status: "validated", category: "governance", renderer: "html-pdf", specPath: "20-operations/skill-registry/specs/thoughtseed-board-resolution.md" },
  { id: "thoughtseed-meeting-minutes", label: "Meeting Minutes", status: "validated", category: "governance", renderer: "markdown", specPath: "20-operations/skill-registry/specs/thoughtseed-meeting-minutes.md" },
  { id: "thoughtseed-ca-packet", label: "CA Packet", status: "validated", category: "governance", renderer: "html-pdf", specPath: "20-operations/skill-registry/specs/thoughtseed-ca-packet.md" },
];

const CATEGORIES = [...new Set(SKILL_REGISTRY.map((s) => s.category))];

function statusColor(status: string): string {
  switch (status) {
    case "production": return "var(--lcars-green)";
    case "validated": return "var(--lcars-cyan)";
    case "candidate": return "var(--lcars-yellow)";
    default: return "var(--lcars-tan)";
  }
}

function rendererColor(renderer: string): string {
  switch (renderer) {
    case "html-pdf": return "var(--lcars-orange)";
    case "docx": return "var(--lcars-lavender)";
    case "markdown": return "var(--lcars-tan)";
    default: return "var(--lcars-tan)";
  }
}

function VaultBrowser() {
  const api = useInvoke();
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [viewingFile, setViewingFile] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>([]);

  const loadDir = useCallback(async (dirPath: string) => {
    setLoading(true);
    setError(null);
    setFileContent(null);
    setViewingFile(null);
    try {
      const result = await api.listVaultEntries(dirPath || undefined);
      setEntries(result);
      setBreadcrumbs(dirPath ? dirPath.split("/") : []);
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { loadDir(""); }, [loadDir]);

  const openFile = async (entry: VaultEntry) => {
    if (entry.isDir) {
      loadDir(entry.relativePath);
    } else if (entry.name.endsWith(".md") || entry.name.endsWith(".yaml") || entry.name.endsWith(".yml") || entry.name.endsWith(".txt") || entry.name.endsWith(".json")) {
      setViewingFile(entry.relativePath);
      try {
        const content = await api.readVaultFile(entry.relativePath);
        setFileContent(content);
      } catch (e: unknown) {
        setFileContent(`Error reading file: ${e}`);
      }
    } else {
      api.openVaultRelativePath(entry.relativePath);
    }
  };

  const navigateBreadcrumb = (index: number) => {
    if (index < 0) {
      loadDir("");
    } else {
      const target = breadcrumbs.slice(0, index + 1).join("/");
      loadDir(target);
    }
  };

  return (
    <div>
      {/* Breadcrumb */}
      <div style={vaultStyles.breadcrumbRow}>
        <button type="button" style={vaultStyles.breadcrumbBtn} onClick={() => navigateBreadcrumb(-1)}>
          VAULT ROOT
        </button>
        {breadcrumbs.map((seg, i) => (
          <span key={`${seg}-${i}`}>
            <span style={vaultStyles.breadcrumbSep}>/</span>
            <button type="button" style={vaultStyles.breadcrumbBtn} onClick={() => navigateBreadcrumb(i)}>
              {seg.toUpperCase()}
            </button>
          </span>
        ))}
      </div>

      {error && <div style={vaultStyles.errorText}>{error}</div>}
      {loading && <div style={vaultStyles.loadingText}>SCANNING…</div>}

      {viewingFile ? (
        <div style={vaultStyles.fileViewer}>
          <div style={vaultStyles.fileViewerHeader}>
            <span style={vaultStyles.fileViewerPath}>{viewingFile}</span>
            <button type="button" style={vaultStyles.closeBtn} onClick={() => { setFileContent(null); setViewingFile(null); }}>
              ✕ CLOSE
            </button>
          </div>
          <pre style={vaultStyles.fileContent}>{fileContent || "Loading..."}</pre>
        </div>
      ) : (
        <div style={vaultStyles.entryGrid}>
          {entries.map((entry) => (
            <button
              key={entry.relativePath}
              type="button"
              style={entry.isDir ? vaultStyles.dirEntry : vaultStyles.fileEntry}
              onClick={() => openFile(entry)}
            >
              <span style={vaultStyles.entryIcon}>{entry.isDir ? "📁" : "📄"}</span>
              <span style={vaultStyles.entryName}>{entry.name}</span>
              {!entry.isDir && entry.sizeBytes > 0 && (
                <span style={vaultStyles.entrySize}>
                  {entry.sizeBytes < 1024 ? `${entry.sizeBytes}B` : `${Math.round(entry.sizeBytes / 1024)}KB`}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Knowledge() {
  const api = useInvoke();
  const [filter, setFilter] = useState<string>("all");
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"skills" | "vault">("skills");

  const filtered = filter === "all"
    ? SKILL_REGISTRY
    : SKILL_REGISTRY.filter((s) => s.category === filter);

  const productionCount = SKILL_REGISTRY.filter((s) => s.status === "production").length;
  const validatedCount = SKILL_REGISTRY.filter((s) => s.status === "validated").length;

  const openSpec = async (path: string) => {
    setOpeningPath(path);
    try {
      await api.openVaultRelativePath(path);
    } catch {
      // silent
    } finally {
      setOpeningPath(null);
    }
  };

  return (
    <div>
      <h1 style={styles.pageTitle}>KNOWLEDGE</h1>
      <div style={styles.pageTitleBar} />

      {/* Tab bar */}
      <div style={styles.filterRow}>
        <button
          type="button"
          onClick={() => setActiveTab("skills")}
          style={{ ...styles.filterBtn, ...(activeTab === "skills" ? styles.filterBtnActive : {}) }}
        >
          SKILL REGISTRY
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("vault")}
          style={{ ...styles.filterBtn, ...(activeTab === "vault" ? styles.filterBtnActive : {}) }}
        >
          VAULT BROWSER
        </button>
      </div>

      {activeTab === "vault" ? (
        <VaultBrowser />
      ) : (
      <>
      {/* Summary metrics */}
      <div style={styles.metricsRow}>
        <div style={styles.metricPill}>
          <span style={{ color: "var(--lcars-green)", fontWeight: 700 }}>{productionCount}</span>
          <span style={styles.metricPillLabel}>PRODUCTION</span>
        </div>
        <div style={styles.metricPill}>
          <span style={{ color: "var(--lcars-cyan)", fontWeight: 700 }}>{validatedCount}</span>
          <span style={styles.metricPillLabel}>VALIDATED</span>
        </div>
        <div style={styles.metricPill}>
          <span style={{ fontWeight: 700 }}>{SKILL_REGISTRY.length}</span>
          <span style={styles.metricPillLabel}>TOTAL</span>
        </div>
      </div>

      {/* Category filter */}
      <div style={styles.filterRow}>
        <button
          type="button"
          onClick={() => setFilter("all")}
          style={{
            ...styles.filterBtn,
            ...(filter === "all" ? styles.filterBtnActive : {}),
          }}
        >
          ALL
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setFilter(cat)}
            style={{
              ...styles.filterBtn,
              ...(filter === cat ? styles.filterBtnActive : {}),
            }}
          >
            {cat.toUpperCase().replace("-", " ")}
          </button>
        ))}
      </div>

      {/* Skill grid */}
      <div style={styles.skillGrid}>
        {filtered.map((skill) => (
          <div key={skill.id} style={styles.skillCard}>
            <div style={styles.skillHeader}>
              <span style={styles.skillName}>{skill.label.toUpperCase()}</span>
              <span style={{
                ...styles.statusBadge,
                borderColor: statusColor(skill.status),
                color: statusColor(skill.status),
              }}>
                {skill.status.toUpperCase()}
              </span>
            </div>
            <div style={styles.skillMeta}>
              <span style={styles.categoryTag}>{skill.category.toUpperCase()}</span>
              <span style={{ ...styles.rendererTag, color: rendererColor(skill.renderer) }}>
                {skill.renderer.toUpperCase()}
              </span>
            </div>
            <div style={styles.skillId}>{skill.id}</div>
            <button
              type="button"
              onClick={() => openSpec(skill.specPath)}
              disabled={openingPath === skill.specPath}
              style={styles.openBtn}
            >
              {openingPath === skill.specPath ? "OPENING…" : "OPEN SPEC"}
            </button>
          </div>
        ))}
      </div>
      </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageTitle: lcarsPageStyles.pageTitle,
  pageTitleBar: lcarsPageStyles.pageTitleBar,
  metricsRow: {
    display: "flex",
    gap: 16,
    marginBottom: 16,
    flexWrap: "wrap" as const,
  },
  metricPill: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 16px",
    border: "1px solid rgba(153,153,204,0.2)",
    borderRadius: 6,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 14,
    color: "var(--lcars-text, #f0e0c0)",
  },
  metricPillLabel: {
    fontSize: 9,
    letterSpacing: "1px",
    color: "var(--lcars-tan)",
    fontFamily: "'Orbitron', sans-serif",
  },
  filterRow: {
    display: "flex",
    gap: 6,
    marginBottom: 20,
    flexWrap: "wrap" as const,
  },
  filterBtn: {
    padding: "6px 12px",
    fontSize: 10,
    letterSpacing: "1px",
    fontFamily: "'Orbitron', sans-serif",
    color: "var(--lcars-lavender)",
    background: "transparent",
    border: "1px solid rgba(153,153,204,0.25)",
    borderRadius: 4,
    cursor: "pointer",
    transition: "all 0.15s",
  },
  filterBtnActive: {
    color: "var(--lcars-orange)",
    borderColor: "var(--lcars-orange)",
    backgroundColor: "rgba(255,153,0,0.1)",
  },
  skillGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: 14,
  },
  skillCard: {
    padding: "14px 16px",
    background: "linear-gradient(180deg, rgba(23,24,44,0.92), rgba(11,12,24,0.96))",
    border: "1px solid rgba(153,153,204,0.15)",
    borderLeft: "4px solid var(--lcars-cyan)",
    borderRadius: "0 6px 6px 0",
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  },
  skillHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  skillName: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 11,
    letterSpacing: "0.5px",
    color: "var(--lcars-text, #f0e0c0)",
    fontWeight: 600,
  },
  statusBadge: {
    fontSize: 8,
    letterSpacing: "1px",
    padding: "2px 6px",
    border: "1px solid",
    borderRadius: 3,
    fontFamily: "'Orbitron', sans-serif",
    flexShrink: 0,
  },
  skillMeta: {
    display: "flex",
    gap: 8,
    alignItems: "center",
  },
  categoryTag: {
    fontSize: 9,
    letterSpacing: "1px",
    color: "var(--lcars-lavender)",
    fontFamily: "'Orbitron', sans-serif",
  },
  rendererTag: {
    fontSize: 9,
    letterSpacing: "0.5px",
    fontFamily: "'JetBrains Mono', monospace",
  },
  skillId: {
    fontSize: 10,
    color: "var(--lcars-tan)",
    fontFamily: "'JetBrains Mono', monospace",
    opacity: 0.7,
  },
  openBtn: {
    marginTop: 4,
    padding: "5px 10px",
    fontSize: 9,
    letterSpacing: "1px",
    fontFamily: "'Orbitron', sans-serif",
    color: "var(--lcars-orange)",
    background: "transparent",
    border: "1px solid var(--lcars-orange)",
    borderRadius: 3,
    cursor: "pointer",
    alignSelf: "flex-start",
    transition: "background-color 0.15s",
  },
};

const vaultStyles: Record<string, React.CSSProperties> = {
  breadcrumbRow: {
    display: "flex",
    alignItems: "center",
    gap: 2,
    marginBottom: 16,
    flexWrap: "wrap" as const,
  },
  breadcrumbBtn: {
    background: "transparent",
    border: "none",
    color: "var(--lcars-orange)",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    letterSpacing: "0.5px",
    cursor: "pointer",
    padding: "4px 6px",
  },
  breadcrumbSep: {
    color: "var(--lcars-lavender)",
    fontSize: 11,
    margin: "0 2px",
  },
  errorText: {
    color: "var(--lcars-red)",
    fontSize: 12,
    padding: "8px 0",
  },
  loadingText: {
    color: "var(--lcars-yellow)",
    fontSize: 11,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: "1px",
  },
  entryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
    gap: 8,
  },
  dirEntry: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    background: "linear-gradient(180deg, rgba(23,24,44,0.92), rgba(11,12,24,0.96))",
    border: "1px solid rgba(153,153,204,0.2)",
    borderLeft: "4px solid var(--lcars-cyan)",
    borderRadius: "0 6px 6px 0",
    cursor: "pointer",
    textAlign: "left" as const,
  },
  fileEntry: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 14px",
    background: "linear-gradient(180deg, rgba(23,24,44,0.85), rgba(11,12,24,0.9))",
    border: "1px solid rgba(153,153,204,0.1)",
    borderLeft: "3px solid var(--lcars-tan)",
    borderRadius: "0 4px 4px 0",
    cursor: "pointer",
    textAlign: "left" as const,
  },
  entryIcon: { fontSize: 14, flexShrink: 0 },
  entryName: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: "var(--lcars-text, #f0e0c0)",
    flex: 1,
    overflow: "hidden" as const,
    textOverflow: "ellipsis" as const,
    whiteSpace: "nowrap" as const,
  },
  entrySize: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9,
    color: "var(--lcars-lavender)",
    flexShrink: 0,
  },
  fileViewer: {
    border: "1px solid rgba(153,153,204,0.2)",
    borderRadius: 6,
    overflow: "hidden",
  },
  fileViewerHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 14px",
    background: "rgba(23,24,44,0.95)",
    borderBottom: "1px solid rgba(153,153,204,0.15)",
  },
  fileViewerPath: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    color: "var(--lcars-tan)",
  },
  closeBtn: {
    background: "transparent",
    border: "1px solid var(--lcars-red)",
    color: "var(--lcars-red)",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    letterSpacing: "0.5px",
    padding: "3px 8px",
    borderRadius: 3,
    cursor: "pointer",
  },
  fileContent: {
    padding: "12px 16px",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: "var(--lcars-text, #f0e0c0)",
    lineHeight: 1.5,
    maxHeight: 500,
    overflow: "auto",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    background: "rgba(5,5,15,0.9)",
    margin: 0,
  },
};

export default Knowledge;
