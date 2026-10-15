# CareerForge — Phase 9: Real-User Validation & Production Smoke-Test Checklist

This document serves as the authoritative operational manual, smoke-test matrix, and real-user feedback tracking system for **Phase 9 (Real-User Validation and Iteration)**.

With the production deployment live on **Cloudflare Pages** (Vite React SPA), **Render Web Service** (NestJS Modular Monolith API), **Render PostgreSQL 16** (Managed Database), **Backblaze B2** (Cloud Object Storage), **Resend** (Transactional Email), and **Google Gemini 2.5 Flash** (AI Engine), this document establishes end-to-end validation protocols across all user personas and operational gates.

> [!IMPORTANT]
> **PRODUCTION SMOKE TESTING POLICY**:
> - **Verified Status Baseline**: Only checks that have been explicitly executed and confirmed against the live production infrastructure are marked as `PASS`.
> - **Default State**: All unverified workflows are strictly marked as `NOT TESTED`. Production success must **never** be inferred solely from passing unit, integration, or DOM tests.
> - **Synthetic Safety**: Smoke testing in production must employ dedicated synthetic test accounts (`@careerforge.test`) and sanitized sample documents. Destructive actions, real applicant records, and external spam notifications are strictly prohibited on live environments.

---

## 1. Environment & Architecture Baseline

| Component | Production Target | Environment URL / Identifier | Authentication & Storage Scheme |
| :--- | :--- | :--- | :--- |
| **Frontend Web App** | Cloudflare Pages | `https://careerforge-8oq.pages.dev` | React 18 SPA + Tailwind CSS + Same-origin API Proxy |
| **Backend REST API** | Render Web Service | `https://careerforge-api-h2ce.onrender.com` | NestJS 10 Monolith + Express + JSON Logger (`/api/v1`) |
| **Relational Database** | Render PostgreSQL | Managed PostgreSQL 16 (SSL required) | Prisma ORM (`public` schema) + Direct Port 5432 Session |
| **Asynchronous Queue** | Render PostgreSQL | Schema `pgboss` | `pg-boss` (In-process queue, zero Redis/BullMQ dependency) |
| **Resume Object Store** | Backblaze B2 (Native) | Private S3-compatible B2 Bucket | `B2NativeStorageProvider` (`b2_upload_file`, `b2_download_file_by_id`) |
| **Transactional Email** | Resend API | Domain: `careerforge.dev` | `ResendEmailProvider` + PostgreSQL Idempotency Store (`email_deliveries`) |
| **AI Evaluation Engine**| Google Gemini | Model: `gemini-2.5-flash` | ATS Resume Scoring, Missing Skill Extraction, Interview Prep Generator |

---

## 2. Safety Guidelines & Synthetic Data Protocols

To protect production data integrity, maintain clean analytics, and prevent accidental notification spam, follow these mandatory protocols:

### 2.1. Environment Classification

Every test case in this checklist is tagged with an operational environment safety level:

1. **`[PRODUCTION SAFE]`**:
   - Uses synthetic accounts and non-destructive mutations.
   - Operates on records owned by the test actor.
   - Can be safely performed on the live production cluster at any time.
2. **`[LOCAL / STAGING ONLY]`**:
   - Destructive operations (e.g. hard cascading deletion of users via `DELETE /api/v1/admin/users/:id`).
   - High-concurrency flood tests that trip global IP rate limits or exhaust production API quotas.
   - Simulation of database outages, queue worker crashes, or unmocked external email delivery failure modes.

### 2.2. Synthetic Test Accounts Matrix

Always execute test runs with these dedicated synthetic accounts. Never use personal, employee, or real student credentials:

| Persona | Synthetic Email | Role | Company / Scope | Initial State |
| :--- | :--- | :---: | :--- | :--- |
| **Student A (Primary)** | `smoke-student-alpha@careerforge.test` | `STUDENT` | N/A (Candidate) | Clean profile, no resume initially |
| **Student B (Secondary)**| `smoke-student-beta@careerforge.test` | `STUDENT` | N/A (Candidate) | Clean profile (used for isolation checks) |
| **Recruiter A (Approved)**| `smoke-recruiter-alpha@careerforge.test`| `RECRUITER` | `Acme Cloud Labs` (Approved) | `is_approved: true`, Company Linked |
| **Recruiter B (Pending)** | `smoke-recruiter-pending@careerforge.test`| `RECRUITER`| `Unverified Startup` | `is_approved: false`, Awaiting Moderation |
| **Administrator** | `smoke-admin@careerforge.test` | `ADMIN` | Platform Wide Console | Bootstrapped via CLI |

