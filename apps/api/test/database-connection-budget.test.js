/**
 * Database Connection Budget Test Suite
 *
 * Verifies production database connection budget constraints to prevent
 * Supabase Session Pooler connection exhaustion (EMAXCONNSESSION: max clients 15).
 *
 * Target Allocation:
 * - PgBoss query pool max: 3
 * - PgBoss LISTEN connection: 1 (useListenNotify: true)
 * - Prisma Client max: 5
 * - Total: 9 connections (leaves 6 for migrations, admin, and background workers)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Import from compiled dist
const {
  QueueService,
  PGBOSS_DEFAULT_POOL_MAX,
} = require('../dist/core/queue/queue.service');
const {
  PrismaService,
  PRISMA_DEFAULT_CONNECTION_LIMIT,
  resolvePrismaDatabaseUrl,
} = require('../dist/prisma/prisma.service');

describe('Database Connection Budget & Pool Sizing', () => {
  describe('1. Connection Budget Arithmetic', () => {
    it('should define PgBoss query pool limit of 3', () => {
      assert.equal(PGBOSS_DEFAULT_POOL_MAX, 3);
    });

    it('should define Prisma default connection limit of 5', () => {
      assert.equal(PRISMA_DEFAULT_CONNECTION_LIMIT, 5);
    });

    it('should guarantee total application connections do not exceed Supabase limit of 15', () => {
      const pgbossQueryPool = PGBOSS_DEFAULT_POOL_MAX; // 3
      const pgbossListenConnection = 1; // useListenNotify: true
      const prismaPool = PRISMA_DEFAULT_CONNECTION_LIMIT; // 5

      const totalAppConnections =
        pgbossQueryPool + pgbossListenConnection + prismaPool;
      const supabasePoolLimit = 15;
      const headroom = supabasePoolLimit - totalAppConnections;

      assert.equal(totalAppConnections, 9);
      assert.ok(
        totalAppConnections <= supabasePoolLimit,
        `Total connections (${totalAppConnections}) must not exceed pool limit (${supabasePoolLimit})`
      );
      assert.equal(headroom, 6, 'Reserves exactly 6 connections for migrations and admin');
    });
  });

  describe('2. resolvePrismaDatabaseUrl', () => {
    it('should set connection_limit=5 when missing from URL', () => {
      const rawUrl = 'postgresql://user:pass@ep-cool.supabase.co:5432/postgres?sslmode=require';
      const resolved = resolvePrismaDatabaseUrl(rawUrl, 5);
      assert.ok(resolved);

      const parsed = new URL(resolved);
      assert.equal(parsed.searchParams.get('connection_limit'), '5');
      assert.equal(parsed.searchParams.get('sslmode'), 'require');
    });

    it('should preserve connection_limit when already lower than 5 (e.g. 3)', () => {
      const rawUrl = 'postgresql://user:pass@ep-cool.supabase.co:5432/postgres?sslmode=require&connection_limit=3';
      const resolved = resolvePrismaDatabaseUrl(rawUrl, 5);
      assert.equal(resolved, rawUrl);

      const parsed = new URL(resolved);
      assert.equal(parsed.searchParams.get('connection_limit'), '3');
    });

    it('should preserve connection_limit when exactly 5', () => {
      const rawUrl = 'postgresql://user:pass@ep-cool.supabase.co:5432/postgres?sslmode=require&connection_limit=5';
      const resolved = resolvePrismaDatabaseUrl(rawUrl, 5);
      assert.equal(resolved, rawUrl);

      const parsed = new URL(resolved);
      assert.equal(parsed.searchParams.get('connection_limit'), '5');
    });

    it('should clamp connection_limit to 5 when set to 10', () => {
      const rawUrl = 'postgresql://user:pass@ep-cool.supabase.co:5432/postgres?sslmode=require&connection_limit=10';
      const resolved = resolvePrismaDatabaseUrl(rawUrl, 5);
      assert.ok(resolved);

      const parsed = new URL(resolved);
      assert.equal(parsed.searchParams.get('connection_limit'), '5');
      assert.equal(parsed.searchParams.get('sslmode'), 'require');
    });

    it('should clamp connection_limit to 5 when set to 20', () => {
      const rawUrl = 'postgresql://user:pass@ep-cool.supabase.co:5432/postgres?sslmode=require&connection_limit=20';
      const resolved = resolvePrismaDatabaseUrl(rawUrl, 5);
      assert.ok(resolved);

      const parsed = new URL(resolved);
      assert.equal(parsed.searchParams.get('connection_limit'), '5');
      assert.equal(parsed.searchParams.get('sslmode'), 'require');
    });

    it('should use PRISMA_DEFAULT_CONNECTION_LIMIT when targetLimit argument is omitted', () => {
      const rawUrl = 'postgresql://user:pass@localhost:5432/mydb';
      const resolved = resolvePrismaDatabaseUrl(rawUrl);
      assert.ok(resolved);

      const parsed = new URL(resolved);
      assert.equal(
        parsed.searchParams.get('connection_limit'),
        PRISMA_DEFAULT_CONNECTION_LIMIT.toString()
      );
    });

    it('should preserve limit of 1 (valid positive integer <= 5)', () => {
      const rawUrl = 'postgresql://user:pass@localhost:5432/mydb?connection_limit=1';
      const resolved = resolvePrismaDatabaseUrl(rawUrl);
      assert.equal(resolved, rawUrl);
    });

    it('should handle undefined and null by returning undefined', () => {
      assert.equal(resolvePrismaDatabaseUrl(undefined), undefined);
      assert.equal(resolvePrismaDatabaseUrl(null), undefined);
    });

    it('should throw an error if URL is empty or whitespace', () => {
      assert.throws(
        () => resolvePrismaDatabaseUrl(''),
        /Invalid DATABASE_URL: URL cannot be empty/
      );
      assert.throws(
        () => resolvePrismaDatabaseUrl('   '),
        /Invalid DATABASE_URL: URL cannot be empty/
      );
    });

    it('should throw an explicit error if database URL is unparseable without leaking the supplied URL or credentials', () => {
      const sensitivePassword = 'superSecretDBPassword!@#123';
      const malformedUrlWithCredentials = `postgresql://app_user:${sensitivePassword}@invalid host:5432/careerforge`;

      assert.throws(
        () => resolvePrismaDatabaseUrl(malformedUrlWithCredentials),
        (err) => {
          assert.equal(err.name, 'Error');
          assert.equal(
            err.message,
            'Invalid DATABASE_URL: failed to parse database URL.'
          );
          assert.ok(
            !err.message.includes(sensitivePassword),
            'Error message must never contain the password'
          );
          assert.ok(
            !err.message.includes(malformedUrlWithCredentials),
            'Error message must never contain the raw database URL'
          );
          return true;
        }
      );

      assert.throws(
        () => resolvePrismaDatabaseUrl('not-a-valid-url'),
        (err) => {
          assert.equal(
            err.message,
            'Invalid DATABASE_URL: failed to parse database URL.'
          );
          assert.ok(!err.message.includes('not-a-valid-url'));
          return true;
        }
      );
    });

    describe('Invalid connection_limit values (must fail explicitly)', () => {
      it('should throw on zero (connection_limit=0)', () => {
        const rawUrl = 'postgresql://user:pass@localhost:5432/mydb?connection_limit=0';
        assert.throws(
          () => resolvePrismaDatabaseUrl(rawUrl),
          /Invalid DATABASE_URL connection_limit: "0"\. Expected a strictly positive integer/
        );
      });

      it('should throw on negative numbers (connection_limit=-1, -5)', () => {
        assert.throws(
          () => resolvePrismaDatabaseUrl('postgresql://user:pass@localhost:5432/mydb?connection_limit=-1'),
          /Invalid DATABASE_URL connection_limit: "-1"\. Expected a strictly positive integer/
        );
        assert.throws(
          () => resolvePrismaDatabaseUrl('postgresql://user:pass@localhost:5432/mydb?connection_limit=-5'),
          /Invalid DATABASE_URL connection_limit: "-5"\. Expected a strictly positive integer/
        );
      });

      it('should throw on decimal numbers (connection_limit=3.5, 5.0)', () => {
        assert.throws(
          () => resolvePrismaDatabaseUrl('postgresql://user:pass@localhost:5432/mydb?connection_limit=3.5'),
          /Invalid DATABASE_URL connection_limit: "3\.5"\. Expected a strictly positive integer/
        );
        assert.throws(
          () => resolvePrismaDatabaseUrl('postgresql://user:pass@localhost:5432/mydb?connection_limit=5.0'),
          /Invalid DATABASE_URL connection_limit: "5\.0"\. Expected a strictly positive integer/
        );
      });

      it('should throw on non-numeric strings (connection_limit=abc, NaN, true)', () => {
        assert.throws(
          () => resolvePrismaDatabaseUrl('postgresql://user:pass@localhost:5432/mydb?connection_limit=abc'),
          /Invalid DATABASE_URL connection_limit: "abc"\. Expected a strictly positive integer/
        );
        assert.throws(
          () => resolvePrismaDatabaseUrl('postgresql://user:pass@localhost:5432/mydb?connection_limit=NaN'),
          /Invalid DATABASE_URL connection_limit: "NaN"\. Expected a strictly positive integer/
        );
        assert.throws(
          () => resolvePrismaDatabaseUrl('postgresql://user:pass@localhost:5432/mydb?connection_limit=true'),
          /Invalid DATABASE_URL connection_limit: "true"\. Expected a strictly positive integer/
        );
      });

      it('should throw on malformed strings (connection_limit=5foo, 05, empty, duplicate)', () => {
        assert.throws(
          () => resolvePrismaDatabaseUrl('postgresql://user:pass@localhost:5432/mydb?connection_limit=5foo'),
          /Invalid DATABASE_URL connection_limit: "5foo"\. Expected a strictly positive integer/
        );
        assert.throws(
          () => resolvePrismaDatabaseUrl('postgresql://user:pass@localhost:5432/mydb?connection_limit=05'),
          /Invalid DATABASE_URL connection_limit: "05"\. Expected a strictly positive integer/
        );
        assert.throws(
          () => resolvePrismaDatabaseUrl('postgresql://user:pass@localhost:5432/mydb?connection_limit='),
          /Invalid DATABASE_URL connection_limit: ""\. Expected a strictly positive integer/
        );
        assert.throws(
          () => resolvePrismaDatabaseUrl('postgresql://user:pass@localhost:5432/mydb?connection_limit=3&connection_limit=5'),
          /Invalid DATABASE_URL connection_limit: duplicate connection_limit parameters specified/
        );
      });
    });
  });

  describe('3. QueueService PgBoss Configuration', () => {
    it('should configure PgBoss with max pool 3 and useListenNotify true', () => {
      const mockConfig = {
        databaseUrl: 'postgresql://mock_user:mock_pass@localhost:5432/mock_db',
        pgBossSchema: 'test_pgboss',
      };

      const queueService = new QueueService(mockConfig);
      assert.ok(queueService.boss, 'QueueService.boss instance must exist');

      const db = queueService.boss.getDb();
      assert.ok(db, 'PgBoss database adapter should exist');
      assert.ok(db.config, 'PgBoss database config should exist');

      assert.equal(db.config.max, 3, 'PgBoss max pool size must be configured to 3');
      assert.equal(
        db.config.useListenNotify,
        true,
        'PgBoss useListenNotify must be configured to true'
      );
      assert.equal(
        db.config.schema,
        'test_pgboss',
        'PgBoss schema must match configured schema'
      );
    });
  });

  describe('4. PrismaService Configuration', () => {
    it('should initialize PrismaService with connection_limit configured in datasource', () => {
      const mockConfig = {
        databaseUrl: 'postgresql://mock_user:mock_pass@localhost:5432/mock_db?sslmode=require',
      };

      const prisma = new PrismaService(mockConfig);
      assert.ok(prisma._engineConfig, 'Prisma engineConfig should exist');
      const dbOverride = prisma._engineConfig.overrideDatasources?.db;
      assert.ok(dbOverride, 'db datasource override should be set');

      const url = typeof dbOverride.url === 'string' ? dbOverride.url : dbOverride.url?.value;
      assert.ok(
        url && url.includes('connection_limit=5'),
        `URL must include connection_limit=5, got: ${url}`
      );
    });
  });
});
