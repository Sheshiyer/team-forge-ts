import { invoke } from "@tauri-apps/api/core";
import type {
  ClockifyUser,
  ClockifyWorkspace,
  OverviewData,
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
  PaperclipLaunchResult,
  PaperclipUiOpenResult,
  ActivityItem,
  PresenceStatus,
  Employee,
  SyncState,
  OrgChartView,
  TeamSnapshotView,
  OrgDepartmentUpdateInput,
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
  DeviceView,
  KnowledgeArticleView,
  SprintDetailView,
  MonthlyHoursView,
  TrainingTrackView,
  TrainingStatusRow,
  SkillsMatrixCell,
  OnboardingAudience,
  OnboardingFlowView,
  PlannerSlotView,
  CredentialSyncResult,
  CloudIntegrationSyncResult,
  GitHubSyncReport,
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
  launchPaperclipScript: (scriptPath: string, workingDir: string | null) =>
    invoke<PaperclipLaunchResult>("launch_paperclip_script", {
      scriptPath,
      workingDir,
    }),
  openPaperclipUi: (url: string) =>
    invoke<PaperclipUiOpenResult>("open_paperclip_ui", { url }),
  triggerSync: () => invoke<string>("trigger_sync"),
  getOverview: () => invoke<OverviewData>("get_overview"),
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
  getTeamSnapshot: () => invoke<TeamSnapshotView>("get_team_snapshot"),
  refreshTeamSnapshot: () => invoke<TeamSnapshotView>("refresh_team_snapshot"),
  getOrgChart: () => invoke<OrgChartView>("get_org_chart"),
  applyOrgChartMapping: (mappings: OrgDepartmentUpdateInput[]) =>
    invoke<string>("apply_org_chart_mapping", { mappings }),
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
  getDevices: () => invoke<DeviceView[]>("get_devices"),
  getKnowledgeArticles: () =>
    invoke<KnowledgeArticleView[]>("get_knowledge_articles"),
  getSprintDetail: (sprintId: string) =>
    invoke<SprintDetailView>("get_sprint_detail", { sprintId }),
  getMonthlyHours: () => invoke<MonthlyHoursView[]>("get_monthly_hours"),
  getTrainingTracks: () =>
    invoke<TrainingTrackView[]>("get_training_tracks"),
  getTrainingStatus: () =>
    invoke<TrainingStatusRow[]>("get_training_status"),
  getSkillsMatrix: () =>
    invoke<SkillsMatrixCell[]>("get_skills_matrix"),
  getOnboardingFlows: () =>
    invoke<OnboardingFlowView[]>("get_onboarding_flows"),
  getPlannerCapacity: () =>
    invoke<PlannerSlotView[]>("get_planner_capacity"),
  syncCloudCredentials: () =>
    invoke<CredentialSyncResult>("sync_cloud_credentials"),
  syncCloudIntegrations: () =>
    invoke<CloudIntegrationSyncResult>("sync_cloud_integrations"),
  syncGitHubPlans: () =>
    invoke<GitHubSyncReport[]>("sync_github_plans"),
};

export function useInvoke() {
  return invokeApi;
}
