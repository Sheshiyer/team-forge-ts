export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ success: boolean; meta?: { changes?: number } }>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
}

export interface R2BucketLike {
  head(key: string): Promise<unknown | null>;
}

export interface QueueLike<T> {
  send(message: T): Promise<void>;
}

export interface QueueMessageLike<T> {
  readonly id: string;
  readonly body: T;
  readonly attempts: number;
  readonly timestamp?: Date;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

export interface QueueBatchLike<T> {
  readonly queue: string;
  readonly messages: QueueMessageLike<T>[];
  ackAll?(): void;
  retryAll?(options?: { delaySeconds?: number }): void;
}

export interface DurableObjectStateLike {
  id?: {
    toString(): string;
  };
}

export interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): {
    fetch(input: Request | string, init?: RequestInit): Promise<Response>;
  };
}

export interface SyncJobMessage {
  schema: "teamforge.sync-job.v1";
  jobId: string;
  workspaceId: string;
  projectId: string;
  source: "clockify" | "github" | "huly" | "slack";
  jobType: "project_sync";
  requestedAt: string;
}

export interface LegacyTeamSnapshotMessage {
  jobId: string;
  workspaceId: string;
  source: "huly";
  jobType: "team_snapshot";
}

export interface Env {
  TF_ENV: string;
  TF_API_BASE_URL?: string;
  TF_DEFAULT_OTA_CHANNEL?: string;
  // Credential-handout echo check ONLY (routes/credentials.ts): the desktop app's
  // ?audience= query param must match this value. NOT used for JWT verification.
  TF_ACCESS_AUDIENCE?: string;
  // Cloudflare Access JWT verification (lib/access.ts) — live since WS5. TEAM_DOMAIN is the
  // Access org domain; AUD is a comma-separated list of allowed application AUDs (plexus-api +
  // forge apps). Unsetting both reverts verifyAccessJwt to a no-op (Bearer-era behavior).
  TF_ACCESS_TEAM_DOMAIN?: string;
  TF_ACCESS_AUD?: string;
  TF_CLOCKIFY_API_TOKEN_GLOBAL?: string;
  TF_HULY_USER_TOKEN_GLOBAL?: string;
  TF_SLACK_BOT_TOKEN_GLOBAL?: string;
  TF_GITHUB_TOKEN_GLOBAL?: string;
  // GitHub App control plane. These values are secrets except app id, slug,
  // client id, and callback URL. Private key material never leaves the Worker.
  TF_GITHUB_APP_ID?: string;
  TF_GITHUB_APP_SLUG?: string;
  TF_GITHUB_APP_PRIVATE_KEY?: string;
  TF_GITHUB_APP_CLIENT_ID?: string;
  TF_GITHUB_APP_CLIENT_SECRET?: string;
  TF_GITHUB_APP_CALLBACK_URL?: string;
  TF_GITHUB_APP_WEBHOOK_SECRET?: string;
  TF_GITHUB_APP_STATE_SIGNING_SECRET?: string;
  // Non-secret installation and actor policies. Account entries are
  // Type:login:numeric-id; actor entries are login:numeric-user-id.
  // Durable authority always includes the immutable numeric GitHub ID.
  TF_GITHUB_ALLOWED_INSTALLATION_ACCOUNTS?: string;
  TF_GITHUB_ALLOWED_ACTORS?: string;
  TF_INTEGRATION_CONFIG_JSON?: string;
  TF_CREDENTIAL_ENVELOPE_KEY?: string;
  TF_WEBHOOK_HMAC_SECRET?: string;
  TF_RELEASE_PUBLISH_TOKEN?: string;
  // Dedicated, read-only weekly reporting boundary. This bearer is not shared
  // with app, credential handout, webhook, or temporary bridge routes.
  TF_REPORTING_READ_TOKEN?: string;
  // Server-owned scope for the weekly reporting route. Callers cannot select
  // or override a workspace.
  TF_REPORTING_WORKSPACE_ID?: string;
  TEAMFORGE_DB?: D1DatabaseLike;
  TEAMFORGE_ARTIFACTS?: R2BucketLike;
  SYNC_QUEUE?: QueueLike<SyncJobMessage | LegacyTeamSnapshotMessage>;
  WORKSPACE_LOCKS?: DurableObjectNamespaceLike;
  // Temporary internal shared secret for m2m calls (e.g. parity, Hermes) when CF Access service tokens have compatibility issues with Worker routes.
  // Used as alternative to TF_CREDENTIAL_ENVELOPE_KEY for app routes. Caller sends header "X-TeamForge-Internal-Secret".
  // Requires the request to pass the Access policy (e.g. via IP bypass on allowed machines).
  TF_INTERNAL_SHARED_SECRET?: string;
  // Phase 7: Paperclip repo root for per-member provisioning
  TF_PAPERCLIP_REPO_ROOT?: string;

  // Phase 3: Paperclip dedicated-agent listener (remote-safe).
  // Paperclip remote-safe agent endpoint base URL. e.g. https://paperclip.thoughtseed.space
  PAPERCLIP_REMOTE_BASE_URL?: string;
  // JSON object mapping agent_id → bearer token. Configured via wrangler secret put.
  // Matches the PAPERCLIP_AGENT_TOKENS env on the Paperclip listener.
  PAPERCLIP_AGENT_TOKEN_MAP?: string;

  // Phase 14: Cloudflare Realtime broker. Media transport stays with
  // Cloudflare; TeamForge only brokers app state and session metadata.
  CF_REALTIME_APP_ID?: string;
  CF_REALTIME_API_TOKEN?: string;
  CF_REALTIME_APP_TOKEN?: string;
  CF_REALTIME_API_BASE_URL?: string;
}
