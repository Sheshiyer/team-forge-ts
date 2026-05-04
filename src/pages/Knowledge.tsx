import { useState } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";

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

function Knowledge() {
  const api = useInvoke();
  const [filter, setFilter] = useState<string>("all");
  const [openingPath, setOpeningPath] = useState<string | null>(null);

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
      <h1 style={styles.pageTitle}>SKILL REGISTRY</h1>
      <div style={styles.pageTitleBar} />

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

export default Knowledge;
