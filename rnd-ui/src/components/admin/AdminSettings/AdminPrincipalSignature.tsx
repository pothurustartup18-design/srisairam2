import React, { useState, useEffect, useRef } from 'react';
import Cropper from 'react-easy-crop';
import { getCroppedImg } from '../../teacher/TeacherSignature/cropImage';
import {
  FileCheck,
  Upload,
  RefreshCw,
  Trash2,
  AlertCircle,
  CheckCircle2,
  ZoomIn,
  RotateCw,
  X,
  Info,
  ShieldCheck,
  Image as ImageIcon,
  UserCheck
} from 'lucide-react';
import { API_BASE } from '../../../constants';
import { getAccessToken } from '../../../services/api';


interface PrincipalData {
  principalName: string;
  signatureUrl: string | null;
  signatureUploadedAt: string | null;
  signatureUpdatedAt: string | null;
}

interface AdminPrincipalSignatureProps {
  onShowToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const AdminPrincipalSignature: React.FC<AdminPrincipalSignatureProps> = ({ onShowToast }) => {
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [principalName, setPrincipalName] = useState('Dr. Principal Name');
  const [signatureData, setSignatureData] = useState<PrincipalData>({
    principalName: 'Dr. Principal Name',
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
    fetchPrincipalSignature();
  }, []);

  const fetchPrincipalSignature = async () => {
    setLoading(true);
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/school-profile/principal-signature`, { headers });
      const data = await res.json();
      if (data.success && data.data) {
        setSignatureData(data.data);
        if (data.data.principalName) setPrincipalName(data.data.principalName);
      }
    } catch (err: any) {
      console.error('Failed to fetch principal signature:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      onShowToast('File size exceeds the 5 MB limit.', 'error');
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

  // Live Canvas Render removed (react-easy-crop handles rendering in the DOM)

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

      const res = await fetch(`${API_BASE}/school-profile/principal-signature`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          signatureImage: croppedBase64,
          principalName: principalName.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to upload Principal signature.');
      }

      setSignatureData(data.data);
      setShowCropModal(false);
      onShowToast("Principal's signature processed and saved successfully!", 'success');
    } catch (err: any) {
      onShowToast(err.message || 'Error processing Principal signature', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteSignature = async () => {
    if (!window.confirm('Are you sure you want to delete the Principal signature?')) return;

    setDeleting(true);
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/school-profile/principal-signature`, {
        method: 'DELETE',
        headers,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to delete Principal signature.');
      }

      setSignatureData({ principalName, signatureUrl: null, signatureUploadedAt: null, signatureUpdatedAt: null });
      onShowToast('Principal signature deleted.', 'info');
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
    <div className="max-w-3xl flex flex-col gap-5 font-sans">
      <input type="file" ref={fileInputRef} style={{ display: 'none' }}
        accept="image/png, image/jpeg, image/jpg, image/webp" onChange={handleFileChange} />

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-extrabold text-slate-900 dark:text-white tracking-tight">
            Principal Signature Management
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Upload and manage the official Principal signature displayed on student progress cards and certificates.
          </p>
        </div>
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 text-xs font-bold flex-shrink-0">
          <ShieldCheck size={13} /> Admin Master Access
        </span>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Signature card — 2/3 width */}
        <div className="md:col-span-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
          {/* Card header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <ImageIcon size={14} className="text-slate-500 dark:text-slate-400" />
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Principal Signature</span>
            </div>
            <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
              signatureData.signatureUrl
                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
            }`}>
              {signatureData.signatureUrl
                ? <><CheckCircle2 size={10} /> Signature Active</>
                : <><AlertCircle size={10} /> No Signature Set</>}
            </span>
          </div>

          <div className="p-5 flex flex-col gap-4">
            {/* Principal name input */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <UserCheck size={12} className="text-indigo-600 dark:text-indigo-400" /> Principal Name
              </label>
              <input
                type="text"
                className="h-10 px-3 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white bg-white dark:bg-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 dark:focus:ring-blue-900 transition-all font-[inherit] w-full placeholder:text-slate-300"
                value={principalName}
                onChange={(e) => setPrincipalName(e.target.value)}
                placeholder="e.g. Dr. Principal Name"
              />
            </div>

            {/* Signature viewport */}
            <div className="min-h-[120px] flex items-center justify-center bg-slate-50 dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-600 rounded-xl">
              {loading ? (
                <div className="flex flex-col items-center gap-2 py-8 text-slate-400">
                  <RefreshCw size={20} className="animate-spin" />
                  <span className="text-xs">Loading signature...</span>
                </div>
              ) : signatureData.signatureUrl ? (
                <div className="p-4">
                  <img src={signatureData.signatureUrl} alt="Principal Digital Signature"
                    className="max-h-24 max-w-full object-contain" />
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 py-8 text-slate-400 dark:text-slate-500">
                  <ImageIcon size={32} />
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No Signature Uploaded</p>
                  <span className="text-xs text-slate-400">Click upload below to select and process the signature.</span>
                </div>
              )}
            </div>

            {/* Timestamps */}
            {signatureData.signatureUrl && (
              <div className="flex gap-6 px-4 py-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-700">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Uploaded On</span>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{formatDate(signatureData.signatureUploadedAt)}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Last Updated</span>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{formatDate(signatureData.signatureUpdatedAt)}</span>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-3">
              {!signatureData.signatureUrl ? (
                <button
                  className="flex items-center gap-2 h-10 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 shadow-sm"
                  onClick={() => fileInputRef.current?.click()} disabled={loading}
                >
                  <Upload size={14} /> Upload Principal Signature
                </button>
              ) : (
                <>
                  <button
                    className="flex items-center gap-2 h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm font-semibold transition-colors disabled:opacity-50"
                    onClick={() => fileInputRef.current?.click()} disabled={loading || uploading}
                  >
                    <RefreshCw size={13} /> Replace Signature
                  </button>
                  <button
                    className="flex items-center gap-2 h-9 px-4 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 text-sm font-semibold transition-colors disabled:opacity-50"
                    onClick={handleDeleteSignature} disabled={deleting}
                  >
                    {deleting ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Info card — 1/3 width */}
        <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-800 rounded-xl p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Info size={14} className="text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
            <h3 className="text-sm font-bold text-indigo-800 dark:text-indigo-300 m-0">Processing Information</h3>
          </div>
          <ul className="flex flex-col gap-3 m-0 p-0 list-none">
            <li className="flex items-start gap-2.5">
              <FileCheck size={14} className="text-emerald-500 mt-0.5 flex-shrink-0" />
              <span className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">Automatically removes white backgrounds and extracts pure dark ink pixels.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <FileCheck size={14} className="text-emerald-500 mt-0.5 flex-shrink-0" />
              <span className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">Trims empty borders and resizes to <strong>220×80 px</strong> transparent PNG.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <FileCheck size={14} className="text-emerald-500 mt-0.5 flex-shrink-0" />
              <span className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">Directly embeds into generated student Progress Cards alongside Class Teacher signatures.</span>
            </li>
          </ul>
        </div>
      </div>

      {showCropModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 m-0">Adjust Principal Signature</h3>
              <button
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                onClick={() => setShowCropModal(false)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Crop canvas */}
            <div className="relative overflow-hidden" style={{ height: 260 }}>
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

            {/* Controls */}
            <div className="flex flex-col gap-4 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                  <ZoomIn className="w-3.5 h-3.5" /> Zoom Level: {zoom.toFixed(1)}x
                </label>
                <input type="range" min="1" max="3" step="0.1" value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="w-full accent-blue-600" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                  <RotateCw className="w-3.5 h-3.5" /> Rotation: {rotation}°
                </label>
                <input type="range" min="-180" max="180" step="1" value={rotation} onChange={(e) => setRotation(parseInt(e.target.value))}
                  className="w-full accent-blue-600" />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-5 py-3.5 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
              <button
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                onClick={() => setShowCropModal(false)}
                disabled={uploading}
              >
                Cancel
              </button>
              <button
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                onClick={handleConfirmUpload}
                disabled={uploading}
              >
                {uploading ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /> Processing...</>
                ) : (
                  <><Upload className="w-4 h-4" /> Save Signature</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPrincipalSignature;
