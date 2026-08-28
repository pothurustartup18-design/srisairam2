/**
 * Shared avatar color palette for student/teacher initials.
 * Was previously copy-pasted in Teachers, Students, and Attendance.
 */
const AVATAR_COLORS: [string, string][] = [
  ['#dbeafe', '#1d4ed8'], // blue
  ['#dcfce7', '#15803d'], // green
  ['#f5f3ff', '#6d28d9'], // purple
  ['#fef3c7', '#b45309'], // amber
  ['#ffe4e6', '#be123c'], // rose
  ['#e0f2fe', '#0369a1'], // sky
];

/**
 * Returns [backgroundHex, foregroundHex] for a given name.
 * Deterministic — same name always gets same color pair.
 */
export function getAvatarColors(name: string): [string, string] {
  const idx = (name.charCodeAt(0) || 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

/**
 * Returns the 1–2 letter initials from a full name.
 * "Aditya Prasad" → "AP"
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
}
