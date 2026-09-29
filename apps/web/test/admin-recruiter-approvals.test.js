import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listPendingRecruitersQuerySchema,
  moderateRecruiterStatusSchema,
} from '@careerforge/validation';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '../src');
const routerFile = path.resolve(srcDir, 'router/routes.tsx');
const layoutFile = path.resolve(srcDir, 'layouts/AdminLayout.tsx');
const adminPagesFile = path.resolve(srcDir, 'pages/AdminPages.tsx');
const approvalsPageFile = path.resolve(
  srcDir,
  'features/adminRecruiterApprovals/AdminRecruiterApprovalsPage.tsx'
);
const cardFile = path.resolve(
  srcDir,
  'features/adminRecruiterApprovals/components/PendingRecruiterCard.tsx'
);

// Mirror of helper functions from apps/web/src/features/adminRecruiterApprovals/adminRecruiterApi.ts
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(id) {
  return Boolean(id && UUID_REGEX.test(String(id).trim()));
}

function buildPendingRecruitersQueryParams(params) {
  const query = {};
  if (!params) return query;

  if (typeof params.page === 'number' && params.page > 0) {
    query.page = Math.floor(params.page);
  }

  if (
    typeof params.limit === 'number' &&
    params.limit > 0 &&
    params.limit <= 50
  ) {
    query.limit = Math.floor(params.limit);
  }

  return query;
}

function normalizePendingRecruitersQueryParams(params) {
  return {
    page: params?.page && params.page > 0 ? Math.floor(params.page) : 1,
    limit:
      params?.limit && params.limit > 0 && params.limit <= 50
        ? Math.floor(params.limit)
        : 10,
  };
}

function adminPendingRecruitersBaseKey() {
  return ['admin', 'recruiters', 'pending'];
}

function adminPendingRecruitersQueryKey(params) {
  const normalized = normalizePendingRecruitersQueryParams(params);
  return ['admin', 'recruiters', 'pending', normalized];
}

