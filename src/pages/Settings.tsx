import { useState, useEffect, useCallback } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { timeAgo } from "../lib/format";
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

function normalizeIgnoredEmails(value: string): string {
  const normalized = value
    .split(/[\n,;]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return normalized.length > 0 ? normalized.join(", ") : DEFAULT_IGNORED_EMAILS;
}

function normalizeSlackChannelFilters(value: string): string {
  return value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join(", ");
}

function Settings() {
  const api = useInvoke();

  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [connectedUser, setConnectedUser] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<ClockifyWorkspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState("");
  const [ignoredEmails, setIgnoredEmails] = useState(DEFAULT_IGNORED_EMAILS);
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

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [syncStates, setSyncStates] = useState<SyncState[]>([]);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [editingQuotas, setEditingQuotas] = useState<Record<string, string>>({});

  const trimmedSlackToken = slackBotToken.trim();
  const normalizedSlackFilters = normalizeSlackChannelFilters(slackChannelFilters);
  const slackFilterCount = normalizedSlackFilters
    ? normalizedSlackFilters.split(", ").filter(Boolean).length
    : 0;
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

  const loadSettings = useCallback(async () => {
    try {
      const settings = await api.getSettings();
      if (settings.clockify_api_key) setApiKey(settings.clockify_api_key);
      if (settings.clockify_workspace_id) setSelectedWorkspace(settings.clockify_workspace_id);
      setIgnoredEmails(settings.clockify_ignored_emails || DEFAULT_IGNORED_EMAILS);
      if (settings.huly_token) setHulyToken(settings.huly_token);
      if (settings.slack_bot_token) setSlackBotToken(settings.slack_bot_token);
      setSlackChannelFilters(settings.slack_channel_filters || "");
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
      await api.saveSetting("clockify_ignored_emails", normalizeIgnoredEmails(ignoredEmails));
      setSaveStatus("Settings saved");
      setIgnoredEmails(normalizeIgnoredEmails(ignoredEmails));
      await loadEmployees();
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) { setSaveStatus(`Error: ${err}`); }
  };

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

  return (
    <div>
      <h1 style={styles.pageTitle}>SETTINGS</h1>
      <div style={styles.pageTitleBar} />

      {/* Clockify Connection */}
      <div style={styles.card}>
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
          <label style={styles.label}>IGNORED CLOCKIFY EMAILS</label>
          <textarea
            value={ignoredEmails}
            onChange={(e) => setIgnoredEmails(e.target.value)}
            placeholder={DEFAULT_IGNORED_EMAILS}
            style={{ ...styles.input, minHeight: 72, resize: "vertical" }}
          />
          <div style={styles.helperText}>
            COMMA OR NEWLINE SEPARATED. THESE PEOPLE ARE EXCLUDED FROM CLOCKIFY HOURS,
            CREW STATUS, TIMELINES, AND OVERVIEW METRICS.
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
      <div style={styles.card}>
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
      <div style={styles.card}>
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

      {/* Sync Controls */}
      <div style={styles.card}>
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
      <div style={styles.card}>
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
              {employees.filter((emp) => emp.isActive).map((emp) => (
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
  pageTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 8,
    color: "var(--lcars-orange)",
    letterSpacing: "4px",
    textTransform: "uppercase" as const,
  },
  pageTitleBar: {
    height: 3,
    background: "linear-gradient(90deg, var(--lcars-orange), transparent)",
    marginBottom: 24,
  },
  card: {
    background: "rgba(26, 26, 46, 0.6)",
    borderLeft: "4px solid var(--lcars-lavender)",
    padding: 24,
    marginBottom: 20,
  },
  sectionTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--lcars-orange)",
    marginBottom: 8,
    letterSpacing: "2px",
    textTransform: "uppercase" as const,
  },
  sectionDivider: {
    height: 2,
    background: "rgba(153, 153, 204, 0.15)",
    marginBottom: 16,
  },
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
  input: {
    background: "rgba(10, 10, 26, 0.8)",
    border: "1px solid rgba(255, 153, 0, 0.25)",
    borderRadius: 0,
    color: "var(--lcars-orange)",
    padding: "12px 14px",
    fontSize: 13,
    fontFamily: "'JetBrains Mono', monospace",
    outline: "none",
    width: "100%",
  },
  inputRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
  },
  primaryButton: {
    background: "var(--lcars-orange)",
    color: "#000",
    border: "none",
    borderRadius: 2,
    padding: "8px 16px",
    fontSize: 10,
    fontWeight: 700,
    fontFamily: "'Orbitron', sans-serif",
    cursor: "pointer",
    letterSpacing: "1.5px",
    textTransform: "uppercase" as const,
    transition: "opacity 0.15s",
  },
  ghostButton: {
    background: "transparent",
    border: "1px solid rgba(255, 153, 0, 0.3)",
    borderRadius: 2,
    color: "var(--lcars-orange)",
    padding: "8px 16px",
    fontSize: 10,
    fontWeight: 600,
    fontFamily: "'Orbitron', sans-serif",
    cursor: "pointer",
    letterSpacing: "1px",
    textTransform: "uppercase" as const,
    whiteSpace: "nowrap",
    transition: "opacity 0.15s",
  },
  buttonRow: {
    display: "flex",
    gap: 12,
    alignItems: "center",
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
  emptyText: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 11,
    color: "var(--text-quaternary)",
    letterSpacing: "2px",
    textTransform: "uppercase" as const,
  },
  helperText: {
    marginTop: 8,
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    color: "var(--text-quaternary)",
    letterSpacing: "1px",
    lineHeight: 1.6,
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 12,
    marginBottom: 16,
  },
  summaryItem: {
    background: "rgba(10, 10, 26, 0.55)",
    border: "1px solid rgba(153, 153, 204, 0.14)",
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
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 13,
  },
  th: {
    textAlign: "left" as const,
    color: "var(--lcars-lavender)",
    fontFamily: "'Orbitron', sans-serif",
    fontWeight: 500,
    padding: "8px 12px",
    borderBottom: "1px solid rgba(255, 153, 0, 0.15)",
    fontSize: 10,
    textTransform: "uppercase" as const,
    letterSpacing: "1.5px",
    background: "rgba(255, 153, 0, 0.05)",
  },
  td: {
    padding: "10px 12px",
    color: "var(--lcars-tan)",
    borderBottom: "1px solid rgba(153, 153, 204, 0.08)",
  },
  tdMono: {
    padding: "10px 12px",
    color: "var(--lcars-lavender)",
    borderBottom: "1px solid rgba(153, 153, 204, 0.08)",
    fontFamily: "'JetBrains Mono', monospace",
  },
};

export default Settings;
