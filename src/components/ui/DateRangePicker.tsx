import type { DateRange } from "../../stores/appStore";

const options: { value: DateRange; label: string }[] = [
  { value: "week", label: "WEEK" },
  { value: "month", label: "MONTH" },
  { value: "quarter", label: "QTR" },
  { value: "year", label: "YEAR" },
];

function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (v: DateRange) => void;
}) {
  return (
    <div style={styles.group}>
      {options.map((opt, i) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            ...styles.pill,
            ...(value === opt.value ? styles.pillActive : {}),
            ...(i < options.length - 1
              ? { borderRight: "1px solid rgba(255, 153, 0, 0.2)" }
              : {}),
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  group: {
    display: "flex",
    border: "1px solid rgba(255, 153, 0, 0.35)",
    borderRadius: "0 14px 14px 0",
    overflow: "hidden",
    background: "rgba(10, 10, 20, 0.82)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
  },
  pill: {
    background: "transparent",
    border: "none",
    color: "var(--lcars-lavender)",
    padding: "6px 12px",
    fontSize: 10,
    fontWeight: 600,
    fontFamily: "'Orbitron', sans-serif",
    cursor: "pointer",
    transition: "background 0.15s, color 0.15s, box-shadow 0.15s",
    whiteSpace: "nowrap",
    letterSpacing: "1.2px",
    textTransform: "uppercase" as const,
  },
  pillActive: {
    background: "linear-gradient(90deg, var(--lcars-orange), #ffb347)",
    color: "#000",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18)",
  },
};

export default DateRangePicker;
