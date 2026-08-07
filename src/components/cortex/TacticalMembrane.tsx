import type { CortexCommand, CortexNode, CortexPath, CortexSignal, CortexSignalState } from "../../lib/commandCortex/types";
import { extractTsStatusFounderSummary } from "../../lib/commandRuns/tsStatus";
import type { FounderCommandAuditEvent, FounderCommandRun } from "../../lib/types";

export interface TacticalMembraneProps {
  node: CortexNode | null;
  commands: CortexCommand[];
  paths?: CortexPath[];
  signals?: CortexSignal[];
  // Task 3.8 hands these down so MissionCortex typechecks; Task 3.9 adds the
  // render block that shows the live state machine + result panel.
  activeRun?: FounderCommandRun | null;
  activeRunLabel?: string | null;
  recentRuns?: FounderCommandRun[];
  commandRunState?: FounderCommandRun["state"];
  commandRunError?: string | null;
  selectedCommandRunId?: string | null;
  commandRunAudit?: FounderCommandAuditEvent[];
  commandRunAuditError?: string | null;
  onSelectCommandRunState?: (state: FounderCommandRun["state"]) => void;
  onSelectCommandRun?: (runId: string) => void;
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

const COMMAND_RUN_FILTERS: FounderCommandRun["state"][] = [
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

function stateLabel(state: FounderCommandRun["state"]): string {
  return state.replace(/_/g, " ");
}

function compactRunId(id: string): string {
  return id.length > 16 ? `${id.slice(0, 16)}...` : id;
}

function formatEpochTime(value: number | null): string {
  if (!value) return "pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "pending";
  return date.toISOString().slice(11, 19);
}

function summarizeJson(raw: string | null): string | null {
  const founderSummary = extractTsStatusFounderSummary(raw);
  if (founderSummary) {
    return founderSummary.split("\n").slice(0, 2).join(" / ");
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      const keys = Object.keys(record).slice(0, 4);
      if (keys.length > 0) {
        return keys.map((key) => `${key}:${String(record[key]).slice(0, 24)}`).join(" / ");
      }
    }
    return JSON.stringify(parsed).slice(0, 96);
  } catch {
    return raw.slice(0, 96);
  }
}

function extractFirstUrl(raw: string | null): string | null {
  if (!raw) return null;
  return raw.match(/https?:\/\/[^\s"'<>)]+/)?.[0] ?? null;
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
  recentRuns = [],
  commandRunState = "created",
  commandRunError = null,
  selectedCommandRunId = null,
  commandRunAudit = [],
  commandRunAuditError = null,
  onSelectCommandRunState,
  onSelectCommandRun,
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
                    {stateLabel(stage)}
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
                {extractTsStatusFounderSummary(activeRun.resultJson) ?? prettyPrintResult(activeRun.resultJson)}
              </pre>
            ) : null}
          </div>
        </>
      ) : null}

      <div className="cortex-membrane__divider" aria-hidden="true">
        <span />
        <em>RUN HISTORY</em>
        <span />
      </div>

      <div className="cortex-membrane__run-console">
        <div className="cortex-membrane__run-filters" aria-label="Command run state">
          {COMMAND_RUN_FILTERS.map((state) => (
            <button
              key={state}
              type="button"
              data-active={state === commandRunState || undefined}
              onClick={() => onSelectCommandRunState?.(state)}
            >
              {stateLabel(state)}
            </button>
          ))}
        </div>
        {commandRunError ? (
          <div className="cortex-command-run-row" data-state="blocked">
            <span>error</span>
            <strong>{commandRunError}</strong>
          </div>
        ) : null}
        {!commandRunError && recentRuns.length === 0 ? (
          <div className="cortex-command-run-row" data-state="dormant">
            <span>{stateLabel(commandRunState)}</span>
            <strong>No runs</strong>
          </div>
        ) : null}
        {!commandRunError
          ? recentRuns.slice(0, 5).map((run) => {
              const resultUrl = extractFirstUrl(run.resultJson);
              const resultSummary = summarizeJson(run.resultJson);
              return (
              <button
                key={run.id}
                type="button"
                className="cortex-command-run-row"
                data-state={run.state}
                data-selected={run.id === selectedCommandRunId || undefined}
                onClick={() => onSelectCommandRun?.(run.id)}
              >
                <span>{stateLabel(run.state)}</span>
                <strong>{run.commandId}</strong>
                <small>
                  {compactRunId(run.id)} / {formatEpochTime(run.requestedAt)}
                </small>
                {run.targetId ? (
                  <em>
                    {run.targetKind ?? "target"} / {run.targetId}
                  </em>
                ) : null}
                {run.errorCode ? <em>{run.errorCode}</em> : null}
                {resultSummary ? <em>{resultSummary}</em> : null}
                {resultUrl ? (
                  <a href={resultUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                    result link
                  </a>
                ) : null}
              </button>
              );
            })
          : null}
        {selectedCommandRunId ? (
          <div className="cortex-command-audit" aria-label="Command audit trail">
            <div className="cortex-command-audit__head">
              <span>{compactRunId(selectedCommandRunId)}</span>
              <strong>{commandRunAudit.length} events</strong>
            </div>
            {commandRunAuditError ? (
              <div className="cortex-command-audit__event" data-state="blocked">
                <span>error</span>
                <strong>{commandRunAuditError}</strong>
              </div>
            ) : null}
            {!commandRunAuditError && commandRunAudit.length === 0 ? (
              <div className="cortex-command-audit__event" data-state="dormant">
                <span>pending</span>
                <strong>No audit events</strong>
              </div>
            ) : null}
            {!commandRunAuditError
              ? commandRunAudit.slice(0, 8).map((event) => {
                  const payloadSummary = summarizeJson(event.payloadJson);
                  const payloadUrl = extractFirstUrl(event.payloadJson);
                  return (
                    <div key={event.id} className="cortex-command-audit__event">
                      <span>{formatEpochTime(event.occurredAt)}</span>
                      <strong>{event.kind}</strong>
                      {event.actorKind || event.actorId ? (
                        <small>
                          {event.actorKind ?? "actor"} / {event.actorId ?? "unknown"}
                        </small>
                      ) : null}
                      {payloadSummary ? <em>{payloadSummary}</em> : null}
                      {payloadUrl ? (
                        <a href={payloadUrl} target="_blank" rel="noreferrer">
                          audit link
                        </a>
                      ) : null}
                    </div>
                  );
                })
              : null}
          </div>
        ) : null}
      </div>

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