### 2.3. Sample Data Rules
- **Resumes**: Use synthetic PDF files containing generic text (e.g., standard educational credentials, mock technical skills like TypeScript, Node.js, SQL). **Do not upload real resumes with personal phone numbers, physical addresses, or proprietary work history**.
- **Job Postings**: Prefix all smoke-test job titles with `[SMOKE TEST]` (e.g., `[SMOKE TEST] Full Stack Engineer`). This makes them immediately recognizable and filterable.
- **External Notifications**: Because transactional emails dispatch via Resend in production, ensure all synthetic email recipients belong to reserved test domains (`@careerforge.test` or domains with discard/sinkhole routing) to avoid sending spam to arbitrary third parties.

---

## 3. Production Verification Summary

| Workflow Area | Total Checks | Verified (`PASS`) | Unverified (`NOT TESTED`) | Failed (`FAIL`) |
| :--- | :---: | :---: | :---: | :---: |
| **Student Experience** | 11 | **5** | 6 | 0 |
| **Recruiter Experience** | 8 | 0 | 8 | 0 |
| **Administrator Console** | 7 | 0 | 7 | 0 |
| **Cross-Cutting & Security**| 8 | 0 | 8 | 0 |
| **Total** | **34** | **5** | **29** | **0** |

> [!NOTE]
> **Active Verified Baseline (Phase 9.0)**:
> 1. Resume uploads successfully to Backblaze B2 (`TC-STU-03`: **PASS**)
> 2. The uploaded resume remains available after refreshing the page (`TC-STU-04`: **PASS**)
> 3. PDF access/download works (`TC-STU-05`: **PASS**)
> 4. Initial AI resume analysis succeeds (`TC-STU-06`: **PASS**)
> 5. Re-analysis within the five-minute cooldown is rejected as expected (`TC-STU-07`: **PASS**)

---

## 4. End-to-End Production Smoke-Test Matrix

### 4.1. Student Workflows

