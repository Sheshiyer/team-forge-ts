export interface Employee {
  id: string;
  clockifyUserId: string;
  hulyPersonId: string | null;
  name: string;
  email: string;
  avatarUrl: string | null;
  monthlyQuotaHours: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OverviewData {
  teamHoursThisMonth: number;
  teamQuota: number;
  utilizationRate: number;
  activeCount: number;
  totalCount: number;
}

export interface FounderSummaryView {
  teamHoursThisMonth: number;
  teamQuota: number;
  utilizationRate: number;
  activeCount: number;
  totalCount: number;
  activeDeliveryStreams: number;
  canonicalClients: number;
  operationalOnlyClients: number;
  atRiskClients: number;
  onboardingAtRisk: number;
  unresolvedReviewItems: number;
  whiteLabelableCount: number;
  researchNeedsTriage: number;
}

export interface FounderActiveStreamView {
  id: string;
  projectId: string | null;
  title: string;
  source: string;
  status: string;
  repo: string | null;
  milestone: string | null;
  openIssues: number;
  percentComplete: number;
  totalHours: number;
  latestActivity: string | null;
  attention: string;
}

export interface FounderPortfolioSummaryView {
  totalSurfaces: number;
  productCount: number;
  clientDeliveryCount: number;
  activeCount: number;
  pausedCount: number;
  completedCount: number;
  archivedCount: number;
  otherCount: number;
  whiteLabelableCount: number;
}

export interface FounderNeedsReviewItemView {
  id: string;
  category: string;
  title: string;
  signal: string;
  detail: string;
  sourceRelativePath: string | null;
}

export interface FounderNeedsReviewView {
  totalItems: number;
  staleNoteCount: number;
  orphanedIdentityCount: number;
  onboardingRiskCount: number;
  items: FounderNeedsReviewItemView[];
}

export interface VaultPortfolioSurface {
  id: string;
  projectId: string | null;
  clientId: string | null;
  title: string;
  kind: string;
  status: string;
  commercialReuse: string | null;
  clientName: string | null;
  sourceRelativePath: string;
}

export interface VaultCaptureRegistryEntry {
  captured: string | null;
  source: string;
  title: string;
  status: string;
  triageOwner: string | null;
  promotionTarget: string | null;
  rawNote: string | null;
  destination: string | null;
}

export interface VaultResearchHubSummary {
  registryRelativePath: string;
  inboxRelativePath: string;
  totalCaptures: number;
  rawCaptureCount: number;
  needsTriageCount: number;
  routedCount: number;
  promotedCount: number;
  archivedCount: number;
  duplicateCount: number;
  inboxNoteCount: number;
  liveResearchCount: number;
  captures: VaultCaptureRegistryEntry[];
}

export interface FounderCommandCenterView {
  summary: FounderSummaryView;
  activeStreams: FounderActiveStreamView[];
  portfolio: FounderPortfolioSummaryView;
  whiteLabelable: VaultPortfolioSurface[];
  needsReview: FounderNeedsReviewView;
  researchHub: VaultResearchHubSummary;
  paperclipRuntime: PaperclipRuntimeOverview | null;
  paperclipError: string | null;
  vaultError: string | null;
}

export interface QuotaRow {
  employeeName: string;
  thisWeekHours: number;
  thisMonthHours: number;
  quota: number;
  status: "onTrack" | "behind" | "critical";
}

export interface ProjectStats {
  projectId: string | null;
  projectName: string;
  totalHours: number;
  billableHours: number;
  teamMembers: number;
  utilization: number;
}

export interface ProjectCatalogItem {
  id: string;
  name: string;
  clientName: string | null;
  isBillable: boolean;
  isArchived: boolean;
}

export interface ExecutionProjectView {
  id: string;
  teamforgeProjectId: string | null;
  source: string;
  repo: string | null;
  milestone: string | null;
  title: string;
  status: string;
  totalIssues: number;
  openIssues: number;
  closedIssues: number;
  totalPrs: number;
  openPrs: number;
  branches: number;
  failingChecks: number;
  percentComplete: number;
  latestActivity: string | null;
  hulyProjectId: string | null;
  clockifyProjectId: string | null;
  totalHours: number;
  billableHours: number;
  teamMembers: number;
  utilization: number;
}

export interface ExecutionProjectsResponse {
  projects: ExecutionProjectView[];
  sourceError: string | null;
}

export interface TeamforgeProject {
  id: string;
  slug: string;
  name: string;
  portfolioName: string | null;
  clientId: string | null;
  clientName: string | null;
  clockifyProjectId: string | null;
  projectType: string | null;
  status: string;
  syncMode: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamforgeProjectGithubRepoLink {
  projectId: string;
  repo: string;
  displayName: string | null;
  isPrimary: boolean;
  syncIssues: boolean;
  syncMilestones: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TeamforgeProjectHulyLink {
  projectId: string;
  hulyProjectId: string;
  syncIssues: boolean;
  syncMilestones: boolean;
  syncComponents: boolean;
  syncTemplates: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TeamforgeProjectArtifact {
  id: string;
  projectId: string;
  artifactType: string;
  title: string;
  url: string;
  source: string;
  externalId: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TeamforgeClientProfile {
  workspaceId: string;
  clientId: string;
  clientName: string;
  engagementModel: string | null;
  industry: string | null;
  primaryContact: string | null;
  projectIds: string[];
  stakeholders: string[];
  strategicFit: string[];
  risks: string[];
  resourceLinks: string[];
  active: boolean;
  onboarded: string | null;
  createdAt: string;
  updatedAt: string;
  profileCompleteness: number;
}

export interface TeamforgeProjectGraph {
  project: TeamforgeProject;
  githubRepos: TeamforgeProjectGithubRepoLink[];
  hulyLinks: TeamforgeProjectHulyLink[];
  artifacts: TeamforgeProjectArtifact[];
  clientProfile: TeamforgeClientProfile | null;
}

export interface TeamforgeProjectSyncPolicy {
  issuesEnabled: boolean;
  milestonesEnabled: boolean;
  componentsEnabled: boolean;
  templatesEnabled: boolean;
  issueOwnershipMode: string;
  engineeringSource: string;
  executionSource: string;
  milestoneAuthority: string;
  issueClassificationMode: string;
  directionMode: string;
  ruleConfigJson: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeamforgePolicyState {
  syncState: string;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncJobId: string | null;
  pausedAt: string | null;
  pausedBy: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
}

export interface TeamforgeSyncEntityMapping {
  id: string;
  entityType: string;
  title: string;
  status: string | null;
  ownershipDomain: string;
  classificationSource: string;
  classificationReason: string | null;
  mappingStatus: string;
  sourceUrl: string | null;
  githubRepo: string | null;
  githubNumber: number | null;
  hulyProjectId: string | null;
  hulyEntityId: string | null;
  lastSource: string | null;
  lastSourceVersion: string | null;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt: string | null;
}

export interface TeamforgeSyncJournalEntry {
  id: string;
  entityMappingId: string | null;
  entityType: string;
  sourceSystem: string;
  destinationSystem: string;
  action: string;
  status: string;
  sourceRef: string | null;
  destinationRef: string | null;
  payloadHash: string;
  payloadJson: string | null;
  retryCount: number;
  conflictId: string | null;
  jobId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  actorId: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface TeamforgeSyncConflict {
  id: string;
  entityMappingId: string | null;
  entityType: string;
  conflictType: string;
  canonicalSource: string;
  detectedSource: string;
  status: string;
  summary: string;
  githubPayloadJson: string | null;
  hulyPayloadJson: string | null;
  resolutionNote: string | null;
  resolvedBy: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface TeamforgeProjectControlPlaneSummary {
  openConflicts: number;
  mappedMilestones: number;
  engineeringIssues: number;
  executionIssues: number;
  recentFailures: number;
}

export interface TeamforgeProjectControlPlane {
  project: TeamforgeProjectGraph;
  policy: TeamforgeProjectSyncPolicy | null;
  policyState: TeamforgePolicyState;
  entityMappings: TeamforgeSyncEntityMapping[];
  journal: TeamforgeSyncJournalEntry[];
  conflicts: TeamforgeSyncConflict[];
  summary: TeamforgeProjectControlPlaneSummary;
}

export interface VaultDirectoryValidation {
  path: string;
  status: "ready" | "warning" | "error";
  message: string;
  markers: string[];
  hasTeamDirectory: boolean;
  hasClientEcosystemDirectory: boolean;
  hasObsidianDirectory: boolean;
}

export interface PaperclipLaunchResult {
  pid: number;
  scriptPath: string;
  commandPath: string;
  workingDirectory: string | null;
  launchMode: string;
}

export interface PaperclipUiOpenResult {
  url: string;
}

export interface PaperclipStartupResult {
  autoLaunchEnabled: boolean;
  scriptStatus: string;
  scriptMessage: string;
  scriptPid: number | null;
  adapterStatus: string;
  adapterMessage: string;
  adapterPid: number | null;
}

export interface PaperclipUser {
  userId: string;
  userName: string;
  title: string | null;
  department: string | null;
  role: string | null;
  reportsTo: string | null;
  icon: string | null;
}

export interface PaperclipTelemetryItem {
  userId: string;
  userName: string;
  department: string | null;
  role: string | null;
  status: string;
  lastCycle: string | null;
  outcome: string | null;
  steps: number;
  blocked: number;
  stale: boolean;
  uninitialized: boolean;
  missingFiles: number;
}

export interface PaperclipTaskSummary {
  pending: number;
  inProgress: number;
  blocked: number;
  completed: number;
}

export interface PaperclipTask {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  department: string | null;
  tags: string[];
  source: string | null;
  sourceRef: string | null;
  updatedAt: string | null;
  projectCode: string | null;
  projectId: string | null;
  clientId: string | null;
}

export interface PaperclipPersonalContext {
  userId: string;
  userName: string;
  currentKrebs: string | null;
  latestHeartbeatAt: string | null;
  summary: PaperclipTaskSummary;
  tasks: PaperclipTask[];
}

export interface PaperclipRoomDefinition {
  id: string;
  name: string;
  roomType: string;
  description: string | null;
  projectCode: string | null;
  projectName: string | null;
  projectId: string | null;
  clientId: string | null;
}

export interface PaperclipEscalationInput {
  title: string;
  body: string;
  severity?: string | null;
  userId?: string | null;
  projectCode?: string | null;
  projectId?: string | null;
}

export interface PaperclipEscalationResponse {
  id: string;
  issueKey: string;
}

export interface PaperclipRuntimeOverview {
  healthyCount: number;
  staleCount: number;
  uninitializedCount: number;
  totalAgents: number;
  activeTaskCount: number;
  escalationBacklogCount: number;
  latestActivityAt: string | null;
  latestActivityLabel: string | null;
  latestEscalationTitle: string | null;
  latestEscalationAt: string | null;
}

export interface PaperclipApiProbeResult {
  ready: boolean;
  baseUrl: string;
  message: string;
  userCount: number;
  telemetryCount: number;
}

export interface LocalWorkspaceStatus {
  localVaultRoot: string | null;
  vaultValidation: VaultDirectoryValidation;
  paperclipScriptPath: string | null;
  paperclipWorkingDir: string | null;
  paperclipUiUrl: string | null;
  paperclipApiUrl: string | null;
  paperclipApiTokenConfigured: boolean;
  paperclipAutoLaunchEnabled: boolean;
  teamforgeWorkspaceId: string | null;
  teamforgeWorkspaceSource: string;
  teamforgeWorkspaceError: string | null;
  workerBaseUrl: string;
  cloudAccessTokenConfigured: boolean;
  nodeRuntimeVersion: string | null;
  nodeRuntimeError: string | null;
  parityScriptPath: string | null;
  parityScriptSource: string | null;
  parityScriptError: string | null;
  founderSyncReady: boolean;
  founderSyncMessage: string;
}

export interface LocalVaultSyncReport {
  vaultRoot: string;
  workspaceId: string;
  workerBaseUrl: string;
  scriptPath: string;
  scriptSource: string;
  nodeRuntimeVersion: string;
  reportPath: string;
  mode: string;
  projectBriefsFound: number;
  projectCreates: number;
  projectUpdates: number;
  clientProfilesFound: number;
  clientProfilesApplied: number;
  onboardingFlowsFound: number;
  onboardingFlowsApplied: number;
  employeeKpiNotesFound: number;
  employeeKpisApplied: number;
  warnings: string[];
  failures: string[];
  stdoutTail: string;
}

export interface TeamforgeProjectGithubRepoLinkInput {
  repo: string;
  displayName?: string | null;
  isPrimary?: boolean;
  syncIssues?: boolean;
  syncMilestones?: boolean;
}

export interface TeamforgeProjectHulyLinkInput {
  hulyProjectId: string;
  syncIssues?: boolean;
  syncMilestones?: boolean;
  syncComponents?: boolean;
  syncTemplates?: boolean;
}

export interface TeamforgeProjectArtifactInput {
  id?: string;
  artifactType: string;
  title: string;
  url: string;
  source: string;
  externalId?: string | null;
  isPrimary?: boolean;
}

export interface TeamforgeProjectInput {
  id?: string;
  slug?: string | null;
  name: string;
  portfolioName?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  clockifyProjectId?: string | null;
  projectType?: string | null;
  status?: string | null;
  syncMode?: string | null;
  githubRepos?: TeamforgeProjectGithubRepoLinkInput[];
  hulyLinks?: TeamforgeProjectHulyLinkInput[];
  artifacts?: TeamforgeProjectArtifactInput[];
  policy?: Partial<TeamforgeProjectSyncPolicy>;
}

export interface TeamforgeProjectActionInput {
  projectId: string;
  action: string;
  actorId?: string | null;
  mappingId?: string | null;
  ownershipDomain?: string | null;
  reason?: string | null;
  conflictId?: string | null;
  resolutionNote?: string | null;
}

export interface PresenceStatus {
  employeeName: string;
  clockifyTimerActive: boolean;
  clockifyProject: string | null;
  clockifyDuration: number | null;
  hulyLastSeen: string | null;
  combinedStatus: "active" | "idle" | "offline";
}

export interface ActivityItem {
  source: string;
  employeeName: string;
  action: string;
  detail: string | null;
  occurredAt: string;
  projectId: string | null;
  sourceUrl: string | null;
  entityType: string | null;
  status: string | null;
}

export interface GitHubSyncReport {
  repo: string;
  projectId: string;
  milestonesSynced: number;
  issuesSynced: number;
  pullRequestsSynced: number;
  branchesSynced: number;
  checkRunsSynced: number;
  opsEventsUpserted: number;
  totalIssues: number;
  openIssues: number;
  closedIssues: number;
}

export interface TimeEntry {
  id: string;
  employeeId: string;
  projectId: string | null;
  description: string | null;
  startTime: string;
  endTime: string | null;
  durationSeconds: number | null;
  isBillable: boolean;
  syncedAt: string;
}

export interface SyncState {
  source: string;
  entity: string;
  lastSyncAt: string;
  lastCursor: string | null;
}

export interface IdentityMapEntry {
  id: number | null;
  source: string;
  externalId: string;
  employeeId: string | null;
  confidence: number;
  resolutionStatus: string;
  matchMethod: string | null;
  isOverride: boolean;
  overrideBy: string | null;
  overrideReason: string | null;
  overrideAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface IdentityOverrideInput {
  source: string;
  externalId: string;
  employeeId: string;
  operator: string;
  reason: string;
}

export interface ClockifyUser {
  id: string;
  name: string;
  email: string;
  profilePicture: string | null;
  activeWorkspace: string | null;
  status: string | null;
}

export interface ClockifyWorkspace {
  id: string;
  name: string;
}

export interface MilestoneView {
  id: string;
  label: string;
  status: string;
  targetDate: string | null;
  totalIssues: number;
  completedIssues: number;
  progressPercent: number;
  projectName: string | null;
}

export interface TimeDiscrepancy {
  employeeName: string;
  hulyHours: number;
  clockifyHours: number;
  differenceHours: number;
  differencePercent: number;
}

export interface EstimationAccuracy {
  employeeName: string;
  totalIssues: number;
  avgEstimatedHours: number;
  avgActualHours: number;
  accuracyPercent: number;
  chronicUnderEstimator: boolean;
}

export interface PriorityDistribution {
  priority: string;
  count: number;
  assignedCount: number;
  unassignedCount: number;
}

export interface DepartmentView {
  id: string;
  name: string;
  headName: string | null;
  memberCount: number;
  totalHours: number;
  quotaTotal: number;
}

export interface OrgPersonView {
  personId: string;
  employeeId: string | null;
  name: string;
  email: string | null;
  active: boolean;
}

export interface OrgDepartmentMappingView {
  id: string;
  name: string;
  headPersonId: string | null;
  headName: string | null;
  teamLeadPersonId: string | null;
  teamLeadName: string | null;
  memberPersonIds: string[];
}

export interface OrgChartView {
  departments: OrgDepartmentMappingView[];
  people: OrgPersonView[];
}

export interface TeamSnapshotView {
  departments: DepartmentView[];
  orgChart: OrgChartView | null;
  vaultProfiles: VaultTeamProfileView[];
  leaves: LeaveView[];
  holidays: HolidayView[];
  cacheUpdatedAt: string | null;
  hulyError: string | null;
  vaultError: string | null;
}

export interface OrgDepartmentUpdateInput {
  departmentId: string;
  headPersonId: string | null;
  teamLeadPersonId: string | null;
  memberPersonIds: string[];
}

export interface LeaveView {
  id: string;
  employeeId: string | null;
  source: string;
  editable: boolean;
  employeeName: string;
  leaveType: string;
  dateFrom: string;
  dateTo: string;
  status: string;
  days: number;
  note: string | null;
}

export interface HolidayView {
  id: string;
  source: string;
  editable: boolean;
  title: string;
  date: string;
  note: string | null;
}

export interface ManualLeaveInput {
  id?: string | null;
  employeeId: string;
  leaveType: string;
  dateFrom: string;
  dateTo: string;
  status: string;
  note?: string | null;
}

export interface ManualHolidayInput {
  id?: string | null;
  title: string;
  date: string;
  note?: string | null;
}

export interface ChatActivityView {
  employeeName: string;
  messageCount: number;
  channelsActive: number;
  lastMessageAt: string | null;
  sources: string[];
}

export interface BoardCardView {
  id: string;
  title: string;
  status: string;
  assigneeName: string | null;
  daysInStatus: number;
  boardName: string | null;
}

export interface MeetingLoadView {
  employeeName: string;
  meetingsThisWeek: number;
  totalMeetingHours: number;
  workHours: number;
  meetingRatio: number;
}

export interface EmployeeScheduleEventView {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  source: string;
  space: string | null;
}

export interface EmployeeKpiSnapshotView {
  id: string;
  employeeId: string;
  memberId: string;
  title: string;
  roleTemplate: string | null;
  roleTemplateFile: string | null;
  kpiVersion: string;
  lastReviewed: string | null;
  reportsTo: string | null;
  tags: string[];
  sourceFilePath: string;
  sourceRelativePath: string;
  sourceLastModifiedAt: string;
  roleScopeMarkdown: string | null;
  monthlyKpis: string[];
  quarterlyMilestones: string[];
  yearlyMilestones: string[];
  crossRoleDependencies: string[];
  evidenceSources: string[];
  compensationMilestones: string[];
  gapFlags: string[];
  synthesisReviewMarkdown: string | null;
  bodyMarkdown: string;
  importedAt: string;
  updatedAt: string;
}

export interface VaultTeamProfileView {
  memberId: string;
  employeeId: string | null;
  displayName: string;
  role: string | null;
  roleTemplate: string | null;
  department: string | null;
  primaryProjects: string[];
  scope: string[];
  teamTags: string[];
  onboardingStage: string[];
  active: boolean;
  hiredStatus: string | null;
  clockifyStatus: string | null;
  probation: string | null;
  joined: string | null;
  contractEffective: string | null;
  contactEmail: string | null;
  contactLocation: string | null;
  signedContractOnFile: string | null;
  source: string | null;
  sourceUrl: string | null;
  importedAt: string | null;
  summaryMarkdown: string | null;
  roleScopeMarkdown: string | null;
  sourceFilePath: string;
  sourceRelativePath: string;
  sourceLastModifiedAt: string;
}

export interface EmployeeKpiStatusView {
  status: "onTrack" | "watch" | "drift" | "missingInputs";
  label: string;
  scorePercent: number;
  summary: string;
  reasons: string[];
  founderUpdateRequired: boolean;
  founderUpdateReasons: string[];
}

export interface EmployeeSummaryView {
  employee: Employee;
  departmentNames: string[];
  roleLabels: string[];
  workHoursThisWeek: number;
  workHoursThisMonth: number;
  meetingsThisWeek: number;
  meetingHoursThisWeek: number;
  standupsLast7Days: number;
  lastStandupAt: string | null;
  messagesLast7Days: number;
  lastMessageAt: string | null;
  currentLeave: LeaveView | null;
  upcomingLeaves: LeaveView[];
  upcomingEvents: EmployeeScheduleEventView[];
  vaultProfile: VaultTeamProfileView | null;
  kpiStatus: EmployeeKpiStatusView;
  kpiSnapshot: EmployeeKpiSnapshotView | null;
}

// ── Naming convention (#13) ──────────────────────────────────────

export interface ParsedTaskName {
  compliant: boolean;
  projectCode: string | null;
  typeCode: string | null;
  component: string | null;
  taskId: string | null;
  description: string | null;
  complianceScore: number;
}

export interface ProjectCompliance {
  projectCode: string;
  count: number;
}

export interface TypeCompliance {
  typeCode: string;
  count: number;
}

export interface NamingComplianceStats {
  total: number;
  compliant: number;
  compliancePercent: number;
  byProject: ProjectCompliance[];
  byType: TypeCompliance[];
}

export interface IssueWithNaming {
  id: string;
  identifier: string | null;
  title: string;
  naming: ParsedTaskName;
  assigneeName: string | null;
  space: string | null;
  priority: unknown;
  status: unknown;
}

// ── Client management (#5) ───────────────────────────────────────

export interface ClientOperationalSignals {
  sources: string[];
  monthBillableHours: number;
  activeProjects: number;
  githubProjects: number;
  githubOpenIssues: number;
  githubTotalIssues: number;
  latestActivityAt: string | null;
  inferredTier: string | null;
  inferredIndustry: string | null;
  inferredPrimaryContact: string | null;
  inferredContractStatus: string | null;
  contractEndDate: string | null;
  daysRemaining: number | null;
  inferredTechStack: string[];
}

export interface ClientView {
  id: string;
  name: string;
  registryStatus: "canonical" | "operational";
  driveLink: string | null;
  chromeProfile: string | null;
  profile: TeamforgeClientProfile | null;
  operationalSignals: ClientOperationalSignals;
}

export interface ClientDetailView {
  client: ClientView;
  linkedProjects: {
    id: string;
    name: string;
    status: string;
    source: string;
    repo: string | null;
    openIssues: number;
    totalIssues: number;
    sourceUrl: string | null;
  }[];
  linkedDevices: { id: string; name: string; platform: string }[];
  linkedDevicesUnavailable: boolean;
  resources: { name: string; type: string; url: string | null }[];
  recentActivity: ActivityItem[];
}

// ── Project issues (#6) ──────────────────────────────────────────

export interface ActiveProjectIssueView {
  id: string;
  projectId: string | null;
  projectName: string;
  clientId: string | null;
  clientName: string | null;
  repo: string;
  number: number;
  title: string;
  state: string;
  url: string;
  milestoneNumber: number | null;
  labels: string[];
  assignees: string[];
  priority: string | null;
  track: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  closedAt: string | null;
}

// ── Sprint ceremonies (#8) ───────────────────────────────────────

export interface SprintBurndownPoint {
  day: number;
  remaining: number;
  ideal: number;
}

export interface SprintCapacity {
  employeeName: string;
  scheduledHours: number;
  availableHours: number;
  utilization: number;
}

export interface SprintComparison {
  currentVelocity: number;
  previousVelocity: number;
  currentCompletion: number;
  previousCompletion: number;
}

export interface SprintDetailView {
  id: string;
  label: string;
  goal: string | null;
  retroNotes: string | null;
  burndown: SprintBurndownPoint[];
  capacity: SprintCapacity[];
  comparison: SprintComparison | null;
}

// ── Team enhancements (#9) ───────────────────────────────────────

export interface MonthlyHoursView {
  employeeName: string;
  actualHours: number;
  expectedHours: number;
  status: "under" | "normal" | "over";
  isRemote: boolean;
  timezone: string | null;
  onLeave: boolean;
}

export interface SkillsMatrixCell {
  employeeName: string;
  skill: string;
  level: number;
}

// ── Role-based dashboards (#12) ──────────────────────────────────

export type DashboardRole = "executive" | "pm" | "developer";

// ── Client onboarding (#14) ──────────────────────────────────────

export type OnboardingAudience = "client" | "employee";

export interface TeamforgeOnboardingTask {
  taskId: string;
  sortOrder: number;
  title: string;
  completed: boolean;
  completedAt: string | null;
  resourceCreated: string | null;
  notes: string | null;
}

export interface TeamforgeOnboardingFlow {
  workspaceId: string;
  flowId: string;
  audience: OnboardingAudience;
  status: string;
  owner: string | null;
  startsOn: string;
  subjectId: string;
  subjectName: string;
  primaryContact: string | null;
  manager: string | null;
  department: string | null;
  joinedOn: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
  tasks: TeamforgeOnboardingTask[];
}

export interface OnboardingFlowView {
  id: string;
  audience: OnboardingAudience;
  source: string;
  owner: string | null;
  workspaceId: string | null;
  subjectId: string;
  subjectName: string;
  primaryContact: string | null;
  manager: string | null;
  department: string | null;
  joinedOn: string | null;
  startDate: string;
  completedTasks: number;
  totalTasks: number;
  progressPercent: number;
  status: string;
  tasks: OnboardingTaskView[];
  daysElapsed: number;
}

export interface OnboardingTaskView {
  id: string;
  sortOrder: number;
  title: string;
  completed: boolean;
  completedAt: string | null;
  resourceCreated: string | null;
  notes: string | null;
}

// ── Cloud credential sync ────────────────────────────────────────

export interface CredentialSyncResult {
  synced: string[];
  skipped: string[];
  errors: string[];
}

export interface CloudIntegrationSyncResult {
  cloud: CredentialSyncResult;
  clockify: string | null;
  huly: string | null;
  slack: string | null;
  github: GitHubSyncReport[];
  errors: string[];
}

// ── Standup system (#10) ─────────────────────────────────────────

export interface StandupEntry {
  employeeName: string;
  postedAt: string | null;
  channel: string;
  source: string;
  contentPreview: string | null;
  status: "posted" | "missing";
}

export interface StandupReport {
  date: string;
  totalTeam: number;
  postedCount: number;
  missingCount: number;
  compliancePercent: number;
  entries: StandupEntry[];
}
