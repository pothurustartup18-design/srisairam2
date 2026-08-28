/**
 * Single source of truth for the JWT signing secrets.
 *
 * Previously each consumer inlined its own `process.env.JWT_SECRET || '<literal>'`
 * fallback. That had two problems:
 *
 *  1. Security — if JWT_SECRET was ever unset in production the server silently
 *     signed and accepted tokens with a secret that is committed to this repo,
 *     so anyone could forge an admin token. `assertJwtConfig()` now refuses to
 *     boot in that case instead of failing open.
 *  2. Correctness — the fallbacks disagreed. `config/socket.ts` used
 *     'fallbacksecretkey' while `config/passport.ts` used the
 *     'super_secret_access_token_key_12345' literal, so with JWT_SECRET unset
 *     every Socket.IO handshake rejected an otherwise-valid HTTP token.
 *
 * The development fallbacks below are unchanged from the values `passport.ts` /
 * `auth.controller.ts` already used, so local setups without a .env keep working.
 */

/** Dev-only fallbacks. Never reachable when NODE_ENV === 'production'. */
const DEV_ACCESS_SECRET = 'super_secret_access_token_key_12345';
const DEV_REFRESH_SECRET = 'super_secret_refresh_token_key_12345';

export const JWT_SECRET = process.env.JWT_SECRET || DEV_ACCESS_SECRET;
export const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || DEV_REFRESH_SECRET;

/**
 * Fail fast when production is missing (or reusing the public dev value for) a
 * signing secret. Called from `startServer()` alongside `assertWhatsAppConfig()`.
 */
export const assertJwtConfig = (): void => {
  if (process.env.NODE_ENV !== 'production') return;

  const problems: string[] = [];

  if (!process.env.JWT_SECRET) {
    problems.push('JWT_SECRET is not set.');
  } else if (process.env.JWT_SECRET === DEV_ACCESS_SECRET) {
    problems.push('JWT_SECRET is set to the public development value.');
  }

  if (!process.env.JWT_REFRESH_SECRET) {
    problems.push('JWT_REFRESH_SECRET is not set.');
  } else if (process.env.JWT_REFRESH_SECRET === DEV_REFRESH_SECRET) {
    problems.push('JWT_REFRESH_SECRET is set to the public development value.');
  }

  if (problems.length > 0) {
    throw new Error(
      `Insecure JWT configuration in production:\n  - ${problems.join('\n  - ')}\n` +
        'Set both to long random strings (see .env.example). Refusing to start ' +
        'rather than sign tokens with a secret that is public in this repository.'
    );
  }
};
