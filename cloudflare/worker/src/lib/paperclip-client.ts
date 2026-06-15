import type { Env } from "./env";

export interface PaperclipStandupSource {
  kind: "huly" | "github" | "slack" | "clockify";
  id: string;
  ts: number;
}

export interface PaperclipStandupRequest {
  agent_id: string;
  scope: { project_id?: string; date?: string };
  correlation_id: string;
  requester: { kind: "multica_service" | "teamforge_worker"; identity: string };
}

export interface PaperclipStandupResponse {
  agent_id: string;
  correlation_id: string;
  state: "succeeded" | "failed";
  data?: {
    yesterday: string[];
    today: string[];
    blockers: string[];
    confidence: number;
  };
  error?: { code: string; message: string };
  sources: PaperclipStandupSource[];
}

export interface PaperclipClientError {
  code: "paperclip_base_url_missing" | "agent_token_missing" | "paperclip_unavailable" | "paperclip_bad_response";
  message: string;
  retryable: boolean;
}

export function parseAgentTokenMap(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && v.length > 0) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * POST to Paperclip's per-agent standup endpoint. Auth is a per-agent bearer
 * token resolved from PAPERCLIP_AGENT_TOKEN_MAP. Retries once on 5xx; no
 * retry on 4xx (caller likely sent a malformed envelope).
 */
export async function requestPaperclipStandup(
  env: Env,
  req: PaperclipStandupRequest,
): Promise<{ ok: true; value: PaperclipStandupResponse } | { ok: false; error: PaperclipClientError }> {
  const baseUrl = env.PAPERCLIP_REMOTE_BASE_URL?.trim();
  if (!baseUrl) {
    return { ok: false, error: { code: "paperclip_base_url_missing", message: "PAPERCLIP_REMOTE_BASE_URL is not configured", retryable: false } };
  }
  const tokenMap = parseAgentTokenMap(env.PAPERCLIP_AGENT_TOKEN_MAP);
  const token = tokenMap[req.agent_id];
  if (!token) {
    return { ok: false, error: { code: "agent_token_missing", message: `no Paperclip token registered for agent_id ${req.agent_id}`, retryable: false } };
  }

  const url = `${baseUrl.replace(/\/+$/, "")}/api/agents/${encodeURIComponent(req.agent_id)}/standup`;
  const body = JSON.stringify({
    correlation_id: req.correlation_id,
    scope: req.scope,
    requester: req.requester,
  });
  const init: RequestInit = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${token}`,
      "x-correlation-id": req.correlation_id,
    },
    body,
  };

  for (let attempt = 1; attempt <= 2; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (err) {
      if (attempt === 2) {
        return { ok: false, error: { code: "paperclip_unavailable", message: `network error: ${(err as Error).message}`, retryable: true } };
      }
      continue;
    }
    if (response.status >= 500 && attempt === 1) continue;
    if (response.status >= 500) {
      return { ok: false, error: { code: "paperclip_unavailable", message: `Paperclip returned ${response.status} after retry`, retryable: true } };
    }
    if (response.status >= 400) {
      return { ok: false, error: { code: "paperclip_bad_response", message: `Paperclip rejected request: ${response.status}`, retryable: false } };
    }
    try {
      const parsed = (await response.json()) as PaperclipStandupResponse;
      if (!parsed || typeof parsed !== "object" || typeof parsed.state !== "string") {
        return { ok: false, error: { code: "paperclip_bad_response", message: "Paperclip response missing state", retryable: false } };
      }
      return { ok: true, value: parsed };
    } catch {
      return { ok: false, error: { code: "paperclip_bad_response", message: "Paperclip response was not valid JSON", retryable: false } };
    }
  }
  return { ok: false, error: { code: "paperclip_unavailable", message: "exhausted retries", retryable: true } };
}
