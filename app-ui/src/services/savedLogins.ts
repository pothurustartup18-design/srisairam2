import { Capacitor, registerPlugin } from '@capacitor/core';
import { isNativeApp } from '../constants';

/**
 * "Saved logins" for the installed app: after logging out, the login screen can offer the accounts
 * you chose to remember, so you don't retype passwords.
 *
 * Passwords are kept only in the SecureVault native plugin, which encrypts them with an Android
 * Keystore key that cannot be copied off the phone. If the plugin isn't present (browser, or an
 * older app build) the feature is simply unavailable.
 */

export type LoginRole = 'admin' | 'teacher' | 'parent';

export interface SavedLogin {
  id: string;
  role: LoginRole;
  username: string;
  password: string;
  name: string;
  savedAt: number;
}

export interface Vault {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
}

const VAULT_KEY = 'saved-logins';
export const MAX_SAVED_LOGINS = 10;
const ROLES: LoginRole[] = ['admin', 'teacher', 'parent'];

const nativeVault = registerPlugin<Vault>('SecureVault');

/** True only inside the installed app, and only when this build contains the SecureVault plugin. */
export const savedLoginsAvailable = (): boolean => isNativeApp && Capacitor.isPluginAvailable('SecureVault');

export const loginId = (role: LoginRole, username: string): string => `${role}:${username.trim().toLowerCase()}`;

/** Reads the stored JSON defensively: anything malformed is dropped rather than trusted. */
export function parseLogins(raw: string | null | undefined): SavedLogin[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: SavedLogin[] = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const e = item as Record<string, unknown>;
    if (
      typeof e.username === 'string' && e.username.trim() &&
      typeof e.password === 'string' && e.password &&
      typeof e.role === 'string' && (ROLES as string[]).includes(e.role)
    ) {
      const role = e.role as LoginRole;
      out.push({
        id: loginId(role, e.username),
        role,
        username: e.username.trim(),
        password: e.password,
        name: typeof e.name === 'string' ? e.name : '',
        savedAt: typeof e.savedAt === 'number' && Number.isFinite(e.savedAt) ? e.savedAt : 0
      });
    }
  }
  return sortLogins(out);
}

const sortLogins = (list: SavedLogin[]): SavedLogin[] => [...list].sort((a, b) => b.savedAt - a.savedAt);

/** Adds or updates (same role + username) a login, newest first, capped at MAX_SAVED_LOGINS. */
export function upsertLogin(list: SavedLogin[], entry: Omit<SavedLogin, 'id' | 'savedAt'>, now: number = Date.now()): SavedLogin[] {
  const id = loginId(entry.role, entry.username);
  const next: SavedLogin = { ...entry, username: entry.username.trim(), id, savedAt: now };
  return sortLogins([next, ...list.filter(l => l.id !== id)]).slice(0, MAX_SAVED_LOGINS);
}

export const removeLogin = (list: SavedLogin[], id: string): SavedLogin[] => list.filter(l => l.id !== id);

// ─── storage (vault is injectable for tests) ────────────────────────────────

export async function loadSavedLogins(vault: Vault = nativeVault): Promise<SavedLogin[]> {
  try {
    return parseLogins((await vault.get({ key: VAULT_KEY })).value);
  } catch {
    return [];
  }
}

async function writeAll(list: SavedLogin[], vault: Vault): Promise<void> {
  if (list.length === 0) await vault.remove({ key: VAULT_KEY });
  else await vault.set({ key: VAULT_KEY, value: JSON.stringify(list) });
}

/** Never throws: failing to remember a password must not break signing in. Returns whether it was saved. */
export async function saveLogin(entry: Omit<SavedLogin, 'id' | 'savedAt'>, vault: Vault = nativeVault): Promise<boolean> {
  try {
    await writeAll(upsertLogin(await loadSavedLogins(vault), entry), vault);
    return true;
  } catch {
    return false;
  }
}

export async function forgetLogin(id: string, vault: Vault = nativeVault): Promise<SavedLogin[]> {
  try {
    const next = removeLogin(await loadSavedLogins(vault), id);
    await writeAll(next, vault);
    return next;
  } catch {
    return loadSavedLogins(vault);
  }
}
