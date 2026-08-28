import React, { useState, useEffect, useRef, useCallback } from 'react';
import './AdminMessages.css';
import {
  MessageSquare, Users, GraduationCap, Send, UserCheck,
  Search, Smile, Paperclip, ChevronLeft,
  Check, CheckCheck, AlertTriangle, X, Flag
} from 'lucide-react';
import { API_BASE } from '../../../constants';
import type { StudentData, TeacherData } from '../../../types';
import { useSocket } from '../../../context/socketContext';
import { cn } from '../../../lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Thread {
  studentId?: string;
  teacherId?: string;
  name: string;
  lastMessage: string;
  unreadCount?: number;
  updatedAt: string;
  online?: boolean;
  lastSeen?: string;
}

interface MessageDetail {
  _id: string;
  studentId?: string;
  teacherId?: string;
  sender: 'admin' | 'teacher' | 'parent';
  senderName: string;
  text: string;
  read?: boolean;
  delivered?: boolean;
  createdAt: string;
  reaction?: string;
  replyTo?: string;
}

interface AdminMessagesProps {
  students: StudentData[];
  teachers: TeacherData[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getInitials = (name: string) =>
  name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

const getAvatarColor = (name: string) => {
  const colors = [
    '#ef4444','#f97316','#eab308','#22c55e',
    '#3b82f6','#8b5cf6','#ec4899','#06b6d4'
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

const formatTimestamp = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
};

const EMOJIS = ['😊','😂','❤️','👍','🎉','🙏','😢','😮','🔥','✅','📚','💰'];

// ─── Component ────────────────────────────────────────────────────────────────
const AdminMessages: React.FC<AdminMessagesProps> = ({ students, teachers }) => {
  const { socket } = useSocket();
  const [threads, setThreads] = useState<{ studentThreads: Thread[]; teacherThreads: Thread[] }>({
    studentThreads: [],
    teacherThreads: []
  });
  const [activeThread, setActiveThread] = useState<{ type: 'student' | 'teacher'; id: string } | null>(null);
  const [chatMessages, setChatMessages] = useState<MessageDetail[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'students' | 'teachers'>('students');
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [searchContact, setSearchContact] = useState('');
  const [searchSidebar, setSearchSidebar] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [onlineStatuses, setOnlineStatuses] = useState<Record<string, boolean>>({});
  const [lastSeenMap, setLastSeenMap] = useState<Record<string, string>>({});
  const [hoveredMsg, setHoveredMsg] = useState<string | null>(null);

  const chatBodyRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);

  const prevActiveIdRef = useRef<string | null>(null);
  const prevMessagesCountRef = useRef<number>(0);

  // ── Simulate online/last-seen per contact ───────────────────────────────────
  const simulatePresence = useCallback(() => {
    const allIds = [
      ...students.map(s => s.id || s._id || ''),
      ...teachers.map(t => t._id)
    ];
    const statuses: Record<string, boolean> = {};
    const seen: Record<string, string> = {};
    allIds.forEach(id => {
      statuses[id] = Math.random() > 0.6;
      if (!statuses[id]) {
        const minsAgo = Math.floor(Math.random() * 180);
        const d = new Date(Date.now() - minsAgo * 60000);
        seen[id] = minsAgo < 60
          ? `last seen ${minsAgo} min ago`
          : `last seen ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
    });
    setOnlineStatuses(statuses);
    setLastSeenMap(seen);
  }, [students, teachers]);

  // ── Simulate typing indicator ────────────────────────────────────────────────
  const simulateTyping = useCallback(() => {
    if (!activeThread) return;
    const chance = Math.random();
    if (chance > 0.85) {
      setIsTyping(true);
      setTimeout(() => setIsTyping(false), 2000 + Math.random() * 3000);
    }
  }, [activeThread]);

  // ── Fetch threads ─────────────────────────────────────────────────────────
  const fetchThreads = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/messages/threads`);
      const data = await res.json();
      if (data.success) setThreads(data.data);
    } catch (err) {
      console.error('Failed to load message threads:', err);
    }
  }, [students, teachers]);

  const markThreadAsRead = async (type: 'student' | 'teacher', id: string) => {
    try {
      await fetch(`${API_BASE}/messages/read/${type}/${id}`, { method: 'PATCH' });
      fetchThreads();
    } catch (err) {
      console.error('Failed to mark thread as read:', err);
    }
  };

  const fetchChatMessages = useCallback(async (type: 'student' | 'teacher', id: string, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/messages/${type}/${id}`);
      const data = await res.json();
      if (data.success) {
        setChatMessages(data.data);
        markThreadAsRead(type, id);
      }
    } catch (err) {
      console.error('Failed to load chat messages:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, teachers]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeThread || !inputText.trim()) return;

    const { type, id } = activeThread;
    const newMsg: MessageDetail = {
      _id: 'temp-' + Date.now(),
      sender: 'admin',
      senderName: 'Admin',
      text: inputText,
      read: false,
      delivered: true,
      createdAt: new Date().toISOString(),
      ...(type === 'student' ? { studentId: id } : { teacherId: id })
    };

    setChatMessages(prev => [...prev, newMsg]);
    setInputText('');
    setShowEmojiPicker(false);
    // Sending re-renders the message list; the mobile keyboard can drop
    // focus as a result, so re-focus explicitly to keep it open.
    requestAnimationFrame(() => inputRef.current?.focus());

    try {
      const res = await fetch(`${API_BASE}/messages/${type}/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText, senderName: 'Admin' })
      });
      const data = await res.json();
      if (data.success) {
        fetchChatMessages(type, id, true);
        fetchThreads();
      } else {
        setChatMessages(prev => prev.filter(m => m._id !== newMsg._id));
        console.error('Failed to send message:', data.message);
      }
    } catch (err) {
      setChatMessages(prev => prev.filter(m => m._id !== newMsg._id));
      console.error('Failed to send message:', err);
    }

    // Simulate read after 1.5s
    setTimeout(() => {
      setChatMessages(prev =>
        prev.map(m => m._id === newMsg._id ? { ...m, read: true } : m)
      );
    }, 1500);

    // Simulate typing + reply after 3-6s
    simulateTyping();
  };

