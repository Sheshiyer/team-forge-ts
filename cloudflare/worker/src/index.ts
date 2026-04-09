import type { DurableObjectStateLike, Env } from "./lib/env";
import { jsonError, jsonOk } from "./lib/response";
import { handleInternalRequest } from "./routes/internal";
import { handleV1Request } from "./routes/v1";

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
  constructor(
    private readonly state: DurableObjectStateLike,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    return jsonOk({
      lock: "workspace",
      durableObjectId: this.state.id?.toString() ?? "unknown",
      environment: this.env.TF_ENV,
      method: request.method,
      status: "scaffolded",
    });
  }
}
