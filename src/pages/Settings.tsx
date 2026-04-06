import { useState, useEffect, useCallback } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { timeAgo } from "../lib/format";
import type { ClockifyWorkspace, Employee, SyncState } from "../lib/types";

function Settings() {
  const api = useInvoke();

  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [connectedUser, setConnectedUser] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<ClockifyWorkspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState("");
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const [hulyToken, setHulyToken] = useState("");
  const [showHulyToken, setShowHulyToken] = useState(false);
  const [hulyStatus, setHulyStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [hulyMessage, setHulyMessage] = useState<string | null>(null);
  const [hulySyncing, setHulySyncing] = useState(false);
  const [hulySyncResult, setHulySyncResult] = useState<string | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [syncStates, setSyncStates] = useState<SyncState[]>([]);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [editingQuotas, setEditingQuotas] = useState<Record<string, string>>({});

  const loadSettings = useCallback(async () => {
    try {
      const settings = await api.getSettings();
      if (settings.clockify_api_key) setApiKey(settings.clockify_api_key);
      if (settings.clockify_workspace_id) setSelectedWorkspace(settings.clockify_workspace_id);
      if (settings.huly_token) setHulyToken(settings.huly_token);
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
      setSaveStatus("Settings saved");
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