| Test ID | Environment | User Role | Preconditions | Steps | Expected Result | Result | Evidence / Notes | Severity if Failed |
| :--- | :---: | :---: | :--- | :--- | :--- | :---: | :--- | :---: |
| **TC-STU-01** | `PRODUCTION SAFE` | `STUDENT` | Unauthenticated visitor on landing page | 1. Navigate to `/register`.<br>2. Select "Student" role toggle.<br>3. Enter `smoke-student-alpha@careerforge.test` and valid password.<br>4. Submit form.<br>5. Inspect `/login` with same credentials. | Registration creates User & Student records, sets `cf_auth` cookie (`SameSite=Lax`, `HttpOnly`), redirects to `/student/dashboard`. Re-login succeeds seamlessly. | **NOT TESTED** | Unit & DOM tests pass. Awaiting production sign-off. | **P0 Blocker** |
| **TC-STU-02** | `PRODUCTION SAFE` | `STUDENT` | Authenticated as `smoke-student-alpha` | 1. Navigate to `/student/profile`.<br>2. Click "Edit Profile".<br>3. Enter University ("Stanford University"), Degree ("B.S. Computer Science"), Graduation Year (2026), and Skills ("React, TypeScript, Node.js, PostgreSQL").<br>4. Click "Save Profile".<br>5. Refresh browser (F5). | Success alert appears ("Profile updated successfully"). Saved profile data persists across page reload from PostgreSQL. | **NOT TESTED** | E2E Playwright test passed in CI; live production check pending. | **P1 High** |
| **TC-STU-03** | `PRODUCTION SAFE` | `STUDENT` | Authenticated as `smoke-student-alpha`, profile created | 1. Navigate to `/student/resume`.<br>2. Drag-and-drop a valid synthetic 2-page text PDF resume (&le;5MB).<br>3. Click "Upload Resume". | File uploaded to Backblaze B2 native bucket (`uploads/resumes/...`). Database `resumes` record created with `file_key`, `file_url`, and `is_primary: true`. Extraction job enqueued. | **PASS** | Manually verified against production Backblaze B2 storage integration. | **P0 Blocker** |
| **TC-STU-03B** | `PRODUCTION SAFE` | `STUDENT` | Authenticated as `smoke-student-alpha` | 1. Navigate to `/student/resume`.<br>2. Drag-and-drop a valid synthetic HTML resume (`.html` or `.htm`) containing GitHub, LinkedIn, and portfolio links (&le;5MB).<br>3. Click "Upload Resume".<br>4. Download uploaded file. | HTML resume uploads successfully. File served strictly as download attachment with `Content-Security-Policy: sandbox`, `X-Frame-Options: DENY`, and `nosniff`. Background worker extracts readable text and preserves profile links for AI analysis. | **NOT TESTED** | Verified across 29 automated test cases in `html-resume-upload.test.js`; pending live smoke run. | **P0 Blocker** |
| **TC-STU-04** | `PRODUCTION SAFE` | `STUDENT` | `TC-STU-03` completed | 1. On `/student/resume`, observe the uploaded primary resume card.<br>2. Trigger hard browser refresh (`Ctrl+F5` / `Cmd+Shift+R`). | Resume card remains visible with correct filename, upload date, and "Primary Resume" badge. State rehydrates from API `/api/v1/resumes/me`. | **PASS** | Manually verified in production; resume metadata and primary status persist. | **P0 Blocker** |
| **TC-STU-05** | `PRODUCTION SAFE` | `STUDENT` | `TC-STU-03` completed | 1. Click the file icon or "View Resume" button on the resume card.<br>2. Verify browser network request to `/api/v1/resumes/:id/file` or `/api/v1/resumes/file/:fileKey`. | Browser opens or downloads valid PDF binary with `Content-Type: application/pdf`, `Content-Disposition: inline`, and `X-Content-Type-Options: nosniff`. | **PASS** | Manually verified in production; PDF stream renders correctly in browser viewer. | **P1 High** |
| **TC-STU-06** | `PRODUCTION SAFE` | `STUDENT` | Resume text extracted successfully | 1. On `/student/resume`, click "Analyze Resume".<br>2. Observe state change to "AI Analysis in Progress" (pulsing bar).<br>3. Wait for background worker processing via Gemini. | UI polls `/api/v1/resumes/:id/analysis`. Card transitions to "Completed" state showing ATS match score (0-100), missing technical skills chips, and actionable formatting suggestions. | **PASS** | Manually verified in production; Gemini 2.5 Flash analysis successfully saved and rendered. | **P1 High** |
| **TC-STU-07** | `PRODUCTION SAFE` | `STUDENT` | `TC-STU-06` completed (< 5 minutes ago) | 1. Immediately click "Analyze Resume" / "Re-analyze" on the completed analysis card. | Backend rejects request with HTTP 429 `RATE_LIMITED` ("Please wait before re-analyzing this resume"). UI displays polite cooldown notice without breaking. | **PASS** | Manually verified in production; 5-minute cooldown (`COOLDOWN_MS`) strictly enforced. | **P2 Medium** |
| **TC-STU-08** | `PRODUCTION SAFE` | `STUDENT` | At least 2 active jobs exist in platform | 1. Navigate to `/student/jobs`.<br>2. Verify job feed renders active jobs.<br>3. Enter search term matching title/description.<br>4. Toggle "Internship" vs "Full Time" filter.<br>5. Click on a job card to open `/student/jobs/:jobId`. | Only jobs with `status = ACTIVE` are listed. Filters dynamically narrow results. Job detail page displays full job description, required skills, and company metadata. | **NOT TESTED** | Component DOM tests pass; awaiting production live job feed smoke. | **P1 High** |
| **TC-STU-09** | `PRODUCTION SAFE` | `STUDENT` | Primary resume uploaded; active job selected | 1. On `/student/jobs/:jobId`, locate the "Apply for this position" panel.<br>2. Click "Apply Now".<br>3. Observe UI transition.<br>4. Attempt clicking "Apply" again. | Application created in PostgreSQL linking student, primary resume, and job. Button updates to disabled "Application Submitted" state. Repeat submission is blocked (HTTP 409 `CONFLICT`). | **NOT TESTED** | Anti-duplicate DB constraint verified in tests; pending live verification. | **P0 Blocker** |
| **TC-STU-10** | `PRODUCTION SAFE` | `STUDENT` | `TC-STU-09` completed | 1. Navigate to `/student/applications`.<br>2. Verify newly submitted job application appears in list.<br>3. Verify status badge reads "Application Received" (`APPLIED`).<br>4. Filter by status tabs. | Application displays correct job title, company name, submission timestamp, and status. Filter tabs ("Applied", "Shortlisted", "Rejected") accurately filter items. | **NOT TESTED** | Unit tests passing; pending live end-to-end check. | **P1 High** |
| **TC-STU-11** | `PRODUCTION SAFE` | `STUDENT` | Applied job detail page (`TC-STU-09`) | 1. Navigate back to `/student/jobs/:jobId` for the applied job.<br>2. Verify "AI Interview Preparation" card appears.<br>3. Click "Generate Interview Prep Questions".<br>4. Wait for response. | Server invokes Gemini interview prep generator via `POST /api/v1/jobs/:jobId/interview-prep`. Card renders structured behavioral and technical questions tailored to job skills and student profile. | **NOT TESTED** | Integration test suite verified Gemini prompt; awaiting live smoke test. | **P2 Medium** |

