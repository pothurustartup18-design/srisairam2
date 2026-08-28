import React from 'react';
import type { ReportCardViewModel } from '../models/ReportCardViewModel';

interface HeaderProps {
  school: ReportCardViewModel['school'];
  examName: string;
  showSchoolLogo: boolean;
  compact?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  school,
  examName,
  showSchoolLogo,
  compact = false,
}) => {
  return (
    <div className={compact ? "page2-header-banner" : "cover-header-bg"}>
      {compact ? (
        // Page 2 Header layout (compact banner)
        <>
          <div className="page2-school-meta">
            {school.logoDataUri && (
              <img
                className="page2-school-logo"
                src={school.logoDataUri}
                alt={`${school.name} logo`}
              />
            )}
            <div>
              <h2 className="page2-school-name">{school.name}</h2>
              <p className="page2-school-address">{school.addressLine}</p>
            </div>
          </div>
          <div className="page2-exam-badge">{examName}</div>
        </>
      ) : (
        // Page 1 Header layout (Cover page style)
        <>
          <div className="cover-header-logo-container">
            {showSchoolLogo && school.logoDataUri && (
              <img
                className="cover-header-logo"
                src={school.logoDataUri}
                alt={`${school.name} logo`}
              />
            )}
            <h1 className="cover-school-name">{school.name}</h1>
          </div>
          <div className="cover-school-subtext">RECOGNISED BY GOVT. OF A.P.</div>
          <div className="cover-school-details">
            Affiliation No: {school.code} | Academic Year: {school.academicYear}
          </div>
          {school.phone || school.email ? (
            <div className="cover-school-details" style={{ marginTop: 2, opacity: 0.8 }}>
              {[school.phone ? `Phone: ${school.phone}` : '', school.email ? `Email: ${school.email}` : '']
                .filter(Boolean)
                .join(' | ')}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};
