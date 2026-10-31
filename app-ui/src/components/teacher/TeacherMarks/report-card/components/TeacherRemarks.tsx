import React from 'react';

interface TeacherRemarksProps {
  remarks: string | null | undefined;
}

export const TeacherRemarks: React.FC<TeacherRemarksProps> = ({ remarks }) => {
  const remarksText = remarks && remarks.trim() ? remarks : "No remarks available.";

  return (
    <div style={{ marginTop: 10, marginBottom: 16, fontSize: 13, lineHeight: '28px' }}>
      <div style={{ borderBottom: '1px dashed #94a3b8', paddingBottom: 2, display: 'flex', alignItems: 'baseline' }}>
        <strong style={{ color: '#1E3A8A', marginRight: 8, textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.5px' }}>
          Remarks:
        </strong>
        <span style={{ fontStyle: 'italic', color: '#334155', flex: 1, paddingLeft: 4 }}>
          {remarksText}
        </span>
      </div>
      <div style={{ borderBottom: '1px dashed #94a3b8', height: 28 }} />
    </div>
  );
};
export default TeacherRemarks;
