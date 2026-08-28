import React from 'react';
import { Check, FileAudio, Image, Mic } from 'lucide-react';
import type { MessageComposerState } from '../../../hooks/useMessageComposer';
import './MessageComposer.css';

interface MessageComposerProps {
  composer: MessageComposerState;
  onSend: () => void | Promise<void>;
  onCancel: () => void;
  sending: boolean;
  sendLabel?: string;
  placeholder?: string;
}

const MessageComposer: React.FC<MessageComposerProps> = ({
  composer,
  onSend,
  onCancel,
  sending,
  sendLabel = 'Send Message',
  placeholder = 'Type your message here...',
}) => {
  const {
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
  } = composer;

  return (
    <>
      <div className="form-group" style={{ marginTop: '16px' }}>
        <label className="form-label">Message Text</label>
        <textarea
          className="form-input"
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ width: '100%', height: '120px', resize: 'none', boxSizing: 'border-box' }}
          autoFocus
        />

        <div className="message-composer-attach-panel">
          <span className="message-composer-attach-label">Attach Voice or Media (WhatsApp compatible)</span>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <label className="message-composer-attach-btn">
              <Image className="w-3 h-3" style={{ color: '#10b981' }} />
              <span>Photo / Video</span>
              <input type="file" accept="image/*,video/*" multiple style={{ display: 'none' }} onChange={handleFileSelect} />
            </label>

            <label className="message-composer-attach-btn">
              <FileAudio className="w-3 h-3" style={{ color: '#06b6d4' }} />
              <span>Audio File</span>
              <input type="file" accept="audio/*" multiple style={{ display: 'none' }} onChange={handleFileSelect} />
            </label>

            {!isRecording ? (
              <button type="button" onClick={startRecording} className="message-composer-record-btn">
                <Mic className="w-3 h-3" />
                <span>Record</span>
              </button>
            ) : (
              <button type="button" onClick={stopRecording} className="message-composer-record-btn recording">
                <Mic className="w-3 h-3 animate-bounce" />
                <span>Stop ({recordingSeconds}s)</span>
              </button>
            )}
          </div>

          {recordedAudioUrl && (
            <div style={{ marginTop: '8px' }}>
              <audio src={recordedAudioUrl} controls style={{ width: '100%', height: '32px' }} />
            </div>
          )}

          {isUploadingMedia && (
            <div className="message-composer-uploading">
              <div className="message-composer-uploading-spinner" />
              <span>Uploading attachment...</span>
            </div>
          )}

          {attachments.length > 0 && (
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {attachments.map((att, idx) => (
                <div key={`${att.url}-${idx}`} className="message-composer-attachment-chip">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Check style={{ color: '#0369a1', width: '12px', height: '12px' }} />
                    <span className="message-composer-attachment-name">Attached: {att.filename}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAttachment(idx)}
                    className="message-composer-attachment-remove"
                    title="Remove attachment"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
        <button
          className="action-btn"
          style={{ flex: 1 }}
          onClick={onSend}
          disabled={sending || !text.trim() || isUploadingMedia}
        >
          {sending ? 'Sending...' : isUploadingMedia ? 'Uploading attachment...' : sendLabel}
        </button>
        <button className="action-btn secondary" style={{ flex: 1 }} onClick={onCancel} disabled={sending}>
          Cancel
        </button>
      </div>
    </>
  );
};

export default MessageComposer;