  const handleStartNewChat = (type: 'student' | 'teacher', id: string) => {
    setActiveThread({ type, id });
    fetchChatMessages(type, id);
    setShowNewChatModal(false);
    setSearchContact('');
  };

  const handleReaction = (msgId: string, emoji: string) => {
    setChatMessages(prev =>
      prev.map(m => m._id === msgId
        ? { ...m, reaction: m.reaction === emoji ? undefined : emoji }
        : m
      )
    );
  };

  const handleSubmitReport = () => {
    if (!reportReason.trim()) return;
    setReportSubmitted(true);
    setTimeout(() => {
      setShowReportModal(false);
      setReportSubmitted(false);
      setReportReason('');
    }, 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setAttachedFile(file);
    if (e.target) e.target.value = '';
  };

  // ── Effects ──────────────────────────────────────────────────────────────────
  useEffect(() => { fetchThreads(); }, [fetchThreads]);
  useEffect(() => { simulatePresence(); }, [simulatePresence]);

  useEffect(() => {
    if (activeThread) fetchChatMessages(activeThread.type, activeThread.id);
  }, [activeThread, fetchChatMessages]);

  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (message: any) => {
      // 1. Refresh threads list to update sidebar previews and bubble them up
      fetchThreads();

      // 2. If the message belongs to the currently active chat thread, append it
      if (activeThread) {
        const isStudentMsg = activeThread.type === 'student' && message.studentId === activeThread.id;
        const isTeacherMsg = activeThread.type === 'teacher' && message.teacherId === activeThread.id;
        if (isStudentMsg || isTeacherMsg) {
          setChatMessages(prev => {
            if (prev.some(m => m._id === message._id)) return prev;
            return [...prev, message];
          });
          // Mark as read on the backend silently
          markThreadAsRead(activeThread.type, activeThread.id);
        }
      }
    };

    socket.on('new_message', handleNewMessage);
    return () => {
      socket.off('new_message', handleNewMessage);
    };
  }, [socket, activeThread, fetchThreads, fetchChatMessages]);

  useEffect(() => {
    if (!activeThread) {
      prevActiveIdRef.current = null;
      prevMessagesCountRef.current = 0;
      return;
    }

    const currentId = activeThread.id;
    const isNewThread = prevActiveIdRef.current !== currentId;
    const shouldScroll = isNewThread || chatMessages.length > prevMessagesCountRef.current || isTyping;

    if (shouldScroll) {
      // rAF lets the browser finish painting the new bubble (and settle any
      // in-flight keyboard/viewport resize) before we measure and scroll.
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: isNewThread ? 'auto' : 'smooth', block: 'end' });
      });
    }
    if (isNewThread) prevActiveIdRef.current = currentId;
    prevMessagesCountRef.current = chatMessages.length;
  }, [chatMessages, activeThread, isTyping]);

  // Periodic presence refresh
  useEffect(() => {
    const iv = setInterval(simulatePresence, 30000);
    return () => clearInterval(iv);
  }, [simulatePresence]);

  // ── Derived values ────────────────────────────────────────────────────────────
  const activeThreadData = activeThread
    ? (activeThread.type === 'student'
        ? students.find(s => s.id === activeThread.id || s._id === activeThread.id)
        : teachers.find(t => t._id === activeThread.id))
    : null;

  const activeChatName = activeThread && activeThreadData
    ? activeThread.type === 'student'
      ? (activeThreadData as StudentData).name
      : (activeThreadData as TeacherData).name
    : '';

  const activeId = activeThread?.id ?? '';
  const isOnline = onlineStatuses[activeId] ?? false;
  const lastSeenText = lastSeenMap[activeId] ?? '';

  const filteredStudentThreads = [...threads.studentThreads]
    .filter(t => t.name.toLowerCase().includes(searchSidebar.toLowerCase()))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const filteredTeacherThreads = [...threads.teacherThreads]
    .filter(t => t.name.toLowerCase().includes(searchSidebar.toLowerCase()))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const totalUnread =
    threads.studentThreads.reduce((a, t) => a + (t.unreadCount || 0), 0) +
    threads.teacherThreads.reduce((a, t) => a + (t.unreadCount || 0), 0);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="am-layout">
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <div className={cn('am-sidebar', activeThread && 'am-sidebar--hidden-mobile')}>
        {/* Header */}
        <div className="am-sidebar-header">
          <div className="am-sidebar-title-row">
            <h3 className="am-sidebar-title">
              Messages
              {totalUnread > 0 && (
                <span className="am-total-badge">{totalUnread}</span>
              )}
            </h3>
            <button className="am-new-chat-btn" onClick={() => setShowNewChatModal(true)} title="New Chat">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            </button>
          </div>

          {/* Search Bar */}
          <div className="am-search-bar">
            <Search className="am-search-icon" />
            <input
              type="text"
              placeholder="Search conversations..."
              className="am-search-input"
              value={searchSidebar}
              onChange={e => setSearchSidebar(e.target.value)}
            />
            {searchSidebar && (
              <button className="am-search-clear" onClick={() => setSearchSidebar('')}>
                <X size={12} />
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="am-tabs">
            <button
              className={`am-tab ${activeTab === 'students' ? 'active' : ''}`}
              onClick={() => setActiveTab('students')}
            >
              <GraduationCap size={14} />
              <span>Parents</span>
              {threads.studentThreads.reduce((a, t) => a + (t.unreadCount || 0), 0) > 0 && (
                <span className="am-tab-badge">
                  {threads.studentThreads.reduce((a, t) => a + (t.unreadCount || 0), 0)}
                </span>
              )}
            </button>
            <button
              className={`am-tab ${activeTab === 'teachers' ? 'active' : ''}`}
              onClick={() => setActiveTab('teachers')}
            >
              <Users size={14} />
              <span>Teachers</span>
              {threads.teacherThreads.reduce((a, t) => a + (t.unreadCount || 0), 0) > 0 && (
                <span className="am-tab-badge">
                  {threads.teacherThreads.reduce((a, t) => a + (t.unreadCount || 0), 0)}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Thread List */}
        <div className="am-threads-list">
          {(activeTab === 'students' ? filteredStudentThreads : filteredTeacherThreads).length === 0 ? (
            <div className="am-no-threads">
              <MessageSquare size={32} />
              <p>{searchSidebar ? 'No matches found.' : 'No conversations yet.'}</p>
            </div>
          ) : (
            (activeTab === 'students' ? filteredStudentThreads : filteredTeacherThreads).map(t => {
              const tid = activeTab === 'students' ? t.studentId! : t.teacherId!;
              const isActive = activeThread?.id === tid;
              const isOnlineContact = onlineStatuses[tid];

              return (
                <div
                  key={tid}
                  className={`am-thread-item ${isActive ? 'active' : ''} ${t.unreadCount ? 'has-unread' : ''}`}
                  onClick={() => setActiveThread({ type: activeTab === 'students' ? 'student' : 'teacher', id: tid })}
                >
                  {/* Avatar */}
                  <div className="am-avatar-wrap">
                    <div
                      className="am-avatar"
                      style={{ backgroundColor: getAvatarColor(t.name) }}
                    >
                      {getInitials(t.name)}
                    </div>
                    {isOnlineContact && <span className="am-online-dot" />}
                  </div>

                  {/* Thread info */}
                  <div className="am-thread-info">
                    <div className="am-thread-top">
                      <span className={`am-thread-name ${t.unreadCount ? 'bold' : ''}`}>{t.name}</span>
                      <div className="am-thread-meta-right">
                        <span className={`am-thread-time ${t.unreadCount ? 'am-time-unread' : ''}`}>
                          {formatTimestamp(t.updatedAt)}
                        </span>
                      </div>
                    </div>
                    <div className="am-thread-bottom">
                      <p className={`am-thread-preview ${t.unreadCount ? 'am-preview-bold' : ''}`}>
                        {t.lastMessage}
                      </p>
                      {t.unreadCount !== undefined && t.unreadCount > 0 && (
                        <span className="am-unread-badge">{t.unreadCount > 99 ? '99+' : t.unreadCount}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Chat Pane ──────────────────────────────────────────────────────────── */}
      <div className={cn('am-chat-pane', !activeThread && 'am-chat-pane--hidden-mobile')}>
        {activeThread ? (
          <>
            {/* Chat Header */}
            <div className="am-chat-header">
              <div className="am-chat-header-left">
                <button
                  type="button"
                  className="am-back-btn"
                  onClick={() => setActiveThread(null)}
                  aria-label="Back to conversations"
                >
                  <ChevronLeft size={22} />
                </button>
                <div className="am-avatar-wrap" style={{ width: 42, height: 42 }}>
                  <div
                    className="am-avatar"
                    style={{ width: 42, height: 42, fontSize: 15, backgroundColor: getAvatarColor(activeChatName) }}
                  >
                    {getInitials(activeChatName)}
                  </div>
                  {isOnline && <span className="am-online-dot" />}
                </div>
                <div className="am-chat-header-info">
                  <h4 className="am-chat-header-name">{activeChatName}</h4>
                  <span className={`am-chat-header-status ${isOnline ? 'online' : ''}`}>
                    {isTyping
                      ? <span className="am-typing-text">typing<span className="am-typing-dots"><span /><span /><span /></span></span>
                      : isOnline ? 'online' : lastSeenText}
                  </span>
                </div>
              </div>
            </div>

            {/* Chat Body */}
            <div className="am-chat-body" ref={chatBodyRef}>
              {loading ? (
                <div className="am-chat-loading">
                  <div className="am-loading-spinner" />
                  <span>Loading conversation...</span>
                </div>
              ) : (
                <div className="am-bubbles">
                  {chatMessages.length === 0 && (
                    <div className="am-empty-chat">
                      <MessageSquare size={40} />
                      <p>No messages yet. Say hello!</p>
                    </div>
                  )}

                  {chatMessages.map((msg, idx) => {
                    const isMe = msg.sender === 'admin';
                    const showDate = idx === 0 || (
                      new Date(chatMessages[idx - 1].createdAt).toDateString() !==
                      new Date(msg.createdAt).toDateString()
                    );

                    return (
                      <React.Fragment key={msg._id}>
                        {showDate && (
                          <div className="am-date-divider">
                            <span>{new Date(msg.createdAt).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                          </div>
                        )}
                        <div
                          className={`am-bubble-wrap ${isMe ? 'me' : 'other'}`}
                          onMouseEnter={() => setHoveredMsg(msg._id)}
                          onMouseLeave={() => setHoveredMsg(null)}
                        >
                          {!isMe && (
                            <div
                              className="am-avatar"
                              style={{ width: 28, height: 28, fontSize: 10, flexShrink: 0, backgroundColor: getAvatarColor(msg.senderName) }}
                            >
                              {getInitials(msg.senderName)}
                            </div>
                          )}
                          <div className="am-bubble-col">
                            <div className={`am-bubble ${isMe ? 'am-bubble-me' : 'am-bubble-other'}`}>
                              {!isMe && <span className="am-bubble-sender">{msg.senderName}</span>}
                              <p className="am-bubble-text">{msg.text}</p>
                              <div className="am-bubble-footer">
                                <span className="am-bubble-time">
                                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                {isMe && (
                                  <span className={`am-ticks ${msg.read ? 'read' : msg.delivered ? 'delivered' : ''}`}>
                                    {msg.read ? <CheckCheck size={13} /> : <Check size={13} />}
                                  </span>
                                )}
                              </div>
                              {msg.reaction && (
                                <div className="am-reaction-badge">{msg.reaction}</div>
                              )}
                            </div>

                            {/* Reaction bar on hover */}
                            {hoveredMsg === msg._id && (
                              <div className={`am-reaction-bar ${isMe ? 'me' : 'other'}`}>
                                {['👍','❤️','😂','😮','😢','🙏'].map(emoji => (
                                  <button
                                    key={emoji}
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

                  {/* Typing Indicator */}
                  {isTyping && (
                    <div className="am-bubble-wrap other">
                      <div
                        className="am-avatar"
                        style={{ width: 28, height: 28, fontSize: 10, flexShrink: 0, backgroundColor: getAvatarColor(activeChatName) }}
                      >
                        {getInitials(activeChatName)}
                      </div>
                      <div className="am-typing-bubble">
                        <span /><span /><span />
                      </div>
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>
              )}
            </div>

            {/* Chat Footer */}
            <div className="am-chat-footer">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />

              {showEmojiPicker && (
                <div className="am-emoji-picker">
                  {EMOJIS.map(em => (
                    <button
                      key={em}
                      className="am-emoji-btn"
                      onClick={() => { setInputText(prev => prev + em); inputRef.current?.focus(); }}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              )}

              {/* Attached file preview */}
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

              <form className="am-footer-form" onSubmit={handleSendMessage}>
                <button
                  type="button"
                  className={`am-footer-icon-btn ${showEmojiPicker ? 'active' : ''}`}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => setShowEmojiPicker(v => !v)}
                  title="Emojis"
                >
                  <Smile size={20} />
                </button>
                <button
                  type="button"
                  className={`am-footer-icon-btn ${attachedFile ? 'active' : ''}`}
                  title="Attach file"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip size={18} />
                </button>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Type a message..."
                  className="am-footer-input"
                  autoComplete="off"
                  enterKeyHint="send"
                  value={inputText}
                  onChange={e => {
                    setInputText(e.target.value);
                    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                    typingTimeoutRef.current = setTimeout(() => {}, 1000);
                  }}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendMessage(e as any)}
                />
                <button
                  type="submit"
                  className="am-send-btn"
                  disabled={!inputText.trim()}
                  onMouseDown={e => e.preventDefault()}
                  title="Send"
                >
                  <Send size={16} />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="am-no-chat">
            <div className="am-no-chat-inner">
              <div className="am-no-chat-icon">
                <MessageSquare size={48} />
              </div>
              <h3>RND School Messenger</h3>
              <p>Select a conversation from the sidebar or start a new one to communicate with parents and teachers.</p>
              <button className="am-start-btn" onClick={() => setShowNewChatModal(true)}>
                Start a new conversation
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── New Chat Modal ─────────────────────────────────────────────────────── */}
      {showNewChatModal && (
        <div className="am-modal-overlay" onClick={() => setShowNewChatModal(false)}>
          <div className="am-new-chat-modal" onClick={e => e.stopPropagation()}>
            <div className="am-modal-header">
              <h3>Start New Conversation</h3>
              <button className="am-modal-close" onClick={() => setShowNewChatModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="am-modal-tabs">
              <button
                className={`am-modal-tab ${activeTab === 'students' ? 'active' : ''}`}
                onClick={() => setActiveTab('students')}
              >
                <GraduationCap size={14} /> Parents
              </button>
              <button
                className={`am-modal-tab ${activeTab === 'teachers' ? 'active' : ''}`}
                onClick={() => setActiveTab('teachers')}
              >
                <UserCheck size={14} /> Teachers
              </button>
            </div>

            <div className="am-modal-search">
              <Search size={14} />
              <input
                type="text"
                placeholder={activeTab === 'students' ? 'Search student name...' : 'Search teacher name...'}
                value={searchContact}
                onChange={e => setSearchContact(e.target.value)}
                autoFocus
              />
            </div>

            <div className="am-modal-contacts">
              {(activeTab === 'students'
                ? students.filter(s => s.name.toLowerCase().includes(searchContact.toLowerCase()))
                : teachers.filter(t => t.name.toLowerCase().includes(searchContact.toLowerCase()))
              ).map((person: any) => {
                const id = person.id || person._id || '';
                const isOnlineContact = onlineStatuses[id];
                return (
                  <div
                    key={id}
                    className="am-contact-item"
                    onClick={() => handleStartNewChat(activeTab === 'students' ? 'student' : 'teacher', id)}
                  >
                    <div className="am-avatar-wrap" style={{ width: 38, height: 38 }}>
                      <div
                        className="am-avatar"
                        style={{ width: 38, height: 38, fontSize: 13, backgroundColor: getAvatarColor(person.name) }}
                      >
                        {getInitials(person.name)}
                      </div>
                      {isOnlineContact && <span className="am-online-dot" />}
                    </div>
                    <div className="am-contact-info">
                      <span className="am-contact-name">{person.name}</span>
                      <span className="am-contact-sub">
                        {activeTab === 'students'
                          ? `Class ${person.class}-${person.section} · ${person.admissionNo}`
                          : `${person.assignedClass || person.subject || 'Teacher'} · ${person.employeeId || ''}`}
                      </span>
                    </div>
                    {isOnlineContact && <span className="am-contact-online-pill">Online</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Report Modal ───────────────────────────────────────────────────────── */}
      {showReportModal && (
        <div className="am-modal-overlay" onClick={() => setShowReportModal(false)}>
          <div className="am-report-modal" onClick={e => e.stopPropagation()}>
            {reportSubmitted ? (
              <div className="am-report-success">
                <AlertTriangle size={36} style={{ color: '#ef4444' }} />
                <h4>Report Submitted</h4>
                <p>Thank you. Our team will review this report shortly.</p>
              </div>
            ) : (
              <>
                <div className="am-modal-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Flag size={16} style={{ color: '#ef4444' }} />
                    <h3>Report {activeChatName}</h3>
                  </div>
                  <button className="am-modal-close" onClick={() => setShowReportModal(false)}>
                    <X size={18} />
                  </button>
                </div>
                <div className="am-report-body">
                  <p className="am-report-desc">
                    Please select a reason for reporting this user. Reports are reviewed by the school administration team.
                  </p>
                  <div className="am-report-options">
                    {[
                      'Inappropriate language or content',
                      'Harassment or bullying',
                      'Spreading misinformation',
                      'Spam messages',
                      'Unauthorized fee requests',
                      'Other concern'
                    ].map(reason => (
                      <label key={reason} className={`am-report-option ${reportReason === reason ? 'selected' : ''}`}>
                        <input
                          type="radio"
                          name="reportReason"
                          value={reason}
                          checked={reportReason === reason}
                          onChange={() => setReportReason(reason)}
                        />
                        <span>{reason}</span>
                      </label>
                    ))}
                  </div>
                  <textarea
                    className="am-report-textarea"
                    placeholder="Additional details (optional)..."
                    rows={3}
                  />
                  <div className="am-report-footer">
                    <button
                      className="am-report-cancel"
                      onClick={() => setShowReportModal(false)}
                    >
                      Cancel
                    </button>
                    <button
                      className="am-report-submit"
                      disabled={!reportReason}
                      onClick={handleSubmitReport}
                    >
                      <Flag size={14} /> Submit Report
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminMessages;
