import React from 'react';
import { User, BookOpen, Fingerprint, UserCheck, PhoneCall, Globe } from 'lucide-react';
import { Header } from './Header';
import { Footer } from './Footer';
import type { ReportCardViewModel, StudentReportEntry } from '../models/ReportCardViewModel';

interface StudentCoverPageProps {
  viewModel: ReportCardViewModel;
  entry: StudentReportEntry;
  qrDataUri: string | null;
}

export const StudentCoverPage: React.FC<StudentCoverPageProps> = ({
  viewModel,
  entry,
  qrDataUri,
}) => {
  const hasPhoto = !!entry.photoDataUri;
  const showSchoolLogoInHeader = hasPhoto;

  return (
    <div className="report-card-page cover-page">
      {/* Header section with conditional logo */}
      <Header
        school={viewModel.school}
        examName={viewModel.exam.examName}
        showSchoolLogo={showSchoolLogoInHeader}
        compact={false}
      />

      {/* Progress Report Banner */}
      <div className="cover-banner">PROGRESS REPORT</div>

      {/* Circular Avatar area */}
      <div className="cover-avatar-container">
        <div className="cover-avatar-outer-ring">
          <div className="cover-avatar-inner-ring">
            {hasPhoto ? (
              <img
                className="cover-student-photo"
                src={entry.photoDataUri!}
                alt={`${entry.name} photo`}
              />
            ) : viewModel.school.logoDataUri ? (
              <img
                className="cover-student-photo"
                src={viewModel.school.logoDataUri}
                alt="School logo placeholder"
                style={{ objectFit: 'contain', padding: '16px' }}
              />
            ) : (
              // Silhouette fallback if both photo and logo are unavailable
              <div className="cover-fallback-logo" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="#1E3A8A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Student Details Card */}
      <div className="cover-info-card">
        <div className="cover-info-row">
          <div className="cover-info-icon-wrapper">
            <User size={18} />
          </div>
          <span className="cover-info-label">Student Name</span>
          <span className="cover-info-value">{entry.name}</span>
        </div>

        <div className="cover-info-row">
          <div className="cover-info-icon-wrapper">
            <BookOpen size={18} />
          </div>
          <span className="cover-info-label">Class & Section</span>
          <span className="cover-info-value">
            {entry.class} {entry.section ? `- ${entry.section}` : ''}
          </span>
        </div>

        <div className="cover-info-row">
          <div className="cover-info-icon-wrapper">
            <Fingerprint size={18} />
          </div>
          <span className="cover-info-label">Admission No.</span>
          <span className="cover-info-value">{entry.admissionNo}</span>
        </div>

        <div className="cover-info-row">
          <div className="cover-info-icon-wrapper">
            <UserCheck size={18} />
          </div>
          <span className="cover-info-label">Class Teacher</span>
          <span className="cover-info-value">{viewModel.classTeacher.name}</span>
        </div>

        <div className="cover-info-row">
          <div className="cover-info-icon-wrapper">
            <PhoneCall size={18} />
          </div>
          <span className="cover-info-label">Phone Number</span>
          <span className="cover-info-value">{entry.mobileNumber || '-'}</span>
        </div>
      </div>

      {/* Page 1 Footer */}
      <div className="cover-footer">
        <div className="cover-footer-left">
          <div className="cover-footer-text-title">Academic Session</div>
          <div className="cover-footer-text-value">{viewModel.school.academicYear}</div>
          {viewModel.school.website && (
            <>
              <div className="cover-footer-text-title" style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Globe size={11} /> School Website
              </div>
              <div className="cover-footer-text-value" style={{ fontSize: 13 }}>
                {viewModel.school.website}
              </div>
            </>
          )}
        </div>
        <div className="cover-footer-right">
          {qrDataUri ? (
            <div className="cover-qr-box">
              <img
                src={qrDataUri}
                alt="Verification QR Code"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
          ) : (
            <div className="cover-qr-box" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 8, color: '#94A3B8', textAlign: 'center' }}>No QR</span>
            </div>
          )}
          <div className="cover-qr-label">ONLINE VERIFICATION</div>
        </div>
        <div className="cover-footer-decor"></div>
      </div>
    </div>
  );
};
