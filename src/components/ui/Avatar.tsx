function Avatar({
  name,
  size = 28,
  src,
}: {
  name: string;
  size?: number;
  src?: string | null;
}) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const hue =
    name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          border: "2px solid var(--lcars-orange)",
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: `hsl(${hue}, 40%, 20%)`,
        border: "2px solid var(--lcars-orange)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.35,
        fontWeight: 600,
        fontFamily: "'Orbitron', sans-serif",
        color: "var(--lcars-orange)",
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

export default Avatar;