---

### 4.2. Recruiter Workflows

| Test ID | Environment | User Role | Preconditions | Steps | Expected Result | Result | Evidence / Notes | Severity if Failed |
| :--- | :---: | :---: | :--- | :--- | :--- | :---: | :--- | :---: |
| **TC-REC-01** | `PRODUCTION SAFE` | `RECRUITER` | Unauthenticated visitor | 1. Navigate to `/register`.<br>2. Select "Recruiter" role toggle.<br>3. Enter `smoke-recruiter-alpha@careerforge.test` and valid password.<br>4. Submit and log in. | Registration creates User & Recruiter records with default `is_approved: false`. Session cookie set. Redirects to `/recruiter/dashboard`. | **NOT TESTED** | Auth guards and registration tests passing; pending production run. | **P0 Blocker** |
| **TC-REC-02** | `PRODUCTION SAFE` | `RECRUITER` | `smoke-recruiter-pending` logged in (`is_approved: false`) | 1. View top organization status pill on `/recruiter/dashboard`.<br>2. Navigate to `/recruiter/jobs/new`.<br>3. Fill job creation form and submit. | Dashboard displays "Status: Pending Approval" warning badge. Attempting to post job is rejected with HTTP 403 `FORBIDDEN` ("Recruiter account is pending admin approval"). | **NOT TESTED** | Recruiter guard tests pass; pending live verification. | **P1 High** |
| **TC-REC-03** | `PRODUCTION SAFE` | `RECRUITER` | Authenticated as `smoke-recruiter-alpha` | 1. Navigate to `/recruiter/profile`.<br>2. Enter First Name ("Sarah"), Last Name ("Connor").<br>3. View linked company information.<br>4. Save changes. | Recruiter profile updates successfully. Company name and website link are visible and accurately synchronized. | **NOT TESTED** | Unit and DOM tests pass; awaiting production confirmation. | **P2 Medium** |
| **TC-REC-04** | `PRODUCTION SAFE` | `RECRUITER` | `smoke-recruiter-alpha` is approved and linked to company | 1. Navigate to `/recruiter/jobs/new`.<br>2. Enter Title ("[SMOKE TEST] Cloud Systems Architect"), Employment Type ("Full Time"), Required Skills ("AWS, Kubernetes, Go"), Description ("Test job description").<br>3. Submit form. | Job created with `status = PENDING`. Stored XSS tags stripped from description. Recruiter redirected to `/recruiter/jobs` where job is listed with "Under Review" status badge. | **NOT TESTED** | Job creation & HTML sanitization tests pass; pending production test. | **P0 Blocker** |
| **TC-REC-05** | `PRODUCTION SAFE` | `RECRUITER` | Job created in `TC-REC-04` | 1. On `/recruiter/jobs`, locate the job.<br>2. Click "Edit Job" (`/recruiter/jobs/:jobId/edit`).<br>3. Modify Title and add a skill.<br>4. Submit update. | Job updates in PostgreSQL. Recruiter sees updated details. Non-owner recruiters cannot edit this posting (enforces 403 `FORBIDDEN`). | **NOT TESTED** | Ownership boundary unit tests pass; pending live smoke test. | **P1 High** |
| **TC-REC-06** | `PRODUCTION SAFE` | `RECRUITER` | Synthetic job with test application | 1. On `/recruiter/jobs`, click "Delete Job".<br>2. Confirm deletion in modal prompt. | Job is removed. Associated test applications are safely cleaned up without violating relational integrity or foreign key constraints. | **NOT TESTED** | Integration test passed; production delete test must only run on test job. | **P2 Medium** |
| **TC-REC-07** | `PRODUCTION SAFE` | `RECRUITER` | Active job with at least 1 synthetic applicant | 1. On `/recruiter/jobs`, click "View Applicants" on job card.<br>2. URL navigates to `/recruiter/jobs/:jobId/applicants`.<br>3. Review candidate list and details. | Renders candidate name, university, graduation year, skills badges, applied date, and resume download action. Other recruiters cannot access this list. | **NOT TESTED** | IDOR isolation tests pass; awaiting live candidate pipeline check. | **P0 Blocker** |
| **TC-REC-08** | `PRODUCTION SAFE` | `RECRUITER` | Viewing applicant list in `TC-REC-07` | 1. Locate test candidate card.<br>2. Click "Shortlist" button (`PATCH /api/v1/applications/:id/status` -> `SHORTLISTED`).<br>3. In another test run, click "Reject" (`REJECTED`). | Status badge updates immediately. Candidate's view on `/student/applications` updates to "Shortlisted" or "Not Selected". Background status update email enqueued. | **NOT TESTED** | Status concurrency integration tests pass; pending live verification. | **P1 High** |

