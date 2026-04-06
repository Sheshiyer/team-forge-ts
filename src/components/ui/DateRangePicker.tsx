import type { DateRange } from "../../stores/appStore";

const options: { value: DateRange; label: string }[] = [
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "quarter", label: "This Quarter" },
  { value: "year", label: "This Year" },
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
              ? { borderRight: "1px solid var(--border-standard)" }
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
    border: "1px solid var(--border-standard)",
    borderRadius: "var(--radius-md)",
    overflow: "hidden",
  },
  pill: {
    background: "rgba(255,255,255,0.02)",
    border: "none",
    color: "var(--text-tertiary)",
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: 510,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
    transition: "background 0.15s, color 0.15s",
    whiteSpace: "nowrap",
  },
  pillActive: {
    background: "var(--bg-hover)",
    color: "var(--text-primary)",
  },
};

export default DateRangePicker;
