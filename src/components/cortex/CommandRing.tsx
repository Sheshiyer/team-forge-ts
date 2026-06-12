import type { CortexCommand, CortexNode } from "../../lib/commandCortex/types";

export interface CommandRingProps {
  node: CortexNode | null;
  commands: CortexCommand[];
  onCommand?: (commandId: CortexCommand["id"], nodeId: string) => void;
}

export default function CommandRing({ node, commands, onCommand }: CommandRingProps) {
  if (!node) return null;

  return (
    <div
      className="cortex-command-ring"
      style={{ left: `${(node.position.x / 1000) * 100}%`, top: `${(node.position.y / 680) * 100}%` }}
      aria-label={`${node.label} command ring`}
    >
      {commands.map((command, index) => (
        <button
          key={command.id}
          type="button"
          style={{ transform: `rotate(${index * (360 / Math.max(commands.length, 1))}deg) translate(116px) rotate(-${index * (360 / Math.max(commands.length, 1))}deg)` }}
          onClick={() => onCommand?.(command.id, node.id)}
        >
          {command.label}
        </button>
      ))}
    </div>
  );
}