---

### 4.3. Administrator Workflows

| Test ID | Environment | User Role | Preconditions | Steps | Expected Result | Result | Evidence / Notes | Severity if Failed |
| :--- | :---: | :---: | :--- | :--- | :--- | :---: | :--- | :---: |
| **TC-ADM-01** | `PRODUCTION SAFE` | `ADMIN` | Admin account bootstrapped via CLI | 1. Navigate to `/login`.<br>2. Enter admin credentials.<br>3. Submit form. | Successful authentication. JWT claims `role: 'ADMIN'`. Redirects to `/admin/moderation`. Admin navigation header displayed. | **NOT TESTED** | Admin bootstrap CLI script verified; live console login pending. | **P0 Blocker** |
| **TC-ADM-02** | `PRODUCTION SAFE` | `ADMIN` | Logged in as Admin vs. Non-Admin | 1. As Admin, access `/admin/moderation`, `/admin/recruiters`, `/admin/companies`, `/admin/users`, `/admin/analytics`.<br>2. Log out and attempt access as Student. | Admin accesses all console panels. Non-admin is immediately redirected with 403 `FORBIDDEN` / login redirect. Admin endpoints reject non-admin tokens. | **NOT TESTED** | Route guard tests pass; pending live production verification. | **P0 Blocker** |
| **TC-ADM-03** | `PRODUCTION SAFE` | `ADMIN` | Pending recruiter exists (`smoke-recruiter-pending`) | 1. Navigate to `/admin/recruiters`.<br>2. Locate pending recruiter.<br>3. Click "Approve Recruiter" (`PATCH /api/v1/admin/recruiters/:id/approve`).<br>4. In a separate browser, check recruiter's dashboard. | Recruiter `is_approved` transitions to `true`. Recruiter dashboard status badge changes from "Pending Approval" to "Verified". Recruiter is now unlocked to post jobs. | **NOT TESTED** | Admin approval integration test passes; pending live verification. | **P1 High** |
| **TC-ADM-04** | `PRODUCTION SAFE` | `ADMIN` | Authenticated as Admin | 1. Navigate to `/admin/companies`.<br>2. Click "Create Company" (e.g. `Acme Cloud Labs`, `https://acme.test`).<br>3. Switch to Recruiter Assignment tab.<br>4. Assign a recruiter to the newly created company. | Company record saved. Recruiter company link updated via `PATCH /api/v1/admin/companies/recruiters/:recruiterId/assign`. Recruiter profile reflects updated organization. | **NOT TESTED** | Admin company controller tests pass; pending live smoke test. | **P1 High** |
| **TC-ADM-05** | `PRODUCTION SAFE` | `ADMIN` | Pending job exists (`[SMOKE TEST]`) | 1. Navigate to `/admin/moderation`.<br>2. View pending job details.<br>3. Click "Approve Job".<br>4. Navigate to public `/jobs` board as unauthenticated visitor. | Job status mutates from `PENDING` to `ACTIVE`. Job becomes immediately searchable on the public and student job boards. | **NOT TESTED** | Admin job moderation test suite passes; pending live check. | **P0 Blocker** |
| **TC-ADM-06** | `PRODUCTION SAFE` | `ADMIN` | Target test user exists | 1. Navigate to `/admin/users`.<br>2. Search user by email.<br>3. Toggle "Suspend / Ban User" (`PATCH /api/v1/admin/users/:id/ban`).<br>4. Attempt logging in as banned user.<br>5. Unban user and retry. | User `is_banned` set to `true`. Login attempt blocked with HTTP 403 `FORBIDDEN` ("Your account has been suspended"). Unbanning restores access immediately. | **NOT TESTED** | Ban enforcement tests pass; pending live smoke test. | **P1 High** |
| **TC-ADM-07** | `PRODUCTION SAFE` | `ADMIN` | System active with jobs, applications, users | 1. Navigate to `/admin/analytics`.<br>2. View platform metrics cards. | Endpoint `/api/v1/admin/metrics` returns real-time totals: Total Users, Total Students, Total Recruiters, Active Jobs, Pending Jobs, Total Applications, and Total Analyses. | **NOT TESTED** | Metrics aggregation test suite passes; pending live verification. | **P2 Medium** |

