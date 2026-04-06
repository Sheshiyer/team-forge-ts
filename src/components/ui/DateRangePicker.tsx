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
    border: "1px solid rgba(255, 153, 0, 0.3)",
    borderRadius: 2,
    overflow: "hidden",
  },
  pill: {
    background: "transparent",
    border: "none",
    color: "var(--lcars-lavender)",
    padding: "4px 12px",
    fontSize: 10,
    fontWeight: 600,
    fontFamily: "'Orbitron', sans-serif",
    cursor: "pointer",
    transition: "background 0.15s, color 0.15s",
    whiteSpace: "nowrap",
    letterSpacing: "1px",
    textTransform: "uppercase" as const,
  },
  pillActive: {
    background: "var(--lcars-orange)",
    color: "#000",
  },
};

export default DateRangePicker;
