const DEFAULT_BASE_URL = "https://huly.app";
const CORE_CLASS_TX_CREATE_DOC = "core:class:TxCreateDoc";
const CORE_CLASS_TX_UPDATE_DOC = "core:class:TxUpdateDoc";
const CORE_SPACE_TX = "core:space:Tx";
export const CORE_SPACE_SPACE = "core:space:Space";
export const HULY_PROJECT_CLASS = "tracker:class:Project";
export const HULY_ISSUE_CLASS = "tracker:class:Issue";
export const HULY_MILESTONE_CLASS = "tracker:class:Milestone";

export interface HulyAccountInfo {
  uuid?: string | null;
  email?: string | null;
  role?: string | null;
  primary_social_id?: string | null;
  social_ids?: string[] | null;
  workspace?: string | null;
}

export interface HulyIssue {
  _id: string;
  identifier?: string | null;
  title?: string | null;
  description?: string | null;
  status?: string | Record<string, unknown> | null;
  priority?: string | Record<string, unknown> | null;
  assignee?: string | null;
  modifiedBy?: string | null;
  modifiedOn?: number | null;
  createdOn?: number | null;
  number?: number | null;
  space?: string | null;
}

export interface HulyProject {
  _id: string;
  name?: string | null;
  identifier?: string | null;
  _class?: string | null;
}

export interface HulyMilestone {
  _id: string;
  label?: string | null;
  status?: string | null;
  targetDate?: number | null;
  modifiedOn?: number | null;
  space?: string | null;
}

interface HulyConfig {
  ACCOUNTS_URL?: string;
}

export class HulyApiClient {
  private constructor(
    private readonly endpoint: string,
    private readonly workspaceId: string,
    private readonly token: string,
  ) {}

  static async connect(userToken: string, baseUrl = DEFAULT_BASE_URL): Promise<HulyApiClient> {
    const config = await fetch(`${baseUrl.replace(/\/$/, "")}/config.json`).then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load Huly config: ${response.status}`);
      }
      return response.json() as Promise<HulyConfig>;
    });

    const workspaceUrl = extractWorkspaceFromJwt(userToken);
    if (!workspaceUrl) {
      throw new Error("Could not extract workspace from Huly token.");
    }

    const response = await fetch(config.ACCOUNTS_URL ?? "https://accounts.huly.app", {
      method: "POST",
      headers: {
        authorization: `Bearer ${userToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        method: "selectWorkspace",
        params: {
          workspaceUrl,
          kind: "external",
        },
      }),
    });

    const payload = await response.json() as {
      error?: unknown;
      result?: { endpoint: string; token: string; workspace: string };
    };

    if (!response.ok || payload.error || !payload.result) {
      throw new Error(`Huly selectWorkspace failed: ${JSON.stringify(payload).slice(0, 500)}`);
    }

    return new HulyApiClient(
      payload.result.endpoint.replace("wss://", "https://").replace("ws://", "http://"),
      payload.result.workspace,
      payload.result.token,
    );
  }

  async getAccountInfo(): Promise<HulyAccountInfo> {
    return this.getJson<HulyAccountInfo>(`/api/v1/account/${this.workspaceId}`);
  }

  async getProjects(): Promise<HulyProject[]> {
    return this.findAll<HulyProject>(HULY_PROJECT_CLASS, {});
  }

  async getIssues(): Promise<HulyIssue[]> {
    return this.findAll<HulyIssue>(HULY_ISSUE_CLASS, {});
  }

  async getMilestones(): Promise<HulyMilestone[]> {
    return this.findAll<HulyMilestone>(HULY_MILESTONE_CLASS, {});
  }

  async createDoc(
    actorSocialId: string,
    className: string,
    objectSpace: string,
    attributes: Record<string, unknown>,
  ): Promise<string> {
    const objectId = generateHulyId();
    await this.postTx({
      _id: generateHulyId(),
      _class: CORE_CLASS_TX_CREATE_DOC,
      space: CORE_SPACE_TX,
      objectId,
      objectClass: className,
      objectSpace,
      modifiedOn: Date.now(),
      modifiedBy: actorSocialId,
      createdBy: actorSocialId,
      attributes,
    });
    return objectId;
  }

  async updateDoc(
    actorSocialId: string,
    className: string,
    objectSpace: string,
    objectId: string,
    operations: Record<string, unknown>,
  ): Promise<void> {
    await this.postTx({
      _id: generateHulyId(),
      _class: CORE_CLASS_TX_UPDATE_DOC,
      space: CORE_SPACE_TX,
      modifiedBy: actorSocialId,
      modifiedOn: Date.now(),
      objectId,
      objectClass: className,
      objectSpace,
      operations,
      retrieve: false,
    });
  }

  private async findAll<T>(className: string, query: Record<string, unknown>): Promise<T[]> {
    const url = new URL(`${this.endpoint}/api/v1/find-all/${this.workspaceId}`);
    url.searchParams.set("class", className);
    url.searchParams.set("query", JSON.stringify(query));
    url.searchParams.set("options", JSON.stringify({ limit: 500 }));

    const response = await fetch(url.toString(), {
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
      },
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Huly find-all returned ${response.status}: ${text.slice(0, 500)}`);
    }

    const parsed = JSON.parse(text) as T[] | { value?: T[] };
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return parsed.value ?? [];
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${this.endpoint}${path}`, {
      headers: { authorization: `Bearer ${this.token}` },
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Huly returned ${response.status}: ${text.slice(0, 500)}`);
    }
    return JSON.parse(text) as T;
  }

  private async postTx(payload: Record<string, unknown>): Promise<void> {
    const response = await fetch(`${this.endpoint}/api/v1/tx/${this.workspaceId}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Huly tx returned ${response.status}: ${text.slice(0, 500)}`);
    }
  }
}

export function resolveHulyActorSocialId(account: HulyAccountInfo): string | null {
  if (account.primary_social_id && account.primary_social_id.trim().length > 0) {
    return account.primary_social_id;
  }
  const fallback = account.social_ids?.find((value) => value.trim().length > 0);
  return fallback ?? null;
}

function extractWorkspaceFromJwt(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const normalized = parts[1]
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
  const decoded = JSON.parse(atob(normalized)) as { workspace?: string };
  return decoded.workspace ?? null;
}

function generateHulyId(): string {
  const time = Date.now().toString(16);
  const random = crypto.getRandomValues(new Uint8Array(8));
  const suffix = Array.from(random, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${time}${suffix}`;
}
