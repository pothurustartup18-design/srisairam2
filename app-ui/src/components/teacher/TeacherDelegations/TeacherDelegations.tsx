import React, { useState } from 'react';
import { Search, UserCheck, Trash2, ShieldCheck } from 'lucide-react';
import type { TeacherData } from '../../../types';
import { cn } from '../../../lib/utils';
import { Button, PageHeader, Badge, DataTable, Th, Td, Tr, EmptyState, LoadingSpinner, Modal, filterControlClass, MobileRowCard, MobileCardList } from '../../ui';

interface DelegationRecord {
  _id: string;
  feature: string;
  isActive: boolean;
  fromTeacher?: { _id: string; name: string; assignedClass: string } | null;
  toTeacher?: { _id: string; name: string; assignedClass: string } | null;
}

interface TeacherDelegationsProps {
  teachers: TeacherData[];
  delegations: { sent: DelegationRecord[]; received: DelegationRecord[] };
  onAddDelegation: (toTeacherId: string, feature: string, durationHours: number) => Promise<void>;
  onRevokeDelegation: (id: string) => Promise<void>;
  loading: boolean;
  currentUserTeacherId?: string;
}

const FEATURE_LABELS: Record<string, string> = {
  students: 'My Students',
  attendance: 'Class Attendance',
  marks: 'Marks Entry',
  analytics: 'Exam Analytics',
  homework: 'Homework Board',
  notices: 'School Notices',
  fees: 'Fees Management'
};

