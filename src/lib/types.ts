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

export interface TeamforgeProject {
  id: string;
  slug: string;
  name: string;
  portfolioName: string | null;
  clientName: string | null;
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

export interface TeamforgeProjectGraph {
  project: TeamforgeProject;
  githubRepos: TeamforgeProjectGithubRepoLink[];
  hulyLinks: TeamforgeProjectHulyLink[];
  artifacts: TeamforgeProjectArtifact[];
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
  clientName?: string | null;
  projectType?: string | null;
  status?: string | null;
  syncMode?: string | null;
  githubRepos?: TeamforgeProjectGithubRepoLinkInput[];
  hulyLinks?: TeamforgeProjectHulyLinkInput[];
  artifacts?: TeamforgeProjectArtifactInput[];
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
  leaves: LeaveView[];
  holidays: HolidayView[];
  cacheUpdatedAt: string | null;
  hulyError: string | null;
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

export interface ClientView {
  id: string;
  name: string;
  tier: string;
  industry: string | null;
  monthBillableHours: number;
  activeProjects: number;
  planningSource: string;
  githubProjects: number;
  githubOpenIssues: number;
  githubTotalIssues: number;
  primaryContact: string | null;
  contractStatus: string;
  contractEndDate: string | null;
  daysRemaining: number | null;
  latestActivityAt: string | null;
  techStack: string[];
  driveLink: string | null;
  chromeProfile: string | null;
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
  resources: { name: string; type: string; url: string | null }[];
  recentActivity: ActivityItem[];
}

// ── Device registry (#6) ─────────────────────────────────────────

export interface DeviceView {
  id: string;
  name: string;
  model: string | null;
  platform: string;
  clientName: string | null;
  status: string;
  responsibleDev: string | null;
  issueCount: number;
  technicalNotes: string | null;
  apiDocsLink: string | null;
  firmwareVersion: string | null;
}

// ── Knowledge base (#7) ──────────────────────────────────────────

export interface KnowledgeArticleView {
  id: string;
  title: string;
  category: string;
  author: string | null;
  updatedAt: string;
  tags: string[];
  contentPreview: string;
  content: string | null;
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

// ── Training compliance (#11) ────────────────────────────────────

export interface TrainingTrackView {
  id: string;
  name: string;
  totalModules: number;
  completionRate: number;
  overdueCount: number;
}

export interface TrainingStatusRow {
  employeeName: string;
  track: string;
  progress: number;
  modulesDone: number;
  totalModules: number;
  nextModule: string | null;
  deadline: string | null;
  status: string;
}

export interface SkillsMatrixCell {
  employeeName: string;
  skill: string;
  level: number;
}

// ── Role-based dashboards (#12) ──────────────────────────────────

export type DashboardRole = "executive" | "pm" | "developer";

// ── Client onboarding (#14) ──────────────────────────────────────

export interface OnboardingFlowView {
  clientId: string;
  clientName: string;
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
  title: string;
  completed: boolean;
  completedAt: string | null;
  resourceCreated: string | null;
}

// ── Planner integration (#15) ────────────────────────────────────

export interface PlannerSlotView {
  employeeName: string;
  scheduledHours: number;
  actualHours: number;
  focusBlocks: number;
  meetingBlocks: number;
  capacityUtilization: number;
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
