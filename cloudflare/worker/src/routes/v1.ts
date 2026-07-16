/**
 * V1 API Router — Safety Audit Note (2026-06-10)
 *
 * Route classification (read-only vs mutation):
 *  READ  — GET  /bootstrap, /remote-config, /reporting/weekly-context, /projects, /client-profiles, /onboarding-flows,
 *               /project-mappings, /project-mappings/issues, /project-mappings/:id/control-plane,
 *               /credentials, /connections, /sync/jobs/:id, /sync/runs, /ota/check,
 *               /team/snapshot, /huly/normalization/history, /handoffs, /handoffs/:id,
 *               /agent-feed/export, /projects/:id/closeout
 *  WRITE — PUT  /projects/:id, /client-profiles/:id, /onboarding-flows, /project-mappings/:id
 *          POST /projects/scaffold, /project-mappings/:id/actions, /connections/:id/test,
 *               /sync/jobs, /team/refresh, /huly/normalization/preview, /huly/normalization/apply,
 *               /ota/install-events, /handoffs, /handoffs/:id
 *
 * Auth: App routes require Bearer (TF_CREDENTIAL_ENVELOPE_KEY) or internal secret.
 * /reporting/weekly-context accepts only the dedicated TF_REPORTING_READ_TOKEN.
 * GET /whoami is Access-JWT-only and fail-closed (401 without a verified identity) since WS5.
 * Internal routes (/agent-feed/*, /projects/scaffold, /closeout) use TF_WEBHOOK_HMAC_SECRET.
 * No destructive operations without authentication. No unscoped DELETE endpoints.
 * Health check lives at GET /healthz (index.ts), outside this router.
 */

import type { Env } from "../lib/env";
import type { AuthenticatedCommandPrincipal } from "../lib/commands/types";
import { requireBearerAuth, requireInternalAuth } from "../lib/auth";
import { jsonError, jsonNotImplemented, jsonOk } from "../lib/response";
import { verifyAccessJwt } from "../lib/access";
import {
  buildPlexusSession,
  getAdminDemoOverview,
  getPreferences,
  resolvePlexusPrincipal,
  setPreferences,
  updateAdminDemoOnboarding,
  updateOnboardingStep,
} from "../lib/plexus-session";
import { handleGetTimeEntries, handlePostTimeEntries } from "./time-entries";
import { handleCommandIntent, handleGetCommandRun, handleListCommandRuns } from "./commands";
import { handleCommandsCallback } from "./commands-callback";
import { handleBackfillClockify } from "./clockify-backfill";
import { handleAgentFeedExport, handleProjectCloseout, handleProjectScaffold } from "./agent-feed";
import { handleGetConnections, handleTestConnection } from "./connections";
import { handleGetCredentials } from "./credentials";
import { handleGetNormalizationHistory, handleNormalizationApply, handleNormalizationPreview } from "./normalization";
import { handleOtaCheck, handleOtaInstallEvent } from "./ota";
import {
  handleCloseRealtimeTrack,
  handleEndRealtimeCall,
  handleGetRealtimeMeeting,
  handleGetRealtimeRoom,
  handleGetRealtimeRooms,
  handleJoinRealtimeRoom,
  handleLeaveRealtimeCall,
  handlePostRealtimeRoom,
  handlePostRealtimeTrack,
  handleRealtimeCloseout,
} from "./realtime";
import {
  handleCreatePresenceSession,
  handleDeletePresenceSession,
  handleGetPresence,
  handlePresenceHeartbeat,
} from "./presence";
import {
  handleGetClientProfile,
  handleGetClientProfiles,
  handleGetOnboardingFlows,
  handleGetProjectControlPlane,
  handleGetProjectMappingIssues,
  handleGetProjectMappings,
  handleGetProjects,
  handlePostProjectAction,
  handlePutClientProfile,
  handlePutOnboardingFlows,
  handlePutProject,
  handlePutProjectMappings,
} from "./projects";
import {
  createHandoff,
  getHandoffById,
  listHandoffs,
  updateHandoffStatus,
  type HandoffInput,
} from "../lib/project-registry";
import { handleGetSyncJob, handleGetSyncRuns, handlePostSyncJob } from "./sync";
import { handleGetTeamSnapshot, handlePostTeamRefresh } from "./team";
import { queryFirst, queryAll } from "../lib/db";
import {
  handleGithubActivitySync,
  handleGithubActor,
  handleGithubActorEnrollStart,
  handleGithubCallback,
  handleGithubConnection,
  handleGithubConnectStart,
  handleGithubPullRequest,
  handleGithubRepositories,
  handleGithubRepoVerify,
  handleGithubWebhook,
} from "./github";
import { handleGetWeeklyReportingContext } from "./reporting";

