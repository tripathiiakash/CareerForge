import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '../src');

// Mirror of isSafeRedirectPath from ProtectedRoute.tsx
function isSafeRedirectPath(path) {
  if (!path || typeof path !== 'string') return false;
  return path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\');
}

// Mirror of getRoleDefaultPath from ProtectedRoute.tsx
function getRoleDefaultPath(role) {
  switch (role) {
    case 'STUDENT':
      return '/student/dashboard';
    case 'RECRUITER':
      return '/recruiter/dashboard';
    case 'ADMIN':
      return '/admin/moderation';
    default:
      return '/login';
  }
}

describe('SEC-01: Frontend HttpOnly Cookie Auth Migration Suite', () => {
  // --------------------------------------------------------------------------
  // 1. Browser Storage Security Invariants
  // --------------------------------------------------------------------------
  describe('1. Storage Security Invariants (No JWT in localStorage/sessionStorage)', () => {
    it('authStorage.ts: getToken() must return null (JWT never exposed to JS)', () => {
      const authStorageContent = fs.readFileSync(
        path.resolve(srcDir, 'auth/authStorage.ts'),
        'utf8'
      );
      assert.match(
        authStorageContent,
        /export\s+function\s+getToken\(\)[^{]*\{\s*return\s+null;/m,
        'getToken() must return null to ensure JS never reads token'
      );
    });

    it('authStorage.ts: setToken() must NOT persist token in localStorage', () => {
      const authStorageContent = fs.readFileSync(
        path.resolve(srcDir, 'auth/authStorage.ts'),
        'utf8'
      );
      assert.equal(
        authStorageContent.includes('localStorage.setItem(TOKEN_STORAGE_KEY'),
        false,
        'Must not store token in localStorage'
      );
    });

    it('No source file in apps/web/src references sessionStorage', () => {
      function checkDir(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            checkDir(fullPath);
          } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
            const content = fs.readFileSync(fullPath, 'utf8');
            assert.equal(
              content.includes('sessionStorage'),
              false,
              `Found sessionStorage in ${fullPath}`
            );
          }
        }
      }
      checkDir(srcDir);
    });

    it('No source file in apps/web/src references document.cookie', () => {
      function checkDir(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            checkDir(fullPath);
          } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
            const content = fs.readFileSync(fullPath, 'utf8');
            assert.equal(
              content.includes('document.cookie'),
              false,
              `Found document.cookie in ${fullPath}`
            );
          }
        }
      }
      checkDir(srcDir);
    });

    it('No source file in apps/web/src sets JWT tokens in browser storage', () => {
      function checkDir(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            checkDir(fullPath);
          } else if (/\.(ts|tsx)$/.test(entry.name)) {
            const content = fs.readFileSync(fullPath, 'utf8');
            assert.equal(
              content.includes("setItem(TOKEN_STORAGE_KEY") ||
              content.includes("setItem('careerforge_token'"),
              false,
              `Found token storage setItem in ${fullPath}`
            );
          }
        }
      }
      checkDir(srcDir);
    });
  });

  // --------------------------------------------------------------------------
  // 2. ApiClient Configuration & Interceptor Verification
  // --------------------------------------------------------------------------
  describe('2. ApiClient withCredentials & Header Sanitization', () => {
    it('apiClient is configured with withCredentials: true', () => {
      const apiFileContent = fs.readFileSync(path.resolve(srcDir, 'lib/api.ts'), 'utf8');
      assert.match(
        apiFileContent,
        /withCredentials:\s*true/,
        'apiClient must have withCredentials: true so cookies are sent with cross-origin requests'
      );
    });

    it('apiClient request interceptor does NOT attach Authorization: Bearer header', () => {
      const apiFileContent = fs.readFileSync(path.resolve(srcDir, 'lib/api.ts'), 'utf8');
      assert.equal(
        apiFileContent.includes('Authorization = `Bearer'),
        false,
        'apiClient must not inject Authorization Bearer from storage'
      );
    });

    it('apiClient handles 401 Unauthorized by dispatching careerforge:unauthorized', () => {
      const apiFileContent = fs.readFileSync(path.resolve(srcDir, 'lib/api.ts'), 'utf8');
      assert.match(
        apiFileContent,
        /careerforge:unauthorized/,
        'apiClient must notify auth listeners on 401'
      );
    });
  });

  // --------------------------------------------------------------------------
  // 3. AuthContext Rehydration & Session Flow
  // --------------------------------------------------------------------------
  describe('3. AuthContext Session Rehydration via Backend API', () => {
    it('AuthContext queries GET /auth/me on mount for session rehydration', () => {
      const authContextContent = fs.readFileSync(
        path.resolve(srcDir, 'auth/AuthContext.tsx'),
        'utf8'
      );
      assert.match(
        authContextContent,
        /\/auth\/me/,
        'AuthContext must call GET /auth/me to rehydrate session from HttpOnly cookie'
      );
    });

    it('AuthContext calls POST /auth/logout to clear backend cookie session', () => {
      const authContextContent = fs.readFileSync(
        path.resolve(srcDir, 'auth/AuthContext.tsx'),
        'utf8'
      );
      assert.match(
        authContextContent,
        /\/auth\/logout/,
        'AuthContext must call POST /auth/logout to instruct backend to clear HttpOnly cookie'
      );
    });
  });

  // --------------------------------------------------------------------------
  // 4. Auth Routing & Navigation Safeguards
  // --------------------------------------------------------------------------
  describe('4. Auth Routing & Navigation Safeguards', () => {
    it('isSafeRedirectPath prevents open-redirect vectors', () => {
      // Safe paths
      assert.equal(isSafeRedirectPath('/student/dashboard'), true);
      assert.equal(isSafeRedirectPath('/recruiter/jobs/new'), true);
      assert.equal(isSafeRedirectPath('/jobs?search=react'), true);

      // Dangerous open redirect vectors
      assert.equal(isSafeRedirectPath('https://evil.com'), false);
      assert.equal(isSafeRedirectPath('//evil.com'), false);
      assert.equal(isSafeRedirectPath('/\\evil.com'), false);
      assert.equal(isSafeRedirectPath('javascript:alert(1)'), false);
      assert.equal(isSafeRedirectPath(''), false);
      assert.equal(isSafeRedirectPath(undefined), false);
    });

    it('getRoleDefaultPath routes each role to its dedicated portal', () => {
      assert.equal(getRoleDefaultPath('STUDENT'), '/student/dashboard');
      assert.equal(getRoleDefaultPath('RECRUITER'), '/recruiter/dashboard');
      assert.equal(getRoleDefaultPath('ADMIN'), '/admin/moderation');
      assert.equal(getRoleDefaultPath(null), '/login');
    });
  });
});
