import React, { useState } from 'react';
import { MessageSquare, ChevronDown, ChevronUp, Send, MessagesSquare, Sparkles, User, Shield } from 'lucide-react';
import type { FeedbackData, StudentData } from '../../../types';
import { API_BASE } from '../../../constants';
import { cn } from '../../../lib/utils';
import { Button, EmptyState } from '../../ui';

interface ParentFeedbackProps {
  ward: StudentData | undefined;
  feedbackList: FeedbackData[];
  loadFeedbacks: () => void;
  onShowToast: (message: string, type?: 'success' | 'error') => void;
}

const inputCls =
  'h-10 px-3.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 bg-slate-50/50 outline-none focus:border-blue-600 focus:bg-white transition-all font-[inherit] w-full';
const labelCls = 'text-[10px] font-bold uppercase tracking-wider text-slate-400';

const ParentFeedback: React.FC<ParentFeedbackProps> = ({ ward, feedbackList, loadFeedbacks, onShowToast }) => {
  const [feedbackSubject, setFeedbackSubject] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [activeFeedback, setActiveFeedback] = useState<FeedbackData | null>(null);
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ward || !feedbackSubject.trim() || !feedbackMessage.trim()) {
      onShowToast('Please fill in both subject and message.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/feedbacks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: ward.id || ward._id,
          studentName: ward.name,
          admissionNo: ward.admissionNo,
          subject: feedbackSubject.trim(),
          message: feedbackMessage.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        onShowToast('Feedback submitted successfully.');
        setFeedbackSubject('');
        setFeedbackMessage('');
        loadFeedbacks();
      } else {
        onShowToast(data.message || 'Failed to submit feedback.', 'error');
      }
    } catch (err: any) {
      onShowToast(err.message || 'Failed to submit feedback.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async (feedbackId: string) => {
    if (!replyText.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/feedbacks/${feedbackId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: 'parent', text: replyText.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setReplyText('');
        setActiveFeedback(data.data);
        loadFeedbacks();
      }
    } catch (err) {
      console.error('Failed to send feedback reply:', err);
    }
  };

  return (
    <div className="flex flex-col gap-5 font-sans text-slate-900">
      {/* ─── PAGE HEADER (Matches Admin Style) ─── */}
      <div className="flex items-start justify-between gap-4 flex-wrap bg-white border border-slate-200 rounded-xl px-6 py-5 shadow-card">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 m-0">Feedback &amp; Grievances</h2>
          <p className="text-sm text-slate-500 mt-1">
            Submit inquiries, transport issues, academic feedback, or concerns directly to the school administration.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded-lg px-3 py-1.5">
            <MessagesSquare size={14} /> {feedbackList.length} Active Thread{feedbackList.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* ─── 2-COLUMN BALANCED LAYOUT ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-5">
        {/* ─── LEFT: Submit Form Card ─── */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-card overflow-hidden h-fit">
          <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
            <MessageSquare size={15} className="text-blue-600" />
            <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Ask a Question to School Office
            </span>
          </div>

          <form onSubmit={handleSubmitFeedback} className="p-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>What is your question about?</label>
                <input
                  type="text"
                  className={inputCls}
                  placeholder="e.g. Bus transport route, Homework, Fee receipt, Leave..."
                required
                value={feedbackSubject}
                onChange={(e) => setFeedbackSubject(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Your Message</label>
                <textarea
                  className="min-h-[110px] px-3.5 py-2.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 bg-slate-50/50 outline-none focus:border-blue-600 focus:bg-white transition-all font-[inherit] resize-y"
                  placeholder="Write your question or request clearly so school administration can reply..."
                required
                value={feedbackMessage}
                onChange={(e) => setFeedbackMessage(e.target.value)}
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center justify-center gap-1.5 h-9 px-4 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors cursor-pointer disabled:opacity-50 shadow-xs w-full"
              >
                {submitting ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />{' '}
                    Submitting…
                  </>
                ) : (
                  <>
                    <Send size={13} /> Submit To School
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* ─── RIGHT: Feedback Threads History ─── */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between pb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              My Questions & School Replies ({feedbackList.length})
            </span>
          </div>

          {feedbackList.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-card">
              <EmptyState
                icon={<MessagesSquare size={36} />}
                title="No feedback submitted yet."
                subtitle="Your submitted feedback inquiries and responses from school administration will appear here."
              />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {feedbackList.map((fb) => {
                const isActive = activeFeedback?._id === fb._id;
                const lastMsg = fb.messages && fb.messages[fb.messages.length - 1];
                const msgCount = fb.messages?.length || 0;

                return (
                  <div
                    key={fb._id}
                    className="bg-white border border-slate-200 rounded-xl shadow-card overflow-hidden transition-all"
                  >
                    {/* Thread Header */}
                    <div
                      className="flex items-center gap-3 p-4 cursor-pointer hover:bg-slate-50/80 transition-colors select-none"
                      onClick={() => {
                        setActiveFeedback(isActive ? null : fb);
                        setReplyText('');
                      }}
                    >
                      <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0 text-blue-600">
                        <MessagesSquare size={16} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">{fb.subject}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                          <span>
                            {new Date(fb.createdAt).toLocaleDateString('en-IN', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                          <span>·</span>
                          <span className="font-semibold text-slate-600">
                            {msgCount} message{msgCount !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>

                      <div className="flex-shrink-0 text-slate-400">
                        {isActive ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </div>

                    {/* Thread Conversation */}
                    {isActive && (
                      <div className="border-t border-slate-100 bg-slate-50/40">
                        <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto p-4">
                          {fb.messages.map((msg, i) => {
                            const isParent = msg.sender === 'parent';
                            return (
                              <div
                                key={i}
                                className={cn('flex items-start gap-2', isParent ? 'justify-end' : 'justify-start')}
                              >
                                {!isParent && (
                                  <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
                                    <Shield size={12} />
                                  </div>
                                )}
                                <div
                                  className={cn(
                                    'px-3.5 py-2.5 text-xs max-w-[85%] rounded-2xl leading-relaxed shadow-2xs',
                                    isParent
                                      ? 'bg-blue-600 text-white rounded-br-xs'
                                      : 'bg-white text-slate-800 border border-slate-200/80 rounded-bl-xs'
                                  )}
                                >
                                  <div
                                    className={cn(
                                      'text-[10px] font-bold mb-1',
                                      isParent ? 'text-blue-100' : 'text-slate-400'
                                    )}
                                  >
                                    {isParent ? 'You' : 'School Administration'}
                                  </div>
                                  <p className="m-0 whitespace-pre-wrap">{msg.text}</p>
                                  <span
                                    className={cn(
                                      'block mt-1 text-[9px]',
                                      isParent ? 'text-blue-200' : 'text-slate-400'
                                    )}
                                  >
                                    {new Date(msg.createdAt).toLocaleTimeString('en-IN', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Reply input */}
                        <div className="p-3 bg-white border-t border-slate-100 flex gap-2 items-center">
                          <input
                            type="text"
                            className="flex-1 h-9 px-3 border border-slate-200 rounded-lg text-xs text-slate-900 bg-slate-50 outline-none focus:border-blue-600 focus:bg-white transition-all font-[inherit]"
                            placeholder="Add a follow-up reply..."
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleReply(fb._id);
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleReply(fb._id)}
                            disabled={!replyText.trim()}
                            className="h-9 px-3 rounded-lg bg-blue-600 text-white flex items-center gap-1 text-xs font-bold hover:bg-blue-700 transition-colors disabled:opacity-40 flex-shrink-0 cursor-pointer shadow-2xs"
                          >
                            <Send size={12} /> Reply
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ParentFeedback;
