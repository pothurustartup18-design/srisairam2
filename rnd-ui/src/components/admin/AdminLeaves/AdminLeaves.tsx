import React from 'react';
import { MessageCircle, CheckCircle, XCircle, Clock } from 'lucide-react';
import type { LeaveData } from '../../../types';
import { DataTable, Th, Td, Tr, MobileCardList, MobileRowCard, EmptyState } from '../../ui';

interface ChatBubbleProps {
  isMe: boolean;
  name: string;
  text: string;
  createdAt: string;
}

const ChatBubble: React.FC<ChatBubbleProps> = ({ isMe, name, text, createdAt }) => (
  <div className={`flex flex-col max-w-[80%] gap-1 ${isMe ? 'self-end items-end' : 'self-start items-start'}`}>
    <div className={`px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
      isMe
        ? 'bg-blue-600 text-white rounded-[12px_12px_0_12px]'
        : 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-600 rounded-[12px_12px_12px_0]'
    }`}>
      <p className="font-semibold text-[11px] mb-1 opacity-70">{name}</p>
      <p className="m-0">{text}</p>
    </div>
    <span className="text-[10px] text-slate-400 px-1">
      {new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </span>
  </div>
);

const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
const formatDateRange = (from: string, to: string) => from === to || formatDate(from) === formatDate(to)
  ? formatDate(from)
  : `${formatDate(from)} – ${formatDate(to)}`;

interface AdminLeavesProps {
  leavesList: LeaveData[];
  activeLeaveChat: LeaveData | null;
  leaveChatText: string;
  onLeaveAction: (leaveId: string, status: 'approved' | 'rejected') => void;
  onOpenChat: (leave: LeaveData) => void;
  onCloseChat: () => void;
  onChatTextChange: (text: string) => void;
  onSendChatMessage: (leaveId: string) => void;
}

const statusConfig = {
  approved: {
    label: 'Approved',
    icon: CheckCircle,
    cls: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-900',
  },
  rejected: {
    label: 'Rejected',
    icon: XCircle,
    cls: 'bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900',
  },
  pending: {
    label: 'Pending',
    icon: Clock,
    cls: 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-100 dark:border-amber-900',
  },
};

const AdminLeaves: React.FC<AdminLeavesProps> = ({
  leavesList,
  activeLeaveChat,
  leaveChatText,
  onLeaveAction,
  onOpenChat,
  onCloseChat,
  onChatTextChange,
  onSendChatMessage,
}) => (
  <section className="flex flex-col gap-5 p-1 animate-fade-in">

    {/* Page header */}
    <div>
      <h2 className="text-[20px] font-extrabold text-slate-900 dark:text-white tracking-tight">Teacher Leave Applications</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Review, approve or reject teacher leave requests and communicate via chat.</p>
    </div>

    {/* Table card — desktop/tablet */}
    <div className="hidden md:block">
      <DataTable
        card
        header={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                <CheckCircle size={13} className="text-blue-600 dark:text-blue-400" />
              </div>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Leave Requests</span>
            </div>
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">{leavesList.length} application{leavesList.length !== 1 ? 's' : ''}</span>
          </div>
        }
      >
        <thead>
          <tr>
            <Th>Date Requested</Th>
            <Th>Leave Dates</Th>
            <Th>Teacher</Th>
            <Th>Reason</Th>
            <Th className="text-center">Status</Th>
            <Th className="text-center">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {leavesList.length === 0 ? (
            <tr><Td colSpan={6}>
              <EmptyState icon={<CheckCircle size={32} />} title="No leave applications" subtitle="All teachers are present!" />
            </Td></tr>
          ) : (
            leavesList.map((leave) => {
              const cfg = statusConfig[leave.status as keyof typeof statusConfig] || statusConfig.pending;
              const StatusIcon = cfg.icon;
              return (
                <Tr key={leave._id}>
                  <Td className="whitespace-nowrap">
                    {new Date(leave.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {new Date(leave.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap font-semibold">{formatDateRange(leave.fromDate, leave.toDate)}</Td>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                        {(leave.teacherName || 'T').charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{leave.teacherName}</span>
                    </div>
                  </Td>
                  <Td className="max-w-xs">
                    <p className="line-clamp-2 m-0">{leave.description}</p>
                  </Td>
                  <Td className="text-center">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${cfg.cls}`}>
                      <StatusIcon size={11} />
                      {cfg.label}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex items-center justify-center gap-2">
                      {leave.status === 'pending' ? (
                        <>
                          <button
                            onClick={() => onLeaveAction(leave._id, 'approved')}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => onLeaveAction(leave._id, 'rejected')}
                            className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 text-xs font-semibold transition-colors"
                          >
                            Reject
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Reviewed</span>
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenChat(leave)}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-600 hover:border-blue-200 transition-colors"
                        title="Open Chat"
                      >
                        <MessageCircle size={13} />
                      </button>
                    </div>
                  </Td>
                </Tr>
              );
            })
          )}
        </tbody>
      </DataTable>
    </div>

    {/* Card — mobile */}
    <div className="md:hidden flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
            <CheckCircle size={13} className="text-blue-600 dark:text-blue-400" />
          </div>
          <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Leave Requests</span>
        </div>
        <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">{leavesList.length} application{leavesList.length !== 1 ? 's' : ''}</span>
      </div>
      {leavesList.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg shadow-card dark:bg-slate-800 dark:border-slate-700">
          <EmptyState icon={<CheckCircle size={32} />} title="No leave applications" subtitle="All teachers are present!" />
        </div>
      ) : (
        <MobileCardList>
          {leavesList.map((leave) => {
            const cfg = statusConfig[leave.status as keyof typeof statusConfig] || statusConfig.pending;
            const StatusIcon = cfg.icon;
            return (
              <MobileRowCard
                key={leave._id}
                title={leave.teacherName}
                subtitle={new Date(leave.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                badge={
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${cfg.cls}`}>
                    <StatusIcon size={11} />
                    {cfg.label}
                  </span>
                }
                fields={[
                  { label: 'Leave Dates', value: formatDateRange(leave.fromDate, leave.toDate) },
                  { label: 'Reason', value: leave.description, fullWidth: true },
                ]}
                actions={
                  <>
                    {leave.status === 'pending' ? (
                      <>
                        <button
                          onClick={() => onLeaveAction(leave._id, 'approved')}
                          className="h-11 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => onLeaveAction(leave._id, 'rejected')}
                          className="h-11 px-4 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 text-sm font-semibold transition-colors"
                        >
                          Reject
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400 italic self-center">Reviewed</span>
                    )}
                    <button
                      type="button"
                      onClick={() => onOpenChat(leave)}
                      className="h-11 w-11 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-600 hover:border-blue-200 transition-colors"
                      title="Open Chat"
                    >
                      <MessageCircle size={15} />
                    </button>
                  </>
                }
              />
            );
          })}
        </MobileCardList>
      )}
    </div>

    {/* Leave Chat Panel */}
    {activeLeaveChat && (
      <div className="bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 rounded-xl overflow-hidden shadow-sm animate-fade-in">
        {/* Chat header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-700 bg-blue-50 dark:bg-blue-950/30">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-[11px] font-bold flex items-center justify-center">
              {(activeLeaveChat.teacherName || 'T').charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100">Chat with {activeLeaveChat.teacherName}</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Leave: {formatDateRange(activeLeaveChat.fromDate, activeLeaveChat.toDate)} · Applied {new Date(activeLeaveChat.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            </div>
          </div>
          <button
            onClick={onCloseChat}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>

        {/* Messages area */}
        <div className="h-60 overflow-y-auto flex flex-col gap-3 p-4 bg-slate-50 dark:bg-slate-900/50">
          {/* Original reason bubble */}
          <div className="self-start max-w-[80%]">
            <div className="px-3.5 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-[12px_12px_12px_0] text-sm">
              <p className="font-semibold text-[11px] mb-1 opacity-60">Reason for Application</p>
              <p className="m-0">{activeLeaveChat.description}</p>
            </div>
            <span className="text-[10px] text-slate-400 px-1 mt-1 block">
              {new Date(activeLeaveChat.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          {activeLeaveChat.messages && activeLeaveChat.messages.map((msg, i) => (
            <ChatBubble
              key={i}
              isMe={msg.sender === 'admin'}
              name={msg.senderName}
              text={msg.text}
              createdAt={msg.createdAt}
            />
          ))}
        </div>

        {/* Input area */}
        <div className="flex gap-2 p-3 border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800">
          <input
            type="text"
            placeholder="Type your message..."
            value={leaveChatText}
            onChange={(e) => onChatTextChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSendChatMessage(activeLeaveChat._id); }}
            className="flex-1 h-9 px-3 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white bg-white dark:bg-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 dark:focus:ring-blue-900 transition-all font-[inherit] placeholder:text-slate-300 dark:placeholder:text-slate-500"
          />
          <button
            onClick={() => onSendChatMessage(activeLeaveChat._id)}
            className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    )}
  </section>
);

export default AdminLeaves;
