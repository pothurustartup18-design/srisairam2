/**
 * GET /api/events/:eventId/media — the PUBLIC Event Announcement gallery link.
 * Verifies: no auth required, 404 for bad/unknown id, friendly empty page,
 * fresh presigned URLs rendered, and that it does NOT swallow other /api/events
 * routes (they still hit the auth gate).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

const h = vi.hoisted(() => ({
  findByIdMock: vi.fn(),
  presignMock: vi.fn(async (key: string) => `https://s3.test/${key}?X-Amz-Signature=fresh-${Math.random()}`),
  nextResult: null as any
}));

vi.mock('../../../models/event.model', () => ({
  Event: {
    findById: (...args: any[]) => {
      h.findByIdMock(...args);
      return { select: () => ({ lean: async () => h.nextResult }) };
    }
  }
}));
vi.mock('../../../services/s3.service', async (orig) => {
  const actual = await orig<typeof import('../../../services/s3.service')>();
  return { ...actual, getPresignedDownloadUrl: h.presignMock };
});

import eventPublicRoutes from '../eventPublic.routes';

const findByIdMock = h.findByIdMock;
const presignMock = h.presignMock;
const setEvent = (v: any) => { h.nextResult = v; };

let server: Server;
let base: string;

beforeEach(async () => {
  findByIdMock.mockClear();
  presignMock.mockClear();
  setEvent(null);

  const app = express();
  app.use('/api/events', eventPublicRoutes);
  // stand-in for `authenticateJWT` on the rest of /api/events
  app.use('/api/events', (_req, res) => res.status(401).json({ success: false, message: 'Access token is invalid, expired, or missing.' }));

  await new Promise<void>((r) => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      r();
    });
  });
});

afterEach(() => new Promise<void>((r) => server.close(() => r())));

const OID = 'a'.repeat(24);

describe('public event gallery endpoint', () => {
  it('is reachable with NO Authorization header (not the auth error)', async () => {
    setEvent({
      title: 'Annual Day',
      mediaAttachments: [{ s3Key: 'events/2026/x-photo.png', filename: 'photo.png', mediaType: 'image' }]
    });
    const res = await fetch(`${base}/api/events/${OID}/media`);
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(body).not.toMatch(/Access token is invalid/);
    expect(body).toContain('Annual Day');
    expect(body).toContain('<img src="https://s3.test/events/2026/x-photo.png');
    expect(presignMock).toHaveBeenCalledWith('events/2026/x-photo.png', expect.any(Number));
  });

  it('mints FRESH presigned URLs on every open (never a stored URL)', async () => {
    setEvent({
      title: 'E',
      mediaAttachments: [{ s3Key: 'k1', filename: 'f1', mediaType: 'image' }]
    });
    const h1 = await (await fetch(`${base}/api/events/${OID}/media`)).text();
    setEvent({
      title: 'E',
      mediaAttachments: [{ s3Key: 'k1', filename: 'f1', mediaType: 'image' }]
    });
    const h2 = await (await fetch(`${base}/api/events/${OID}/media`)).text();
    const u1 = h1.match(/src="([^"]+)"/)![1];
    const u2 = h2.match(/src="([^"]+)"/)![1];
    expect(u1).not.toBe(u2); // regenerated each request
    expect(presignMock).toHaveBeenCalledTimes(2);
  });

  it('renders every attachment type and reflects the CURRENT set (deleted files gone)', async () => {
    setEvent({
      title: 'Fest',
      mediaAttachments: [
        { s3Key: 'a.jpg', filename: 'a.jpg', mediaType: 'image' },
        { s3Key: 'v.mp4', filename: 'v.mp4', mediaType: 'video' },
        { s3Key: 'b.pdf', filename: 'b.pdf', mediaType: 'document' }
      ]
    });
    const body = await (await fetch(`${base}/api/events/${OID}/media`)).text();
    expect(body).toContain('<img src="https://s3.test/a.jpg');
    expect(body).toContain('<video src="https://s3.test/v.mp4');
    expect(body).toContain('📄 Document File');
    expect(presignMock).toHaveBeenCalledTimes(3);
  });

  it('event exists but 0 attachments → 200 friendly empty page (nothing exposed)', async () => {
    setEvent({ title: 'Empty Event', mediaAttachments: [] });
    const res = await fetch(`${base}/api/events/${OID}/media`);
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).toContain('No attachments are currently available for this event.');
    expect(body).not.toContain('<img');
    expect(presignMock).not.toHaveBeenCalled();
  });

  it('unknown event id → 404 html (NOT the auth error)', async () => {
    setEvent(null);
    const res = await fetch(`${base}/api/events/${OID}/media`);
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).toContain('could not be found');
    expect(body).not.toMatch(/Access token is invalid/);
  });

  it('malformed id (not 24-hex) → 404 html, no DB hit', async () => {
    const res = await fetch(`${base}/api/events/000000000000/media`);
    expect(res.status).toBe(404);
    expect(await res.text()).not.toMatch(/Access token is invalid/);
    expect(findByIdMock).not.toHaveBeenCalled();
  });

  it('does NOT swallow other /api/events routes — they still hit the auth gate', async () => {
    const list = await fetch(`${base}/api/events/`);
    expect(list.status).toBe(401);
    const create = await fetch(`${base}/api/events`, { method: 'POST' });
    expect(create.status).toBe(401);
    const del = await fetch(`${base}/api/events/${OID}`, { method: 'DELETE' });
    expect(del.status).toBe(401);
  });
});
