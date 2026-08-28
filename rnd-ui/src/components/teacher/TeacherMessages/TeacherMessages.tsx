import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageSquare, GraduationCap, Send, Search, Smile, Paperclip,
  Check, CheckCheck, X, Shield, Plus, ChevronLeft,
} from 'lucide-react';
import { API_BASE } from '../../../constants';
import type { StudentData } from '../../../types';
import { useSocket } from '../../../context/socketContext';
import { cn } from '../../../lib/utils';
import { Button, Modal } from '../../ui';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Thread {
  studentId?: string;
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
}

interface TeacherMessagesProps {
  teacherId: string | undefined;
  teacherName: string;
  students?: StudentData[];
}

const EMOJIS = ['😊','😂','❤️','👍','🎉','🙏','😢','😮','🔥','✅','📚','📝'];

const getInitials = (name: string) =>
  (name || '').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

const getAvatarColor = (name: string) => {
  const colors = [
    '#2563eb','#3b82f6','#7c3aed','#0ea5e9',
    '#16a34a','#d97706','#db2777','#e11d48'
  ];
  let hash = 0;
  const str = name || '';
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
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

const formatDateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const TeacherMessages: React.FC<TeacherMessagesProps> = ({ teacherId, teacherName, students = [] }) => {
  const { socket } = useSocket();
  const [studentThreads, setStudentThreads] = useState<Thread[]>([]);
  const [adminUnreadCount, setAdminUnreadCount] = useState(0);
  const [adminLastMsg, setAdminLastMsg] = useState({ text: 'No messages yet.', updatedAt: new Date().toISOString() });

  const [activeThread, setActiveThread] = useState<{ type: 'admin' | 'student'; id: string } | null>(null);
  const [chatMessages, setChatMessages] = useState<MessageDetail[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'admin' | 'parents'>('admin');
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [searchContact, setSearchContact] = useState('');
  const [searchSidebar, setSearchSidebar] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [hoveredMsg, setHoveredMsg] = useState<string | null>(null);

  const [onlineStatuses, setOnlineStatuses] = useState<Record<string, boolean>>({});
  const [lastSeenMap, setLastSeenMap] = useState<Record<string, string>>({});

  const chatBodyRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const prevActiveIdRef = useRef<string | null>(null);
  const prevMessagesCountRef = useRef<number>(0);

  const safeStudents = Array.isArray(students) ? students : [];

  const getStudentName = useCallback((s: StudentData) => {
    if ((s as any).name) return (s as any).name;
    return [s.firstName, s.lastName].filter(Boolean).join(' ') || 'Student';
  }, []);

  const simulatePresence = useCallback(() => {
    const statuses: Record<string, boolean> = { admin: true };
    const seen: Record<string, string> = { admin: 'online' };

    safeStudents.forEach(s => {
      const sid = s.id || s._id || '';
      statuses[sid] = Math.random() > 0.5;
      if (!statuses[sid]) {
        const minsAgo = Math.floor(Math.random() * 120);
        const d = new Date(Date.now() - minsAgo * 60000);
        seen[sid] = minsAgo < 60
          ? `last seen ${minsAgo} min ago`
          : `last seen ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
    });

    setOnlineStatuses(statuses);
    setLastSeenMap(seen);
  }, [safeStudents]);

  const fetchThreads = useCallback(async () => {
    if (!teacherId) return;
    try {
      const res = await fetch(`${API_BASE}/messages/threads`);
      const data = await res.json();
      if (data.success && data.data.studentThreads) {
        const classStudentIds = new Set(safeStudents.map(s => s.id || s._id || ''));
        const filtered = data.data.studentThreads
          .filter((t: any) => classStudentIds.has(t.studentId))
          .map((t: any) => ({
            studentId: t.studentId,
            name: t.name,
            lastMessage: t.lastMessage,
            unreadCount: t.unreadCount || 0,
            updatedAt: t.updatedAt
          }));
        setStudentThreads(filtered);
      }

      const adminRes = await fetch(`${API_BASE}/messages/teacher/${teacherId}`);
      const adminData = await adminRes.json();
      if (adminData.success) {
        const msgs = adminData.data || [];
        const unread = msgs.filter((m: any) => m.sender === 'admin' && !m.read).length;
        const last = msgs[msgs.length - 1];
        setAdminUnreadCount(unread);
        if (last) {
          setAdminLastMsg({ text: last.text, updatedAt: last.createdAt });
        }
      }
    } catch (err) {
      console.error('Failed to load message threads:', err);
    }
  }, [teacherId, safeStudents, getStudentName]);

  const markThreadAsRead = async (type: 'admin' | 'student', id: string) => {
    try {
      if (type === 'admin') {
        await fetch(`${API_BASE}/messages/read/teacher/${teacherId}`, { method: 'PATCH' });
      } else {
        await fetch(`${API_BASE}/messages/read/student/${id}?recipient=teacher`, { method: 'PATCH' });
      }
      fetchThreads();
    } catch (err) {
      console.error('Failed to mark thread as read:', err);
    }
  };

  const fetchChatMessages = useCallback(async (type: 'admin' | 'student', id: string, silent = false) => {
    if (!silent) setLoading(true);
    try {
      if (type === 'admin') {
        const res = await fetch(`${API_BASE}/messages/teacher/${teacherId}`);
        const data = await res.json();
        if (data.success) {
          setChatMessages(data.data);
          markThreadAsRead('admin', teacherId!);
        }
      } else {
        const res = await fetch(`${API_BASE}/messages/student/${id}?recipient=teacher`);
        const data = await res.json();
        if (data.success) {
          setChatMessages(data.data);
          markThreadAsRead('student', id);
        }
      }
    } catch (err) {
      console.error('Failed to load chat messages:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeThread || !inputText.trim()) return;

    const { type, id } = activeThread;
    const newMsg: MessageDetail = {
      _id: 'temp-' + Date.now(),
      sender: 'teacher',
      senderName: teacherName,
      text: inputText,
      read: false,
      delivered: true,
      createdAt: new Date().toISOString(),
      ...(type === 'student' ? { studentId: id } : { teacherId: id })
    };

    setChatMessages(prev => [...prev, newMsg]);
    setInputText('');
    setAttachedFile(null);
    setShowEmojiPicker(false);
    // Sending re-renders the message list; the mobile keyboard can drop
    // focus as a result, so re-focus explicitly to keep it open.
    requestAnimationFrame(() => inputRef.current?.focus());

    try {
      if (type === 'admin') {
        await fetch(`${API_BASE}/messages/teacher/${teacherId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: newMsg.text, senderName: teacherName })
        });
      } else {
        await fetch(`${API_BASE}/messages/student/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: newMsg.text, recipient: 'teacher', senderName: teacherName })
        });
      }
      fetchChatMessages(type, id, true);
      fetchThreads();
    } catch (err) {
      setChatMessages(prev => prev.filter(m => m._id !== newMsg._id));
      console.error('Failed to send message:', err);
    }

    setTimeout(() => {
      setChatMessages(prev =>
        prev.map(m => m._id === newMsg._id ? { ...m, read: true } : m)
      );
    }, 1500);
  };

  const handleStartNewChat = (id: string) => {
    setActiveThread({ type: 'student', id });
    fetchChatMessages('student', id);
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

  // ── Effects ──────────────────────────────────────────────────────────────────
  useEffect(() => { fetchThreads(); }, [fetchThreads]);
  useEffect(() => { simulatePresence(); }, [simulatePresence]);

  useEffect(() => {
    if (activeThread) fetchChatMessages(activeThread.type, activeThread.id);
  }, [activeThread, fetchChatMessages]);

  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (message: any) => {
      fetchThreads();

      if (activeThread) {
        const isStudentMsg = activeThread.type === 'student' && message.studentId === activeThread.id;
        const isTeacherMsg = activeThread.type === 'admin' && !message.studentId && message.teacherId === teacherId;
        if (isStudentMsg || isTeacherMsg) {
          setChatMessages(prev => {
            if (prev.some(m => m._id === message._id)) return prev;
            return [...prev, message];
          });
          markThreadAsRead(activeThread.type, activeThread.id);
        }
      }
    };

    socket.on('new_message', handleNewMessage);
    return () => {
      socket.off('new_message', handleNewMessage);
    };
  }, [socket, activeThread, teacherId, fetchThreads, fetchChatMessages]);

  useEffect(() => {
    if (!activeThread) {
      prevActiveIdRef.current = null;
      prevMessagesCountRef.current = 0;
      return;
    }

    const currentId = activeThread.id;
    const isNewThread = prevActiveIdRef.current !== currentId;
    const shouldScroll = isNewThread || chatMessages.length > prevMessagesCountRef.current;

    if (shouldScroll) {
      // rAF lets the browser finish painting the new bubble (and settle any
      // in-flight keyboard/viewport resize) before we measure and scroll.
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: isNewThread ? 'auto' : 'smooth', block: 'end' });
      });
    }
    if (isNewThread) prevActiveIdRef.current = currentId;
    prevMessagesCountRef.current = chatMessages.length;
  }, [chatMessages, activeThread]);

  useEffect(() => {
    const iv = setInterval(simulatePresence, 30000);
    return () => clearInterval(iv);
  }, [simulatePresence]);

  // ── Derived values ────────────────────────────────────────────────────────────
  const activeChatName = activeThread
    ? activeThread.type === 'admin'
      ? 'School Administration'
      : (() => {
          const match = safeStudents.find(s => s.id === activeThread.id || s._id === activeThread.id);
          return match ? `Parent of ${getStudentName(match)}` : 'Parent';
        })()
    : '';

  const activeId = activeThread?.id ?? '';
  const isOnline = onlineStatuses[activeId] ?? false;
  const lastSeenText = lastSeenMap[activeId] ?? '';

  const filteredStudentThreads = [...studentThreads]
    .filter(t => (t.name || '').toLowerCase().includes(searchSidebar.toLowerCase()))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const totalUnread = adminUnreadCount + studentThreads.reduce((a, t) => a + (t.unreadCount || 0), 0);

  const Avatar = ({ name, color, size = 44, online }: { name: string; color: string; size?: number; online?: boolean }) => (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <div
        className="rounded-full flex items-center justify-center font-bold text-white select-none"
        style={{ width: size, height: size, fontSize: size * 0.3, backgroundColor: color }}
      >
        {name}
      </div>
      {online && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green border-2 border-white" />}
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-1 min-h-0 font-sans text-slate-900 -m-3.5 md:m-0 w-[calc(100%+28px)] md:w-auto">
      <div className="flex w-full bg-slate-100 rounded-none md:rounded-lg overflow-hidden shadow-none md:shadow-card">

        {/* Sidebar */}
        <div className={cn(
          'w-full md:w-80 md:min-w-[260px] bg-white border-r border-slate-200 flex-col overflow-hidden',
          activeThread ? 'hidden md:flex' : 'flex'
        )}>
          <div className="bg-white border-b border-slate-200">
            <div className="flex items-center justify-between px-5 pt-4 pb-2.5">
              <h3 className="m-0 text-lg font-extrabold text-slate-900 flex items-center gap-2">
                Class Chat
                {totalUnread > 0 && (
                  <span className="bg-blue text-white text-2xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">{totalUnread}</span>
                )}
              </h3>
              <button
                className="w-11 h-11 bg-blue-lt border-none rounded-full text-blue flex items-center justify-center cursor-pointer hover:bg-blue hover:text-white transition-colors"
                onClick={() => setShowNewChatModal(true)}
                title="New Chat with Parents"
              >
                <Plus size={16} />
              </button>
            </div>

            <div className="flex items-center mx-3.5 mb-2.5 bg-slate-100 rounded-lg px-3 gap-2">
              <Search size={14} className="text-slate-400 flex-shrink-0" />
              <input
                type="text"
                placeholder="Search conversations..."
                className="flex-1 border-none bg-transparent outline-none text-sm py-2 text-slate-900"
                value={searchSidebar}
                onChange={e => setSearchSidebar(e.target.value)}
              />
              {searchSidebar && (
                <button className="text-slate-400 hover:text-slate-600" onClick={() => setSearchSidebar('')}><X size={12} /></button>
              )}
            </div>

            <div className="flex border-t border-slate-100">
              <button
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 text-xs font-semibold border-b-2 transition-colors',
                  activeTab === 'admin' ? 'text-blue border-blue' : 'text-slate-500 border-transparent hover:bg-blue-lt hover:text-blue'
                )}
                onClick={() => setActiveTab('admin')}
              >
                <Shield size={14} />
                <span>Admin</span>
                {adminUnreadCount > 0 && <span className="bg-blue text-white text-2xs font-bold rounded-full min-w-[17px] h-[17px] flex items-center justify-center px-1 ml-0.5">{adminUnreadCount}</span>}
              </button>
              <button
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 text-xs font-semibold border-b-2 transition-colors',
                  activeTab === 'parents' ? 'text-blue border-blue' : 'text-slate-500 border-transparent hover:bg-blue-lt hover:text-blue'
                )}
                onClick={() => setActiveTab('parents')}
              >
                <GraduationCap size={14} />
                <span>Parents</span>
                {studentThreads.reduce((a, t) => a + (t.unreadCount || 0), 0) > 0 && (
                  <span className="bg-blue text-white text-2xs font-bold rounded-full min-w-[17px] h-[17px] flex items-center justify-center px-1 ml-0.5">
                    {studentThreads.reduce((a, t) => a + (t.unreadCount || 0), 0)}
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {activeTab === 'admin' ? (
              <div
                className={cn(
                  'relative flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-slate-100 transition-colors',
                  activeThread?.type === 'admin' ? 'bg-blue-lt before:content-[""] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-blue' : 'hover:bg-slate-50'
                )}
                onClick={() => setActiveThread({ type: 'admin', id: 'admin' })}
              >
                <Avatar name="AD" color="#2563eb" online />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={cn('text-sm text-slate-900 truncate', adminUnreadCount ? 'font-extrabold' : 'font-semibold')}>School Administration</span>
                    <span className={cn('text-2xs', adminUnreadCount ? 'text-blue font-bold' : 'text-slate-400')}>
                      {formatTimestamp(adminLastMsg.updatedAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className={cn('m-0 text-xs truncate', adminUnreadCount ? 'font-bold text-slate-700' : 'text-slate-500')}>
                      {adminLastMsg.text}
                    </p>
                    {adminUnreadCount > 0 && <span className="bg-blue text-white text-2xs font-extrabold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 flex-shrink-0 ml-1">{adminUnreadCount}</span>}
                  </div>
                </div>
              </div>
            ) : filteredStudentThreads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-5 gap-2.5 text-center text-slate-300">
                <MessageSquare size={28} />
                <p className="m-0 text-xs text-slate-400">{searchSidebar ? 'No matches found.' : 'No active chats with parents.'}</p>
              </div>
            ) : (
              filteredStudentThreads.map(t => {
                const tid = t.studentId!;
                const isActive = activeThread?.type === 'student' && activeThread.id === tid;
                const isOnlineContact = onlineStatuses[tid];

                return (
                  <div
                    key={tid}
                    className={cn(
                      'relative flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-slate-100 transition-colors',
                      isActive ? 'bg-blue-lt before:content-[""] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-blue' : 'hover:bg-slate-50'
                    )}
                    onClick={() => setActiveThread({ type: 'student', id: tid })}
                  >
                    <Avatar name={getInitials(t.name)} color={getAvatarColor(t.name)} online={isOnlineContact} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={cn('text-sm text-slate-900 truncate', t.unreadCount ? 'font-extrabold' : 'font-semibold')}>{t.name}</span>
                        <span className={cn('text-2xs', t.unreadCount ? 'text-blue font-bold' : 'text-slate-400')}>
                          {formatTimestamp(t.updatedAt)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className={cn('m-0 text-xs truncate', t.unreadCount ? 'font-bold text-slate-700' : 'text-slate-500')}>
                          {t.lastMessage}
                        </p>
                        {t.unreadCount ? <span className="bg-blue text-white text-2xs font-extrabold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 flex-shrink-0 ml-1">{t.unreadCount}</span> : null}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Chat Pane */}
        <div className={cn(
          'flex-1 flex-col bg-white min-w-0',
          activeThread ? 'flex' : 'hidden md:flex'
        )}>
          {activeThread ? (
            <>
              <div className="flex items-center justify-between px-3 sm:px-5 py-3 bg-white border-b border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 sm:gap-3">
                  <button
                    type="button"
                    className="md:hidden w-11 h-11 -ml-2 flex items-center justify-center text-slate-600 hover:text-blue flex-shrink-0"
                    onClick={() => setActiveThread(null)}
                    aria-label="Back to conversations"
                  >
                    <ChevronLeft size={22} />
                  </button>
                  <Avatar
                    name={activeThread.type === 'admin' ? 'AD' : getInitials(activeChatName)}
                    color={activeThread.type === 'admin' ? '#2563eb' : getAvatarColor(activeChatName)}
                    size={40}
                    online={isOnline}
                  />
                  <div className="flex flex-col">
                    <h4 className="m-0 text-md font-bold text-slate-900">{activeChatName}</h4>
                    <span className={cn('text-xs', isOnline ? 'text-green font-semibold' : 'text-slate-400')}>
                      {isOnline ? 'online' : lastSeenText}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-[18px] bg-slate-100 flex flex-col" ref={chatBodyRef}>
                {loading ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-2.5 text-slate-400 text-sm">
                    <div className="w-6 h-6 border-[3px] border-slate-200 border-t-blue rounded-full animate-spin" />
                    <span>Loading conversation...</span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1 flex-1">
                    {chatMessages.length === 0 && (
                      <div className="flex-1 flex flex-col items-center justify-center gap-2.5 text-slate-400 text-center">
                        <MessageSquare size={38} />
                        <p className="m-0 text-sm font-semibold text-slate-700">No messages yet. Send a message to start conversation!</p>
                      </div>
                    )}

                    {chatMessages.map((msg, idx) => {
                      const isMe = msg.sender === 'teacher';
                      const showDate = idx === 0 || (
                        new Date(chatMessages[idx - 1].createdAt).toDateString() !==
                        new Date(msg.createdAt).toDateString()
                      );

                      return (
                        <React.Fragment key={msg._id}>
                          {showDate && (
                            <div className="flex items-center justify-center my-2.5">
                              <span className="bg-white/90 border border-slate-200 text-slate-500 text-2xs font-medium px-3 py-1 rounded-full">
                                {formatDateLabel(msg.createdAt)}
                              </span>
                            </div>
                          )}
                          <div
                            className={cn('flex items-end gap-1.5 relative mb-0.5', isMe ? 'flex-row-reverse' : 'flex-row')}
                            onMouseEnter={() => setHoveredMsg(msg._id)}
                            onMouseLeave={() => setHoveredMsg(null)}
                          >
                            {!isMe && <Avatar name={getInitials(msg.senderName)} color={getAvatarColor(msg.senderName)} size={28} />}
                            <div className={cn('flex flex-col max-w-[85%] sm:max-w-[70%] min-w-[60px] relative', isMe ? 'items-end' : 'items-start')}>
                              <div className={cn(
                                'px-3 pt-2 pb-1.5 rounded-xl shadow-sm relative break-words',
                                isMe ? 'bg-blue text-white rounded-br-[3px]' : 'bg-white text-slate-800 border border-slate-200 rounded-bl-[3px]'
                              )}>
                                {!isMe && <span className="block text-2xs font-bold mb-0.5 text-blue">{msg.senderName}</span>}
                                <p className="m-0 mb-1 text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                                <div className="flex items-center justify-end gap-1">
                                  <span className={cn('text-[9.5px]', isMe ? 'text-blue-100' : 'text-slate-400')}>{formatTime(msg.createdAt)}</span>
                                  {isMe && (
                                    <span className={cn('flex items-center', msg.read ? 'text-blue-100' : 'text-blue-200/60')}>
                                      {msg.read ? <CheckCheck size={12} /> : <Check size={12} />}
                                    </span>
                                  )}
                                </div>
                                {msg.reaction && (
                                  <div className="absolute -bottom-2 right-1.5 bg-white border border-slate-200 rounded-full px-1 text-xs shadow-sm">{msg.reaction}</div>
                                )}
                              </div>

                              {hoveredMsg === msg._id && (
                                <div className={cn('flex gap-1 mt-1', isMe ? 'justify-end' : 'justify-start')}>
                                  {['👍','❤️','😂','😮','😢','🙏'].map(em => (
                                    <button
                                      key={em}
                                      className="bg-white border border-slate-200 rounded-full px-1.5 py-0.5 text-xs cursor-pointer hover:scale-125 transition-transform"
                                      onClick={() => handleReaction(msg._id, em)}
                                    >
                                      {em}
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

              <div className="bg-white border-t border-slate-200 px-3 pt-2 pb-2.5 relative">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf,.doc,.docx"
                  className="hidden"
                  onChange={e => setAttachedFile(e.target.files?.[0] ?? null)}
                />

                {showEmojiPicker && (
                  <div className="absolute bottom-[calc(100%+6px)] left-3 bg-white border border-slate-200 rounded-xl p-1.5 flex flex-wrap gap-1 w-[200px] shadow-modal z-50">
                    {EMOJIS.map(em => (
                      <button
                        key={em}
                        className="w-[30px] h-[30px] border-none bg-transparent text-lg cursor-pointer rounded-md hover:bg-slate-100"
                        onClick={() => { setInputText(prev => prev + em); inputRef.current?.focus(); }}
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                )}

                {attachedFile && (
                  <div className="flex items-center gap-1.5 mb-1.5 px-2 py-1.5 bg-blue-lt border border-blue-200 rounded-md text-2xs text-blue">
                    <Paperclip size={12} />
                    <span className="flex-1 font-semibold text-slate-700 truncate">{attachedFile.name}</span>
                    <button className="bg-blue-100 border-none rounded-full w-4 h-4 flex items-center justify-center text-blue cursor-pointer" onClick={() => setAttachedFile(null)}><X size={11} /></button>
                  </div>
                )}

                <form className="flex items-center gap-1 sm:gap-1.5" onSubmit={handleSendMessage}>
                  <button
                    type="button"
                    className={cn('w-11 h-11 flex-shrink-0 border-none rounded-full flex items-center justify-center cursor-pointer transition-colors', showEmojiPicker ? 'bg-blue-lt text-blue' : 'text-slate-500 hover:bg-blue-lt hover:text-blue')}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => setShowEmojiPicker(v => !v)}
                  >
                    <Smile size={18} />
                  </button>
                  <button
                    type="button"
                    className={cn('w-11 h-11 flex-shrink-0 border-none rounded-full flex items-center justify-center cursor-pointer transition-colors', attachedFile ? 'bg-blue-lt text-blue' : 'text-slate-500 hover:bg-blue-lt hover:text-blue')}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip size={16} />
                  </button>
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder={`Type a message to ${activeChatName}...`}
                    className="flex-1 min-w-0 h-11 px-3.5 bg-slate-100 border-[1.5px] border-transparent rounded-full outline-none text-sm text-slate-900 focus:border-blue focus:bg-white transition-colors"
                    autoComplete="off"
                    enterKeyHint="send"
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                  />
                  <button type="submit" className="w-11 h-11 flex-shrink-0 bg-blue text-white border-none rounded-full flex items-center justify-center cursor-pointer hover:bg-blue-dk transition-colors disabled:opacity-50" onMouseDown={e => e.preventDefault()} disabled={!inputText.trim()}>
                    <Send size={15} />
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-blue-lt to-slate-50">
              <div className="text-center max-w-[280px]">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 text-blue shadow-card">
                  <MessageSquare size={38} />
                </div>
                <h3 className="m-0 mb-1.5 text-lg font-bold text-slate-900">Teacher Chatroom</h3>
                <p className="m-0 mb-4 text-xs text-slate-500 leading-relaxed">Communicate directly with school administration or the parents of your class students.</p>
                <Button className="rounded-full" onClick={() => setShowNewChatModal(true)}>
                  Start conversation with parent
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Chat Modal */}
      <Modal isOpen={showNewChatModal} onClose={() => setShowNewChatModal(false)} title="Message Parents" maxWidth="380px">
        <div className="flex items-center gap-1.5 -mx-6 -mt-5 mb-3 px-6 py-2.5 border-b border-slate-100 text-slate-400">
          <Search size={14} />
          <input
            type="text"
            className="flex-1 border-none outline-none text-sm text-slate-900"
            placeholder="Search student or parent..."
            value={searchContact}
            onChange={e => setSearchContact(e.target.value)}
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-1 max-h-[50vh] overflow-y-auto">
          {safeStudents
            .filter(s => getStudentName(s).toLowerCase().includes(searchContact.toLowerCase()))
            .map(s => {
              const id = s.id || s._id || '';
              const isOnlineContact = onlineStatuses[id];
              const fullName = getStudentName(s);
              return (
                <div
                  key={id}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-md cursor-pointer hover:bg-blue-lt transition-colors"
                  onClick={() => handleStartNewChat(id)}
                >
                  <Avatar name={getInitials(fullName)} color={getAvatarColor(fullName)} size={38} online={isOnlineContact} />
                  <div className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-slate-900 truncate">Parent of {fullName}</span>
                    <span className="text-xs text-slate-400">Class {s.class}-{s.section} · Adm: {s.admissionNo}</span>
                  </div>
                  {isOnlineContact && <span className="text-2xs font-semibold text-green bg-green-50 px-1.5 py-0.5 rounded-full">Online</span>}
                </div>
              );
            })}
        </div>
      </Modal>
    </div>
  );
};

export default TeacherMessages;
