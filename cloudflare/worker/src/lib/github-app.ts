import type { Env } from "./env";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const GITHUB_API = "https://api.github.com";
const GITHUB_API_VERSION = "2026-03-10";

export interface GithubConnectState {
  workspace: string;
  actor: string;
  nonce: string;
  exp: number;
  target?: GithubInstallationAccountTarget;
}

export interface GithubInstallationAccountTarget {
  id: number;
  login: string;
  type: "Organization" | "User";
}

export interface GithubUser {
  id: number;
  login: string;
}

export interface GithubRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  owner: { login: string; id: number };
  permissions?: { admin?: boolean; maintain?: boolean; push?: boolean; pull?: boolean };
}

export interface GithubInstallationToken {
  token: string;
  expiresAt: string;
}

export class GithubControlPlaneError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "GithubControlPlaneError";
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function stringToBase64Url(value: string): string {
  return bytesToBase64Url(encoder.encode(value));
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  let padded = value.replace(/-/g, "+").replace(/_/g, "/");
  while (padded.length % 4) padded += "=";
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

function pemBytes(pem: string): { label: string; bytes: Uint8Array<ArrayBuffer> } {
  const match = pem.trim().match(/^-----BEGIN ([A-Z ]+)-----([\s\S]+)-----END \1-----$/);
  if (!match) throw new GithubControlPlaneError("github_key_invalid", "GitHub App private key is invalid.", 503);
  const raw = atob(match[2].replace(/\s+/g, ""));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return { label: match[1], bytes };
}

function concat(...chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(new ArrayBuffer(length));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function derLength(length: number): Uint8Array<ArrayBuffer> {
  if (length < 0x80) return new Uint8Array([length]);
  const values: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    values.unshift(remaining & 0xff);
    remaining >>>= 8;
  }
  return new Uint8Array([0x80 | values.length, ...values]);
}

function der(tag: number, value: Uint8Array): Uint8Array<ArrayBuffer> {
  return concat(new Uint8Array([tag]), derLength(value.length), value);
}

function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array<ArrayBuffer> {
  const version = new Uint8Array([0x02, 0x01, 0x00]);
  const rsaAlgorithm = new Uint8Array([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86,
    0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
  ]);
  return der(0x30, concat(version, rsaAlgorithm, der(0x04, pkcs1)));
}

function privateKeyDer(pem: string): Uint8Array<ArrayBuffer> {
  const parsed = pemBytes(pem.replace(/\\n/g, "\n"));
  if (parsed.label === "PRIVATE KEY") return parsed.bytes;
  if (parsed.label === "RSA PRIVATE KEY") return pkcs1ToPkcs8(parsed.bytes);
  throw new GithubControlPlaneError("github_key_invalid", "GitHub App private key must be PKCS#8 or PKCS#1 RSA.", 503);
}

async function importHmac(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? encoder.encode(value) : new Uint8Array(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function signConnectState(state: GithubConnectState, secret: string): Promise<string> {
  const payload = stringToBase64Url(JSON.stringify(state));
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await importHmac(secret), encoder.encode(payload)));
  return `${payload}.${bytesToBase64Url(signature)}`;
}

export async function verifyConnectState(value: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<GithubConnectState> {
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra) {
    throw new GithubControlPlaneError("github_state_invalid", "GitHub connection state is invalid.", 400);
  }
  const valid = await crypto.subtle.verify("HMAC", await importHmac(secret), base64UrlToBytes(signature), encoder.encode(payload));
  if (!valid) throw new GithubControlPlaneError("github_state_invalid", "GitHub connection state signature is invalid.", 400);
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(base64UrlToBytes(payload)));
  } catch {
    throw new GithubControlPlaneError("github_state_invalid", "GitHub connection state payload is invalid.", 400);
  }
  const state = parsed as Partial<GithubConnectState>;
  const keys = Object.keys(state).sort().join(",");
  const target = state.target as Partial<GithubInstallationAccountTarget> | undefined;
  const targetKeys = target ? Object.keys(target).sort().join(",") : "";
  const baseValid = (keys === "actor,exp,nonce,workspace" || keys === "actor,exp,nonce,target,workspace") &&
    Boolean(state.workspace && state.actor && state.nonce && Number.isInteger(state.exp));
  const targetValid = !target || (targetKeys === "id,login,type" && Number.isSafeInteger(target.id) && (target.id ?? 0) > 0 &&
    typeof target.login === "string" && Boolean(target.login) && (target.type === "Organization" || target.type === "User"));
  if (!baseValid || !targetValid) {
    throw new GithubControlPlaneError("github_state_invalid", "GitHub connection state fields are invalid.", 400);
  }
  if ((state.exp as number) <= nowSeconds) throw new GithubControlPlaneError("github_state_expired", "GitHub connection state has expired.", 410);
  return state as GithubConnectState;
}

