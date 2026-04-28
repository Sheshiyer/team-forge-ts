import { lcarsPageStyles } from "../lib/lcarsPageStyles";

function Knowledge() {
  return (
    <div>
      <h1 style={styles.pageTitle}>KNOWLEDGE</h1>
      <div style={styles.pageTitleBar} />

      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>CANONICAL SOURCE REQUIRED</h2>
        <div style={styles.sectionDivider} />
        <p style={styles.bodyText}>
          THIS ROUTE STAYS HIDDEN UNTIL TEAMFORGE HAS A REAL KNOWLEDGE CONTRACT
          INSTEAD OF HEURISTIC HULY DOCUMENT INFERENCE.
        </p>
        <p style={styles.helperText}>
          KEEP DEEP LINKS POINTING HERE FOR NOW, BUT TREAT THIS AS A HOLDING
          SURFACE RATHER THAN A LIVE MODULE.
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageTitle: lcarsPageStyles.pageTitle,
  pageTitleBar: lcarsPageStyles.pageTitleBar,
  card: {
    ...lcarsPageStyles.card,
    borderLeftColor: "var(--lcars-lavender)",
  },
  sectionTitle: lcarsPageStyles.sectionTitle,
  sectionDivider: lcarsPageStyles.sectionDivider,
  bodyText: {
    fontSize: 13,
    lineHeight: 1.7,
    color: "var(--lcars-tan)",
    margin: 0,
  },
  helperText: {
    ...lcarsPageStyles.helperText,
    marginTop: 12,
    maxWidth: 620,
  },
};

export default Knowledge;
