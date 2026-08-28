import React from 'react';
import { StudentCoverPage } from './StudentCoverPage';
import { AcademicPerformancePage } from './AcademicPerformancePage';
import { CumulativePerformancePage } from './CumulativePerformancePage';
import type { ReportCardViewModel, StudentReportEntry } from '../models/ReportCardViewModel';
import '../templates/report-card-v2.css';

interface ReportCardTemplateProps {
  viewModel: ReportCardViewModel;
  entry: StudentReportEntry;
  unsavedRemarks?: string;
  qrDataUri: string | null;
}

export const ReportCardTemplate: React.FC<ReportCardTemplateProps> = ({
  viewModel,
  entry,
  unsavedRemarks,
  qrDataUri,
}) => {
  return (
    <div className="report-card-container">
      <StudentCoverPage
        viewModel={viewModel}
        entry={entry}
        qrDataUri={qrDataUri}
      />
      <AcademicPerformancePage
        viewModel={viewModel}
        entry={entry}
        unsavedRemarks={unsavedRemarks}
      />
      {viewModel.exam.examType === 'final' && (
        <CumulativePerformancePage
          viewModel={viewModel}
          entry={entry}
        />
      )}
    </div>
  );
};
export default ReportCardTemplate;
