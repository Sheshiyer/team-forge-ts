export interface ApiErrorShape {
  code: string;
  message: string;
  retryable: boolean;
}

export function jsonOk<T>(data: T, init?: ResponseInit): Response {
  return json(
    {
      ok: true,
      data,
    },
    init,
  );
}

export function jsonError(error: ApiErrorShape, status = 400, init?: ResponseInit): Response {
  return json(
    {
      ok: false,
      error,
    },
    {
      ...init,
      status,
    },
  );
}

export function jsonNotImplemented(route: string, method: string): Response {
  return jsonError(
    {
      code: "feature_not_ready",
      message: `${method} ${route} is reserved by contract but not implemented in Phase 2 Wave 1.`,
      retryable: false,
    },
    501,
  );
}

function json(payload: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(payload, null, 2), {
    ...init,
    headers,
  });
}
