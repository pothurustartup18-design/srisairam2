import { SystemConfig } from '../models/systemConfig.model';

export interface GradeBand {
  min: number;
  grade: string;
  gradePoint: string;
  remarks: string;
}

// Grade bands are configurable via SystemConfig key 'gradeBands'. This is the
// single source of truth for grading across the app — the exam analytics
// endpoint and the report card engine both read through here so a school's
// grading scale can never drift between the two.
const DEFAULT_GRADE_BANDS: GradeBand[] = [
  { min: 90, grade: 'A+', gradePoint: '10.0', remarks: 'Outstanding' },
  { min: 80, grade: 'A', gradePoint: '9.0', remarks: 'Excellent' },
  { min: 70, grade: 'B+', gradePoint: '8.0', remarks: 'Very Good' },
  { min: 60, grade: 'B', gradePoint: '7.0', remarks: 'Good' },
  { min: 50, grade: 'C', gradePoint: '6.0', remarks: 'Satisfactory' },
  { min: 35, grade: 'D', gradePoint: '5.0', remarks: 'Pass' },
  { min: 0, grade: 'F', gradePoint: '0.0', remarks: 'Needs Improvement' },
];

// Static fallback used only when a stored band predates the gradePoint/remarks
// fields (old shape was just { min, grade }) so older SystemConfig documents
// still render sensibly instead of showing blank columns.
const REMARKS_BY_GRADE: Record<string, string> = {
  'A+': 'Outstanding',
  A: 'Excellent',
  'B+': 'Very Good',
  B: 'Good',
  C: 'Satisfactory',
  D: 'Pass',
  F: 'Needs Improvement',
};

function normalizeBand(band: any): GradeBand {
  return {
    min: band.min,
    grade: band.grade,
    gradePoint: band.gradePoint ?? (band.min / 10).toFixed(1),
    remarks: band.remarks ?? REMARKS_BY_GRADE[band.grade] ?? '',
  };
}

export async function getGradeBands(): Promise<GradeBand[]> {
  try {
    let raw: any[] | undefined;
    const config = await SystemConfig.findOne({ key: 'gradeBands' });
    raw = config?.value as any;
    const bands = raw && raw.length > 0 ? raw : DEFAULT_GRADE_BANDS;
    return bands.map(normalizeBand);
  } catch {
    return DEFAULT_GRADE_BANDS;
  }
}

export function gradeFor(percentage: number, bands: GradeBand[]): GradeBand {
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  return sorted.find((b) => percentage >= b.min) || sorted[sorted.length - 1];
}
