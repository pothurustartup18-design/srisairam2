import type { ReportCardSubjectRow } from '../models/ReportCardViewModel';

/**
 * ReportCalculationService
 *
 * Implements frontend calculation helpers for marks, percentages, grades,
 * CGPA/GPA, and promotion status to satisfy the dynamic calculation requirements.
 */

export interface GradeBand {
  min: number;
  grade: string;
  gradePoint: string;
  remarks: string;
}

export function calculateTotalObtained(marks: ReportCardSubjectRow[]): number {
  return marks.reduce((sum, m) => sum + (m.obtainedMarks || 0), 0);
}

export function calculateTotalPossible(marks: ReportCardSubjectRow[]): number {
  return marks.reduce((sum, m) => sum + (m.totalMarks || 0), 0);
}

export function calculatePercentage(obtained: number, possible: number): number {
  if (possible === 0) return 0;
  const pct = (obtained / possible) * 100;
  return Math.round(pct * 10) / 10;
}

export function getGradeForPercentage(pct: number, gradeBands: GradeBand[]): GradeBand {
  // Sort grade bands in descending order of min percentage
  const sortedBands = [...gradeBands].sort((a, b) => b.min - a.min);
  for (const band of sortedBands) {
    if (pct >= band.min) return band;
  }
  return sortedBands[sortedBands.length - 1] || { min: 0, grade: 'F', gradePoint: '0.0', remarks: 'Fail' };
}
