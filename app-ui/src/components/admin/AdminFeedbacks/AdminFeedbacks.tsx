import React from 'react';
import { MessageCircle, MessageSquare } from 'lucide-react';
import type { FeedbackData } from '../../../types';
import { DataTable, Th, Td, Tr, MobileCardList, MobileRowCard, EmptyState, ErrorState, SkeletonList, SkeletonTableRows } from '../../ui';
import type { DataStatus } from '../../../hooks/useApiData';
import { ActionButton } from '../../ui/ActionButton';

interface ChatBubbleProps {
  isMe: boolean;
  label: string;
  text: string;
  createdAt: string;
}

const ChatBubble: React.FC<ChatBubbleProps> = ({ isMe, label, text, createdAt }) => (
  <div className={`flex flex-col max-w-[80%] gap-1 ${isMe ? 'self-end items-end' : 'self-start items-start'}`}>
    <div className={`px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
      isMe
        ? 'bg-blue-600 text-white rounded-[12px_12px_0_12px]'
        : 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-600 rounded-[12px_12px_12px_0]'
    }`}>
      <p className="font-semibold text-[11px] mb-1 opacity-70">{label}</p>
      <p className="m-0">{text}</p>
    </div>
    <span className="text-[10px] text-slate-400 px-1">
      {new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </span>
  </div>
);

interface AdminFeedbacksProps {
  feedbacksList: FeedbackData[];
  /** First-load status; an empty list is only "empty" once this is 'success'. */
  status?: DataStatus;
  onRetry?: () => unknown;
  activeFeedbackChat: FeedbackData | null;
  feedbackChatText: string;
  onOpenChat: (f: FeedbackData) => void;
  onCloseChat: () => void;
  onChatTextChange: (text: string) => void;
  onSendChatMessage: (feedbackId: string) => void;
}

const AdminFeedbacks: React.FC<AdminFeedbacksProps> = ({
  feedbacksList,
  status = 'success',
  onRetry,
  activeFeedbackChat,
  feedbackChatText,
  onOpenChat,
  onCloseChat,
  onChatTextChange,
  onSendChatMessage,
}) => (
  <section className="flex flex-col gap-5 p-1 animate-fade-in">

    {/* Page header */}
    <div>
      <h2 className="text-[20px] font-extrabold text-slate-900 dark:text-white tracking-tight">Parent Feedbacks &amp; Complaints</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Review and respond to parent feedback and complaints via discussion chat.</p>
    </div>

    {/* Table card — desktop/tablet */}
    <div className="hidden md:block">
      <DataTable
        card
        header={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-violet-100 dark:bg-violet-950 flex items-center justify-center">
                <MessageSquare size={13} className="text-violet-600 dark:text-violet-400" />
              </div>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Feedback Inbox</span>
            </div>
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">{feedbacksList.length} feedback{feedbacksList.length !== 1 ? 's' : ''}</span>
          </div>
        }
      >
        <thead>
          <tr>
            <Th>Date Received</Th>
            <Th>Student</Th>
            <Th>Admission No</Th>
            <Th>Subject</Th>
            <Th className="text-center">Discussion</Th>
          </tr>
        </thead>
        <tbody>
          {status === 'loading' && feedbacksList.length === 0 ? (
            <SkeletonTableRows rows={5} cols={5} />
          ) : status === 'error' && feedbacksList.length === 0 ? (
            <tr><Td colSpan={5}><ErrorState message="Feedback couldn’t be loaded." onRetry={onRetry} compact /></Td></tr>
          ) : feedbacksList.length === 0 ? (
            <tr><Td colSpan={5}>
              <EmptyState icon={<MessageSquare size={32} />} title="No feedbacks yet" subtitle="Parent feedback will appear here." />
            </Td></tr>
          ) : (
            feedbacksList.map((f) => (
              <Tr key={f._id}>
                <Td className="whitespace-nowrap">
                  {new Date(f.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {new Date(f.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </Td>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                      {(f.studentName || 'S').charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{f.studentName}</span>
                  </div>
                </Td>
                <Td className="font-mono">{f.admissionNo}</Td>
                <Td>{f.subject}</Td>
                <Td className="text-center">
                  <button
                    onClick={() => onOpenChat(f)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-600 hover:border-blue-200 text-xs font-semibold transition-colors"
                  >
                    <MessageCircle size={12} /> Open Chat
                  </button>
                </Td>
              </Tr>
            ))
          )}
        </tbody>
      </DataTable>
    </div>

    {/* Card — mobile */}
    <div className="md:hidden flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-violet-100 dark:bg-violet-950 flex items-center justify-center">
            <MessageSquare size={13} className="text-violet-600 dark:text-violet-400" />
          </div>
          <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Feedback Inbox</span>
        </div>
        <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">{feedbacksList.length} feedback{feedbacksList.length !== 1 ? 's' : ''}</span>
      </div>
      {status === 'loading' && feedbacksList.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg shadow-card dark:bg-slate-800 dark:border-slate-700 overflow-hidden">
          <SkeletonList rows={4} label="Loading feedback…" />
        </div>
      ) : status === 'error' && feedbacksList.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg shadow-card dark:bg-slate-800 dark:border-slate-700">
          <ErrorState message="Feedback couldn’t be loaded." onRetry={onRetry} compact />
        </div>
      ) : feedbacksList.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg shadow-card dark:bg-slate-800 dark:border-slate-700">
          <EmptyState icon={<MessageSquare size={32} />} title="No feedbacks yet" subtitle="Parent feedback will appear here." />
        </div>
      ) : (
        <MobileCardList>
          {feedbacksList.map((f) => (
            <MobileRowCard
              key={f._id}
              title={f.studentName}
              subtitle={`Adm: ${f.admissionNo} · ${new Date(f.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
              fields={[{ label: 'Subject', value: f.subject, fullWidth: true }]}
              actions={
                <button
                  onClick={() => onOpenChat(f)}
                  className="w-full inline-flex items-center justify-center gap-1.5 h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-600 hover:border-blue-200 text-sm font-semibold transition-colors"
                >
                  <MessageCircle size={14} /> Open Chat
                </button>
              }
            />
          ))}
        </MobileCardList>
      )}
    </div>

    {/* Feedback Chat Panel */}
    {activeFeedbackChat && (
      <div className="bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-800 rounded-xl overflow-hidden shadow-sm animate-fade-in">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-700 bg-violet-50 dark:bg-violet-950/30">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300 text-[11px] font-bold flex items-center justify-center">
              {(activeFeedbackChat.studentName || 'S').charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{activeFeedbackChat.subject}</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Ward: {activeFeedbackChat.studentName}</div>
            </div>
          </div>
          <button
            onClick={onCloseChat}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>

        <div className="h-60 overflow-y-auto flex flex-col gap-3 p-4 bg-slate-50 dark:bg-slate-900/50">
          {activeFeedbackChat.messages && activeFeedbackChat.messages.map((msg, i) => (
            <ChatBubble
              key={i}
              isMe={msg.sender === 'admin'}
              label={msg.sender === 'admin' ? 'Admin' : 'Parent'}
              text={msg.text}
              createdAt={msg.createdAt}
            />
          ))}
        </div>

        <div className="flex gap-2 p-3 border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800">
          <input
            type="text"
            placeholder="Type your reply..."
            value={feedbackChatText}
            onChange={(e) => onChatTextChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSendChatMessage(activeFeedbackChat._id); }}
            className="flex-1 h-9 px-3 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white bg-white dark:bg-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 dark:focus:ring-blue-900 transition-all font-[inherit] placeholder:text-slate-300 dark:placeholder:text-slate-500"
          />
          <ActionButton
            onClick={() => onSendChatMessage(activeFeedbackChat._id)}
            className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
          >
            Send
          </ActionButton>
        </div>
      </div>
    )}
  </section>
);

export default AdminFeedbacks;