---

### 4.4. Cross-Cutting & Security Resilience Workflows

| Test ID | Environment | User Role | Preconditions | Steps | Expected Result | Result | Evidence / Notes | Severity if Failed |
| :--- | :---: | :---: | :--- | :--- | :--- | :---: | :--- | :---: |
| **TC-XCT-01** | `PRODUCTION SAFE` | `ALL` | Valid credentials for Student, Recruiter, Admin | 1. Attempt accessing `/recruiter/*` with Student account.<br>2. Attempt accessing `/student/*` with Recruiter account.<br>3. Attempt accessing `/admin/*` with Student/Recruiter account. | Frontend redirects to user's authorized portal default path. Direct API requests return HTTP 403 `FORBIDDEN` with standard error envelope `{ "code": "FORBIDDEN", ... }`. | **NOT TESTED** | RoleGuard unit and E2E specs pass; pending live verification. | **P0 Blocker** |
| **TC-XCT-02** | `PRODUCTION SAFE` | `STUDENT` | Two student accounts (`Student A`, `Student B`) | 1. Log in as Student B.<br>2. Obtain Resume ID belonging to Student A.<br>3. Attempt downloading resume file: `GET /api/v1/resumes/:studentA_ResumeId/file`.<br>4. Attempt analyzing resume: `POST /api/v1/resumes/:studentA_ResumeId/analyze`. | Both requests rejected with HTTP 403 `FORBIDDEN` ("You are not authorized to access/analyze this resume"). BOLA/IDOR protection verified. | **NOT TESTED** | BOLA security regression suite passes; pending live smoke check. | **P0 Blocker** |
| **TC-XCT-03** | `PRODUCTION SAFE` | `ALL` | Web browser | 1. Submit login form with empty email.<br>2. Submit registration with password missing special character.<br>3. Request `/jobs/invalid-not-a-uuid`. | Frontend shows inline validation errors. Backend validates payloads via Zod, returning HTTP 400 `VALIDATION_ERROR` with structured issue details. No uncaught 500 errors. | **NOT TESTED** | Validation pipe tests pass; pending live form validation check. | **P2 Medium** |
| **TC-XCT-04** | `PRODUCTION SAFE` | `ALL` | Web browser | 1. Inspect empty job board or application list before data entry.<br>2. Inspect UI while API queries are in-flight (network throttling).<br>3. Inspect toast notifications on error. | Empty states display helpful guidance (e.g. "No applications found"). Loading skeletons prevent content shift. Error banners provide retry buttons. | **NOT TESTED** | Component DOM tests pass; awaiting production UX review. | **P2 Medium** |
| **TC-XCT-05** | `LOCAL / STAGING ONLY` | `ANONYMOUS` | Staging or local dev environment | 1. Send 15 rapid POST requests to `/api/v1/auth/login` within 10 seconds.<br>2. Observe response status. | First 10 requests succeed or return 401; 11th+ requests return HTTP 429 `RATE_LIMITED`. Headers include `Retry-After`. Prevents brute-force credential stuffing. | **NOT TESTED** | RateLimitGuard integration test verified; keep in local/staging to protect prod IP. | **P1 High** |
| **TC-XCT-06** | `PRODUCTION SAFE` | `STUDENT` | Resend provider active in production | 1. Register a synthetic user with an internal test address.<br>2. Submit an application.<br>3. Query PostgreSQL `email_deliveries` table. | Record created in `email_deliveries` with `idempotency_key`, `status = SENT`, and Resend `message_id`. Retried queue jobs do not duplicate external email. | **NOT TESTED** | Idempotency integration tests pass; production delivery pending check. | **P2 Medium** |
| **TC-XCT-07** | `PRODUCTION SAFE` | `ALL` | Logged into portal | 1. Navigate to dashboard.<br>2. Inspect DevTools Cookies: check `cf_auth` flags (`HttpOnly: true`, `SameSite: Lax`, `Secure: true`).<br>3. Hard refresh page (Ctrl+R). | Client invokes `GET /api/v1/auth/me`. User remains logged in without flickering to login screen. No JWT stored in `localStorage` or `sessionStorage`. | **NOT TESTED** | Security cookie tests pass; production browser persistence pending check. | **P0 Blocker** |
| **TC-XCT-08** | `PRODUCTION SAFE` | `ALL` | Mobile & desktop viewports (375px, 768px, 1280px) | 1. Resize browser or use DevTools Device Mode.<br>2. Verify header navigation switches to mobile bottom/drawer navigation.<br>3. Verify tables, cards, and buttons do not overflow horizontally. | Fully responsive layouts across phone, tablet, and widescreen. Tap targets &ge; 44px. No horizontal scrolling or clipped modals. | **NOT TESTED** | Nginx & Tailwind responsive configurations verified; live visual check pending. | **P2 Medium** |

