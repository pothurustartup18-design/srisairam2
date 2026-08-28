import React, { useState, useEffect, useCallback } from 'react';
import { Table2, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { API_BASE } from '../../constants';

interface CollectionSummary {
  name: string;
  count: number;
}

const authHeaders = (): HeadersInit => {
  const token = localStorage.getItem('schoolhub_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const PAGE_SIZE = 10;

const CollectionExplorer: React.FC = () => {
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(false);

  const [selected, setSelected] = useState<string | null>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingDocs, setLoadingDocs] = useState(false);

  const fetchCollections = useCallback(async () => {
    setLoadingCollections(true);
    try {
      const res = await fetch(`${API_BASE}/settings/collections`, { headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        const list: CollectionSummary[] = Array.isArray(data.data) ? data.data : [];
        setCollections(list);
        if (!selected && list.length > 0) setSelected(list[0].name);
      }
    } catch (err) {
      console.error('Failed to fetch collections:', err);
    } finally {
      setLoadingCollections(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchDocs = useCallback(async (name: string, pageNum: number) => {
    setLoadingDocs(true);
    try {
      const res = await fetch(`${API_BASE}/settings/collections/${encodeURIComponent(name)}?page=${pageNum}&limit=${PAGE_SIZE}`, { headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        setDocs(Array.isArray(data.data) ? data.data : []);
        setTotal(Number(data.total) || 0);
      }
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  useEffect(() => {
    if (selected) {
      setPage(1);
      fetchDocs(selected, 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const goToPage = (p: number) => {
    if (!selected || p < 1) return;
    setPage(p);
    fetchDocs(selected, p);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
      <div style={{ width: '260px', flexShrink: 0, backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', maxHeight: '640px' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Collections</h4>
          <button
            onClick={fetchCollections}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex' }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingCollections ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {collections.length === 0 ? (
            <p style={{ margin: 0, padding: '16px', color: '#64748b', fontSize: '12px' }}>
              {loadingCollections ? 'Loading...' : 'No collections found.'}
            </p>
          ) : (
            collections.map((c) => (
              <button
                key={c.name}
                onClick={() => setSelected(c.name)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
                  padding: '10px 16px', border: 'none', borderBottom: '1px solid #334155',
                  backgroundColor: selected === c.name ? '#312e81' : 'transparent',
                  color: selected === c.name ? '#f8fafc' : '#94a3b8', cursor: 'pointer', textAlign: 'left', fontSize: '13px'
                }}
              >
                <span>{c.name}</span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>{c.count}</span>
              </button>
            ))
          )}
        </div>
      </div>

      <div style={{ flex: 1, backgroundColor: '#1e293b', borderRadius: '12px', padding: '24px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Table2 className="w-6 h-6 text-indigo-400" />
            <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>{selected || 'Select a collection'}</h4>
          </div>
          <span style={{ fontSize: '12px', color: '#64748b' }}>Read-only view · sensitive fields redacted</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '520px', overflowY: 'auto' }}>
          {docs.length === 0 ? (
            <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>
              {loadingDocs ? 'Loading documents...' : 'No documents found.'}
            </p>
          ) : (
            docs.map((doc, i) => (
              <pre
                key={doc._id || i}
                style={{
                  margin: 0, backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px',
                  padding: '12px 16px', fontSize: '12px', color: '#cbd5e1', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word'
                }}
              >
                {JSON.stringify(doc, null, 2)}
              </pre>
            ))
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: '#94a3b8', borderTop: '1px solid #334155', paddingTop: '12px' }}>
          <span>{total === 0 ? 'No results' : `Page ${page} of ${totalPages} · ${total} document(s)`}</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1 || loadingDocs}
              style={{ backgroundColor: '#334155', border: 'none', borderRadius: '6px', color: '#f8fafc', padding: '6px 10px', cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.5 : 1, display: 'flex', alignItems: 'center' }}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages || loadingDocs}
              style={{ backgroundColor: '#334155', border: 'none', borderRadius: '6px', color: '#f8fafc', padding: '6px 10px', cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? 0.5 : 1, display: 'flex', alignItems: 'center' }}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CollectionExplorer;
