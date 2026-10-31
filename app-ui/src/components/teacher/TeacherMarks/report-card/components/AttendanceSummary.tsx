import React from 'react';
import type { ReportCardAttendanceSummary } from '../models/ReportCardViewModel';

interface AttendanceSummaryProps {
  attendance: ReportCardAttendanceSummary;
}

export const AttendanceSummary: React.FC<AttendanceSummaryProps> = ({ attendance }) => {
  const hasData = attendance.status === 'ok';
  const workingDays = attendance.workingDays || 0;
  const presentDays = attendance.presentDays || 0;
  const absentDays = Math.max(0, workingDays - presentDays);
  
  const percentageStr = hasData && attendance.percentage !== null
    ? `${attendance.percentage.toFixed(1)}%`
    : 'N/A';

  return (
    <div className="rc-card" style={{ marginBottom: 12 }}>
      <h3 className="rc-card-title">Attendance Summary</h3>
      {hasData ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <div className="attendance-box" style={{ padding: '6px' }}>
            <div className="attendance-num" style={{ fontSize: '13px' }}>{workingDays}</div>
            <div className="attendance-label" style={{ fontSize: '9px' }}>Working Days</div>
          </div>
          <div className="attendance-box" style={{ padding: '6px' }}>
            <div className="attendance-num" style={{ fontSize: '13px' }}>{presentDays}</div>
            <div className="attendance-label" style={{ fontSize: '9px' }}>Present Days</div>
          </div>
          <div className="attendance-box" style={{ padding: '6px' }}>
            <div className="attendance-num" style={{ fontSize: '13px' }}>{absentDays}</div>
            <div className="attendance-label" style={{ fontSize: '9px' }}>Absent Days</div>
          </div>
          <div className="attendance-box" style={{ padding: '6px' }}>
            <div className="attendance-pct" style={{ fontSize: '13px', color: '#16A34A', fontWeight: 800 }}>{percentageStr}</div>
            <div className="attendance-label" style={{ fontSize: '9px' }}>Attendance %</div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '40px', color: '#94A3B8', fontSize: '12px', fontStyle: 'italic' }}>
          No attendance data available.
        </div>
      )}
    </div>
  );
};
export default AttendanceSummary;