interface DatabaseStatus {
  available: boolean;
  schemaReady: boolean;
}

export async function handleV1Request(request: Request, env: Env, url: URL): Promise<Response> {
  const { method, pathname } = { method: request.method, pathname: url.pathname };

  // Dedicated machine-to-machine reporting boundary. Match before Access
  // identity resolution so this route accepts only TF_REPORTING_READ_TOKEN and
  // never falls through to the app/internal shared credential tiers.
  if (method === "GET" && pathname === "/v1/reporting/weekly-context") {
    return handleGetWeeklyReportingContext(request, env, url);
  }

  // Exact third-party inbound paths. Cloudflare Access must bypass only these
  // two routes; callback state and webhook HMAC independently fail closed.
  if (method === "GET" && pathname === "/v1/github/callback") {
    return handleGithubCallback(env, request, url);
  }
  if (method === "POST" && pathname === "/v1/github/webhook") {
    return handleGithubWebhook(env, request);
  }

  // Per-employee identity (Cloudflare Access). Live since WS5: TF_ACCESS_TEAM_DOMAIN +
  // TF_ACCESS_AUD are set, so a valid Cf-Access-Jwt-Assertion resolves to the caller's email.
  // Returns null for m2m callers (workers.dev path, no JWT) — they use internal/Bearer below.
  const accessIdentity = await verifyAccessJwt(request, env);
  const plexusPrincipal = await resolvePlexusPrincipal(env, accessIdentity);

  // Combined auth for app routes — three tiers so neither Plexus nor Hermes regresses:
  //   1) a verified Cloudflare Access identity, else
  //   2) the temporary internal shared secret (m2m: parity/Hermes; header X-TeamForge-Internal-Secret), else
  //   3) the normal app Bearer (TF_CREDENTIAL_ENVELOPE_KEY).
  // The request must still pass the upstream Cloudflare Access policy (e.g. via IP bypass on allowed machines).
  const requireAppOrInternalAuth = () => {
    if (plexusPrincipal) return null; // Cloudflare Access identity verified + registered in TeamForge → authorized
    const internalFailure = requireInternalAuth(request, env.TF_INTERNAL_SHARED_SECRET);
    if (internalFailure) {
      return internalFailure; // internal header present but invalid
    }

    const providedInternal = request.headers.get("x-teamforge-internal-secret");
    const hasValidInternal =
      providedInternal &&
      env.TF_INTERNAL_SHARED_SECRET &&
      providedInternal === env.TF_INTERNAL_SHARED_SECRET;

    if (hasValidInternal) {
      return null; // internal auth succeeded — bypass bearer requirement
    }

    // No (valid) internal header — require the standard app Bearer
    return requireBearerAuth(
      request,
      env.TF_CREDENTIAL_ENVELOPE_KEY,
      "app",
    );
  };

  // Called only after requireAppOrInternalAuth succeeds. Actor claims from the
  // request body never participate in this server-side authority mapping.
  const resolveCommandPrincipal = (): AuthenticatedCommandPrincipal => {
    if (plexusPrincipal) {
      return {
        actor_id: plexusPrincipal.identityId,
        actor_kind: plexusPrincipal.role === "admin" ? "founder" : "employee",
        auth_mode: "cf_access",
      };
    }

    const providedInternal = request.headers.get("x-teamforge-internal-secret");
    if (
      providedInternal &&
      env.TF_INTERNAL_SHARED_SECRET &&
      providedInternal === env.TF_INTERNAL_SHARED_SECRET
    ) {
      return {
        // The existing internal credential is the explicit Hermes/parity
        // operator bridge. Preserve that delegated command tier, but derive it
        // here rather than accepting a founder claim from JSON.
        actor_id: "teamforge_internal_operator",
        actor_kind: "founder",
        auth_mode: "m2m",
      };
    }

    return {
      actor_id: "teamforge_app_service",
      actor_kind: "multica_service",
      auth_mode: "app_bearer",
    };
  };

  // Agent feed (Paperclip bridge) — auth required, shared HMAC secret
  if (method === "GET" && pathname === "/v1/agent-feed/export") {
    const authFailure = requireBearerAuth(request, env.TF_WEBHOOK_HMAC_SECRET, "internal");
    if (authFailure) return authFailure;
    return handleAgentFeedExport(env);
  }
  if (method === "POST" && pathname === "/v1/projects/scaffold") {
    const authFailure = requireBearerAuth(request, env.TF_WEBHOOK_HMAC_SECRET, "internal");
    if (authFailure) return authFailure;
    return handleProjectScaffold(env, request);
  }
  const closeoutMatch = pathname.match(/^\/v1\/projects\/([^/]+)\/closeout$/);
  if (method === "GET" && closeoutMatch) {
    const authFailure = requireBearerAuth(request, env.TF_WEBHOOK_HMAC_SECRET, "internal");
    if (authFailure) return authFailure;
    return handleProjectCloseout(env, closeoutMatch[1]);
  }

  // Bootstrap & config
  if (method === "GET" && pathname === "/v1/bootstrap") {
    return jsonOk(await buildBootstrapPayload(env));
  }
  if (method === "GET" && pathname === "/v1/remote-config") {
    return jsonOk({
      workspaceMode: "shadow",
      ota: {
        defaultChannel: env.TF_DEFAULT_OTA_CHANNEL ?? "stable",
        startupChecksEnabled: false,
      },
      features: {
        backendBridgeEnabled: false,
        remoteProjectMappingsEnabled: true,
        hulyNormalizationEnabled: false,
      },
    });
  }

  // Identity — whoami. Access-JWT-only and fail-closed (WS5): per-employee identity must come
  // from a verified Cloudflare Access JWT; Bearer/internal callers have no identity to return.
  if (method === "GET" && pathname === "/v1/whoami") {
    if (!accessIdentity) {
      return jsonError(
        {
          code: "access_identity_required",
          message: "A verified Cloudflare Access identity is required.",
          retryable: false,
        },
        401,
      );
    }
    if (!plexusPrincipal) {
      return jsonError(
        {
          code: "identity_not_registered",
          message: `No active Plexus identity is registered for ${accessIdentity.email}.`,
          retryable: false,
        },
        404,
      );
    }
    return jsonOk(await buildPlexusSession(env, plexusPrincipal));
  }

  // Private GitHub App control plane. Shared Bearer/internal credentials are
  // intentionally not accepted: every identity-bearing route requires the
  // registered Plexus principal resolved from Cloudflare Access above.
  if (method === "GET" && pathname === "/v1/github/connection") {
    return handleGithubConnection(env, plexusPrincipal);
  }
  if (method === "POST" && pathname === "/v1/github/connect/start") {
    return handleGithubConnectStart(env, request, plexusPrincipal);
  }
  if (method === "GET" && pathname === "/v1/github/actor") {
    return handleGithubActor(env, plexusPrincipal);
  }
  if (method === "POST" && pathname === "/v1/github/actor/enroll/start") {
    return handleGithubActorEnrollStart(env, plexusPrincipal);
  }
  if (method === "GET" && pathname === "/v1/github/repositories") {
    return handleGithubRepositories(env, plexusPrincipal);
  }
  const githubRepoVerifyMatch = pathname.match(/^\/v1\/projects\/([^/]+)\/github-repo\/verify$/);
  if (method === "POST" && githubRepoVerifyMatch) {
    return handleGithubRepoVerify(env, request, githubRepoVerifyMatch[1], plexusPrincipal);
  }
  const githubActivityMatch = pathname.match(/^\/v1\/projects\/([^/]+)\/github-activity\/sync$/);
  if (method === "POST" && githubActivityMatch) {
    return handleGithubActivitySync(env, request, githubActivityMatch[1], plexusPrincipal);
  }
  const githubPullRequestMatch = pathname.match(/^\/v1\/projects\/([^/]+)\/github-pull-requests$/);
  if (method === "POST" && githubPullRequestMatch) {
    return handleGithubPullRequest(env, request, githubPullRequestMatch[1], plexusPrincipal);
  }

  // Time entries (Plexus employee tracker → canonical store) + one-time Clockify cutover backfill
  if (method === "POST" && pathname === "/v1/time-entries/backfill-clockify") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleBackfillClockify(env, request, url);
  }
  if (method === "POST" && pathname === "/v1/time-entries") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handlePostTimeEntries(env, request, plexusPrincipal);
  }
  if (method === "GET" && pathname === "/v1/time-entries") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleGetTimeEntries(env, url, plexusPrincipal);
  }

  // Projects
  if (method === "GET" && pathname === "/v1/projects") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    if (plexusPrincipal && !url.searchParams.has("workspace_id")) {
      url.searchParams.set("workspace_id", plexusPrincipal.workspaceId);
    }
    return handleGetProjects(env, url);
  }
  const projectMatch = pathname.match(/^\/v1\/projects\/([^/]+)$/);
  if (method === "PUT" && projectMatch) {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handlePutProject(env, projectMatch[1], request);
  }
  if (method === "GET" && pathname === "/v1/client-profiles") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleGetClientProfiles(env, url);
  }
  const clientProfileMatch = pathname.match(/^\/v1\/client-profiles\/([^/]+)$/);
  if (method === "GET" && clientProfileMatch) {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleGetClientProfile(env, clientProfileMatch[1], url);
  }
  if (method === "PUT" && clientProfileMatch) {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handlePutClientProfile(env, clientProfileMatch[1], request);
  }
  if (method === "GET" && pathname === "/v1/onboarding-flows") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleGetOnboardingFlows(env, url);
  }
  if (method === "PUT" && pathname === "/v1/onboarding-flows") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handlePutOnboardingFlows(env, request);
  }

  // Project mappings — alias to projects with mapping context
  if (method === "GET" && pathname === "/v1/project-mappings") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleGetProjectMappings(env, url);
  }
  if (method === "GET" && pathname === "/v1/project-mappings/issues") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleGetProjectMappingIssues(env, url);
  }
  const mappingMatch = pathname.match(/^\/v1\/project-mappings\/([^/]+)$/);
  if (method === "PUT" && mappingMatch) {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handlePutProjectMappings(env, mappingMatch[1], request);
  }
  const controlPlaneMatch = pathname.match(/^\/v1\/project-mappings\/([^/]+)\/control-plane$/);
  if (method === "GET" && controlPlaneMatch) {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleGetProjectControlPlane(env, controlPlaneMatch[1]);
  }
  const projectActionMatch = pathname.match(/^\/v1\/project-mappings\/([^/]+)\/actions$/);
  if (method === "POST" && projectActionMatch) {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handlePostProjectAction(env, projectActionMatch[1], request);
  }

  // Credentials (shared integration tokens)
  if (method === "GET" && pathname === "/v1/credentials") {
    return handleGetCredentials(env, url, request);
  }

  // Connections
  if (method === "GET" && pathname === "/v1/connections") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleGetConnections(env, url);
  }
  const connTestMatch = pathname.match(/^\/v1\/connections\/([^/]+)\/test$/);
  if (method === "POST" && connTestMatch) {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleTestConnection(env, connTestMatch[1], request);
  }

  // Sync
  if (method === "POST" && pathname === "/v1/sync/jobs") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handlePostSyncJob(env, request);
  }
  const syncJobMatch = pathname.match(/^\/v1\/sync\/jobs\/([^/]+)$/);
  if (method === "GET" && syncJobMatch) {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleGetSyncJob(env, syncJobMatch[1]);
  }
  if (method === "GET" && pathname === "/v1/sync/runs") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleGetSyncRuns(env, url);
  }

  // OTA
  if (method === "GET" && pathname === "/v1/ota/check") {
    return handleOtaCheck(env, url);
  }
  if (method === "POST" && pathname === "/v1/ota/install-events") {
    return handleOtaInstallEvent(env, request);
  }

  // Team snapshot
  if (method === "GET" && pathname === "/v1/team/snapshot") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    if (plexusPrincipal && !url.searchParams.has("workspace_id")) {
      url.searchParams.set("workspace_id", plexusPrincipal.workspaceId);
    }
    return handleGetTeamSnapshot(env, url);
  }
  if (method === "POST" && pathname === "/v1/team/refresh") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handlePostTeamRefresh(env, request);
  }

  // Realtime workspace — Cloudflare Access identity required. Bearer/internal
  // m2m callers cannot join rooms because media consent and participant audit
  // are tied to a registered Plexus principal.
  if (pathname.startsWith("/v1/realtime/")) {
    if (!plexusPrincipal) {
      return jsonError(
        { code: "access_identity_required", message: "Registered Cloudflare Access identity required for realtime workspace.", retryable: false },
        401,
        pathname.startsWith("/v1/realtime/presence") ? { headers: { "cache-control": "no-store" } } : undefined,
      );
    }

    if (method === "POST" && pathname === "/v1/realtime/presence/session") {
      return handleCreatePresenceSession(env, request, plexusPrincipal);
    }
    if (method === "POST" && pathname === "/v1/realtime/presence/heartbeat") {
      return handlePresenceHeartbeat(env, request, plexusPrincipal);
    }
    if (method === "GET" && pathname === "/v1/realtime/presence") {
      return handleGetPresence(env, plexusPrincipal);
    }
    const deletePresenceMatch = pathname.match(/^\/v1\/realtime\/presence\/([^/]+)\/([^/]+)$/);
    if (method === "DELETE" && deletePresenceMatch) {
      return handleDeletePresenceSession(
        env,
        decodeURIComponent(deletePresenceMatch[1]),
        decodeURIComponent(deletePresenceMatch[2]),
        plexusPrincipal,
      );
    }

    if (method === "GET" && pathname === "/v1/realtime/rooms") {
      return handleGetRealtimeRooms(env, url, plexusPrincipal);
    }
    if (method === "POST" && pathname === "/v1/realtime/rooms") {
      return handlePostRealtimeRoom(env, request, plexusPrincipal);
    }

    const roomMatch = pathname.match(/^\/v1\/realtime\/rooms\/([^/]+)$/);
    if (method === "GET" && roomMatch) {
      return handleGetRealtimeRoom(env, decodeURIComponent(roomMatch[1]), plexusPrincipal);
    }
    const joinRoomMatch = pathname.match(/^\/v1\/realtime\/rooms\/([^/]+)\/join$/);
    if (method === "POST" && joinRoomMatch) {
      return handleJoinRealtimeRoom(env, request, decodeURIComponent(joinRoomMatch[1]), plexusPrincipal);
    }

    const tracksMatch = pathname.match(/^\/v1\/realtime\/calls\/([^/]+)\/tracks$/);
    if (method === "POST" && tracksMatch) {
      return handlePostRealtimeTrack(env, request, decodeURIComponent(tracksMatch[1]), plexusPrincipal);
    }
    const closeTrackMatch = pathname.match(/^\/v1\/realtime\/calls\/([^/]+)\/tracks\/([^/]+)\/close$/);
    if (method === "POST" && closeTrackMatch) {
      return handleCloseRealtimeTrack(env, decodeURIComponent(closeTrackMatch[1]), decodeURIComponent(closeTrackMatch[2]), plexusPrincipal);
    }

    const leaveCallMatch = pathname.match(/^\/v1\/realtime\/calls\/([^/]+)\/leave$/);
    if (method === "POST" && leaveCallMatch) {
      return handleLeaveRealtimeCall(env, request, decodeURIComponent(leaveCallMatch[1]), plexusPrincipal);
    }
    const endCallMatch = pathname.match(/^\/v1\/realtime\/calls\/([^/]+)\/end$/);
    if (method === "POST" && endCallMatch) {
      return handleEndRealtimeCall(env, decodeURIComponent(endCallMatch[1]), plexusPrincipal);
    }
    const closeoutMatch = pathname.match(/^\/v1\/realtime\/calls\/([^/]+)\/closeout$/);
    if (method === "POST" && closeoutMatch) {
      return handleRealtimeCloseout(env, request, decodeURIComponent(closeoutMatch[1]), plexusPrincipal);
    }

    const meetingMatch = pathname.match(/^\/v1\/realtime\/meetings\/([^/]+)$/);
    if (method === "GET" && meetingMatch) {
      return handleGetRealtimeMeeting(env, decodeURIComponent(meetingMatch[1]), plexusPrincipal);
    }
  }

  // Huly normalization
  if (method === "POST" && pathname === "/v1/huly/normalization/preview") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleNormalizationPreview(env, request);
  }
  if (method === "POST" && pathname === "/v1/huly/normalization/apply") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleNormalizationApply(env, request);
  }
  if (method === "GET" && pathname === "/v1/huly/normalization/history") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleGetNormalizationHistory(env, url);
  }

  // Handoffs — 2026-06-09 (Hermes Telegram command surface + vault handoffs/ protocol)
  // Auth: app-level Bearer (after CF Access edge protection for MultiCA/Hermes callers)
  const DEFAULT_WORKSPACE_ID = "thoughtseed-primary";

  if (method === "GET" && pathname === "/v1/handoffs") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    const statusParam = url.searchParams.get("status") as "pending" | "approved" | "rejected" | null;
    const handoffs = await listHandoffs(env.TEAMFORGE_DB!, DEFAULT_WORKSPACE_ID, statusParam || undefined);
    return jsonOk({ handoffs });
  }

  const handoffMatch = pathname.match(/^\/v1\/handoffs\/([^/]+)$/);
  if (method === "GET" && handoffMatch) {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    const handoff = await getHandoffById(env.TEAMFORGE_DB!, DEFAULT_WORKSPACE_ID, handoffMatch[1]);
    if (!handoff) {
      return jsonError({ code: "not_found", message: "Handoff not found", retryable: false }, 404);
    }
    return jsonOk(handoff);
  }

  if (method === "PUT" && handoffMatch) {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    const body = (await request.json()) as { status?: "approved" | "rejected"; reason?: string | null };
    try {
      const updated = await updateHandoffStatus(env.TEAMFORGE_DB!, DEFAULT_WORKSPACE_ID, handoffMatch[1], {
        status: body.status,
      });
      return jsonOk(updated);
    } catch (err: any) {
      return jsonError({ code: "invalid_transition", message: err?.message || "Invalid status transition", retryable: false }, 400);
    }
  }

  if (method === "POST" && pathname === "/v1/handoffs") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    const body = (await request.json()) as HandoffInput;
    const created = await createHandoff(env.TEAMFORGE_DB!, DEFAULT_WORKSPACE_ID, body);
    return jsonOk(created);
  }

  // ── Hermes Phase 1: Command intake (POST intent + GET run) ──────
  // Single intake endpoint for the founder command vocabulary. Persists a
  // command_run + audit trail in D1; downstream execution (MultiCA/Paperclip)
  // happens in Phase 2/3 via callbacks. local_worker commands flip to
  // "accepted" immediately; downstream routes stay in "created" until callback.
  if (method === "POST" && pathname === "/v1/commands/intent") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleCommandIntent(env, request, resolveCommandPrincipal());
  }
  // Phase B: queue interface — the cambium-bridge teamforge-consumer polls this
  // every ~5s to pick up new runs (state=created, route=downstream_multica),
  // then dispatches via `multica issue assign` and posts back via the Phase 2
  // callback route. Must be matched BEFORE the regex below so the literal
  // /v1/commands/runs path doesn't fall through unmatched.
  if (method === "GET" && pathname === "/v1/commands/runs") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleListCommandRuns(env, url);
  }
  // Phase 2: MultiCA result callback. Auth is the HMAC verifier inside the handler
  // (NOT requireAppOrInternalAuth) because MultiCA's ECS task role has no CF
  // Access JWT and no app Bearer — the shared secret signs each request.
  const commandRunResultMatch = pathname.match(/^\/v1\/commands\/runs\/([^/]+)\/result$/);
  if (method === "POST" && commandRunResultMatch) {
    return handleCommandsCallback(env, request, commandRunResultMatch[1]);
  }
  const commandRunIdMatch = pathname.match(/^\/v1\/commands\/runs\/([^/]+)$/);
  if (method === "GET" && commandRunIdMatch) {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleGetCommandRun(env, commandRunIdMatch[1]);
  }

  // ── Phase 7: Member Provisioning ────────────────────────────────
  // Returns a scoped member bundle (id, name, Paperclip repo root, MultiCA
  // config) so the Plexus client can run setup-member.sh without storing
  // device secrets. Requires a verified Cloudflare Access identity.
  if (method === "GET" && pathname === "/v1/member/provision") {
    if (!plexusPrincipal) {
      return jsonError(
        { code: "access_identity_required", message: "Registered Cloudflare Access identity required for provisioning.", retryable: false },
        401,
      );
    }
    return jsonOk({
      memberId: plexusPrincipal.employeeId ?? plexusPrincipal.identityId,
      memberName: plexusPrincipal.displayName,
      workspaceId: plexusPrincipal.workspaceId,
      paperclipRepoRoot: env.TF_PAPERCLIP_REPO_ROOT || undefined,
      multica: {
        apiUrl: env.MULTICA_API_URL || undefined,
        appUrl: env.MULTICA_APP_URL || undefined,
        workspaceId: env.MULTICA_WORKSPACE_ID || undefined,
      },
      features: {
        agentFabricEnabled: true,
        standupEnabled: true,
        weeklyReportEnabled: true,
      },
    });
  }

  // ── Phase 9: Member Preferences ─────────────────────────────────
  if (method === "PUT" && pathname === "/v1/member/preferences") {
    if (!plexusPrincipal) {
      return jsonError(
        { code: "access_identity_required", message: "Registered Cloudflare Access identity required.", retryable: false },
        401,
      );
    }
    const body = (await request.json()) as Record<string, unknown>;
    await setPreferences(env, plexusPrincipal, body);
    return jsonOk({ saved: true, identityId: plexusPrincipal.identityId, employeeId: plexusPrincipal.employeeId });
  }

  if (method === "GET" && pathname === "/v1/member/preferences") {
    if (!plexusPrincipal) {
      return jsonError(
        { code: "access_identity_required", message: "Registered Cloudflare Access identity required.", retryable: false },
        401,
      );
    }
    return jsonOk(await getPreferences(env, plexusPrincipal));
  }

  if (method === "PUT" && pathname === "/v1/member/onboarding") {
    if (!plexusPrincipal) {
      return jsonError(
        { code: "access_identity_required", message: "Registered Cloudflare Access identity required.", retryable: false },
        401,
      );
    }
    const body = (await request.json()) as { stepId?: string; state?: string; metadata?: Record<string, unknown> };
    if (!body.stepId || !body.state) {
      return jsonError(
        { code: "missing_onboarding_fields", message: "stepId and state are required.", retryable: false },
        400,
      );
    }
    try {
      return jsonOk(await updateOnboardingStep(env, plexusPrincipal, body.stepId, body.state, body.metadata ?? {}));
    } catch (err: any) {
      return jsonError({ code: "invalid_onboarding_state", message: err?.message ?? "Invalid onboarding state.", retryable: false }, 400);
    }
  }

  if (method === "GET" && pathname === "/v1/admin/demo") {
    if (!plexusPrincipal) {
      return jsonError(
        { code: "access_identity_required", message: "Registered Cloudflare Access identity required.", retryable: false },
        401,
      );
    }
    if (plexusPrincipal.role !== "admin") {
      return jsonError(
        { code: "admin_required", message: "Admin role required.", retryable: false },
        403,
      );
    }
    return jsonOk(await getAdminDemoOverview(env, plexusPrincipal));
  }

  if (method === "PUT" && pathname === "/v1/admin/demo/onboarding") {
    if (!plexusPrincipal) {
      return jsonError(
        { code: "access_identity_required", message: "Registered Cloudflare Access identity required.", retryable: false },
        401,
      );
    }
    if (plexusPrincipal.role !== "admin") {
      return jsonError(
        { code: "admin_required", message: "Admin role required.", retryable: false },
        403,
      );
    }
    const body = (await request.json()) as {
      identityId?: string;
      stepId?: string;
      state?: string;
      metadata?: Record<string, unknown>;
    };
    if (!body.identityId || !body.stepId || !body.state) {
      return jsonError(
        { code: "missing_admin_onboarding_fields", message: "identityId, stepId, and state are required.", retryable: false },
        400,
      );
    }
    try {
      return jsonOk(await updateAdminDemoOnboarding(env, plexusPrincipal, body.identityId, body.stepId, body.state, body.metadata ?? {}));
    } catch (err: any) {
      return jsonError({ code: "invalid_admin_onboarding_state", message: err?.message ?? "Invalid onboarding state.", retryable: false }, 400);
    }
  }

  // ── Phase 8: Member KPI Summary (canonical D1 data) ─────────────
  if (method === "GET" && pathname === "/v1/member/kpi") {
    if (!plexusPrincipal) {
      return jsonError(
        { code: "access_identity_required", message: "Registered Cloudflare Access identity required.", retryable: false },
        401,
      );
    }
    if (!plexusPrincipal.employeeId && plexusPrincipal.role !== "admin") {
      return jsonError(
        { code: "employee_not_found", message: `No active employee is linked to ${plexusPrincipal.email}.`, retryable: false },
        404,
      );
    }
    const today = new Date().toISOString().slice(0, 10);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    const ws = weekStart.toISOString().slice(0, 10);

    const todaySeconds = await queryFirst<{ total: number }>(
      env.TEAMFORGE_DB!,
      `SELECT COALESCE(SUM(duration_seconds),0) as total FROM time_entries
       WHERE workspace_id = ? ${plexusPrincipal.role === "employee" ? "AND employee_id = ?" : ""}
         AND start_time >= ? AND start_time < ?`,
      ...(plexusPrincipal.role === "employee"
        ? [plexusPrincipal.workspaceId, plexusPrincipal.employeeId, `${today}T00:00:00Z`, `${today}T23:59:59Z`]
        : [plexusPrincipal.workspaceId, `${today}T00:00:00Z`, `${today}T23:59:59Z`]),
    );
    const weekSeconds = await queryFirst<{ total: number }>(
      env.TEAMFORGE_DB!,
      `SELECT COALESCE(SUM(duration_seconds),0) as total FROM time_entries
       WHERE workspace_id = ? ${plexusPrincipal.role === "employee" ? "AND employee_id = ?" : ""}
         AND start_time >= ? AND start_time < ?`,
      ...(plexusPrincipal.role === "employee"
        ? [plexusPrincipal.workspaceId, plexusPrincipal.employeeId, `${ws}T00:00:00Z`, `${today}T23:59:59Z`]
        : [plexusPrincipal.workspaceId, `${ws}T00:00:00Z`, `${today}T23:59:59Z`]),
    );
    const projectBreakdown = await queryAll<{ project_id: string; total: number }>(
      env.TEAMFORGE_DB!,
      `SELECT project_id, SUM(duration_seconds) as total FROM time_entries
       WHERE workspace_id = ? ${plexusPrincipal.role === "employee" ? "AND employee_id = ?" : ""}
         AND start_time >= ? AND start_time < ?
       GROUP BY project_id ORDER BY total DESC LIMIT 10`,
      ...(plexusPrincipal.role === "employee"
        ? [plexusPrincipal.workspaceId, plexusPrincipal.employeeId, `${ws}T00:00:00Z`, `${today}T23:59:59Z`]
        : [plexusPrincipal.workspaceId, `${ws}T00:00:00Z`, `${today}T23:59:59Z`]),
    );

    return jsonOk({
      todaySeconds: todaySeconds?.total ?? 0,
      weekSeconds: weekSeconds?.total ?? 0,
      projectBreakdown: Object.fromEntries(projectBreakdown.map((r) => [r.project_id || 'untagged', r.total])),
      standupCompliant: (todaySeconds?.total ?? 0) > 0,
    });
  }

  return jsonNotImplemented(pathname, method);
}

