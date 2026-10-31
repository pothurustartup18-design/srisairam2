import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Search, Check, Plus, Minus } from 'lucide-react';
import { Button, Badge } from '../../ui';
import type { PermissionCatalogEntry } from '../../../services/permissionsApi';

interface PermissionPickerProps {
  catalog: PermissionCatalogEntry[];
  roleDefaults: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

// Pure controlled component: groups the catalog by module, lets the admin tick/untick
// individual permissions, and visually distinguishes "inherited from role" vs.
// "explicitly added" vs. "explicitly removed" — since the underlying model is now
// additive/subtractive on top of role defaults rather than a flat replace array.
export default function PermissionPicker({ catalog, roleDefaults, selected, onChange }: PermissionPickerProps) {
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = catalog.filter((c) => c.active && (
      !q || c.key.toLowerCase().includes(q) || c.displayName.toLowerCase().includes(q) || c.module.toLowerCase().includes(q)
    ));
    const groups: Record<string, PermissionCatalogEntry[]> = {};
    for (const entry of filtered) {
      (groups[entry.module] ||= []).push(entry);
    }
    return groups;
  }, [catalog, search]);

  const isChecked = (key: string) => selected.includes(key);
  const isInherited = (key: string) => roleDefaults.includes(key);

  const toggle = (key: string) => {
    onChange(isChecked(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  };

  const selectAllInModule = (module: string) => {
    const keys = (grouped[module] || []).map((e) => e.key);
    onChange(Array.from(new Set([...selected, ...keys])));
  };

  const clearModule = (module: string) => {
    const keys = new Set((grouped[module] || []).map((e) => e.key));
    onChange(selected.filter((k) => !keys.has(k)));
  };

  const expandAll = () => setCollapsed({});
  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    Object.keys(grouped).forEach((m) => { next[m] = true; });
    setCollapsed(next);
  };

  const StatusBadge = ({ keyName }: { keyName: string }) => {
    const checked = isChecked(keyName);
    const inherited = isInherited(keyName);
    if (checked && inherited) return <Badge variant="blue" size="sm">Role default</Badge>;
    if (checked && !inherited) return <Badge variant="green" size="sm"><Plus size={9} /> Added</Badge>;
    if (!checked && inherited) return <Badge variant="red" size="sm"><Minus size={9} /> Removed</Badge>;
    return null;
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search permissions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-8 pr-3 border border-slate-200 rounded-md text-xs text-slate-900 bg-white outline-none focus:border-blue-400"
          />
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={expandAll}>Expand All</Button>
        <Button type="button" variant="secondary" size="sm" onClick={collapseAll}>Collapse All</Button>
      </div>

      <div className="border border-slate-200 rounded-lg max-h-[420px] overflow-y-auto divide-y divide-slate-100">
        {Object.keys(grouped).length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-400">No permissions match your search.</div>
        ) : (
          Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([module, entries]) => {
            const isCollapsed = !!collapsed[module];
            return (
              <div key={module}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setCollapsed((prev) => ({ ...prev, [module]: !prev[module] }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setCollapsed((prev) => ({ ...prev, [module]: !prev[module] }));
                    }
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors text-left cursor-pointer"
                >
                  <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wide">
                    {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                    {titleCase(module)}
                    <span className="text-slate-400 font-normal normal-case">({entries.filter((e) => isChecked(e.key)).length}/{entries.length})</span>
                  </span>
                  <span className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="text-[11px] font-bold text-blue-600 hover:text-blue-800" onClick={() => selectAllInModule(module)}>Select All</button>
                    <button type="button" className="text-[11px] font-bold text-red-500 hover:text-red-700" onClick={() => clearModule(module)}>Clear</button>
                  </span>
                </div>
                {!isCollapsed && (
                  <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {entries.map((entry) => (
                      <label key={entry.key} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer py-1">
                        <input
                          type="checkbox"
                          className="w-3.5 h-3.5 accent-blue-600 flex-shrink-0"
                          checked={isChecked(entry.key)}
                          onChange={() => toggle(entry.key)}
                        />
                        <span className="flex-1">{entry.displayName}</span>
                        <StatusBadge keyName={entry.key} />
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
        <Check size={12} className="text-blue-500" /> {selected.length} permission{selected.length !== 1 ? 's' : ''} selected
      </div>
    </div>
  );
}
