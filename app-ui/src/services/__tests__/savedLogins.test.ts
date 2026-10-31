import { describe, expect, it } from 'vitest';
import {
  forgetLogin,
  loadSavedLogins,
  loginId,
  MAX_SAVED_LOGINS,
  parseLogins,
  removeLogin,
  saveLogin,
  upsertLogin,
  type SavedLogin,
  type Vault
} from '../savedLogins';

function fakeVault(initial: Record<string, string> = {}): Vault & { data: Record<string, string>; calls: string[] } {
  const v = {
    data: { ...initial },
    calls: [] as string[],
    async get({ key }: { key: string }) { v.calls.push(`get ${key}`); return { value: v.data[key] ?? null }; },
    async set({ key, value }: { key: string; value: string }) { v.calls.push(`set ${key}`); v.data[key] = value; },
    async remove({ key }: { key: string }) { v.calls.push(`remove ${key}`); delete v.data[key]; }
  };
  return v;
}

const entry = (role: 'admin' | 'teacher' | 'parent', username: string, password = 'pw', name = '') => ({ role, username, password, name });

describe('loginId', () => {
  it('is stable across case and whitespace, and separates roles', () => {
    expect(loginId('admin', ' Admin1 ')).toBe('admin:admin1');
    expect(loginId('admin', 'x')).not.toBe(loginId('teacher', 'x'));
  });
});

describe('parseLogins', () => {
  it('returns [] for missing, empty or invalid JSON', () => {
    expect(parseLogins(null)).toEqual([]);
    expect(parseLogins('')).toEqual([]);
    expect(parseLogins('not json')).toEqual([]);
    expect(parseLogins('{"a":1}')).toEqual([]);
  });

  it('keeps valid entries and drops malformed ones', () => {
    const raw = JSON.stringify([
      { role: 'admin', username: 'a1', password: 'p', name: 'A', savedAt: 5 },
      { role: 'superadmin', username: 'x', password: 'p' }, // role not allowed here
      { role: 'teacher', username: '', password: 'p' },
      { role: 'teacher', username: 't', password: '' },
      { role: 'parent', password: 'p' },
      null,
      'str',
      42
    ]);
    const out = parseLogins(raw);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'admin:a1', role: 'admin', username: 'a1', password: 'p', name: 'A', savedAt: 5 });
  });

  it('orders newest first and recomputes ids', () => {
    const out = parseLogins(JSON.stringify([
      { role: 'admin', username: 'Old', password: 'p', savedAt: 1, id: 'forged' },
      { role: 'teacher', username: 'New', password: 'p', savedAt: 9 }
    ]));
    expect(out.map(l => l.id)).toEqual(['teacher:new', 'admin:old']);
  });
});

describe('upsertLogin', () => {
  it('adds a login with an id and timestamp', () => {
    const out = upsertLogin([], entry('admin', 'admin1', 'secret', 'Jaswanth'), 100);
    expect(out).toEqual([{ id: 'admin:admin1', role: 'admin', username: 'admin1', password: 'secret', name: 'Jaswanth', savedAt: 100 }]);
  });

  it('replaces the same account (new password) instead of duplicating it', () => {
    const first = upsertLogin([], entry('admin', 'Admin1', 'old'), 1);
    const out = upsertLogin(first, entry('admin', ' admin1 ', 'new'), 2);
    expect(out).toHaveLength(1);
    expect(out[0].password).toBe('new');
    expect(out[0].savedAt).toBe(2);
  });

  it('keeps different roles with the same username separate', () => {
    let list = upsertLogin([], entry('teacher', 'x'), 1);
    list = upsertLogin(list, entry('parent', 'x'), 2);
    expect(list.map(l => l.id)).toEqual(['parent:x', 'teacher:x']);
  });

  it('caps the list and drops the oldest', () => {
    let list: SavedLogin[] = [];
    for (let i = 0; i < MAX_SAVED_LOGINS + 3; i++) list = upsertLogin(list, entry('parent', `u${i}`), i + 1);
    expect(list).toHaveLength(MAX_SAVED_LOGINS);
    expect(list[0].username).toBe(`u${MAX_SAVED_LOGINS + 2}`);
    expect(list.find(l => l.username === 'u0')).toBeUndefined();
  });
});

describe('removeLogin', () => {
  it('removes only the requested account', () => {
    const list = upsertLogin(upsertLogin([], entry('admin', 'a'), 1), entry('admin', 'b'), 2);
    expect(removeLogin(list, 'admin:a').map(l => l.username)).toEqual(['b']);
    expect(removeLogin(list, 'nope')).toHaveLength(2);
  });
});

describe('vault storage', () => {
  it('saves, reloads and updates a login', async () => {
    const vault = fakeVault();
    expect(await saveLogin(entry('admin', 'admin1', 'p1', 'Jaswanth'), vault)).toBe(true);
    expect(await saveLogin(entry('admin', 'admin1', 'p2', 'Jaswanth'), vault)).toBe(true);
    const list = await loadSavedLogins(vault);
    expect(list).toHaveLength(1);
    expect(list[0].password).toBe('p2');
  });

  it('forgets a login and deletes the vault entry when none are left', async () => {
    const vault = fakeVault();
    await saveLogin(entry('admin', 'a'), vault);
    await saveLogin(entry('admin', 'b'), vault);
    expect((await forgetLogin('admin:a', vault)).map(l => l.username)).toEqual(['b']);
    expect(await forgetLogin('admin:b', vault)).toEqual([]);
    expect(vault.data['saved-logins']).toBeUndefined();
  });

  it('treats a vault that errors as empty and never throws when saving', async () => {
    const broken: Vault = {
      get: async () => { throw new Error('keystore unavailable'); },
      set: async () => { throw new Error('keystore unavailable'); },
      remove: async () => { throw new Error('keystore unavailable'); }
    };
    expect(await loadSavedLogins(broken)).toEqual([]);
    expect(await saveLogin(entry('admin', 'a'), broken)).toBe(false);
    expect(await forgetLogin('admin:a', broken)).toEqual([]);
  });

  it('survives a corrupted stored value', async () => {
    const vault = fakeVault({ 'saved-logins': '{{{ corrupted' });
    expect(await loadSavedLogins(vault)).toEqual([]);
    expect(await saveLogin(entry('admin', 'a'), vault)).toBe(true);
    expect(await loadSavedLogins(vault)).toHaveLength(1);
  });

  it('uses a single vault key and never writes the password anywhere else', async () => {
    const vault = fakeVault();
    await saveLogin(entry('admin', 'a', 'TopSecret1'), vault);
    expect(Object.keys(vault.data)).toEqual(['saved-logins']);
    expect(vault.calls.filter(c => c.startsWith('set'))).toEqual(['set saved-logins']);
  });
});
