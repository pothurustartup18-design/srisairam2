import React, { useState, useEffect, useCallback } from 'react';
import { Terminal, Shield, Cpu, Database, LogOut, CheckCircle2, User, MessageCircle, AlertTriangle, Play, RefreshCw, Trash2, Send, Download, Upload, HardDrive, Activity, XCircle, ScrollText, Users, ToggleLeft, Ban, Plus, X, Layers, Table2 } from 'lucide-react';
import type { UserProfile } from '../../types';
import { API_BASE } from '../../constants';
import QueueMonitor from './QueueMonitor';
import RedisInspector from './RedisInspector';
import CollectionExplorer from './CollectionExplorer';

// /healthz lives outside /api — derive the bare server origin from API_BASE
const SERVER_BASE = API_BASE.replace(/\/api\/?$/, '');

interface SuperAdminPortalProps {
  user: UserProfile;
  onLogout: () => void;
}

interface SimulatedMessage {
  _id: string;
  recipient: string;
  templateName: string;
  body: string;
  status: string;
  createdAt: string;
}

interface StorageStats {
  mongo?: {
    dbSize?: number;
    collectionsCount?: number;
    objectsCount?: number;
  };
  s3?: {
    bucketName?: string;
    totalSize?: number;
    objectsCount?: number;
  };
}

interface HealthzReport {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  mongo: string;
  redis: string;
  s3: string;
  whatsapp: string;
  timestamp: string;
}

interface WhatsAppHealthReport {
  mode: 'live' | 'simulation';
  overall: 'ok' | 'degraded' | 'error';
  checks: Record<string, { ok: boolean; detail: string } | undefined>;
  phoneNumber?: { displayPhoneNumber?: string; verifiedName?: string; qualityRating?: string };
  tokenInfo?: { type?: string; isPermanent: boolean; expiresAt: number | null; detail: string };
  checkedAt: string;
}

interface AuditLogEntry {
  _id: string;
  userId?: string;
  username?: string;
  role?: string;
  action: string;
  method: string;
  path: string;
  entityId?: string;
  statusCode: number;
  ip?: string;
  createdAt: string;
}

interface SessionEntry {
  userId: string;
  username?: string;
  name?: string;
  role?: string;
  employeeId?: string;
  isActive?: boolean;
  lastLogin?: string;
  activeSessionCount: number;
  redisSessionCount: number;
  mongoSessions: Array<{ deviceInfo?: string; ipAddress?: string; expiresAt?: string; createdAt?: string }>;
}

interface ConfigEntry {
  _id?: string;
  key: string;
  value: any;
  updatedAt?: string;
}

