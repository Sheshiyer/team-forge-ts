export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ success: boolean }>;
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
  jobId: string;
  workspaceId: string;
  source: "clockify" | "github" | "huly" | "slack";
  jobType: string;
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
  TF_INTEGRATION_CONFIG_JSON?: string;
  TF_CREDENTIAL_ENVELOPE_KEY?: string;
  TF_WEBHOOK_HMAC_SECRET?: string;
  TF_RELEASE_PUBLISH_TOKEN?: string;
  TEAMFORGE_DB?: D1DatabaseLike;
  TEAMFORGE_ARTIFACTS?: R2BucketLike;
  SYNC_QUEUE?: QueueLike<SyncJobMessage>;
  WORKSPACE_LOCKS?: DurableObjectNamespaceLike;
  // MultiCA (AI gateway + agent backend) — 2026-06-09 architecture
  MULTICA_API_URL?: string;      // e.g. http://a2d8a7ed58f172583.awsglobalaccelerator.com
  MULTICA_APP_URL?: string;      // e.g. https://multica.thoughtseed.space
  MULTICA_WORKSPACE_ID?: string; // e.g. e0ffc9e2-7848-447f-933f-cc743deedfd0
  // HMAC-SHA256 shared secret used to sign + verify MultiCA callback envelopes.
  // Set via `pnpm -C cloudflare/worker exec wrangler secret put MULTICA_CALLBACK_SHARED_SECRET`.
  // Absence forces 503 server_misconfigured on the callback route.
  MULTICA_CALLBACK_SHARED_SECRET?: string;

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

  // Founder secrets vault — AES-256-GCM envelope key.
  // base64 of a 32-byte key. WORKER SECRET ONLY — never set as a plain var.
  // Pre-provisioned for feat/founder-secrets-zero-disk (routes/secrets.ts + SECRETS_KV binding).
  // Do NOT delete: the live secret is active; the consuming code lands on that branch merge.
  TF_SECRETS_MASTER_KEY?: string;
}