---

## 5. Prioritized Issue Log & Triage Taxonomy

Any defect discovered during smoke testing or real-user trials must be recorded here according to the following severity taxonomy:

- **P0 — Blocker**: Prevents core user journey (e.g., cannot register, login fails, resume upload breaks, cannot apply for jobs). Requires immediate resolution before continuing tests.
- **P1 — High**: Major feature malfunction or security vulnerability without a reasonable workaround (e.g., rate limit failure, IDOR bypass, unapproved recruiter can post jobs).
- **P2 — Medium**: Feature works partially or degrades gracefully (e.g., cooldown error message phrasing, slow AI analysis response, visual layout misalignment on tablet).
- **P3 — Low**: Cosmetic flaws, typo in copy, minor animation glitch, or non-critical enhancement request.

### Active Defect Ledger

| Defect ID | Discovered Date | Component | Description & Reproduction | Severity | Workaround | Status | Resolution / Notes |
| :---: | :---: | :---: | :--- | :---: | :--- | :---: | :--- |
| *None* | — | — | *No defects currently open. Ready for smoke test execution.* | — | — | **OPEN** | — |

---

## 6. Real-User Validation & Beta Feedback Process

To transition from synthetic smoke testing to authentic student and recruiter adoption, follow this structured cohort validation process:

```
┌─────────────────────────────────┐
│ Phase 9.1: Smoke Test Gate     │
│ Execute all PRODUCTION SAFE     │
│ checks with synthetic accounts  │
└────────────────┬────────────────┘
                 ▼
┌─────────────────────────────────┐
│ Phase 9.2: Controlled Beta      │
│ Onboard Cohort 1 (10-20 Students│
│ + 2-3 Partner Recruiters)       │
└────────────────┬────────────────┘
                 ▼
┌─────────────────────────────────┐
│ Phase 9.3: Multi-Channel Intake │
│ In-app feedback widget, survey, │
│ structured usability sessions   │
└────────────────┬────────────────┘
                 ▼
┌─────────────────────────────────┐
│ Phase 9.4: Weekly Triage        │
│ Rank issues by severity &       │
│ schedule iterative deployments  │
└─────────────────────────────────┘
```

