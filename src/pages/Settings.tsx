import { useState, useEffect, useCallback } from "react";
import { useInvoke } from "../hooks/useInvoke";
import { timeAgo } from "../lib/format";
import type { ClockifyWorkspace, Employee, SyncState } from "../lib/types";

function Settings() {
  const api = useInvoke();

  // Clockify connection state
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "testing" | "success" | "error"
  >("idle");
  const [connectedUser, setConnectedUser] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<ClockifyWorkspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState("");
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [syncStates, setSyncStates] = useState<SyncState[]>([]);

  // Employees
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [editingQuotas, setEditingQuotas] = useState<Record<string, string>>(
    {}
  );

  // Load settings on mount
  const loadSettings = useCallback(async () => {
    try {
      const settings = await api.getSettings();
      if (settings.clockify_api_key) {
        setApiKey(settings.clockify_api_key);
      }
      if (settings.clockify_workspace_id) {
        setSelectedWorkspace(settings.clockify_workspace_id);
      }
    } catch {
      // Settings may not exist yet
    }
  }, []);

  const loadSyncStatus = useCallback(async () => {
    try {
      const states = await api.getSyncStatus();
      setSyncStates(states);
    } catch {
      // ignore
    }
  }, []);

  const loadEmployees = useCallback(async () => {
    try {
      const emps = await api.getEmployees();
      setEmployees(emps);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadSettings();
    loadSyncStatus();
    loadEmployees();
  }, [loadSettings, loadSyncStatus, loadEmployees]);

  // Test connection
  const handleTestConnection = async () => {
    if (!apiKey.trim()) return;
    setConnectionStatus("testing");
    setConnectedUser(null);
    setWorkspaces([]);
    try {
      const user = await api.testClockifyConnection(apiKey);
      setConnectedUser(user.name);
      setConnectionStatus("success");
      // Fetch workspaces
      const ws = await api.getClockifyWorkspaces(apiKey);
      setWorkspaces(ws);
      if (ws.length > 0 && !selectedWorkspace) {
        setSelectedWorkspace(ws[0].id);
      }
    } catch (err) {
      setConnectionStatus("error");
      setConnectedUser(String(err));
    }
  };

  // Save settings
  const handleSave = async () => {
    setSaveStatus(null);
    try {
      await api.saveSetting("clockify_api_key", apiKey);
      if (selectedWorkspace) {
        await api.saveSetting("clockify_workspace_id", selectedWorkspace);
      }
      setSaveStatus("Settings saved");
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      setSaveStatus(`Error: ${err}`);
    }
  };

  // Trigger sync
  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await api.triggerSync();
      setSyncResult(result);
      await loadSyncStatus();
      await loadEmployees();
    } catch (err) {
      setSyncResult(`Error: ${err}`);
    } finally {
      setSyncing(false);
    }
  };

  // Update employee quota
  const handleQuotaSave = async (employeeId: string) => {
    const val = editingQuotas[employeeId];
    if (val === undefined) return;
    const quota = parseFloat(val);
    if (isNaN(quota) || quota < 0) return;
    try {
      await api.updateEmployeeQuota(employeeId, quota);
      await loadEmployees();
      setEditingQuotas((prev) => {
        const next = { ...prev };
        delete next[employeeId];
        return next;
      });
    } catch {
      // ignore
    }
  };

  return (
    <div>
      <h1 style={styles.pageTitle}>Settings</h1>

      {/* Clockify Connection */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>Clockify Connection</h2>

        <div style={styles.field}>
          <label style={styles.label}>API Key</label>
          <div style={styles.inputRow}>
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your Clockify API key"
              style={{ ...styles.input, flex: 1 }}
            />
            <button
              onClick={() => setShowKey(!showKey)}
              style={styles.ghostButton}
            >
              {showKey ? "Hide" : "Show"}
            </button>
            <button
              onClick={handleTestConnection}
              disabled={connectionStatus === "testing" || !apiKey.trim()}
              style={{
                ...styles.ghostButton,
                opacity:
                  connectionStatus === "testing" || !apiKey.trim() ? 0.5 : 1,
              }}
            >
              {connectionStatus === "testing" ? "Testing..." : "Test Connection"}
            </button>
          </div>
          {connectionStatus === "success" && connectedUser && (
            <div style={styles.successText}>
              Connected as {connectedUser}
            </div>
          )}
          {connectionStatus === "error" && connectedUser && (
            <div style={styles.errorText}>{connectedUser}</div>
          )}
        </div>

        {workspaces.length > 0 && (
          <div style={styles.field}>
            <label style={styles.label}>Workspace</label>
            <select
              value={selectedWorkspace}
              onChange={(e) => setSelectedWorkspace(e.target.value)}
              style={styles.input}
            >
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={styles.buttonRow}>
          <button onClick={handleSave} style={styles.primaryButton}>
            Save
          </button>
          {saveStatus && (
            <span
              style={{
                ...styles.label,
                color: saveStatus.startsWith("Error")
                  ? "var(--status-critical)"
                  : "var(--status-success)",
              }}
            >
              {saveStatus}
            </span>
          )}
        </div>
      </div>

      {/* Sync Controls */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>Sync Controls</h2>

        <div style={styles.buttonRow}>
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{
              ...styles.primaryButton,
              opacity: syncing ? 0.5 : 1,
            }}
          >
            {syncing ? "Syncing..." : "Sync Now"}
          </button>
          {syncResult && (
            <span
              style={{
                ...styles.label,
                color: syncResult.startsWith("Error")
                  ? "var(--status-critical)"
                  : "var(--status-success)",
              }}
            >
              {syncResult}
            </span>
          )}
        </div>

        {syncStates.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <label style={styles.label}>Last Sync Times</label>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Source</th>
                  <th style={styles.th}>Entity</th>
                  <th style={styles.th}>Last Sync</th>
                </tr>
              </thead>
              <tbody>
                {syncStates.map((s) => (
                  <tr key={`${s.source}-${s.entity}`}>
                    <td style={styles.td}>{s.source}</td>
                    <td style={styles.td}>{s.entity}</td>
                    <td style={styles.td}>{timeAgo(s.lastSyncAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Employee Management */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>Employee Management</h2>

        {employees.length === 0 ? (
          <p style={styles.emptyText}>
            No employees synced yet. Run a sync to populate.
          </p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>Email</th>
                <th style={styles.th}>Monthly Quota (hrs)</th>
                <th style={styles.th}>Active</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id}>
                  <td style={styles.td}>{emp.name}</td>
                  <td style={styles.td}>{emp.email}</td>
                  <td style={styles.td}>
                    <div style={styles.inputRow}>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={
                          editingQuotas[emp.id] !== undefined
                            ? editingQuotas[emp.id]
                            : emp.monthlyQuotaHours
                        }
                        onChange={(e) =>
                          setEditingQuotas((prev) => ({
                            ...prev,
                            [emp.id]: e.target.value,
                          }))
                        }
                        onBlur={() => handleQuotaSave(emp.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleQuotaSave(emp.id);
                        }}
                        style={{
                          ...styles.input,
                          width: 80,
                          padding: "6px 10px",
                        }}
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
                        backgroundColor: emp.isActive
                          ? "var(--status-success)"
                          : "var(--text-quaternary)",
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
    fontSize: 20,
    fontWeight: 600,
    marginBottom: 24,
    color: "var(--text-primary)",
    letterSpacing: "-0.02em",
  },
  card: {
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid var(--border-standard)",
    borderRadius: "var(--radius-lg)",
    padding: 24,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 510,
    color: "var(--text-primary)",
    marginBottom: 16,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    display: "block",
    fontSize: 13,
    color: "var(--text-tertiary)",
    marginBottom: 6,
  },
  input: {
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid var(--border-standard)",
    borderRadius: "var(--radius-md)",
    color: "var(--text-secondary)",
    padding: "12px 14px",
    fontSize: 13,
    fontFamily: "var(--font-sans)",
    outline: "none",
    width: "100%",
  },
  inputRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
  },
  primaryButton: {
    background: "var(--accent-brand)",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius-md)",
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 510,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
    transition: "opacity 0.15s",
  },
  ghostButton: {
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid var(--border-standard)",
    borderRadius: "var(--radius-md)",
    color: "var(--text-secondary)",
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 510,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
    transition: "opacity 0.15s",
    whiteSpace: "nowrap",
  },
  buttonRow: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    marginTop: 8,
  },
  successText: {
    fontSize: 13,
    color: "var(--status-success)",
    marginTop: 8,
  },
  errorText: {
    fontSize: 13,
    color: "var(--status-critical)",
    marginTop: 8,
  },
  emptyText: {
    fontSize: 13,
    color: "var(--text-tertiary)",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 13,
  },
  th: {
    textAlign: "left" as const,
    color: "var(--text-tertiary)",
    fontWeight: 500,
    padding: "8px 12px",
    borderBottom: "1px solid var(--border-subtle)",
    fontSize: 12,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  td: {
    padding: "10px 12px",
    color: "var(--text-secondary)",
    borderBottom: "1px solid var(--border-subtle)",
  },
};

export default Settings;
