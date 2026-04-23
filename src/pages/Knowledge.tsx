import { useState, useEffect, useCallback } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";
import { SkeletonCard } from "../components/ui/Skeleton";
import type { KnowledgeArticleView } from "../lib/types";

const CATEGORIES = [
  "All",
  "SOP",
  "Technical Guide",
  "Resource Link",
  "Tool Discovery",
  "Playbook",
  "FAQ",
  "Client Doc",
] as const;

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 2,
        backgroundColor: "transparent",
        border: "1px solid var(--lcars-lavender)",
        color: "var(--lcars-lavender)",
        fontSize: 10,
        fontWeight: 600,
        fontFamily: "'Orbitron', sans-serif",
        lineHeight: "18px",
        letterSpacing: "1px",
        textTransform: "uppercase" as const,
      }}
    >
      {category.toUpperCase()}
    </span>
  );
}

function TagPill({ tag }: { tag: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 8px",
        borderRadius: 2,
        background: "rgba(102,136,204,0.12)",
        color: "var(--lcars-blue)",
        fontSize: 10,
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: "0.5px",
      }}
    >
      {tag}
    </span>
  );
}

function Knowledge() {
  const api = useInvoke();
  const [articles, setArticles] = useState<KnowledgeArticleView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getKnowledgeArticles();
      setArticles(data);
      setLoadError(null);
    } catch {
      setLoadError(
        "KNOWLEDGE ARTICLES UNAVAILABLE.",
      );
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
        <h1 style={styles.pageTitle}>KNOWLEDGE BASE</h1>
        <div style={styles.pageTitleBar} />
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  // Collect all unique tags
  const allTags = Array.from(
    new Set(articles.flatMap((a) => a.tags))
  ).sort();

  // Client-side filtering
  const searchLower = search.toLowerCase();
  const filtered = articles.filter((a) => {
    if (activeCategory !== "All" && a.category !== activeCategory) return false;
    if (activeTags.size > 0 && !a.tags.some((t) => activeTags.has(t))) return false;
    if (
      searchLower &&
      !a.title.toLowerCase().includes(searchLower) &&
      !a.contentPreview.toLowerCase().includes(searchLower)
    )
      return false;
    return true;
  });

  const toggleTag = (tag: string) => {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  return (
    <div>
      <h1 style={styles.pageTitle}>KNOWLEDGE BASE</h1>
      <div style={styles.pageTitleBar} />

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="SEARCH ARTICLES..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.input}
        />
      </div>

      {/* Category filter pills */}
      <div style={styles.buttonRow}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              ...lcarsPageStyles.ghostButton,
              padding: "6px 14px",
              fontSize: 10,
              border:
                activeCategory === cat
                  ? "1px solid var(--lcars-orange)"
                  : "1px solid rgba(153, 153, 204, 0.25)",
              color:
                activeCategory === cat
                  ? "var(--lcars-orange)"
                  : "var(--lcars-lavender)",
              background:
                activeCategory === cat
                  ? "rgba(255, 153, 0, 0.08)"
                  : "rgba(10, 10, 20, 0.68)",
            }}
          >
            {cat.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Tag filter pills */}
      {allTags.length > 0 && (
        <div style={{ ...styles.buttonRow, marginBottom: 20 }}>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              style={{
                ...lcarsPageStyles.ghostButton,
                padding: "4px 10px",
                fontSize: 9,
                borderRadius: "0 10px 10px 0",
                border: activeTags.has(tag)
                  ? "1px solid var(--lcars-cyan)"
                  : "1px solid rgba(153, 153, 204, 0.18)",
                color: activeTags.has(tag)
                  ? "var(--lcars-cyan)"
                  : "var(--text-quaternary)",
                background: activeTags.has(tag)
                  ? "rgba(0, 204, 255, 0.06)"
                  : "rgba(10, 10, 20, 0.5)",
              }}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Article list */}
      {loadError ? (
        <div style={styles.card}>
          <p style={styles.emptyText}>{loadError}</p>
        </div>
      ) : articles.length === 0 ? (
        <div style={styles.card}>
          <p style={styles.emptyText}>NO KNOWLEDGE ARTICLES.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={styles.card}>
          <p style={styles.emptyText}>NO ARTICLES MATCH THE CURRENT SEARCH OR FILTERS.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map((article) => {
            const isExpanded = expandedId === article.id;
            return (
              <div
                key={article.id}
                style={styles.articleCard}
                onClick={() => setExpandedId(isExpanded ? null : article.id)}
              >
                {/* Header row */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      color: "var(--lcars-orange)",
                      fontWeight: 600,
                      fontSize: 14,
                      cursor: "pointer",
                    }}
                  >
                    {article.title}
                  </div>
                  <CategoryBadge category={article.category} />
                </div>

                {/* Meta row */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    marginBottom: 8,
                    fontSize: 11,
                    color: "var(--text-quaternary)",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  <span>
                    {article.author ?? "UNKNOWN"}
                  </span>
                  <span>UPDATED {formatDate(article.updatedAt)}</span>
                </div>

                {/* Tags */}
                {article.tags.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      flexWrap: "wrap" as const,
                      marginBottom: 8,
                    }}
                  >
                    {article.tags.map((tag) => (
                      <TagPill key={tag} tag={tag} />
                    ))}
                  </div>
                )}

                {/* Preview / expanded content */}
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--lcars-tan)",
                    lineHeight: 1.6,
                    letterSpacing: "0.3px",
                    whiteSpace: isExpanded ? "pre-wrap" : "normal",
                    overflow: isExpanded ? "visible" : "hidden",
                    display: isExpanded ? "block" : "-webkit-box",
                    WebkitLineClamp: isExpanded ? undefined : 2,
                    WebkitBoxOrient: isExpanded ? undefined : ("vertical" as const),
                  }}
                >
                  {isExpanded && article.content
                    ? article.content
                    : article.contentPreview}
                </div>

                {/* Expand hint */}
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 10,
                    color: "var(--lcars-lavender)",
                    fontFamily: "'Orbitron', sans-serif",
                    letterSpacing: "1px",
                    cursor: "pointer",
                  }}
                >
                  {isExpanded ? "▲ COLLAPSE" : "▼ EXPAND"}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageTitle: lcarsPageStyles.pageTitle,
  pageTitleBar: lcarsPageStyles.pageTitleBar,
  card: {
    ...lcarsPageStyles.card,
    borderLeftColor: "var(--lcars-blue)",
  },
  articleCard: {
    ...lcarsPageStyles.subtleCard,
    cursor: "pointer",
    transition: "border-color 0.2s ease",
  },
  input: lcarsPageStyles.input,
  buttonRow: lcarsPageStyles.buttonRow,
  emptyText: lcarsPageStyles.emptyText,
};

export default Knowledge;
