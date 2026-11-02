import type { Env } from "../lib/env";
import { requireBearerAuth } from "../lib/auth";
import { queryFirst } from "../lib/db";
import { jsonError, jsonOk } from "../lib/response";

const IDENTITY_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TENANT_ID = /^[a-z0-9][a-z0-9_-]{1,79}$/;
const WORKSPACE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_TENANT_MAPPINGS = 64;

interface NativeIdentityRow {
  id: string;
  workspace_id: string;
  role: string;
  is_active: number;
}

function parseTenantWorkspaceMap(raw: string | undefined): Record<string, string> | null {
  if (!raw?.trim() || raw.length > 16_384) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const entries = Object.entries(parsed);
  if (entries.length === 0 || entries.length > MAX_TENANT_MAPPINGS) return null;
  const mapped: Record<string, string> = {};
  for (const [tenantId, workspaceId] of entries) {
    if (!TENANT_ID.test(tenantId) || typeof workspaceId !== "string" || !WORKSPACE_ID.test(workspaceId)) {
      return null;
    }
    mapped[tenantId] = workspaceId;
  }
  return mapped;
}

/**
 * Narrow machine-to-machine identity lookup for reviewed native clients.
 *
 * This route intentionally does not accept Cloudflare Access JWTs, the app
 * credential envelope, or the internal operator secret. It returns no email,
 * display name, capabilities, or onboarding state. Tenant membership is
 * the intersection of the owner-configured map and the active D1 identity row.
 */
export async function handleNativeIdentityLookup(
  env: Env,
  request: Request,
  identityId: string,
  url: URL,
): Promise<Response> {
  const authFailure = requireBearerAuth(request, env.TF_NATIVE_IDENTITY_LOOKUP_TOKEN, "native_identity");
  if (authFailure) return authFailure;

  if (!IDENTITY_ID.test(identityId)) {
    return jsonError(
      { code: "invalid_identity_id", message: "A valid identity id is required.", retryable: false },
      400,
    );
  }

  const tenantId = url.searchParams.get("tenant_id")?.trim() ?? "";
  if (!TENANT_ID.test(tenantId)) {
    return jsonError(
      { code: "invalid_tenant_id", message: "A valid tenant_id is required.", retryable: false },
      400,
    );
  }

  const tenantWorkspaceMap = parseTenantWorkspaceMap(env.TF_NATIVE_TENANT_WORKSPACE_MAP_JSON);
  if (!tenantWorkspaceMap) {
    return jsonError(
      {
        code: "native_identity_mapping_unconfigured",
        message: "Native identity tenant enrollment is not configured.",
        retryable: false,
      },
      503,
    );
  }

  const workspaceId = tenantWorkspaceMap[tenantId];
  if (!workspaceId) {
    return jsonError(
      { code: "native_tenant_not_enrolled", message: "The requested tenant is not enrolled.", retryable: false },
      404,
    );
  }

  if (!env.TEAMFORGE_DB) {
    return jsonError(
      { code: "native_identity_lookup_unavailable", message: "Identity authority is unavailable.", retryable: true },
      503,
    );
  }

  try {
    const row = await queryFirst<NativeIdentityRow>(
      env.TEAMFORGE_DB,
      `SELECT id, workspace_id, role, is_active
         FROM plexus_identities
        WHERE id = ? AND workspace_id = ? AND is_active = 1
        LIMIT 1`,
      identityId,
      workspaceId,
    );
    if (!row || row.id !== identityId || row.workspace_id !== workspaceId || (row.role !== "admin" && row.role !== "employee") || Number(row.is_active) !== 1) {
      return jsonError(
        { code: "native_identity_not_enrolled", message: "The identity is not enrolled for this tenant.", retryable: false },
        404,
      );
    }

    return jsonOk({
      contractVersion: "plexus.native-identity.v1",
      identityId: row.id,
      tenantId,
      workspaceId: row.workspace_id,
      role: row.role,
      active: true,
      enrolled: true,
    });
  } catch {
    return jsonError(
      { code: "native_identity_lookup_unavailable", message: "Identity authority is unavailable.", retryable: true },
      503,
    );
  }
}
