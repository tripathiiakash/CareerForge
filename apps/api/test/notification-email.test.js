const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { MockEmailProvider } = require('../dist/modules/notifications/email/mock-email.provider');
const {
  ResendEmailProvider,
  EmailDeliveryError,
} = require('../dist/modules/notifications/email/resend-email.provider');
const { EmailService } = require('../dist/modules/notifications/email/email.service');
const { NotificationModule } = require('../dist/modules/notifications/notification.module');
const { EMAIL_PROVIDER_TOKEN } = require('../dist/modules/notifications/email/email-provider.interface');
const {
  validateEnvironment,
  ConfigValidationError,
} = require('../dist/core/config/config.validator');

describe('Transactional Email Notification Service (Phase 5.17.0)', () => {
  // ---------------------------------------------------------------------------
  // 1. MockEmailProvider Tests
  // ---------------------------------------------------------------------------
  describe('MockEmailProvider', () => {
    it('should successfully record an email in memory with default and custom sender', async () => {
      const provider = new MockEmailProvider();
      assert.equal(provider.count(), 0);

      const result = await provider.send({
        to: 'candidate@example.com',
        subject: 'Application Received',
        html: '<p>Thanks for applying!</p>',
        text: 'Thanks for applying!',
      });

      assert.equal(result.success, true);
      assert.ok(result.messageId.startsWith('mock-msg-'));
      assert.equal(provider.count(), 1);

      const last = provider.getLastEmail();
      assert.ok(last);
      assert.deepEqual(last.to, ['candidate@example.com']);
      assert.equal(last.subject, 'Application Received');
      assert.equal(last.html, '<p>Thanks for applying!</p>');
      assert.equal(last.text, 'Thanks for applying!');
      assert.equal(last.from, 'CareerForge <notifications@careerforge.dev>');
      assert.ok(last.sentAt instanceof Date);
    });

    it('should handle recipient objects with name and email, and arrays of recipients', async () => {
      const provider = new MockEmailProvider();

      await provider.send({
        to: [
          { name: 'Alex Doe', email: 'alex@example.com' },
          'bob@example.com',
        ],
        subject: 'Team Update',
        text: 'Hello team',
        from: 'alerts@careerforge.dev',
        replyTo: 'support@careerforge.dev',
      });

      assert.equal(provider.count(), 1);
      const email = provider.getLastEmail();
      assert.deepEqual(email.to, ['alex@example.com', 'bob@example.com']);
      assert.equal(email.from, 'alerts@careerforge.dev');
      assert.equal(email.replyTo, 'support@careerforge.dev');
    });

    it('should inspect sent emails using helper methods and clear storage', async () => {
      const provider = new MockEmailProvider();

      await provider.send({
        to: 'dev1@example.com',
        subject: 'Welcome',
        text: 'Welcome to CareerForge',
      });
      await provider.send({
        to: 'dev2@example.com',
        subject: 'Job Alert',
        text: 'New role matching your skills',
      });

      assert.equal(provider.count(), 2);
      assert.equal(provider.hasSentEmailTo('dev1@example.com'), true);
      assert.equal(provider.hasSentEmailTo('dev2@example.com'), true);
      assert.equal(provider.hasSentEmailTo('nonexistent@example.com'), false);

      const all = provider.getSentEmails();
      assert.equal(all.length, 2);

      provider.clearSentEmails();
      assert.equal(provider.count(), 0);
      assert.equal(provider.getLastEmail(), undefined);
      assert.equal(provider.hasSentEmailTo('dev1@example.com'), false);
    });

    it('should record idempotencyKey and deduplicate repeated sends with identical idempotencyKey', async () => {
      const provider = new MockEmailProvider();
      const idempotencyKey = 'email:welcome:test-user-123';

      const firstResult = await provider.send({
        to: 'candidate@example.com',
        subject: 'Welcome to CareerForge!',
        text: 'Welcome!',
        idempotencyKey,
      });

      assert.equal(firstResult.success, true);
      assert.equal(provider.count(), 1);
      assert.equal(provider.hasSentEmailWithIdempotencyKey(idempotencyKey), true);

      const record = provider.getSentEmailByIdempotencyKey(idempotencyKey);
      assert.ok(record);
      assert.equal(record.idempotencyKey, idempotencyKey);
      assert.equal(record.messageId, firstResult.messageId);

      // Repeated send with same idempotencyKey (e.g. queue retry)
      const secondResult = await provider.send({
        to: 'candidate@example.com',
        subject: 'Welcome to CareerForge!',
        text: 'Welcome!',
        idempotencyKey,
      });

      assert.equal(secondResult.success, true);
      // Returns same messageId and does NOT append duplicate email record
      assert.equal(secondResult.messageId, firstResult.messageId);
      assert.equal(provider.count(), 1);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. ResendEmailProvider Tests
  // ---------------------------------------------------------------------------
  describe('ResendEmailProvider', () => {
    it('should throw an EmailDeliveryError if RESEND_API_KEY is missing or placeholder', async () => {
      const unconfiguredConfigs = [
        { resendApiKey: undefined, emailFrom: 'noreply@careerforge.dev' },
        { resendApiKey: '', emailFrom: 'noreply@careerforge.dev' },
        { resendApiKey: 'your-resend-api-key-here', emailFrom: 'noreply@careerforge.dev' },
        { resendApiKey: 'your-api-key', emailFrom: 'noreply@careerforge.dev' },
      ];

      for (const config of unconfiguredConfigs) {
        const provider = new ResendEmailProvider(config);
        await assert.rejects(
          () =>
            provider.send({
              to: 'test@example.com',
              subject: 'Test',
              text: 'Body',
            }),
          (err) => {
            assert.ok(err instanceof EmailDeliveryError);
            assert.match(err.message, /RESEND_API_KEY is not configured/);
            return true;
          }
        );
      }
    });

    it('should execute native fetch with expected payload and headers on success', async () => {
      let capturedUrl = '';
      let capturedHeaders = {};
      let capturedBody = null;

      const mockConfig = {
        resendApiKey: 're_test_valid_key_12345',
        emailFrom: 'CareerForge <notifications@careerforge.dev>',
      };
      const provider = new ResendEmailProvider(mockConfig);

      const originalFetch = global.fetch;
      global.fetch = async (url, options) => {
        capturedUrl = url;
        capturedHeaders = options.headers;
        capturedBody = JSON.parse(options.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'resend_msg_abc123' }),
        };
      };

      try {
        const result = await provider.send({
          to: { name: 'Alice Candidate', email: 'alice@example.com' },
          subject: 'Application Status Update',
          html: '<h1>Status: Under Review</h1>',
          text: 'Status: Under Review',
          replyTo: 'recruiter@careerforge.dev',
        });

        assert.equal(capturedUrl, 'https://api.resend.com/emails');
        assert.equal(capturedHeaders['Authorization'], 'Bearer re_test_valid_key_12345');
        assert.equal(capturedHeaders['Content-Type'], 'application/json');

        assert.deepEqual(capturedBody.to, ['Alice Candidate <alice@example.com>']);
        assert.equal(capturedBody.from, 'CareerForge <notifications@careerforge.dev>');
        assert.equal(capturedBody.subject, 'Application Status Update');
        assert.equal(capturedBody.html, '<h1>Status: Under Review</h1>');
        assert.equal(capturedBody.text, 'Status: Under Review');
        assert.equal(capturedBody.reply_to, 'recruiter@careerforge.dev');

        assert.deepEqual(result, {
          success: true,
          messageId: 'resend_msg_abc123',
        });
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should forward Idempotency-Key header to Resend API when idempotencyKey is supplied', async () => {
      let capturedHeaders = {};
      const mockConfig = {
        resendApiKey: 're_idempotency_test_key',
        emailFrom: 'CareerForge <notifications@careerforge.dev>',
      };
      const provider = new ResendEmailProvider(mockConfig);

      const originalFetch = global.fetch;
      global.fetch = async (url, options) => {
        capturedHeaders = options.headers;
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'resend_msg_idem_789' }),
        };
      };

      try {
        const result = await provider.send({
          to: 'student@example.com',
          subject: 'Welcome',
          text: 'Welcome to CareerForge!',
          idempotencyKey: 'email:welcome:student-uuid-999',
        });

        assert.equal(capturedHeaders['Idempotency-Key'], 'email:welcome:student-uuid-999');
        assert.equal(result.success, true);
        assert.equal(result.messageId, 'resend_msg_idem_789');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should handle non-2xx HTTP errors safely and include status code', async () => {
      const mockConfig = {
        resendApiKey: 're_valid_key_9999',
        emailFrom: 'CareerForge <notifications@careerforge.dev>',
      };
      const provider = new ResendEmailProvider(mockConfig);

      const originalFetch = global.fetch;
      global.fetch = async () => ({
        ok: false,
        status: 422,
        text: async () => JSON.stringify({ message: 'The domain has not been verified.' }),
      });

      try {
        await assert.rejects(
          () =>
            provider.send({
              to: 'fail@example.com',
              subject: 'Test Subject',
              text: 'Test Body',
            }),
          (err) => {
            assert.ok(err instanceof EmailDeliveryError);
            assert.equal(err.statusCode, 422);
            assert.match(err.message, /Resend API error \(422\): The domain has not been verified\./);
            return true;
          }
        );
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should strictly sanitize and never expose the API key in thrown error messages', async () => {
      const sensitiveKey = 're_super_secret_production_key_xyz987';
      const mockConfig = {
        resendApiKey: sensitiveKey,
        emailFrom: 'CareerForge <notifications@careerforge.dev>',
      };
      const provider = new ResendEmailProvider(mockConfig);

      // Simulate an upstream error that accidentally echoes the raw bearer token or key
      const originalFetch = global.fetch;
      global.fetch = async () => ({
        ok: false,
        status: 401,
        text: async () =>
          JSON.stringify({
            message: `Invalid token Bearer ${sensitiveKey} provided.`,
          }),
      });

      try {
        await assert.rejects(
          () =>
            provider.send({
              to: 'leak-test@example.com',
              subject: `Alert for ${sensitiveKey}`,
              text: 'Body',
            }),
          (err) => {
            assert.ok(err instanceof EmailDeliveryError);
            assert.equal(err.statusCode, 401);
            // Must contain [REDACTED] and NOT the raw sensitive key
            assert.equal(err.message.includes(sensitiveKey), false);
            assert.ok(err.message.includes('[REDACTED]'));
            return true;
          }
        );
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should handle network exceptions safely without secret leakage', async () => {
      const sensitiveKey = 're_network_secret_token_456';
      const mockConfig = {
        resendApiKey: sensitiveKey,
        emailFrom: 'CareerForge <notifications@careerforge.dev>',
      };
      const provider = new ResendEmailProvider(mockConfig);

      const originalFetch = global.fetch;
      global.fetch = async () => {
        throw new Error(`Connection reset while transmitting ${sensitiveKey}`);
      };

      try {
        await assert.rejects(
          () =>
            provider.send({
              to: 'net-err@example.com',
              subject: 'Hello',
              text: 'Body',
            }),
          (err) => {
            assert.ok(err instanceof EmailDeliveryError);
            assert.equal(err.message.includes(sensitiveKey), false);
            assert.ok(err.message.includes('[REDACTED]'));
            return true;
          }
        );
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 3. EmailService Tests
  // ---------------------------------------------------------------------------
  describe('EmailService', () => {
    it('should validate inputs and reject missing recipients, subject, or body', async () => {
      const mockProvider = new MockEmailProvider();
      const service = new EmailService(mockProvider);

      // Missing options
      await assert.rejects(() => service.sendEmail(null), {
        message: 'Email options must be provided',
      });

      // Missing recipient
      await assert.rejects(
        () => service.sendEmail({ subject: 'Subj', text: 'Text' }),
        { message: 'Email recipient (to) is required' }
      );

      // Empty recipient array
      await assert.rejects(
        () => service.sendEmail({ to: [], subject: 'Subj', text: 'Text' }),
        { message: 'At least one email recipient must be specified' }
      );

      // Missing/empty subject
      await assert.rejects(
        () => service.sendEmail({ to: 'user@test.com', subject: '   ', text: 'Text' }),
        { message: 'Email subject is required' }
      );

      // Missing body (neither html nor text)
      await assert.rejects(
        () => service.sendEmail({ to: 'user@test.com', subject: 'Valid Subj' }),
        { message: 'Email body content (html or text) must be provided' }
      );
    });

    it('should delegate validated requests to the underlying provider abstraction', async () => {
      let callCount = 0;
      let passedOptions = null;

      const customProvider = {
        send: async (options) => {
          callCount++;
          passedOptions = options;
          return { success: true, messageId: 'custom-id-777' };
        },
      };

      const service = new EmailService(customProvider);
      const result = await service.sendEmail({
        to: 'candidate@company.com',
        subject: 'Interview Scheduled',
        html: '<p>See you Monday</p>',
      });

      assert.equal(callCount, 1);
      assert.deepEqual(result, { success: true, messageId: 'custom-id-777' });
      assert.equal(passedOptions.to, 'candidate@company.com');
      assert.equal(passedOptions.subject, 'Interview Scheduled');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. NotificationModule Provider Factory Tests
  // ---------------------------------------------------------------------------
  describe('NotificationModule Provider Selection Factory', () => {
    // Extract the factory provider from NotificationModule metadata
    const moduleReflectProviders =
      Reflect.getMetadata('providers', NotificationModule) || [];
    const factoryProvider = moduleReflectProviders.find(
      (p) => p && p.provide === EMAIL_PROVIDER_TOKEN
    );

    it('should find the EMAIL_PROVIDER_TOKEN factory in NotificationModule', () => {
      assert.ok(factoryProvider, 'Factory provider should be defined in NotificationModule');
      assert.equal(typeof factoryProvider.useFactory, 'function');
    });

    it('should select MockEmailProvider when EMAIL_PROVIDER is "mock"', () => {
      const mockConfigService = {
        emailProvider: 'mock',
        resendApiKey: 're_any_key',
      };
      const provider = factoryProvider.useFactory(mockConfigService);
      assert.ok(provider instanceof MockEmailProvider);
    });

    it('should select MockEmailProvider in local/test mode when no key or placeholder key is configured', () => {
      const variations = [
        { emailProvider: undefined, resendApiKey: undefined },
        { emailProvider: undefined, resendApiKey: '' },
        { emailProvider: undefined, resendApiKey: 'your-resend-api-key-here' },
        { emailProvider: undefined, resendApiKey: 'your-api-key' },
      ];

      for (const config of variations) {
        const provider = factoryProvider.useFactory(config);
        assert.ok(
          provider instanceof MockEmailProvider,
          `Expected MockEmailProvider for config: ${JSON.stringify(config)}`
        );
      }
    });

    it('should select ResendEmailProvider when EMAIL_PROVIDER is "resend" with a valid key', () => {
      const mockConfigService = {
        emailProvider: 'resend',
        resendApiKey: 're_real_configured_key_123',
        emailFrom: 'CareerForge <notifications@careerforge.dev>',
      };
      const provider = factoryProvider.useFactory(mockConfigService);
      assert.ok(provider instanceof ResendEmailProvider);
    });

    it('should throw an error when EMAIL_PROVIDER is "resend" but key is missing or placeholder', () => {
      const invalidConfigs = [
        { emailProvider: 'resend', resendApiKey: undefined },
        { emailProvider: 'resend', resendApiKey: '' },
        { emailProvider: 'resend', resendApiKey: 'your-resend-api-key-here' },
      ];

      for (const config of invalidConfigs) {
        assert.throws(
          () => factoryProvider.useFactory(config),
          /RESEND_API_KEY is required when EMAIL_PROVIDER is configured as "resend"/
        );
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Config Validation Tests
  // ---------------------------------------------------------------------------
  describe('Config Validation for Email Notifications', () => {
    const validBaseEnv = {
      NODE_ENV: 'test',
      PORT: '5000',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/careerforge?schema=public',
      JWT_SECRET: 'a'.repeat(32),
      STORAGE_PROVIDER: 'local',
    };

    it('should accept valid default email configuration', () => {
      const config = validateEnvironment({
        ...validBaseEnv,
        EMAIL_PROVIDER: 'mock',
      });
      assert.equal(config.emailProvider, 'mock');
      assert.equal(config.emailFrom, 'CareerForge <notifications@careerforge.dev>');
    });

    it('should accept custom EMAIL_FROM', () => {
      const config = validateEnvironment({
        ...validBaseEnv,
        EMAIL_PROVIDER: 'mock',
        EMAIL_FROM: 'Alerts <no-reply@careerforge.com>',
      });
      assert.equal(config.emailFrom, 'Alerts <no-reply@careerforge.com>');
    });

    it('should reject invalid EMAIL_PROVIDER values', () => {
      assert.throws(
        () =>
          validateEnvironment({
            ...validBaseEnv,
            EMAIL_PROVIDER: 'sendgrid',
          }),
        (err) => {
          assert.ok(err instanceof ConfigValidationError);
          assert.match(err.message, /EMAIL_PROVIDER must be one of: 'resend', 'mock'/);
          return true;
        }
      );
    });

    it('should enforce RESEND_API_KEY when EMAIL_PROVIDER=resend', () => {
      // Missing key
      assert.throws(
        () =>
          validateEnvironment({
            ...validBaseEnv,
            EMAIL_PROVIDER: 'resend',
          }),
        (err) => {
          assert.ok(err instanceof ConfigValidationError);
          assert.match(err.message, /RESEND_API_KEY is required/);
          return true;
        }
      );

      // Placeholder key
      assert.throws(
        () =>
          validateEnvironment({
            ...validBaseEnv,
            EMAIL_PROVIDER: 'resend',
            RESEND_API_KEY: 'your-resend-api-key-here',
          }),
        (err) => {
          assert.ok(err instanceof ConfigValidationError);
          assert.match(err.message, /must not be a placeholder/);
          return true;
        }
      );

      // Valid key passes
      const valid = validateEnvironment({
        ...validBaseEnv,
        EMAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 're_production_key_example',
      });
      assert.equal(valid.emailProvider, 'resend');
      assert.equal(valid.resendApiKey, 're_production_key_example');
    });
  });
});
