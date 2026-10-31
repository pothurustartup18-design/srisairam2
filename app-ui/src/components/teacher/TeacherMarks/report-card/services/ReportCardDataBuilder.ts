import { API_BASE } from '../../../../../constants';
import { getAccessToken } from '../../../../../services/api';
import type { ReportCardViewModel } from '../models/ReportCardViewModel';

export async function buildReportCardViewModel(examId: string, studentId?: string): Promise<ReportCardViewModel> {
  const token = getAccessToken();
  const headers: HeadersInit = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const qs = studentId ? `?studentId=${encodeURIComponent(studentId)}` : '';
  const res = await fetch(`${API_BASE}/report-card/${examId}${qs}`, { headers });
  const data = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Failed to load report card data from the server.');
  }
  return data.data as ReportCardViewModel;
}
