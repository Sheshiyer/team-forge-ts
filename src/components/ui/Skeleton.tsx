function Skeleton({
  width,
  height = 16,
  radius = 0,
}: {
  width?: number | string;
  height?: number;
  radius?: number;
}) {
  return (
    <div
      style={{
        width: width ?? "100%",
        height,
        borderRadius: radius,
        background:
          "linear-gradient(90deg, rgba(255,153,0,0.03) 25%, rgba(255,153,0,0.08) 50%, rgba(255,153,0,0.03) 75%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.5s infinite",
      }}
    />
  );
}

function SkeletonTable({
  rows = 5,
  cols = 4,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: "flex", gap: 16 }}>
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} height={14} width={j === 0 ? 120 : 60} />
          ))}
        </div>
      ))}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      style={{
        background: "rgba(26, 26, 46, 0.5)",
        borderLeft: "4px solid rgba(255, 153, 0, 0.2)",
        padding: 24,
      }}
    >
      <Skeleton width={100} height={12} />
      <div style={{ marginTop: 12 }}>
        <Skeleton width={80} height={32} />
      </div>
    </div>
  );
}

export { Skeleton, SkeletonTable, SkeletonCard };
