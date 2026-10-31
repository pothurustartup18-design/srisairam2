import React from 'react';
import { createRoot } from 'react-dom/client';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { API_BASE } from '../../../../constants';
import type { ExamData, StudentData } from '../../../../types';
import type { ReportCardViewModel, StudentReportEntry } from './models/ReportCardViewModel';
import { buildReportCardViewModel } from './services/ReportCardDataBuilder';
import ReportCardTemplate from './components/ReportCardTemplate';
import { renderPagesToPdf, waitForImages } from './services/PdfRenderer';
import { getAccessToken } from '../../../../services/api';

async function generateVerificationQrDataUri(verificationUrl: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(verificationUrl, {
      margin: 0,
      errorCorrectionLevel: 'M',
      color: { dark: '#0F172A', light: '#FFFFFF' },
    });
  } catch (err) {
    console.error('Failed to generate verification QR code:', err);
    return null;
  }
}

/**
 * Mounts the ReportCardTemplate component offscreen, waits for images to load,
 * captures A4 page sheets, and renders them to the jsPDF document.
 */
async function renderStudentIntoDoc(
  doc: jsPDF,
  viewModel: ReportCardViewModel,
  entry: StudentReportEntry,
  unsavedRemarks: string | undefined,
  isFirstStudent: boolean
): Promise<void> {
  const qrDataUri = await generateVerificationQrDataUri(entry.verificationUrl);

  const container = document.createElement('div');
  container.className = 'report-card-render-container';
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '0';
  container.style.zIndex = '-9999';
  container.style.pointerEvents = 'none';
  document.body.appendChild(container);

  const root = createRoot(container);
  try {
    await new Promise<void>((resolve) => {
      root.render(
        <ReportCardTemplate
          viewModel={viewModel}
          entry={entry}
          unsavedRemarks={unsavedRemarks}
          qrDataUri={qrDataUri}
        />
      );
      // Wait for layout to settle: use setTimeout to ensure compatibility in background tabs
      setTimeout(resolve, 50);
    });

    await waitForImages(container);

    // Call the rendering pipeline to write students onto the document
    await renderPagesToPdf(doc, container, isFirstStudent);
  } finally {
    root.unmount();
    document.body.removeChild(container);
  }
}

async function uploadGeneratedPdf(doc: jsPDF, examId: string, studentId: string, filename: string) {
  const pdfBase64 = doc.output('datauristring');
  const token = getAccessToken();
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  return fetch(`${API_BASE}/marks/upload-pdf`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ studentId, examId, pdfBase64, filename }),
  });
}

/**
 * Generates and downloads the consolidated class reports PDF.
 */
export async function generateReportCardPDF(
  exam: ExamData,
  students: StudentData[],
  remarks: Record<string, string>,
  _teacherName: string
): Promise<void> {
  // Initialize standard A4 Portrait document
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const viewModel = await buildReportCardViewModel(exam._id);

  // Match the student roster sort order
  const orderedEntries = students
    .map((s) => viewModel.students.find((e) => e.studentId === (s.id || s._id)))
    .filter((e): e is StudentReportEntry => !!e);

  for (let index = 0; index < orderedEntries.length; index++) {
    const entry = orderedEntries[index];
    await renderStudentIntoDoc(doc, viewModel, entry, remarks[entry.studentId], index === 0);
  }

  const fileName = `RND_School_Report_${exam.examName.replace(/\s+/g, '_')}_Class_${exam.class}.pdf`;
  doc.save(fileName);

  // Trigger background S3 sync upload
  uploadGeneratedPdf(doc, exam._id, 'bulk', fileName).catch((err) =>
    console.error('Failed to upload bulk PDF to S3:', err)
  );
}

/**
 * Generates and downloads the report card PDF for a single student.
 */
export async function generateSingleStudentReportPDF(
  exam: ExamData,
  student: StudentData,
  remarks: Record<string, string>,
  _teacherName: string
): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const studentId = student.id || student._id || '';
  const studentName = student.name || `${student.firstName || ''} ${student.lastName || ''}`.trim();

  const viewModel = await buildReportCardViewModel(exam._id, studentId);
  const entry = viewModel.students[0];
  if (!entry) throw new Error('Student not found in this exam record.');

  await renderStudentIntoDoc(doc, viewModel, entry, remarks[studentId], true);

  const fileName = `RND_Report_${studentName.replace(/\s+/g, '_')}_${exam.examName.replace(/\s+/g, '_')}.pdf`;
  doc.save(fileName);

  // Trigger background S3 sync upload
  uploadGeneratedPdf(doc, exam._id, studentId, fileName).catch((err) =>
    console.error(`Failed to upload report for ${studentName} to S3:`, err)
  );
}

/**
 * Generates and uploads the report card PDF for a single student, returning the uploaded URL.
 */
export async function uploadSingleStudentReportPDF(
  exam: ExamData,
  student: StudentData,
  remarks: Record<string, string>,
  _teacherName: string
): Promise<string> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const studentId = student.id || student._id || '';
  const studentName = student.name || `${student.firstName || ''} ${student.lastName || ''}`.trim();

  const viewModel = await buildReportCardViewModel(exam._id, studentId);
  const entry = viewModel.students[0];
  if (!entry) throw new Error('Student not found in this exam record.');

  await renderStudentIntoDoc(doc, viewModel, entry, remarks[studentId], true);

  const filename = `RND_Report_${studentName.replace(/\s+/g, '_')}_${exam.examName.replace(/\s+/g, '_')}.pdf`;
  const res = await uploadGeneratedPdf(doc, exam._id, studentId, filename);
  const data = await res.json();
  if (data.success) {
    return data.pdfUrl;
  }
  throw new Error(data.message || 'Failed to upload report card');
}
