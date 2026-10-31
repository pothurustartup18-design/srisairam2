import React, { useState, useEffect } from 'react';
import { Trash2, Plus, X } from 'lucide-react';
import { Modal, Button } from '../../ui';
import {
  fetchPermissionTemplates, createPermissionTemplate, deletePermissionTemplate,
  type PermissionTemplateDTO,
} from '../../../services/permissionsApi';
import { Form } from '../../ui/Form';
import { ActionButton } from '../../ui/ActionButton';

interface PermissionTemplateManagerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with a template's permission list when the admin picks "Apply" — does not save anything itself. */
  onApply?: (permissions: string[]) => void;
  /** The picker's current selection, offered as "Save current selection as a new template". */
  currentSelection?: string[];
  showToast: (message: string, type?: 'success' | 'error') => void;
}

export default function PermissionTemplateManager({ isOpen, onClose, onApply, currentSelection, showToast }: PermissionTemplateManagerProps) {
  const [templates, setTemplates] = useState<PermissionTemplateDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftDesc, setDraftDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setTemplates(await fetchPermissionTemplates());
    } catch (err: any) {
      showToast(err.message || 'Failed to load templates.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isOpen) load(); }, [isOpen]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftName.trim()) { showToast('Template name is required.', 'error'); return; }
    if (!currentSelection || currentSelection.length === 0) { showToast('Select at least one permission first.', 'error'); return; }
    setSaving(true);
    try {
      await createPermissionTemplate(draftName.trim(), draftDesc.trim(), currentSelection);
      showToast('Template saved.', 'success');
      setDraftName(''); setDraftDesc(''); setShowCreate(false);
      load();
    } catch (err: any) {
      showToast(err.message || 'Failed to save template.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete template "${name}"?`)) return;
    try {
      await deletePermissionTemplate(id);
      showToast('Template deleted.', 'success');
      load();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete template.', 'error');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Permission Templates" subtitle="Reusable permission sets — apply one to speed up assigning a new employee." maxWidth="520px">
      <div className="flex flex-col gap-4">
        {!showCreate ? (
          <Button type="button" size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> Save current selection as template
          </Button>
        ) : (
          <Form onSubmit={handleCreate} className="flex flex-col gap-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
            <input
              type="text" placeholder="Template name (e.g. Fee Operator)" value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="h-9 px-3 border border-slate-200 rounded-md text-sm bg-white outline-none focus:border-blue-400"
              autoFocus
            />
            <input
              type="text" placeholder="Description (optional)" value={draftDesc}
              onChange={(e) => setDraftDesc(e.target.value)}
              className="h-9 px-3 border border-slate-200 rounded-md text-sm bg-white outline-none focus:border-blue-400"
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={saving}>Save Template</Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setShowCreate(false)}><X size={13} /> Cancel</Button>
            </div>
          </Form>
        )}

        <div className="flex flex-col gap-2 max-h-[320px] overflow-y-auto">
          {loading ? (
            <div className="text-center text-sm text-slate-400 py-6">Loading…</div>
          ) : templates.length === 0 ? (
            <div className="text-center text-sm text-slate-400 py-6">No templates saved yet.</div>
          ) : (
            templates.map((t) => (
              <div key={t._id} className="flex items-center justify-between gap-3 border border-slate-200 rounded-lg px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-800">{t.name}</div>
                  {t.description && <div className="text-xs text-slate-500">{t.description}</div>}
                  <div className="text-[11px] text-slate-400 mt-0.5">{t.permissions.length} permission(s)</div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {onApply && (
                    <Button type="button" size="sm" onClick={() => { onApply(t.permissions); onClose(); }}>Apply</Button>
                  )}
                  <ActionButton iconOnly type="button" className="text-red hover:bg-red-lt rounded p-1.5 transition-colors" onClick={() => handleDelete(t._id, t.name)} title="Delete template">
                    <Trash2 size={13} />
                  </ActionButton>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
