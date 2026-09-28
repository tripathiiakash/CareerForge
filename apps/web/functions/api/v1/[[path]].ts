/**
 * Cloudflare Pages Function: Same-Origin API Proxy (/api/v1/*)
 *
 * Proxies browser requests from the frontend Pages deployment
 * (e.g. https://careerforge-8oq.pages.dev/api/v1/*) to the upstream Render API
 * (https://careerforge-api-h2ce.onrender.com/api/v1/*).
 *
 * Why this is required:
 * Modern browsers enforce strict third-party cookie restrictions (Safari ITP,
 * Chrome Privacy Sandbox, Firefox ETP). Direct cross-origin API requests from
 * *.pages.dev to *.onrender.com cause HttpOnly session cookies (cf_auth) to be
 * blocked on subsequent requests even with SameSite=None, resulting in HTTP 401.
 *
 * By routing all browser requests to the same origin (/api/v1/*) and proxying them
 * server-side via this Pages Function:
 * 1. The browser treats cf_auth as a first-party, same-origin cookie.
 * 2. Cookies are sent reliably with SameSite=Lax.
 * 3. JWTs remain strictly inside HttpOnly cookies and are never exposed to client-side JS.
 * 4. Local development continues to use the Vite dev server proxy.
 */

export interface Env {
  API_UPSTREAM_URL?: string;
  BACKEND_URL?: string;
  API_URL?: string;
  RENDER_API_URL?: string;
}

export interface EventContext<Env, P extends string, Data> {
  request: Request;
  functionPath: string;
  waitUntil: (promise: Promise<unknown>) => void;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
  env: Env;
  params: Record<P, string | string[]>;
  data: Data;
}

export type PagesFunction<
  Env = Record<string, string | undefined>,
  Params extends string = any,
  Data extends Record<string, unknown> = Record<string, unknown>,
> = (context: EventContext<Env, Params, Data>) => Response | Promise<Response>;

export const DEFAULT_UPSTREAM_URL = 'https://careerforge-api-h2ce.onrender.com';

export const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host', // Managed by fetch based on destination target URL
]);

/**
 * Resolves the upstream backend base URL from environment variables or fallback.
 * Automatically strips any trailing slash or duplicate /api/v1 suffix.
 */
export function getUpstreamUrl(env?: Partial<Env>): string {
  const raw =
    env?.API_UPSTREAM_URL ||
    env?.BACKEND_URL ||
    env?.API_URL ||
    env?.RENDER_API_URL ||
    DEFAULT_UPSTREAM_URL;

  return raw
    .trim()
    .replace(/\/api\/v1\/?$/, '')
    .replace(/\/+$/, '');
}

/**
 * Sanitizes Set-Cookie headers returned by the upstream backend:
 * 1. Strips any upstream Domain attribute so cookie binds to Pages as a host-only cookie.
 * 2. Normalizes SameSite=None to SameSite=Lax (least permissive correct value for same-origin).
 */
export function sanitizeSetCookieHeader(cookieStr: string): string {
  let sanitized = cookieStr;

  // Remove Domain attribute so the cookie becomes host-only to the Pages domain
  sanitized = sanitized.replace(/;\s*domain=[^;]+/gi, '');

  // Normalize SameSite=None to SameSite=Lax for same-origin deployment
  sanitized = sanitized.replace(/;\s*samesite=none/gi, '; SameSite=Lax');

  return sanitized;
}

/**
 * Extracts all Set-Cookie header strings from a Headers instance,
 * supporting modern getSetCookie() and fallback approaches.
 */
export function getSetCookieHeaders(headers: Headers): string[] {
  if (typeof (headers as any).getSetCookie === 'function') {
    return (headers as any).getSetCookie();
  }

  const raw = headers.get('set-cookie');
  if (!raw) return [];
  return [raw];
}

/**
 * Catch-all Cloudflare Pages Function handler for /api/v1/*
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  // Safety guard: only proxy /api/v1 routes; pass through any others to static asset handler
  if (!url.pathname.startsWith('/api/v1')) {
    return context.next();
  }

  // 1. Resolve upstream target URL
  const upstreamBase = getUpstreamUrl(env);
  const targetUrl = new URL(`${upstreamBase}${url.pathname}${url.search}`);

  // 2. Build sanitized forwarded request headers
  const forwardedHeaders = new Headers();
  for (const [key, value] of request.headers.entries()) {
    const lowerKey = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lowerKey)) {
      continue;
    }
    forwardedHeaders.set(key, value);
  }

  // Forward client IP for backend rate-limiting & logging
  const clientIp =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for') ||
    request.headers.get('x-real-ip');

  if (clientIp) {
    forwardedHeaders.set('x-forwarded-for', clientIp);
  }

  forwardedHeaders.set('x-forwarded-proto', url.protocol.replace(':', ''));
  forwardedHeaders.set('x-forwarded-host', url.host);

  // Forward Origin / Referer for backend CsrfMiddleware validation
  const incomingOrigin = request.headers.get('origin');
  if (incomingOrigin) {
    forwardedHeaders.set('origin', incomingOrigin);
  } else {
    // For same-origin browser requests where Origin might be omitted, provide url.origin
    forwardedHeaders.set('origin', url.origin);
  }

  // 3. Prepare request body (GET/HEAD must not carry body)
  const isBodyMethod = !['GET', 'HEAD'].includes(request.method.toUpperCase());
  const body = isBodyMethod ? request.body : undefined;

  const fetchInit: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers: forwardedHeaders,
    body,
    redirect: 'manual',
  };

  if (body) {
    fetchInit.duplex = 'half';
  }

  // 4. Execute upstream request
  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(targetUrl.toString(), fetchInit);
  } catch (error: unknown) {
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'GATEWAY_ERROR',
          message:
            'Upstream API gateway error: unable to reach backend service',
        },
      }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }

  // 5. Construct response headers, preserving Set-Cookie and stripping hop-by-hop headers
  const responseHeaders = new Headers();
  for (const [key, value] of upstreamResponse.headers.entries()) {
    const lowerKey = key.toLowerCase();
    if (lowerKey === 'set-cookie' || HOP_BY_HOP_HEADERS.has(lowerKey)) {
      continue;
    }
    responseHeaders.set(key, value);
  }

  // 6. Forward sanitized Set-Cookie headers
  const setCookies = getSetCookieHeaders(upstreamResponse.headers);
  for (const cookie of setCookies) {
    responseHeaders.append('Set-Cookie', sanitizeSetCookieHeader(cookie));
  }

  // 7. Return response stream preserving status and headers
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
};