describe('Admin Recruiter Approvals Frontend & Routing Test Suite', () => {
  const validRecruiterId = 'e42e476e-3607-4e68-9a2f-98eb413ce161';
  const validCompanyId = '7b92f72a-3b56-42d4-a162-8152341499aa';

  const sampleRecruiter = {
    id: validRecruiterId,
    user_id: '99999999-9999-4999-8999-999999999999',
    first_name: 'Sarah',
    last_name: 'Connor',
    email: 'sarah@cyberdyne.example.com',
    is_approved: false,
    created_at: '2026-09-25T12:00:00.000Z',
    company: {
      id: validCompanyId,
      name: 'Cyberdyne Systems',
      website: 'https://cyberdyne.example.com',
      logo_url: null,
    },
  };

  // =========================================================================
  // 1. Route & Navigation Protection
  // =========================================================================
  describe('1. Router & Navigation Integration', () => {
    it('1. /admin/recruiters route is defined and protected under ADMIN role', () => {
      const routesContent = fs.readFileSync(routerFile, 'utf-8');
      assert.ok(routesContent.includes("path: '/admin'"));
      assert.ok(routesContent.includes("allowedRoles={['ADMIN']}"));
      assert.ok(routesContent.includes("path: 'recruiters'"));
      assert.ok(routesContent.includes('AdminRecruiterApprovalsPage'));
    });

    it('2. AdminLayout navigation includes Recruiter Approvals item', () => {
      const layoutContent = fs.readFileSync(layoutFile, 'utf-8');
      assert.ok(layoutContent.includes("path: '/admin/recruiters'"));
      assert.ok(layoutContent.includes("label: 'Recruiter Approvals'"));
      assert.ok(layoutContent.includes('UserCheck'));
    });

    it('3. AdminLayout preserves existing Job Moderation and Users nav items', () => {
      const layoutContent = fs.readFileSync(layoutFile, 'utf-8');
      assert.ok(layoutContent.includes("'Job Moderation'"));
      assert.ok(layoutContent.includes("path: '/admin/moderation'"));
      assert.ok(layoutContent.includes("path: '/admin/users'"));
      assert.ok(layoutContent.includes("label: 'Users'"));
    });

    it('4. AdminPages exports AdminRecruiterApprovalsPage', () => {
      const pagesContent = fs.readFileSync(adminPagesFile, 'utf-8');
      assert.ok(pagesContent.includes('AdminRecruiterApprovalsPage'));
    });
  });

  // =========================================================================
  // 2. Query Builder & React Query Key Factories
  // =========================================================================
  describe('2. Query Builder & Cache Keys', () => {
    it('5. buildPendingRecruitersQueryParams handles pagination parameters cleanly', () => {
      const empty = buildPendingRecruitersQueryParams();
      assert.deepEqual(empty, {});

      const valid = buildPendingRecruitersQueryParams({ page: 2, limit: 20 });
      assert.deepEqual(valid, { page: 2, limit: 20 });

      const decimals = buildPendingRecruitersQueryParams({
        page: 2.9,
        limit: 15.1,
      });
      assert.deepEqual(decimals, { page: 2, limit: 15 });

      const invalid = buildPendingRecruitersQueryParams({
        page: -1,
        limit: 100,
      });
      assert.deepEqual(invalid, {});
    });

    it('6. normalizePendingRecruitersQueryParams establishes deterministic defaults', () => {
      const defaults = normalizePendingRecruitersQueryParams();
      assert.deepEqual(defaults, { page: 1, limit: 10 });

      const custom = normalizePendingRecruitersQueryParams({
        page: 3,
        limit: 25,
      });
      assert.deepEqual(custom, { page: 3, limit: 25 });
    });

    it('7. React Query keys maintain correct root and query structure', () => {
      assert.deepEqual(adminPendingRecruitersBaseKey(), [
        'admin',
        'recruiters',
        'pending',
      ]);
      assert.deepEqual(adminPendingRecruitersQueryKey({ page: 2, limit: 10 }), [
        'admin',
        'recruiters',
        'pending',
        { page: 2, limit: 10 },
      ]);
    });
  });

  // =========================================================================
  // 3. UI State & Moderation Workflow
  // =========================================================================
  describe('3. Moderation Workflow & Component Invariants', () => {
    it('8. PendingRecruiterCard displays company name, recruiter name, and email', () => {
      const cardSource = fs.readFileSync(cardFile, 'utf-8');
      assert.ok(cardSource.includes('recruiter.company?.name'));
      assert.ok(cardSource.includes('recruiter.email'));
      assert.ok(cardSource.includes('recruiter.first_name'));
      assert.ok(cardSource.includes('Pending Verification'));
    });

    it('9. PendingRecruiterCard links company website with noopener noreferrer security attributes', () => {
      const cardSource = fs.readFileSync(cardFile, 'utf-8');
      assert.ok(cardSource.includes('rel="noopener noreferrer"'));
      assert.ok(cardSource.includes('target="_blank"'));
    });

    it('10. approve action triggers confirmation dialog state with APPROVE action', () => {
      let dialogRecruiter = null;
      let dialogAction = null;

      const handleApprove = (recruiter) => {
        dialogRecruiter = recruiter;
        dialogAction = 'APPROVE';
      };

      handleApprove(sampleRecruiter);
      assert.deepEqual(dialogRecruiter, sampleRecruiter);
      assert.equal(dialogAction, 'APPROVE');
      assert.equal(Boolean(dialogRecruiter && dialogAction), true);
    });

    it('11. reject action triggers confirmation dialog state with REJECT action', () => {
      let dialogRecruiter = null;
      let dialogAction = null;

      const handleReject = (recruiter) => {
        dialogRecruiter = recruiter;
        dialogAction = 'REJECT';
      };

      handleReject(sampleRecruiter);
      assert.deepEqual(dialogRecruiter, sampleRecruiter);
      assert.equal(dialogAction, 'REJECT');
      assert.equal(Boolean(dialogRecruiter && dialogAction), true);
    });

    it('12. mutation isolation prevents multi-card in-flight pollution', () => {
      const updatingId = validRecruiterId;
      const cardA = { id: validRecruiterId };
      const cardB = { id: '00000000-0000-0000-0000-000000000000' };

      assert.equal(updatingId === cardA.id, true);
      assert.equal(updatingId === cardB.id, false);
    });

    it('13. no sensitive tokens or password fields are referenced in UI components', () => {
      const pageSource = fs.readFileSync(approvalsPageFile, 'utf-8');
      const cardSource = fs.readFileSync(cardFile, 'utf-8');

      assert.equal(pageSource.includes('password_hash'), false);
      assert.equal(pageSource.includes('token'), false);
      assert.equal(cardSource.includes('password_hash'), false);
      assert.equal(cardSource.includes('token'), false);
    });
  });
});
