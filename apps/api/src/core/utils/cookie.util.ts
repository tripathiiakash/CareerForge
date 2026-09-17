import { Response } from 'express';
import { ConfigService } from '../config/config.service';

/**
 * Sets the secure HttpOnly auth cookie on the response.
 * Cookie attributes:
 *   - HttpOnly: JavaScript cannot read the token
 *   - Secure: HTTPS-only in production (allows HTTP in dev)
 *   - SameSite=Lax: Blocks cross-site POST CSRF while allowing same-site fetch
 *   - Path=/: Available for all API routes
 *   - Max-Age: Aligned with JWT expiry (in ms)
 */
export function setAuthCookie(
  res: Response,
  token: string,
  config: ConfigService
): void {
  const sameSite = config.authCookieSameSite ?? 'lax';
  // RFC 6265bis: SameSite=None strictly requires Secure=true
  const secure = sameSite === 'none' ? true : config.isProduction;

  res.cookie(config.authCookieName, token, {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    maxAge: config.authCookieMaxAgeSec * 1000, // ms
  });
}

/**
 * Clears the auth cookie on logout.
 * Sets Max-Age=0 and expires in the past so all browsers immediately delete it.
 */
export function clearAuthCookie(
  res: Response,
  config: ConfigService
): void {
  const sameSite = config.authCookieSameSite ?? 'lax';
  const secure = sameSite === 'none' ? true : config.isProduction;

  res.cookie(config.authCookieName, '', {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });
}

/**
 * Resilient cookie string parser fallback for environments where
 * cookie-parser middleware was not mounted on the request.
 */
export function parseCookieHeader(header?: string): Record<string, string> {
  if (!header || typeof header !== 'string') {
    return {};
  }
  const cookies: Record<string, string> = {};
  const pairs = header.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    const key = pair.substring(0, idx).trim();
    const val = pair.substring(idx + 1).trim();
    try {
      cookies[key] = decodeURIComponent(val);
    } catch {
      cookies[key] = val;
    }
  }
  return cookies;
}
