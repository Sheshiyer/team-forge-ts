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
  TEAMFORGE_DB?: D1DatabaseLike;
  TEAMFORGE_ARTIFACTS?: R2BucketLike;
  SYNC_QUEUE?: QueueLike<SyncJobMessage>;
  WORKSPACE_LOCKS?: DurableObjectNamespaceLike;
}
