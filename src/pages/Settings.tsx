import { useState, useEffect, useCallback } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { timeAgo } from "../lib/format";
import { useViewportWidth } from "../hooks/useViewportWidth";
import { lcarsPageStyles } from "../lib/lcarsPageStyles";
import type { ClockifyWorkspace, Employee, SyncState } from "../lib/types";

const DEFAULT_IGNORED_EMAILS = "thoughtseedlabs@gmail.com";
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

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [syncStates, setSyncStates] = useState<SyncState[]>([]);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [editingQuotas, setEditingQuotas] = useState<Record<string, string>>({});

  const trimmedSlackToken = slackBotToken.trim();
  const normalizedIgnoredEmployeeIdString =
    normalizeIgnoredEmployeeIds(ignoredEmployeeIds);
  const normalizedSlackFilters = normalizeSlackChannelFilters(slackChannelFilters);
  const slackFilterCount = normalizedSlackFilters
    ? normalizedSlackFilters.split(", ").filter(Boolean).length
    : 0;
  const cloudAccessTokenPresent = cloudCredentialsAccessToken.trim().length > 0;
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
  const isCompactLayout = viewportWidth < 1080;

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
    } catch { /* Settings may not exist yet */ }
  }, []);

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
  }, [loadSettings, loadSyncStatus, loadEmployees]);

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
      await api.saveSetting("huly_token", hulyToken);
      setHulyMessage("Huly token saved");
      setTimeout(() => { if (hulyStatus !== "error") setHulyMessage(null); }, 3000);
    } catch (err) { setHulyMessage(`Error: ${err}`); }
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
      const normalizedRepos = parseMultiValueSetting(githubRepos).join(", ");
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
      const projects = reports.length;
      setGithubMessage(`GitHub plans synced (${projects} projects, ${issues} issues)`);
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
            placeholder="SYNCED FROM CLOUDFLARE INTEGRATION CONFIG OR ENTER owner/repo"
            style={{ ...styles.input, minHeight: 72, resize: "vertical" }}
          />
          <div style={styles.helperText}>
            ONE REPO PER LINE OR COMMA. CLOUD CONFIG CAN ALSO PROVIDE DISPLAY NAME,
            CLIENT, MILESTONE, HULY, AND CLOCKIFY ALIASES.
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
  table: lcarsPageStyles.table,
  th: lcarsPageStyles.th,
  td: lcarsPageStyles.td,
  tdMono: lcarsPageStyles.tdMono,
};

export default Settings;
