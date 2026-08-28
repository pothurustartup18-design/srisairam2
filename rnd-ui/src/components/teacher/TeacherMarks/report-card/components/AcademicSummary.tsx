import React from 'react';
import type { StudentReportEntry } from '../models/ReportCardViewModel';

interface AcademicSummaryProps {
  entry: StudentReportEntry;
  examType?: 'final' | 'middle' | 'regular';
}

export const AcademicSummary: React.FC<AcademicSummaryProps> = ({ entry, examType }) => {
  const gradedSubjects = entry.marks.filter((m) => m.obtainedMarks !== null);
  const gradedCount = gradedSubjects.length;

  // Calculate dynamic stats
  const averageObtained =
    gradedCount > 0
      ? gradedSubjects.reduce((sum, m) => sum + (m.obtainedMarks || 0), 0) / gradedCount
      : 0;

  const averagePossible =
    gradedCount > 0
      ? gradedSubjects.reduce((sum, m) => sum + m.totalMarks, 0) / gradedCount
      : 0;

  const highestMarks =
    gradedCount > 0 ? Math.max(...gradedSubjects.map((m) => m.obtainedMarks || 0)) : 0;

  const lowestMarks =
    gradedCount > 0
      ? Math.min(...gradedSubjects.map((m) => (m.obtainedMarks !== null ? m.obtainedMarks : Infinity)))
      : 0;

  const isAbsent = entry.result === 'ABSENT';

  // Format promotion status nicely
  let promotionText = 'N/A';
  if (entry.promotion.status === 'promoted') {
    promotionText = `Promoted to ${entry.promotion.nextClass || 'Next Grade'}`;
  } else if (entry.promotion.status === 'retained') {
    promotionText = 'Retained in Current Grade';
  } else if (entry.promotion.status === 'unknown') {
    promotionText = 'Unknown / Pending';
  }

  return (
    <div className="rc-card">
      <h3 className="rc-card-title">Academic Summary</h3>
      <div className="summary-grid">
        <div className="summary-item">
          <span className="summary-label">Average Marks</span>
          <span className="summary-value">
            {isAbsent ? 'N/A' : `${averageObtained.toFixed(2)} / ${averagePossible.toFixed(0)}`}
          </span>
        </div>

        <div className="summary-item">
          <span className="summary-label">Highest Marks</span>
          <span className="summary-value">{isAbsent ? 'N/A' : highestMarks}</span>
        </div>

        <div className="summary-item">
          <span className="summary-label">Lowest Marks</span>
          <span className="summary-value">{isAbsent ? 'N/A' : lowestMarks === Infinity ? 0 : lowestMarks}</span>
        </div>

        <div className="summary-item">
          <span className="summary-label">Overall Percentage</span>
          <span className="summary-value">{isAbsent ? 'N/A' : `${entry.overallPercentage}%`}</span>
        </div>

        <div className="summary-item">
          <span className="summary-label">Overall Grade</span>
          <span className="summary-value">{isAbsent ? 'N/A' : entry.overallGrade}</span>
        </div>

        <div className="summary-item">
          <span className="summary-label">Grade Point (GPA)</span>
          <span className="summary-value">{isAbsent ? '0.0' : entry.gpa}</span>
        </div>

        <div className="summary-item">
          <span className="summary-label">Class Rank</span>
          <span className="summary-value">{entry.rank || 'N/A'}</span>
        </div>

        <div className="summary-item">
          <span className="summary-label">Result</span>
          <span
            className={`summary-value ${
              entry.result === 'PASS'
                ? 'highlight-green'
                : entry.result === 'FAIL'
                ? 'highlight-red'
                : ''
            }`}
          >
            {entry.result}
          </span>
        </div>

        {examType === 'final' && (
          <div className="summary-item span-2">
            <span className="summary-label">Promotion Status</span>
            <span className="summary-value">{promotionText}</span>
          </div>
        )}
      </div>
    </div>
  );
};
export default AcademicSummary;
