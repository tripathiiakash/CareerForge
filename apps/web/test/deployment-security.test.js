import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Frontend Deployment Security & CSP Suite (SEC-03)', () => {
  const vercelConfigPath = path.resolve(__dirname, '../vercel.json');

  it('1. should find vercel.json in apps/web root and parse as valid JSON', () => {
    assert.ok(
      fs.existsSync(vercelConfigPath),
      'apps/web/vercel.json must exist for production deployment'
    );

    const raw = fs.readFileSync(vercelConfigPath, 'utf8');
    let parsed;
    assert.doesNotThrow(() => {
      parsed = JSON.parse(raw);
    }, 'apps/web/vercel.json must be valid JSON');

    assert.ok(Array.isArray(parsed.headers), 'vercel.json must declare headers array');
    assert.ok(Array.isArray(parsed.rewrites), 'vercel.json must declare rewrites array');
  });

  it('2. should enforce SPA client-side routing rewrites to /index.html', () => {
    const config = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));
    const spaRewrite = config.rewrites.find(
      (r) => r.source === '/(.*)' && r.destination === '/index.html'
    );
    assert.ok(
      spaRewrite,
      'Must contain a fallback rewrite rule pointing all routes to /index.html'
    );
  });

  it('3. should define strict Content-Security-Policy adhering to SEC-03 audit specification', () => {
    const config = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));
    const globalHeaderGroup = config.headers.find((h) => h.source === '/(.*)');
    assert.ok(globalHeaderGroup, 'Must have a header configuration for source "/(.*)"');

    const cspHeader = globalHeaderGroup.headers.find(
      (h) => h.key.toLowerCase() === 'content-security-policy'
    );
    assert.ok(cspHeader, 'Must define Content-Security-Policy header');

    const csp = cspHeader.value;

    // Strict baseline: default-src 'self'
    assert.ok(csp.includes("default-src 'self'"), 'CSP must include default-src \'self\'');

    // Script restrictions: strictly 'self', NO unsafe-eval, NO wildcard *
    assert.ok(csp.includes("script-src 'self'"), 'CSP must include script-src \'self\'');
    assert.ok(!csp.includes('unsafe-eval'), 'CSP must NOT permit unsafe-eval');
    assert.ok(!/script-src[^;]*\*/.test(csp), 'CSP script-src must NOT allow wildcard *');

    // Typography: Google Fonts stylesheet & font files
    assert.ok(
      csp.includes('https://fonts.googleapis.com'),
      'CSP must allow fonts.googleapis.com for stylesheet'
    );
    assert.ok(
      csp.includes('https://fonts.gstatic.com'),
      'CSP must allow fonts.gstatic.com for webfont binaries'
    );

    // Dynamic style attributes required by React progress bars & Tailwind
    assert.ok(
      csp.includes("style-src 'self' https://fonts.googleapis.com 'unsafe-inline'"),
      'CSP style-src must allow Google Fonts and unsafe-inline for dynamic component styles'
    );

    // Image sources: logos over HTTPS, data URIs for SVG, blob for PDF preview
    assert.ok(csp.includes("img-src 'self' data: blob: https:"), 'CSP must allow secure image sources');

    // Connect sources: self and HTTPS for API; no direct AI provider endpoints from browser
    assert.ok(csp.includes("connect-src 'self' https:"), 'CSP connect-src must allow self and https API');
    assert.ok(!csp.includes('generativelanguage.googleapis.com'), 'Browser should never call Gemini directly');

    // Defense-in-depth restrictions
    assert.ok(csp.includes("object-src 'none'"), 'CSP must forbid plugins with object-src \'none\'');
    assert.ok(csp.includes("frame-ancestors 'none'"), 'CSP must forbid clickjacking with frame-ancestors \'none\'');
    assert.ok(csp.includes("base-uri 'self'"), 'CSP must restrict base-uri');
    assert.ok(csp.includes("form-action 'self'"), 'CSP must restrict form-action');
    assert.ok(csp.includes('upgrade-insecure-requests'), 'CSP must enforce upgrade-insecure-requests');
  });

  it('4. should enforce defense-in-depth HTTP security headers (MIME, clickjacking, referrer, permissions)', () => {
    const config = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));
    const globalHeaders = config.headers.find((h) => h.source === '/(.*)').headers;

    const getHeader = (name) =>
      globalHeaders.find((h) => h.key.toLowerCase() === name.toLowerCase())?.value;

    assert.equal(getHeader('X-Content-Type-Options'), 'nosniff');
    assert.equal(getHeader('X-Frame-Options'), 'DENY');
    assert.equal(getHeader('Referrer-Policy'), 'strict-origin-when-cross-origin');
    assert.ok(
      getHeader('Permissions-Policy').includes('camera=()'),
      'Permissions-Policy must restrict sensitive browser capabilities'
    );
  });
});
