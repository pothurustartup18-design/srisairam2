import React, { useState, useEffect, useCallback } from 'react';
import { Layers, RefreshCw, RotateCcw, Trash2, ListChecks } from 'lucide-react';
import { API_BASE } from '../../constants';
import { ActionButton } from '../ui/ActionButton';

interface QueueCounts {
  waiting?: number;
  active?: number;
  completed?: number;
  failed?: number;
  delayed?: number;
}

interface QueueSummary {
  name: string;
  counts: QueueCounts;
}

interface JobEntry {
  id?: string;
  name: string;
  data: any;
  attemptsMade: number;
  failedReason?: string;
  timestamp?: number;
  processedOn?: number;
  finishedOn?: number;
  returnvalue?: any;
}

const STATUSES = ['failed', 'waiting', 'active', 'delayed', 'completed'] as const;
type JobStatus = typeof STATUSES[number];

const authHeaders = (): HeadersInit => {
  const token = localStorage.getItem('schoolhub_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const displayDate = (ts?: number) => {
  if (!ts) return 'N/A';
  const d = new Date(ts);
  return isNaN(d.getTime()) ? 'N/A' : d.toLocaleString();
};

const QueueMonitor: React.FC = () => {
  const [queues, setQueues] = useState<QueueSummary[]>([]);
  const [loadingQueues, setLoadingQueues] = useState(false);

  const [selectedQueue, setSelectedQueue] = useState<string>('backupQueue');
  const [selectedStatus, setSelectedStatus] = useState<JobStatus>('failed');
  const [jobs, setJobs] = useState<JobEntry[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);

  const fetchQueues = useCallback(async () => {
    setLoadingQueues(true);
    try {
      const res = await fetch(`${API_BASE}/settings/queues`, { headers: authHeaders() });
      const data = await res.json();
      if (data.success) setQueues(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      console.error('Failed to fetch queue counts:', err);
    } finally {
      setLoadingQueues(false);
    }
  }, []);

  const fetchJobs = useCallback(async () => {
    setLoadingJobs(true);
    try {
      const res = await fetch(`${API_BASE}/settings/queues/${selectedQueue}/jobs?status=${selectedStatus}&limit=50`, { headers: authHeaders() });
      const data = await res.json();
      if (data.success) setJobs(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    } finally {
      setLoadingJobs(false);
    }
  }, [selectedQueue, selectedStatus]);

  useEffect(() => {
    fetchQueues();
    const interval = setInterval(fetchQueues, 10000);
    return () => clearInterval(interval);
  }, [fetchQueues]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleRetry = async (jobId?: string) => {
    if (!jobId) return;
    setBusyJobId(jobId);
    try {
      const res = await fetch(`${API_BASE}/settings/queues/${selectedQueue}/jobs/${jobId}/retry`, {
        method: 'POST',
        headers: authHeaders()
      });
      const data = await res.json();
      if (data.success) {
        fetchJobs();
        fetchQueues();
      } else {
        alert(data.message || 'Failed to retry job.');
      }
    } catch (err: any) {
      alert(err.message || 'Error retrying job.');
    } finally {
      setBusyJobId(null);
    }
  };

  const handleRemove = async (jobId?: string) => {
    if (!jobId) return;
    if (!confirm(`Permanently remove job ${jobId}? This cannot be undone.`)) return;
    setBusyJobId(jobId);
    try {
      const res = await fetch(`${API_BASE}/settings/queues/${selectedQueue}/jobs/${jobId}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setJobs((prev) => prev.filter((j) => j.id !== jobId));
        fetchQueues();
      } else {
        alert(data.message || 'Failed to remove job.');
      }
    } catch (err: any) {
      alert(err.message || 'Error removing job.');
    } finally {
      setBusyJobId(null);
    }
  };

  const countColor = (status: string) => {
    if (status === 'failed') return '#f87171';
    if (status === 'active') return '#34d399';
    if (status === 'delayed') return '#f59e0b';
    return '#a5b4fc';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '24px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', rowGap: '10px', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Layers className="w-6 h-6 text-indigo-400" />
            <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Background Job Queues (BullMQ)</h4>
          </div>
          <button
            onClick={fetchQueues}
            style={{ backgroundColor: '#334155', border: 'none', borderRadius: '6px', color: '#f8fafc', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}
          >
            <RefreshCw className={`w-4 h-4 ${loadingQueues ? 'animate-spin' : ''}`} />
            <span>Reload</span>
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '16px' }}>
          {queues.length === 0 ? (
            <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>{loadingQueues ? 'Loading queues...' : 'No queues found.'}</p>
          ) : (
            queues.map((q) => (
              <div
                key={q.name}
                onClick={() => setSelectedQueue(q.name)}
                style={{
                  backgroundColor: '#0f172a',
                  border: selectedQueue === q.name ? '1px solid #4f46e5' : '1px solid #334155',
                  borderRadius: '10px',
                  padding: '16px',
                  cursor: 'pointer'
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '10px' }}>{q.name}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {STATUSES.map((s) => (
                    <span key={s} style={{ fontSize: '11px', color: countColor(s), backgroundColor: '#1e293b', padding: '3px 8px', borderRadius: '4px', fontWeight: 600 }}>
                      {s}: {(q.counts as any)[s] ?? 0}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '24px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <ListChecks className="w-6 h-6 text-indigo-400" />
            <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Job Inspector</h4>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <select
              value={selectedQueue}
              onChange={(e) => setSelectedQueue(e.target.value)}
              style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', padding: '6px 10px', fontSize: '13px' }}
            >
              {queues.map((q) => <option key={q.name} value={q.name}>{q.name}</option>)}
              {queues.length === 0 && <option value="backupQueue">backupQueue</option>}
            </select>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as JobStatus)}
              style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', padding: '6px 10px', fontSize: '13px' }}
            >
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button
              onClick={fetchJobs}
              style={{ backgroundColor: '#334155', border: 'none', borderRadius: '6px', color: '#f8fafc', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}
            >
              <RefreshCw className={`w-4 h-4 ${loadingJobs ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto', border: '1px solid #334155', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#0f172a', borderBottom: '1px solid #334155' }}>
                <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Job ID</th>
                <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Name</th>
                <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Attempts</th>
                <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Queued At</th>
                <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Detail</th>
                <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                    {loadingJobs ? 'Loading jobs...' : `No ${selectedStatus} jobs in ${selectedQueue}.`}
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr key={job.id} style={{ borderBottom: '1px solid #334155' }}>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '12px' }}>{job.id}</td>
                    <td style={{ padding: '12px 16px' }}><code style={{ backgroundColor: '#0f172a', padding: '2px 6px', borderRadius: '4px', color: '#c7d2fe' }}>{job.name}</code></td>
                    <td style={{ padding: '12px 16px' }}>{job.attemptsMade}</td>
                    <td style={{ padding: '12px 16px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{displayDate(job.timestamp)}</td>
                    <td style={{ padding: '12px 16px', color: '#f87171', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job.failedReason || ''}>
                      {job.failedReason || '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {selectedStatus === 'failed' && (
                          <button
                            onClick={() => handleRetry(job.id)}
                            disabled={busyJobId === job.id}
                            style={{ backgroundColor: '#10b9811a', border: '1px solid #10b98133', borderRadius: '6px', color: '#34d399', padding: '5px 10px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Retry</span>
                          </button>
                        )}
                        <ActionButton iconOnly
                          onClick={() => handleRemove(job.id)}
                          disabled={busyJobId === job.id}
                          style={{ backgroundColor: '#ef44441a', border: '1px solid #ef444433', borderRadius: '6px', color: '#f87171', padding: '5px 10px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default QueueMonitor;
