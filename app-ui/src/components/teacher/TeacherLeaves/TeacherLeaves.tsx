import React from 'react';
import { MessageSquare } from 'lucide-react';
import type { LeaveData } from '../../../types';
import { Button, PageHeader, Badge, DataTable, Th, Td, Tr, EmptyState, ErrorState, Modal, MobileRowCard, MobileCardList, SkeletonList, SkeletonTableRows } from '../../ui';
import type { DataStatus } from '../../../hooks/useApiData';
import { Form } from '../../ui/Form';

interface TeacherLeavesProps {
  leavesList: LeaveData[];
  status?: DataStatus;
  onRetry?: () => unknown;
  newLeaveDesc: string;
  newLeaveFromDate: string;
  newLeaveToDate: string;
  activeLeaveChat: LeaveData | null;
  leaveChatText: string;
  onDescChange: (desc: string) => void;
  onFromDateChange: (date: string) => void;
  onToDateChange: (date: string) => void;
  onSubmitLeave: (e: React.FormEvent) => void;
  onOpenChat: (leave: LeaveData) => void;
  onCloseChat: () => void;
  onChatTextChange: (text: string) => void;
  onSendChatMessage: (leaveId: string) => void;
}

const statusVariant = (status: string) => status === 'approved' ? 'green' : status === 'rejected' ? 'red' : 'amber';

const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
const formatDateRange = (from: string, to: string) => from === to || formatDate(from) === formatDate(to)
  ? formatDate(from)
  : `${formatDate(from)} – ${formatDate(to)}`;

