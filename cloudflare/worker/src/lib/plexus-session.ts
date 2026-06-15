import type { Env } from "./env";
import { execute, nanoid, now, queryAll, queryFirst } from "./db";
import type { AccessIdentity } from "./access";
import { listProjectSummaries } from "./project-registry";

export type PlexusRole = "employee" | "admin";
export type ProjectVisibility = "active" | "all" | "assigned";
export type OnboardingRequirement = "required" | "optional";
export type OnboardingState = "required" | "optional" | "skipped" | "deferred" | "completed" | "failed";

export interface PlexusPrincipal {
  identityId: string;
  email: string;
  displayName: string;
  workspaceId: string;
  role: PlexusRole;
  projectVisibility: ProjectVisibility;
  employeeId: string | null;
  capabilities: Record<string, boolean>;
}

export interface PlexusOnboardingStep {
  stepId: string;
  label: string;
  requirement: OnboardingRequirement;
  state: OnboardingState;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface PlexusOnboardingState {
  steps: PlexusOnboardingStep[];
  requiredComplete: boolean;
  completed: boolean;
}

export interface PlexusSessionPayload {
  email: string;
  access: true;
  identityId: string;
  employeeId: string | null;
  adminId: string | null;
  workspaceId: string;
  role: PlexusRole;
  displayName: string;
  projectVisibility: ProjectVisibility;
  capabilities: Record<string, boolean>;
  onboarding: PlexusOnboardingState;
}

interface IdentityRow {
  id: string;
  workspace_id: string;
  email: string;
  employee_id: string | null;
  display_name: string;
  role: PlexusRole;
  project_visibility: ProjectVisibility;
  capabilities_json: string | null;
  is_active: number;
}

interface EmployeeRow {
  id: string;
  workspace_id: string;
  display_name: string;
  email: string;
  is_active: number;
}

interface OnboardingRow {
  step_id: string;
  label: string;
  requirement: OnboardingRequirement;
  state: OnboardingState;
  metadata_json: string | null;
  updated_at: string;
}

const ADMIN_EMAIL = "thoughtseedlabs@gmail.com";
const ADMIN_ID = "pid_admin_thoughtseed_labs";

const DEFAULT_STEPS: Array<{
  stepId: string;
  label: string;
  requirement: OnboardingRequirement;
  initialState: OnboardingState;
}> = [
  { stepId: "identity_projects", label: "Identity and project access", requirement: "required", initialState: "required" },
  { stepId: "preferences", label: "Personal preferences", requirement: "optional", initialState: "optional" },
  { stepId: "paperclip", label: "Paperclip / Vapor Clip agent fabric", requirement: "optional", initialState: "optional" },
  { stepId: "daily_agent", label: "Daily agent and standup", requirement: "optional", initialState: "optional" },
];

function parseCapabilities(value: string | null, role: PlexusRole): Record<string, boolean> {
  const fallback = {
    timer: true,
    projects: true,
    preferences: true,
    agentFabric: true,
    adminDemo: role === "admin",
    allProjects: role === "admin",
    employeeEmulation: role === "admin",
  };
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return { ...fallback, ...Object.fromEntries(Object.entries(parsed).map(([key, val]) => [key, Boolean(val)])) };
  } catch {
    return fallback;
  }
}

