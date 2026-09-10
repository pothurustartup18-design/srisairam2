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

export function calculateCGPA(marks: ReportCardSubjectRow[], gradeBands: GradeBand[]): string {
  const gradedSubjects = marks.filter((m) => m.obtainedMarks !== null);
  if (gradedSubjects.length === 0) return '0.0';

  let totalPoints = 0;
  gradedSubjects.forEach((sub) => {
    const pct = sub.totalMarks > 0 ? ((sub.obtainedMarks || 0) / sub.totalMarks) * 100 : 0;
    const band = getGradeForPercentage(pct, gradeBands);
    totalPoints += parseFloat(band.gradePoint);
  });

  const cgpa = totalPoints / gradedSubjects.length;
  return cgpa.toFixed(2);
}

export function getPassFailStatus(percentage: number, gradeBands: GradeBand[]): 'PASS' | 'FAIL' {
  const sortedBands = [...gradeBands].sort((a, b) => a.min - b.min);
  const lowestPassingBand = sortedBands.find((b) => b.grade !== 'F' && b.grade !== 'E'); // standard passing threshold
  const threshold = lowestPassingBand ? lowestPassingBand.min : 40;
  return percentage >= threshold ? 'PASS' : 'FAIL';
}

export function getPromotionStatus(
  result: 'PASS' | 'FAIL' | 'ABSENT',
  currentClass: string
): { status: 'promoted' | 'retained' | 'unknown'; nextClass: string | null } {
  if (result === 'ABSENT') {
    return { status: 'unknown', nextClass: null };
  }
  if (result === 'FAIL') {
    return { status: 'retained', nextClass: null };
  }

  const match = currentClass.match(/\d+/);
  if (!match) {
    return { status: 'promoted', nextClass: 'Next Grade' };
  }
  const currentNum = parseInt(match[0], 10);
  const sectionPart = currentClass.replace(String(currentNum), '').trim();
  const nextNum = currentNum + 1;
  const nextClass = `Grade ${nextNum}${sectionPart ? ' ' + sectionPart : ''}`;

  return { status: 'promoted', nextClass };
}
