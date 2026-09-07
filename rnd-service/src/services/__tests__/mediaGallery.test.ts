import { describe, it, expect, vi, beforeEach } from 'vitest';

const { sendMock, getPresignedDownloadUrlMock } = vi.hoisted(() => ({
  sendMock: vi.fn().mockResolvedValue({}),
  getPresignedDownloadUrlMock: vi.fn().mockResolvedValue('https://x.test/galleries/2026/abc.html')
}));

vi.mock('../s3.service', async () => {
  const actual = await vi.importActual<typeof import('../s3.service')>('../s3.service');
  return {
    ...actual,
    getS3Client: () => ({ send: sendMock }),
    getPresignedDownloadUrl: getPresignedDownloadUrlMock
  };
});

import { uploadGallery, renderGalleryPage } from '../mediaGallery.service';

beforeEach(() => {
  sendMock.mockClear();
  getPresignedDownloadUrlMock.mockClear();
  process.env.AWS_BUCKET_NAME = 'test-bucket';
});

describe('uploadGallery', () => {
  it('uploads a single self-contained HTML page under a galleries/ key and returns its presigned URL', async () => {
    const url = await uploadGallery([
      { url: 'https://x.test/pic.jpg', type: 'image', filename: 'pic.jpg' }
    ]);

    expect(url).toBe('https://x.test/galleries/2026/abc.html');
    expect(sendMock).toHaveBeenCalledTimes(1);

    const command = sendMock.mock.calls[0][0];
    expect(command.input.Bucket).toBe('test-bucket');
    expect(command.input.Key).toMatch(/^galleries\/\d{4}\/.+\.html$/);
    expect(command.input.ContentType).toBe('text/html; charset=utf-8');
    expect(command.input.Body.toString('utf-8')).toContain('pic.jpg');
  });

  it('renders every file type with the right embed tag and escapes HTML in filenames/URLs', async () => {
    await uploadGallery([
      { url: 'https://x.test/pic.jpg', type: 'image', filename: 'pic.jpg' },
      { url: 'https://x.test/clip.mp4', type: 'video', filename: 'clip.mp4' },
      { url: 'https://x.test/voice.ogg', type: 'audio', filename: 'voice.ogg' },
      { url: 'https://x.test/notes.pdf', type: 'document', filename: '<script>evil</script>.pdf' }
    ]);

    const html = sendMock.mock.calls[0][0].input.Body.toString('utf-8');
    expect(html).toContain('<img src="https://x.test/pic.jpg"');
    expect(html).toContain('<video src="https://x.test/clip.mp4"');
    expect(html).toContain('<audio src="https://x.test/voice.ogg"');
    expect(html).toContain('download="&lt;script&gt;evil&lt;/script&gt;.pdf"');
    expect(html).not.toContain('<script>evil</script>');
    expect(html).toContain('Shared Files (4)');
  });
});

describe('renderGalleryPage', () => {
  it('default output is byte-identical to the legacy gallery HTML (DM path unchanged)', () => {
    const files = [{ url: 'https://x.test/a.jpg', type: 'image' as const, filename: 'a.jpg' }];
    const html = renderGalleryPage(files);
    expect(html).toContain('<title>Shared Files</title>');
    expect(html).toContain('📎 Shared Files (1)');
    expect(html).toContain('<img src="https://x.test/a.jpg"');
  });

  it('supports a custom title/heading and escapes them', () => {
    const html = renderGalleryPage([{ url: 'https://x.test/a.jpg', type: 'image', filename: 'a.jpg' }], {
      title: 'Attachments — Sports <Day>',
      heading: '📎 Sports <Day> & "Fun"'
    });
    expect(html).toContain('<title>Attachments — Sports &lt;Day&gt;</title>');
    expect(html).toContain('📎 Sports &lt;Day&gt; &amp; &quot;Fun&quot;');
    expect(html).not.toContain('<Day>');
  });

  it('renders a friendly empty state when there are no files (no broken page)', () => {
    const html = renderGalleryPage([], { title: 'Attachments — X', emptyMessage: 'No attachments are currently available for this event.' });
    expect(html).toContain('class="empty"');
    expect(html).toContain('No attachments are currently available for this event.');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<video');
  });
});
