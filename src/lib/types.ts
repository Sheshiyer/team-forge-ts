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
  projectName: string;
  totalHours: number;
  billableHours: number;
  teamMembers: number;
  utilization: number;
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
