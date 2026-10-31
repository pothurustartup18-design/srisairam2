import React, { useState, useEffect, useRef, useCallback } from 'react';
import '../../admin/AdminMessages/AdminMessages.css';
import {
  MessageSquare,
  Send,
  RefreshCw,
  Check,
  CheckCheck,
  Smile,
  Paperclip,
  X,
  Search,
  GraduationCap,
  Shield,
  ChevronLeft,
} from 'lucide-react';
import { API_BASE } from '../../../constants';
import type { StudentData } from '../../../types';
import { useSocket } from '../../../context/socketContext';
import { cn } from '../../../lib/utils';
import { Form } from '../../ui/Form';
import { errorMessage, readJson } from '../../../lib/http';
import { ErrorState } from '../../ui/DataState';

interface ParentMessagesProps {
  ward: StudentData | undefined;
  initialRecipient?: 'admin' | 'teacher';
}

interface PersonalMessage {
  _id: string;
  sender: 'admin' | 'teacher' | 'parent';
  recipient?: string;
  senderName: string;
  text: string;
  read?: boolean;
  delivered?: boolean;
  createdAt: string;
  reaction?: string;
}

const EMOJIS = ['😊', '😂', '❤️', '👍', '🎉', '🙏', '😢', '😮', '🔥', '✅', '📚', '💰'];

const getInitials = (name: string) =>
  (name || '')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'AD';

const getAvatarColor = (name: string) => {
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#6366f1'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

const formatTimestamp = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
};

