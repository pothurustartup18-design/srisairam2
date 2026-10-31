import React, { useState, useEffect } from 'react';
import { ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';
import { API_BASE, formatClassName } from '../../../constants';

interface ReportCardVerification {
  examName: string;
  studentName: string;
  admissionNo: string;
  class: string;
  section: string;
  classTeacherName: string;
  totalObtained: number;
  totalPossible: number;
  percentage: number;
  verifiedAt: string;
}

const VerifyReportCard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'VERIFIED' | 'INVALID'>('INVALID');
  const [reason, setReason] = useState('');
  const [reportCard, setReportCard] = useState<ReportCardVerification | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('report_verify_token');

    if (!token) {
      setStatus('INVALID');
      setReason('Verification token is missing in the URL.');
      setLoading(false);
      return;
    }

    const verifyToken = async () => {
      try {
        const res = await fetch(`${API_BASE}/report-card/verify?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (data.success && data.status === 'VERIFIED') {
          setStatus('VERIFIED');
          setReportCard(data.reportCard);
        } else {
          setStatus('INVALID');
          setReason(data.reason || 'Verification failed. The token signature is invalid or has expired.');
        }
      } catch {
        setStatus('INVALID');
        setReason('Unable to establish connection with ERP verification servers. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    verifyToken();
  }, []);

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      fontFamily: 'Inter, system-ui, sans-serif',
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        width: '100%',
        maxWidth: '480px',
        borderRadius: '16px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
        border: '1px solid #e2e8f0',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{
          backgroundColor: '#1e3a8a',
          padding: '24px',
          color: '#ffffff',
          textAlign: 'center',
          position: 'relative'
        }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, letterSpacing: '-0.02em' }}>RND ERP School</h2>
          <span style={{ fontSize: '12px', color: '#93c5fd', fontWeight: 600 }}>Official Document Verification</span>
        </div>

        <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column' }}>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0', gap: '16px' }}>
              <Loader2 className="animate-spin" style={{ color: '#1e3a8a', width: '36px', height: '36px' }} />
              <span style={{ color: '#475569', fontSize: '14px', fontWeight: 600 }}>Verifying Cryptographic Signature...</span>
            </div>
          ) : status === 'VERIFIED' && reportCard ? (
            <div>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                backgroundColor: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '24px',
                textAlign: 'center'
              }}>
                <ShieldCheck style={{ color: '#16a34a', width: '48px', height: '48px', marginBottom: '8px' }} />
                <h3 style={{ margin: 0, color: '#14532d', fontSize: '18px', fontWeight: 800 }}>Report Card Verified</h3>
                <span style={{ fontSize: '12px', color: '#166534', fontWeight: 600, marginTop: '2px' }}>Verified by School ERP</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                  <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>Examination</span>
                  <span style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>{reportCard.examName}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                  <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>Student Name</span>
                  <span style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>{reportCard.studentName}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                  <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>Admission Number</span>
                  <span style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>{reportCard.admissionNo}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                  <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>Class &amp; Section</span>
                  <span style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>{formatClassName(reportCard.class, reportCard.section)}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                  <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>Class Teacher</span>
                  <span style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>{reportCard.classTeacherName}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                  <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>Total Marks</span>
                  <span style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>{reportCard.totalObtained} / {reportCard.totalPossible}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '4px' }}>
                  <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>Percentage</span>
                  <span style={{ fontSize: '15px', color: '#16a34a', fontWeight: 800 }}>{reportCard.percentage.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '12px',
                padding: '24px',
                marginBottom: '20px'
              }}>
                <ShieldAlert style={{ color: '#dc2626', width: '48px', height: '48px', marginBottom: '8px' }} />
                <h3 style={{ margin: 0, color: '#7f1d1d', fontSize: '18px', fontWeight: 800 }}>Invalid Report Card</h3>
                <span style={{ fontSize: '12px', color: '#991b1b', fontWeight: 600, marginTop: '2px' }}>ERP Verification Failed</span>
              </div>

              <div style={{ textAlign: 'left', padding: '16px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '16px' }}>
                <span style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Possible Reasons:</span>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {reason && <li style={{ color: '#dc2626', fontWeight: 600 }}>{reason}</li>}
                  <li>The report card PDF data has been modified or tampered with</li>
                  <li>The cryptographic verification signature is invalid or forged</li>
                  <li>The exam or student record could not be found in the ERP database</li>
                </ul>
              </div>

              <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                * ERP database holds the single source of truth. PDF files are copies only.
              </p>
            </div>
          )}

          <div style={{
            marginTop: '32px',
            borderTop: '1px solid #e2e8f0',
            paddingTop: '16px',
            textAlign: 'center'
          }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block' }}>Powered by RND School ERP System</span>
            <span style={{ fontSize: '10px', color: '#cbd5e1', display: 'block', marginTop: '2px' }}>Secure QR Verification Protocol v1.0 (HS256)</span>
          </div>

        </div>
      </div>
    </div>
  );
};

export default VerifyReportCard;
