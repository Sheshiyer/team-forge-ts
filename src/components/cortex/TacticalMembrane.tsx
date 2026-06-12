import type { CortexCommand, CortexNode, CortexPath, CortexSignal } from "../../lib/commandCortex/types";

export interface TacticalMembraneProps {
  node: CortexNode | null;
  commands: CortexCommand[];
  paths?: CortexPath[];
  signals?: CortexSignal[];
}

export default function TacticalMembrane({ node, commands, paths = [], signals = [] }: TacticalMembraneProps) {
  if (!node) return null;

  return (
    <aside className="cortex-membrane" aria-label={`${node.label} tactical context`}>
      <div className="cortex-membrane__kind">{node.kind} / {node.state}</div>
      <h2>{node.label}</h2>
      <p>{node.summary ?? "No tactical summary available yet."}</p>
      {node.metrics && node.metrics.length > 0 ? (
        <dl className="cortex-membrane__metrics">
          {node.metrics.map((metric) => (
            <div key={metric.label} data-state={metric.state ?? node.state}>
              <dt>{metric.label}</dt>
              <dd>{metric.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="cortex-membrane__commands">
        {commands.map((command) => (
          <span key={command.id} title={command.description}>{command.label}</span>
        ))}
      </div>
      <div className="cortex-membrane__traces">
        <div className="cortex-membrane__section-label">Connected traces</div>
        {(signals.length > 0 ? signals : paths.slice(0, 3)).slice(0, 4).map((item) => (
          <div key={item.id} className="cortex-trace-row" data-state={item.state}>
            <span>{"pathId" in item ? item.source : item.kind}</span>
            <strong>{item.label || item.id}</strong>
          </div>
        ))}
      </div>
    </aside>
  );
}
