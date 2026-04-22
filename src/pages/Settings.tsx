import { useState, useEffect, useCallback } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useInvoke } from "../hooks/useInvoke";
import { timeAgo } from "../lib/format";
import { useViewportWidth } from "../hooks/useViewportWidth";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";
import {
  checkForUpdate,
  formatDownloadProgress,
  isRelaunchSupported,
  isUpdaterSupported,
  reduceDownloadProgress,
  relaunchForInstall,
  type DownloadProgressState,
  type TauriUpdateHandle,
} from "../lib/updater";
import type {
  ClockifyWorkspace,
  Employee,
  IdentityMapEntry,
  VaultDirectoryValidation,
  SyncState,
} from "../lib/types";

const DEFAULT_IGNORED_EMAILS = "thoughtseedlabs@gmail.com";
const DEFAULT_HULY_ISSUES_INTERVAL_SECONDS = "600";
const DEFAULT_HULY_PRESENCE_INTERVAL_SECONDS = "120";
const DEFAULT_HULY_TEAM_CACHE_INTERVAL_SECONDS = "3600";
const DEFAULT_IDENTITY_OPERATOR = "TeamForge operator";
const SLACK_REQUIRED_SCOPES = [
  "channels:read",
  "channels:history",
  "groups:read",
  "groups:history",
  "users:read",
  "users:read.email",
];

function parseMultiValueSetting(value: string): string[] {
  return value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeIgnoredEmails(value: string): string {
  const normalized = parseMultiValueSetting(value)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return normalized.length > 0 ? normalized.join(", ") : DEFAULT_IGNORED_EMAILS;
}

function normalizeIgnoredEmployeeIds(ids: string[]): string {
  return [...new Set(ids.map((item) => item.trim()).filter(Boolean))].join(", ");
}

function normalizeSlackChannelFilters(value: string): string {
  return parseMultiValueSetting(value).join(", ");
}

function normalizeGithubRepoInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const afterHost = trimmed.includes("github.com/")
    ? trimmed.slice(trimmed.indexOf("github.com/") + "github.com/".length)
    : trimmed.startsWith("git@github.com:")
      ? trimmed.slice("git@github.com:".length)
      : trimmed;
  const parts = afterHost
    .replace(/\.git$/, "")
    .split("/")
    .filter(Boolean);
  if (parts.length < 2) return null;
  const [owner, repo] = parts;
  const valid = /^[A-Za-z0-9_.-]+$/.test(owner) && /^[A-Za-z0-9_.-]+$/.test(repo);
  return valid ? `${owner}/${repo}` : null;
}

function normalizeGithubRepos(value: string): string {
  const seen = new Set<string>();
  return parseMultiValueSetting(value)
    .map(normalizeGithubRepoInput)
    .filter((repo): repo is string => Boolean(repo))
    .filter((repo) => {
      if (seen.has(repo)) return false;
      seen.add(repo);
      return true;
    })
    .join(", ");
}

function normalizePositiveInteger(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed) return fallback;

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return String(parsed);
}