function parseMetadata(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function mapPrincipal(row: IdentityRow): PlexusPrincipal {
  return {
    identityId: row.id,
    email: row.email.toLowerCase(),
    displayName: row.display_name,
    workspaceId: row.workspace_id,
    role: row.role,
    projectVisibility: row.project_visibility,
    employeeId: row.employee_id,
    capabilities: parseCapabilities(row.capabilities_json, row.role),
  };
}

function mapOnboardingStep(row: OnboardingRow): PlexusOnboardingStep {
  return {
    stepId: row.step_id,
    label: row.label,
    requirement: row.requirement,
    state: row.state,
    updatedAt: row.updated_at,
    metadata: parseMetadata(row.metadata_json),
  };
}

async function insertDefaultSteps(env: Env, principal: PlexusPrincipal): Promise<void> {
  if (!env.TEAMFORGE_DB) return;
  const ts = now();
  for (const step of DEFAULT_STEPS) {
    await execute(
      env.TEAMFORGE_DB,
      `INSERT OR IGNORE INTO plexus_onboarding_steps
         (id, identity_id, workspace_id, step_id, label, requirement, state, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      `onb_${principal.identityId}_${step.stepId}`,
      principal.identityId,
      principal.workspaceId,
      step.stepId,
      step.label,
      step.requirement,
      step.initialState,
      "{}",
      ts,
      ts,
    );
  }
}

async function createEmployeeIdentity(env: Env, employee: EmployeeRow): Promise<IdentityRow> {
  const ts = now();
  const id = `pid_${employee.id}`;
  await execute(
    env.TEAMFORGE_DB!,
    `INSERT OR IGNORE INTO plexus_identities
       (id, workspace_id, email, employee_id, display_name, role, project_visibility, capabilities_json, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    employee.workspace_id,
    employee.email.toLowerCase(),
    employee.id,
    employee.display_name,
    "employee",
    "active",
    JSON.stringify({ timer: true, projects: true, preferences: true, agentFabric: true, adminDemo: false }),
    employee.is_active,
    ts,
    ts,
  );
  const row = await queryFirst<IdentityRow>(
    env.TEAMFORGE_DB!,
    "SELECT * FROM plexus_identities WHERE id = ? LIMIT 1",
    id,
  );
  if (!row) throw new Error("Failed to create Plexus employee identity.");
  return row;
}

async function getIdentityByEmail(env: Env, email: string): Promise<IdentityRow | null> {
  if (!env.TEAMFORGE_DB) return null;
  return queryFirst<IdentityRow>(
    env.TEAMFORGE_DB,
    "SELECT * FROM plexus_identities WHERE LOWER(email) = ? AND is_active = 1 LIMIT 1",
    email.toLowerCase(),
  );
}

async function getEmployeeByEmail(env: Env, email: string): Promise<EmployeeRow | null> {
  if (!env.TEAMFORGE_DB) return null;
  return queryFirst<EmployeeRow>(
    env.TEAMFORGE_DB,
    "SELECT id, workspace_id, display_name, LOWER(email) AS email, is_active FROM employees WHERE LOWER(email) = ? AND is_active = 1 LIMIT 1",
    email.toLowerCase(),
  );
}

async function getOnboardingState(env: Env, principal: PlexusPrincipal): Promise<PlexusOnboardingState> {
  await insertDefaultSteps(env, principal);
  const rows = await queryAll<OnboardingRow>(
    env.TEAMFORGE_DB!,
    `SELECT step_id, label, requirement, state, metadata_json, updated_at
       FROM plexus_onboarding_steps
      WHERE identity_id = ?
      ORDER BY CASE step_id
        WHEN 'identity_projects' THEN 1
        WHEN 'preferences' THEN 2
        WHEN 'paperclip' THEN 3
        WHEN 'daily_agent' THEN 4
        ELSE 99
      END`,
    principal.identityId,
  );
  const steps = rows.map(mapOnboardingStep);
  const requiredComplete = steps
    .filter((step) => step.requirement === "required")
    .every((step) => step.state === "completed");
  const completed = requiredComplete && steps.every((step) => step.state === "completed" || step.state === "skipped");
  return { steps, requiredComplete, completed };
}

export async function resolvePlexusPrincipal(
  env: Env,
  accessIdentity: AccessIdentity | null,
): Promise<PlexusPrincipal | null> {
  if (!accessIdentity || !env.TEAMFORGE_DB) return null;
  const email = accessIdentity.email.toLowerCase();

  const identity = await getIdentityByEmail(env, email);
  if (identity) return mapPrincipal(identity);

  const employee = await getEmployeeByEmail(env, email);
  if (employee) return mapPrincipal(await createEmployeeIdentity(env, employee));

  if (email === ADMIN_EMAIL) {
    const admin = await queryFirst<IdentityRow>(
      env.TEAMFORGE_DB,
      "SELECT * FROM plexus_identities WHERE id = ? AND is_active = 1 LIMIT 1",
      ADMIN_ID,
    );
    if (admin) return mapPrincipal(admin);
  }

  return null;
}

export async function buildPlexusSession(env: Env, principal: PlexusPrincipal): Promise<PlexusSessionPayload> {
  return {
    email: principal.email,
    access: true,
    identityId: principal.identityId,
    employeeId: principal.employeeId,
    adminId: principal.role === "admin" ? principal.identityId : null,
    workspaceId: principal.workspaceId,
    role: principal.role,
    displayName: principal.displayName,
    projectVisibility: principal.projectVisibility,
    capabilities: principal.capabilities,
    onboarding: await getOnboardingState(env, principal),
  };
}

function assertAllowedState(state: string): asserts state is OnboardingState {
  if (!["required", "optional", "skipped", "deferred", "completed", "failed"].includes(state)) {
    throw new Error("Invalid onboarding state.");
  }
}

export async function updateOnboardingStep(
  env: Env,
  principal: PlexusPrincipal,
  stepId: string,
  state: string,
  metadata: Record<string, unknown> = {},
): Promise<PlexusOnboardingState> {
  assertAllowedState(state);
  const current = DEFAULT_STEPS.find((step) => step.stepId === stepId);
  const ts = now();
  await execute(
    env.TEAMFORGE_DB!,
    `INSERT INTO plexus_onboarding_steps
       (id, identity_id, workspace_id, step_id, label, requirement, state, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(identity_id, step_id) DO UPDATE SET
       state = excluded.state,
       metadata_json = excluded.metadata_json,
       updated_at = excluded.updated_at`,
    `onb_${principal.identityId}_${stepId}`,
    principal.identityId,
    principal.workspaceId,
    stepId,
    current?.label ?? stepId,
    current?.requirement ?? "optional",
    state,
    JSON.stringify(metadata),
    ts,
    ts,
  );
  return getOnboardingState(env, principal);
}

export async function getPreferences(env: Env, principal: PlexusPrincipal): Promise<Record<string, unknown>> {
  const identityPrefs = await queryFirst<{ preferences_json: string }>(
    env.TEAMFORGE_DB!,
    "SELECT preferences_json FROM plexus_identity_preferences WHERE identity_id = ? LIMIT 1",
    principal.identityId,
  );
  if (identityPrefs?.preferences_json) return parseMetadata(identityPrefs.preferences_json);

  if (!principal.employeeId) return {};
  const employeePrefs = await queryFirst<{ preferences_json: string }>(
    env.TEAMFORGE_DB!,
    "SELECT preferences_json FROM employee_preferences WHERE employee_id = ? LIMIT 1",
    principal.employeeId,
  );
  return parseMetadata(employeePrefs?.preferences_json ?? null);
}

export async function setPreferences(
  env: Env,
  principal: PlexusPrincipal,
  prefs: Record<string, unknown>,
): Promise<void> {
  const ts = now();
  const prefsJson = JSON.stringify(prefs);
  await execute(
    env.TEAMFORGE_DB!,
    `INSERT INTO plexus_identity_preferences (id, identity_id, workspace_id, preferences_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(identity_id) DO UPDATE SET
       preferences_json = excluded.preferences_json,
       updated_at = excluded.updated_at`,
    nanoid(),
    principal.identityId,
    principal.workspaceId,
    prefsJson,
    ts,
    ts,
  );
  if (principal.employeeId) {
    await execute(
      env.TEAMFORGE_DB!,
      `INSERT INTO employee_preferences (id, employee_id, workspace_id, preferences_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(employee_id) DO UPDATE SET
         preferences_json = excluded.preferences_json,
         updated_at = excluded.updated_at`,
      nanoid(),
      principal.employeeId,
      principal.workspaceId,
      prefsJson,
      ts,
      ts,
    );
  }
}

export async function getAdminDemoOverview(env: Env, principal: PlexusPrincipal): Promise<Record<string, unknown>> {
  if (principal.role !== "admin") {
    throw new Error("Admin role required.");
  }
  const identities = await queryAll<IdentityRow>(
    env.TEAMFORGE_DB!,
    "SELECT * FROM plexus_identities WHERE workspace_id = ? AND is_active = 1 ORDER BY role DESC, display_name",
    principal.workspaceId,
  );
  const steps = await queryAll<OnboardingRow & { identity_id: string }>(
    env.TEAMFORGE_DB!,
    `SELECT identity_id, step_id, label, requirement, state, metadata_json, updated_at
       FROM plexus_onboarding_steps
      WHERE workspace_id = ?
      ORDER BY identity_id, step_id`,
    principal.workspaceId,
  );
  const stepsByIdentity = new Map<string, PlexusOnboardingStep[]>();
  for (const step of steps) {
    const current = stepsByIdentity.get(step.identity_id) ?? [];
    current.push(mapOnboardingStep(step));
    stepsByIdentity.set(step.identity_id, current);
  }
  const projects = await listProjectSummaries(env.TEAMFORGE_DB!, principal.workspaceId, "active");
  return {
    workspaceId: principal.workspaceId,
    viewer: await buildPlexusSession(env, principal),
    projects,
    identities: identities.map((row) => {
      const mapped = mapPrincipal(row);
      return {
        identityId: mapped.identityId,
        employeeId: mapped.employeeId,
        email: mapped.email,
        displayName: mapped.displayName,
        role: mapped.role,
        projectVisibility: mapped.projectVisibility,
        capabilities: mapped.capabilities,
        onboarding: {
          steps: stepsByIdentity.get(mapped.identityId) ?? [],
        },
      };
    }),
  };
}

export async function updateAdminDemoOnboarding(
  env: Env,
  principal: PlexusPrincipal,
  identityId: string,
  stepId: string,
  state: string,
  metadata: Record<string, unknown> = {},
): Promise<PlexusOnboardingState> {
  if (principal.role !== "admin") {
    throw new Error("Admin role required.");
  }
  const target = await queryFirst<IdentityRow>(
    env.TEAMFORGE_DB!,
    "SELECT * FROM plexus_identities WHERE id = ? AND workspace_id = ? AND is_active = 1 LIMIT 1",
    identityId,
    principal.workspaceId,
  );
  if (!target) {
    throw new Error("Target identity not found.");
  }
  return updateOnboardingStep(env, mapPrincipal(target), stepId, state, metadata);
}
