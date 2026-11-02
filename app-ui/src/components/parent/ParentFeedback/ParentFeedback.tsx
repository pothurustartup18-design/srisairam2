import React, { useState } from 'react';
import { MessageSquare, ChevronDown, ChevronUp, Send, MessagesSquare, Sparkles, User, Shield } from 'lucide-react';
import type { FeedbackData, StudentData } from '../../../types';
import { API_BASE } from '../../../constants';
import { cn } from '../../../lib/utils';
import { Button, EmptyState, ErrorState, SkeletonList } from '../../ui';
import type { DataStatus } from '../../../hooks/useApiData';
import { Form } from '../../ui/Form';
import { ActionButton } from '../../ui/ActionButton';

interface ParentFeedbackProps {
  ward: StudentData | undefined;
  feedbackList: FeedbackData[];
  loadFeedbacks: () => void;
  status?: DataStatus;
  error?: string | null;
  onShowToast: (message: string, type?: 'success' | 'error') => void;
}

const inputCls =
  'h-10 px-3.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 bg-slate-50/50 outline-none focus:border-blue-600 focus:bg-white transition-all font-[inherit] w-full';
const labelCls = 'text-[10px] font-bold uppercase tracking-wider text-slate-400';

const ParentFeedback: React.FC<ParentFeedbackProps> = ({ ward, feedbackList, loadFeedbacks, status = 'success', error, onShowToast }) => {
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

  const [mobileTab, setMobileTab] = useState<'threads' | 'new'>('threads');

  return (
    <div className="flex flex-col gap-5 font-sans text-slate-900">
      {/* ═══════════════════════════════════════════════════════════════════
          MOBILE-ONLY: Feedback & Grievances (<768px)
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="md:hidden parent-mobile-container">
        {/* ── 1. Hero Card ── */}
        <div className="ph-hero-card">
          <div className="ph-hero-top">
            <div className="ph-hero-identity">
              <div className="ph-date-pill">
                <MessagesSquare size={12} className="shrink-0" />
                <span>School Helpdesk</span>
              </div>
              <h2 className="ph-student-name">
                {feedbackList.length > 0 ? `${feedbackList.length} Inquir${feedbackList.length !== 1 ? 'ies' : 'y'}` : 'School Helpdesk'}
              </h2>
              <div className="ph-role-subtitle">
                <span className="ph-role-tag">{ward ? ward.name : 'Parent Portal'}</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white shadow-inner shrink-0">
              <MessageSquare size={22} />
            </div>
          </div>

          <div className="ph-telemetry-strip">
            <div className="ph-telemetry-col">
              <span className="ph-telemetry-num">{feedbackList.length}</span>
              <span className="ph-telemetry-lbl">Total Questions</span>
            </div>
            <div className="ph-telemetry-divider" />
            <div className="ph-telemetry-col">
              <span className="ph-telemetry-num text-emerald-600">
                {feedbackList.filter(f => (f.messages?.length || 0) > 1).length}
              </span>
              <span className="ph-telemetry-lbl">School Replies</span>
            </div>
            <div className="ph-telemetry-divider" />
            <div className="ph-telemetry-col">
              <span className="ph-telemetry-num text-blue-600">
                {ward ? `${ward.class}-${ward.section}` : 'General'}
              </span>
              <span className="ph-telemetry-lbl">Class</span>
            </div>
          </div>
        </div>

        {/* ── 2. Segment Filter Chips ── */}
        <div className="grid grid-cols-2 gap-2 pb-1" role="tablist" aria-label="Feedback">
          <button
            type="button"
            onClick={() => setMobileTab('threads')}
            role="tab"
            aria-selected={mobileTab === 'threads'}
            className={cn('ph-filter-chip justify-center min-w-0', mobileTab === 'threads' && 'active')}
          >
            <MessagesSquare size={13} className="shrink-0" />
            <span className="truncate">My Questions</span>
            <span className={cn(
              'text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ml-0.5',
              mobileTab === 'threads' ? 'bg-white text-blue-600' : 'bg-slate-200 text-slate-600'
            )}>
              {feedbackList.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('new')}
            role="tab"
            aria-selected={mobileTab === 'new'}
            className={cn('ph-filter-chip justify-center min-w-0', mobileTab === 'new' && 'active')}
          >
            <Send size={13} className="shrink-0" />
            <span className="truncate">Ask a Question</span>
          </button>
        </div>

        {/* ── 3. Mobile Content Tab: Submit Concern ── */}
        {mobileTab === 'new' && (
          <div className="ph-card">
            <div className="ph-card-header">
              <div className="ph-card-title">
                <MessageSquare size={16} className="text-blue-600" />
                <span>Ask School Office / Teachers</span>
              </div>
            </div>
            <Form onSubmit={handleSubmitFeedback} className="p-4 flex flex-col gap-3.5">
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
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-bold shadow-md hover:shadow-lg active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send size={14} /> Send Question to School
                  </>
                )}
              </button>
            </Form>
          </div>
        )}

        {/* ── 4. Mobile Content Tab: Threads ── */}
        {mobileTab === 'threads' && (
          <div className="flex flex-col gap-3">
            {/* Quick explanatory banner for parents */}
            <div className="p-3 bg-blue-50/80 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/60 rounded-xl flex items-start gap-2.5 text-xs text-blue-900 dark:text-blue-200 shadow-2xs">
              <Sparkles size={15} className="text-blue-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <p className="font-bold m-0">Direct Parent Helpdesk</p>
                <p className="text-[11px] text-blue-800/90 dark:text-blue-300/90 m-0 mt-0.5">
                  Private communication with the school administration. Ask questions about bus timings, fee receipts, or homework. You will receive official replies directly here.
                </p>
              </div>
            </div>
            {status === 'loading' && feedbackList.length === 0 ? (
              <div className="ph-card overflow-hidden"><SkeletonList rows={3} avatar={false} label="Loading feedback…" /></div>
            ) : status === 'error' && feedbackList.length === 0 ? (
              <div className="ph-card"><ErrorState message={error} onRetry={loadFeedbacks} compact /></div>
            ) : feedbackList.length === 0 ? (
              <div className="ph-card p-6">
                <EmptyState
                  icon={<MessagesSquare size={36} />}
                  title="No feedback submitted yet"
                  subtitle="Submit a concern or query to communicate directly with school administrators."
                />
              </div>
            ) : (
              feedbackList.map((fb) => {
                const isActive = activeFeedback?._id === fb._id;
                const msgCount = fb.messages?.length || 0;
                return (
                  <div key={fb._id} className="ph-card overflow-hidden">
                    <div
                      className="p-3.5 flex items-center justify-between gap-3 cursor-pointer select-none active:bg-slate-50"
                      onClick={() => {
                        setActiveFeedback(isActive ? null : fb);
                        setReplyText('');
                      }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-900">
                          <MessagesSquare size={16} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{fb.subject}</div>
                          <div className="text-[10.5px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                            <span>
                              {new Date(fb.createdAt).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                              })}
                            </span>
                            <span>•</span>
                            {fb.messages?.some((m) => m.sender !== 'parent') ? (
                              <span className="font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 px-1.5 py-0.5 rounded-md text-[9.5px]">
                                ✓ School Replied
                              </span>
                            ) : (
                              <span className="font-bold text-amber-700 bg-amber-50 dark:bg-amber-950/50 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60 px-1.5 py-0.5 rounded-md text-[9.5px]">
                                ⏳ Waiting for School
                              </span>
                            )}
                            <span>•</span>
                            <span className="font-medium text-slate-500 dark:text-slate-400">
                              {msgCount} msg{msgCount !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-slate-400 shrink-0">
                        {isActive ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </div>

                    {isActive && (
                      <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
                        <div className="flex flex-col gap-2.5 max-h-[260px] overflow-y-auto p-3">
                          {fb.messages.map((msg, i) => {
                            const isParent = msg.sender === 'parent';
                            return (
                              <div
                                key={i}
                                className={cn('flex items-start gap-2', isParent ? 'justify-end' : 'justify-start')}
                              >
                                {!isParent && (
                                  <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5">
                                    <Shield size={11} />
                                  </div>
                                )}
                                <div
                                  className={cn(
                                    'px-3 py-2 text-xs max-w-[85%] rounded-2xl leading-relaxed shadow-2xs',
                                    isParent
                                      ? 'bg-blue-600 text-white rounded-br-xs'
                                      : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-bl-xs'
                                  )}
                                >
                                  <div
                                    className={cn(
                                      'text-[9.5px] font-bold mb-0.5',
                                      isParent ? 'text-blue-100' : 'text-slate-400'
                                    )}
                                  >
                                    {isParent ? 'You' : 'Administration'}
                                  </div>
                                  <p className="m-0 whitespace-pre-wrap">{msg.text}</p>
                                  <span
                                    className={cn(
                                      'block mt-1 text-[8.5px]',
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

                        <div className="p-2.5 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex gap-2 items-center">
                          <input
                            type="text"
                            className="flex-1 h-8 px-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 outline-none focus:border-blue-600"
                            placeholder="Add reply..."
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleReply(fb._id);
                            }}
                          />
                          <ActionButton
                            type="button"
                            onClick={() => handleReply(fb._id)}
                            disabled={!replyText.trim()}
                            className="h-8 px-3 rounded-lg bg-blue-600 text-white flex items-center gap-1 text-xs font-bold disabled:opacity-40 shrink-0"
                          >
                            <Send size={11} /> Reply
                          </ActionButton>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          DESKTOP-ONLY: Full Feedback Layout (md+)
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="hidden md:flex md:flex-col gap-5">
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

            <Form onSubmit={handleSubmitFeedback} className="p-5 flex flex-col gap-4">
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
            </Form>
          </div>

          {/* ─── RIGHT: Feedback Threads History ─── */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                My Questions & School Replies ({feedbackList.length})
              </span>
            </div>

            {status === 'loading' && feedbackList.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl shadow-card overflow-hidden"><SkeletonList rows={3} avatar={false} label="Loading feedback…" /></div>
            ) : status === 'error' && feedbackList.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl shadow-card"><ErrorState message={error} onRetry={loadFeedbacks} /></div>
            ) : feedbackList.length === 0 ? (
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
                            <ActionButton
                              type="button"
                              onClick={() => handleReply(fb._id)}
                              disabled={!replyText.trim()}
                              className="h-9 px-3 rounded-lg bg-blue-600 text-white flex items-center gap-1 text-xs font-bold hover:bg-blue-700 transition-colors disabled:opacity-40 flex-shrink-0 cursor-pointer shadow-2xs"
                            >
                              <Send size={12} /> Reply
                            </ActionButton>
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
    </div>
  );
};

export default ParentFeedback;
