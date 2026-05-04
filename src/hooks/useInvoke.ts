import { invoke } from "@tauri-apps/api/core";
import type {
  ClockifyUser,
  ClockifyWorkspace,
  OverviewData,
  FounderCommandCenterView,
  QuotaRow,
  TimeEntry,
  ProjectStats,
  ProjectCatalogItem,
  ExecutionProjectsResponse,
  TeamforgeClientProfile,
  TeamforgeOnboardingFlow,
  TeamforgeProjectGraph,
  TeamforgeProjectControlPlane,
  TeamforgeProjectInput,
  TeamforgeProjectActionInput,
  VaultDirectoryValidation,
  LocalWorkspaceStatus,
  LocalVaultSyncReport,
  PaperclipApiProbeResult,
  PaperclipAgentDetailView,
  PaperclipEscalationInput,
  PaperclipEscalationResponse,
  PaperclipFounderQueueView,
  PaperclipLaunchResult,
  PaperclipApprovalQueueView,
  PaperclipApprovalResolveInput,
  PaperclipApprovalResolveResult,
  PaperclipOrgView,
  PaperclipPersonalContext,
  PaperclipRoomDefinition,
  PaperclipRuntimeOperationRequest,
  PaperclipRuntimeOperationResult,
  PaperclipRuntimeStatusView,
  PaperclipRuntimeOverview,
  PaperclipStartupResult,
  PaperclipTelemetryItem,
  PaperclipUiOpenResult,
  PaperclipUser,
  ActivityItem,
  PresenceStatus,
  Employee,
  SyncState,
  TeamSnapshotView,
  MilestoneView,
  TimeDiscrepancy,
  EstimationAccuracy,
  PriorityDistribution,
  DepartmentView,
  LeaveView,
  HolidayView,
  ManualLeaveInput,
  ManualHolidayInput,
  ChatActivityView,
  BoardCardView,
  MeetingLoadView,
  EmployeeSummaryView,
  NamingComplianceStats,
  IssueWithNaming,
  ActiveProjectIssueView,
  StandupReport,
  ClientView,
  ClientDetailView,
  SprintDetailView,
  MonthlyHoursView,
  SkillsMatrixCell,
  OnboardingAudience,
  OnboardingFlowView,
  CredentialSyncResult,
  CloudIntegrationSyncResult,
  GitHubSyncReport,
  HermesDispatchResult,
  EntityRelation,
  EntityRelationInput,
  IdentityMapEntry,
  IdentityOverrideInput,
} from "../lib/types";

