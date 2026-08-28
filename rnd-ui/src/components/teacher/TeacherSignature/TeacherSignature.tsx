import React, { useState, useEffect, useRef } from 'react';
import Cropper from 'react-easy-crop';
import { getCroppedImg } from './cropImage';
import {
  FileCheck, Upload, RefreshCw, Trash2, AlertCircle, CheckCircle2,
  ZoomIn, RotateCw, Info, ShieldCheck, Image as ImageIcon,
} from 'lucide-react';
import { API_BASE } from '../../../constants';
import { getAccessToken } from '../../../services/api';
import { Button, PageHeader, Badge, LoadingSpinner, Modal } from '../../ui';

interface SignatureData {
  signatureUrl: string | null;
  signatureUploadedAt: string | null;
  signatureUpdatedAt: string | null;
}

interface TeacherSignatureProps {
  onShowToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const TeacherSignature: React.FC<TeacherSignatureProps> = ({ onShowToast }) => {
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [signatureData, setSignatureData] = useState<SignatureData>({
    signatureUrl: null,
    signatureUploadedAt: null,
    signatureUpdatedAt: null,
  });

  // Modal & Cropping states
  const [showCropModal, setShowCropModal] = useState(false);
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetchSignature();
  }, []);

  const fetchSignature = async () => {
    setLoading(true);
    setImgError(false);
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/teachers/signature`, { headers });
      const data = await res.json();
      if (data.success && data.data) {
        setSignatureData(data.data);
      } else {
        setSignatureData({ signatureUrl: null, signatureUploadedAt: null, signatureUpdatedAt: null });
      }
    } catch (err: any) {
      console.error('Failed to fetch teacher signature:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      onShowToast('File size exceeds the 5 MB limit. Please choose a smaller image.', 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      onShowToast('Unsupported file format. Allowed formats: PNG, JPG, JPEG, WEBP.', 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setRawImageSrc(event.target.result as string);
        setCrop({ x: 0, y: 0 });
        setZoom(1);
        setRotation(0);
        setCroppedAreaPixels(null);
        setShowCropModal(true);
      }
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConfirmUpload = async () => {
    if (!rawImageSrc || !croppedAreaPixels) return;

    setUploading(true);
    try {
      const croppedBase64 = await getCroppedImg(rawImageSrc, croppedAreaPixels, rotation);
      if (!croppedBase64) {
        throw new Error('Failed to generate crop preview.');
      }

      const token = getAccessToken();
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/teachers/signature`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ signatureImage: croppedBase64 }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to upload signature.');
      }

      setSignatureData(data.data);
      setImgError(false);
      setShowCropModal(false);
      onShowToast('Signature processed and saved successfully!', 'success');
    } catch (err: any) {
      onShowToast(err.message || 'Error processing signature', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteSignature = async () => {
    if (!window.confirm('Are you sure you want to delete your stored signature?')) return;

    setDeleting(true);
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/teachers/signature`, {
        method: 'DELETE',
        headers,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to delete signature.');
      }

      setSignatureData({ signatureUrl: null, signatureUploadedAt: null, signatureUpdatedAt: null });
      onShowToast('Signature deleted successfully.', 'info');
    } catch (err: any) {
      onShowToast(err.message || 'Failed to delete signature.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="flex flex-col gap-5 font-sans text-slate-900">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/png, image/jpeg, image/jpg, image/webp"
        onChange={handleFileChange}
      />

      <PageHeader
        title="Digital Signature Management"
        subtitle="Manage your signature for automatic report card integration & official document generation."
        actions={
          <Badge variant="blue">
            <ShieldCheck size={14} /> Secure S3 Storage
          </Badge>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5">
        {/* Main Signature Preview Card */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-card p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-md font-bold text-slate-900 m-0">Current Signature</h3>
            <Badge variant={signatureData.signatureUrl ? 'green' : 'amber'}>
              {signatureData.signatureUrl ? <><CheckCircle2 size={14} /> Signature Uploaded</> : <><AlertCircle size={14} /> No Signature Uploaded</>}
            </Badge>
          </div>

          <div className="min-h-[160px] bg-slate-50 border border-dashed border-slate-200 rounded-lg flex items-center justify-center p-4">
            {loading ? (
              <LoadingSpinner fullPage />
            ) : signatureData.signatureUrl && !imgError ? (
              <div className="p-3 bg-white border border-slate-200 rounded-md shadow-sm flex items-center justify-center max-w-full overflow-hidden min-w-[200px] min-h-[90px]">
                <img
                  src={signatureData.signatureUrl}
                  alt="Teacher Digital Signature"
                  className="max-h-24 max-w-full object-contain"
                  onError={() => setImgError(true)}
                />
              </div>
            ) : imgError ? (
              <div className="flex flex-col items-center gap-1.5 py-4 text-center px-4">
                <AlertCircle size={32} className="text-amber-500 mb-1" />
                <p className="font-semibold text-slate-700 m-0 text-sm">Unable to load signature image</p>
                <span className="text-xs text-slate-500 mb-2">The signature link may have expired or is unreachable.</span>
                <Button size="sm" variant="secondary" onClick={() => { setImgError(false); fetchSignature(); }}>
                  <RefreshCw size={13} className="mr-1" /> Reload Signature
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5 py-8 text-center px-4">
                <ImageIcon size={40} className="text-slate-300 mb-1" />
                <p className="font-semibold text-slate-600 m-0">No signature uploaded yet</p>
                <span className="text-xs text-slate-400">Upload your signature to automatically embed it in progress cards.</span>
              </div>
            )}
          </div>

          {signatureData.signatureUrl && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-md px-3 py-2">
                <span className="block text-2xs font-bold uppercase tracking-wide text-slate-400">Uploaded On</span>
                <span className="text-sm font-semibold text-slate-800">{formatDate(signatureData.signatureUploadedAt)}</span>
              </div>
              <div className="bg-slate-50 rounded-md px-3 py-2">
                <span className="block text-2xs font-bold uppercase tracking-wide text-slate-400">Last Updated</span>
                <span className="text-sm font-semibold text-slate-800">{formatDate(signatureData.signatureUpdatedAt)}</span>
              </div>
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            {!signatureData.signatureUrl ? (
              <Button onClick={() => fileInputRef.current?.click()} disabled={loading}>
                <Upload size={15} /> Upload Signature
              </Button>
            ) : (
              <>
                <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={loading || uploading}>
                  <RefreshCw size={15} /> Replace Signature
                </Button>
                <Button variant="danger" onClick={handleDeleteSignature} disabled={deleting}>
                  {deleting ? <RefreshCw size={15} className="animate-spin" /> : <Trash2 size={15} />}
                  Delete
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Upload Guidelines Panel */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-card p-5">
          <div className="flex items-center gap-2 mb-3.5">
            <Info size={18} className="text-blue" />
            <h3 className="text-md font-bold text-slate-900 m-0">Upload Guidelines</h3>
          </div>

          <ul className="flex flex-col gap-2.5 list-none p-0 m-0">
            {[
              <>Use <strong>black or blue ink</strong> on plain white paper for best clarity.</>,
              <>Capture a well-lit photo avoiding shadows and glare.</>,
              <>Supported formats: <strong>PNG, JPG, JPEG, WEBP</strong> (Max 5 MB).</>,
              <>Our background removal engine automatically makes white paper <strong>transparent</strong>.</>,
              <>The system will automatically crop and scale your signature to 220&times;80 px.</>,
            ].map((text, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-600 leading-relaxed">
                <FileCheck size={15} className="text-green flex-shrink-0 mt-0.5" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* CROP & EDIT MODAL */}
      <Modal
        isOpen={showCropModal}
        onClose={() => setShowCropModal(false)}
        title="Crop & Adjust Signature"
        maxWidth="520px"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setShowCropModal(false)} disabled={uploading}>Cancel</Button>
            <Button onClick={handleConfirmUpload} disabled={uploading} loading={uploading}>
              <Upload size={15} /> {uploading ? 'Processing...' : 'Confirm & Upload'}
            </Button>
          </div>
        }
      >
        <p className="text-xs text-slate-500 mb-3">
          Adjust zoom and rotation to ensure signature is centered and clearly legible.
        </p>

        <div className="relative overflow-hidden rounded-md bg-slate-100" style={{ height: 260 }}>
          {rawImageSrc && (
            <Cropper
              image={rawImageSrc}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={220 / 80}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={(_, croppedAreaPixels) => setCroppedAreaPixels(croppedAreaPixels)}
            />
          )}
        </div>

        <div className="flex flex-col gap-3 mt-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600 flex items-center gap-1">
              <ZoomIn size={14} /> Zoom Level: {zoom.toFixed(1)}x
            </label>
            <input type="range" min="1" max="3" step="0.1" value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} className="accent-blue" />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600 flex items-center gap-1">
              <RotateCw size={14} /> Rotation: {rotation}&deg;
            </label>
            <input type="range" min="-180" max="180" step="1" value={rotation} onChange={(e) => setRotation(parseInt(e.target.value))} className="accent-blue" />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default TeacherSignature;