export async function verifyWebhookSignature(payload: string, signatureHeader: string | null, secret: string): Promise<boolean> {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = signatureHeader.slice(7).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expected)) return false;
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await importHmac(secret), encoder.encode(payload)));
  const actual = Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
  let mismatch = actual.length ^ expected.length;
  for (let index = 0; index < Math.max(actual.length, expected.length); index += 1) {
    mismatch |= (actual.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

function requireGithubAppEnv(env: Env): Required<Pick<Env,
  "TF_GITHUB_APP_ID" | "TF_GITHUB_APP_SLUG" | "TF_GITHUB_APP_PRIVATE_KEY" |
  "TF_GITHUB_APP_CLIENT_ID" | "TF_GITHUB_APP_CLIENT_SECRET" | "TF_GITHUB_APP_CALLBACK_URL"
>> {
  const values = {
    TF_GITHUB_APP_ID: env.TF_GITHUB_APP_ID,
    TF_GITHUB_APP_SLUG: env.TF_GITHUB_APP_SLUG,
    TF_GITHUB_APP_PRIVATE_KEY: env.TF_GITHUB_APP_PRIVATE_KEY,
    TF_GITHUB_APP_CLIENT_ID: env.TF_GITHUB_APP_CLIENT_ID,
    TF_GITHUB_APP_CLIENT_SECRET: env.TF_GITHUB_APP_CLIENT_SECRET,
    TF_GITHUB_APP_CALLBACK_URL: env.TF_GITHUB_APP_CALLBACK_URL,
  };
  if (Object.values(values).some((value) => !value?.trim())) {
    throw new GithubControlPlaneError("github_app_not_configured", "GitHub App configuration is incomplete.", 503);
  }
  return {
    TF_GITHUB_APP_ID: values.TF_GITHUB_APP_ID!,
    TF_GITHUB_APP_SLUG: values.TF_GITHUB_APP_SLUG!,
    TF_GITHUB_APP_PRIVATE_KEY: values.TF_GITHUB_APP_PRIVATE_KEY!,
    TF_GITHUB_APP_CLIENT_ID: values.TF_GITHUB_APP_CLIENT_ID!,
    TF_GITHUB_APP_CLIENT_SECRET: values.TF_GITHUB_APP_CLIENT_SECRET!,
    TF_GITHUB_APP_CALLBACK_URL: values.TF_GITHUB_APP_CALLBACK_URL!,
  };
}

export function buildOauthAuthorizeUrl(env: Env, state: string): string {
  const config = requireGithubAppEnv(env);
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", config.TF_GITHUB_APP_CLIENT_ID);
  url.searchParams.set("redirect_uri", config.TF_GITHUB_APP_CALLBACK_URL);
  url.searchParams.set("state", state);
  return url.toString();
}

export function buildInstallationUrl(env: Env): string {
  const config = requireGithubAppEnv(env);
  return `https://github.com/apps/${encodeURIComponent(config.TF_GITHUB_APP_SLUG)}/installations/new`;
}

async function responseJson<T>(response: Response, code: string): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    let message = `GitHub request failed with status ${response.status}.`;
    try {
      const body = JSON.parse(text) as { message?: string };
      if (body.message) message = `GitHub: ${body.message.slice(0, 240)}`;
    } catch {
      // Never echo arbitrary upstream content; it could include secret request context.
    }
    throw new GithubControlPlaneError(code, message, response.status === 401 ? 502 : response.status, response.status >= 500);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new GithubControlPlaneError(code, "GitHub returned an invalid JSON response.", 502, true);
  }
}

async function githubFetch(
  fetchImpl: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  code: string,
): Promise<Response> {
  try {
    return await fetchImpl(input, init);
  } catch {
    throw new GithubControlPlaneError(code, "GitHub request could not be completed.", 502, true);
  }
}

export class GithubAppClient {
  constructor(
    private readonly env: Env,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async createAppJwt(nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
    const config = requireGithubAppEnv(this.env);
    const header = stringToBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = stringToBase64Url(JSON.stringify({ iat: nowSeconds - 30, exp: nowSeconds + 540, iss: config.TF_GITHUB_APP_ID }));
    const signingInput = `${header}.${payload}`;
    const key = await crypto.subtle.importKey(
      "pkcs8",
      privateKeyDer(config.TF_GITHUB_APP_PRIVATE_KEY),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(signingInput)));
    return `${signingInput}.${bytesToBase64Url(signature)}`;
  }

