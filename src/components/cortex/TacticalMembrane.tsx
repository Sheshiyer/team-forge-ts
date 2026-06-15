import type { CortexCommand, CortexNode, CortexPath, CortexSignal, CortexSignalState } from "../../lib/commandCortex/types";
import type { FounderCommandRun } from "../../lib/types";

export interface TacticalMembraneProps {
  node: CortexNode | null;
  commands: CortexCommand[];
  paths?: CortexPath[];
  signals?: CortexSignal[];
  // Task 3.8 hands these down so MissionCortex typechecks; Task 3.9 adds the
  // render block that shows the live state machine + result panel.
  activeRun?: FounderCommandRun | null;
  activeRunLabel?: string | null;
}

function confidenceFor(state: CortexSignalState): { value: number; label: string; tone: CortexSignalState } {
  switch (state) {
    case "healthy":
      return { value: 96, label: "OPTIMAL", tone: "healthy" };
    case "active":
      return { value: 84, label: "HOLDING", tone: "active" };
    case "pending":
      return { value: 58, label: "JUDGMENT", tone: "pending" };
    case "blocked":
      return { value: 24, label: "INFLAMED", tone: "blocked" };
    case "dormant":
      return { value: 42, label: "DORMANT", tone: "dormant" };
    default:
      return { value: 50, label: "STEADY", tone: "active" };
  }
}

// Happy-path stages rendered as a progression strip. Terminal failure variants
// (failed/partial/cancelled) are flagged via the data-failed attribute on the
// "succeeded" cell so styling can express "the run never reached succeeded".
const RUN_STAGES = ["created", "accepted", "in_progress", "succeeded"] as const;

// Full ordering used for index lookups — failure terminals sit past succeeded
// so isReached only highlights the happy path.
const RUN_TIMELINE: FounderCommandRun["state"][] = [
  "created",
  "accepted",
  "in_progress",
  "succeeded",
  "failed",
  "partial",
  "cancelled",
];

function prettyPrintResult(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export default function TacticalMembrane({
  node,
  commands,
  paths = [],
  signals = [],
  // activeRun / activeRunLabel render the live state machine + result panel
  // below the commands strip while a Worker /v1/commands run is in flight
  // or terminal. MissionCortexPage owns the polling effect.
  activeRun = null,
  activeRunLabel = null,
}: TacticalMembraneProps) {
  if (!node) return null;

  const confidence = confidenceFor(node.state);

  return (
    <aside className="cortex-membrane" aria-label={`${node.label} tactical context`}>
      <svg className="cortex-membrane__grid" aria-hidden="true" preserveAspectRatio="none">
        <defs>
          <pattern id="cortex-membrane-grid" width="22" height="22" patternUnits="userSpaceOnUse">
            <path d="M 22 0 L 0 0 L 0 22" fill="none" stroke="rgba(24, 215, 255, 0.07)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#cortex-membrane-grid)" />
      </svg>

      <div className="cortex-membrane__head">
        <div className="cortex-membrane__kind">
          {node.kind} / {node.state}
        </div>
        <div className="cortex-membrane__confidence" data-state={confidence.tone}>
          <span className="cortex-membrane__confidence-label">{confidence.label}</span>
          <span className="cortex-membrane__confidence-value">{confidence.value}%</span>
        </div>
      </div>

      <h2>{node.label}</h2>
      <div className="cortex-membrane__id">{node.id.toUpperCase()}</div>
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

      <div className="cortex-membrane__divider" aria-hidden="true">
        <span />
        <em>COMMANDS</em>
        <span />
      </div>

      <div className="cortex-membrane__commands">
        {commands.map((command) => (
          <span key={command.id} title={command.description}>
            {command.label}
          </span>
        ))}
      </div>

      {activeRun ? (
        <>
          <div className="cortex-membrane__divider" aria-hidden="true">
            <span />
            <em>ACTIVE COMMAND</em>
            <span />
          </div>
          <div className="cortex-membrane__run">
            <div className="cortex-membrane__run-label">
              {activeRunLabel ?? activeRun.commandId}
            </div>
            <div className="cortex-membrane__run-states">
              {RUN_STAGES.map((stage) => {
                const stageIndex = RUN_STAGES.indexOf(stage);
                const currentIndex = RUN_TIMELINE.indexOf(activeRun.state);
                const isFailed =
                  activeRun.state === "failed" ||
                  activeRun.state === "partial" ||
                  activeRun.state === "cancelled";
                const isReached = !isFailed && stageIndex <= currentIndex;
                const isCurrent = stage === activeRun.state;
                return (
                  <span
                    key={stage}
                    className="cortex-membrane__run-state"
                    data-reached={isReached || undefined}
                    data-current={isCurrent || undefined}
                    data-failed={
                      isFailed && stage === "succeeded" ? "" : undefined
                    }
                  >
                    {stage.replace("_", " ")}
                  </span>
                );
              })}
            </div>
            {activeRun.errorCode ? (
              <div className="cortex-membrane__run-error">
                <strong>{activeRun.errorCode}</strong>:{" "}
                {activeRun.errorMessage ?? "see logs"}
              </div>
            ) : null}
            {activeRun.resultJson && activeRun.state === "succeeded" ? (
              <pre className="cortex-membrane__run-result">
                {prettyPrintResult(activeRun.resultJson)}
              </pre>
            ) : null}
          </div>
        </>
      ) : null}

      <div className="cortex-membrane__divider" aria-hidden="true">
        <span />
        <em>CONNECTED TRACES</em>
        <span />
      </div>

      <div className="cortex-membrane__traces">
        {(signals.length > 0 ? signals : paths.slice(0, 3)).slice(0, 4).map((item) => (
          <div key={item.id} className="cortex-trace-row" data-state={item.state}>
            <span>{"pathId" in item ? item.source : item.kind}</span>
            <strong>{item.label || item.id}</strong>
          </div>
        ))}
        {signals.length === 0 && paths.length === 0 ? (
          <div className="cortex-trace-row" data-state="dormant">
            <span>—</span>
            <strong>No connected traces yet</strong>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