async function buildBootstrapPayload(env: Env): Promise<Record<string, unknown>> {
  const database = await probeDatabase(env);
  return {
    service: "teamforge-api",
    phase: "phase-2-wave-3",
    environment: env.TF_ENV,
    defaultOtaChannel: env.TF_DEFAULT_OTA_CHANNEL ?? "stable",
    bindings: {
      d1Available: database.available,
      schemaReady: database.schemaReady,
      artifactsBound: Boolean(env.TEAMFORGE_ARTIFACTS),
      syncQueueBound: Boolean(env.SYNC_QUEUE),
      workspaceLocksBound: Boolean(env.WORKSPACE_LOCKS),
    },
    routeStatus: {
      bootstrap: "live",
      remoteConfig: "live",
      projects: "live",
      clientProfiles: "live",
      onboardingFlows: "live",
      projectMappings: "live",
      connections: "live",
      sync: "live",
      teamSnapshot: "live",
      realtime: "live",
      hulyNormalization: "live",
      ota: "live",
      handoffs: "live",
      timeEntries: "live",
      whoami: "live",
    },
  };
}

async function probeDatabase(env: Env): Promise<DatabaseStatus> {
  if (!env.TEAMFORGE_DB) return { available: false, schemaReady: false };
  try {
    const row = await env.TEAMFORGE_DB.prepare(
      "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'organizations') AS schema_ready",
    ).first<{ schema_ready?: number }>();
    return { available: true, schemaReady: Boolean(row?.schema_ready) };
  } catch {
    return { available: false, schemaReady: false };
  }
}
