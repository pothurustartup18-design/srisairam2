import { Request } from 'express';

// scheme://host the client actually reached us on (nginx sets these headers).
// Use for links sent to parents — production's APP_HOST was left at the dev
// default (localhost:5173), which WhatsApp renders as dead, unclickable text.
export function getPublicOrigin(req: Request): string {
  const proto = String(req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
  const host = req.get('x-forwarded-host') || req.get('host') || process.env.APP_HOST || 'localhost:5173';
  return `${proto}://${host}`;
}