const TeacherLeaves: React.FC<TeacherLeavesProps> = ({
  leavesList,
  status = 'success',
  onRetry,
  newLeaveDesc,
  newLeaveFromDate,
  newLeaveToDate,
  activeLeaveChat,
  leaveChatText,
  onDescChange,
  onFromDateChange,
  onToDateChange,
  onSubmitLeave,
  onOpenChat,
  onCloseChat,
  onChatTextChange,
  onSendChatMessage,
}) => (
  <div className="flex flex-col gap-5 font-sans text-slate-900">

    <PageHeader title="Leave Applications" subtitle="Apply for leave and track approval status." />

    {/* Apply for Leave Form */}
    <Form onSubmit={onSubmitLeave} className="bg-slate-50 border border-slate-200 rounded-lg p-5">
      <h4 className="text-sm font-bold text-slate-800 mb-2.5">Apply for New Leave</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-slate-600">From Date</label>
          <input
            type="date"
            className="w-full h-11 px-3 border-[1.5px] border-slate-200 rounded-md text-sm text-slate-900 bg-white outline-none focus:border-blue transition-colors font-[inherit]"
            required
            value={newLeaveFromDate}
            onChange={(e) => onFromDateChange(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-slate-600">To Date</label>
          <input
            type="date"
            className="w-full h-11 px-3 border-[1.5px] border-slate-200 rounded-md text-sm text-slate-900 bg-white outline-none focus:border-blue transition-colors font-[inherit]"
            required
            min={newLeaveFromDate || undefined}
            value={newLeaveToDate}
            onChange={(e) => onToDateChange(e.target.value)}
          />
        </div>
      </div>
      <textarea
        className="w-full min-h-[100px] px-3 py-2 border-[1.5px] border-slate-200 rounded-md text-sm text-slate-900 bg-white outline-none focus:border-blue transition-colors font-[inherit] resize-y"
        placeholder="Enter the reason or description for your leave request..."
        required
        value={newLeaveDesc}
        onChange={(e) => onDescChange(e.target.value)}
      />
      <Button type="submit" className="mt-3.5">Submit Leave Request</Button>
    </Form>

    {/* Leave History — desktop/tablet */}
    <div className="hidden md:block">
      <DataTable
        card
        header={<div className="text-md font-bold text-slate-900">Leave History &amp; Approval Status</div>}
      >
        <thead>
          <tr>
            <Th>Application Date</Th>
            <Th>Leave Dates</Th>
            <Th>Reason / Description</Th>
            <Th className="text-center">Approval Status</Th>
            <Th className="text-center">Discussion Chat</Th>
          </tr>
        </thead>
        <tbody>
          {status === 'loading' && leavesList.length === 0 ? (
            <SkeletonTableRows rows={4} cols={5} />
          ) : status === 'error' && leavesList.length === 0 ? (
            <tr><Td colSpan={5}><ErrorState message="Your leave history couldn’t be loaded." onRetry={onRetry} compact /></Td></tr>
          ) : leavesList.length === 0 ? (
            <tr><Td colSpan={5}><EmptyState title="No leave applications submitted yet." /></Td></tr>
          ) : (
            leavesList.map((leave) => (
              <Tr key={leave._id}>
                <Td className="whitespace-nowrap">
                  {new Date(leave.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </Td>
                <Td className="whitespace-nowrap font-semibold">{formatDateRange(leave.fromDate, leave.toDate)}</Td>
                <Td>{leave.description}</Td>
                <Td className="text-center"><Badge variant={statusVariant(leave.status)}>{leave.status.toUpperCase()}</Badge></Td>
                <Td className="text-center">
                  <Button variant="secondary" size="sm" onClick={() => { onOpenChat(leave); onChatTextChange(''); }}>
                    <MessageSquare size={13} /> Chat with Admin
                  </Button>
                </Td>
              </Tr>
            ))
          )}
        </tbody>
      </DataTable>
    </div>

    {/* Leave History — mobile cards */}
    <div className="md:hidden">
      <div className="text-md font-bold text-slate-900 mb-3">Leave History &amp; Approval Status</div>
      {status === 'loading' && leavesList.length === 0 ? (
        <SkeletonList rows={3} avatar={false} label="Loading leave history…" />
      ) : status === 'error' && leavesList.length === 0 ? (
        <ErrorState message="Your leave history couldn’t be loaded." onRetry={onRetry} compact />
      ) : leavesList.length === 0 ? (
        <EmptyState title="No leave applications submitted yet." />
      ) : (
        <MobileCardList>
          {leavesList.map((leave) => (
            <MobileRowCard
              key={leave._id}
              title={new Date(leave.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
              subtitle={new Date(leave.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              badge={<Badge variant={statusVariant(leave.status)}>{leave.status.toUpperCase()}</Badge>}
              fields={[
                { label: 'Leave Dates', value: formatDateRange(leave.fromDate, leave.toDate) },
                { label: 'Reason / Description', value: leave.description, fullWidth: true },
              ]}
              actions={
                <Button variant="secondary" size="sm" onClick={() => { onOpenChat(leave); onChatTextChange(''); }}>
                  <MessageSquare size={13} /> Chat with Admin
                </Button>
              }
            />
          ))}
        </MobileCardList>
      )}
    </div>

    {/* Leave Chat Modal */}
    <Modal
      isOpen={!!activeLeaveChat}
      onClose={onCloseChat}
      title="Leave Discussion"
      subtitle={activeLeaveChat ? `Regarding leave for ${formatDateRange(activeLeaveChat.fromDate, activeLeaveChat.toDate)}` : ''}
      maxWidth="480px"
      footer={
        activeLeaveChat && (
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 h-11 px-3 border-[1.5px] border-slate-200 rounded-md text-sm text-slate-900 bg-white outline-none focus:border-blue transition-colors font-[inherit]"
              placeholder="Type your message here..."
              value={leaveChatText}
              onChange={(e) => onChatTextChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSendChatMessage(activeLeaveChat._id); }}
            />
            <Button onClick={() => onSendChatMessage(activeLeaveChat._id)}>Send</Button>
          </div>
        )
      }
    >
      {activeLeaveChat && (
        <div className="flex flex-col gap-3">
          <div className="self-start bg-slate-100 text-slate-800 px-3.5 py-2.5 rounded-xl rounded-bl-none max-w-[85%] text-sm">
            <strong>Reason for Application:</strong>
            <p className="mt-1 mb-0">{activeLeaveChat.description}</p>
            <span className="block mt-1 text-2xs text-slate-500">Leave dates: {formatDateRange(activeLeaveChat.fromDate, activeLeaveChat.toDate)}</span>
            <span className="block mt-1 text-2xs text-slate-500">{new Date(activeLeaveChat.createdAt).toLocaleTimeString()}</span>
          </div>

          {activeLeaveChat.messages && activeLeaveChat.messages.map((msg, i) => {
            const isMe = msg.sender === 'teacher';
            return (
              <div key={i} className={
                isMe
                  ? 'self-end bg-blue text-white px-3.5 py-2.5 rounded-xl rounded-br-none max-w-[85%] text-sm shadow-sm'
                  : 'self-start bg-white text-slate-800 border border-slate-200 px-3.5 py-2.5 rounded-xl rounded-bl-none max-w-[85%] text-sm shadow-sm'
              }>
                <strong>{msg.senderName}:</strong>
                <p className="mt-1 mb-0">{msg.text}</p>
                <span className={isMe ? 'block mt-1 text-2xs text-blue-100' : 'block mt-1 text-2xs text-slate-500'}>
                  {new Date(msg.createdAt).toLocaleTimeString()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  </div>
);

export default TeacherLeaves;
