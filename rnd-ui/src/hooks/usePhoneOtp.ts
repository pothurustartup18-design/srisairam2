import { useEffect, useState } from 'react';
import { API_BASE } from '../constants';
import { getAccessToken } from '../services/api';

// The hook always calls this with both arguments, so declare `type` as required —
// that's what makes both call sites' showToast shapes (required- and optional-`type`)
// assignable here, rather than only the optional one.
type ToastFn = (message: string, type: 'success' | 'error') => void;

interface UsePhoneOtpOptions {
  /** Live phone number field this OTP flow is verifying. */
  phone: string;
  showToast?: ToastFn;
  /**
   * When to snapshot `verifiedPhoneNum` — AdminSettings snapshots on a successful
   * send (verify always targets the number OTP was sent to); AdminTeachers
   * snapshots on a successful verify (re-reads the live field at send/verify time).
   * Default: 'verify'.
   */
  verifiedNumberSnapshotAt?: 'send' | 'verify';
  /** AdminTeachers exposes the sandbox OTP code as separate state; AdminSettings surfaces it via toast only. Default: true. */
  /** AdminSettings additionally requires `res.ok`; AdminTeachers checks `data.success` only. Default: false. */
  requireResOk?: boolean;
  /** Auto-clear verification state once the phone field is emptied. Default: true. */
  autoResetOnEmptyPhone?: boolean;
}

export function usePhoneOtp({
  phone,
  showToast,
  verifiedNumberSnapshotAt = 'verify',
  requireResOk = false,
  autoResetOnEmptyPhone = true,
}: UsePhoneOtpOptions) {
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneOtpCode, setPhoneOtpCode] = useState('');
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [verifiedPhoneNum, setVerifiedPhoneNum] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  useEffect(() => {
    if (autoResetOnEmptyPhone && !phone) {
      setPhoneVerified(false);
      setPhoneOtpSent(false);
      setPhoneOtpCode('');
      setVerifiedPhoneNum('');
    }
  }, [phone, autoResetOnEmptyPhone]);

  const authHeaders = (): HeadersInit => {
    const token = getAccessToken();
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  };

  const handleSendPhoneOtp = async () => {
    const rawPhone = (phone || '').trim();
    if (!rawPhone) {
      showToast?.('Please enter a phone number first.', 'error');
      return;
    }
    const cleanPhone = rawPhone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      showToast?.('WhatsApp number must be exactly 10 digits.', 'error');
      return;
    }
    setSendingOtp(true);
    try {
      const res = await fetch(`${API_BASE}/settings/verify-phone/send`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ phone: rawPhone }),
      });
      const data = await res.json();
      const ok = requireResOk ? res.ok && data.success : data.success;
      if (ok) {
        setPhoneOtpSent(true);
        setPhoneVerified(false);
        setPhoneOtpCode('');
        if (verifiedNumberSnapshotAt === 'send') setVerifiedPhoneNum(rawPhone);
        showToast?.(data.message || 'OTP sent to WhatsApp.', 'success');
      } else {
        showToast?.(data.message || 'Failed to send OTP.', 'error');
      }
    } catch {
      showToast?.('Error sending OTP. Check connection.', 'error');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyPhoneOtp = async () => {
    if (phoneOtpCode.length < 6) return;
    setVerifyingOtp(true);
    try {
      const targetPhone = verifiedNumberSnapshotAt === 'send' ? verifiedPhoneNum : (phone || '').trim();
      const res = await fetch(`${API_BASE}/settings/verify-phone/confirm`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ phone: targetPhone, otp: phoneOtpCode }),
      });
      const data = await res.json();
      const ok = requireResOk ? res.ok && data.success : data.success;
      if (ok) {
        setPhoneVerified(true);
        if (verifiedNumberSnapshotAt === 'verify') setVerifiedPhoneNum(targetPhone);
        showToast?.('Phone number verified successfully!', 'success');
      } else {
        showToast?.(data.message || 'Invalid OTP. Please try again.', 'error');
      }
    } catch {
      showToast?.('Error verifying OTP.', 'error');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const resetOtpState = () => {
    setPhoneOtpSent(false);
    setPhoneOtpCode('');
    setPhoneVerified(false);
    setVerifiedPhoneNum('');
  };

  return {
    phoneOtpSent,
    phoneOtpCode,
    setPhoneOtpCode,
    phoneVerified,
    verifiedPhoneNum,
    sendingOtp,
    verifyingOtp,
    handleSendPhoneOtp,
    handleVerifyPhoneOtp,
    resetOtpState,
  };
}