const invokeApi = {
  testClockifyConnection: (apiKey: string) =>
    invoke<ClockifyUser>("test_clockify_connection", { apiKey }),
  getClockifyWorkspaces: (apiKey: string) =>
    invoke<ClockifyWorkspace[]>("get_clockify_workspaces", { apiKey }),
  getSettings: () => invoke<Record<string, string>>("get_settings"),
  saveSetting: (key: string, value: string) =>
    invoke<void>("save_setting", { key, value }),
  pickVaultDirectory: () => invoke<string | null>("pick_vault_directory"),
  validateVaultDirectory: (path: string) =>
    invoke<VaultDirectoryValidation>("validate_vault_directory", { path }),
  getLocalWorkspaceStatus: () =>
    invoke<LocalWorkspaceStatus>("get_local_workspace_status"),
  syncLocalVaultToTeamforge: () =>
    invoke<LocalVaultSyncReport>("sync_local_vault_to_teamforge"),
  launchPaperclipScript: (scriptPath: string, workingDir: string | null) =>
    invoke<PaperclipLaunchResult>("launch_paperclip_script", {
      scriptPath,
      workingDir,
    }),
  openPaperclipUi: (url: string) =>
    invoke<PaperclipUiOpenResult>("open_paperclip_ui", { url }),
  ensurePaperclipRuntimeStarted: () =>
    invoke<PaperclipStartupResult>("ensure_paperclip_runtime_started"),
  probePaperclipApi: () =>
    invoke<PaperclipApiProbeResult>("probe_paperclip_api"),
  getPaperclipRuntimeSummary: () =>
    invoke<PaperclipRuntimeOverview>("get_paperclip_runtime_summary"),
  getPaperclipRuntimeStatus: () =>
    invoke<PaperclipRuntimeStatusView>("get_paperclip_runtime_status"),
  runPaperclipWarmStart: (input: PaperclipRuntimeOperationRequest = {}) =>
    invoke<PaperclipRuntimeOperationResult>("run_paperclip_warm_start", {
      input,
    }),
  runPaperclipRefreshStale: (input: PaperclipRuntimeOperationRequest = {}) =>
    invoke<PaperclipRuntimeOperationResult>("run_paperclip_refresh_stale", {
      input,
    }),
  runPaperclipMaintainHeartbeat: (input: PaperclipRuntimeOperationRequest = {}) =>
    invoke<PaperclipRuntimeOperationResult>("run_paperclip_maintain_heartbeat", {
      input,
    }),
  getPaperclipUsers: () =>
    invoke<PaperclipUser[]>("get_paperclip_users"),
  getPaperclipTelemetry: () =>
    invoke<PaperclipTelemetryItem[]>("get_paperclip_telemetry"),
  getPaperclipPersonalContext: (userId: string) =>
    invoke<PaperclipPersonalContext>("get_paperclip_personal_context", {
      userId,
    }),
  getPaperclipRooms: (userId: string) =>
    invoke<PaperclipRoomDefinition[]>("get_paperclip_rooms", { userId }),
  createPaperclipEscalation: (input: PaperclipEscalationInput) =>
    invoke<PaperclipEscalationResponse>("create_paperclip_escalation", {
      input,
    }),
  getPaperclipOrgView: () =>
    invoke<PaperclipOrgView>("get_paperclip_org_view"),
  getPaperclipFounderQueue: () =>
    invoke<PaperclipFounderQueueView>("get_paperclip_founder_queue"),
  getPaperclipAgentDetail: (userId: string) =>
    invoke<PaperclipAgentDetailView>("get_paperclip_agent_detail", { userId }),
  getPaperclipApprovals: () =>
    invoke<PaperclipApprovalQueueView>("get_paperclip_approvals"),
  resolvePaperclipApproval: (taskId: string, input: PaperclipApprovalResolveInput) =>
    invoke<PaperclipApprovalResolveResult>("resolve_paperclip_approval", {
      taskId,
      input,
    }),
  openVaultRelativePath: (relativePath: string) =>
    invoke<string>("open_vault_relative_path", { relativePath }),
  triggerSync: () => invoke<string>("trigger_sync"),
  getOverview: () => invoke<OverviewData>("get_overview"),
  getFounderCommandCenter: () =>
    invoke<FounderCommandCenterView>("get_founder_command_center"),
  getQuotaCompliance: () => invoke<QuotaRow[]>("get_quota_compliance"),
  getTimeEntries: (
    employeeId: string | null,
    start: string,
    end: string
  ) =>
    invoke<TimeEntry[]>("get_time_entries_view", {
      employeeId,
      start,
      end,
    }),
  getProjectBreakdown: (start: string, end: string) =>
    invoke<ProjectStats[]>("get_project_breakdown", { start, end }),
  getProjectsCatalog: () =>
    invoke<ProjectCatalogItem[]>("get_projects_catalog"),
  getExecutionProjects: () =>
    invoke<ExecutionProjectsResponse>("get_execution_projects"),
  getTeamforgeProjects: () =>
    invoke<TeamforgeProjectGraph[]>("get_teamforge_projects"),
  getTeamforgeClientProfiles: () =>
    invoke<TeamforgeClientProfile[]>("get_teamforge_client_profiles"),
  getTeamforgeClientProfile: (clientId: string) =>
    invoke<TeamforgeClientProfile | null>("get_teamforge_client_profile", { clientId }),
  getTeamforgeOnboardingFlows: (audience: OnboardingAudience | null = null) =>
    invoke<TeamforgeOnboardingFlow[]>("get_teamforge_onboarding_flows", { audience }),
  getTeamforgeProjectControlPlane: (projectId: string) =>
    invoke<TeamforgeProjectControlPlane>("get_teamforge_project_control_plane", {
      projectId,
    }),
  saveTeamforgeProject: (input: TeamforgeProjectInput) =>
    invoke<TeamforgeProjectGraph>("save_teamforge_project", { input }),
  runTeamforgeProjectAction: (input: TeamforgeProjectActionInput) =>
    invoke<TeamforgeProjectControlPlane>("run_teamforge_project_action", { input }),
  getActivityFeed: (limit: number) =>
    invoke<ActivityItem[]>("get_activity_feed", { limit }),
  getProjectActivity: (projectId: string, limit: number) =>
    invoke<ActivityItem[]>("get_project_activity", { projectId, limit }),
  getPresenceStatus: () => invoke<PresenceStatus[]>("get_presence_status"),
  getEmployees: () => invoke<Employee[]>("get_employees"),
  updateEmployeeQuota: (employeeId: string, quota: number) =>
    invoke<void>("update_employee_quota", { employeeId, quota }),
  getSyncStatus: () => invoke<SyncState[]>("get_sync_status"),
  getIdentityReviewQueue: (maxConfidence?: number) =>
    invoke<IdentityMapEntry[]>("get_identity_review_queue", { maxConfidence }),
  setIdentityOverride: (input: IdentityOverrideInput) =>
    invoke<string>("set_identity_override", { input }),
  startBackgroundSync: () => invoke<string>("start_background_sync"),
  testHulyConnection: (token: string) =>
    invoke<string>("test_huly_connection", { token }),
  testSlackConnection: (token: string) =>
    invoke<string>("test_slack_connection", { token }),
  triggerHulySync: () => invoke<string>("trigger_huly_sync"),
  triggerSlackSync: () => invoke<string>("trigger_slack_sync"),
  getTeamSnapshot: () => invoke<TeamSnapshotView>("get_team_snapshot"),
  refreshTeamSnapshot: () => invoke<TeamSnapshotView>("refresh_team_snapshot"),
  getMilestones: () => invoke<MilestoneView[]>("get_milestones"),
  getTimeDiscrepancies: () =>
    invoke<TimeDiscrepancy[]>("get_time_discrepancies"),
  getEstimationAccuracy: () =>
    invoke<EstimationAccuracy[]>("get_estimation_accuracy"),
  getPriorityDistribution: () =>
    invoke<PriorityDistribution[]>("get_priority_distribution"),
  getDepartments: () => invoke<DepartmentView[]>("get_departments"),
  getLeaveRequests: () => invoke<LeaveView[]>("get_leave_requests"),
  getHolidays: () => invoke<HolidayView[]>("get_holidays"),
  saveManualLeave: (input: ManualLeaveInput) =>
    invoke<TeamSnapshotView>("save_manual_leave", { input }),
  deleteManualLeave: (id: string) =>
    invoke<TeamSnapshotView>("delete_manual_leave", { id }),
  saveManualHoliday: (input: ManualHolidayInput) =>
    invoke<TeamSnapshotView>("save_manual_holiday", { input }),
  deleteManualHoliday: (id: string) =>
    invoke<TeamSnapshotView>("delete_manual_holiday", { id }),
  getChatActivity: () => invoke<ChatActivityView[]>("get_chat_activity"),
  getBoardCards: () => invoke<BoardCardView[]>("get_board_cards"),
  getMeetingLoad: () => invoke<MeetingLoadView[]>("get_meeting_load"),
  getEmployeeSummary: (employeeId: string) =>
    invoke<EmployeeSummaryView>("get_employee_summary", { employeeId }),
  getNamingCompliance: () =>
    invoke<NamingComplianceStats>("get_naming_compliance"),
  getIssuesWithNaming: () =>
    invoke<IssueWithNaming[]>("get_issues_with_naming"),
  getStandupReport: () =>
    invoke<StandupReport>("get_standup_report"),
  getClients: () => invoke<ClientView[]>("get_clients"),
  getClientDetail: (clientId: string) =>
    invoke<ClientDetailView>("get_client_detail", { clientId }),
  getActiveProjectIssues: () =>
    invoke<ActiveProjectIssueView[]>("get_active_project_issues"),
  getSprintDetail: (sprintId: string) =>
    invoke<SprintDetailView>("get_sprint_detail", { sprintId }),
  getMonthlyHours: () => invoke<MonthlyHoursView[]>("get_monthly_hours"),
  getSkillsMatrix: () =>
    invoke<SkillsMatrixCell[]>("get_skills_matrix"),
  getOnboardingFlows: () =>
    invoke<OnboardingFlowView[]>("get_onboarding_flows"),
  syncCloudCredentials: () =>
    invoke<CredentialSyncResult>("sync_cloud_credentials"),
  syncCloudIntegrations: () =>
    invoke<CloudIntegrationSyncResult>("sync_cloud_integrations"),
  syncGitHubPlans: () =>
    invoke<GitHubSyncReport[]>("sync_github_plans"),
  dispatchHermesCommand: (command: string, args?: string[]) =>
    invoke<HermesDispatchResult>("dispatch_hermes_command", { command, args: args ?? [] }),
  upsertRelation: (input: EntityRelationInput) =>
    invoke<EntityRelation>("upsert_relation", { input }),
  getEntityRelations: (entityType: string, entityId: string) =>
    invoke<EntityRelation[]>("get_entity_relations", { entityType, entityId }),
  getRelationsByType: (relationType: string) =>
    invoke<EntityRelation[]>("get_relations_by_type", { relationType }),
  deleteRelation: (id: number) =>
    invoke<boolean>("delete_relation", { id }),
};

export function useInvoke() {
  return invokeApi;
}
