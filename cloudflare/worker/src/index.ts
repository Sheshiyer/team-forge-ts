import type { DurableObjectStateLike, Env } from "./lib/env";
import { requireBearerAuth } from "./lib/auth";
import { jsonError, jsonOk } from "./lib/response";
import { handleInternalRequest } from "./routes/internal";
import { handleV1Request } from "./routes/v1";

function getInternalRouteToken(pathname: string, env: Env): string | undefined {
  if (pathname === "/internal/releases/publish") {
    return env.TF_RELEASE_PUBLISH_TOKEN;
  }

  return env.TF_WEBHOOK_HMAC_SECRET;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return jsonOk({
        service: "teamforge-api",
        phase: "phase-2-wave-3",
        environment: env.TF_ENV,
      });
    }

    if (request.method === "GET" && url.pathname === "/healthz") {
      return jsonOk({
        status: "ok",
        environment: env.TF_ENV,
        timestamp: new Date().toISOString(),
      });
    }

    if (url.pathname.startsWith("/v1/")) {
      return handleV1Request(request, env, url);
    }

    if (url.pathname.startsWith("/internal/")) {
      const authFailure = requireBearerAuth(
        request,
        getInternalRouteToken(url.pathname, env),
        "internal",
      );
      if (authFailure) return authFailure;

      return handleInternalRequest(request, url, env);
    }

    return jsonError(
      {
        code: "route_not_found",
        message: `No route is defined for ${request.method} ${url.pathname}.`,
        retryable: false,
      },
      404,
    );
  },
};

export class WorkspaceLock {
  private readonly locks = new Map<string, { owner: string; expiresAt: number }>();

  constructor(
    private readonly state: DurableObjectStateLike,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/acquire") {
      return this.handleAcquire(request);
    }

    if (request.method === "POST" && url.pathname === "/release") {
      return this.handleRelease(request);
    }

    return jsonError(
      {
        code: "lock_route_not_found",
        message: `No lock route is defined for ${request.method} ${url.pathname}.`,
        retryable: false,
      },
      404,
    );
  }

  private async handleAcquire(request: Request): Promise<Response> {
    let body: { key?: string; owner?: string; ttlMs?: number };
    try {
      body = await request.json();
    } catch {
      return jsonError(
        {
          code: "invalid_json",
          message: "Lock acquire body must be valid JSON.",
          retryable: false,
        },
        400,
      );
    }

    const key = body.key?.trim();
    const owner = body.owner?.trim();
    if (!key || !owner) {
      return jsonError(
        {
          code: "missing_fields",
          message: "key and owner are required.",
          retryable: false,
        },
        400,
      );
    }

    const ttlMs = Math.max(1_000, Math.min(body.ttlMs ?? 30_000, 300_000));
    const currentTime = Date.now();
    const existing = this.locks.get(key);

    if (existing && existing.expiresAt > currentTime && existing.owner !== owner) {
      return jsonError(
        {
          code: "lock_conflict",
          message: `Lock ${key} is already held by ${existing.owner}.`,
          retryable: true,
        },
        409,
      );
    }

    const expiresAt = currentTime + ttlMs;
    this.locks.set(key, { owner, expiresAt });

    return jsonOk({
      lock: "workspace",
      durableObjectId: this.state.id?.toString() ?? "unknown",
      environment: this.env.TF_ENV,
      acquired: true,
      key,
      owner,
      expiresAt: new Date(expiresAt).toISOString(),
    });
  }

  private async handleRelease(request: Request): Promise<Response> {
    let body: { key?: string; owner?: string };
    try {
      body = await request.json();
    } catch {
      return jsonError(
        {
          code: "invalid_json",
          message: "Lock release body must be valid JSON.",
          retryable: false,
        },
        400,
      );
    }

    const key = body.key?.trim();
    const owner = body.owner?.trim();
    if (!key || !owner) {
      return jsonError(
        {
          code: "missing_fields",
          message: "key and owner are required.",
          retryable: false,
        },
        400,
      );
    }

    const existing = this.locks.get(key);
    if (existing?.owner === owner) {
      this.locks.delete(key);
    }

    return jsonOk({
      lock: "workspace",
      durableObjectId: this.state.id?.toString() ?? "unknown",
      environment: this.env.TF_ENV,
      released: existing?.owner === owner,
      key,
      owner,
    });
  }
}
