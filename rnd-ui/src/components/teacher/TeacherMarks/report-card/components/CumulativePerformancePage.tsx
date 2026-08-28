import React from 'react';
import { Header } from './Header';
import { Footer } from './Footer';
import { SignatureSection } from './SignatureSection';
import type { ReportCardViewModel, StudentReportEntry } from '../models/ReportCardViewModel';

interface CumulativePerformancePageProps {
  viewModel: ReportCardViewModel;
  entry: StudentReportEntry;
}

/**
 * Page 3 Component (Final Exam Only):
 * Displays a student's consolidated multi-exam results, visual percentage bars,
 * and academic promotion status callouts.
 */
export const CumulativePerformancePage: React.FC<CumulativePerformancePageProps> = ({
  viewModel,
  entry,
}) => {
  // Combine past exams with the current final exam
  const allExams = [
    ...(entry.otherExams || []),
    {
      examName: viewModel.exam.examName,
      overallPercentage: entry.overallPercentage,
      overallGrade: entry.overallGrade,
      result: entry.result,
    },
  ];

  const promotionText = entry.promotion.status === 'promoted'
    ? `Promoted to ${entry.promotion.nextClass || 'Next Grade'}`
    : entry.promotion.status === 'retained'
    ? 'Retained in Current Grade'
    : 'Pending / Unknown';

  return (
    <div className="report-card-page performance-page">
      {/* Page Header */}
      <Header
        school={viewModel.school}
        examName="Cumulative Academic Report"
        showSchoolLogo={true}
        compact={true}
      />

      {/* Student Meta Details Strip */}
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

      <div style={{ marginTop: '20px', flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Table comparison of all exams */}
        <div className="rc-card" style={{ padding: '20px' }}>
          <h3 className="rc-card-title" style={{ marginBottom: '14px' }}>Consolidated Examination Summary</h3>
          <table className="rc-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#334155' }}>Exam Term</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#334155' }}>Percentage</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#334155' }}>Grade</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#334155' }}>Result</th>
              </tr>
            </thead>
            <tbody>
              {allExams.map((ex, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0F172A' }}>{ex.examName}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#1e3a8a' }}>
                    {ex.result === 'ABSENT' ? 'N/A' : `${ex.overallPercentage}%`}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>
                    {ex.result === 'ABSENT' ? 'N/A' : ex.overallGrade}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor: ex.result === 'PASS' ? '#dcfce7' : ex.result === 'FAIL' ? '#fee2e2' : '#f1f5f9',
                        color: ex.result === 'PASS' ? '#166534' : ex.result === 'FAIL' ? '#991b1b' : '#475569',
                      }}
                    >
                      {ex.result}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Dynamic Progress Bars */}
        <div className="rc-card" style={{ padding: '20px' }}>
          <h3 className="rc-card-title" style={{ marginBottom: '16px' }}>Academic Progress Visualizer</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {allExams.map((ex, idx) => {
              const pct = ex.result === 'ABSENT' ? 0 : ex.overallPercentage;
              return (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: '120px', fontWeight: 600, fontSize: '12px', color: '#475569' }}>{ex.examName}</div>
                  <div style={{ flex: 1, height: '14px', backgroundColor: '#e2e8f0', borderRadius: '7px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: 'linear-gradient(90deg, #3b82f6 0%, #1e3a8a 100%)',
                        borderRadius: '7px',
                        transition: 'width 0.5s ease',
                      }}
                    />
                  </div>
                  <div style={{ width: '45px', fontWeight: 700, fontSize: '12px', color: '#1e3a8a', textAlign: 'right' }}>
                    {ex.result === 'ABSENT' ? 'N/A' : `${pct}%`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Gold Promotion Callout */}
        <div
          style={{
            background: 'linear-gradient(135deg, #fef9c3 0%, #fef3c7 100%)',
            border: '2px dashed #f59e0b',
            borderRadius: '12px',
            padding: '20px',
            textAlign: 'center',
            boxShadow: '0 4px 6px -1px rgba(245, 158, 11, 0.05)',
            marginTop: 'auto',
          }}
        >
          <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#b45309', letterSpacing: '0.05em' }}>
            Academic Promotion Status
          </span>
          <h2 style={{ margin: '4px 0 0 0', color: '#78350f', fontWeight: 800, fontSize: '22px' }}>
            {promotionText}
          </h2>
        </div>
      </div>

      {/* Signature Row */}
      <div style={{ marginTop: '24px' }}>
        <SignatureSection
          classTeacherName={viewModel.classTeacher.name}
          teacherSignatureDataUri={viewModel.classTeacher.signatureDataUri}
          principalName={viewModel.school.principal.name}
          principalSignatureDataUri={viewModel.school.principal.signatureDataUri}
        />
      </div>

      {/* Page Footer */}
      {/* This page only renders for 'final' exams, so it is always page 3 of 3. */}
      <Footer
        documentId={entry.documentId}
        website={viewModel.school.website}
        pageNumber={3}
        totalPages={3}
      />
    </div>
  );
};

export default CumulativePerformancePage;
