import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { loginSchema, registerSchema } from '@careerforge/validation';

// Mock localStorage for storage testing
class MockLocalStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

// Storage helpers directly testable in Node environment
const TOKEN_KEY = 'careerforge_token';
const USER_KEY = 'careerforge_user';

function createAuthStorage(storage) {
  return {
    getToken() {
      try {
        return storage.getItem(TOKEN_KEY);
      } catch {
        return null;
      }
    },
    setToken(token) {
      try {
        storage.setItem(TOKEN_KEY, token);
      } catch {}
    },
    removeToken() {
      try {
        storage.removeItem(TOKEN_KEY);
      } catch {}
    },
    getUser() {
      try {
        const item = storage.getItem(USER_KEY);
        if (!item) return null;
        const parsed = JSON.parse(item);
        if (parsed && typeof parsed === 'object' && parsed.id && parsed.email) {
          return parsed;
        }
        return null;
      } catch {
        storage.removeItem(USER_KEY);
        return null;
      }
    },
    setUser(user) {
      try {
        storage.setItem(USER_KEY, JSON.stringify(user));
      } catch {}
    },
    removeUser() {
      try {
        storage.removeItem(USER_KEY);
      } catch {}
    },
    clearSession() {
      storage.removeItem(TOKEN_KEY);
      storage.removeItem(USER_KEY);
    },
  };
}

