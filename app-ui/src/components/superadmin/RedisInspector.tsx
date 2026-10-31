import React, { useState, useEffect, useCallback } from 'react';
import { Cpu, RefreshCw, Search, AlertTriangle } from 'lucide-react';
import { API_BASE } from '../../constants';

interface RedisInfo {
  status: string;
  connected: boolean;
  totalKeys?: number;
  usedMemoryHuman?: string;
  connectedClients?: string;
  uptimeInSeconds?: number;
  redisVersion?: string;
}

interface RedisKeyEntry {
  key: string;
  ttl: number;
  type: string;
  preview?: string;
}

const authHeaders = (): HeadersInit => {
  const token = localStorage.getItem('schoolhub_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const formatTTL = (ttl: number): string => {
  if (ttl === -1) return 'no expiry';
  if (ttl === -2) return 'expired';
  if (ttl < 60) return `${ttl}s`;
  if (ttl < 3600) return `${Math.floor(ttl / 60)}m`;
  return `${Math.floor(ttl / 3600)}h ${Math.floor((ttl % 3600) / 60)}m`;
};

const RedisInspector: React.FC = () => {
  const [info, setInfo] = useState<RedisInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);

  const [pattern, setPattern] = useState('cache:*');
  const [keys, setKeys] = useState<RedisKeyEntry[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [truncated, setTruncated] = useState(false);

  const [flushPattern, setFlushPattern] = useState('');
  const [confirmFlushInput, setConfirmFlushInput] = useState('');
  const [flushing, setFlushing] = useState(false);

  const fetchInfo = useCallback(async () => {
    setLoadingInfo(true);
    try {
      const res = await fetch(`${API_BASE}/settings/redis/info`, { headers: authHeaders() });
      const data = await res.json();
      if (data.success) setInfo(data.data);
    } catch (err) {
      console.error('Failed to fetch Redis info:', err);
    } finally {
      setLoadingInfo(false);
    }
  }, []);

  const fetchKeys = async () => {
    setLoadingKeys(true);
    try {
      const res = await fetch(`${API_BASE}/settings/redis/keys?pattern=${encodeURIComponent(pattern || '*')}&limit=100`, { headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        setKeys(Array.isArray(data.data) ? data.data : []);
        setTruncated(!!data.truncated);
      }
    } catch (err) {
      console.error('Failed to fetch Redis keys:', err);
    } finally {
      setLoadingKeys(false);
    }
  };

  useEffect(() => {
    fetchInfo();
    const interval = setInterval(fetchInfo, 15000);
    return () => clearInterval(interval);
  }, [fetchInfo]);

  useEffect(() => {
    fetchKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFlush = async () => {
    if (!flushPattern.trim()) {
      alert('Enter a key pattern to flush (e.g. cache:*).');
      return;
    }
    if (confirmFlushInput !== 'DELETE') {
      alert('Confirmation code mismatch. Please type "DELETE" to confirm.');
      return;
    }
    setFlushing(true);
    try {
      const res = await fetch(`${API_BASE}/settings/redis/keys`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ pattern: flushPattern.trim() })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'Keys deleted.');
        setConfirmFlushInput('');
        fetchInfo();
        fetchKeys();
      } else {
        alert(data.message || 'Failed to delete keys.');
      }
    } catch (err: any) {
      alert(err.message || 'Error deleting keys.');
    } finally {
      setFlushing(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '24px' }}>
        <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '24px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', rowGap: '10px', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Cpu className="w-6 h-6 text-indigo-400" />
              <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Redis Server</h4>
            </div>
            <button
              onClick={fetchInfo}
              style={{ backgroundColor: '#334155', border: 'none', borderRadius: '6px', color: '#f8fafc', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}
            >
              <RefreshCw className={`w-4 h-4 ${loadingInfo ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {!info ? (
            <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>Loading...</p>
          ) : !info.connected ? (
            <p style={{ margin: 0, color: '#f87171', fontSize: '13px' }}>Redis is not connected (status: {info.status}).</p>
          ) : (
            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
              <tbody>
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <td style={{ padding: '6px 0', color: '#94a3b8' }}>Total Keys:</td>
                  <td style={{ padding: '6px 0', fontWeight: 600, textAlign: 'right' }}>{info.totalKeys}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <td style={{ padding: '6px 0', color: '#94a3b8' }}>Memory Used:</td>
                  <td style={{ padding: '6px 0', fontWeight: 600, textAlign: 'right' }}>{info.usedMemoryHuman}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <td style={{ padding: '6px 0', color: '#94a3b8' }}>Connected Clients:</td>
                  <td style={{ padding: '6px 0', fontWeight: 600, textAlign: 'right' }}>{info.connectedClients}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <td style={{ padding: '6px 0', color: '#94a3b8' }}>Version:</td>
                  <td style={{ padding: '6px 0', fontWeight: 600, textAlign: 'right' }}>{info.redisVersion}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>

        <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '24px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AlertTriangle className="w-6 h-6 text-red-400" />
            <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Flush Keys By Pattern</h4>
          </div>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '12px', lineHeight: '1.5' }}>
            Deletes every key matching the pattern (glob-style, e.g. <code>cache:*</code> to clear cached API responses, <code>rl:*</code> to reset rate limits, <code>session:refresh:&#123;userId&#125;:*</code> to force-logout one user).
          </p>
          <input
            type="text"
            placeholder="e.g. cache:*"
            style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', padding: '8px 12px', fontSize: '13px' }}
            value={flushPattern}
            onChange={(e) => setFlushPattern(e.target.value)}
          />
          <label style={{ fontSize: '11px', color: '#94a3b8' }}>Type "DELETE" below to enable:</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="Type DELETE"
              style={{ flex: 1, backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', padding: '6px 10px', fontSize: '13px' }}
              value={confirmFlushInput}
              onChange={(e) => setConfirmFlushInput(e.target.value)}
            />
            <button
              onClick={handleFlush}
              disabled={flushing || confirmFlushInput !== 'DELETE'}
              style={{
                backgroundColor: confirmFlushInput === 'DELETE' ? '#ef4444' : '#475569',
                border: 'none', borderRadius: '6px', color: 'white', padding: '6px 14px', fontSize: '12px', fontWeight: 600,
                cursor: (flushing || confirmFlushInput !== 'DELETE') ? 'not-allowed' : 'pointer'
              }}
            >
              {flushing ? 'Flushing...' : 'Flush'}
            </button>
          </div>
        </div>
      </div>

      <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '24px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Key Browser</h4>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="Pattern, e.g. cache:*"
              style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', padding: '6px 12px', fontSize: '13px', width: 'min(220px, 100%)' }}
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') fetchKeys(); }}
            />
            <button
              onClick={fetchKeys}
              style={{ backgroundColor: '#4f46e5', border: 'none', borderRadius: '6px', color: 'white', padding: '6px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Search className="w-4 h-4" />
              <span>{loadingKeys ? 'Searching...' : 'Search'}</span>
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto', border: '1px solid #334155', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#0f172a', borderBottom: '1px solid #334155' }}>
                <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Key</th>
                <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Type</th>
                <th style={{ padding: '12px 16px', color: '#94a3b8' }}>TTL</th>
                <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Value Preview</th>
              </tr>
            </thead>
            <tbody>
              {keys.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                    {loadingKeys ? 'Loading keys...' : 'No keys found for this pattern.'}
                  </td>
                </tr>
              ) : (
                keys.map((k) => (
                  <tr key={k.key} style={{ borderBottom: '1px solid #334155' }}>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '12px', color: '#c7d2fe' }}>{k.key}</td>
                    <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{k.type}</td>
                    <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{formatTTL(k.ttl)}</td>
                    <td style={{ padding: '12px 16px', color: '#cbd5e1', maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={k.preview}>
                      {k.preview || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {truncated && (
          <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>Results truncated to the first 100 matches — narrow the pattern to see more precisely.</p>
        )}
      </div>
    </div>
  );
};

export default RedisInspector;
