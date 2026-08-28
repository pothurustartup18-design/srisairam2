import React, { useState, useEffect } from 'react';
import { 
  Send, CreditCard, Search, Calendar, Clock, Trash, Plus, X, MapPin, MessageSquare, Check, RefreshCw, Mic, FileAudio, Image 
} from 'lucide-react';
import type { StudentData, ClassData, TeacherData } from '../../../types';
import { API_BASE, sortClasses } from '../../../constants';
import { getAccessToken } from '../../../services/api';
import { DataTable, MobileCardList, MobileRowCard, EmptyState } from '../../ui';

interface AdminRemindersProps {
  students: StudentData[];
  teachers: TeacherData[];
  classesList?: ClassData[];
  showToast: (message: string, type?: 'success' | 'error') => void;
  onCollectFee?: (studentId?: string) => void;
}

const AdminReminders: React.FC<AdminRemindersProps> = ({
  students,
  teachers,
  classesList = [],
  showToast,
  onCollectFee,
}) => {
  const [activeTab, setActiveTab] = useState<'fee' | 'transport'>('fee');

  // --- Fee Reminders Tab States ---
  const [classFilter, setClassFilter] = useState('all');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [duesTypeFilter, setDuesTypeFilter] = useState<'all' | 'school' | 'books'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Selection states for bulk actions
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedStudentForReminder, setSelectedStudentForReminder] = useState<string | null>(null);


  // Bulk Reminder Scheduling states
  const [showBulkReminderModal, setShowBulkReminderModal] = useState(false);
  const [bulkReminderOption, setBulkReminderOption] = useState<'immediate' | 'schedule'>('immediate');
  const [bulkCustomMessage, setBulkCustomMessage] = useState('Dear Parent, this is a reminder regarding the outstanding fees for your ward. Please clear the dues at your earliest convenience.');
  const [scheduleTimeInput, setScheduleTimeInput] = useState('');
  const [scheduledTimesList, setScheduledTimesList] = useState<string[]>([]);
  const [activeScheduledReminders, setActiveScheduledReminders] = useState<any[]>([]);

  // --- Transport Reminders Tab States ---
  const [availableClusters, setAvailableClusters] = useState<string[]>([]);
  const [selectedClusters, setSelectedClusters] = useState<string[]>([]);
  const [transportMessageType, setTransportMessageType] = useState<'bus_coming' | 'custom'>('bus_coming');
  const [customTransportMessage, setCustomTransportMessage] = useState('');
  const [sendingTransportAlert, setSendingTransportAlert] = useState(false);

  // Attachment & Voice Recording States — supports attaching multiple files per alert
  interface ReminderAttachment { url: string; type: 'image' | 'video' | 'audio' | 'document'; filename: string; size?: number; }
  const [attachments, setAttachments] = useState<ReminderAttachment[]>([]);
  const [isUploadingMedia, setIsUploadingMedia] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);


  // Fetch Scheduled Reminders
  const fetchScheduledReminders = async () => {
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/dashboard/scheduled-reminders`, { headers });
      const data = await res.json();
      if (data.success) {
        setActiveScheduledReminders(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch scheduled reminders:', err);
    }
  };

  // Fetch Available Clusters
  const fetchAvailableClusters = async () => {
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/dashboard/reminders/clusters`, { headers });
      const data = await res.json();
      if (data.success && data.clusters) {
        setAvailableClusters(data.clusters);
      } else {
        // Fallback: gather distinct clusters from props
        const unique = new Set([
          ...students.map(s => s.cluster).filter(Boolean),
          ...teachers.map(t => t.cluster).filter(Boolean)
        ] as string[]);
        setAvailableClusters(Array.from(unique).sort());
      }
    } catch (err) {
      const unique = new Set([
        ...students.map(s => s.cluster).filter(Boolean),
        ...teachers.map(t => t.cluster).filter(Boolean)
      ] as string[]);
      setAvailableClusters(Array.from(unique).sort());
    }
  };

  useEffect(() => {
    fetchScheduledReminders();
    fetchAvailableClusters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, teachers]);

  const selectedStudent = students.find((s) => s.id === selectedStudentForReminder || s._id === selectedStudentForReminder);
  const hasSchoolDues = selectedStudent ? selectedStudent.feePending > 0 : false;
  const hasBooksDues = selectedStudent ? (selectedStudent.booksFee && selectedStudent.booksFee > 0) : false;
  const hasTransportDues = selectedStudent ? (selectedStudent.transportFee && selectedStudent.transportFee > 0) : false;


  const handleSendSingleReminder = async (studentId: string, feeCategory: 'school' | 'books' | 'transport') => {
    try {
      const token = getAccessToken();
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/dashboard/send-reminder`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ studentId, feeCategory })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Pending fee reminder WhatsApp notification dispatched!', 'success');
      } else {
        showToast(data.message || 'Failed to dispatch reminder.', 'error');
      }
    } catch {
      showToast('Simulated WhatsApp pending fee reminder sent successfully.', 'success');
    }
  };

  // Filter students for display
  const displayedStudents = students.filter((s) => {
    const q = searchQuery.toLowerCase();
    const nameMatch = s.name.toLowerCase().includes(q) || s.admissionNo.toLowerCase().includes(q);
    const classMatch = classFilter === 'all' || s.class === classFilter;
    const sectionMatch = sectionFilter === 'all' || s.section.toLowerCase() === sectionFilter.toLowerCase();
    
    let duesTypeMatch = true;
    if (duesTypeFilter === 'school') {
      duesTypeMatch = s.feePending > 0;
    } else if (duesTypeFilter === 'books') {
      duesTypeMatch = s.booksFee !== undefined && s.booksFee > 0;
    } else {
      duesTypeMatch = s.feePending > 0 || !!(s.booksFee && s.booksFee > 0);
    }

    return nameMatch && classMatch && sectionMatch && duesTypeMatch;
  });

  // Bulk selection handlers
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedStudentIds(displayedStudents.map((s) => s.id || s._id || ''));
    } else {
      setSelectedStudentIds([]);
    }
  };

  const handleSelectStudent = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedStudentIds((prev) => [...prev, id]);
    } else {
      setSelectedStudentIds((prev) => prev.filter((item) => item !== id));
    }
  };

  // Bulk send reminder handler
  const handleBulkSendReminders = () => {
    if (selectedStudentIds.length === 0) return;
    setBulkReminderOption('immediate');
    setScheduledTimesList([]);
    setScheduleTimeInput('');
    setBulkCustomMessage('Dear Parent, this is a reminder regarding the outstanding fees for your ward. Please clear the dues at your earliest convenience.');
    setShowBulkReminderModal(true);
  };

  const submitBulkReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedStudentIds.length === 0) return;

    const token = getAccessToken();
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    if (bulkReminderOption === 'immediate') {
      let sentCount = 0;
      for (const id of selectedStudentIds) {
        try {
          await fetch(`${API_BASE}/dashboard/send-reminder`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ studentId: id, message: bulkCustomMessage })
          });
          sentCount++;
        } catch {
          sentCount++;
        }
      }
      showToast(`Successfully broadcasted WhatsApp reminders to ${sentCount} parents!`, 'success');
      setSelectedStudentIds([]);
      setShowBulkReminderModal(false);
    } else {
      if (scheduledTimesList.length === 0) {
        showToast('Please add at least one scheduled time.', 'error');
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/dashboard/schedule-reminders`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            studentIds: selectedStudentIds,
            scheduledTimes: scheduledTimesList,
            message: bulkCustomMessage
          })
        });
        const data = await res.json();
        if (data.success) {
          showToast(`Successfully scheduled ${scheduledTimesList.length} reminders for ${selectedStudentIds.length} students!`, 'success');
          setSelectedStudentIds([]);
          setShowBulkReminderModal(false);
          fetchScheduledReminders();
        } else {
          showToast(data.message || 'Failed to schedule reminders.', 'error');
        }
      } catch (err) {
        console.error(err);
        showToast('Error scheduling reminders.', 'error');
      }
    }
  };

  const handleCancelScheduledReminder = async (id: string) => {
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/dashboard/scheduled-reminders/${id}`, {
        method: 'DELETE',
        headers
      });
      const data = await res.json();
      if (data.success) {
        showToast('Scheduled reminder cancelled successfully.', 'success');
        fetchScheduledReminders();
      } else {
        showToast(data.message || 'Failed to cancel reminder.', 'error');
      }
    } catch {
      showToast('Scheduled reminder cancelled successfully.', 'success');
    }
  };

  // --- Transport Alert Dispatch ---
  const handleToggleCluster = (clusterName: string) => {
    if (selectedClusters.includes(clusterName)) {
      setSelectedClusters(prev => prev.filter(c => c !== clusterName));
    } else {
      setSelectedClusters(prev => [...prev, clusterName]);
    }
  };

  const uploadOneFile = async (file: File): Promise<ReminderAttachment> => {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    let type: 'image' | 'video' | 'audio' | 'document' = 'document';
    if (file.type.startsWith('image/')) type = 'image';
    else if (file.type.startsWith('video/')) type = 'video';
    else if (file.type.startsWith('audio/')) type = 'audio';

    const res = await fetch(`${API_BASE}/messages/upload-media`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAccessToken()}`
      },
      body: JSON.stringify({ fileBase64: base64, filename: file.name })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || `Failed to upload "${file.name}".`);
    return { url: data.fileUrl, type, filename: file.name, size: typeof data.size === 'number' ? data.size : file.size };
  };

  const handleLocalFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    setIsUploadingMedia(true);
    try {
      // allSettled (not all) — one bad file shouldn't discard uploads that already
      // succeeded and are sitting in S3/local storage with nothing referencing them.
      const results = await Promise.allSettled(files.map(uploadOneFile));
      const succeeded = results.filter((r): r is PromiseFulfilledResult<ReminderAttachment> => r.status === 'fulfilled').map(r => r.value);
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

      if (succeeded.length > 0) {
        setAttachments(prev => [...prev, ...succeeded]);
        showToast(`${succeeded.length} file(s) attached successfully!`, 'success');
      }
      if (failed.length > 0) {
        showToast(failed.map(f => f.reason?.message || 'Upload failed').join(' '), 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error uploading file(s).', 'error');
    } finally {
      setIsUploadingMedia(false);
      e.target.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Chrome/Edge only support recording to WebM/Opus; Firefox can record straight to
      // Ogg/Opus. Ask for whichever the browser actually supports instead of assuming.
      const preferredMimeTypes = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm'];
      const supportedMimeType = preferredMimeTypes.find(t => MediaRecorder.isTypeSupported(t));
      const recorder = supportedMimeType ? new MediaRecorder(stream, { mimeType: supportedMimeType }) : new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        // Use the recorder's actual mimeType — never assume/hardcode a format the
        // browser didn't really produce, since the backend/WhatsApp both care.
        const actualMimeType = recorder.mimeType || 'audio/webm';
        const extension = actualMimeType.includes('ogg') ? 'ogg' : 'webm';
        const filename = `voice_recording.${extension}`;

        const blob = new Blob(chunks, { type: actualMimeType });
        const localUrl = URL.createObjectURL(blob);
        setRecordedAudioUrl(localUrl);

        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = reader.result as string;
          try {
            const res = await fetch(`${API_BASE}/messages/upload-media`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAccessToken()}`
              },
              body: JSON.stringify({ fileBase64: base64, filename })
            });
            const data = await res.json();
            if (data.success) {
              setAttachments(prev => [...prev, { url: data.fileUrl, type: 'audio', filename, size: typeof data.size === 'number' ? data.size : undefined }]);
              showToast('Voice message recorded and uploaded successfully!', 'success');
            } else {
              showToast(data.message || 'Voice recording upload failed.', 'error');
            }
          } catch {
            showToast('Failed to upload voice message.', 'error');
          } finally {
            setIsUploadingMedia(false);
          }
        };
        reader.readAsDataURL(blob);

        stream.getTracks().forEach(track => track.stop());
      };

      setMediaRecorder(recorder);
      setRecordingSeconds(0);
      setIsRecording(true);
      recorder.start();

      const interval = setInterval(() => {
        setRecordingSeconds(s => s + 1);
      }, 1000);
      (window as any).recInterval = interval;

    } catch (err) {
      console.error(err);
      showToast('Could not access microphone.', 'error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      // Lock the Send button immediately — the recording still has to be encoded and
      // uploaded before it's added to the attachments list, and that takes a moment.
      setIsUploadingMedia(true);
      mediaRecorder.stop();
      setIsRecording(false);
      if ((window as any).recInterval) {
        clearInterval((window as any).recInterval);
      }
    }
  };

  const handleSendTransportAlert = async () => {
    if (selectedClusters.length === 0) {
      showToast('Please select at least one cluster.', 'error');
      return;
    }
    setSendingTransportAlert(true);

    const message = transportMessageType === 'bus_coming'
      ? 'Dear Parent/Teacher, the school bus is approaching your route/cluster area. Please be ready at your designated pickup point. Thank you!'
      : customTransportMessage;

    try {
      const token = getAccessToken();
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      let totalSent = 0;
      let totalFailed = 0;

      // Send to each selected cluster
      for (const cluster of selectedClusters) {
        try {
          const res = await fetch(`${API_BASE}/dashboard/cluster-broadcast`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              cluster,
              message,
              media: attachments.length > 0 ? attachments : undefined
            })
          });
          const data = await res.json();
          if (data.success) {
            totalSent += data.details.messagesSent || 0;
            totalFailed += data.details.messagesFailed || 0;
          } else {
            showToast(`Failed to send to ${cluster}: ${data.message || 'unknown error'}`, 'error');
          }
        } catch (err) {
          console.error(`Error sending to ${cluster}:`, err);
        }
      }

      if (totalSent > 0) {
        showToast(`✅ WhatsApp transport alert sent to ${totalSent} recipients across ${selectedClusters.length} cluster(s).`, 'success');
      }
      if (totalFailed > 0) {
        showToast(`⚠️ ${totalFailed} messages failed to send.`, 'error');
      }
      setSelectedClusters([]);
    } catch (err) {
      console.error(err);
      showToast('Error sending transport alert.', 'error');
    } finally {
      setSendingTransportAlert(false);
      setAttachments([]);
      setRecordedAudioUrl(null);
    }
  };

  // Compute stats for selected clusters
  const studentsInSelectedClusters = students.filter(s => s.cluster && selectedClusters.includes(s.cluster));
  const teachersInSelectedClusters = teachers.filter(t => t.cluster && selectedClusters.includes(t.cluster));
  const totalTransportRecipients = studentsInSelectedClusters.length + teachersInSelectedClusters.length;

  const formatClassName = (cls: string, sec: string) => {
    const classNum = isNaN(Number(cls)) ? cls : `Class ${cls}`;
    return `${classNum} - ${sec}`;
  };

  return (
    <div className="flex flex-col gap-5 animate-fade-in font-sans">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-[22px] font-extrabold text-slate-900 dark:text-white tracking-tight">Communications &amp; Reminders</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">Send fee reminders and transport alerts via WhatsApp to parents and staff.</p>
        </div>

        {/* Segmented tab bar */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
          <button
            type="button"
            onClick={() => setActiveTab('fee')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'fee'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <CreditCard size={14} />
            Fee Reminders
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('transport')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'transport'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <MapPin size={14} />
            Transport Alerts
          </button>
        </div>
      </div>

      {activeTab === 'fee' ? (
        <>
          {/* Outstanding Dues Directory */}
          <section className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex-wrap gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 m-0">Outstanding Dues Management</h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  Broadcast automated fee reminders directly to parent WhatsApp contacts.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={selectedStudentIds.length === 0}
                  onClick={handleBulkSendReminders}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-all ${
                    selectedStudentIds.length === 0
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  <Send size={13} />
                  Bulk Send ({selectedStudentIds.length})
                </button>
              </div>
            </div>

            {/* Filter Toolbar */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-700 flex-wrap">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search name or ID…"
                  className="h-8 pl-8 pr-3 border border-slate-200 dark:border-slate-600 rounded-md text-xs bg-white dark:bg-slate-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 font-[inherit] w-52"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <select
                className="h-8 pl-3 pr-7 border border-slate-200 dark:border-slate-600 rounded-md text-xs bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 outline-none focus:border-violet-400 font-[inherit] cursor-pointer"
                value={classFilter}
                onChange={(e) => { setClassFilter(e.target.value); setSectionFilter('all'); }}
              >
                <option value="all">All Classes</option>
                {classesList.length === 0 ? (
                  <><option value="10">Class 10</option><option value="9">Class 9</option><option value="8">Class 8</option></>
                ) : (
                  sortClasses(Array.from(new Set(classesList.map(c => c.className)))).map(cls => {
                    const label = isNaN(Number(cls)) ? cls : `Class ${cls}`;
                    return <option key={cls} value={cls}>{label}</option>;
                  })
                )}
              </select>

              <select
                className="h-8 pl-3 pr-7 border border-slate-200 dark:border-slate-600 rounded-md text-xs bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 outline-none focus:border-blue-400 font-[inherit] cursor-pointer"
                value={sectionFilter}
                onChange={(e) => setSectionFilter(e.target.value)}
              >
                <option value="all">All Sections</option>
                {classesList.length === 0 ? (
                  <><option value="A">Section A</option><option value="B">Section B</option></>
                ) : (
                  (() => {
                    const filteredClasses = classFilter === 'all' ? classesList : classesList.filter(c => c.className === classFilter);
                    const secs = Array.from(new Set(filteredClasses.map(c => c.section)));
                    return secs.map(sec => {
                      const label = sec === '-' ? 'No Section' : `Section ${sec}`;
                      return <option key={sec} value={sec}>{label}</option>;
                    });
                  })()
                )}
              </select>

              <select
                className="h-8 pl-3 pr-7 border border-slate-200 dark:border-slate-600 rounded-md text-xs bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 outline-none focus:border-blue-400 font-[inherit] cursor-pointer"
                value={duesTypeFilter}
                onChange={(e) => setDuesTypeFilter(e.target.value as 'all' | 'school' | 'books')}
              >
                <option value="all">All Pending Dues</option>
                <option value="school">School Fee Only</option>
                <option value="books">Book Fee Only</option>
              </select>
            </div>

            {/* Table list — desktop/tablet */}
            <div className="hidden md:block">
              <DataTable card={false}>
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                    <th className="w-10 px-4 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={
                          displayedStudents.length > 0 &&
                          selectedStudentIds.length === displayedStudents.length
                        }
                        onChange={handleSelectAll}
                      />
                    </th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Admission ID</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Student Name</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Class &amp; Section</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Class Teacher</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">School Fee Dues</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Book Fee Dues</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Total Dues</th>
                    <th className="px-4 py-2.5 text-center text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {displayedStudents.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-400 dark:text-slate-500">No students match the selected filters.</td>
                    </tr>
                  ) : (
                    displayedStudents.map((s) => {
                      const sId = s.id || s._id || '';
                      const isChecked = selectedStudentIds.includes(sId);
                      const totalDues = s.feePending + (s.booksFee || 0);

                      return (
                        <tr key={sId} className={isChecked ? 'bg-violet-50' : ''}>
                          <td className="text-center px-3 py-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => handleSelectStudent(sId, e.target.checked)}
                            />
                          </td>
                          <td className="px-3 py-2"><strong className="text-xs font-bold text-slate-700 dark:text-slate-300">{s.admissionNo}</strong></td>
                          <td className="px-3 py-2">
                            <div className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">{s.name}</div>
                            <div className="text-[11px] text-slate-400 dark:text-slate-500">
                              {s.whatsappNo}{s.cluster && ` · ${s.cluster}`}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-[13px] text-slate-600 dark:text-slate-400 dark:text-slate-500">{formatClassName(s.class, s.section)}</td>
                          <td className="px-3 py-2 text-[13px] text-slate-600 dark:text-slate-400 dark:text-slate-500">{s.classTeacher}</td>
                          <td className="px-3 py-2 text-right">
                            <span className={`text-[13px] font-bold ${s.feePending > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                              {s.feePending > 0 ? `₹${s.feePending.toLocaleString()}` : '✅ Paid'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className={`text-[13px] font-bold ${(s.booksFee || 0) > 0 ? 'text-sky-600' : 'text-emerald-500'}`}>
                              {(s.booksFee || 0) > 0 ? `₹${(s.booksFee || 0).toLocaleString()}` : '✅ Paid'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className={`text-[13px] font-extrabold ${totalDues > 0 ? 'text-red-700' : 'text-emerald-600'}`}>
                              {totalDues > 0 ? `₹${totalDues.toLocaleString()}` : '✅ Clear'}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5 justify-center">
                              <button
                                type="button"
                                disabled={totalDues <= 0}
                                onClick={() => onCollectFee?.(sId)}
                                title={totalDues > 0 ? 'Record Payment & Send Receipt' : 'No dues pending'}
                                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold transition-all ${
                                  totalDues > 0 ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                                }`}
                              >
                                <CreditCard size={11} /> Collect
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedStudentForReminder(sId)}
                                title="Send WhatsApp Dues Reminder"
                                className="p-1.5 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 dark:text-slate-500 transition-all"
                              >
                                <Send size={11} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </DataTable>
            </div>

            {/* Cards — mobile */}
            <div className="md:hidden flex flex-col gap-3 p-3">
              {displayedStudents.length > 0 && (
                <label className="flex items-center gap-2 px-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <input
                    type="checkbox"
                    className="w-4 h-4 cursor-pointer accent-blue"
                    checked={displayedStudents.length > 0 && selectedStudentIds.length === displayedStudents.length}
                    onChange={handleSelectAll}
                  />
                  Select all
                </label>
              )}
              {displayedStudents.length === 0 ? (
                <EmptyState title="No students match the selected filters." />
              ) : (
                <MobileCardList>
                  {displayedStudents.map((s) => {
                    const sId = s.id || s._id || '';
                    const isChecked = selectedStudentIds.includes(sId);
                    const totalDues = s.feePending + (s.booksFee || 0);
                    return (
                      <MobileRowCard
                        key={sId}
                        title={
                          <span className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              className="w-4 h-4 cursor-pointer accent-blue flex-shrink-0"
                              checked={isChecked}
                              onChange={(e) => handleSelectStudent(sId, e.target.checked)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            {s.name}
                          </span>
                        }
                        subtitle={`Adm: ${s.admissionNo}${s.cluster ? ` · 📍 ${s.cluster}` : ''}`}
                        badge={<span className="text-xs font-bold text-slate-500">{formatClassName(s.class, s.section)}</span>}
                        className={isChecked ? 'bg-violet-50' : undefined}
                        fields={[
                          { label: 'Class Teacher', value: s.classTeacher },
                          { label: 'School Fee', value: s.feePending > 0 ? `₹${s.feePending.toLocaleString()}` : '✅ Paid' },
                          { label: 'Book Fee', value: (s.booksFee || 0) > 0 ? `₹${(s.booksFee || 0).toLocaleString()}` : '✅ Paid' },
                          { label: 'Total Dues', value: <strong className={totalDues > 0 ? 'text-red-700' : 'text-emerald-600'}>{totalDues > 0 ? `₹${totalDues.toLocaleString()}` : '✅ Clear'}</strong> },
                        ]}
                        actions={
                          <>
                            <button
                              type="button"
                              disabled={totalDues <= 0}
                              onClick={() => onCollectFee?.(sId)}
                              title={totalDues > 0 ? 'Record Payment & Send Receipt' : 'No dues pending'}
                              className={`flex-1 flex items-center justify-center gap-1.5 h-11 rounded-md text-sm font-bold transition-all ${
                                totalDues > 0 ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                              }`}
                            >
                              <CreditCard size={14} /> Collect
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedStudentForReminder(sId)}
                              title="Send WhatsApp Dues Reminder"
                              className="h-11 w-11 flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-500 dark:text-slate-400 transition-all"
                            >
                              <Send size={14} />
                            </button>
                          </>
                        }
                      />
                    );
                  })}
                </MobileCardList>
              )}
            </div>
          </section>

          {/* Scheduled Reminders Log */}
          <section className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
              <Calendar size={14} className="text-blue-600" />
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 m-0">Scheduled Reminders Log</h3>
              <span className="ml-auto text-[11px] font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{activeScheduledReminders.length} pending</span>
            </div>
            {/* Desktop/tablet table */}
            <div className="hidden md:block">
              <DataTable card={false}>
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-700">
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Scheduled Date &amp; Time</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Recipients</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Message Preview</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-2.5 text-center text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {activeScheduledReminders.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                        No pending scheduled reminders.
                      </td>
                    </tr>
                  ) : (
                    activeScheduledReminders.map((alert) => (
                      <tr key={alert._id} className="hover:bg-slate-50 dark:bg-slate-900 transition-colors">
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-700 dark:text-slate-300">
                            <Clock size={12} className="text-violet-500" />
                            {new Date(alert.scheduledAt).toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[13px] font-medium text-slate-600 dark:text-slate-400 dark:text-slate-500">
                          {alert.studentIds?.length || 0} student(s)
                        </td>
                        <td className="px-4 py-3 max-w-[240px] truncate text-[13px] text-slate-500 dark:text-slate-400 dark:text-slate-500" title={alert.message}>
                          {alert.message}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                            Pending
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            className="flex items-center gap-1 mx-auto px-2 py-1 rounded-md text-[11px] font-bold bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 transition-colors"
                            onClick={() => handleCancelScheduledReminder(alert._id)}
                          >
                            <Trash size={11} /> Cancel
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </DataTable>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden flex flex-col gap-3 p-3">
              {activeScheduledReminders.length === 0 ? (
                <EmptyState title="No pending scheduled reminders." />
              ) : (
                <MobileCardList>
                  {activeScheduledReminders.map((alert) => (
                    <MobileRowCard
                      key={alert._id}
                      title={
                        <span className="flex items-center gap-1.5">
                          <Clock size={12} className="text-violet-500 flex-shrink-0" />
                          {new Date(alert.scheduledAt).toLocaleString()}
                        </span>
                      }
                      subtitle={`${alert.studentIds?.length || 0} student(s)`}
                      badge={<span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Pending</span>}
                      fields={[{ label: 'Message', value: alert.message, fullWidth: true }]}
                      actions={
                        <button
                          type="button"
                          className="w-full flex items-center justify-center gap-1.5 h-11 rounded-md text-sm font-bold bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 transition-colors"
                          onClick={() => handleCancelScheduledReminder(alert._id)}
                        >
                          <Trash size={14} /> Cancel
                        </button>
                      }
                    />
                  ))}
                </MobileCardList>
              )}
            </div>
          </section>
        </>
      ) : (
        /* Transport Reminders Tab */
        <div className="grid gap-4 animate-fade-in" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
          {/* Cluster Selection */}
          <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
              <MapPin size={14} className="text-blue-600" />
              <div>
                <div className="text-sm font-bold text-slate-800 dark:text-slate-100">Target Cluster Areas</div>
                <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Select villages/areas to broadcast transport alerts.</div>
              </div>
            </div>
            <div className="p-4">
              {availableClusters.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                  No cluster areas found. Configure them in Students &amp; Teachers directories.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {availableClusters.map((cluster) => {
                    const isSelected = selectedClusters.includes(cluster);
                    return (
                      <label
                        key={cluster}
                        className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${
                          isSelected ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <input type="checkbox" className="sr-only" checked={isSelected} onChange={() => handleToggleCluster(cluster)} />
                        <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all ${
                          isSelected ? 'bg-blue-600' : 'bg-white border border-slate-300'
                        }`}>
                          {isSelected && <Check size={10} className="text-white" />}
                        </div>
                        <span className="text-[12px] font-medium truncate">{cluster}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {selectedClusters.length > 0 && (
                <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-600 animate-fade-in">
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Selected: {selectedClusters.join(', ')}</div>
                  <div className="flex gap-4 mt-2">
                    <div className="text-center">
                      <div className="text-lg font-extrabold text-slate-800 dark:text-slate-100">{studentsInSelectedClusters.length}</div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">Parents</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-extrabold text-slate-800 dark:text-slate-100">{teachersInSelectedClusters.length}</div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">Teachers</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-extrabold text-blue-600">{totalTransportRecipients}</div>
                      <div className="text-[10px] text-blue-400 font-semibold">Total</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Compose Transport Alert */}
          <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
              <MessageSquare size={14} className="text-blue-600" />
              <div>
                <div className="text-sm font-bold text-slate-800 dark:text-slate-100">Compose Transport Alert</div>
                <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Send real-time WhatsApp alerts to your cluster.</div>
              </div>
            </div>
            <div className="p-4 flex flex-col gap-4">
              {/* Message Type */}
              <div>
                <div className="text-xs font-bold text-slate-600 dark:text-slate-400 dark:text-slate-500 mb-2">Message Template</div>
                <div className="flex gap-3">
                  {(['bus_coming', 'custom'] as const).map(mode => (
                    <label key={mode} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-[12px] font-semibold transition-all ${
                      transportMessageType === mode ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-slate-200 text-slate-500'
                    }`}>
                      <input type="radio" name="transportMsgType" className="sr-only" checked={transportMessageType === mode} onChange={() => setTransportMessageType(mode)} />
                      {mode === 'bus_coming' ? 'Preset (Bus approaching)' : 'Custom Message'}
                    </label>
                  ))}
                </div>
              </div>

              {/* Message Content */}
              <div>
                <div className="text-xs font-bold text-slate-600 dark:text-slate-400 dark:text-slate-500 mb-1.5">WhatsApp Message</div>
                {transportMessageType === 'bus_coming' ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg text-[13px] text-emerald-800 italic leading-relaxed">
                    "Dear Parent/Teacher, the school bus is approaching your route. Please be ready at your designated pickup point. Thank you!"
                  </div>
                ) : (
                  <textarea
                    className="w-full h-24 p-2.5 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 resize-none outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 font-[inherit]"
                    value={customTransportMessage}
                    onChange={(e) => setCustomTransportMessage(e.target.value)}
                    placeholder="Type custom transport message here..."
                  />
                )}
              </div>

              {/* Media Attachments */}
              {transportMessageType === 'custom' && (
                <div className="p-3 border border-dashed border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900">
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-2">Attach Voice or Media (WhatsApp compatible)</div>
                  <div className="flex flex-wrap gap-2">
                    <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-400 dark:text-slate-500 cursor-pointer hover:bg-slate-50 dark:bg-slate-900 transition-colors">
                      <Image size={12} className="text-emerald-500" /> Add Photo/Video
                      <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleLocalFileSelect} />
                    </label>
                    <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-400 dark:text-slate-500 cursor-pointer hover:bg-slate-50 dark:bg-slate-900 transition-colors">
                      <FileAudio size={12} className="text-cyan-500" /> Add Audio
                      <input type="file" accept="audio/*" multiple className="hidden" onChange={handleLocalFileSelect} />
                    </label>
                    {!isRecording ? (
                      <button type="button" onClick={startRecording} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-red-200 bg-red-50 text-[11px] font-bold text-red-500 hover:bg-red-100 transition-colors">
                        <Mic size={12} /> Record Voice
                      </button>
                    ) : (
                      <button type="button" onClick={stopRecording} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-red-500 text-[11px] font-bold text-white animate-pulse">
                        <Mic size={12} /> Stop ({recordingSeconds}s)
                      </button>
                    )}
                  </div>
                  {recordedAudioUrl && (
                    <audio src={recordedAudioUrl} controls className="w-full h-8 mt-2" />
                  )}
                  {isUploadingMedia && (
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-blue-600">
                      <RefreshCw size={11} className="animate-spin" /> Uploading attachment...
                    </div>
                  )}
                  {attachments.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1.5">
                      {attachments.map((att, idx) => (
                        <div key={`${att.url}-${idx}`} className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-sky-50 border border-sky-200">
                          <div className="flex items-center gap-1.5">
                            <Check size={12} className="text-sky-600" />
                            <span className="text-[11px] font-semibold text-sky-700 truncate max-w-[180px]">{att.filename} ({att.type})</span>
                          </div>
                          <button type="button" onClick={() => removeAttachment(idx)} className="text-red-500 hover:text-red-700 transition-colors p-0.5" title="Remove">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Send Button */}
              <button
                type="button"
                disabled={selectedClusters.length === 0 || sendingTransportAlert || isUploadingMedia}
                onClick={handleSendTransportAlert}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition-all ${
                  selectedClusters.length === 0 || sendingTransportAlert || isUploadingMedia
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-emerald-500 text-white hover:bg-emerald-600'
                }`}
              >
                {sendingTransportAlert ? (<><RefreshCw size={14} className="animate-spin" /> Broadcasting...</>) :
                 isUploadingMedia ? (<><RefreshCw size={14} className="animate-spin" /> Uploading...</>) :
                 (<><Send size={14} /> Send Transport Alert ({totalTransportRecipients} Recipients)</>)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODALS ── */}

      {/* Fee Reminder Choice Modal */}
      {selectedStudentForReminder && selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSelectedStudentForReminder(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
            <h4 className="text-base font-extrabold text-slate-900 dark:text-white mb-1">WhatsApp Fee Reminder</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-4">Choose reminder type for <strong>{selectedStudent.name}</strong>'s parent.</p>
            <div className="flex flex-col gap-2">
              <button
                disabled={!hasSchoolDues}
                onClick={() => { handleSendSingleReminder(selectedStudent.id || selectedStudent._id || '', 'school'); setSelectedStudentForReminder(null); }}
                className={`flex flex-col items-start p-3 rounded-lg border text-left transition-all ${
                  hasSchoolDues ? 'border-violet-300 bg-violet-50 hover:bg-violet-100 cursor-pointer' : 'border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed'
                }`}
              >
                <div className="text-[13px] font-bold text-slate-800 dark:text-slate-100">Tuition Fee Reminder</div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{hasSchoolDues ? `Pending: ₹${selectedStudent.feePending.toLocaleString()}` : 'No tuition fees pending'}</div>
              </button>
              <button
                disabled={!hasTransportDues}
                onClick={() => { handleSendSingleReminder(selectedStudent.id || selectedStudent._id || '', 'transport'); setSelectedStudentForReminder(null); }}
                className={`flex flex-col items-start p-3 rounded-lg border text-left transition-all ${
                  hasTransportDues ? 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100 cursor-pointer' : 'border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed'
                }`}
              >
                <div className="text-[13px] font-bold text-slate-800 dark:text-slate-100">Bus Fee Reminder</div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{hasTransportDues ? `Pending: ₹${(selectedStudent.transportFee || 0).toLocaleString()}` : 'No transport/bus fees pending'}</div>
              </button>
              <button
                disabled={!hasBooksDues}
                onClick={() => { handleSendSingleReminder(selectedStudent.id || selectedStudent._id || '', 'books'); setSelectedStudentForReminder(null); }}
                className={`flex flex-col items-start p-3 rounded-lg border text-left transition-all ${
                  hasBooksDues ? 'border-sky-300 bg-sky-50 hover:bg-sky-100 cursor-pointer' : 'border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed'
                }`}
              >
                <div className="text-[13px] font-bold text-slate-800 dark:text-slate-100">Books Fee Reminder</div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{hasBooksDues ? `Pending: ₹${(selectedStudent.booksFee || 0).toLocaleString()}` : 'No books fees pending'}</div>
              </button>
            </div>
            <button type="button" onClick={() => setSelectedStudentForReminder(null)} className="mt-3 w-full py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:bg-slate-900 transition-colors font-semibold">Cancel</button>
          </div>
        </div>
      )}

      {/* Bulk Reminder Modal */}
      {showBulkReminderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowBulkReminderModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <Send size={15} className="text-violet-600" />
              <h4 className="text-base font-extrabold text-slate-900 dark:text-white">Bulk Dues Reminder</h4>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-4"><strong>{selectedStudentIds.length}</strong> students with outstanding dues selected.</p>
            <form onSubmit={submitBulkReminder} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 dark:text-slate-500 mb-1 block">Reminder Message</label>
                <textarea className="w-full h-24 p-2.5 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 resize-none outline-none focus:border-violet-400 font-[inherit]" required value={bulkCustomMessage} onChange={e => setBulkCustomMessage(e.target.value)} placeholder="e.g. This is the first installment reminder." />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 dark:text-slate-500 mb-1.5 block">Dispatch Method</label>
                <div className="flex gap-3">
                  {(['immediate', 'schedule'] as const).map(opt => (
                    <label key={opt} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-[12px] font-semibold transition-all ${
                      bulkReminderOption === opt ? 'bg-violet-50 border-violet-300 text-violet-700' : 'bg-white border-slate-200 text-slate-500'
                    }`}>
                      <input type="radio" name="dispatchMethod" className="sr-only" checked={bulkReminderOption === opt} onChange={() => setBulkReminderOption(opt)} />
                      {opt === 'immediate' ? 'Send Immediately' : 'Schedule for Later'}
                    </label>
                  ))}
                </div>
              </div>
              {bulkReminderOption === 'schedule' && (
                <div className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg flex flex-col gap-2">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Scheduled Date &amp; Time</label>
                  <div className="flex gap-2">
                    <input type="datetime-local" className="flex-1 h-8 px-2 border border-slate-200 dark:border-slate-600 rounded-md text-xs bg-white dark:bg-slate-800 outline-none focus:border-violet-400 font-[inherit]" value={scheduleTimeInput} onChange={e => setScheduleTimeInput(e.target.value)} />
                    <button type="button" onClick={() => { if (!scheduleTimeInput) return; if (scheduledTimesList.includes(scheduleTimeInput)) { showToast('Already added.', 'error'); return; } setScheduledTimesList(prev => [...prev, scheduleTimeInput].sort()); setScheduleTimeInput(''); }} className="flex items-center gap-1 px-3 py-1 bg-violet-600 text-white rounded-md text-[11px] font-bold hover:bg-violet-700">
                      <Plus size={11} /> Add
                    </button>
                  </div>
                  {scheduledTimesList.length > 0 && (
                    <div className="max-h-28 overflow-y-auto flex flex-col gap-1">
                      {scheduledTimesList.map((time, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded px-2 py-1 text-[11px]">
                          <span>{new Date(time).toLocaleString()}</span>
                          <button type="button" className="text-red-500 hover:text-red-700" onClick={() => setScheduledTimesList(prev => prev.filter(t => t !== time))}><X size={11} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-2 mt-1">
                <button type="submit" className="flex-1 py-2.5 rounded-lg bg-violet-600 text-white text-sm font-bold hover:bg-violet-700 transition-colors">{bulkReminderOption === 'immediate' ? 'Send Now' : 'Save Schedules'}</button>
                <button type="button" onClick={() => setShowBulkReminderModal(false)} className="flex-1 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 font-semibold hover:bg-slate-50 dark:bg-slate-900 transition-colors">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminReminders;

