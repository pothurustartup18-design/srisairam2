import React, { useState } from 'react';
import { MessageSquare, ChevronDown, ChevronUp, Send, MessagesSquare } from 'lucide-react';
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

const inputCls = 'h-11 px-3.5 border border-slate-200 rounded-xl text-sm text-slate-900 bg-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all font-[inherit] w-full';
const labelCls = 'text-[11px] font-bold uppercase tracking-widest text-slate-400';

const ParentFeedback: React.FC<ParentFeedbackProps> = ({ ward, feedbackList, loadFeedbacks, onShowToast }) => {
  const [feedbackSubject, setFeedbackSubject] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [activeFeedback, setActiveFeedback] = useState<FeedbackData | null>(null);
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ward || !feedbackSubject.trim() || !feedbackMessage.trim()) {
      onShowToast('Please fill in both subject and message.', 'error'); return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/feedbacks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: ward.id, studentName: ward.name,
          admissionNo: ward.admissionNo, subject: feedbackSubject.trim(),
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
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
    <div className="flex flex-col gap-4 font-sans text-slate-900">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Feedback & Complaints</h1>
        <p className="text-xs text-slate-500 mt-0.5">Raise a concern or follow up on an existing thread with the school.</p>
      </div>

      {/* Submit form */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
          <MessageSquare size={15} className="text-slate-400" />
          <span className="text-sm font-bold text-slate-700">Submit New Feedback or Complaint</span>
        </div>
        <form onSubmit={handleSubmitFeedback} className="p-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className={labelCls}>Subject / Topic</label>
            <input
              type="text"
              className={inputCls}
              placeholder="e.g. Transport delay, Homework concern..."
              required
              value={feedbackSubject}
              onChange={(e) => setFeedbackSubject(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelCls}>Your Message</label>
            <textarea
              className="min-h-[100px] px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 bg-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all font-[inherit] resize-y"
              placeholder="Describe your concern in detail..."
              required
              value={feedbackMessage}
              onChange={(e) => setFeedbackMessage(e.target.value)}
            />
          </div>
          <div>
            <Button type="submit" disabled={submitting}>
              {submitting ? <><span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Submitting…</> : <><Send size={13} /> Submit Feedback</>}
            </Button>
          </div>
        </form>
      </div>

      {/* Feedback threads */}
      {feedbackList.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
          <EmptyState
            icon={<MessagesSquare size={36} />}
            title="No feedback submitted yet."
            subtitle="Your submitted feedback threads will appear here."
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {feedbackList.map((fb) => {
            const isActive = activeFeedback?._id === fb._id;
            return (
              <div key={fb._id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                {/* Thread header */}
                <div
                  className="flex items-center gap-2.5 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors select-none"
                  onClick={() => { setActiveFeedback(isActive ? null : fb); setReplyText(''); }}
                >
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                    <MessagesSquare size={15} className="text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-slate-900 truncate">{fb.subject}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {new Date(fb.createdAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}
                      <span className="mx-1.5 text-slate-300">·</span>
                      {fb.messages?.length || 0} message{fb.messages?.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-slate-400">
                    {isActive ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>

                {/* Thread messages */}
                {isActive && (
                  <div className="border-t border-slate-100">
                    <div className="flex flex-col gap-3 max-h-[280px] overflow-y-auto p-4 bg-slate-50/50">
                      {fb.messages.map((msg, i) => {
                        const isParent = msg.sender === 'parent';
                        return (
                          <div key={i} className={cn('flex', isParent ? 'justify-end' : 'justify-start')}>
                            <div className={cn(
                              'px-3.5 py-2.5 text-sm max-w-[85%] rounded-2xl leading-relaxed',
                              isParent
                                ? 'bg-indigo-600 text-white rounded-br-md'
                                : 'bg-white text-slate-800 border border-slate-200 rounded-bl-md shadow-sm'
                            )}>
                              <div className={cn('text-[10px] font-bold mb-1', isParent ? 'text-indigo-200' : 'text-slate-400')}>
                                {isParent ? 'You' : 'School Admin'}
                              </div>
                              <p className="m-0">{msg.text}</p>
                              <span className={cn('block mt-1.5 text-[10px]', isParent ? 'text-indigo-200' : 'text-slate-400')}>
                                {new Date(msg.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
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
                        className="flex-1 h-10 px-3.5 border border-slate-200 rounded-xl text-sm text-slate-900 bg-slate-50 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all font-[inherit]"
                        placeholder="Add a follow-up message..."
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleReply(fb._id); }}
                      />
                      <button
                        type="button"
                        onClick={() => handleReply(fb._id)}
                        disabled={!replyText.trim()}
                        className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 transition-colors disabled:opacity-40 flex-shrink-0"
                      >
                        <Send size={14} />
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
  );
};

export default ParentFeedback;




