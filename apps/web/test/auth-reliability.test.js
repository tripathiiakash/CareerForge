import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';

import {
  extractApiError,
  mapHttpStatusToCode,
  mapHttpStatusToMessage,
  resolveApiBaseUrl,
} from '../src/lib/api.ts';

function createAxiosError(status, data, message = `Request failed with status code ${status}`, code) {
  const error = new Error(message);
  error.isAxiosError = true;
  error.name = 'AxiosError';
  if (code) {
    error.code = code;
  }
  if (status !== undefined) {
    error.response = {
      status,
      statusText: String(status),
      data,
      headers: {},
      config: { url: '/api/v1/auth/login' },
    };
  }
  return error;
}

describe('Authentication 4xx/5xx Reliability & Error Normalization Suite', () => {
  // =========================================================================
  // 1. HTTP 400: Validation Errors
  // =========================================================================
  describe('1. Validation Failure Normalization (HTTP 400)', () => {
    it('extracts structured validation error message and field details', () => {
      const err = createAxiosError(400, {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'email: Must be a valid email format',
          details: [{ field: 'email', issue: 'Must be a valid email format' }],
        },
      });

      const parsed = extractApiError(err);
      assert.equal(parsed.code, 'VALIDATION_ERROR');
      assert.equal(parsed.message, 'email: Must be a valid email format');
      assert.deepEqual(parsed.details, [
        { field: 'email', issue: 'Must be a valid email format' },
      ]);
    });

    it('extracts NestJS standard validation array format into field details', () => {
      const err = createAxiosError(400, {
        statusCode: 400,
        message: ['email must be a valid email', 'password must be longer than 8 characters'],
        error: 'Bad Request',
      });

      const parsed = extractApiError(err);
      assert.equal(parsed.code, 'VALIDATION_ERROR');
      assert.equal(parsed.message, 'email must be a valid email');
      assert.equal(parsed.details.length, 2);
    });

    it('falls back to safe validation message when body is empty or non-JSON', () => {
      const err = createAxiosError(400, '');
      const parsed = extractApiError(err);
      assert.equal(parsed.code, 'VALIDATION_ERROR');
      assert.equal(parsed.message, 'Invalid request. Please check your submission.');
    });
  });

  // =========================================================================
  // 2. HTTP 401: Unauthorized / Invalid Credentials
  // =========================================================================
  describe('2. Invalid Credentials Normalization (HTTP 401)', () => {
    it('extracts standard Invalid credentials from backend envelope', () => {
      const err = createAxiosError(401, {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid credentials',
        },
      });

      const parsed = extractApiError(err);
      assert.equal(parsed.code, 'UNAUTHORIZED');
      assert.equal(parsed.message, 'Invalid credentials');
    });

    it('falls back to "Invalid credentials" message when body is empty or non-JSON', () => {
      const err = createAxiosError(401, null);
      const parsed = extractApiError(err);
      assert.equal(parsed.code, 'UNAUTHORIZED');
      assert.equal(parsed.message, 'Invalid credentials');
    });
  });

  // =========================================================================
  // 3. HTTP 403: Forbidden / Account Suspended
  // =========================================================================
  describe('3. Account Suspended / Forbidden Normalization (HTTP 403)', () => {
    it('extracts suspended account message from backend envelope', () => {
      const err = createAxiosError(403, {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Your account has been suspended. Contact support.',
        },
      });

      const parsed = extractApiError(err);
      assert.equal(parsed.code, 'FORBIDDEN');
      assert.equal(parsed.message, 'Your account has been suspended. Contact support.');
    });

    it('falls back to safe forbidden message when body is empty or non-JSON', () => {
      const err = createAxiosError(403, '');
      const parsed = extractApiError(err);
      assert.equal(parsed.code, 'FORBIDDEN');
      assert.match(parsed.message, /access denied|suspended/i);
    });
  });

  // =========================================================================
  // 4. HTTP 409: Duplicate Registration Conflict
  // =========================================================================
  describe('4. Duplicate Email Conflict Normalization (HTTP 409)', () => {
    it('extracts conflict message from backend registration response', () => {
      const err = createAxiosError(409, {
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'Email is already registered',
        },
      });

      const parsed = extractApiError(err);
      assert.equal(parsed.code, 'CONFLICT');
      assert.equal(parsed.message, 'Email is already registered');
    });

    it('falls back to clear duplicate email message when body is non-JSON', () => {
      const err = createAxiosError(409, 'Conflict');
      const parsed = extractApiError(err);
      assert.equal(parsed.code, 'CONFLICT');
      assert.equal(
        parsed.message,
        'This email address is already registered. Please sign in instead.'
      );
    });
  });

  // =========================================================================
  // 5. HTTP 429: Rate Limiting & Protection Against Raw Technical Strings
  // =========================================================================
  describe('5. Rate-Limited Response Normalization (HTTP 429)', () => {
    it('extracts structured rate-limit message from backend RateLimitGuard', () => {
      const err = createAxiosError(429, {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many login attempts. Please try again later.',
        },
      });

      const parsed = extractApiError(err);
      assert.equal(parsed.code, 'RATE_LIMITED');
      assert.equal(parsed.message, 'Too many login attempts. Please try again later.');
    });

    it('NEVER displays "Request failed with status code 429" when body is text or HTML', () => {
      const err = createAxiosError(
        429,
        'Too Many Requests',
        'Request failed with status code 429'
      );

      const parsed = extractApiError(err);
      assert.equal(parsed.code, 'RATE_LIMITED');
      assert.notEqual(parsed.message, 'Request failed with status code 429');
      assert.match(parsed.message, /too many attempts/i);
    });

    it('handles legacy string error payload: { error: "Too Many Requests" }', () => {
      const err = createAxiosError(429, { error: 'Too Many Requests' });
      const parsed = extractApiError(err);
      assert.equal(parsed.code, 'RATE_LIMITED');
      assert.equal(parsed.message, 'Too Many Requests');
    });
  });

  // =========================================================================
  // 6. HTTP 500: Internal Server Error Protection
  // =========================================================================
  describe('6. Internal Server Error Normalization (HTTP 500)', () => {
    it('extracts backend message when available without leaking stack trace', () => {
      const err = createAxiosError(500, {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected internal server error occurred.',
        },
      });

      const parsed = extractApiError(err);
      assert.equal(parsed.code, 'INTERNAL_ERROR');
      assert.equal(parsed.message, 'An unexpected internal server error occurred.');
    });

    it('protects against raw HTML 500 page from upstream proxy', () => {
      const err = createAxiosError(
        500,
        '<html><body>500 Internal Server Error</body></html>',
        'Request failed with status code 500'
      );

      const parsed = extractApiError(err);
      assert.equal(parsed.code, 'INTERNAL_ERROR');
      assert.notEqual(parsed.message, 'Request failed with status code 500');
      assert.match(parsed.message, /unexpected server error/i);
    });
  });

  // =========================================================================
  // 7. HTTP 502/503/504: Upstream Gateway & Render Cold Start / Deployment
  // =========================================================================
  describe('7. Upstream Availability Normalization (HTTP 502, 503, 504)', () => {
    it('normalizes Render 502 no-deploy text into friendly SERVICE_UNAVAILABLE', () => {
      const err = createAxiosError(
        502,
        'no-deploy',
        'Request failed with status code 502'
      );

      const parsed = extractApiError(err);
      assert.equal(parsed.code, 'SERVICE_UNAVAILABLE');
      assert.notEqual(parsed.message, 'Request failed with status code 502');
      assert.notEqual(parsed.message, 'no-deploy');
      assert.match(parsed.message, /temporarily unavailable|restarting/i);
    });

    it('normalizes 503 HTML maintenance/deploying page into SERVICE_UNAVAILABLE', () => {
      const err = createAxiosError(
        503,
        '<!DOCTYPE html><html><body><h1>503 Service Unavailable</h1></body></html>',
        'Request failed with status code 503'
      );

      const parsed = extractApiError(err);
      assert.equal(parsed.code, 'SERVICE_UNAVAILABLE');
      assert.match(parsed.message, /temporarily unavailable|restarting/i);
    });

    it('normalizes 504 Gateway Timeout into GATEWAY_TIMEOUT', () => {
      const err = createAxiosError(
        504,
        'Gateway Timeout',
        'Request failed with status code 504'
      );

      const parsed = extractApiError(err);
      assert.equal(parsed.code, 'GATEWAY_TIMEOUT');
      assert.match(parsed.message, /took too long to respond/i);
    });
  });

  // =========================================================================
  // 8. Network Failure & Client Timeout Handling
  // =========================================================================
  describe('8. Network Timeout & Disconnect Normalization', () => {
    it('normalizes ECONNABORTED / timeout into TIMEOUT_ERROR instead of blaming internet', () => {
      const err = createAxiosError(
        undefined,
        undefined,
        'timeout of 30000ms exceeded',
        'ECONNABORTED'
      );

      const parsed = extractApiError(err);
      assert.equal(parsed.code, 'TIMEOUT_ERROR');
      assert.match(parsed.message, /timed out/i);
      assert.doesNotMatch(parsed.message, /check your internet/i);
    });

    it('normalizes true network disconnection into NETWORK_ERROR', () => {
      const err = createAxiosError(undefined, undefined, 'Network Error');
      const parsed = extractApiError(err);
      assert.equal(parsed.code, 'NETWORK_ERROR');
      assert.match(parsed.message, /check your internet connection/i);
    });
  });

  // =========================================================================
  // 9. Generic Error String Sanitization
  // =========================================================================
  describe('9. Generic Error String Sanitization', () => {
    it('sanitizes standard Error with "Request failed with status code 429"', () => {
      const genericErr = new Error('Request failed with status code 429');
      const parsed = extractApiError(genericErr);
      assert.equal(parsed.code, 'RATE_LIMITED');
      assert.match(parsed.message, /too many attempts/i);
    });

    it('sanitizes standard Error with "Request failed with status code 502"', () => {
      const genericErr = new Error('Request failed with status code 502');
      const parsed = extractApiError(genericErr);
      assert.equal(parsed.code, 'SERVICE_UNAVAILABLE');
      assert.match(parsed.message, /temporarily unavailable|restarting/i);
    });

    it('handles unknown non-error primitives safely', () => {
      assert.equal(extractApiError(undefined).code, 'UNKNOWN_ERROR');
      assert.equal(extractApiError(null).code, 'UNKNOWN_ERROR');
      assert.equal(extractApiError(42).code, 'UNKNOWN_ERROR');
    });
  });

  // =========================================================================
  // 10. Helper Mappings
  // =========================================================================
  describe('10. HTTP Status Mapping Helpers', () => {
    it('maps codes accurately', () => {
      assert.equal(mapHttpStatusToCode(400), 'VALIDATION_ERROR');
      assert.equal(mapHttpStatusToCode(401), 'UNAUTHORIZED');
      assert.equal(mapHttpStatusToCode(403), 'FORBIDDEN');
      assert.equal(mapHttpStatusToCode(404), 'NOT_FOUND');
      assert.equal(mapHttpStatusToCode(409), 'CONFLICT');
      assert.equal(mapHttpStatusToCode(429), 'RATE_LIMITED');
      assert.equal(mapHttpStatusToCode(500), 'INTERNAL_ERROR');
      assert.equal(mapHttpStatusToCode(502), 'SERVICE_UNAVAILABLE');
      assert.equal(mapHttpStatusToCode(503), 'SERVICE_UNAVAILABLE');
      assert.equal(mapHttpStatusToCode(504), 'GATEWAY_TIMEOUT');
      assert.equal(mapHttpStatusToCode(418), 'HTTP_418');
    });

    it('provides user-friendly messages for all mapped codes', () => {
      [400, 401, 403, 404, 409, 429, 500, 502, 503, 504].forEach((code) => {
        const msg = mapHttpStatusToMessage(code);
        assert.ok(msg && msg.length > 5, `Status ${code} must have a descriptive message`);
        assert.doesNotMatch(msg, /status code/i, `Status ${code} must not expose technical status code`);
      });
    });
  });
});
