export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
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
  TF_ACCESS_AUDIENCE?: string;
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

  // Temporary internal shared secret for m2m calls (e.g. parity, Hermes) when CF Access service tokens have compatibility issues with Worker routes.
  // Used as alternative to TF_CREDENTIAL_ENVELOPE_KEY for app routes. Caller sends header "X-TeamForge-Internal-Secret".
  // Requires the request to pass the Access policy (e.g. via IP bypass on allowed machines).
  TF_INTERNAL_SHARED_SECRET?: string;
}