// JWT decoder test implementation
function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(base64, 'base64').toString('utf8');
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || !parsed.sub || !parsed.email) {
      return null;
    }
    if (typeof parsed.exp === 'number' && parsed.exp * 1000 <= Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// Route protection security helpers
function isSafeRedirectPath(path) {
  if (!path || typeof path !== 'string') return false;
  return path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\');
}

function getRoleDefaultPath(role) {
  switch (role) {
    case 'STUDENT':
      return '/student/jobs';
    case 'RECRUITER':
      return '/recruiter/dashboard';
    case 'ADMIN':
      return '/admin/moderation';
    default:
      return '/login';
  }
}

describe('Frontend Authentication Suite (Phase 5.2)', () => {
  describe('Login Form Validation (loginSchema)', () => {
    it('should validate valid email and password format', () => {
      const result = loginSchema.safeParse({
        email: 'student@example.com',
        password: 'Password123!',
      });
      assert.equal(result.success, true);
    });

    it('should normalize email to lowercase and trim spaces', () => {
      const result = loginSchema.safeParse({
        email: '  STUDENT@example.COM  ',
        password: 'Password123!',
      });
      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.email, 'student@example.com');
      }
    });

    it('should reject invalid email format', () => {
      const result = loginSchema.safeParse({
        email: 'not-an-email',
        password: 'Password123!',
      });
      assert.equal(result.success, false);
      assert.match(result.error.issues[0].message, /valid email/i);
    });

    it('should reject empty password', () => {
      const result = loginSchema.safeParse({
        email: 'user@example.com',
        password: '',
      });
      assert.equal(result.success, false);
      assert.match(result.error.issues[0].message, /required/i);
    });

    it('should reject password exceeding 72 characters', () => {
      const result = loginSchema.safeParse({
        email: 'user@example.com',
        password: 'A'.repeat(73),
      });
      assert.equal(result.success, false);
      assert.match(result.error.issues[0].message, /72 characters/i);
    });
  });

  describe('Register Form Validation (registerSchema)', () => {
    it('should allow valid STUDENT registration', () => {
      const result = registerSchema.safeParse({
        email: 'student@university.edu',
        password: 'SecurePassword123!',
        role: 'STUDENT',
      });
      assert.equal(result.success, true);
    });

    it('should allow valid RECRUITER registration', () => {
      const result = registerSchema.safeParse({
        email: 'recruiter@techcorp.com',
        password: 'CompanySecret456@',
        role: 'RECRUITER',
      });
      assert.equal(result.success, true);
    });

    it('should forbid ADMIN registration', () => {
      const result = registerSchema.safeParse({
        email: 'admin@system.local',
        password: 'AdminPassword789!',
        role: 'ADMIN',
      });
      assert.equal(result.success, false);
      assert.match(result.error.issues[0].message, /STUDENT.*RECRUITER/i);
    });

    it('should require at least 1 number in password', () => {
      const result = registerSchema.safeParse({
        email: 'test@example.com',
        password: 'PasswordWithoutNumber!',
        role: 'STUDENT',
      });
      assert.equal(result.success, false);
      assert.match(result.error.issues[0].message, /number/i);
    });

    it('should require at least 1 special character in password', () => {
      const result = registerSchema.safeParse({
        email: 'test@example.com',
        password: 'PasswordWithoutSpecial123',
        role: 'STUDENT',
      });
      assert.equal(result.success, false);
      assert.match(result.error.issues[0].message, /special character/i);
    });

    it('should require minimum 8 characters in password', () => {
      const result = registerSchema.safeParse({
        email: 'test@example.com',
        password: 'P1!',
        role: 'STUDENT',
      });
      assert.equal(result.success, false);
      assert.match(result.error.issues[0].message, /at least 8 characters/i);
    });
  });

  describe('Auth Storage Abstraction (authStorage)', () => {
    let storage;
    let authStorage;

    beforeEach(() => {
      storage = new MockLocalStorage();
      authStorage = createAuthStorage(storage);
    });

    it('should store and retrieve token safely', () => {
      assert.equal(authStorage.getToken(), null);
      authStorage.setToken('sample-jwt-token');
      assert.equal(authStorage.getToken(), 'sample-jwt-token');
    });

    it('should store and retrieve user object safely', () => {
      assert.equal(authStorage.getUser(), null);
      const user = { id: 'u-1', email: 'test@example.com', role: 'STUDENT' };
      authStorage.setUser(user);
      assert.deepEqual(authStorage.getUser(), user);
    });

    it('should recover gracefully from corrupted user JSON without throwing', () => {
      storage.setItem(USER_KEY, '{invalid-json-string}');
      const user = authStorage.getUser();
      assert.equal(user, null);
      // Corrupted value was safely purged
      assert.equal(storage.getItem(USER_KEY), null);
    });

    it('should wipe both token and user on clearSession', () => {
      authStorage.setToken('tok-123');
      authStorage.setUser({ id: 'u-1', email: 'a@b.com', role: 'STUDENT' });
      assert.notEqual(authStorage.getToken(), null);
      assert.notEqual(authStorage.getUser(), null);

      authStorage.clearSession();
      assert.equal(authStorage.getToken(), null);
      assert.equal(authStorage.getUser(), null);
    });
  });

  describe('JWT Payload Decoding & Expiration (jwt)', () => {
    function makeToken(payload) {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const sig = 'sig123';
      return `${header}.${body}.${sig}`;
    }

    it('should correctly decode valid unexpired token claims', () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600; // 1 hr future
      const token = makeToken({
        sub: 'usr-123',
        email: 'student@domain.edu',
        role: 'STUDENT',
        exp: futureExp,
      });

      const decoded = decodeJwtPayload(token);
      assert.notEqual(decoded, null);
      assert.equal(decoded.sub, 'usr-123');
      assert.equal(decoded.email, 'student@domain.edu');
      assert.equal(decoded.role, 'STUDENT');
    });

    it('should reject expired tokens', () => {
      const pastExp = Math.floor(Date.now() / 1000) - 60; // 1 min in past
      const token = makeToken({
        sub: 'usr-123',
        email: 'student@domain.edu',
        role: 'STUDENT',
        exp: pastExp,
      });

      const decoded = decodeJwtPayload(token);
      assert.equal(decoded, null);
    });

    it('should return null for malformed tokens', () => {
      assert.equal(decodeJwtPayload(''), null);
      assert.equal(decodeJwtPayload('not.enough'), null);
      assert.equal(decodeJwtPayload('a.b.c.d'), null);
      assert.equal(decodeJwtPayload('a.{invalid}.c'), null);
    });
  });

  describe('Route Protection & Open Redirect Prevention', () => {
    it('should accept valid internal relative paths', () => {
      assert.equal(isSafeRedirectPath('/student/jobs'), true);
      assert.equal(isSafeRedirectPath('/recruiter/dashboard?tab=applicants'), true);
      assert.equal(isSafeRedirectPath('/admin/moderation'), true);
    });

    it('should reject open redirect vectors', () => {
      assert.equal(isSafeRedirectPath('//attacker.com'), false);
      assert.equal(isSafeRedirectPath('//evil.com/phishing'), false);
      assert.equal(isSafeRedirectPath('/\\attacker.com'), false);
      assert.equal(isSafeRedirectPath('https://external-domain.com'), false);
      assert.equal(isSafeRedirectPath('javascript:alert(1)'), false);
      assert.equal(isSafeRedirectPath(''), false);
      assert.equal(isSafeRedirectPath(undefined), false);
    });

    it('should resolve default landing paths by role', () => {
      assert.equal(getRoleDefaultPath('STUDENT'), '/student/jobs');
      assert.equal(getRoleDefaultPath('RECRUITER'), '/recruiter/dashboard');
      assert.equal(getRoleDefaultPath('ADMIN'), '/admin/moderation');
      assert.equal(getRoleDefaultPath(null), '/login');
    });
  });
});
