import html2canvas from 'html2canvas';
import type jsPDF from 'jspdf';

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

/**
 * Renders multiple .report-card-page elements in the container onto separate PDF pages.
 * Ensures zero clipping, zero overflow, and perfect page-split boundaries.
 * 
 * @param doc The jsPDF document instance
 * @param element The container holding the page templates
 * @param isFirstStudent If true, the first page of this student will use the active PDF page
 */
export async function renderPagesToPdf(
  doc: jsPDF,
  element: HTMLElement,
  isFirstStudent = true
): Promise<void> {
  const pages = Array.from(element.querySelectorAll('.report-card-page')) as HTMLElement[];

  if (pages.length === 0) {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });
    const imgData = canvas.toDataURL('image/jpeg', 0.82);
    doc.addImage(imgData, 'JPEG', 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM);
    return;
  }

  for (let i = 0; i < pages.length; i++) {
    // Avoid calling addPage() only on the very first page of the very first student.
    if (!(isFirstStudent && i === 0)) {
      doc.addPage();
    }

    const pageElement = pages[i];
    const canvas = await html2canvas(pageElement, {
      scale: 2, // 150 DPI print/screen sharp resolution
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.82);
    doc.addImage(imgData, 'JPEG', 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM);
  }
}

/**
 * Waits for all img elements to load completely before capturing canvas.
 */
export async function waitForImages(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll('img'));
  await Promise.all(
    images.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
      });
    })
  );
  // Ensure layouts have settled: use setTimeout to ensure compatibility in background tabs
  await new Promise<void>((resolve) => setTimeout(resolve, 50));
}
