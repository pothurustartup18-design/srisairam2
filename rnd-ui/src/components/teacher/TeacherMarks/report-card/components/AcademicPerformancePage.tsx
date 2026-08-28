import React from 'react';
import { Header } from './Header';
import { SubjectTable } from './SubjectTable';
import { AcademicSummary } from './AcademicSummary';
import { AttendanceSummary } from './AttendanceSummary';
import { TeacherRemarks } from './TeacherRemarks';
import { SignatureSection } from './SignatureSection';
import { Footer } from './Footer';
import type { ReportCardViewModel, StudentReportEntry } from '../models/ReportCardViewModel';

interface AcademicPerformancePageProps {
  viewModel: ReportCardViewModel;
  entry: StudentReportEntry;
  unsavedRemarks?: string;
}

export const AcademicPerformancePage: React.FC<AcademicPerformancePageProps> = ({
  viewModel,
  entry,
  unsavedRemarks,
}) => {
  const remarksText = unsavedRemarks !== undefined ? unsavedRemarks : entry.teacherRemarks;

  return (
    <div className="report-card-page performance-page">
      {/* Compact header for page 2 */}
      <Header
        school={viewModel.school}
        examName={viewModel.exam.examName}
        showSchoolLogo={true}
        compact={true}
      />

      {/* Student metadata strip */}
      <div className="page2-student-meta-strip">
        <div className="page2-meta-item">
          <span className="page2-meta-label">Student Name:</span>{' '}
          <span className="page2-meta-value">{entry.name}</span>
        </div>
        <div className="page2-meta-item">
          <span className="page2-meta-label">Class & Section:</span>{' '}
          <span className="page2-meta-value">
            {entry.class} {entry.section ? `- ${entry.section}` : ''}
          </span>
        </div>
        <div className="page2-meta-item">
          <span className="page2-meta-label">Admission No:</span>{' '}
          <span className="page2-meta-value">{entry.admissionNo}</span>
        </div>
      </div>

      {/* Main Grid: Subject Table on Left, Summaries on Right */}
      <div className="page2-main-grid">
        <div className="grid-left">
          <SubjectTable entry={entry} gradeBands={viewModel.exam.gradeBands} />
        </div>

        <div className="grid-right">
          <AcademicSummary entry={entry} examType={viewModel.exam.examType} />
        </div>
      </div>

      {/* Attendance section in between academics and remarks */}
      <AttendanceSummary attendance={entry.attendance} />

      {/* Bottom Remarks & Signatures */}
      <TeacherRemarks remarks={remarksText} />

      <SignatureSection
        classTeacherName={viewModel.classTeacher.name}
        teacherSignatureDataUri={viewModel.classTeacher.signatureDataUri}
        principalName={viewModel.school.principal.name}
        principalSignatureDataUri={viewModel.school.principal.signatureDataUri}
      />

      {/* Footer */}
      <Footer
        documentId={entry.documentId}
        website={viewModel.school.website}
        pageNumber={2}
        totalPages={viewModel.exam.examType === 'final' ? 3 : 2}
      />
    </div>
  );
};
export default AcademicPerformancePage;
