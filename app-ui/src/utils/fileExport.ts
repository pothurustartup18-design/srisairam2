import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * downloadOrSharePdf
 * Universal handler to download a PDF in browser or share/save via native Capacitor filesystem on mobile.
 */
export async function downloadOrSharePdf(blobOrDataUrl: Blob | string, filename: string): Promise<void> {
  // If running in standard Web browser
  if (!Capacitor.isNativePlatform()) {
    const url = typeof blobOrDataUrl === 'string' ? blobOrDataUrl : URL.createObjectURL(blobOrDataUrl);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (typeof blobOrDataUrl !== 'string') {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return;
  }

  // If running on Native Mobile (Android / iOS)
  try {
    let base64Data = '';
    if (typeof blobOrDataUrl === 'string') {
      base64Data = blobOrDataUrl.replace(/^data:application\/pdf;base64,/, '').replace(/^data:image\/[^;]+;base64,/, '');
    } else {
      const reader = new FileReader();
      base64Data = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const res = reader.result as string;
          resolve(res.split(',')[1] || '');
        };
        reader.onerror = reject;
        reader.readAsDataURL(blobOrDataUrl);
      });
    }

    const savedFile = await Filesystem.writeFile({
      path: filename,
      data: base64Data,
      directory: Directory.Cache
    });

    await Share.share({
      title: filename,
      url: savedFile.uri
    });
  } catch (error) {
    console.error('Failed to export file natively:', error);
  }
}
