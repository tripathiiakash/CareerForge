import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getUpstreamUrl,
  sanitizeSetCookieHeader,
  getSetCookieHeaders,
  onRequest,
  DEFAULT_UPSTREAM_URL,
} from '../functions/api/v1/[[path]].ts';
import { resolveApiBaseUrl } from '../src/lib/api.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = path.resolve(__dirname, '..');

describe('Cloudflare Pages Functions Same-Origin API Proxy Suite', () => {
  // --------------------------------------------------------------------------
  // 1. API Base URL Resolution (resolveApiBaseUrl)
  // --------------------------------------------------------------------------
  describe('1. resolveApiBaseUrl Contracts', () => {
    it('enforces same-origin /api/v1 in production when VITE_API_URL points to cross-origin Render URL', () => {
      const url = resolveApiBaseUrl(
        'https://careerforge-api-h2ce.onrender.com/api/v1',
        true
      );
      assert.equal(
        url,
        '/api/v1',
        'Production must ignore cross-origin Render URL to prevent third-party cookie blocking'
      );
    });

    it('allows relative path in production if explicitly configured', () => {
      const url = resolveApiBaseUrl('/api/v1', true);
      assert.equal(url, '/api/v1');
    });

    it('defaults to /api/v1 in production when VITE_API_URL is undefined or empty', () => {
      assert.equal(resolveApiBaseUrl(undefined, true), '/api/v1');
      assert.equal(resolveApiBaseUrl('', true), '/api/v1');
      assert.equal(resolveApiBaseUrl('   ', true), '/api/v1');
    });

    it('preserves direct backend URL in local development mode', () => {
      const url = resolveApiBaseUrl('http://localhost:5000/api/v1', false);
      assert.equal(url, 'http://localhost:5000/api/v1');
    });

    it('defaults to /api/v1 in development mode when VITE_API_URL is undefined (Vite proxy)', () => {
      assert.equal(resolveApiBaseUrl(undefined, false), '/api/v1');
      assert.equal(resolveApiBaseUrl('', false), '/api/v1');
    });
  });

  // --------------------------------------------------------------------------
  // 2. Upstream Target Resolution (getUpstreamUrl)
  // --------------------------------------------------------------------------
  describe('2. getUpstreamUrl Upstream Resolution', () => {
    it('defaults to production Render service when env is empty', () => {
      assert.equal(getUpstreamUrl({}), DEFAULT_UPSTREAM_URL);
      assert.equal(getUpstreamUrl(undefined), DEFAULT_UPSTREAM_URL);
    });

    it('resolves API_UPSTREAM_URL and normalizes trailing slashes', () => {
      const target = getUpstreamUrl({
        API_UPSTREAM_URL: 'https://custom-api.example.com/',
      });
      assert.equal(target, 'https://custom-api.example.com');
    });

    it('strips duplicate /api/v1 from configured upstream URL', () => {
      const target = getUpstreamUrl({
        API_UPSTREAM_URL: 'https://custom-api.example.com/api/v1',
      });
      assert.equal(target, 'https://custom-api.example.com');
    });

    it('supports BACKEND_URL, API_URL, and RENDER_API_URL aliases', () => {
      assert.equal(
        getUpstreamUrl({ BACKEND_URL: 'https://backend.example.com' }),
        'https://backend.example.com'
      );
      assert.equal(
        getUpstreamUrl({ API_URL: 'https://api.example.com' }),
        'https://api.example.com'
      );
      assert.equal(
        getUpstreamUrl({ RENDER_API_URL: 'https://render.example.com' }),
        'https://render.example.com'
      );
    });
  });

  // --------------------------------------------------------------------------
  // 3. Set-Cookie Sanitization (sanitizeSetCookieHeader)
  // --------------------------------------------------------------------------
  describe('3. Set-Cookie Header Sanitization', () => {
    it('strips Domain attribute so cookie becomes host-only to Pages domain', () => {
      const upstreamCookie =
        'cf_auth=jwt.token.here; Domain=careerforge-api-h2ce.onrender.com; Path=/; HttpOnly; Secure; SameSite=Lax';
      const sanitized = sanitizeSetCookieHeader(upstreamCookie);

      assert.equal(sanitized.includes('Domain='), false);
      assert.equal(sanitized.includes('onrender.com'), false);
      assert.match(sanitized, /cf_auth=jwt\.token\.here/);
      assert.match(sanitized, /HttpOnly/);
      assert.match(sanitized, /Secure/);
      assert.match(sanitized, /SameSite=Lax/);
    });

    it('normalizes SameSite=None to SameSite=Lax for same-origin architecture', () => {
      const upstreamCookie =
        'cf_auth=jwt.token.here; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=604800';
      const sanitized = sanitizeSetCookieHeader(upstreamCookie);

      assert.equal(sanitized.includes('SameSite=None'), false);
      assert.match(sanitized, /SameSite=Lax/);
      assert.match(sanitized, /Max-Age=604800/);
    });

    it('preserves existing SameSite=Lax unchanged', () => {
      const upstreamCookie =
        'cf_auth=jwt.token.here; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800';
      const sanitized = sanitizeSetCookieHeader(upstreamCookie);

      assert.match(sanitized, /SameSite=Lax/);
    });

    it('properly preserves cookie expiration on logout (Max-Age=0)', () => {
      const logoutCookie =
        'cf_auth=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
      const sanitized = sanitizeSetCookieHeader(logoutCookie);

      assert.match(sanitized, /Max-Age=0/);
      assert.match(sanitized, /SameSite=Lax/);
      assert.match(sanitized, /Expires=Thu, 01 Jan 1970/);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Cloudflare Pages Function onRequest Handler Behavior
  // --------------------------------------------------------------------------
  describe('4. onRequest Handler Execution & Forwarding', () => {
    it('bypasses proxy and calls next() for non-/api/v1 routes', async () => {
      let nextCalled = false;
      const context = {
        request: new Request(
          'https://careerforge-8oq.pages.dev/student/dashboard'
        ),
        env: {},
        next: async () => {
          nextCalled = true;
          return new Response('static-page', { status: 200 });
        },
        functionPath: '/api/v1',
        waitUntil: () => {},
        params: {},
        data: {},
      };

      const response = await onRequest(context);
      assert.equal(
        nextCalled,
        true,
        'Must call context.next() for non-API routes'
      );
      assert.equal(await response.text(), 'static-page');
    });

    it('forwards GET request with query params, headers, and client IP', async () => {
      let capturedUrl = '';
      let capturedMethod = '';
      let capturedHeaders = null;

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url, init) => {
        capturedUrl = url.toString();
        capturedMethod = init?.method || 'GET';
        capturedHeaders = init?.headers;
        return new Response(
          JSON.stringify({ success: true, data: { user: 'test' } }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      };

      try {
        const reqHeaders = new Headers({
          'User-Agent': 'Mozilla/5.0 TestBrowser',
          Cookie: 'cf_auth=valid.session.token; theme=dark',
          Accept: 'application/json',
          'CF-Connecting-IP': '198.51.100.42',
        });

        const context = {
          request: new Request(
            'https://careerforge-8oq.pages.dev/api/v1/auth/me?format=full',
            { method: 'GET', headers: reqHeaders }
          ),
          env: { API_UPSTREAM_URL: 'https://test-upstream.internal' },
          next: async () => new Response('next', { status: 404 }),
          functionPath: '/api/v1',
          waitUntil: () => {},
          params: { path: ['auth', 'me'] },
          data: {},
        };

        const res = await onRequest(context);
        assert.equal(res.status, 200);

        assert.equal(
          capturedUrl,
          'https://test-upstream.internal/api/v1/auth/me?format=full',
          'Target URL must combine upstream base, pathname, and query'
        );
        assert.equal(capturedMethod, 'GET');

        // Check forwarded headers
        assert.equal(
          capturedHeaders.get('cookie'),
          'cf_auth=valid.session.token; theme=dark',
          'Cookie header must be forwarded to upstream'
        );
        assert.equal(
          capturedHeaders.get('x-forwarded-for'),
          '198.51.100.42',
          'Client IP must be forwarded'
        );
        assert.equal(
          capturedHeaders.get('origin'),
          'https://careerforge-8oq.pages.dev',
          'Origin header must default to Pages origin for CSRF validation'
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('forwards POST request body, preserves Content-Type, and forwards Set-Cookie response', async () => {
      let capturedBody = '';
      let capturedHeaders = null;

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url, init) => {
        capturedHeaders = init?.headers;
        if (init?.body) {
          capturedBody =
            typeof init.body === 'string'
              ? init.body
              : await new Response(init.body).text();
        }

        const respHeaders = new Headers({
          'Content-Type': 'application/json',
          'Set-Cookie':
            'cf_auth=new.jwt.session; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=604800',
        });

        return new Response(
          JSON.stringify({ success: true, user: { id: 'u1' } }),
          {
            status: 200,
            headers: respHeaders,
          }
        );
      };

      try {
        const loginPayload = JSON.stringify({
          email: 'user@test.com',
          password: 'password123',
        });
        const reqHeaders = new Headers({
          'Content-Type': 'application/json',
          Origin: 'https://careerforge-8oq.pages.dev',
          Referer: 'https://careerforge-8oq.pages.dev/login',
        });

        const context = {
          request: new Request(
            'https://careerforge-8oq.pages.dev/api/v1/auth/login',
            {
              method: 'POST',
              headers: reqHeaders,
              body: loginPayload,
            }
          ),
          env: {},
          next: async () => new Response('next', { status: 404 }),
          functionPath: '/api/v1',
          waitUntil: () => {},
          params: { path: ['auth', 'login'] },
          data: {},
        };

        const res = await onRequest(context);
        assert.equal(res.status, 200);
        assert.equal(
          capturedBody,
          loginPayload,
          'Request body must be forwarded intact'
        );
        assert.equal(
          capturedHeaders.get('origin'),
          'https://careerforge-8oq.pages.dev',
          'Origin must be forwarded for CSRF check'
        );

        // Verify Set-Cookie is forwarded with SameSite=Lax and no domain
        const setCookie = res.headers.get('set-cookie');
        assert.ok(setCookie, 'Response must carry Set-Cookie header');
        assert.match(setCookie, /cf_auth=new\.jwt\.session/);
        assert.match(setCookie, /SameSite=Lax/);
        assert.match(setCookie, /HttpOnly/);
        assert.match(setCookie, /Secure/);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('passes through upstream 401 Unauthorized status and body without modification', async () => {
      const originalFetch = globalThis.fetch;
      const errorPayload = {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Token expired or missing' },
      };

      globalThis.fetch = async () => {
        return new Response(JSON.stringify(errorPayload), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      try {
        const context = {
          request: new Request(
            'https://careerforge-8oq.pages.dev/api/v1/students/me'
          ),
          env: {},
          next: async () => new Response('next', { status: 404 }),
          functionPath: '/api/v1',
          waitUntil: () => {},
          params: { path: ['students', 'me'] },
          data: {},
        };

        const res = await onRequest(context);
        assert.equal(res.status, 401);
        const data = await res.json();
        assert.deepEqual(data, errorPayload);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('returns structured 502 GATEWAY_ERROR when upstream fetch encounters network failure', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        throw new Error('Connection refused / Render service unavailable');
      };

      try {
        const context = {
          request: new Request(
            'https://careerforge-8oq.pages.dev/api/v1/auth/me'
          ),
          env: {},
          next: async () => new Response('next', { status: 404 }),
          functionPath: '/api/v1',
          waitUntil: () => {},
          params: { path: ['auth', 'me'] },
          data: {},
        };

        const res = await onRequest(context);
        assert.equal(res.status, 502);
        const data = await res.json();
        assert.equal(data.success, false);
        assert.equal(data.error.code, 'GATEWAY_ERROR');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('forwards OPTIONS preflight requests correctly', async () => {
      let capturedMethod = '';
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url, init) => {
        capturedMethod = init?.method || '';
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          },
        });
      };

      try {
        const context = {
          request: new Request(
            'https://careerforge-8oq.pages.dev/api/v1/auth/login',
            {
              method: 'OPTIONS',
            }
          ),
          env: {},
          next: async () => new Response('next', { status: 404 }),
          functionPath: '/api/v1',
          waitUntil: () => {},
          params: { path: ['auth', 'login'] },
          data: {},
        };

        const res = await onRequest(context);
        assert.equal(res.status, 204);
        assert.equal(capturedMethod, 'OPTIONS');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // --------------------------------------------------------------------------
  // 5. Invariants & Source Integrity Verification
  // --------------------------------------------------------------------------
  describe('5. Source Integrity & Invariants', () => {
    it('apiClient in apps/web/src/lib/api.ts retains withCredentials: true', () => {
      const content = fs.readFileSync(
        path.resolve(webDir, 'src/lib/api.ts'),
        'utf8'
      );
      assert.match(content, /withCredentials:\s*true/);
    });

    it('apiClient uses resolveApiBaseUrl for its baseURL', () => {
      const content = fs.readFileSync(
        path.resolve(webDir, 'src/lib/api.ts'),
        'utf8'
      );
      assert.match(
        content,
        /baseURL:\s*resolveApiBaseUrl\(import\.meta\.env\.VITE_API_URL\)/
      );
    });

    it('both apps/web/functions and root functions expose onRequest handler', () => {
      const webFnPath = path.resolve(webDir, 'functions/api/v1/[[path]].ts');
      const rootFnPath = path.resolve(
        webDir,
        '../../functions/api/v1/[[path]].ts'
      );

      assert.ok(
        fs.existsSync(webFnPath),
        'apps/web/functions/api/v1/[[path]].ts must exist'
      );
      assert.ok(
        fs.existsSync(rootFnPath),
        'functions/api/v1/[[path]].ts must exist'
      );

      const webFnContent = fs.readFileSync(webFnPath, 'utf8');
      const rootFnContent = fs.readFileSync(rootFnPath, 'utf8');

      assert.match(webFnContent, /export\s+const\s+onRequest/);
      assert.match(rootFnContent, /onRequest/);
    });
  });
});
