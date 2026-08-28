import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, RefreshCw, Check, CheckCheck, Smile, Paperclip, X } from 'lucide-react';
import { API_BASE } from '../../../constants';
import type { StudentData } from '../../../types';
import { useSocket } from '../../../context/socketContext';
import { cn } from '../../../lib/utils';
import { EmptyState, LoadingSpinner } from '../../ui';

interface ParentMessagesProps {
  ward: StudentData | undefined;
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

const EMOJIS = ['😊','😂','❤️','👍','🎉','🙏','😢','😮','🔥','✅'];

const getInitials = (name: string) =>
  name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

const getAvatarColor = (name: string) => {
  const colors = ['#e11d48','#d97706','#ca8a04','#16a34a','#2563eb','#7c3aed','#db2777'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const formatDateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

const ParentMessages: React.FC<ParentMessagesProps> = ({ ward }) => {
  const { socket } = useSocket();
  const [allMessages, setAllMessages] = useState<PersonalMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [newMsgText, setNewMsgText] = useState('');
  const [sending, setSending] = useState(false);
  const [recipientTab, setRecipientTab] = useState<'admin' | 'teacher'>('admin');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [hoveredMsg, setHoveredMsg] = useState<string | null>(null);

  const chatBodyRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const prevTabRef = useRef<'admin' | 'teacher' | null>(null);
  const prevMessagesCountRef = useRef<number>(0);

  const messages = allMessages.filter(
    m => m.sender === recipientTab || m.recipient === recipientTab || m.sender === 'parent'
  );
  const adminHasUnread  = allMessages.some(m => m.sender === 'admin'   && !m.read);
  const teacherHasUnread = allMessages.some(m => m.sender === 'teacher' && !m.read);

  const markAsRead = async () => {
    if (!ward) return;
    const studentId = ward.id || ward._id;
    try {
      await fetch(`${API_BASE}/messages/read/student/${studentId}?recipient=${recipientTab}`, { method: 'PATCH' });
    } catch (err) {
      console.error('Failed to mark messages as read:', err);
    }
    setAllMessages(prev => prev.map(m => m.sender === recipientTab ? { ...m, read: true } : m));
  };

  const fetchMessages = async (silent = false) => {
    if (!ward) return;
    if (!silent) setLoading(true);
    const studentId = ward.id || ward._id;
    try {
      const res = await fetch(`${API_BASE}/messages/student/${studentId}?recipient=all`);
      const data = await res.json();
      if (data.success) { setAllMessages(data.data); setTimeout(markAsRead, 100); }
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ward || !newMsgText.trim()) return;
    setSending(true);

    const studentId = ward.id || ward._id;
    const senderName = `Parent of ${ward.name || 'Student'}`;
    const newMsg: PersonalMessage = {
      _id: 'temp-' + Date.now(),
      sender: 'parent',
      recipient: recipientTab,
      senderName,
      text: newMsgText,
      read: false,
      delivered: true,
      createdAt: new Date().toISOString()
    };
    setAllMessages(prev => [...prev, newMsg]);
    setNewMsgText('');
    setAttachedFile(null);
    setShowEmojiPicker(false);
    // Sending re-renders the message list; the mobile keyboard can drop
    // focus as a result, so re-focus explicitly to keep it open.
    requestAnimationFrame(() => inputRef.current?.focus());

    try {
      const res = await fetch(`${API_BASE}/messages/student/${studentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newMsg.text, recipient: recipientTab, senderName })
      });
      const data = await res.json();
      if (data.success) {
        fetchMessages(true);
      } else {
        setAllMessages(prev => prev.filter(m => m._id !== newMsg._id));
        console.error('Failed to send message:', data.message);
      }
    } catch (err) {
      setAllMessages(prev => prev.filter(m => m._id !== newMsg._id));
      console.error('Failed to send message:', err);
    } finally { setSending(false); }

    setTimeout(() => {
      setAllMessages(prev => prev.map(m => m._id === newMsg._id ? { ...m, read: true } : m));
    }, 1500);
  };

  const handleReaction = (msgId: string, emoji: string) => {
    setAllMessages(prev => prev.map(m => m._id === msgId ? { ...m, reaction: m.reaction === emoji ? undefined : emoji } : m));
  };

  useEffect(() => { fetchMessages(); }, [ward, recipientTab]);

  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (message: any) => {
      const studentId = ward?.id || ward?._id;
      if (studentId && message.studentId === studentId) {
        setAllMessages(prev => {
          if (prev.some(m => m._id === message._id)) return prev;
          return [...prev, message];
        });
        setTimeout(markAsRead, 100);
      }
    };

    socket.on('new_message', handleNewMessage);
    return () => {
      socket.off('new_message', handleNewMessage);
    };
  }, [socket, ward, recipientTab]);

  useEffect(() => {
    const isNewTab = prevTabRef.current !== recipientTab;
    const shouldScroll = isNewTab || messages.length > prevMessagesCountRef.current;

    if (shouldScroll) {
      // rAF lets the browser finish painting the new bubble (and settle any
      // in-flight keyboard/viewport resize) before we measure and scroll.
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: isNewTab ? 'auto' : 'smooth', block: 'end' });
      });
    }
    if (isNewTab) prevTabRef.current = recipientTab;
    prevMessagesCountRef.current = messages.length;
  }, [messages, recipientTab]);

  if (!ward) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
        <EmptyState icon={<MessageSquare size={40} />} title="No student ward linked to this profile." />
      </div>
    );
  }

  const contactName = recipientTab === 'admin' ? 'Administration' : 'Class Teacher';
  const contactColor = recipientTab === 'admin' ? '#dc2626' : '#16a34a';

  return (
    <div className="flex flex-col gap-4 font-sans text-slate-900 h-full">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Messages</h1>
        <p className="text-xs text-slate-500 mt-0.5">Send and receive messages from the school administration and class teacher.</p>
      </div>

    <div className="flex flex-1 min-h-0 flex-col font-sans text-slate-900 bg-white border-0 md:border md:border-slate-200 rounded-none md:rounded-2xl shadow-none md:shadow-sm overflow-hidden -m-3.5 md:m-0 w-[calc(100%+28px)] md:w-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-5 py-3.5 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0" style={{ backgroundColor: contactColor }}>
            {recipientTab === 'admin' ? 'AD' : 'TR'}
          </div>
          <div>
            <h4 className="m-0 text-md font-bold text-slate-900">{contactName}</h4>
            <span className="text-xs text-slate-400">Direct Messages</span>
          </div>
        </div>
        <button
          className="w-11 h-11 flex items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-50"
          onClick={() => fetchMessages()}
          disabled={loading}
          title="Refresh"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100">
        <button
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold border-b-2 transition-colors',
            recipientTab === 'admin' ? 'text-blue border-blue' : 'text-slate-500 border-transparent hover:bg-blue-lt hover:text-blue'
          )}
          onClick={() => setRecipientTab('admin')}
        >
          Administration
          {adminHasUnread && <span className="w-1.5 h-1.5 rounded-full bg-red" />}
        </button>
        <button
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold border-b-2 transition-colors',
            recipientTab === 'teacher' ? 'text-blue border-blue' : 'text-slate-500 border-transparent hover:bg-blue-lt hover:text-blue'
          )}
          onClick={() => setRecipientTab('teacher')}
        >
          Class Teacher
          {teacherHasUnread && <span className="w-1.5 h-1.5 rounded-full bg-red" />}
        </button>
      </div>

      {/* Chat Body */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 bg-slate-50 flex flex-col" ref={chatBodyRef}>
        {loading && messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center"><LoadingSpinner fullPage /></div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-1.5 text-center text-slate-400">
            <MessageSquare size={38} />
            <p className="m-0 text-sm font-semibold text-slate-700">No messages yet with {contactName}.</p>
            <span className="text-xs text-slate-400">Send a message below to start the conversation.</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {messages.map((msg, idx) => {
              const isMe = msg.sender === 'parent';
              const showDate = idx === 0 || (
                new Date(messages[idx - 1].createdAt).toDateString() !== new Date(msg.createdAt).toDateString()
              );
              return (
                <React.Fragment key={msg._id}>
                  {showDate && (
                    <div className="flex items-center justify-center my-2.5">
                      <span className="bg-white border border-slate-200 text-slate-500 text-2xs font-medium px-3 py-1 rounded-full">
                        {formatDateLabel(msg.createdAt)}
                      </span>
                    </div>
                  )}
                  <div
                    className={cn('flex items-end gap-1.5 relative mb-0.5', isMe ? 'flex-row-reverse' : 'flex-row')}
                    onMouseEnter={() => setHoveredMsg(msg._id)}
                    onMouseLeave={() => setHoveredMsg(null)}
                  >
                    {!isMe && (
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-2xs font-bold text-white flex-shrink-0" style={{ backgroundColor: getAvatarColor(msg.senderName) }}>
                        {getInitials(msg.senderName)}
                      </div>
                    )}
                    <div className={cn('flex flex-col max-w-[85%] sm:max-w-[75%] min-w-[60px] relative', isMe ? 'items-end' : 'items-start')}>
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

      {/* Footer */}
      <div className="bg-white border-t border-slate-200 px-3 pt-2 pb-2.5 relative">
        <input ref={fileInputRef} type="file" className="hidden" onChange={e => setAttachedFile(e.target.files?.[0] ?? null)} />
        {showEmojiPicker && (
          <div className="absolute bottom-[calc(100%+6px)] left-3 bg-white border border-slate-200 rounded-xl p-1.5 flex flex-wrap gap-1 w-[200px] shadow-modal z-50">
            {EMOJIS.map(em => (
              <button key={em} className="w-[30px] h-[30px] border-none bg-transparent text-lg cursor-pointer rounded-md hover:bg-slate-100" onClick={() => { setNewMsgText(p => p + em); inputRef.current?.focus(); }}>{em}</button>
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
          <button type="button" className={cn('w-11 h-11 flex-shrink-0 border-none rounded-full flex items-center justify-center cursor-pointer transition-colors', showEmojiPicker ? 'bg-blue-lt text-blue' : 'text-slate-500 hover:bg-blue-lt hover:text-blue')} onMouseDown={e => e.preventDefault()} onClick={() => setShowEmojiPicker(v => !v)}>
            <Smile size={18} />
          </button>
          <button type="button" className={cn('w-11 h-11 flex-shrink-0 border-none rounded-full flex items-center justify-center cursor-pointer transition-colors', attachedFile ? 'bg-blue-lt text-blue' : 'text-slate-500 hover:bg-blue-lt hover:text-blue')} onMouseDown={e => e.preventDefault()} onClick={() => fileInputRef.current?.click()}>
            <Paperclip size={16} />
          </button>
          <input
            ref={inputRef}
            type="text"
            className="flex-1 min-w-0 h-11 px-3.5 bg-slate-100 border-[1.5px] border-transparent rounded-full outline-none text-sm text-slate-900 focus:border-blue focus:bg-white transition-colors"
            placeholder={`Type a message to ${contactName}...`}
            autoComplete="off"
            enterKeyHint="send"
            value={newMsgText}
            onChange={e => setNewMsgText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSendMessage(e as any); }}
          />
          <button type="submit" className="w-11 h-11 flex-shrink-0 bg-blue text-white border-none rounded-full flex items-center justify-center cursor-pointer hover:bg-blue-dk transition-colors disabled:opacity-50" onMouseDown={e => e.preventDefault()} disabled={sending || !newMsgText.trim()}>
            <Send size={15} />
          </button>
        </form>
      </div>
    </div>
    </div>
  );
};

export default ParentMessages;
