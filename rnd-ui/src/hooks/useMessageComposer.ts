import { useRef, useState } from 'react';
import { API_BASE } from '../constants';
import { getAccessToken } from '../services/api';

export interface MessageAttachment {
  url: string;
  type: 'image' | 'video' | 'audio' | 'document';
  filename: string;
  size?: number;
}

type ToastFn = (message: string, type?: 'success' | 'error') => void;

export function useMessageComposer(showToast: ToastFn) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const uploadOneFile = async (file: File): Promise<MessageAttachment> => {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    let type: MessageAttachment['type'] = 'document';
    if (file.type.startsWith('image/')) type = 'image';
    else if (file.type.startsWith('video/')) type = 'video';
    else if (file.type.startsWith('audio/')) type = 'audio';

    const res = await fetch(`${API_BASE}/messages/upload-media`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify({ fileBase64: base64, filename: file.name }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || `Failed to upload "${file.name}".`);
    return { url: data.fileUrl, type, filename: file.name, size: typeof data.size === 'number' ? data.size : file.size };
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    setIsUploadingMedia(true);
    try {
      // allSettled (not all) — one bad file shouldn't discard uploads that already
      // succeeded and are sitting in S3/local storage with nothing referencing them.
      const results = await Promise.allSettled(files.map(uploadOneFile));
      const succeeded = results.filter((r): r is PromiseFulfilledResult<MessageAttachment> => r.status === 'fulfilled').map((r) => r.value);
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

      if (succeeded.length > 0) {
        setAttachments((prev) => [...prev, ...succeeded]);
        showToast(`${succeeded.length} file(s) attached successfully!`, 'success');
      }
      if (failed.length > 0) {
        showToast(failed.map((f) => f.reason?.message || 'Upload failed').join(' '), 'error');
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
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Chrome/Edge only support recording to WebM/Opus; Firefox can record straight to
      // Ogg/Opus. Ask for whichever the browser actually supports instead of assuming.
      const preferredMimeTypes = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm'];
      const supportedMimeType = preferredMimeTypes.find((t) => MediaRecorder.isTypeSupported(t));
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
                Authorization: `Bearer ${getAccessToken()}`,
              },
              body: JSON.stringify({ fileBase64: base64, filename }),
            });
            const data = await res.json();
            if (data.success) {
              setAttachments((prev) => [...prev, { url: data.fileUrl, type: 'audio', filename, size: typeof data.size === 'number' ? data.size : undefined }]);
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

        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current = recorder;
      setRecordingSeconds(0);
      setIsRecording(true);
      recorder.start();

      recordingIntervalRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      console.error(err);
      showToast('Could not access microphone.', 'error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      // Lock the Send button immediately — the recording still has to be encoded and
      // uploaded before it's added to the attachments list, and that takes a moment.
      setIsUploadingMedia(true);
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
    }
  };

  const reset = () => {
    setText('');
    setAttachments([]);
    setRecordedAudioUrl(null);
  };

  return {
    text,
    setText,
    attachments,
    isUploadingMedia,
    isRecording,
    recordingSeconds,
    recordedAudioUrl,
    handleFileSelect,
    removeAttachment,
    startRecording,
    stopRecording,
    reset,
  };
}

export type MessageComposerState = ReturnType<typeof useMessageComposer>;
