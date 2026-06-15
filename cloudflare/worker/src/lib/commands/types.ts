/** All actor kinds that can issue or receive commands. */
export type ActorKind =
  | "founder"
  | "cofounder"
  | "employee"
  | "multica_service"
  | "paperclip_agent";

/** Auth modes by which an actor is verified at intake time. */
export type AuthMode =
  | "cf_access"        // Cloudflare Access JWT (verified upstream)
  | "m2m"              // TF_INTERNAL_SHARED_SECRET
  | "app_bearer"       // TF_CREDENTIAL_ENVELOPE_KEY (user app)
  | "aws_task_role"    // MultiCA ECS task role calling back
  | "paperclip_token"; // Paperclip dedicated-agent token

/** State machine for command runs. */
export type CommandRunState =
  | "created"
  | "accepted"
  | "in_progress"
  | "succeeded"
  | "failed"
  | "partial"
  | "cancelled";

/** Audit event taxonomy — every state transition emits one or more of these. */
export type AuditEventKind =
  | "command_received"
  | "run_created"
  | "downstream_agent_contacted"
  | "downstream_agent_responded"
  | "result_received"
  | "result_delivered"
  | "failure"
  | "partial_failure"
  | "cancelled";

/** What the caller sends to /v1/commands/intent. */
export interface CommandIntent {
  /** Canonical command ID — must exist in registry. e.g. "ts-standup", "ts-summon-agent". */
  id: string;
  actor_id: string;
  actor_kind: ActorKind;
  auth_mode: AuthMode;
  /** What the command targets — usually a node in the cortex (project/client/agent). */
  target_kind?: string;
  target_id?: string;
  /** Idempotency / tracing. Caller may set; server backfills if missing. */
  correlation_id: string;
  /** Command-specific payload, validated against registry schema. */
  payload: Record<string, unknown>;
}

/** What the Worker stores. */
export interface CommandRun {
  id: string;
  command_id: string;
  actor_id: string;
  actor_kind: ActorKind;
  auth_mode: AuthMode;
  state: CommandRunState;
  target_kind: string | null;
  target_id: string | null;
  correlation_id: string;
  requested_at: number;
  accepted_at: number | null;
  completed_at: number | null;
  result_json: string | null;
  error_code: string | null;
  error_message: string | null;
}

/** Audit event row. */
export interface AuditEvent {
  id: string;
  run_id: string;
  kind: AuditEventKind;
  actor_id: string | null;
  actor_kind: ActorKind | null;
  payload_json: string | null;
  occurred_at: number;
}
