import React from 'react';
import type { StudentReportEntry, ReportCardViewModel } from '../models/ReportCardViewModel';
import {
  calculateTotalObtained,
  calculateTotalPossible,
  calculatePercentage,
  getGradeForPercentage,
} from '../services/ReportCalculationService';

interface SubjectTableProps {
  entry: StudentReportEntry;
  gradeBands: ReportCardViewModel['exam']['gradeBands'];
}

export const SubjectTable: React.FC<SubjectTableProps> = ({ entry, gradeBands }) => {
  const totalPossible = calculateTotalPossible(entry.marks);
  const totalObtained = calculateTotalObtained(entry.marks);
  const overallPercentage = calculatePercentage(totalObtained, totalPossible);
  const overallBand = getGradeForPercentage(overallPercentage, gradeBands);

  const isAbsent = entry.result === 'ABSENT';

  return (
    <div className="rc-card subject-table-container">
      <h3 className="rc-card-title">Subject Performance</h3>
      <table className="rc-table">
        <thead>
          <tr>
            <th>Subject</th>
            <th className="center">Maximum Marks</th>
            <th className="center">Marks Obtained</th>
            <th className="center">Percentage</th>
            <th className="center">Grade</th>
            <th className="center">Grade Point</th>
            <th>Remarks</th>
          </tr>
        </thead>
        <tbody>
          {entry.marks.map((row, idx) => {
            const hasMarks = row.obtainedMarks !== null;
            const percentageVal = hasMarks ? `${row.percentage}%` : 'N/A';
            const gradeVal = hasMarks ? row.grade : 'N/A';
            const gpVal = hasMarks ? row.gradePoint : '0.0';
            const isRowPass = row.grade !== 'F' && row.grade !== 'E';

            return (
              <tr key={`${row.subject}-${idx}`}>
                <td>{row.subject}</td>
                <td className="center">{row.totalMarks}</td>
                <td className="center">
                  {hasMarks ? row.obtainedMarks : <span style={{ color: '#DC2626', fontWeight: 600 }}>Absent</span>}
                </td>
                <td className="center">{percentageVal}</td>
                <td className="center">
                  {hasMarks ? (
                    <span className={`rc-grade-badge ${isRowPass ? 'pass' : 'fail'}`}>
                      {gradeVal}
                    </span>
                  ) : (
                    'N/A'
                  )}
                </td>
                <td className="center">{gpVal}</td>
                <td>{row.remarks || '-'}</td>
              </tr>
            );
          })}

          {/* Grand Total Row */}
          <tr className="grand-total">
            <td>GRAND TOTAL</td>
            <td className="center">{totalPossible}</td>
            <td className="center">{isAbsent ? 'Absent' : totalObtained}</td>
            <td className="center">{isAbsent ? 'N/A' : `${overallPercentage}%`}</td>
            <td className="center">{isAbsent ? 'N/A' : overallBand.grade}</td>
            <td className="center">{isAbsent ? '0.0' : overallBand.gradePoint}</td>
            <td>{isAbsent ? 'Absent' : overallBand.remarks}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};
export default SubjectTable;