const ParentMessages: React.FC<ParentMessagesProps> = ({ ward, initialRecipient = 'admin' }) => {
  const { socket } = useSocket();
  const [allMessages, setAllMessages] = useState<PersonalMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMsgText, setNewMsgText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [recipientTab, setRecipientTab] = useState<'admin' | 'teacher'>(initialRecipient);
  const [activeThreadMobile, setActiveThreadMobile] = useState<boolean>(true);
  const [activeFilterTab, setActiveFilterTab] = useState<'all' | 'admin' | 'teacher'>(
    initialRecipient === 'teacher' ? 'teacher' : 'all'
  );
  const [searchSidebar, setSearchSidebar] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [hoveredMsg, setHoveredMsg] = useState<string | null>(null);

  const chatBodyRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const prevTabRef = useRef<'admin' | 'teacher' | null>(null);
  const prevMessagesCountRef = useRef<number>(0);

  // Group messages
  const adminMsgs = allMessages.filter(
    (m) => m.sender === 'admin' || (m.sender === 'parent' && (m.recipient === 'admin' || !m.recipient))
  );
  const teacherMsgs = allMessages.filter(
    (m) => m.sender === 'teacher' || (m.sender === 'parent' && m.recipient === 'teacher')
  );

  const currentChatMsgs = recipientTab === 'admin' ? adminMsgs : teacherMsgs;
  const lastAdminMsg = adminMsgs[adminMsgs.length - 1];
  const lastTeacherMsg = teacherMsgs[teacherMsgs.length - 1];

  const adminUnreadCount = allMessages.filter((m) => m.sender === 'admin' && !m.read).length;
  const teacherUnreadCount = allMessages.filter((m) => m.sender === 'teacher' && !m.read).length;
  const totalUnread = adminUnreadCount + teacherUnreadCount;

  const markAsRead = useCallback(async (targetRecipient: 'admin' | 'teacher') => {
    if (!ward) return;
    const studentId = ward.id || ward._id;
    try {
      await fetch(`${API_BASE}/messages/read/student/${studentId}?recipient=${targetRecipient}`, { method: 'PATCH' });
    } catch (err) {
      console.error('Failed to mark messages as read:', err);
    }
    setAllMessages((prev) =>
      prev.map((m) => (m.sender === targetRecipient ? { ...m, read: true } : m))
    );
  }, [ward]);

  const fetchMessages = useCallback(async (silent = false) => {
    if (!ward) return;
    if (!silent) setLoading(true);
    const studentId = ward.id || ward._id;
    try {
      const data = await readJson(await fetch(`${API_BASE}/messages/student/${studentId}?recipient=all`));
      setAllMessages(data.data || []);
      setLoadError(null);
      markAsRead(recipientTab);
    } catch (err) {
      console.error('Failed to load messages:', err);
      if (!silent) setLoadError(errorMessage(err, 'Messages couldn’t be loaded.'));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [ward, recipientTab, markAsRead]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ward || !newMsgText.trim()) return;
    setSending(true);
    setSendError(null);

    const studentId = ward.id || ward._id;
    const senderName = `Parent of ${ward.name || 'Student'}`;
    const newMsg: PersonalMessage = {
      _id: 'temp-' + Date.now(),
      sender: 'parent',
      recipient: recipientTab,
      senderName,
      text: newMsgText.trim(),
      read: false,
      delivered: true,
      createdAt: new Date().toISOString(),
    };

    setAllMessages((prev) => [...prev, newMsg]);
    setNewMsgText('');
    setAttachedFile(null);
    setShowEmojiPicker(false);
    requestAnimationFrame(() => inputRef.current?.focus());

    try {
      const res = await fetch(`${API_BASE}/messages/student/${studentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newMsg.text, recipient: recipientTab, senderName }),
      });
      const data = await res.json();
      if (data.success) {
        fetchMessages(true);
      } else {
        setAllMessages((prev) => prev.filter((m) => m._id !== newMsg._id));
        setNewMsgText((cur) => cur || newMsg.text);
        setSendError(data.message || 'Message not sent. Please try again.');
      }
    } catch (err) {
      setAllMessages((prev) => prev.filter((m) => m._id !== newMsg._id));
      setNewMsgText((cur) => cur || newMsg.text);
      setSendError(errorMessage(err, 'Message not sent. Please try again.'));
    } finally {
      setSending(false);
    }

    setTimeout(() => {
      setAllMessages((prev) => prev.map((m) => (m._id === newMsg._id ? { ...m, read: true } : m)));
    }, 1500);
  };

  const handleReaction = (msgId: string, emoji: string) => {
    setAllMessages((prev) =>
      prev.map((m) => (m._id === msgId ? { ...m, reaction: m.reaction === emoji ? undefined : emoji } : m))
    );
  };

  const handleSelectConversation = (tab: 'admin' | 'teacher') => {
    setRecipientTab(tab);
    setActiveThreadMobile(true);
    markAsRead(tab);
  };

  useEffect(() => {
    if (initialRecipient) {
      setRecipientTab(initialRecipient);
      setActiveFilterTab(initialRecipient === 'teacher' ? 'teacher' : 'all');
      setActiveThreadMobile(true);
    }
  }, [initialRecipient]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (message: any) => {
      const studentId = ward?.id || ward?._id;
      if (studentId && message.studentId === studentId) {
        setAllMessages((prev) => {
          if (prev.some((m) => m._id === message._id)) return prev;
          return [...prev, message];
        });
        markAsRead(recipientTab);
      }
    };

    socket.on('new_message', handleNewMessage);
    return () => {
      socket.off('new_message', handleNewMessage);
    };
  }, [socket, ward, recipientTab, markAsRead]);

  useEffect(() => {
    const isNewTab = prevTabRef.current !== recipientTab;
    const shouldScroll = isNewTab || currentChatMsgs.length > prevMessagesCountRef.current;

    if (shouldScroll) {
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: isNewTab ? 'auto' : 'smooth', block: 'end' });
      });
    }
    if (isNewTab) prevTabRef.current = recipientTab;
    prevMessagesCountRef.current = currentChatMsgs.length;
  }, [currentChatMsgs, recipientTab]);

  if (!ward) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center shadow-card font-sans">
        <MessageSquare size={36} className="mx-auto text-slate-300 mb-2" />
        <p className="text-sm font-bold text-slate-800">No student ward linked to this profile.</p>
      </div>
    );
  }

  const activeContactName = recipientTab === 'admin' ? 'School Administration' : 'Class Teacher';
  const activeSubtitle =
    recipientTab === 'admin'
      ? 'Official Admin & Support Desk'
      : `Class ${ward.class}-${ward.section} Faculty`;

  const showAdminInList =
    activeFilterTab !== 'teacher' &&
    (!searchSidebar || 'school administration admin support'.includes(searchSidebar.toLowerCase()));

  const showTeacherInList =
    activeFilterTab !== 'admin' &&
    (!searchSidebar || `class teacher faculty ${ward.class} ${ward.section}`.includes(searchSidebar.toLowerCase()));

  return (
    <div className="flex flex-col font-sans text-slate-900 w-full h-full" style={{ flex: '1 1 auto', minHeight: 0 }}>
      {/* ─── Main Messenger Container matching Admin Portal 1:1 ─── */}
      <div className="am-layout pm-layout">
        {/* ── Sidebar ── */}
        <div className={cn('am-sidebar', activeThreadMobile && 'am-sidebar--hidden-mobile')}>
          {/* Header */}
          <div className="am-sidebar-header">
            <div className="am-sidebar-title-row">
              <h3 className="am-sidebar-title">
                Messages
                {totalUnread > 0 && <span className="am-total-badge">{totalUnread}</span>}
              </h3>
            </div>

            {/* Search Bar */}
            <div className="am-search-bar">
              <Search className="am-search-icon" />
              <input
                type="text"
                placeholder="Search conversations..."
                className="am-search-input"
                value={searchSidebar}
                onChange={(e) => setSearchSidebar(e.target.value)}
              />
              {searchSidebar && (
                <button className="am-search-clear" onClick={() => setSearchSidebar('')} title="Clear search">
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Tabs */}
            <div className="am-tabs">
              <button
                type="button"
                className={cn('am-tab', activeFilterTab === 'all' && 'active')}
                onClick={() => setActiveFilterTab('all')}
              >
                <MessageSquare size={14} />
                <span>All</span>
                {totalUnread > 0 && <span className="am-tab-badge">{totalUnread}</span>}
              </button>
              <button
                type="button"
                className={cn('am-tab', activeFilterTab === 'admin' && 'active')}
                onClick={() => setActiveFilterTab('admin')}
              >
                <Shield size={14} />
                <span>Admin</span>
                {adminUnreadCount > 0 && <span className="am-tab-badge">{adminUnreadCount}</span>}
              </button>
              <button
                type="button"
                className={cn('am-tab', activeFilterTab === 'teacher' && 'active')}
                onClick={() => setActiveFilterTab('teacher')}
              >
                <GraduationCap size={14} />
                <span>Teacher</span>
                {teacherUnreadCount > 0 && <span className="am-tab-badge">{teacherUnreadCount}</span>}
              </button>
            </div>
          </div>

          {/* Threads List */}
          <div className="am-threads-list">
            {!showAdminInList && !showTeacherInList ? (
              <div className="am-no-threads">
                <MessageSquare size={32} />
                <p>No conversations match your search.</p>
              </div>
            ) : (
              <>
                {/* Administration Thread */}
                {showAdminInList && (
                  <div
                    className={cn(
                      'am-thread-item',
                      recipientTab === 'admin' && 'active',
                      adminUnreadCount > 0 && 'has-unread'
                    )}
                    onClick={() => handleSelectConversation('admin')}
                  >
                    <div className="am-avatar-wrap">
                      <div className="am-avatar" style={{ backgroundColor: '#2563eb' }}>
                        AD
                      </div>
                      <span className="am-online-dot" />
                    </div>

                    <div className="am-thread-info">
                      <div className="am-thread-top">
                        <span className={cn('am-thread-name', adminUnreadCount > 0 && 'bold')}>
                          School Administration
                        </span>
                        <div className="am-thread-meta-right">
                          <span className={cn('am-thread-time', adminUnreadCount > 0 && 'am-time-unread')}>
                            {lastAdminMsg ? formatTimestamp(lastAdminMsg.createdAt) : ''}
                          </span>
                        </div>
                      </div>
                      <div className="am-thread-bottom">
                        <p className={cn('am-thread-preview', adminUnreadCount > 0 && 'am-preview-bold')}>
                          {lastAdminMsg ? lastAdminMsg.text : 'Official administrative support desk'}
                        </p>
                        {adminUnreadCount > 0 && (
                          <span className="am-unread-badge">{adminUnreadCount}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Class Teacher Thread */}
                {showTeacherInList && (
                  <div
                    className={cn(
                      'am-thread-item',
                      recipientTab === 'teacher' && 'active',
                      teacherUnreadCount > 0 && 'has-unread'
                    )}
                    onClick={() => handleSelectConversation('teacher')}
                  >
                    <div className="am-avatar-wrap">
                      <div className="am-avatar" style={{ backgroundColor: '#16a34a' }}>
                        TR
                      </div>
                      <span className="am-online-dot" />
                    </div>

                    <div className="am-thread-info">
                      <div className="am-thread-top">
                        <span className={cn('am-thread-name', teacherUnreadCount > 0 && 'bold')}>
                          Class Teacher
                        </span>
                        <div className="am-thread-meta-right">
                          <span className={cn('am-thread-time', teacherUnreadCount > 0 && 'am-time-unread')}>
                            {lastTeacherMsg ? formatTimestamp(lastTeacherMsg.createdAt) : ''}
                          </span>
                        </div>
                      </div>
                      <div className="am-thread-bottom">
                        <p className={cn('am-thread-preview', teacherUnreadCount > 0 && 'am-preview-bold')}>
                          {lastTeacherMsg ? lastTeacherMsg.text : `Class ${ward.class}-${ward.section} faculty updates`}
                        </p>
                        {teacherUnreadCount > 0 && (
                          <span className="am-unread-badge">{teacherUnreadCount}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Chat Pane ── */}
        <div className={cn('am-chat-pane', !activeThreadMobile && 'am-chat-pane--hidden-mobile')}>
          {/* Chat Header */}
          <div className="am-chat-header">
            <div className="am-chat-header-left">
              <button
                type="button"
                className="am-back-btn"
                onClick={() => setActiveThreadMobile(false)}
                aria-label="Back to conversations"
              >
                <ChevronLeft size={22} />
              </button>

              <div className="am-avatar-wrap" style={{ width: 42, height: 42 }}>
                <div
                  className="am-avatar"
                  style={{
                    width: 42,
                    height: 42,
                    fontSize: 15,
                    backgroundColor: recipientTab === 'admin' ? '#2563eb' : '#16a34a',
                  }}
                >
                  {recipientTab === 'admin' ? 'AD' : 'TR'}
                </div>
                <span className="am-online-dot" />
              </div>

              <div className="am-chat-header-info">
                <h4 className="am-chat-header-name">{activeContactName}</h4>
                <span className="am-chat-header-status online">{activeSubtitle}</span>
              </div>
            </div>

            <div className="am-chat-header-actions">
              <button
                type="button"
                className="am-hdr-btn"
                onClick={() => fetchMessages()}
                disabled={loading}
                title="Refresh conversation"
              >
                <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Chat Body */}
          <div className="am-chat-body" ref={chatBodyRef}>
            {loading && currentChatMsgs.length === 0 ? (
              <div className="am-chat-loading">
                <div className="am-loading-spinner" />
                <span>Loading conversation...</span>
              </div>
            ) : loadError && currentChatMsgs.length === 0 ? (
              <ErrorState message={loadError} onRetry={() => fetchMessages()} />
            ) : currentChatMsgs.length === 0 ? (
              <div className="am-empty-chat">
                <MessageSquare size={40} />
                <p>No messages yet with {activeContactName}. Say hello!</p>
              </div>
            ) : (
              <div className="am-bubbles">
                {currentChatMsgs.map((msg, idx) => {
                  const isMe = msg.sender === 'parent';
                  const showDate =
                    idx === 0 ||
                    new Date(currentChatMsgs[idx - 1].createdAt).toDateString() !==
                      new Date(msg.createdAt).toDateString();

                  return (
                    <React.Fragment key={msg._id}>
                      {showDate && (
                        <div className="am-date-divider">
                          <span>
                            {new Date(msg.createdAt).toLocaleDateString([], {
                              weekday: 'long',
                              month: 'long',
                              day: 'numeric',
                            })}
                          </span>
                        </div>
                      )}

                      <div
                        className={cn('am-bubble-wrap', isMe ? 'me' : 'other')}
                        onMouseEnter={() => setHoveredMsg(msg._id)}
                        onMouseLeave={() => setHoveredMsg(null)}
                      >
                        {!isMe && (
                          <div
                            className="am-avatar"
                            style={{
                              width: 28,
                              height: 28,
                              fontSize: 10,
                              flexShrink: 0,
                              backgroundColor: getAvatarColor(msg.senderName),
                            }}
                          >
                            {getInitials(msg.senderName)}
                          </div>
                        )}

                        <div className="am-bubble-col">
                          <div
                            className={cn('am-bubble', isMe ? 'am-bubble-me' : 'am-bubble-other')}
                            style={isMe ? { background: '#2563eb' } : {}}
                          >
                            {!isMe && <span className="am-bubble-sender">{msg.senderName}</span>}
                            <p className="am-bubble-text">{msg.text}</p>
                            <div className="am-bubble-footer">
                              <span className="am-bubble-time">
                                {new Date(msg.createdAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                              {isMe && (
                                <span className={cn('am-ticks', msg.read ? 'read' : 'delivered')}>
                                  {msg.read ? <CheckCheck size={13} /> : <Check size={13} />}
                                </span>
                              )}
                            </div>

                            {msg.reaction && <div className="am-reaction-badge">{msg.reaction}</div>}
                          </div>

                          {/* Reaction bar on hover */}
                          {hoveredMsg === msg._id && (
                            <div className={cn('am-reaction-bar', isMe ? 'me' : 'other')}>
                              {['👍', '❤️', '😂', '😮', '😢', '🙏'].map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  className="am-reaction-btn"
                                  onClick={() => handleReaction(msg._id, emoji)}
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* Chat Footer */}
          <div className="am-chat-footer">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
              style={{ display: 'none' }}
              onChange={(e) => setAttachedFile(e.target.files?.[0] ?? null)}
            />

            {showEmojiPicker && (
              <div className="am-emoji-picker">
                {EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    className="am-emoji-btn"
                    onClick={() => {
                      setNewMsgText((prev) => prev + em);
                      inputRef.current?.focus();
                    }}
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}

            {attachedFile && (
              <div className="am-attach-preview">
                <Paperclip size={13} />
                <span className="am-attach-name">{attachedFile.name}</span>
                <span className="am-attach-size">({(attachedFile.size / 1024).toFixed(1)} KB)</span>
                <button
                  type="button"
                  className="am-attach-remove"
                  onClick={() => setAttachedFile(null)}
                  title="Remove attachment"
                >
                  <X size={12} />
                </button>
              </div>
            )}

            {sendError && (
              <div role="alert" className="mx-3 mb-2 flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs font-semibold text-danger">
                <span className="flex-1 min-w-0">{sendError}</span>
                <button type="button" className="shrink-0 underline" onClick={() => setSendError(null)}>Dismiss</button>
              </div>
            )}
            <Form className="am-footer-form" onSubmit={handleSendMessage}>
              <button
                type="button"
                className={cn('am-footer-icon-btn', showEmojiPicker && 'active')}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setShowEmojiPicker((v) => !v)}
                title="Emojis"
              >
                <Smile size={20} />
              </button>

              <button
                type="button"
                className={cn('am-footer-icon-btn', attachedFile && 'active')}
                title="Attach file"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip size={18} />
              </button>

              <input
                ref={inputRef}
                type="text"
                placeholder={`Type a message to ${activeContactName}…`}
                className="am-footer-input"
                autoComplete="off"
                enterKeyHint="send"
                value={newMsgText}
                onChange={(e) => setNewMsgText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage(e as any)}
              />

              <button
                type="submit"
                className="am-send-btn"
                style={{ background: '#2563eb' }}
                disabled={!newMsgText.trim() || sending}
                onMouseDown={(e) => e.preventDefault()}
                title="Send"
              >
                <Send size={16} />
              </button>
            </Form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ParentMessages;