function Settings() {
  const api = useInvoke();
  const viewportWidth = useViewportWidth();

  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [connectedUser, setConnectedUser] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<ClockifyWorkspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState("");
  const [ignoredEmails, setIgnoredEmails] = useState(DEFAULT_IGNORED_EMAILS);
  const [ignoredEmployeeIds, setIgnoredEmployeeIds] = useState<string[]>([]);
  const [ignoreSearch, setIgnoreSearch] = useState("");
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const [hulyToken, setHulyToken] = useState("");
  const [showHulyToken, setShowHulyToken] = useState(false);
  const [hulyStatus, setHulyStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [hulyMessage, setHulyMessage] = useState<string | null>(null);
  const [hulySyncing, setHulySyncing] = useState(false);
  const [hulySyncResult, setHulySyncResult] = useState<string | null>(null);
  const [hulyIssuesIntervalSeconds, setHulyIssuesIntervalSeconds] = useState(
    DEFAULT_HULY_ISSUES_INTERVAL_SECONDS
  );
  const [hulyPresenceIntervalSeconds, setHulyPresenceIntervalSeconds] = useState(
    DEFAULT_HULY_PRESENCE_INTERVAL_SECONDS
  );
  const [hulyTeamCacheIntervalSeconds, setHulyTeamCacheIntervalSeconds] =
    useState(DEFAULT_HULY_TEAM_CACHE_INTERVAL_SECONDS);

  const [slackBotToken, setSlackBotToken] = useState("");
  const [showSlackBotToken, setShowSlackBotToken] = useState(false);
  const [slackChannelFilters, setSlackChannelFilters] = useState("");
  const [slackStatus, setSlackStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [slackMessage, setSlackMessage] = useState<string | null>(null);

  const [githubToken, setGithubToken] = useState("");
  const [showGithubToken, setShowGithubToken] = useState(false);
  const [githubRepos, setGithubRepos] = useState("");
  const [githubSyncing, setGithubSyncing] = useState(false);
  const [githubMessage, setGithubMessage] = useState<string | null>(null);

  const [cloudCredentialSyncEnabled, setCloudCredentialSyncEnabled] =
    useState(true);
  const [cloudCredentialsAccessToken, setCloudCredentialsAccessToken] =
    useState("");
  const [showCloudCredentialsAccessToken, setShowCloudCredentialsAccessToken] =
    useState(false);
  const [cloudSyncMessage, setCloudSyncMessage] = useState<string | null>(null);
  const [cloudSyncing, setCloudSyncing] = useState(false);

  const [localVaultRoot, setLocalVaultRoot] = useState("");
  const [paperclipScriptPath, setPaperclipScriptPath] = useState("");
  const [paperclipWorkingDir, setPaperclipWorkingDir] = useState("");
  const [paperclipUiUrl, setPaperclipUiUrl] = useState("");
  const [localWorkspaceMessage, setLocalWorkspaceMessage] = useState<string | null>(null);
  const [vaultValidation, setVaultValidation] = useState<VaultDirectoryValidation | null>(null);
  const [vaultPicking, setVaultPicking] = useState(false);
  const [vaultValidating, setVaultValidating] = useState(false);
  const [paperclipLaunching, setPaperclipLaunching] = useState(false);
  const [paperclipLaunchMessage, setPaperclipLaunchMessage] = useState<string | null>(null);
  const [paperclipOpening, setPaperclipOpening] = useState(false);
  const [paperclipOpenMessage, setPaperclipOpenMessage] = useState<string | null>(null);

  const [currentAppVersion, setCurrentAppVersion] = useState("--");
  const [availableUpdate, setAvailableUpdate] = useState<TauriUpdateHandle | null>(null);
  const [updateStatus, setUpdateStatus] = useState<
    "idle" | "checking" | "current" | "available" | "downloading" | "installing" | "restarting" | "error"
  >("idle");
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgressState>({
    downloadedBytes: 0,
    contentLength: null,
    finished: false,
  });

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [syncStates, setSyncStates] = useState<SyncState[]>([]);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [editingQuotas, setEditingQuotas] = useState<Record<string, string>>({});
  const [identityReviewQueue, setIdentityReviewQueue] = useState<IdentityMapEntry[]>([]);
  const [identityReviewLoading, setIdentityReviewLoading] = useState(false);
  const [identityReviewMessage, setIdentityReviewMessage] = useState<string | null>(null);
  const [identityOverrideOperator, setIdentityOverrideOperator] = useState(
    DEFAULT_IDENTITY_OPERATOR
  );
  const [identityOverrideSelections, setIdentityOverrideSelections] = useState<
    Record<string, string>
  >({});
  const [identityOverrideReasons, setIdentityOverrideReasons] = useState<
    Record<string, string>
  >({});
  const [identityOverrideBusyKey, setIdentityOverrideBusyKey] = useState<string | null>(
    null
  );

  const trimmedSlackToken = slackBotToken.trim();
  const normalizedIgnoredEmployeeIdString =
    normalizeIgnoredEmployeeIds(ignoredEmployeeIds);
  const normalizedSlackFilters = normalizeSlackChannelFilters(slackChannelFilters);
  const slackFilterCount = normalizedSlackFilters
    ? normalizedSlackFilters.split(", ").filter(Boolean).length
    : 0;
  const cloudAccessTokenPresent = cloudCredentialsAccessToken.trim().length > 0;
  const vaultConfigured = localVaultRoot.trim().length > 0;
  const paperclipScriptConfigured = paperclipScriptPath.trim().length > 0;
  const paperclipUiConfigured = paperclipUiUrl.trim().length > 0;
  const slackSetupStatus = !trimmedSlackToken
    ? "NOT CONFIGURED"
    : trimmedSlackToken.startsWith("xoxb-")
      ? "BOT TOKEN READY"
      : trimmedSlackToken.startsWith("xoxp-")
        ? "WRONG TOKEN TYPE"
        : "CHECK TOKEN FORMAT";
  const slackChannelMode = slackFilterCount > 0
    ? `${slackFilterCount} FILTER${slackFilterCount === 1 ? "" : "S"}`
    : "ALL ACCESSIBLE CHANNELS";
  const updaterAvailable = isUpdaterSupported();
  const relaunchAvailable = isRelaunchSupported();
  const downloadProgressLabel = formatDownloadProgress(downloadProgress);
  const vaultValidationColor =
    vaultValidation?.status === "ready"
      ? "var(--lcars-green)"
      : vaultValidation?.status === "warning"
        ? "var(--lcars-orange)"
        : "var(--lcars-red)";
  const updateActionBusy =
    updateStatus === "checking" ||
    updateStatus === "downloading" ||
    updateStatus === "installing" ||
    updateStatus === "restarting";
  const isCompactLayout = viewportWidth < 1080;
  const employeeNameById = new Map(employees.map((employee) => [employee.id, employee.name]));
  const activeEmployees = [...employees]
    .filter((employee) => employee.isActive)
    .sort((left, right) => left.name.localeCompare(right.name));

  const getIdentityQueueKey = (entry: IdentityMapEntry) =>
    `${entry.source}:${entry.externalId}`;

  const loadSettings = useCallback(async () => {
    try {
      const settings = await api.getSettings();
      if (settings.clockify_api_key) setApiKey(settings.clockify_api_key);
      if (settings.clockify_workspace_id) setSelectedWorkspace(settings.clockify_workspace_id);
      setIgnoredEmails(settings.clockify_ignored_emails || DEFAULT_IGNORED_EMAILS);
      setIgnoredEmployeeIds(
        parseMultiValueSetting(settings.clockify_ignored_employee_ids || "")
      );
      if (settings.huly_token) setHulyToken(settings.huly_token);
      setHulyIssuesIntervalSeconds(
        settings.huly_sync_issues_interval_seconds ||
          DEFAULT_HULY_ISSUES_INTERVAL_SECONDS
      );
      setHulyPresenceIntervalSeconds(
        settings.huly_sync_presence_interval_seconds ||
          DEFAULT_HULY_PRESENCE_INTERVAL_SECONDS
      );
      setHulyTeamCacheIntervalSeconds(
        settings.huly_sync_team_cache_interval_seconds ||
          DEFAULT_HULY_TEAM_CACHE_INTERVAL_SECONDS
      );
      if (settings.slack_bot_token) setSlackBotToken(settings.slack_bot_token);
      setSlackChannelFilters(settings.slack_channel_filters || "");
      if (settings.github_token) setGithubToken(settings.github_token);
      setGithubRepos(settings.github_repos || "");
      setCloudCredentialSyncEnabled(
        settings.cloud_credential_sync_enabled !== "false"
      );
      setCloudCredentialsAccessToken(
        settings.cloud_credentials_access_token || ""
      );
      setLocalVaultRoot(settings.local_vault_root || "");
      setPaperclipScriptPath(settings.paperclip_script_path || "");
      setPaperclipWorkingDir(settings.paperclip_working_dir || "");
      setPaperclipUiUrl(settings.paperclip_ui_url || "http://127.0.0.1:3100");
    } catch { /* Settings may not exist yet */ }
  }, []);

  const loadIdentityReviewQueue = useCallback(async () => {
    setIdentityReviewLoading(true);
    setIdentityReviewMessage(null);
    try {
      const reviewQueue = await api.getIdentityReviewQueue(0.85);
      setIdentityReviewQueue(reviewQueue);
      setIdentityOverrideSelections((current) => {
        const next = { ...current };
        for (const entry of reviewQueue) {
          const key = `${entry.source}:${entry.externalId}`;
          if (!next[key] && entry.employeeId) {
            next[key] = entry.employeeId;
          }
        }
        return next;
      });
    } catch (error) {
      setIdentityReviewMessage(`Error: ${String(error)}`);
    } finally {
      setIdentityReviewLoading(false);
    }
  }, [api]);

  const loadSyncStatus = useCallback(async () => {
    try { setSyncStates(await api.getSyncStatus()); } catch { /* ignore */ }
  }, []);

  const loadEmployees = useCallback(async () => {
    try { setEmployees(await api.getEmployees()); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadSettings();
    loadSyncStatus();
    loadEmployees();
    loadIdentityReviewQueue();
  }, [loadIdentityReviewQueue, loadSettings, loadSyncStatus, loadEmployees]);

  useEffect(() => {
    let cancelled = false;

    getVersion()
      .then((version) => {
        if (!cancelled) {
          setCurrentAppVersion(version);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCurrentAppVersion("--");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleTestConnection = async () => {
    if (!apiKey.trim()) return;
    setConnectionStatus("testing");
    setConnectedUser(null);
    setWorkspaces([]);
    try {
      const user = await api.testClockifyConnection(apiKey);
      setConnectedUser(user.name);
      setConnectionStatus("success");
      const ws = await api.getClockifyWorkspaces(apiKey);
      setWorkspaces(ws);
      if (ws.length > 0 && !selectedWorkspace) setSelectedWorkspace(ws[0].id);
    } catch (err) {
      setConnectionStatus("error");
      setConnectedUser(String(err));
    }
  };

  const handleSave = async () => {
    setSaveStatus(null);
    try {
      await api.saveSetting("clockify_api_key", apiKey);
      if (selectedWorkspace) await api.saveSetting("clockify_workspace_id", selectedWorkspace);
      await api.saveSetting(
        "clockify_ignored_employee_ids",
        normalizedIgnoredEmployeeIdString
      );
      await api.saveSetting("clockify_ignored_emails", normalizeIgnoredEmails(ignoredEmails));
      setSaveStatus("Settings saved");
      setIgnoredEmails(normalizeIgnoredEmails(ignoredEmails));
      setIgnoredEmployeeIds(
        parseMultiValueSetting(normalizedIgnoredEmployeeIdString)
      );
      await loadEmployees();
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) { setSaveStatus(`Error: ${err}`); }
  };

  const toggleIgnoredEmployee = (employeeId: string) => {
    setIgnoredEmployeeIds((current) =>
      current.includes(employeeId)
        ? current.filter((id) => id !== employeeId)
        : [...current, employeeId]
    );
  };

  const ignoredEmployeeIdSet = new Set(ignoredEmployeeIds);
  const ignoreSearchQuery = ignoreSearch.trim().toLowerCase();
  const selectedIgnoredEmployees = employees
    .filter((employee) => ignoredEmployeeIdSet.has(employee.id))
    .sort((left, right) => left.name.localeCompare(right.name));
  const visibleIgnoreCandidates = [...employees]
    .filter((employee) => {
      if (!ignoreSearchQuery) return true;
      const haystack = [employee.name, employee.email, employee.hulyPersonId ?? ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(ignoreSearchQuery);
    })
    .sort((left, right) => {
      const leftSelected = ignoredEmployeeIdSet.has(left.id) ? 1 : 0;
      const rightSelected = ignoredEmployeeIdSet.has(right.id) ? 1 : 0;
      return (
        rightSelected - leftSelected ||
        Number(right.isActive) - Number(left.isActive) ||
        left.name.localeCompare(right.name)
      );
    });

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await api.triggerSync();
      setSyncResult(result);
      await loadSyncStatus();
      await loadEmployees();
    } catch (err) { setSyncResult(`Error: ${err}`); }
    finally { setSyncing(false); }
  };

  const handleTestHuly = async () => {
    if (!hulyToken.trim()) return;
    setHulyStatus("testing");
    setHulyMessage(null);
    try {
      const msg = await api.testHulyConnection(hulyToken);
      setHulyStatus("success");
      setHulyMessage(msg);
    } catch (err) {
      setHulyStatus("error");
      setHulyMessage(String(err));
    }
  };

  const handleSaveHuly = async () => {
    try {
      const normalizedIssuesInterval = normalizePositiveInteger(
        hulyIssuesIntervalSeconds,
        DEFAULT_HULY_ISSUES_INTERVAL_SECONDS
      );
      const normalizedPresenceInterval = normalizePositiveInteger(
        hulyPresenceIntervalSeconds,
        DEFAULT_HULY_PRESENCE_INTERVAL_SECONDS
      );
      const normalizedTeamCacheInterval = normalizePositiveInteger(
        hulyTeamCacheIntervalSeconds,
        DEFAULT_HULY_TEAM_CACHE_INTERVAL_SECONDS
      );
      await api.saveSetting("huly_token", hulyToken);
      await api.saveSetting(
        "huly_sync_issues_interval_seconds",
        normalizedIssuesInterval
      );
      await api.saveSetting(
        "huly_sync_presence_interval_seconds",
        normalizedPresenceInterval
      );
      await api.saveSetting(
        "huly_sync_team_cache_interval_seconds",
        normalizedTeamCacheInterval
      );
      setHulyIssuesIntervalSeconds(normalizedIssuesInterval);
      setHulyPresenceIntervalSeconds(normalizedPresenceInterval);
      setHulyTeamCacheIntervalSeconds(normalizedTeamCacheInterval);
      const schedulerMessage = await api.startBackgroundSync();
      setHulyStatus("success");
      setHulyMessage(`Huly settings saved • ${schedulerMessage}`);
      setTimeout(() => { if (hulyStatus !== "error") setHulyMessage(null); }, 3000);
    } catch (err) {
      setHulyStatus("error");
      setHulyMessage(`Error: ${err}`);
    }
  };

  const handleHulySync = async () => {
    setHulySyncing(true);
    setHulySyncResult(null);
    try {
      const result = await api.triggerHulySync();
      setHulySyncResult(result);
      await loadSyncStatus();
    } catch (err) { setHulySyncResult(`Error: ${err}`); }
    finally { setHulySyncing(false); }
  };

  const handleQuotaSave = async (employeeId: string) => {
    const val = editingQuotas[employeeId];
    if (val === undefined) return;
    const quota = parseFloat(val);
    if (isNaN(quota) || quota < 0) return;
    try {
      await api.updateEmployeeQuota(employeeId, quota);
      await loadEmployees();
      setEditingQuotas((prev) => { const next = { ...prev }; delete next[employeeId]; return next; });
    } catch { /* ignore */ }
  };

  const handleIdentityOverride = async (entry: IdentityMapEntry) => {
    const queueKey = getIdentityQueueKey(entry);
    const employeeId =
      identityOverrideSelections[queueKey] || entry.employeeId || "";
    const operator = identityOverrideOperator.trim() || DEFAULT_IDENTITY_OPERATOR;
    const reason = (identityOverrideReasons[queueKey] || "").trim();

    if (!employeeId) {
      setIdentityReviewMessage(
        `Error: select an employee before overriding ${entry.source}:${entry.externalId}`
      );
      return;
    }

    if (!reason) {
      setIdentityReviewMessage(
        `Error: add an override reason for ${entry.source}:${entry.externalId}`
      );
      return;
    }

    setIdentityOverrideBusyKey(queueKey);
    setIdentityReviewMessage(null);
    try {
      const result = await api.setIdentityOverride({
        source: entry.source,
        externalId: entry.externalId,
        employeeId,
        operator,
        reason,
      });
      setIdentityReviewMessage(result);
      setIdentityOverrideReasons((current) => {
        const next = { ...current };
        delete next[queueKey];
        return next;
      });
      await loadIdentityReviewQueue();
      await loadEmployees();
    } catch (error) {
      setIdentityReviewMessage(`Error: ${String(error)}`);
    } finally {
      setIdentityOverrideBusyKey(null);
    }
  };

  const handleTestSlack = async () => {
    if (!trimmedSlackToken) return;
    if (!trimmedSlackToken.startsWith("xoxb-")) {
      setSlackStatus("error");
      setSlackMessage(
        trimmedSlackToken.startsWith("xoxp-")
          ? "Use the Slack Bot User OAuth Token (xoxb-...), not the User OAuth Token (xoxp-...)."
          : "Paste the Slack Bot User OAuth Token (xoxb-...) from Slack > Settings > Install App."
      );
      return;
    }

    setSlackStatus("testing");
    setSlackMessage(null);
    try {
      const msg = await api.testSlackConnection(trimmedSlackToken);
      setSlackStatus("success");
      setSlackMessage(msg);
    } catch (err) {
      setSlackStatus("error");
      setSlackMessage(String(err));
    }
  };

  const handleSaveSlack = async () => {
    if (!trimmedSlackToken) {
      setSlackStatus("error");
      setSlackMessage("Paste the Slack Bot User OAuth Token (xoxb-...) before saving.");
      return;
    }

    if (!trimmedSlackToken.startsWith("xoxb-")) {
      setSlackStatus("error");
      setSlackMessage(
        trimmedSlackToken.startsWith("xoxp-")
          ? "Use the Slack Bot User OAuth Token (xoxb-...), not the User OAuth Token (xoxp-...)."
          : "Paste the Slack Bot User OAuth Token (xoxb-...) from Slack > Settings > Install App."
      );
      return;
    }

    try {
      await api.saveSetting("slack_bot_token", trimmedSlackToken);
      await api.saveSetting("slack_channel_filters", normalizedSlackFilters);
      setSlackBotToken(trimmedSlackToken);
      setSlackChannelFilters(normalizedSlackFilters);
      setSlackStatus("success");
      setSlackMessage("Slack settings saved");
      setTimeout(() => { if (slackStatus !== "error") setSlackMessage(null); }, 3000);
    } catch (err) {
      setSlackStatus("error");
      setSlackMessage(`Error: ${err}`);
    }
  };

  const handleSaveGithub = async () => {
    setGithubMessage(null);
    try {
      const normalizedRepos = normalizeGithubRepos(githubRepos);
      await api.saveSetting("github_token", githubToken.trim());
      await api.saveSetting("github_repos", normalizedRepos);
      setGithubToken(githubToken.trim());
      setGithubRepos(normalizedRepos);
      setGithubMessage("GitHub settings saved");
      setTimeout(() => setGithubMessage(null), 3000);
    } catch (err) {
      setGithubMessage(`Error: ${String(err)}`);
    }
  };

  const handleGithubSync = async () => {
    setGithubSyncing(true);
    setGithubMessage(null);
    try {
      const reports = await api.syncGitHubPlans();
      const issues = reports.reduce((sum, report) => sum + report.issuesSynced, 0);
      const prs = reports.reduce((sum, report) => sum + report.pullRequestsSynced, 0);
      const branches = reports.reduce((sum, report) => sum + report.branchesSynced, 0);
      const checks = reports.reduce((sum, report) => sum + report.checkRunsSynced, 0);
      const projects = reports.length;
      setGithubMessage(
        `GitHub synced (${projects} repos, ${issues} issues, ${prs} PRs, ${branches} branches, ${checks} checks)`
      );
      await loadSyncStatus();
    } catch (err) {
      setGithubMessage(`Error: ${String(err)}`);
    } finally {
      setGithubSyncing(false);
    }
  };

  const handleSaveCloudSyncSettings = async () => {
    const trimmedToken = cloudCredentialsAccessToken.trim();
    setCloudSyncMessage(null);

    try {
      await api.saveSetting(
        "cloud_credential_sync_enabled",
        cloudCredentialSyncEnabled ? "true" : "false"
      );
      await api.saveSetting("cloud_credentials_access_token", trimmedToken);

      setCloudCredentialsAccessToken(trimmedToken);
      setCloudSyncMessage("Cloud credential sync settings saved");
      setTimeout(() => setCloudSyncMessage(null), 3000);
    } catch (err) {
      setCloudSyncMessage(`Error: ${String(err)}`);
    }
  };

  const handleSyncCloudCredentialsNow = async () => {
    setCloudSyncing(true);
    setCloudSyncMessage(null);
    try {
      const result = await api.syncCloudIntegrations();
      const detailParts: string[] = [];
      if (result.cloud.synced.length > 0) detailParts.push(`cloud ${result.cloud.synced.length}`);
      if (result.clockify) detailParts.push("clockify");
      if (result.huly) detailParts.push("huly");
      if (result.slack) detailParts.push("slack");
      if (result.github.length > 0) detailParts.push(`github ${result.github.length}`);
      if (result.cloud.skipped.length > 0) detailParts.push(`skipped ${result.cloud.skipped.length}`);
      if (result.cloud.errors.length + result.errors.length > 0) {
        detailParts.push(`errors ${result.cloud.errors.length + result.errors.length}`);
      }

      const prefix =
        result.cloud.errors.length + result.errors.length > 0
          ? "Cloud integration sync completed with issues"
          : "Cloud integrations synced";
      setCloudSyncMessage(
        `${prefix}${detailParts.length ? ` (${detailParts.join(", ")})` : ""}`
      );
      await loadSettings();
    } catch (err) {
      setCloudSyncMessage(`Error: ${String(err)}`);
    } finally {
      setCloudSyncing(false);
    }
  };

  const handleSaveLocalWorkspace = async () => {
    setLocalWorkspaceMessage(null);
    try {
      await api.saveSetting("local_vault_root", localVaultRoot.trim());
      await api.saveSetting("paperclip_script_path", paperclipScriptPath.trim());
      await api.saveSetting("paperclip_working_dir", paperclipWorkingDir.trim());
      await api.saveSetting("paperclip_ui_url", paperclipUiUrl.trim());
      await loadSettings();
      setLocalWorkspaceMessage("Local workspace settings saved");
      setTimeout(() => setLocalWorkspaceMessage(null), 3000);
    } catch (err) {
      setLocalWorkspaceMessage(`Error: ${String(err)}`);
    }
  };

  const handlePickVaultDirectory = async () => {
    setVaultPicking(true);
    setLocalWorkspaceMessage(null);
    try {
      const path = await api.pickVaultDirectory();
      if (!path) return;
      setLocalVaultRoot(path);
      setVaultValidation(await api.validateVaultDirectory(path));
    } catch (err) {
      setLocalWorkspaceMessage(`Error: ${String(err)}`);
    } finally {
      setVaultPicking(false);
    }
  };

  const handleValidateVaultDirectory = async () => {
    if (!localVaultRoot.trim()) {
      setVaultValidation({
        path: "",
        status: "error",
        message: "Select a vault directory before validating.",
        markers: [],
        hasTeamDirectory: false,
        hasClientEcosystemDirectory: false,
        hasObsidianDirectory: false,
      });
      return;
    }

    setVaultValidating(true);
    try {
      setVaultValidation(await api.validateVaultDirectory(localVaultRoot.trim()));
    } catch (err) {
      setVaultValidation({
        path: localVaultRoot.trim(),
        status: "error",
        message: String(err),
        markers: [],
        hasTeamDirectory: false,
        hasClientEcosystemDirectory: false,
        hasObsidianDirectory: false,
      });
    } finally {
      setVaultValidating(false);
    }
  };

  const handleLaunchPaperclip = async () => {
    setPaperclipLaunching(true);
    setPaperclipLaunchMessage(null);
    try {
      const result = await api.launchPaperclipScript(
        paperclipScriptPath.trim(),
        paperclipWorkingDir.trim() || null
      );
      setPaperclipLaunchMessage(
        `Paperclip launched (${result.launchMode}, pid ${result.pid})`
      );
    } catch (err) {
      setPaperclipLaunchMessage(`Error: ${String(err)}`);
    } finally {
      setPaperclipLaunching(false);
    }
  };

  const handleOpenPaperclipUi = async () => {
    setPaperclipOpening(true);
    setPaperclipOpenMessage(null);
    try {
      const result = await api.openPaperclipUi(paperclipUiUrl.trim());
      setPaperclipOpenMessage(`Opened ${result.url}`);
    } catch (err) {
      setPaperclipOpenMessage(`Error: ${String(err)}`);
    } finally {
      setPaperclipOpening(false);
    }
  };

  const handleCheckForUpdates = async () => {
    setUpdateMessage(null);
    setAvailableUpdate(null);
    setDownloadProgress({
      downloadedBytes: 0,
      contentLength: null,
      finished: false,
    });

    if (!updaterAvailable) {
      setUpdateStatus("error");
      setUpdateMessage(
        "Updater API unavailable. Use the packaged TeamForge app to check OTA releases."
      );
      return;
    }

    setUpdateStatus("checking");
    try {
      const update = await checkForUpdate();
      if (!update) {
        setUpdateStatus("current");
        setUpdateMessage(
          `No update available. TeamForge ${currentAppVersion} is current on the configured OTA channel.`
        );
        return;
      }

      setAvailableUpdate(update);
      setUpdateStatus("available");
      setUpdateMessage(
        `Update ${update.version} is available${update.date ? ` (${update.date})` : ""}.`
      );
    } catch (err) {
      setUpdateStatus("error");
      setUpdateMessage(`Error: ${String(err)}`);
    }
  };

  const handleInstallUpdate = async () => {
    if (!availableUpdate) return;

    setUpdateStatus("downloading");
    setUpdateMessage(`Downloading TeamForge ${availableUpdate.version}...`);
    setDownloadProgress({
      downloadedBytes: 0,
      contentLength: null,
      finished: false,
    });

    try {
      let nextProgress: DownloadProgressState = {
        downloadedBytes: 0,
        contentLength: null,
        finished: false,
      };

      await availableUpdate.downloadAndInstall((event) => {
        nextProgress = reduceDownloadProgress(nextProgress, event);
        setDownloadProgress(nextProgress);

        if (event.event === "Finished") {
          setUpdateStatus("installing");
          setUpdateMessage(
            `Installing TeamForge ${availableUpdate.version}...`
          );
          return;
        }

        setUpdateStatus("downloading");
        setUpdateMessage(
          `Downloading TeamForge ${availableUpdate.version}...`
        );
      });

      if (relaunchAvailable) {
        setUpdateStatus("restarting");
        setUpdateMessage(
          `Installed TeamForge ${availableUpdate.version}. Restarting now...`
        );
        await relaunchForInstall();
        return;
      }

      setUpdateStatus("available");
      setUpdateMessage(
        `TeamForge ${availableUpdate.version} is installed. Restart the app to finish applying the update.`
      );
    } catch (err) {
      setUpdateStatus("error");
      setUpdateMessage(`Error: ${String(err)}`);
    }
  };

  return (
    <div>
      <h1 style={styles.pageTitle}>SETTINGS</h1>
      <div style={styles.pageTitleBar} />

      {/* Clockify Connection */}
      <div style={{ ...styles.card, borderLeftColor: "var(--lcars-orange)" }}>
        <h2 style={styles.sectionTitle}>CLOCKIFY CONNECTION</h2>
        <div style={styles.sectionDivider} />

        <div style={styles.field}>
          <label style={styles.label}>API KEY</label>
          <div style={styles.inputRow}>
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="ENTER YOUR CLOCKIFY API KEY"
              style={{ ...styles.input, flex: 1 }}
            />
            <button onClick={() => setShowKey(!showKey)} style={styles.ghostButton}>
              {showKey ? "HIDE" : "SHOW"}
            </button>
            <button
              onClick={handleTestConnection}
              disabled={connectionStatus === "testing" || !apiKey.trim()}
              style={{ ...styles.ghostButton, opacity: connectionStatus === "testing" || !apiKey.trim() ? 0.5 : 1 }}
            >
              {connectionStatus === "testing" ? "TESTING..." : "TEST CONNECTION"}
            </button>
          </div>
          {connectionStatus === "success" && connectedUser && (
            <div style={styles.successText}>CONNECTED AS {connectedUser.toUpperCase()}</div>
          )}
          {connectionStatus === "error" && connectedUser && (
            <div style={styles.errorText}>{connectedUser}</div>
          )}
        </div>

        {workspaces.length > 0 && (
          <div style={styles.field}>
            <label style={styles.label}>WORKSPACE</label>
            <select
              value={selectedWorkspace}
              onChange={(e) => setSelectedWorkspace(e.target.value)}
              style={styles.input}
            >
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>{ws.name}</option>
              ))}
            </select>
          </div>
        )}

        <div style={styles.field}>
          <label style={styles.label}>IGNORED CREW</label>
          <input
            value={ignoreSearch}
            onChange={(e) => setIgnoreSearch(e.target.value)}
            placeholder="SEARCH CREW NAME, EMAIL, OR HULY LINK"
            style={styles.input}
          />
          <div style={styles.helperText}>
            SELECT PEOPLE TO EXCLUDE FROM CLOCKIFY METRICS, CREW STATUS, TIMELINES,
            AND THE TEAM ORG MAPPING. THIS WORKS EVEN WHEN EMAILS ARE MISSING OR
            UNRELIABLE.
          </div>

          {selectedIgnoredEmployees.length > 0 && (
            <div style={styles.selectedChipRow}>
              {selectedIgnoredEmployees.map((employee) => (
                <button
                  key={`ignored-chip-${employee.id}`}
                  type="button"
                  onClick={() => toggleIgnoredEmployee(employee.id)}
                  style={styles.selectedChip}
                >
                  {employee.name.toUpperCase()} ×
                </button>
              ))}
            </div>
          )}

          {employees.length === 0 ? (
            <div style={styles.helperText}>
              RUN A SYNC FIRST TO LOAD THE CREW ROSTER FOR MULTISELECT IGNORING.
            </div>
          ) : (
            <div
              style={{
                ...styles.ignoreGrid,
                maxHeight: isCompactLayout ? "none" : 280,
              }}
            >
              {visibleIgnoreCandidates.map((employee) => {
                const selected = ignoredEmployeeIdSet.has(employee.id);
                return (
                  <button
                    key={employee.id}
                    type="button"
                    onClick={() => toggleIgnoredEmployee(employee.id)}
                    style={{
                      ...styles.ignoreCard,
                      ...(selected ? styles.ignoreCardSelected : null),
                    }}
                  >
                    <div style={styles.ignoreCardHeader}>
                      <span style={styles.ignoreCardName}>{employee.name}</span>
                      <span
                        style={{
                          ...styles.ignoreCardState,
                          color: selected
                            ? "#000"
                            : employee.isActive
                              ? "var(--lcars-green)"
                              : "var(--text-quaternary)",
                        }}
                      >
                        {selected ? "IGNORED" : employee.isActive ? "ACTIVE" : "INACTIVE"}
                      </span>
                    </div>
                    <div style={styles.ignoreCardMeta}>
                      {employee.email || "NO EMAIL AVAILABLE"}
                    </div>
                    <div style={styles.ignoreCardMeta}>
                      {employee.hulyPersonId ? "HULY LINKED" : "CLOCKIFY ONLY"}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div style={styles.field}>
          <label style={styles.label}>MANUAL EMAIL FALLBACK</label>
          <textarea
            value={ignoredEmails}
            onChange={(e) => setIgnoredEmails(e.target.value)}
            placeholder={DEFAULT_IGNORED_EMAILS}
            style={{ ...styles.input, minHeight: 72, resize: "vertical" }}
          />
          <div style={styles.helperText}>
            USE THIS FOR SERVICE ACCOUNTS OR UNMAPPED PEOPLE THAT ARE NOT YET IN THE
            CREW LIST. COMMA OR NEWLINE SEPARATED.
          </div>
        </div>

        <div style={styles.buttonRow}>
          <button onClick={handleSave} style={styles.primaryButton}>SAVE</button>
          {saveStatus && (
            <span style={{ ...styles.label, color: saveStatus.startsWith("Error") ? "var(--lcars-red)" : "var(--lcars-green)" }}>
              {saveStatus.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* Huly Connection */}
      <div style={{ ...styles.card, borderLeftColor: "var(--lcars-cyan)" }}>
        <h2 style={styles.sectionTitle}>HULY CONNECTION</h2>
        <div style={styles.sectionDivider} />

        <div style={styles.field}>
          <label style={styles.label}>USER TOKEN</label>
          <div style={styles.inputRow}>
            <input
              type={showHulyToken ? "text" : "password"}
              value={hulyToken}
              onChange={(e) => setHulyToken(e.target.value)}
              placeholder="ENTER YOUR HULY JWT TOKEN"
              style={{ ...styles.input, flex: 1 }}
            />
            <button onClick={() => setShowHulyToken(!showHulyToken)} style={styles.ghostButton}>
              {showHulyToken ? "HIDE" : "SHOW"}
            </button>
            <button
              onClick={handleTestHuly}
              disabled={hulyStatus === "testing" || !hulyToken.trim()}
              style={{ ...styles.ghostButton, opacity: hulyStatus === "testing" || !hulyToken.trim() ? 0.5 : 1 }}
            >
              {hulyStatus === "testing" ? "TESTING..." : "TEST CONNECTION"}
            </button>
          </div>
          {hulyStatus === "success" && hulyMessage && (
            <div style={styles.successText}>{hulyMessage.toUpperCase()}</div>
          )}
          {hulyStatus === "error" && hulyMessage && (
            <div style={styles.errorText}>{hulyMessage}</div>
          )}
        </div>

        <div style={styles.field}>
          <label style={styles.label}>SYNC CADENCE (SECONDS)</label>
          <div style={styles.inlineFieldGrid}>
            <div>
              <label style={styles.miniLabel}>ISSUES</label>
              <input
                type="number"
                min={1}
                step={1}
                value={hulyIssuesIntervalSeconds}
                onChange={(event) => setHulyIssuesIntervalSeconds(event.target.value)}
                style={styles.input}
              />
            </div>
            <div>
              <label style={styles.miniLabel}>PRESENCE</label>
              <input
                type="number"
                min={1}
                step={1}
                value={hulyPresenceIntervalSeconds}
                onChange={(event) => setHulyPresenceIntervalSeconds(event.target.value)}
                style={styles.input}
              />
            </div>
            <div>
              <label style={styles.miniLabel}>TEAM CACHE</label>
              <input
                type="number"
                min={1}
                step={1}
                value={hulyTeamCacheIntervalSeconds}
                onChange={(event) => setHulyTeamCacheIntervalSeconds(event.target.value)}
                style={styles.input}
              />
            </div>
          </div>
          <div style={styles.helperText}>
            SAVE RESTARTS THE BACKGROUND SCHEDULER SO UPDATED HULY ISSUE, PRESENCE,
            AND TEAM-CACHE POLLING WINDOWS APPLY IMMEDIATELY.
          </div>
        </div>

        <div style={styles.buttonRow}>
          <button onClick={handleSaveHuly} style={styles.primaryButton}>SAVE</button>
          <button
            onClick={handleHulySync}
            disabled={hulySyncing || !hulyToken.trim()}
            style={{ ...styles.ghostButton, opacity: hulySyncing || !hulyToken.trim() ? 0.5 : 1 }}
          >
            {hulySyncing ? "SYNCING..." : "SYNC HULY"}
          </button>
          {hulySyncResult && (
            <span style={{ ...styles.label, color: hulySyncResult.startsWith("Error") ? "var(--lcars-red)" : "var(--lcars-green)" }}>
              {hulySyncResult.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* Identity Review */}
      <div style={{ ...styles.card, borderLeftColor: "var(--lcars-peach)" }}>
        <h2 style={styles.sectionTitle}>IDENTITY REVIEW</h2>
        <div style={styles.sectionDivider} />

        <div style={styles.summaryGrid}>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>QUEUE SIZE</span>
            <span style={styles.summaryValue}>{identityReviewQueue.length}</span>
          </div>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>LOW CONFIDENCE</span>
            <span style={styles.summaryValue}>
              {
                identityReviewQueue.filter(
                  (entry) => entry.employeeId && entry.confidence < 1
                ).length
              }
            </span>
          </div>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>UNLINKED</span>
            <span style={styles.summaryValue}>
              {
                identityReviewQueue.filter((entry) => !entry.employeeId).length
              }
            </span>
          </div>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>OVERRIDE OPERATOR</label>
          <input
            value={identityOverrideOperator}
            onChange={(event) => setIdentityOverrideOperator(event.target.value)}
            placeholder={DEFAULT_IDENTITY_OPERATOR}
            style={styles.input}
          />
          <div style={styles.helperText}>
            MANUAL OVERRIDES RECORD THE OPERATOR, REASON, AND OVERRIDE TIMESTAMP
            INTO THE CANONICAL `identity_map` ROW.
          </div>
        </div>

        <div style={styles.buttonRow}>
          <button
            onClick={loadIdentityReviewQueue}
            disabled={identityReviewLoading}
            style={{
              ...styles.ghostButton,
              opacity: identityReviewLoading ? 0.5 : 1,
            }}
          >
            {identityReviewLoading ? "REFRESHING..." : "REFRESH REVIEW QUEUE"}
          </button>
          {identityReviewMessage && (
            <span
              style={{
                ...styles.label,
                color: identityReviewMessage.startsWith("Error")
                  ? "var(--lcars-red)"
                  : "var(--lcars-green)",
              }}
            >
              {identityReviewMessage.toUpperCase()}
            </span>
          )}
        </div>

        {identityReviewLoading ? (
          <div style={styles.helperText}>LOADING IDENTITY REVIEW QUEUE...</div>
        ) : identityReviewQueue.length === 0 ? (
          <p style={styles.emptyText}>
            NO UNRESOLVED OR LOW-CONFIDENCE IDENTITY LINKS NEED REVIEW.
          </p>
        ) : (
          <div style={styles.identityQueue}>
            {identityReviewQueue.map((entry) => {
              const queueKey = getIdentityQueueKey(entry);
              const selectedEmployeeId =
                identityOverrideSelections[queueKey] || entry.employeeId || "";
              const selectedEmployeeName = selectedEmployeeId
                ? employeeNameById.get(selectedEmployeeId) || selectedEmployeeId
                : "UNLINKED";
              const overrideReason = identityOverrideReasons[queueKey] || "";
              const overrideBusy = identityOverrideBusyKey === queueKey;

              return (
                <div key={queueKey} style={styles.identityCard}>
                  <div style={styles.identityCardHeader}>
                    <div>
                      <div style={styles.identityTitle}>
                        {entry.source.toUpperCase()} • {entry.externalId}
                      </div>
                      <div style={styles.identitySubtitle}>
                        {entry.matchMethod || "UNCLASSIFIED MATCH METHOD"}
                      </div>
                    </div>
                    <div
                      style={{
                        ...styles.identityBadge,
                        color:
                          entry.confidence >= 0.95
                            ? "var(--lcars-green)"
                            : entry.confidence >= 0.75
                              ? "var(--lcars-orange)"
                              : "var(--lcars-red)",
                      }}
                    >
                      {Math.round(entry.confidence * 100)}%
                    </div>
                  </div>

                  <div style={styles.identityMetaGrid}>
                    <div style={styles.identityMetaItem}>
                      <span style={styles.identityMetaLabel}>STATUS</span>
                      <span style={styles.identityMetaValue}>
                        {entry.resolutionStatus.toUpperCase()}
                      </span>
                    </div>
                    <div style={styles.identityMetaItem}>
                      <span style={styles.identityMetaLabel}>CURRENT LINK</span>
                      <span style={styles.identityMetaValue}>
                        {entry.employeeId
                          ? employeeNameById.get(entry.employeeId) || entry.employeeId
                          : "UNLINKED"}
                      </span>
                    </div>
                    <div style={styles.identityMetaItem}>
                      <span style={styles.identityMetaLabel}>OVERRIDE BY</span>
                      <span style={styles.identityMetaValue}>
                        {entry.overrideBy || "—"}
                      </span>
                    </div>
                    <div style={styles.identityMetaItem}>
                      <span style={styles.identityMetaLabel}>OVERRIDE REASON</span>
                      <span style={styles.identityMetaValue}>
                        {entry.overrideReason || "—"}
                      </span>
                    </div>
                    <div style={styles.identityMetaItem}>
                      <span style={styles.identityMetaLabel}>OVERRIDE AT</span>
                      <span style={styles.identityMetaValue}>
                        {entry.overrideAt ? timeAgo(entry.overrideAt) : "—"}
                      </span>
                    </div>
                    <div style={styles.identityMetaItem}>
                      <span style={styles.identityMetaLabel}>UPDATED</span>
                      <span style={styles.identityMetaValue}>
                        {timeAgo(entry.updatedAt)}
                      </span>
                    </div>
                  </div>

                  <div style={styles.inlineFieldGrid}>
                    <div>
                      <label style={styles.miniLabel}>TARGET EMPLOYEE</label>
                      <select
                        value={selectedEmployeeId}
                        onChange={(event) =>
                          setIdentityOverrideSelections((current) => ({
                            ...current,
                            [queueKey]: event.target.value,
                          }))
                        }
                        style={styles.input}
                      >
                        <option value="">SELECT CREW MEMBER</option>
                        {activeEmployees.map((employee) => (
                          <option key={employee.id} value={employee.id}>
                            {employee.name}
                          </option>
                        ))}
                      </select>
                      <div style={styles.helperText}>
                        TARGETING {selectedEmployeeName.toUpperCase()}
                      </div>
                    </div>
                    <div>
                      <label style={styles.miniLabel}>OVERRIDE REASON</label>
                      <textarea
                        value={overrideReason}
                        onChange={(event) =>
                          setIdentityOverrideReasons((current) => ({
                            ...current,
                            [queueKey]: event.target.value,
                          }))
                        }
                        placeholder="WHY THIS LINK IS AUTHORITATIVE"
                        style={{ ...styles.input, minHeight: 84, resize: "vertical" }}
                      />
                    </div>
                  </div>

                  <div style={styles.buttonRow}>
                    <button
                      onClick={() => handleIdentityOverride(entry)}
                      disabled={overrideBusy || !selectedEmployeeId || !overrideReason.trim()}
                      style={{
                        ...styles.primaryButton,
                        opacity:
                          overrideBusy || !selectedEmployeeId || !overrideReason.trim()
                            ? 0.5
                            : 1,
                      }}
                    >
                      {overrideBusy ? "APPLYING..." : "APPLY MANUAL OVERRIDE"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Slack Connection */}
      <div style={{ ...styles.card, borderLeftColor: "var(--lcars-lavender)" }}>
        <h2 style={styles.sectionTitle}>SLACK CONNECTION</h2>
        <div style={styles.sectionDivider} />

        <div style={styles.summaryGrid}>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>STATUS</span>
            <span
              style={{
                ...styles.summaryValue,
                color: slackSetupStatus === "WRONG TOKEN TYPE"
                  ? "var(--lcars-red)"
                  : slackSetupStatus === "BOT TOKEN READY"
                    ? "var(--lcars-green)"
                    : "var(--lcars-orange)",
              }}
            >
              {slackSetupStatus}
            </span>
          </div>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>TOKEN SOURCE</span>
            <span style={styles.summaryValue}>INSTALL APP</span>
          </div>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>CHANNEL MODE</span>
            <span style={styles.summaryValue}>{slackChannelMode}</span>
          </div>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>BOT USER OAUTH TOKEN</label>
          <div style={styles.inputRow}>
            <input
              type={showSlackBotToken ? "text" : "password"}
              value={slackBotToken}
              onChange={(e) => setSlackBotToken(e.target.value)}
              placeholder="PASTE THE xoxb-... BOT USER OAUTH TOKEN"
              style={{ ...styles.input, flex: 1 }}
            />
            <button onClick={() => setShowSlackBotToken(!showSlackBotToken)} style={styles.ghostButton}>
              {showSlackBotToken ? "HIDE" : "SHOW"}
            </button>
            <button
              onClick={handleTestSlack}
              disabled={slackStatus === "testing" || !trimmedSlackToken}
              style={{ ...styles.ghostButton, opacity: slackStatus === "testing" || !trimmedSlackToken ? 0.5 : 1 }}
            >
              {slackStatus === "testing" ? "TESTING..." : "TEST CONNECTION"}
            </button>
          </div>
          {slackStatus === "success" && slackMessage && (
            <div style={styles.successText}>{slackMessage.toUpperCase()}</div>
          )}
          {slackStatus === "error" && slackMessage && (
            <div style={styles.errorText}>{slackMessage}</div>
          )}
          <div style={styles.helperText}>
            USE THE <strong>BOT USER OAUTH TOKEN</strong> FROM SLACK &gt; SETTINGS &gt; INSTALL APP.
            DO NOT PASTE THE USER TOKEN (`xoxp-...`) FROM THE SAME SCREEN.
          </div>
          <div style={styles.warningBox}>
            <div style={styles.warningTitle}>REINSTALL AFTER SCOPE CHANGES</div>
            <div style={styles.warningBody}>
              IF SLACK SHOWS A YELLOW BANNER ABOUT UPDATED PERMISSIONS, CLICK
              <strong> REINSTALL TO WORKSPACE </strong>
              BEFORE TESTING HERE. REQUIRED SCOPES: {SLACK_REQUIRED_SCOPES.join(", ")}.
            </div>
          </div>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>CHANNEL FILTERS</label>
          <textarea
            value={slackChannelFilters}
            onChange={(e) => setSlackChannelFilters(e.target.value)}
            placeholder="OPTIONAL: CHANNEL IDS OR NAMES, COMMA OR NEWLINE SEPARATED"
            style={{ ...styles.input, minHeight: 72, resize: "vertical" }}
          />
          <div style={styles.helperText}>
            LEAVE BLANK TO READ ALL ACCESSIBLE PUBLIC / PRIVATE CHANNELS THE BOT CAN SEE.
          </div>
        </div>

        <div style={styles.buttonRow}>
          <button onClick={handleSaveSlack} style={styles.primaryButton}>SAVE</button>
          {slackMessage && (
            <span style={{ ...styles.label, color: slackMessage.startsWith("Error") ? "var(--lcars-red)" : "var(--lcars-green)" }}>
              {slackMessage.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* GitHub Plans */}
      <div style={{ ...styles.card, borderLeftColor: "var(--lcars-cyan)" }}>
        <h2 style={styles.sectionTitle}>GITHUB PLANS</h2>
        <div style={styles.sectionDivider} />

        <div style={styles.field}>
          <label style={styles.label}>TOKEN</label>
          <div style={styles.inputRow}>
            <input
              type={showGithubToken ? "text" : "password"}
              value={githubToken}
              onChange={(event) => setGithubToken(event.target.value)}
              placeholder="PASTE A GITHUB TOKEN OR SYNC IT FROM CLOUD CREDENTIALS"
              style={{ ...styles.input, flex: 1 }}
            />
            <button
              onClick={() => setShowGithubToken(!showGithubToken)}
              style={styles.ghostButton}
            >
              {showGithubToken ? "HIDE" : "SHOW"}
            </button>
          </div>
          <div style={styles.helperText}>
            TOKEN STATUS: {githubToken.trim() ? "CONFIGURED" : "MISSING"}
          </div>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>REPOSITORIES</label>
          <textarea
            value={githubRepos}
            onChange={(event) => setGithubRepos(event.target.value)}
            placeholder="SYNCED FROM CLOUDFLARE OR ENTER owner/repo, https://github.com/owner/repo, PR, OR ISSUE URL"
            style={{ ...styles.input, minHeight: 72, resize: "vertical" }}
          />
          <div style={styles.helperText}>
            ONE REPO OR GITHUB URL PER LINE OR COMMA. TEAMFORGE NORMALIZES URLS TO
            owner/repo AND SYNCS ISSUES, PRS, BRANCHES, AND CHECK RUNS. CLOUD CONFIG
            CAN ALSO PROVIDE DISPLAY NAME, CLIENT, MILESTONE, HULY, AND CLOCKIFY ALIASES.
          </div>
        </div>

        <div style={styles.buttonRow}>
          <button onClick={handleSaveGithub} style={styles.primaryButton}>
            SAVE GITHUB SETTINGS
          </button>
          <button
            onClick={handleGithubSync}
            disabled={githubSyncing || !githubToken.trim()}
            style={{
              ...styles.ghostButton,
              opacity: githubSyncing || !githubToken.trim() ? 0.5 : 1,
            }}
          >
            {githubSyncing ? "SYNCING..." : "SYNC GITHUB PLANS"}
          </button>
          {githubMessage && (
            <span
              style={{
                ...styles.label,
                color: githubMessage.startsWith("Error")
                  ? "var(--lcars-red)"
                  : "var(--lcars-green)",
              }}
            >
              {githubMessage.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* Cloud Credential Sync */}
      <div style={{ ...styles.card, borderLeftColor: "var(--lcars-cyan)" }}>
        <h2 style={styles.sectionTitle}>CLOUD CREDENTIAL SYNC</h2>
        <div style={styles.sectionDivider} />

        <div style={styles.field}>
          <label style={styles.label}>STARTUP MODE</label>
          <label style={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={cloudCredentialSyncEnabled}
              onChange={(event) =>
                setCloudCredentialSyncEnabled(event.target.checked)
              }
            />
            <span>
            ENABLE CLOUD INTEGRATION SYNC ON APP STARTUP (DEFAULT)
            </span>
          </label>
          <div style={styles.helperText}>
            THIS IS DEFAULT-ON FOR SHARED CLOUDFLARE INTEGRATION CONFIG AND TOKEN WORKFLOWS.
            TURN IT OFF ONLY IF YOU INTENTIONALLY WANT A LOCAL-ONLY SETTINGS FLOW.
          </div>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>CLOUD ACCESS TOKEN</label>
          <div style={styles.inputRow}>
            <input
              type={showCloudCredentialsAccessToken ? "text" : "password"}
              value={cloudCredentialsAccessToken}
              onChange={(event) =>
                setCloudCredentialsAccessToken(event.target.value)
              }
              placeholder="PASTE THE BEARER TOKEN USED FOR /v1/credentials"
              style={{ ...styles.input, flex: 1 }}
            />
            <button
              onClick={() =>
                setShowCloudCredentialsAccessToken(
                  !showCloudCredentialsAccessToken
                )
              }
              style={styles.ghostButton}
            >
              {showCloudCredentialsAccessToken ? "HIDE" : "SHOW"}
            </button>
          </div>
          <div style={styles.helperText}>
            THIS TOKEN IS REQUIRED FOR MANUAL CLOUD INTEGRATION SYNC AND STARTUP SYNC.
            IT IS STORED LOCALLY IN TEAMFORGE SETTINGS.
          </div>
          <div style={styles.helperText}>
            TOKEN STATUS:{" "}
            {cloudAccessTokenPresent ? "CONFIGURED" : "MISSING"}
          </div>
        </div>

        <div style={styles.buttonRow}>
          <button onClick={handleSaveCloudSyncSettings} style={styles.primaryButton}>
            SAVE CLOUD SYNC SETTINGS
          </button>
          <button
            onClick={handleSyncCloudCredentialsNow}
            disabled={cloudSyncing || !cloudAccessTokenPresent}
            style={{
              ...styles.ghostButton,
              opacity: cloudSyncing || !cloudAccessTokenPresent ? 0.5 : 1,
            }}
          >
            {cloudSyncing ? "SYNCING..." : "SYNC CLOUD INTEGRATIONS NOW"}
          </button>
          {cloudSyncMessage && (
            <span
              style={{
                ...styles.label,
                color: cloudSyncMessage.startsWith("Error")
                  ? "var(--lcars-red)"
                  : "var(--lcars-green)",
              }}
            >
              {cloudSyncMessage.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* Local Workspace */}
      <div style={{ ...styles.card, borderLeftColor: "var(--lcars-orange)" }}>
        <h2 style={styles.sectionTitle}>LOCAL WORKSPACE</h2>
        <div style={styles.sectionDivider} />

        <div style={styles.summaryGrid}>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>VAULT MAP</span>
            <span
              style={{
                ...styles.summaryValue,
                color: vaultConfigured ? "var(--lcars-green)" : "var(--lcars-orange)",
              }}
            >
              {vaultConfigured ? "CONFIGURED" : "MISSING"}
            </span>
          </div>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>PAPERCLIP SCRIPT</span>
            <span
              style={{
                ...styles.summaryValue,
                color: paperclipScriptConfigured
                  ? "var(--lcars-green)"
                  : "var(--lcars-orange)",
              }}
            >
              {paperclipScriptConfigured ? "READY" : "MISSING"}
            </span>
          </div>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>PAPERCLIP UI</span>
            <span
              style={{
                ...styles.summaryValue,
                color: paperclipUiConfigured
                  ? "var(--lcars-green)"
                  : "var(--lcars-orange)",
              }}
            >
              {paperclipUiConfigured ? "READY" : "MISSING"}
            </span>
          </div>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>VAULT DIRECTORY</label>
          <div style={styles.inputRow}>
            <input
              value={localVaultRoot}
              onChange={(event) => {
                setLocalVaultRoot(event.target.value);
                setVaultValidation(null);
              }}
              placeholder="SELECT THE LOCAL OBSIDIAN / THOUGHTSEED VAULT ROOT"
              style={{ ...styles.input, flex: 1 }}
            />
            <button
              onClick={handlePickVaultDirectory}
              disabled={vaultPicking}
              style={{ ...styles.ghostButton, opacity: vaultPicking ? 0.5 : 1 }}
            >
              {vaultPicking ? "CHOOSING..." : "CHOOSE FOLDER"}
            </button>
            <button
              onClick={handleValidateVaultDirectory}
              disabled={vaultValidating || !vaultConfigured}
              style={{
                ...styles.ghostButton,
                opacity: vaultValidating || !vaultConfigured ? 0.5 : 1,
              }}
            >
              {vaultValidating ? "VALIDATING..." : "VALIDATE VAULT"}
            </button>
          </div>
          <div style={styles.helperText}>
            THIS PATH IS STORED LOCALLY ON THIS MACHINE AND USED AS THE FIRST
            CHOICE BEFORE THE OLD ENV-VAR OR OBSIDIAN FALLBACKS.
          </div>
        </div>

        {vaultValidation && (
          <div style={styles.statusBox}>
            <div style={{ ...styles.statusTitle, color: vaultValidationColor }}>
              VAULT STATUS • {vaultValidation.status.toUpperCase()}
            </div>
            <div style={styles.statusBody}>{vaultValidation.message}</div>
            <div style={styles.helperText}>
              MARKERS:{" "}
              {vaultValidation.markers.length > 0
                ? vaultValidation.markers.join(", ")
                : "NONE DETECTED"}
            </div>
          </div>
        )}

        <div style={styles.inlineFieldGrid}>
          <div>
            <label style={styles.label}>PAPERCLIP SCRIPT</label>
            <input
              value={paperclipScriptPath}
              onChange={(event) => setPaperclipScriptPath(event.target.value)}
              placeholder=".../TEAM-FORGE-TS/SCRIPTS/LAUNCH-THOUGHTSEED-PAPERCLIP.SH"
              style={styles.input}
            />
            <div style={styles.helperText}>
              RECOMMENDED FOR THIS MACHINE: THE INCLUDED
              `scripts/launch-thoughtseed-paperclip.sh` WRAPPER. IT TARGETS THE
              SIBLING `thougghtseed-paperclip` REPO AND MAPS TEAMFORGE LAUNCHES
              TO PAPERCLIP'S EXISTING `babysitter.sh start` ENTRYPOINT.
            </div>
          </div>
          <div>
            <label style={styles.label}>PAPERCLIP WORKING DIRECTORY</label>
            <input
              value={paperclipWorkingDir}
              onChange={(event) => setPaperclipWorkingDir(event.target.value)}
              placeholder="/ABSOLUTE/PATH/TO/PAPERCLIP"
              style={styles.input}
            />
            <div style={styles.helperText}>
              OPTIONAL. IF BLANK, TEAMFORGE USES THE SCRIPT PARENT DIRECTORY.
            </div>
          </div>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>PAPERCLIP UI URL</label>
          <input
            value={paperclipUiUrl}
            onChange={(event) => setPaperclipUiUrl(event.target.value)}
            placeholder="http://127.0.0.1:3100"
            style={styles.input}
          />
          <div style={styles.helperText}>
            LOCAL OR REMOTE HTTP URL TO THE PAPERCLIP UI INSTANCE THIS FOUNDER
            MACHINE SHOULD OPEN. THE LOCAL THOUGHTSEED PAPERCLIP DEFAULT IS
            `http://127.0.0.1:3100`.
          </div>
        </div>

        <div style={styles.buttonRow}>
          <button onClick={handleSaveLocalWorkspace} style={styles.primaryButton}>
            SAVE LOCAL WORKSPACE
          </button>
          <button
            onClick={handleLaunchPaperclip}
            disabled={paperclipLaunching || !paperclipScriptConfigured}
            style={{
              ...styles.ghostButton,
              opacity: paperclipLaunching || !paperclipScriptConfigured ? 0.5 : 1,
            }}
          >
            {paperclipLaunching ? "LAUNCHING..." : "LAUNCH PAPERCLIP"}
          </button>
          <button
            onClick={handleOpenPaperclipUi}
            disabled={paperclipOpening || !paperclipUiConfigured}
            style={{
              ...styles.ghostButton,
              opacity: paperclipOpening || !paperclipUiConfigured ? 0.5 : 1,
            }}
          >
            {paperclipOpening ? "OPENING..." : "OPEN PAPERCLIP UI"}
          </button>
        </div>

        {(localWorkspaceMessage || paperclipLaunchMessage || paperclipOpenMessage) && (
          <div style={styles.statusBox}>
            {localWorkspaceMessage && (
              <div
                style={{
                  ...styles.statusBody,
                  color: localWorkspaceMessage.startsWith("Error")
                    ? "var(--lcars-red)"
                    : "var(--lcars-green)",
                }}
              >
                {localWorkspaceMessage.toUpperCase()}
              </div>
            )}
            {paperclipLaunchMessage && (
              <div
                style={{
                  ...styles.statusBody,
                  color: paperclipLaunchMessage.startsWith("Error")
                    ? "var(--lcars-red)"
                    : "var(--lcars-green)",
                }}
              >
                {paperclipLaunchMessage.toUpperCase()}
              </div>
            )}
            {paperclipOpenMessage && (
              <div
                style={{
                  ...styles.statusBody,
                  color: paperclipOpenMessage.startsWith("Error")
                    ? "var(--lcars-red)"
                    : "var(--lcars-green)",
                }}
              >
                {paperclipOpenMessage.toUpperCase()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* App Updates */}
      <div style={{ ...styles.card, borderLeftColor: "var(--lcars-green)" }}>
        <h2 style={styles.sectionTitle}>APP UPDATES</h2>
        <div style={styles.sectionDivider} />

        <div style={styles.summaryGrid}>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>CURRENT VERSION</span>
            <span style={styles.summaryValue}>{currentAppVersion}</span>
          </div>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>UPDATER</span>
            <span
              style={{
                ...styles.summaryValue,
                color: updaterAvailable
                  ? "var(--lcars-green)"
                  : "var(--lcars-orange)",
              }}
            >
              {updaterAvailable ? "READY" : "PACKAGED APP ONLY"}
            </span>
          </div>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>PENDING RELEASE</span>
            <span style={styles.summaryValue}>
              {availableUpdate ? availableUpdate.version : "NONE"}
            </span>
          </div>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>OTA FLOW</label>
          <div style={styles.helperText}>
            TEAMFORGE CHECKS THE CLOUDFLARE OTA MANIFEST ALREADY CONFIGURED IN
            TAURI. WHEN A NEW SIGNED RELEASE IS PUBLISHED FOR THIS TARGET, USE
            CHECK FOR UPDATE, THEN INSTALL &amp; RESTART.
          </div>
        </div>

        <div style={styles.buttonRow}>
          <button
            onClick={handleCheckForUpdates}
            disabled={updateActionBusy || !updaterAvailable}
            style={{
              ...styles.primaryButton,
              opacity: updateActionBusy || !updaterAvailable ? 0.5 : 1,
            }}
          >
            {updateStatus === "checking" ? "CHECKING..." : "CHECK FOR UPDATE"}
          </button>
          <button
            onClick={handleInstallUpdate}
            disabled={updateActionBusy || !availableUpdate}
            style={{
              ...styles.ghostButton,
              opacity: updateActionBusy || !availableUpdate ? 0.5 : 1,
            }}
          >
            {updateStatus === "downloading"
              ? "DOWNLOADING..."
              : updateStatus === "installing"
                ? "INSTALLING..."
                : updateStatus === "restarting"
                  ? "RESTARTING..."
                  : "INSTALL & RESTART"}
          </button>
          {updateMessage && (
            <span
              style={{
                ...styles.label,
                color: updateMessage.startsWith("Error")
                  ? "var(--lcars-red)"
                  : "var(--lcars-green)",
              }}
            >
              {updateMessage.toUpperCase()}
            </span>
          )}
        </div>

        {(updateStatus === "downloading" || updateStatus === "installing") && (
          <div style={styles.statusBox}>
            <div style={styles.statusTitle}>
              {updateStatus === "installing"
                ? "INSTALL PHASE"
                : "DOWNLOAD PHASE"}
            </div>
            <div style={styles.statusBody}>{downloadProgressLabel}</div>
          </div>
        )}

        {availableUpdate && (
          <div style={styles.statusBox}>
            <div style={styles.statusTitle}>
              RELEASE {availableUpdate.version}
            </div>
            <div style={styles.statusBody}>
              FROM {availableUpdate.currentVersion}
              {availableUpdate.date ? ` • ${availableUpdate.date}` : ""}
              {relaunchAvailable ? "" : " • MANUAL RESTART REQUIRED"}
            </div>
            {availableUpdate.body?.trim() && (
              <pre style={styles.releaseNotes}>{availableUpdate.body.trim()}</pre>
            )}
          </div>
        )}
      </div>

      {/* Sync Controls */}
      <div style={{ ...styles.card, borderLeftColor: "var(--lcars-green)" }}>
        <h2 style={styles.sectionTitle}>SYNC CONTROLS</h2>
        <div style={styles.sectionDivider} />

        <div style={styles.buttonRow}>
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{ ...styles.primaryButton, opacity: syncing ? 0.5 : 1 }}
          >
            {syncing ? "SYNCING..." : "SYNC NOW"}
          </button>
          {syncResult && (
            <span style={{ ...styles.label, color: syncResult.startsWith("Error") ? "var(--lcars-red)" : "var(--lcars-green)" }}>
              {syncResult.toUpperCase()}
            </span>
          )}
        </div>

        {syncStates.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <label style={styles.label}>LAST SYNC TIMES</label>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>SOURCE</th>
                  <th style={styles.th}>ENTITY</th>
                  <th style={styles.th}>LAST SYNC</th>
                </tr>
              </thead>
              <tbody>
                {syncStates.map((s) => (
                  <tr key={`${s.source}-${s.entity}`}>
                    <td style={styles.td}>{s.source.toUpperCase()}</td>
                    <td style={styles.td}>{s.entity.toUpperCase()}</td>
                    <td style={styles.tdMono}>{timeAgo(s.lastSyncAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Employee Management */}
      <div style={{ ...styles.card, borderLeftColor: "var(--lcars-peach)" }}>
        <h2 style={styles.sectionTitle}>CREW MANAGEMENT</h2>
        <div style={styles.sectionDivider} />

        {employees.length === 0 ? (
          <p style={styles.emptyText}>NO CREW SYNCED YET. RUN A SYNC TO POPULATE.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>NAME</th>
                <th style={styles.th}>EMAIL</th>
                <th style={styles.th}>MONTHLY QUOTA (HRS)</th>
                <th style={styles.th}>ACTIVE</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id}>
                  <td style={{ ...styles.td, color: "var(--lcars-orange)" }}>{emp.name}</td>
                  <td style={styles.td}>{emp.email}</td>
                  <td style={styles.td}>
                    <div style={styles.inputRow}>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={editingQuotas[emp.id] !== undefined ? editingQuotas[emp.id] : emp.monthlyQuotaHours}
                        onChange={(e) => setEditingQuotas((prev) => ({ ...prev, [emp.id]: e.target.value }))}
                        onBlur={() => handleQuotaSave(emp.id)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleQuotaSave(emp.id); }}
                        style={{ ...styles.input, width: 80, padding: "6px 10px" }}
                      />
                    </div>
                  </td>
                  <td style={styles.td}>
                    <span
                      style={{
                        display: "inline-block",
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        backgroundColor: emp.isActive ? "var(--lcars-green)" : "var(--text-quaternary)",
                        boxShadow: emp.isActive ? "0 0 6px rgba(51, 204, 102, 0.4)" : "none",
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageTitle: lcarsPageStyles.pageTitle,
  pageTitleBar: lcarsPageStyles.pageTitleBar,
  card: lcarsPageStyles.card,
  sectionTitle: lcarsPageStyles.sectionTitle,
  sectionDivider: lcarsPageStyles.sectionDivider,
  field: {
    marginBottom: 16,
  },
  label: {
    display: "block",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    fontWeight: 500,
    color: "var(--lcars-lavender)",
    marginBottom: 6,
    letterSpacing: "1.5px",
    textTransform: "uppercase" as const,
  },
  input: lcarsPageStyles.input,
  inputRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap" as const,
  },
  inlineFieldGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    alignItems: "start",
  },
  miniLabel: {
    display: "block",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    color: "var(--text-quaternary)",
    marginBottom: 6,
    letterSpacing: "1.25px",
    textTransform: "uppercase" as const,
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "var(--lcars-tan)",
    fontSize: 12,
    marginBottom: 8,
    textTransform: "uppercase" as const,
    letterSpacing: "0.6px",
  },
  primaryButton: lcarsPageStyles.primaryButton,
  ghostButton: {
    ...lcarsPageStyles.ghostButton,
    color: "var(--lcars-orange)",
    borderColor: "rgba(255, 153, 0, 0.28)",
    whiteSpace: "nowrap" as const,
  },
  buttonRow: {
    ...lcarsPageStyles.buttonRow,
    marginTop: 8,
  },
  successText: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 11,
    color: "var(--lcars-green)",
    marginTop: 8,
    letterSpacing: "1px",
  },
  errorText: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    color: "var(--lcars-red)",
    marginTop: 8,
  },
  emptyText: lcarsPageStyles.emptyText,
  helperText: {
    ...lcarsPageStyles.helperText,
    marginTop: 8,
  },
  selectedChipRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 8,
    marginTop: 12,
  },
  selectedChip: {
    background: "rgba(255, 153, 0, 0.12)",
    border: "1px solid rgba(255, 153, 0, 0.3)",
    color: "var(--lcars-orange)",
    padding: "6px 10px",
    fontSize: 10,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: "1px",
    cursor: "pointer",
    textTransform: "uppercase" as const,
    borderRadius: "0 12px 12px 0",
  },
  ignoreGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 10,
    marginTop: 12,
    overflowY: "auto" as const,
    paddingRight: 4,
  },
  ignoreCard: {
    background: "var(--bg-console-soft)",
    border: "1px solid rgba(153, 153, 204, 0.16)",
    color: "var(--lcars-tan)",
    padding: "12px 14px",
    textAlign: "left" as const,
    cursor: "pointer",
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
    borderRadius: "0 16px 16px 0",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
  },
  ignoreCardSelected: {
    background: "linear-gradient(90deg, rgba(255, 153, 0, 0.92), #ffb347)",
    border: "1px solid rgba(255, 179, 71, 0.7)",
    color: "#111",
    boxShadow: "0 0 16px rgba(255, 153, 0, 0.18)",
  },
  ignoreCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "baseline",
  },
  ignoreCardName: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 11,
    letterSpacing: "1px",
    textTransform: "uppercase" as const,
  },
  ignoreCardState: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    letterSpacing: "1.25px",
    textTransform: "uppercase" as const,
    whiteSpace: "nowrap" as const,
  },
  ignoreCardMeta: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: "inherit",
    opacity: 0.88,
    wordBreak: "break-word" as const,
  },
  identityQueue: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 14,
    marginTop: 14,
  },
  identityCard: {
    ...lcarsPageStyles.subtleCard,
    borderLeftColor: "var(--lcars-peach)",
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 12,
  },
  identityCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    flexWrap: "wrap" as const,
  },
  identityTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 11,
    color: "var(--lcars-orange)",
    letterSpacing: "1.2px",
    textTransform: "uppercase" as const,
  },
  identitySubtitle: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: "var(--lcars-tan)",
    marginTop: 4,
    wordBreak: "break-word" as const,
  },
  identityBadge: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 11,
    letterSpacing: "1.4px",
    textTransform: "uppercase" as const,
    whiteSpace: "nowrap" as const,
  },
  identityMetaGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
  },
  identityMetaItem: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
  },
  identityMetaLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    color: "var(--text-quaternary)",
    letterSpacing: "1.3px",
    textTransform: "uppercase" as const,
  },
  identityMetaValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: "var(--lcars-tan)",
    wordBreak: "break-word" as const,
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    marginBottom: 16,
  },
  summaryItem: {
    ...lcarsPageStyles.subtleCard,
    borderLeftColor: "var(--lcars-cyan)",
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  },
  summaryLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    color: "var(--text-quaternary)",
    letterSpacing: "1.5px",
    textTransform: "uppercase" as const,
  },
  summaryValue: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 11,
    color: "var(--lcars-orange)",
    letterSpacing: "1.25px",
    textTransform: "uppercase" as const,
  },
  warningBox: {
    marginTop: 12,
    padding: "12px 14px",
    border: "1px solid rgba(255, 204, 0, 0.25)",
    background: "rgba(255, 204, 0, 0.06)",
    borderRadius: "0 14px 14px 0",
  },
  warningTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    color: "var(--lcars-orange)",
    letterSpacing: "1.5px",
    textTransform: "uppercase" as const,
    marginBottom: 6,
  },
  warningBody: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    color: "var(--lcars-tan)",
    letterSpacing: "0.75px",
    lineHeight: 1.6,
  },
  statusBox: {
    ...lcarsPageStyles.subtleCard,
    borderLeftColor: "var(--lcars-green)",
    marginTop: 12,
    padding: "12px 14px",
  },
  statusTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    color: "var(--lcars-green)",
    letterSpacing: "1.5px",
    textTransform: "uppercase" as const,
    marginBottom: 6,
  },
  statusBody: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    color: "var(--lcars-tan)",
    lineHeight: 1.6,
  },
  releaseNotes: {
    margin: "10px 0 0",
    padding: "12px",
    background: "rgba(10, 10, 20, 0.7)",
    border: "1px solid rgba(153, 153, 204, 0.16)",
    borderRadius: "0 12px 12px 0",
    color: "var(--lcars-tan)",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    lineHeight: 1.65,
  },
  table: lcarsPageStyles.table,
  th: lcarsPageStyles.th,
  td: lcarsPageStyles.td,
  tdMono: lcarsPageStyles.tdMono,
};

export default Settings;