  async exchangeOauthCode(code: string, requiredInstallationIds?: number[]): Promise<GithubUser> {
    const config = requireGithubAppEnv(this.env);
    const tokenBody = new URLSearchParams({
      client_id: config.TF_GITHUB_APP_CLIENT_ID,
      client_secret: config.TF_GITHUB_APP_CLIENT_SECRET,
      code,
      redirect_uri: config.TF_GITHUB_APP_CALLBACK_URL,
    });
    const tokenResponse = await githubFetch(this.fetchImpl, "https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    }, "github_oauth_exchange_failed");
    const tokenPayload = await responseJson<{ access_token?: string; error?: string }>(tokenResponse, "github_oauth_exchange_failed");
    if (!tokenPayload.access_token) throw new GithubControlPlaneError("github_oauth_exchange_failed", "GitHub OAuth did not return an access token.", 502);
    const userResponse = await githubFetch(this.fetchImpl, `${GITHUB_API}/user`, {
      headers: this.headers(tokenPayload.access_token),
    }, "github_oauth_identity_failed");
    const user = await responseJson<Pick<GithubUser, "id" | "login">>(userResponse, "github_oauth_identity_failed");
    if (!Number.isSafeInteger(user.id) || !user.login) throw new GithubControlPlaneError("github_oauth_identity_failed", "GitHub OAuth identity is invalid.", 502);
    if (requiredInstallationIds !== undefined) {
      const required = new Set(requiredInstallationIds);
      if (required.size === 0 || [...required].some((installationId) => !Number.isSafeInteger(installationId) || installationId <= 0)) {
        throw new GithubControlPlaneError("github_installation_hint_invalid", "Installation IDs must be positive integers.", 400);
      }
      let installationAccessible = false;
      for (let page = 1; page <= 10; page += 1) {
        const installationsResponse = await githubFetch(this.fetchImpl, `${GITHUB_API}/user/installations?per_page=100&page=${page}`, {
          headers: this.headers(tokenPayload.access_token),
        }, "github_oauth_installations_failed");
        const installations = await responseJson<{ installations?: Array<{ id?: number }> }>(
          installationsResponse,
          "github_oauth_installations_failed",
        );
        if (!Array.isArray(installations.installations)) {
          throw new GithubControlPlaneError("github_oauth_installations_failed", "GitHub App installation authority is invalid.", 502);
        }
        if (installations.installations.some((installation) => installation.id !== undefined && required.has(installation.id))) {
          installationAccessible = true;
          break;
        }
        if (installations.installations.length < 100) break;
      }
      if (!installationAccessible) {
        throw new GithubControlPlaneError("github_oauth_installation_forbidden", "GitHub OAuth identity cannot access any active workspace installation.", 403);
      }
    }
    return { id: user.id, login: user.login };
  }

  async createInstallationToken(
    installationId: number,
    repositoryIds: number[] | null,
    mode: "discovery" | "metadata" | "read" | "activity" | "write",
  ): Promise<GithubInstallationToken> {
    if (!Number.isSafeInteger(installationId) || installationId <= 0 ||
      (repositoryIds !== null && (repositoryIds.length === 0 || repositoryIds.some((id) => !Number.isSafeInteger(id) || id <= 0))) ||
      (repositoryIds === null && mode !== "discovery") ||
      (repositoryIds !== null && mode === "discovery")) {
      throw new GithubControlPlaneError("github_scope_invalid", "Installation token scope must contain numeric repository IDs.", 400);
    }
    const permissions = mode === "write"
      ? { metadata: "read", contents: "write", pull_requests: "write" }
      : mode === "activity"
        ? { metadata: "read", contents: "read", pull_requests: "read", issues: "read", actions: "read", checks: "read" }
        : mode === "read"
          ? { metadata: "read", contents: "read" }
          : { metadata: "read" };
    const tokenRequest: Record<string, unknown> = { permissions };
    if (repositoryIds !== null) tokenRequest.repository_ids = [...new Set(repositoryIds)];
    const response = await githubFetch(this.fetchImpl, `${GITHUB_API}/app/installations/${installationId}/access_tokens`, {
      method: "POST",
      headers: this.headers(await this.createAppJwt()),
      body: JSON.stringify(tokenRequest),
    }, "github_installation_token_failed");
    const body = await responseJson<{ token?: string; expires_at?: string }>(response, "github_installation_token_failed");
    const expiresAtMs = Date.parse(body.expires_at ?? "");
    const nowMs = Date.now();
    if (!body.token || !Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs || expiresAtMs > nowMs + 3_605_000) {
      throw new GithubControlPlaneError("github_installation_token_failed", "GitHub returned an invalid installation token expiry.", 502);
    }
    return { token: body.token, expiresAt: body.expires_at! };
  }

  async request<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
    const response = await githubFetch(this.fetchImpl, `${GITHUB_API}${path}`, {
      ...init,
      headers: { ...this.headers(token), ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
    }, "github_api_failed");
    return responseJson<T>(response, "github_api_failed");
  }

  async requestOptional<T>(token: string, path: string, init: RequestInit = {}): Promise<T | null> {
    const response = await githubFetch(this.fetchImpl, `${GITHUB_API}${path}`, {
      ...init,
      headers: { ...this.headers(token), ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
    }, "github_api_failed");
    if (response.status === 404) return null;
    return responseJson<T>(response, "github_api_failed");
  }

  async hasWritePermission(token: string, owner: string, repo: string, login: string, expectedUserId: number): Promise<boolean> {
    const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators/${encodeURIComponent(login)}/permission`;
    const result = await this.requestOptional<{ permission?: string; user?: { id?: number } }>(token, path);
    return result !== null && result.user?.id === expectedUserId && ["write", "maintain", "admin"].includes(result.permission ?? "");
  }

  private headers(token: string): Record<string, string> {
    return {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "user-agent": "TeamForge-GitHub-App",
      "x-github-api-version": GITHUB_API_VERSION,
    };
  }
}
