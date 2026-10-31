/**
 * Shared avatar color palette for student/teacher initials.
 * Rich, vibrant background + white text for maximum contrast.
 */
const AVATAR_COLORS: [string, string][] = [
  ['#2563eb', '#ffffff'], // vivid blue
  ['#7c3aed', '#ffffff'], // vivid purple
  ['#059669', '#ffffff'], // vivid emerald
  ['#dc2626', '#ffffff'], // vivid red
  ['#d97706', '#ffffff'], // vivid amber
  ['#0891b2', '#ffffff'], // vivid cyan
  ['#db2777', '#ffffff'], // vivid pink
  ['#65a30d', '#ffffff'], // vivid lime-green
  ['#9333ea', '#ffffff'], // vivid violet
  ['#ea580c', '#ffffff'], // vivid orange
  ['#0284c7', '#ffffff'], // vivid sky
  ['#be185d', '#ffffff'], // vivid rose
];

/**
 * Returns [backgroundHex, foregroundHex] for a given name.
 * Deterministic — same name always gets same color pair.
 * Uses a simple djb2-style hash over the full name for better distribution.
 */
export function getAvatarColors(name?: string): [string, string] {
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return AVATAR_COLORS[0];
  }
  const s = name.trim();
  let hash = 5381;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 33) ^ s.charCodeAt(i);
  }
  const idx = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx] || AVATAR_COLORS[0];
}

/**
 * Returns the 1–2 letter initials from a full name.
 * "Aditya Prasad" → "AP"
 */
export function getInitials(name?: string): string {
  if (!name || typeof name !== 'string') return '??';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  return parts
    .map(w => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
}