### 6.1. Beta Cohort Composition
1. **Student Cohort (Target: 10–20 Participants)**:
   - Mix of actively job-seeking seniors, juniors seeking summer internships, and graduate students.
   - Requirement: Upload real resumes, browse active job listings, apply to at least 2 roles, and run AI resume evaluation and interview preparation.
2. **Recruiter Cohort (Target: 2–3 Partner Organizations)**:
   - Partner tech startups or university campus recruiters.
   - Requirement: Post 1–2 real or realistic job openings, review applicant submissions, and test status transitions (Shortlist/Reject).

### 6.2. Feedback Collection Instruments
1. **In-App Feedback Widget**:
   - Floating feedback trigger accessible from footer or navigation bar.
   - Collects: User sentiment rating (1–5 stars), categorical tag (`Bug Report`, `Feature Request`, `AI Quality`, `UX/Design`), and open feedback comment.
2. **Post-Task Usability Survey**:
   - Sent via email 48 hours after onboarding:
     - *How accurate and actionable were the AI resume ATS suggestions?*
     - *Were the AI interview preparation questions relevant to the target job?*
     - *Did you experience any confusing errors, unexpected delays, or broken buttons?*
3. **Automated Error & Health Monitoring**:
   - Aggregate API HTTP 5xx responses and client-side unhandled promise rejections.
   - Monitor pg-boss queue error rates (`ai_analyses` failures and `email_deliveries` retries).

### 6.3. Iteration Cadence
- **Daily Review**: Project lead audits new entries in the Defect Ledger. Any `P0 Blocker` halts cohort onboarding until patched.
- **Weekly Triage Meeting**: Classify and prioritize all `P1` and `P2` tickets into the sprint backlog.
- **Release Gating**: Bug fixes deployed via continuous deployment, verified against this smoke matrix before closing tickets.

---

## 7. Codebase & Documentation Audit (Gaps Analysis)

During the inspection of the live repository to formulate this Phase 9 matrix, several discrepancies between legacy planning documentation and the actual implemented codebase were identified:

1. **`docs/tasks.md` Outdated Stack Assumptions**:
   - *Issue*: `docs/tasks.md` retains early Month 1 planning items referencing `Redis`, `BullMQ`, and `Cloudinary`, and contains uncompleted checkboxes.
   - *Current Codebase*: The implementation uses PostgreSQL session-level `pg-boss` queues (eliminating Redis completely) and Backblaze B2 / Cloudflare R2 object storage instead of Cloudinary.
   - *Remediation*: Keep `docs/tasks.md` archived as historical origin documentation; rely on `docs/API.md`, `docs/DATABASE.md`, and this Phase 9 matrix for operational ground truth.
2. **`docs/roadmap.md` Outdated Milestones**:
   - *Issue*: References third-party analytics (Vercel Analytics) and external serverless providers (Upstash Redis) that are not part of the deployed modular monolith.
   - *Current Codebase*: Analytics are driven natively by PostgreSQL aggregations in `AdminMetricsService` (`GET /api/v1/admin/metrics`), and queue processing is fully co-located in the NestJS container.
3. **`docs/API.md` Specification Gaps**:
   - *Missing Endpoints*: The Admin Recruiter approval endpoints (`/api/v1/admin/recruiters/pending`, `/approve`, `/reject`, `/status`), Admin Company assignment endpoints (`/api/v1/admin/companies/recruiters/...`), and direct resume file streaming endpoints (`/api/v1/resumes/:id/file`, `/api/v1/resumes/file/:fileKey`) are fully implemented and guarded in code, but were not backported to the legacy `docs/API.md`.
   - *Remediation*: Phase 9 tests have been constructed directly from verified controller signatures and Zod schemas to ensure 100% fidelity with the live running code.
4. **Recruiter Approval Posting Precondition**:
   - *Implementation*: `JobService.createJob` strictly rejects job creation requests from recruiters whose `is_approved` status is false (HTTP 403 `FORBIDDEN`).
   - *Documentation*: Legacy docs did not clearly reflect that recruiters must be moderated by an admin before their posted jobs enter the moderation queue. This has been fully documented and integrated into `TC-REC-02` and `TC-ADM-03`.
