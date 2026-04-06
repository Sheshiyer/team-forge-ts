import { invoke } from "@tauri-apps/api/core";
import type {
  ClockifyUser,
  ClockifyWorkspace,
  OverviewData,
  QuotaRow,
  TimeEntry,
  ProjectStats,
  ActivityItem,
  PresenceStatus,
  Employee,
  SyncState,
} from "../lib/types";

export function useInvoke() {
  return {
    testClockifyConnection: (apiKey: string) =>
      invoke<ClockifyUser>("test_clockify_connection", { apiKey }),
    getClockifyWorkspaces: (apiKey: string) =>
      invoke<ClockifyWorkspace[]>("get_clockify_workspaces", { apiKey }),
    getSettings: () => invoke<Record<string, string>>("get_settings"),
    saveSetting: (key: string, value: string) =>
      invoke<void>("save_setting", { key, value }),
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
    getActivityFeed: (limit: number) =>
      invoke<ActivityItem[]>("get_activity_feed", { limit }),
    getPresenceStatus: () => invoke<PresenceStatus[]>("get_presence_status"),
    getEmployees: () => invoke<Employee[]>("get_employees"),
    updateEmployeeQuota: (employeeId: string, quota: number) =>
      invoke<void>("update_employee_quota", { employeeId, quota }),
    getSyncStatus: () => invoke<SyncState[]>("get_sync_status"),
  };
}