export const TeacherDelegations: React.FC<TeacherDelegationsProps> = ({
  teachers,
  delegations,
  onAddDelegation,
  onRevokeDelegation,
  loading,
  currentUserTeacherId
}) => {
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [durationHours, setDurationHours] = useState<number>(24);
  const [submitting, setSubmitting] = useState(false);

  const colleagues = teachers.filter(t => t._id !== currentUserTeacherId);

  const filteredColleagues = colleagues.filter(c => {
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.employeeId && c.employeeId.toLowerCase().includes(q)) ||
      (c.assignedClass && c.assignedClass.toLowerCase().includes(q))
    );
  });

  const handleOpenModal = (feature: string) => {
    setSelectedFeature(feature);
    setSearchQuery('');
    setDurationHours(24);
  };

  const handleCloseModal = () => {
    setSelectedFeature(null);
  };

  const handleTransferClick = async (toTeacherId: string) => {
    if (!selectedFeature) return;
    setSubmitting(true);
    try {
      await onAddDelegation(toTeacherId, selectedFeature, durationHours);
      handleCloseModal();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 font-sans text-slate-900">

      <PageHeader title="Permission Transfer" subtitle="Delegate class management permissions to colleagues." />

      {/* Overview Intro Card */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-card p-5">
        <div className="flex items-center gap-2.5 mb-2.5">
          <ShieldCheck size={20} className="text-blue" />
          <h3 className="text-md font-bold text-slate-900 m-0">Delegated Permission Transfer</h3>
        </div>
        <p className="text-sm text-slate-500 leading-relaxed m-0">
          Transfer view and management permissions of your assigned class dynamically to colleagues.
          When delegated, colleagues can log in and manage your class attendance, marks entry, and notice updates.
          <strong> Note:</strong> Privileged direct messaging and leave tabs are excluded from transfers for security.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left Side: Delegate Feature Hub */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-card p-5">
          <h3 className="text-md font-bold text-slate-900 mb-4">Select Feature to Delegate</h3>
          <div className="flex flex-col gap-2.5">
            {Object.keys(FEATURE_LABELS).map(key => {
              const label = FEATURE_LABELS[key];
              const activeCount = delegations.sent.filter(d => d.feature === key && d.isActive).length;
              return (
                <div key={key} className="flex flex-wrap gap-2 justify-between items-center px-4 py-3.5 border border-slate-200 rounded-md bg-slate-50">
                  <div className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-800">{label}</span>
                    {activeCount > 0 ? (
                      <span className="text-xs font-semibold text-green-800">Active Transfer ({activeCount})</span>
                    ) : (
                      <span className="text-xs text-slate-400">Inactive / No Transfers</span>
                    )}
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => handleOpenModal(key)}>
                    <UserCheck size={13} /> Transfer
                  </Button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Active Transfers Listing */}
        <div>
          <div className="hidden md:block">
            <DataTable
              card
              header={<div className="text-md font-bold text-slate-900">Active Permission Transfers (Sent)</div>}
            >
              <thead>
                <tr>
                  <Th>Feature Tab</Th>
                  <Th>Delegated Colleague</Th>
                  <Th className="text-center">Revoke</Th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><Td colSpan={3}><LoadingSpinner fullPage /></Td></tr>
                ) : delegations.sent.length === 0 ? (
                  <tr><Td colSpan={3}><EmptyState title="No active permission transfers created." /></Td></tr>
                ) : (
                  delegations.sent.map((d) => (
                    <Tr key={d._id}>
                      <Td><strong className="text-slate-800">{FEATURE_LABELS[d.feature] || d.feature}</strong></Td>
                      <Td>
                        <div className="text-sm font-semibold text-slate-800">{d.toTeacher?.name || 'Unknown Colleague'}</div>
                        <div className="text-xs text-slate-400">Assigned Class: {d.toTeacher?.assignedClass || 'N/A'}</div>
                      </Td>
                      <Td className="text-center">
                        <button
                          type="button"
                          className="w-11 h-11 flex items-center justify-center rounded-md border border-red-200 text-red hover:bg-red-lt transition-colors"
                          title="Revoke Transfer"
                          onClick={() => onRevokeDelegation(d._id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </Td>
                    </Tr>
                  ))
                )}
              </tbody>
            </DataTable>
          </div>

          <div className="md:hidden">
            <div className="text-md font-bold text-slate-900 mb-3">Active Permission Transfers (Sent)</div>
            {loading ? (
              <LoadingSpinner fullPage />
            ) : delegations.sent.length === 0 ? (
              <EmptyState title="No active permission transfers created." />
            ) : (
              <MobileCardList>
                {delegations.sent.map((d) => (
                  <MobileRowCard
                    key={d._id}
                    title={FEATURE_LABELS[d.feature] || d.feature}
                    subtitle={`${d.toTeacher?.name || 'Unknown Colleague'} · Class ${d.toTeacher?.assignedClass || 'N/A'}`}
                    actions={
                      <button
                        type="button"
                        className="w-11 h-11 flex items-center justify-center rounded-md border border-red-200 text-red hover:bg-red-lt transition-colors"
                        title="Revoke Transfer"
                        onClick={() => onRevokeDelegation(d._id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    }
                  />
                ))}
              </MobileCardList>
            )}
          </div>
        </div>
      </div>

      {/* Assigned Permission Transfers (Received) — desktop/tablet */}
      <div className="hidden md:block">
        <DataTable
          card
          header={<div className="text-md font-bold text-slate-900">Assigned Permission Transfers (Received)</div>}
        >
          <thead>
            <tr>
              <Th>Feature Tab</Th>
              <Th>Delegated From (Colleague)</Th>
              <Th className="text-center">Status</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><Td colSpan={3}><LoadingSpinner fullPage /></Td></tr>
            ) : delegations.received.length === 0 ? (
              <tr><Td colSpan={3}><EmptyState title="No assigned permission transfers from colleagues." /></Td></tr>
            ) : (
              delegations.received.map((d) => (
                <Tr key={d._id}>
                  <Td><strong className="text-slate-800">{FEATURE_LABELS[d.feature] || d.feature}</strong></Td>
                  <Td>
                    <div className="text-sm font-semibold text-slate-800">{d.fromTeacher?.name || 'Unknown Colleague'}</div>
                    <div className="text-xs text-slate-400">Assigned Class: {d.fromTeacher?.assignedClass || 'N/A'}</div>
                  </Td>
                  <Td className="text-center"><Badge variant="green" size="sm">Active</Badge></Td>
                </Tr>
              ))
            )}
          </tbody>
        </DataTable>
      </div>

      {/* Assigned Permission Transfers (Received) — mobile cards */}
      <div className="md:hidden">
        <div className="text-md font-bold text-slate-900 mb-3">Assigned Permission Transfers (Received)</div>
        {loading ? (
          <LoadingSpinner fullPage />
        ) : delegations.received.length === 0 ? (
          <EmptyState title="No assigned permission transfers from colleagues." />
        ) : (
          <MobileCardList>
            {delegations.received.map((d) => (
              <MobileRowCard
                key={d._id}
                title={FEATURE_LABELS[d.feature] || d.feature}
                subtitle={`${d.fromTeacher?.name || 'Unknown Colleague'} · Class ${d.fromTeacher?.assignedClass || 'N/A'}`}
                badge={<Badge variant="green" size="sm">Active</Badge>}
              />
            ))}
          </MobileCardList>
        )}
      </div>

      {/* Delegation Popup Modal */}
      <Modal
        isOpen={!!selectedFeature}
        onClose={handleCloseModal}
        title={selectedFeature ? `Transfer: ${FEATURE_LABELS[selectedFeature]}` : ''}
        subtitle="Select a colleague to grant access to this tab."
        maxWidth="500px"
      >
        {/* Duration Selector */}
        <div className="mb-4">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5 block">Transfer Duration</label>
          <div className="flex gap-4 mt-1.5">
            {([24, 48, 72] as const).map(hrs => (
              <label key={hrs} className="inline-flex items-center gap-1.5 text-sm font-semibold cursor-pointer text-slate-700">
                <input
                  type="radio"
                  name="delegationDuration"
                  checked={durationHours === hrs}
                  onChange={() => setDurationHours(hrs)}
                />
                {hrs} Hours
              </label>
            ))}
          </div>
        </div>

        {/* Colleague Search */}
        <div className="relative flex items-center mb-4">
          <Search size={14} className="absolute left-3 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search colleague name or class..."
            className={cn(filterControlClass, 'pl-8')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Colleagues List */}
        <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
          {filteredColleagues.length === 0 ? (
            <div className="text-center py-4 text-slate-400 text-sm">No colleagues found.</div>
          ) : (
            filteredColleagues.map((c) => (
              <div key={c._id} className="flex flex-wrap gap-2 justify-between items-center px-3 py-2.5 border border-slate-100 rounded-md bg-slate-50">
                <div className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-800 truncate">{c.name}</span>
                  <span className="text-xs text-slate-400">Class: {c.assignedClass} | ID: {c.employeeId || 'N/A'}</span>
                </div>
                <Button size="sm" disabled={submitting} onClick={() => handleTransferClick(c._id)}>
                  {submitting ? 'Transferring...' : 'Transfer'}
                </Button>
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
};
