import type { CortexCommand, CortexCommandId, CortexNode } from "../../lib/commandCortex/types";

export interface CommandRingProps {
  node: CortexNode | null;
  commands: CortexCommand[];
  onCommand?: (commandId: CortexCommand["id"], nodeId: string) => void;
}

function CommandGlyph({ id }: { id: CortexCommandId }) {
  const sw = 1.2;
  switch (id) {
    case "trace-signal":
      return (
        <svg viewBox="-12 -12 24 24" width={14} height={14} aria-hidden="true">
          <path d="M -10 0 H -3 L 0 -6 L 3 6 L 6 0 H 10" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
        </svg>
      );
    case "summon-agent":
      return (
        <svg viewBox="-12 -12 24 24" width={14} height={14} aria-hidden="true">
          <path d="M -8 6 L 0 -8 L 8 6 Z" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinejoin="round" />
          <circle r={2.2} fill="currentColor" />
        </svg>
      );
    case "stabilize-branch":
      return (
        <svg viewBox="-12 -12 24 24" width={14} height={14} aria-hidden="true">
          <circle r={7} fill="none" stroke="currentColor" strokeWidth={sw} />
          <path d="M -4 0 L -1 3 L 5 -3" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "approve-synapse":
      return (
        <svg viewBox="-12 -12 24 24" width={14} height={14} aria-hidden="true">
          <circle cx={-6} cy={0} r={2.4} fill="currentColor" />
          <circle cx={6} cy={0} r={2.4} fill="currentColor" />
          <line x1={-4} y1={0} x2={4} y2={0} stroke="currentColor" strokeWidth={sw} />
        </svg>
      );
    case "escalate-human":
      return (
        <svg viewBox="-12 -12 24 24" width={14} height={14} aria-hidden="true">
          <circle cy={-4} r={3} fill="none" stroke="currentColor" strokeWidth={sw} />
          <path d="M -7 9 Q 0 0 7 9" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
        </svg>
      );
    case "split-pathway":
      return (
        <svg viewBox="-12 -12 24 24" width={14} height={14} aria-hidden="true">
          <path d="M 0 -8 V -2 M 0 -2 L -7 8 M 0 -2 L 7 8" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
        </svg>
      );
    case "extract-memory":
      return (
        <svg viewBox="-12 -12 24 24" width={14} height={14} aria-hidden="true">
          <ellipse rx={8} ry={5} fill="none" stroke="currentColor" strokeWidth={sw} />
          <line x1={0} y1={-2} x2={0} y2={8} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
          <path d="M -3 5 L 0 8 L 3 5" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "route-work":
      return (
        <svg viewBox="-12 -12 24 24" width={14} height={14} aria-hidden="true">
          <path d="M -8 0 H 4 M 4 0 L 0 -4 M 4 0 L 0 4" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={-9} cy={0} r={1.6} fill="currentColor" />
        </svg>
      );
    case "generate-brief":
      return (
        <svg viewBox="-12 -12 24 24" width={14} height={14} aria-hidden="true">
          <rect x={-6} y={-8} width={12} height={16} fill="none" stroke="currentColor" strokeWidth={sw} />
          <line x1={-3} y1={-3} x2={3} y2={-3} stroke="currentColor" strokeWidth={sw} />
          <line x1={-3} y1={0} x2={3} y2={0} stroke="currentColor" strokeWidth={sw} />
          <line x1={-3} y1={3} x2={1} y2={3} stroke="currentColor" strokeWidth={sw} />
        </svg>
      );
    case "quarantine-risk":
      return (
        <svg viewBox="-12 -12 24 24" width={14} height={14} aria-hidden="true">
          <circle r={8} fill="none" stroke="currentColor" strokeWidth={sw} strokeDasharray="2 2" />
          <line x1={-4} y1={-4} x2={4} y2={4} stroke="currentColor" strokeWidth={sw} />
          <line x1={4} y1={-4} x2={-4} y2={4} stroke="currentColor" strokeWidth={sw} />
        </svg>
      );
    default:
      return (
        <svg viewBox="-12 -12 24 24" width={14} height={14} aria-hidden="true">
          <circle r={5} fill="none" stroke="currentColor" strokeWidth={sw} />
        </svg>
      );
  }
}

export default function CommandRing({ node, commands, onCommand }: CommandRingProps) {
  if (!node) return null;

  const n = Math.max(commands.length, 1);
  const radius = 134;
  const ringDiameter = 92;

  return (
    <div
      className="cortex-command-ring"
      style={{ left: `${(node.position.x / 1000) * 100}%`, top: `${(node.position.y / 680) * 100}%` }}
      aria-label={`${node.label} command ring`}
    >
      <svg className="cortex-command-ring__spokes" aria-hidden="true">
        {commands.map((_, i) => {
          const angle = (i * Math.PI * 2) / n - Math.PI / 2;
          const x1 = Math.cos(angle) * (ringDiameter / 2 + 4);
          const y1 = Math.sin(angle) * (ringDiameter / 2 + 4);
          const x2 = Math.cos(angle) * (radius - 14);
          const y2 = Math.sin(angle) * (radius - 14);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}
      </svg>
      <div className="cortex-command-ring__inner" aria-hidden="true" />
      <div className="cortex-command-ring__inner cortex-command-ring__inner--outer" aria-hidden="true" />
      {commands.map((command, i) => {
        const angleDeg = (i * 360) / n - 90;
        return (
          <button
            key={command.id}
            type="button"
            title={command.description}
            style={{
              transform: `rotate(${angleDeg}deg) translate(${radius}px) rotate(${-angleDeg}deg)`,
            }}
            onClick={() => onCommand?.(command.id, node.id)}
          >
            <span className="cortex-command-ring__glyph" aria-hidden="true">
              <CommandGlyph id={command.id} />
            </span>
            <span className="cortex-command-ring__label">{command.label}</span>
          </button>
        );
      })}
    </div>
  );
}