const formatUptime = (totalSeconds: number): string => {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const HealthRow: React.FC<{ label: string; ok?: boolean; detail: string }> = ({ label, ok, detail }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
      <span style={{ color: '#cbd5e1', fontWeight: 500 }}>{label}</span>
    </div>
    <span style={{ color: ok ? '#34d399' : '#f87171', fontWeight: 600, fontSize: '12px', textTransform: 'capitalize' }}>{detail}</span>
  </div>
);

const SuperAdminPortal: React.FC<SuperAdminPortalProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'database' | 'whatsapp' | 'audit' | 'sessions' | 'flags' | 'queues' | 'redis' | 'collections'>('dashboard');

  // System Health State
  const [healthz, setHealthz] = useState<HealthzReport | null>(null);
  const [waHealth, setWaHealth] = useState<WhatsAppHealthReport | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);

  // Audit Log State
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditActionFilter, setAuditActionFilter] = useState('');
  const [auditUsernameFilter, setAuditUsernameFilter] = useState('');
  const [loadingAudit, setLoadingAudit] = useState(false);
  const AUDIT_PAGE_SIZE = 25;

  // Sessions State
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [revokingUserId, setRevokingUserId] = useState<string | null>(null);

  // Config / Feature Flags State
  const [configs, setConfigs] = useState<ConfigEntry[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const [newConfigKey, setNewConfigKey] = useState('');
  const [newConfigValue, setNewConfigValue] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [editingConfigKey, setEditingConfigKey] = useState<string | null>(null);
  const [editingConfigValue, setEditingConfigValue] = useState('');

  // WhatsApp Messaging Quota State
  const [whatsappSentCount, setWhatsappSentCount] = useState(0);
  const [whatsappLimit, setWhatsappLimit] = useState(100);
  const [updatingLimit, setUpdatingLimit] = useState(false);
  const [resettingCount, setResettingCount] = useState(false);
  const [updatingLimitInput, setUpdatingLimitInput] = useState(100);

  // Database Seeding & Double Check State
  const [seeding, setSeeding] = useState(false);
  const [confirmSeedInput, setConfirmSeedInput] = useState('');

  // S3 / Database Sizing Statistics
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [disableEventS3Storage, setDisableEventS3Storage] = useState(false);

  // Purge Event Media & Double Check State
  const [purgingMedia, setPurgingMedia] = useState(false);
  const [confirmPurgeInput, setConfirmPurgeInput] = useState('');

  // Database Backups & Restore State
  const [downloading, setDownloading] = useState<'students' | 's3' | null>(null);
  const [selectedCsvFile, setSelectedCsvFile] = useState<File | null>(null);
  const [restoringDb, setRestoringDb] = useState(false);

  // WhatsApp Simulation Log State
  const [simulatedMessages, setSimulatedMessages] = useState<SimulatedMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [clearingLogs, setClearingLogs] = useState(false);

  const authHeaders = (): HeadersInit => {
    const token = localStorage.getItem('schoolhub_access_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchHealth = useCallback(async () => {
    setLoadingHealth(true);
    try {
      const [healthzRes, waRes] = await Promise.all([
        fetch(`${SERVER_BASE}/healthz`).then((r) => r.json()).catch(() => null),
        fetch(`${API_BASE}/whatsapp/health`, { headers: authHeaders() }).then((r) => r.json()).catch(() => null)
      ]);
      if (healthzRes) setHealthz(healthzRes);
      if (waRes && waRes.data) setWaHealth(waRes.data);
    } finally {
      setLoadingHealth(false);
    }
  }, []);

  const fetchAuditLogs = async (page = 1) => {
    setLoadingAudit(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(AUDIT_PAGE_SIZE) });
      if (auditActionFilter.trim()) params.set('action', auditActionFilter.trim());
      if (auditUsernameFilter.trim()) params.set('username', auditUsernameFilter.trim());
      const res = await fetch(`${API_BASE}/settings/audit-logs?${params.toString()}`, { headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        setAuditLogs(Array.isArray(data.data) ? data.data : []);
        setAuditTotal(Number(data.total) || 0);
        setAuditPage(page);
      }
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoadingAudit(false);
    }
  };

  const fetchSessions = async () => {
    setLoadingSessions(true);
    try {
      const res = await fetch(`${API_BASE}/settings/sessions`, { headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        setSessions(Array.isArray(data.data) ? data.data : []);
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    } finally {
      setLoadingSessions(false);
    }
  };

  const fetchAllConfigs = async () => {
    setLoadingConfigs(true);
    try {
      const res = await fetch(`${API_BASE}/settings/system-config/all`, { headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        setConfigs(Array.isArray(data.data) ? data.data : []);
      }
    } catch (err) {
      console.error('Failed to fetch system configs:', err);
    } finally {
      setLoadingConfigs(false);
    }
  };

  const fetchWhatsappQuota = async () => {
    try {
      const token = localStorage.getItem('schoolhub_access_token');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`${API_BASE}/settings/whatsapp-quota`, { headers });
      const data = await res.json();
      if (data.success) {
        setWhatsappSentCount(Number(data.count) || 0);
        setWhatsappLimit(Number(data.limit) || 100);
      }
    } catch (err) {
      console.error('Failed to fetch WhatsApp quota:', err);
    }
  };

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('schoolhub_access_token');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`${API_BASE}/settings/storage`, { headers });
      const resData = await res.json();
      if (resData.success && resData.data) {
        setStats(resData.data);
        setDisableEventS3Storage(!!resData.data.disableEventS3Storage);
      }
    } catch (err) {
      console.error('Failed to fetch storage stats:', err);
    }
  };

  const fetchSimulatedMessages = async () => {
    setLoadingMessages(true);
    try {
      const token = localStorage.getItem('schoolhub_access_token');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`${API_BASE}/settings/whatsapp-messages`, { headers });
      const data = await res.json();
      if (data && data.success) {
        setSimulatedMessages(Array.isArray(data.data) ? data.data : []);
      }
    } catch (err) {
      console.error('Failed to fetch simulated messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    fetchWhatsappQuota();
    const quotaInterval = setInterval(fetchWhatsappQuota, 30000);
    return () => clearInterval(quotaInterval);
  }, []);

  useEffect(() => {
    fetchHealth();
    const healthInterval = setInterval(fetchHealth, 15000);
    return () => clearInterval(healthInterval);
  }, [fetchHealth]);

  useEffect(() => {
    if (activeTab === 'database') {
      fetchStats();
    } else if (activeTab === 'whatsapp') {
      fetchSimulatedMessages();
    } else if (activeTab === 'audit') {
      fetchAuditLogs(1);
    } else if (activeTab === 'sessions') {
      fetchSessions();
    } else if (activeTab === 'flags') {
      fetchAllConfigs();
    }
  }, [activeTab]);

  const handleUpdateWhatsappLimit = async () => {
    setUpdatingLimit(true);
    try {
      const token = localStorage.getItem('schoolhub_access_token');
      const response = await fetch(`${API_BASE}/settings/system-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({ key: 'whatsappLimit', value: updatingLimitInput })
      });
      const data = await response.json();
      if (data.success) {
        setWhatsappLimit(updatingLimitInput);
        alert('Quota limit updated successfully.');
      } else {
        alert(data.message || 'Failed to update limit.');
      }
    } catch (err: any) {
      alert(err.message || 'Error updating limit.');
    } finally {
      setUpdatingLimit(false);
    }
  };

  const handleResetWhatsappCount = async () => {
    if (!confirm('Are you sure you want to reset the WhatsApp messaging sent counter?')) return;
    setResettingCount(true);
    try {
      const token = localStorage.getItem('schoolhub_access_token');
      const response = await fetch(`${API_BASE}/settings/system-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({ key: 'whatsappSentCount', value: 0 })
      });
      const data = await response.json();
      if (data.success) {
        setWhatsappSentCount(0);
        alert('Quota reset successfully.');
      } else {
        alert(data.message || 'Failed to reset quota.');
      }
    } catch (err: any) {
      alert(err.message || 'Error resetting quota.');
    } finally {
      setResettingCount(false);
    }
  };

  const handleSeedDatabase = async () => {
    if (confirmSeedInput !== 'DELETE') {
      alert('Confirmation code mismatch. Please type "DELETE" to confirm.');
      return;
    }
    setSeeding(true);
    try {
      const token = localStorage.getItem('schoolhub_access_token');
      const response = await fetch(`${API_BASE}/settings/seed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        // The endpoint refuses to wipe the database without this explicit
        // acknowledgement (and refuses outright when NODE_ENV=production).
        body: JSON.stringify({ confirm: 'DELETE ALL DATA' })
      });
      const data = await response.json();
      if (data.success) {
        alert('Database cleared and successfully seeded.');
        setConfirmSeedInput('');
        fetchStats();
      } else {
        alert(data.message || 'Database seeding failed.');
      }
    } catch (err: any) {
      alert(err.message || 'Seeding error.');
    } finally {
      setSeeding(false);
    }
  };

  const handleToggleEventS3 = async () => {
    const newValue = !disableEventS3Storage;
    setDisableEventS3Storage(newValue);

    try {
      const token = localStorage.getItem('schoolhub_access_token');
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/settings/system-config`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ key: 'disableEventS3Storage', value: newValue })
      });
      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.message || 'Failed to update storage settings.');
      }
    } catch (err: any) {
      alert(err.message || 'Error updating S3 settings.');
      setDisableEventS3Storage(!newValue);
    }
  };

  const handleDeleteEventMedia = async () => {
    if (confirmPurgeInput !== 'DELETE') {
      alert('Confirmation code mismatch. Please type "DELETE" to confirm.');
      return;
    }
    setPurgingMedia(true);
    try {
      const token = localStorage.getItem('schoolhub_access_token');
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/settings/storage/events`, {
        method: 'DELETE',
        headers
      });
      const resData = await res.json();
      if (res.ok && resData.success) {
        alert(resData.message || 'Successfully purged event media files from S3.');
        setConfirmPurgeInput('');
        fetchStats();
      } else {
        alert(resData.message || 'Failed to delete S3 event media.');
      }
    } catch (err: any) {
      alert(err.message || 'Error occurred while purging media.');
    } finally {
      setPurgingMedia(false);
    }
  };

  const handleDownloadBackup = async (type: 'students' | 's3') => {
    setDownloading(type);
    try {
      const token = localStorage.getItem('schoolhub_access_token');
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/settings/backup/${type}`, {
        method: 'GET',
        headers
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to download.');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = type === 'students' 
        ? `students_backup_${dateStr}.csv` 
        : `s3_backup_${dateStr}.zip`;
        
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Failed to download backup files.');
    } finally {
      setDownloading(null);
    }
  };

  const handleRestoreDatabase = async () => {
    if (!selectedCsvFile) return;
    setRestoringDb(true);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result as string;
        const token = localStorage.getItem('schoolhub_access_token');
        const headers: HeadersInit = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${API_BASE}/settings/restore-students`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            file: {
              filename: selectedCsvFile.name,
              base64
            }
          })
        });

        const resData = await res.json();
        if (resData.success) {
          alert('Database restored successfully from CSV.');
          setSelectedCsvFile(null);
          fetchStats();
        } else {
          alert(resData.message || 'Failed to restore database.');
        }
      } catch (err: any) {
        alert(err.message || 'Error occurred during database restoration.');
      } finally {
        setRestoringDb(false);
      }
    };
    reader.readAsDataURL(selectedCsvFile);
  };
  const handleClearSimulationLogs = async () => {
    if (!confirm('Are you sure you want to clear all simulated WhatsApp message logs?')) return;
    setClearingLogs(true);
    try {
      const token = localStorage.getItem('schoolhub_access_token');
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${API_BASE}/settings/whatsapp-messages/clear`, {
        method: 'POST',
        headers
      });
      const data = await response.json();
      if (data.success) {
        setSimulatedMessages([]);
        alert('Simulation logs cleared successfully.');
      }
    } catch (err: any) {
      alert(err.message || 'Error clearing logs.');
    } finally {
      setClearingLogs(false);
    }
  };

  const handleRevokeSession = async (userId: string, label: string) => {
    if (!confirm(`Force-logout all active sessions for ${label}? Their current access token stays valid for up to 1 hour but cannot be refreshed.`)) return;
    setRevokingUserId(userId);
    try {
      const res = await fetch(`${API_BASE}/settings/sessions/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ userId })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'Sessions revoked.');
        fetchSessions();
      } else {
        alert(data.message || 'Failed to revoke sessions.');
      }
    } catch (err: any) {
      alert(err.message || 'Error revoking sessions.');
    } finally {
      setRevokingUserId(null);
    }
  };

  // Best-effort parse so numbers/booleans/JSON typed into the flag editor
  // round-trip correctly instead of always being stored as strings.
  const parseConfigInput = (raw: string): any => {
    const trimmed = raw.trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  };

  const handleCreateConfig = async () => {
    if (!newConfigKey.trim()) {
      alert('Key is required.');
      return;
    }
    setSavingConfig(true);
    try {
      const res = await fetch(`${API_BASE}/settings/system-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ key: newConfigKey.trim(), value: parseConfigInput(newConfigValue) })
      });
      const data = await res.json();
      if (data.success) {
        setNewConfigKey('');
        setNewConfigValue('');
        fetchAllConfigs();
      } else {
        alert(data.message || 'Failed to save config.');
      }
    } catch (err: any) {
      alert(err.message || 'Error saving config.');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleUpdateConfig = async (key: string) => {
    setSavingConfig(true);
    try {
      const res = await fetch(`${API_BASE}/settings/system-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ key, value: parseConfigInput(editingConfigValue) })
      });
      const data = await res.json();
      if (data.success) {
        setEditingConfigKey(null);
        fetchAllConfigs();
      } else {
        alert(data.message || 'Failed to update config.');
      }
    } catch (err: any) {
      alert(err.message || 'Error updating config.');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleDeleteConfig = async (key: string) => {
    if (!confirm(`Delete config key "${key}"? This may recreate itself with a default value if a route depends on it.`)) return;
    try {
      const res = await fetch(`${API_BASE}/settings/system-config/${encodeURIComponent(key)}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      const data = await res.json();
      if (data.success) {
        fetchAllConfigs();
      } else {
        alert(data.message || 'Failed to delete config.');
      }
    } catch (err: any) {
      alert(err.message || 'Error deleting config.');
    }
  };

  const formatBytes = (bytes: number): string => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const filteredMessages = (simulatedMessages || []).filter(msg => {
    if (!msg) return false;
    const term = (searchFilter || '').toLowerCase();
    const recipient = String(msg.recipient || '');
    const templateName = String(msg.templateName || '');
    const body = String(msg.body || '');
    return (
      recipient.toLowerCase().includes(term) ||
      templateName.toLowerCase().includes(term) ||
      body.toLowerCase().includes(term)
    );
  });

  const displayDate = (dateStr: string) => {
    try {
      if (!dateStr) return 'N/A';
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? 'N/A' : d.toLocaleString();
    } catch {
      return 'N/A';
    }
  };

  const s3UsagePercent = stats?.s3?.totalSize ? (stats.s3.totalSize / (5 * 1024 * 1024 * 1024)) * 100 : 0;

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: '#0f172a', color: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Sidebar */}
      <aside style={{ width: '260px', height: '100vh', backgroundColor: '#1e293b', borderRight: '1px solid #334155', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flexShrink: 0, padding: '24px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #334155' }}>
          <Terminal className="w-6 h-6 text-indigo-400" />
          <span style={{ fontWeight: 700, fontSize: '18px', color: '#f8fafc' }}>DevPortal</span>
        </div>

        <nav style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button 
            onClick={() => setActiveTab('dashboard')}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: activeTab === 'dashboard' ? '#312e81' : 'transparent', color: '#f8fafc', cursor: 'pointer', textAlign: 'left', fontWeight: activeTab === 'dashboard' ? 600 : 500 }}
          >
            <Cpu className="w-5 h-5 text-indigo-400" />
            <span>Dashboard</span>
          </button>
          <button 
            onClick={() => setActiveTab('database')}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: activeTab === 'database' ? '#312e81' : 'transparent', color: activeTab === 'database' ? '#f8fafc' : '#94a3b8', cursor: 'pointer', textAlign: 'left', fontWeight: activeTab === 'database' ? 600 : 500 }}
          >
            <Database className="w-5 h-5 text-indigo-400" />
            <span>Database &amp; Storage</span>
          </button>
          <button 
            onClick={() => setActiveTab('whatsapp')}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: activeTab === 'whatsapp' ? '#312e81' : 'transparent', color: activeTab === 'whatsapp' ? '#f8fafc' : '#94a3b8', cursor: 'pointer', textAlign: 'left', fontWeight: activeTab === 'whatsapp' ? 600 : 500 }}
          >
            <MessageCircle className="w-5 h-5 text-indigo-400" />
            <span>WhatsApp Simulation</span>
          </button>
          <button
            onClick={() => setActiveTab('sessions')}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: activeTab === 'sessions' ? '#312e81' : 'transparent', color: activeTab === 'sessions' ? '#f8fafc' : '#94a3b8', cursor: 'pointer', textAlign: 'left', fontWeight: activeTab === 'sessions' ? 600 : 500 }}
          >
            <Users className="w-5 h-5 text-indigo-400" />
            <span>Active Sessions</span>
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: activeTab === 'audit' ? '#312e81' : 'transparent', color: activeTab === 'audit' ? '#f8fafc' : '#94a3b8', cursor: 'pointer', textAlign: 'left', fontWeight: activeTab === 'audit' ? 600 : 500 }}
          >
            <ScrollText className="w-5 h-5 text-indigo-400" />
            <span>Audit Trail</span>
          </button>
          <button
            onClick={() => setActiveTab('flags')}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: activeTab === 'flags' ? '#312e81' : 'transparent', color: activeTab === 'flags' ? '#f8fafc' : '#94a3b8', cursor: 'pointer', textAlign: 'left', fontWeight: activeTab === 'flags' ? 600 : 500 }}
          >
            <ToggleLeft className="w-5 h-5 text-indigo-400" />
            <span>Config Flags</span>
          </button>
          <button
            onClick={() => setActiveTab('queues')}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: activeTab === 'queues' ? '#312e81' : 'transparent', color: activeTab === 'queues' ? '#f8fafc' : '#94a3b8', cursor: 'pointer', textAlign: 'left', fontWeight: activeTab === 'queues' ? 600 : 500 }}
          >
            <Layers className="w-5 h-5 text-indigo-400" />
            <span>Job Queues</span>
          </button>
          <button
            onClick={() => setActiveTab('redis')}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: activeTab === 'redis' ? '#312e81' : 'transparent', color: activeTab === 'redis' ? '#f8fafc' : '#94a3b8', cursor: 'pointer', textAlign: 'left', fontWeight: activeTab === 'redis' ? 600 : 500 }}
          >
            <Cpu className="w-5 h-5 text-indigo-400" />
            <span>Redis Cache</span>
          </button>
          <button
            onClick={() => setActiveTab('collections')}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: activeTab === 'collections' ? '#312e81' : 'transparent', color: activeTab === 'collections' ? '#f8fafc' : '#94a3b8', cursor: 'pointer', textAlign: 'left', fontWeight: activeTab === 'collections' ? 600 : 500 }}
          >
            <Table2 className="w-5 h-5 text-indigo-400" />
            <span>DB Explorer</span>
          </button>
        </nav>

        <div style={{ flexShrink: 0, padding: '16px', borderTop: '1px solid #334155' }}>
          <button
            onClick={onLogout}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: '#ef44441a', color: '#f87171', cursor: 'pointer', textAlign: 'left', fontWeight: 600 }}
          >
            <LogOut className="w-5 h-5" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <header style={{ height: '70px', backgroundColor: '#1e293b', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 600, margin: 0, textTransform: 'capitalize' }}>{activeTab} Panel</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <User className="w-5 h-5 text-white" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '14px', fontWeight: 600 }}>{user.name || 'Developer'}</span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>{user.email || 'developer@schoolhub.edu'}</span>
            </div>
          </div>
        </header>

        {/* Content Body */}
        <main style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
          {/* Welcome Banner */}
          <div style={{ background: 'linear-gradient(135deg, #312e81 0%, #1e1b4b 100%)', borderRadius: '12px', padding: '24px', marginBottom: '24px', border: '1px solid #4338ca', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px 0', color: '#fff' }}>SuperAdmin Console</h3>
              <p style={{ margin: 0, color: '#c7d2fe', fontSize: '13px' }}>Clear database, download backups, toggle S3 upload configurations, and manage simulated message flows.</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#10b98126', border: '1px solid #10b9814d', borderRadius: '20px', padding: '6px 14px' }}>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span style={{ fontSize: '12px', color: '#34d399', fontWeight: 600 }}>Session Active</span>
            </div>
          </div>

          {/* Tab Content: Dashboard */}
          {activeTab === 'dashboard' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
              <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '24px', border: '1px solid #334155' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <Shield className="w-6 h-6 text-indigo-400" />
                  <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Developer Notice</h4>
                </div>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '14px', lineHeight: '1.6' }}>
                  Welcome back! Use the tabs on the left to navigate to the **Database &amp; Storage** manager or check the **WhatsApp Simulation logs**. All actions are logged and take effect in real time.
                </p>
              </div>

              <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '24px', border: '1px solid #334155' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <Cpu className="w-6 h-6 text-indigo-400" />
                  <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>System Environment</h4>
                </div>
                <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #334155' }}>
                      <td style={{ padding: '8px 0', color: '#94a3b8' }}>User Role:</td>
                      <td style={{ padding: '8px 0', fontWeight: 600, textAlign: 'right' }}>{user.role}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #334155' }}>
                      <td style={{ padding: '8px 0', color: '#94a3b8' }}>Username:</td>
                      <td style={{ padding: '8px 0', fontWeight: 600, textAlign: 'right' }}>{user.username}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '8px 0', color: '#94a3b8' }}>Uptime:</td>
                      <td style={{ padding: '8px 0', fontWeight: 600, textAlign: 'right' }}>
                        {healthz ? formatUptime(healthz.uptimeSeconds) : '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Live System Health Panel */}
              <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '24px', border: '1px solid #334155' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Activity className="w-6 h-6 text-indigo-400" />
                    <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>System Health</h4>
                  </div>
                  <button
                    onClick={fetchHealth}
                    style={{ backgroundColor: '#334155', border: 'none', borderRadius: '6px', color: '#f8fafc', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingHealth ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <HealthRow label="MongoDB" ok={healthz?.mongo === 'connected'} detail={healthz?.mongo || 'unknown'} />
                  <HealthRow label="Redis" ok={healthz?.redis === 'connected'} detail={healthz?.redis || 'unknown'} />
                  <HealthRow label="S3 Storage" ok={healthz?.s3 === 'configured'} detail={healthz?.s3 || 'unknown'} />
                  <HealthRow
                    label="WhatsApp"
                    ok={waHealth ? waHealth.overall === 'ok' : healthz?.whatsapp === 'live'}
                    detail={waHealth ? `${waHealth.mode} · ${waHealth.overall}` : (healthz?.whatsapp || 'unknown')}
                  />
                </div>

                {waHealth?.tokenInfo && (
                  <div style={{
                    marginTop: '16px', padding: '10px 14px', borderRadius: '8px',
                    backgroundColor: waHealth.tokenInfo.isPermanent ? '#10b9811a' : '#f59e0b1a',
                    border: `1px solid ${waHealth.tokenInfo.isPermanent ? '#10b98133' : '#f59e0b33'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px'
                  }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: waHealth.tokenInfo.isPermanent ? '#34d399' : '#f59e0b' }}>
                      {waHealth.tokenInfo.isPermanent ? 'Permanent Access Token' : 'Temporary Access Token'}
                    </span>
                    <span style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'right' }}>{waHealth.tokenInfo.detail}</span>
                  </div>
                )}

                {waHealth && (
                  <div style={{ borderTop: '1px solid #334155', marginTop: '16px', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {Object.entries(waHealth.checks || {}).filter(([, v]) => !!v).map(([name, check]) => (
                      <div key={name} style={{ fontSize: '12px', color: '#94a3b8' }}>
                        <span style={{ color: check!.ok ? '#34d399' : '#f87171', fontWeight: 600, textTransform: 'capitalize' }}>{name}: </span>
                        {check!.detail}
                      </div>
                    ))}
                    {waHealth.phoneNumber?.displayPhoneNumber && (
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                        Sending as <code style={{ color: '#c7d2fe' }}>{waHealth.phoneNumber.displayPhoneNumber}</code>
                        {waHealth.phoneNumber.verifiedName ? ` (${waHealth.phoneNumber.verifiedName})` : ''}
                      </div>
                    )}
                  </div>
                )}
                {!healthz && !loadingHealth && (
                  <p style={{ margin: '12px 0 0 0', fontSize: '12px', color: '#64748b' }}>Could not reach /healthz.</p>
                )}
              </div>
            </div>
          )}

          {/* Tab Content: Database & Storage */}
          {activeTab === 'database' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
              {/* Database & Seeding Operations Card */}
              <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '24px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Database className="w-6 h-6 text-indigo-400" />
                  <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Database Seeding Operations</h4>
                </div>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px', lineHeight: '1.5' }}>
                  Clean database collections and seed default datasets (including classes, 100 students, teachers, exams, and attendance). 
                  The active SuperAdmin account will be preserved during this process.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', backgroundColor: '#ef44440d', border: '1px solid #ef444433', borderRadius: '8px', padding: '12px' }}>
                  <span style={{ fontSize: '12px', color: '#f87171', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AlertTriangle className="w-4 h-4" /> Destructive Double-Check Checkpoint
                  </span>
                  <label style={{ fontSize: '11px', color: '#94a3b8', margin: '4px 0' }}>Type "DELETE" below to enable seeding button:</label>
                  <input
                    type="text"
                    placeholder='Type DELETE'
                    style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', padding: '6px 10px', fontSize: '13px' }}
                    value={confirmSeedInput}
                    onChange={(e) => setConfirmSeedInput(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={handleSeedDatabase}
                    disabled={seeding || confirmSeedInput !== 'DELETE'}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      backgroundColor: confirmSeedInput === 'DELETE' ? '#ef4444' : '#475569',
                      border: 'none',
                      borderRadius: '6px',
                      color: 'white',
                      padding: '10px 20px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: (seeding || confirmSeedInput !== 'DELETE') ? 'not-allowed' : 'pointer',
                      transition: 'background-color 0.2s'
                    }}
                  >
                    <Play className="w-4 h-4" />
                    <span>{seeding ? 'Seeding...' : 'Reset & Seed Database'}</span>
                  </button>
                </div>
              </div>

              {/* S3 Storage Monitor & Toggle Switch */}
              <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '24px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <HardDrive className="w-6 h-6 text-indigo-400" />
                  <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>S3 Cloud Storage Monitor</h4>
                </div>
                <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>Bucket Name:</span>
                    <code style={{ color: '#c7d2fe' }}>{stats?.s3?.bucketName || 'default-bucket'}</code>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>Objects Count:</span>
                    <span style={{ fontWeight: 600 }}>{stats?.s3?.objectsCount || 0} Files</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>Total Storage Size:</span>
                    <span style={{ fontWeight: 600 }}>{formatBytes(stats?.s3?.totalSize || 0)}</span>
                  </div>
                </div>

                {/* S3 Utilization Progress bar */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', marginTop: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                    <span>S3 Util (Ref: 5 GB limit):</span>
                    <span>{s3UsagePercent.toFixed(4)}%</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', backgroundColor: '#334155', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.min(s3UsagePercent, 100)}%`,
                      height: '100%',
                      backgroundColor: s3UsagePercent >= 90 ? '#ef4444' : '#f59e0b',
                      borderRadius: '4px'
                    }} />
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #334155', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Event S3 switch */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600 }}>Save Storage: Disable Event S3 Uploads</span>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>New event images will not consume S3 cloud quota</span>
                    </div>
                    <label style={{ position: 'relative', display: 'inline-block', width: '40px', height: '22px', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={disableEventS3Storage} 
                        onChange={handleToggleEventS3}
                        style={{ opacity: 0, width: 0, height: 0 }}
                      />
                      <span style={{
                        position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: disableEventS3Storage ? '#4f46e5' : '#475569',
                        borderRadius: '34px', transition: '0.4s'
                      }}>
                        <span style={{
                          position: 'absolute', content: '""', height: '16px', width: '16px', left: disableEventS3Storage ? '21px' : '3px', bottom: '3px',
                          backgroundColor: 'white', borderRadius: '50%', transition: '0.4s'
                        }} />
                      </span>
                    </label>
                  </div>

                  {/* Purge Event media */}
                  <div style={{ borderTop: '1px solid #334155', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '11px', color: '#94a3b8' }}>Type "DELETE" below to purge S3 Event Media:</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        placeholder="Type DELETE"
                        style={{ flex: 1, backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', padding: '6px 10px', fontSize: '13px' }}
                        value={confirmPurgeInput}
                        onChange={(e) => setConfirmPurgeInput(e.target.value)}
                      />
                      <button
                        onClick={handleDeleteEventMedia}
                        disabled={purgingMedia || confirmPurgeInput !== 'DELETE'}
                        style={{
                          backgroundColor: confirmPurgeInput === 'DELETE' ? '#ef4444' : '#475569',
                          border: 'none',
                          borderRadius: '6px',
                          color: 'white',
                          padding: '6px 12px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: (purgingMedia || confirmPurgeInput !== 'DELETE') ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {purgingMedia ? 'Purging...' : 'Purge Media'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Database Backups Card */}
              <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '24px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Download className="w-6 h-6 text-indigo-400" />
                  <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Database &amp; S3 Cloud Backups</h4>
                </div>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px', lineHeight: '1.5' }}>
                  Export active directories in CSV format or archive complete media attachments stored on S3.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600 }}>Student Database Backup</span>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>Available: {stats?.mongo?.objectsCount || 0} Students</span>
                    </div>
                    <button
                      onClick={() => handleDownloadBackup('students')}
                      disabled={downloading !== null}
                      style={{ backgroundColor: '#4f46e5', border: 'none', borderRadius: '6px', color: 'white', padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Download className="w-4 h-4" />
                      <span>{downloading === 'students' ? 'CSV...' : 'Download CSV'}</span>
                    </button>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #334155', paddingTop: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600 }}>Media Storage Backup</span>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>Available: {stats?.s3?.objectsCount || 0} files</span>
                    </div>
                    <button
                      onClick={() => handleDownloadBackup('s3')}
                      disabled={downloading !== null}
                      style={{ backgroundColor: '#4f46e5', border: 'none', borderRadius: '6px', color: 'white', padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Download className="w-4 h-4" />
                      <span>{downloading === 's3' ? 'ZIP...' : 'Download ZIP'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Restore Database from Backup Card */}
              <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '24px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Upload className="w-6 h-6 text-indigo-400" />
                  <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Restore Database from CSV Backup</h4>
                </div>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px', lineHeight: '1.5' }}>
                  Upload a student backup `.csv` file to restore directories. 
                  This fully replaces student tables with imported records.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => {
                      const files = e.target.files;
                      if (files && files[0]) setSelectedCsvFile(files[0]);
                    }}
                    style={{ fontSize: '13px', color: '#94a3b8' }}
                  />
                  {selectedCsvFile && (
                    <button
                      onClick={handleRestoreDatabase}
                      disabled={restoringDb}
                      style={{ backgroundColor: '#10b981', border: 'none', borderRadius: '6px', color: 'white', padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', width: 'fit-content', marginTop: '6px' }}
                    >
                      {restoringDb ? 'Restoring...' : 'Restore Database'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab Content: WhatsApp Simulation */}
          {activeTab === 'whatsapp' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
                {/* Quota Management Card */}
                <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '24px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <MessageCircle className="w-6 h-6 text-emerald-400" />
                      <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>WhatsApp Messaging Quota</h4>
                    </div>
                    {whatsappSentCount >= whatsappLimit ? (
                      <span style={{ fontSize: '11px', fontWeight: 600, backgroundColor: '#ef444433', color: '#f87171', padding: '4px 8px', borderRadius: '4px' }}>Locked</span>
                    ) : (
                      <span style={{ fontSize: '11px', fontWeight: 600, backgroundColor: '#10b98133', color: '#34d399', padding: '4px 8px', borderRadius: '4px' }}>Active</span>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: '#94a3b8' }}>Total Sent Alerts:</span>
                      <span style={{ fontWeight: 700, color: whatsappSentCount >= whatsappLimit ? '#f87171' : '#f8fafc' }}>
                        {whatsappSentCount} / {whatsappLimit} Limit
                      </span>
                    </div>
                    <div style={{ width: '100%', height: '8px', backgroundColor: '#334155', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.min(((whatsappSentCount || 0) / (whatsappLimit || 1)) * 100, 100)}%`,
                        height: '100%',
                        backgroundColor: whatsappSentCount >= whatsappLimit ? '#ef4444' : '#10b981',
                        borderRadius: '4px',
                        transition: 'width 0.4s'
                      }} />
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid #334155', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>Configure Message Limit</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="number"
                          min="1"
                          style={{ flex: 1, backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', padding: '8px 12px', fontSize: '14px' }}
                          value={updatingLimitInput}
                          onChange={(e) => setUpdatingLimitInput(Math.max(1, parseInt(e.target.value) || 0))}
                        />
                        <button
                          onClick={handleUpdateWhatsappLimit}
                          disabled={updatingLimit}
                          style={{ backgroundColor: '#4f46e5', border: 'none', borderRadius: '6px', color: 'white', padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                        >
                          {updatingLimit ? 'Saving...' : 'Set Limit'}
                        </button>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>Clear active count:</span>
                      <button
                        onClick={handleResetWhatsappCount}
                        disabled={resettingCount}
                        style={{ backgroundColor: '#ef4444', border: 'none', borderRadius: '6px', color: 'white', padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                      >
                        {resettingCount ? 'Resetting...' : 'Reset Quota'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Simulation logs stream list */}
              <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '24px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Send className="w-6 h-6 text-indigo-400" />
                    <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Simulated Outbound WhatsApp Logs</h4>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <input
                      type="text"
                      placeholder="Search recipient, template..."
                      style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', padding: '6px 12px', fontSize: '13px', width: '220px' }}
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                    />
                    <button 
                      onClick={fetchSimulatedMessages}
                      style={{ backgroundColor: '#334155', border: 'none', borderRadius: '6px', color: '#f8fafc', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}
                    >
                      <RefreshCw className={`w-4 h-4 ${loadingMessages ? 'animate-spin' : ''}`} />
                      <span>Reload</span>
                    </button>
                    <button 
                      onClick={handleClearSimulationLogs}
                      disabled={clearingLogs}
                      style={{ backgroundColor: '#ef44441a', border: '1px solid #ef444433', borderRadius: '6px', color: '#f87171', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Clear Logs</span>
                    </button>
                  </div>
                </div>

                <div style={{ overflowX: 'auto', border: '1px solid #334155', borderRadius: '8px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#0f172a', borderBottom: '1px solid #334155' }}>
                        <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Recipient</th>
                        <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Template/Type</th>
                        <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Message Body Preview</th>
                        <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Status</th>
                        <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMessages.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                            No simulated WhatsApp messages found.
                          </td>
                        </tr>
                      ) : (
                        filteredMessages.map((msg) => (
                          <tr key={msg._id || Math.random().toString()} style={{ borderBottom: '1px solid #334155', backgroundColor: '#1e293b' }}>
                            <td style={{ padding: '12px 16px', fontWeight: 600 }}>{String(msg.recipient || '')}</td>
                            <td style={{ padding: '12px 16px' }}><code style={{ backgroundColor: '#0f172a', padding: '2px 6px', borderRadius: '4px', color: '#c7d2fe' }}>{String(msg.templateName || '')}</code></td>
                            <td style={{ padding: '12px 16px', color: '#cbd5e1', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String(msg.body || '')}>
                              {String(msg.body || '')}
                            </td>
                            <td style={{ padding: '12px 16px' }}>
                              <span style={{ fontSize: '11px', fontWeight: 600, color: '#34d399', backgroundColor: '#10b9811a', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
                                {String(msg.status || '')}
                              </span>
                            </td>
                            <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{displayDate(msg.createdAt)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Tab Content: Active Sessions */}
          {activeTab === 'sessions' && (
            <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '24px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Users className="w-6 h-6 text-indigo-400" />
                  <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Users With Active Login Sessions</h4>
                </div>
                <button
                  onClick={fetchSessions}
                  style={{ backgroundColor: '#334155', border: 'none', borderRadius: '6px', color: '#f8fafc', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}
                >
                  <RefreshCw className={`w-4 h-4 ${loadingSessions ? 'animate-spin' : ''}`} />
                  <span>Reload</span>
                </button>
              </div>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px', lineHeight: '1.5' }}>
                Sessions are tracked as Redis refresh-token markers (device/IP not retained) with a MongoDB fallback used only if Redis was down at login (which does retain device/IP).
                Revoking forces the user to re-authenticate: their current access token still works for up to 1 hour, but it can no longer be refreshed.
              </p>

              <div style={{ overflowX: 'auto', border: '1px solid #334155', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#0f172a', borderBottom: '1px solid #334155' }}>
                      <th style={{ padding: '12px 16px', color: '#94a3b8' }}>User</th>
                      <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Role</th>
                      <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Active Sessions</th>
                      <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Last Login</th>
                      <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Device / IP (fallback only)</th>
                      <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                          {loadingSessions ? 'Loading sessions...' : 'No active sessions found.'}
                        </td>
                      </tr>
                    ) : (
                      sessions.map((s) => (
                        <tr key={s.userId} style={{ borderBottom: '1px solid #334155' }}>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontWeight: 600 }}>{s.name || 'Unknown user'}</div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>{s.username || s.userId}</div>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 600, backgroundColor: '#4f46e51a', color: '#a5b4fc', padding: '2px 8px', borderRadius: '4px', textTransform: 'capitalize' }}>
                              {s.role || 'unknown'}
                            </span>
                            {s.isActive === false && (
                              <span style={{ marginLeft: '6px', fontSize: '11px', fontWeight: 600, backgroundColor: '#ef44441a', color: '#f87171', padding: '2px 8px', borderRadius: '4px' }}>
                                disabled
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '12px 16px', fontWeight: 600 }}>{s.activeSessionCount}</td>
                          <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{s.lastLogin ? displayDate(s.lastLogin) : 'N/A'}</td>
                          <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '12px' }}>
                            {s.mongoSessions.length === 0 ? '—' : s.mongoSessions.map((m, i) => (
                              <div key={i} title={m.deviceInfo}>
                                {m.ipAddress || 'unknown IP'} · <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', maxWidth: '160px', verticalAlign: 'bottom' }}>{m.deviceInfo || 'unknown device'}</span>
                              </div>
                            ))}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <button
                              onClick={() => handleRevokeSession(s.userId, s.name || s.username || s.userId)}
                              disabled={revokingUserId === s.userId}
                              style={{ backgroundColor: '#ef44441a', border: '1px solid #ef444433', borderRadius: '6px', color: '#f87171', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}
                            >
                              <Ban className="w-3.5 h-3.5" />
                              <span>{revokingUserId === s.userId ? 'Revoking...' : 'Force Logout'}</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab Content: Audit Trail */}
          {activeTab === 'audit' && (
            <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '24px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <ScrollText className="w-6 h-6 text-indigo-400" />
                  <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Audit Trail</h4>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="Filter by action prefix..."
                    style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', padding: '6px 12px', fontSize: '13px', width: '180px' }}
                    value={auditActionFilter}
                    onChange={(e) => setAuditActionFilter(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') fetchAuditLogs(1); }}
                  />
                  <input
                    type="text"
                    placeholder="Filter by username..."
                    style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', padding: '6px 12px', fontSize: '13px', width: '160px' }}
                    value={auditUsernameFilter}
                    onChange={(e) => setAuditUsernameFilter(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') fetchAuditLogs(1); }}
                  />
                  <button
                    onClick={() => fetchAuditLogs(1)}
                    style={{ backgroundColor: '#4f46e5', border: 'none', borderRadius: '6px', color: 'white', padding: '6px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Filter
                  </button>
                  <button
                    onClick={() => fetchAuditLogs(auditPage)}
                    style={{ backgroundColor: '#334155', border: 'none', borderRadius: '6px', color: '#f8fafc', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingAudit ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              <div style={{ overflowX: 'auto', border: '1px solid #334155', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#0f172a', borderBottom: '1px solid #334155' }}>
                      <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Timestamp</th>
                      <th style={{ padding: '12px 16px', color: '#94a3b8' }}>User</th>
                      <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Action</th>
                      <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Method / Path</th>
                      <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Status</th>
                      <th style={{ padding: '12px 16px', color: '#94a3b8' }}>IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                          {loadingAudit ? 'Loading audit logs...' : 'No audit entries found.'}
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((log) => (
                        <tr key={log._id} style={{ borderBottom: '1px solid #334155' }}>
                          <td style={{ padding: '12px 16px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{displayDate(log.createdAt)}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontWeight: 600 }}>{log.username || 'unknown'}</div>
                            <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'capitalize' }}>{log.role || ''}</div>
                          </td>
                          <td style={{ padding: '12px 16px' }}><code style={{ backgroundColor: '#0f172a', padding: '2px 6px', borderRadius: '4px', color: '#c7d2fe' }}>{log.action}</code></td>
                          <td style={{ padding: '12px 16px', color: '#cbd5e1' }}>
                            <span style={{ fontWeight: 600 }}>{log.method}</span> {log.path}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: log.statusCode >= 400 ? '#f87171' : '#34d399', backgroundColor: log.statusCode >= 400 ? '#ef44441a' : '#10b9811a', padding: '2px 6px', borderRadius: '4px' }}>
                              {log.statusCode}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{log.ip || 'N/A'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: '#94a3b8' }}>
                <span>
                  {auditTotal === 0 ? 'No results' : `Showing ${(auditPage - 1) * AUDIT_PAGE_SIZE + 1}–${Math.min(auditPage * AUDIT_PAGE_SIZE, auditTotal)} of ${auditTotal}`}
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => fetchAuditLogs(auditPage - 1)}
                    disabled={auditPage <= 1 || loadingAudit}
                    style={{ backgroundColor: '#334155', border: 'none', borderRadius: '6px', color: '#f8fafc', padding: '6px 12px', fontSize: '12px', cursor: auditPage <= 1 ? 'not-allowed' : 'pointer', opacity: auditPage <= 1 ? 0.5 : 1 }}
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => fetchAuditLogs(auditPage + 1)}
                    disabled={auditPage * AUDIT_PAGE_SIZE >= auditTotal || loadingAudit}
                    style={{ backgroundColor: '#334155', border: 'none', borderRadius: '6px', color: '#f8fafc', padding: '6px 12px', fontSize: '12px', cursor: auditPage * AUDIT_PAGE_SIZE >= auditTotal ? 'not-allowed' : 'pointer', opacity: auditPage * AUDIT_PAGE_SIZE >= auditTotal ? 0.5 : 1 }}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tab Content: Config Flags */}
          {activeTab === 'flags' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '24px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <ToggleLeft className="w-6 h-6 text-indigo-400" />
                  <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Add / Set Config Key</h4>
                </div>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px', lineHeight: '1.5' }}>
                  Raw editor over the <code style={{ backgroundColor: '#0f172a', padding: '2px 6px', borderRadius: '4px', color: '#c7d2fe' }}>SystemConfig</code> collection — every key the app reads (whatsappLimit, attendanceMode, disableEventS3Storage, marksUpdateEnabledClasses, ...) plus any custom flag you add here. Values are parsed as JSON when possible (e.g. <code>true</code>, <code>42</code>, <code>["a","b"]</code>), otherwise stored as a plain string.
                </p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="key (e.g. myFeatureEnabled)"
                    style={{ flex: '1 1 200px', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', padding: '8px 12px', fontSize: '13px' }}
                    value={newConfigKey}
                    onChange={(e) => setNewConfigKey(e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="value (e.g. true, 42, &quot;text&quot;)"
                    style={{ flex: '1 1 240px', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', padding: '8px 12px', fontSize: '13px' }}
                    value={newConfigValue}
                    onChange={(e) => setNewConfigValue(e.target.value)}
                  />
                  <button
                    onClick={handleCreateConfig}
                    disabled={savingConfig || !newConfigKey.trim()}
                    style={{ backgroundColor: '#4f46e5', border: 'none', borderRadius: '6px', color: 'white', padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Plus className="w-4 h-4" />
                    <span>{savingConfig ? 'Saving...' : 'Save'}</span>
                  </button>
                </div>
              </div>

              <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '24px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>All Config Keys</h4>
                  <button
                    onClick={fetchAllConfigs}
                    style={{ backgroundColor: '#334155', border: 'none', borderRadius: '6px', color: '#f8fafc', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingConfigs ? 'animate-spin' : ''}`} />
                    <span>Reload</span>
                  </button>
                </div>
                <div style={{ overflowX: 'auto', border: '1px solid #334155', borderRadius: '8px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#0f172a', borderBottom: '1px solid #334155' }}>
                        <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Key</th>
                        <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Value</th>
                        <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Updated</th>
                        <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {configs.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                            {loadingConfigs ? 'Loading configs...' : 'No config keys found.'}
                          </td>
                        </tr>
                      ) : (
                        configs.map((c) => (
                          <tr key={c.key} style={{ borderBottom: '1px solid #334155' }}>
                            <td style={{ padding: '12px 16px', fontWeight: 600 }}><code style={{ backgroundColor: '#0f172a', padding: '2px 6px', borderRadius: '4px', color: '#c7d2fe' }}>{c.key}</code></td>
                            <td style={{ padding: '12px 16px', maxWidth: '320px' }}>
                              {editingConfigKey === c.key ? (
                                <input
                                  type="text"
                                  autoFocus
                                  style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #4f46e5', borderRadius: '6px', color: '#f8fafc', padding: '6px 10px', fontSize: '13px' }}
                                  value={editingConfigValue}
                                  onChange={(e) => setEditingConfigValue(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateConfig(c.key); if (e.key === 'Escape') setEditingConfigKey(null); }}
                                />
                              ) : (
                                <span style={{ color: '#cbd5e1', wordBreak: 'break-all' }}>{JSON.stringify(c.value)}</span>
                              )}
                            </td>
                            <td style={{ padding: '12px 16px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{c.updatedAt ? displayDate(c.updatedAt) : 'N/A'}</td>
                            <td style={{ padding: '12px 16px' }}>
                              {editingConfigKey === c.key ? (
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <button
                                    onClick={() => handleUpdateConfig(c.key)}
                                    disabled={savingConfig}
                                    style={{ backgroundColor: '#10b981', border: 'none', borderRadius: '6px', color: 'white', padding: '5px 10px', fontSize: '12px', cursor: 'pointer' }}
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setEditingConfigKey(null)}
                                    style={{ backgroundColor: '#334155', border: 'none', borderRadius: '6px', color: '#f8fafc', padding: '5px 10px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <button
                                    onClick={() => { setEditingConfigKey(c.key); setEditingConfigValue(typeof c.value === 'string' ? c.value : JSON.stringify(c.value)); }}
                                    style={{ backgroundColor: '#4f46e51a', border: '1px solid #4f46e533', borderRadius: '6px', color: '#a5b4fc', padding: '5px 10px', fontSize: '12px', cursor: 'pointer' }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleDeleteConfig(c.key)}
                                    style={{ backgroundColor: '#ef44441a', border: '1px solid #ef444433', borderRadius: '6px', color: '#f87171', padding: '5px 10px', fontSize: '12px', cursor: 'pointer' }}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Tab Content: Job Queues */}
          {activeTab === 'queues' && <QueueMonitor />}

          {/* Tab Content: Redis Cache */}
          {activeTab === 'redis' && <RedisInspector />}

          {/* Tab Content: DB Explorer */}
          {activeTab === 'collections' && <CollectionExplorer />}
        </main>
      </div>
    </div>
  );
};

export default SuperAdminPortal;
