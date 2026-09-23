# CareerForge Production Launch Checklist

This checklist serves as the authoritative deployment gate for the CareerForge platform. Every item must be verified and checked off prior to opening the platform to real student and recruiter users.

> [!IMPORTANT]
> **GATEWAY POLICY**:  
> Automated controls (`AUTOMATABLE`) must pass in CI/CD without manual override.  
> Production actions (`REQUIRES HUMAN/PRODUCTION APPROVAL`) require sign-off from the project lead.

---

## 1. Pre-Deployment Verification Matrix

| Area | Checkpoint | Verification Method | Category | Status |
| :--- | :--- | :--- | :---: | :---: |
| **Repository** | Working tree clean, all commits on `main` | `git status`, `git branch` | `AUTOMATABLE` | **VERIFIED** |
| **Commit Identity**| All recent commits authored by `Akash Tripathi` | `git log -5 --format="%an <%ae>"` | `AUTOMATABLE` | **VERIFIED** |
| **Automated Tests**| Unit, DOM, integration, and E2E suites passing (1,422 tests) | `npm run test`, `npm run test:integration` | `AUTOMATABLE` | **VERIFIED** |
| **Typecheck** | Clean compilation across all 6 workspaces | `npm run typecheck` | `AUTOMATABLE` | **VERIFIED** |
| **Production Build**| Production bundles built cleanly (NestJS dist + Vite SPA) | `npm run build` | `AUTOMATABLE` | **VERIFIED** |
| **CI Automation** | GitHub Actions workflow `.github/workflows/ci.yml` in place | Workflow configuration check | `AUTOMATABLE` | **VERIFIED** |
| **Containerization**| Multi-stage Dockerfiles (`apps/api`, `apps/web`, `docker-compose.prod.yml`)| Container syntax & compose check | `AUTOMATABLE` | **VERIFIED** |
| **Liveness & Readiness**| `/health` and `/ready` probes operational | Health probe tests passing | `AUTOMATABLE` | **VERIFIED** |
| **Log Sanitization**| Structured JSON logging with credential/token redaction | Log sanitizer tests passing | `AUTOMATABLE` | **VERIFIED** |
| **Zero Hardcoded Secrets**| No passwords, real keys, or `.env` files in git | Repository audit | `AUTOMATABLE` | **VERIFIED** |

---

## 2. Production Environment & Infrastructure Setup

The following items require explicit human configuration and production provider selection:

### 2.1. Cloud Infrastructure Provisioning (`REQUIRES HUMAN/PRODUCTION APPROVAL`)
- [ ] **Hosting Selection**:
  - Backend API: Provision container service (e.g. Render Web Service, Railway, AWS ECS/App Runner).
  - Frontend SPA: Provision static hosting with SPA rewrites (e.g. Vercel, Cloudflare Pages, AWS CloudFront + S3).
- [ ] **Managed Database Provisioning**:
  - Provision PostgreSQL 16+ instance (Neon, Supabase, AWS RDS, Render Postgres).
  - Verify SSL enforcement (`sslmode=require`).
  - Configure connection pool sizing (minimum 10, recommended 20 connections for API).
- [ ] **Cloud Object Storage Provisioning**:
  - Create S3-compatible bucket (AWS S3, Cloudflare R2).
  - Enable CORS policy on bucket if direct download is configured.
  - Create dedicated IAM credentials with least-privilege `s3:PutObject`, `s3:GetObject` on the bucket.
- [ ] **Transactional Email Provisioning**:
  - Create Resend account and add sender domain (e.g. `careerforge.dev`).
  - Verify DNS SPF, DKIM, and DMARC records with domain registrar.
  - Generate production `RESEND_API_KEY`.
- [ ] **AI Model API Provisioning**:
  - Obtain production Google Gemini API key with billing tier or quota alerts enabled.

---

## 3. Environment Variables & Secret Ingestion (`REQUIRES HUMAN/PRODUCTION APPROVAL`)

Populate environment variables in cloud platform secret vaults (using `.env.production.example` as template):

- [ ] `NODE_ENV=production`
- [ ] `PORT=5000`
- [ ] `LOG_FORMAT=json`
- [ ] `DATABASE_URL`: Ingest production connection string with SSL.
- [ ] `PG_BOSS_SCHEMA=pgboss`
- [ ] `JWT_SECRET`: Generate 256-bit cryptographically secure key:
  ```bash
  openssl rand -base64 32
  ```
- [ ] `CORS_ORIGIN`: Set exact frontend production URL (e.g. `https://app.careerforge.dev`). Wildcards (`*`) strictly forbidden.
- [ ] `AUTH_COOKIE_NAME=cf_auth`
- [ ] `AUTH_COOKIE_SAMESITE`: `lax` (custom domain) or `none` (cross-domain).
- [ ] `STORAGE_PROVIDER=s3` + AWS S3 credentials.
- [ ] `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` + `EMAIL_FROM`.
- [ ] `GEMINI_API_KEY`: Production Gemini credential.
- [ ] `VITE_API_URL`: Built into frontend bundle pointing to production API gateway URL.

---

## 4. Production Database Migration Runbook (`REQUIRES HUMAN/PRODUCTION APPROVAL`)

Follow [`docs/DATABASE_MIGRATION_RUNBOOK.md`](file:///c:/Users/tripa/Desktop/Akash/PROJECTS/careerForge/docs/DATABASE_MIGRATION_RUNBOOK.md):

- [ ] Take pre-migration database snapshot/dump.
- [ ] Run migration deployment:
  ```bash
  npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma
  ```
- [ ] Confirm migration status:
  ```bash
  npx prisma migrate status --schema=apps/api/prisma/schema.prisma
  ```

---

## 5. Administrative Account Bootstrapping (`REQUIRES HUMAN/PRODUCTION APPROVAL`)

The platform does not allow public registration for administrative users. The initial system administrator must be bootstrapped via CLI:

- [ ] Run the idempotent bootstrap utility via container shell or task runner:
  ```bash
  npm run admin:bootstrap --workspace=@careerforge/api
  ```
  *(Or provide `ADMIN_EMAIL` and `ADMIN_PASSWORD` in a one-time secure container run).*
- [ ] Verify that repeat execution does not alter or re-hash credentials:
  *Output: `[NOTICE] Admin account already exists. No changes made.`*
- [ ] Log in via the web client to confirm admin dashboard access.

---

## 6. Post-Deployment Smoke Testing & Staging Verification

Execute automated and manual smoke tests immediately following deployment:

### 6.1. Health Probes
- [ ] Check API liveness:
  ```bash
  curl -i https://api.careerforge.dev/health
  # Expected: HTTP 200 OK, {"status": "ok", "timestamp": "..."}
  ```
- [ ] Check API readiness:
  ```bash
  curl -i https://api.careerforge.dev/ready
  # Expected: HTTP 200 OK, {"status": "ready", "checks": {"database": "connected", "queue": "active"}}
  ```
- [ ] Check Web Nginx liveness:
  ```bash
  curl -i https://app.careerforge.dev/nginx-health
  # Expected: HTTP 200 OK
  ```

### 6.2. End-to-End User Journeys
- [ ] **Student Registration & Login**: Register a test student user, verify `cf_auth` HttpOnly cookie is set with `Secure` and `SameSite=Lax`.
- [ ] **Profile Management**: Update student education and skills; verify PostgreSQL persistence.
- [ ] **Resume Upload**: Upload valid PDF resume; verify S3 storage upload and database record creation.
- [ ] **AI Resume Analysis**: Request ATS analysis; verify pg-boss queue processes job and UI polls result.
- [ ] **Job Search & Application**: Apply to an active job posting; verify application creation and anti-duplicate check.
- [ ] **Recruiter Workflow**: Log in as recruiter, view applicant list, mutate application status to `SHORTLISTED`.
- [ ] **Admin Moderation**: Verify pending job postings and approve.
- [ ] **Security Defense Check**:
  - Test missing Origin on cookie request: confirm HTTP 403 Forbidden.
  - Test rate limiting: send rapid requests to `/api/v1/auth/login`; confirm HTTP 429 Too Many Requests.
  - Inspect application logs: confirm zero plaintext passwords, tokens, or JWTs.

---

## 7. Operational Readiness & Monitoring (`REQUIRES HUMAN/PRODUCTION APPROVAL`)

- [ ] **Uptime Monitoring**: Configure external synthetic monitoring (BetterStack, Pingdom, UptimeRobot) pinging `/health` every 60 seconds.
- [ ] **Error Alerting**: Integrate Sentry or CloudWatch Alarms for HTTP 500 error spikes.
- [ ] **Database Backups**: Confirm automated daily database backups with 7-day retention are active.
- [ ] **Rollback Plan Tested**: Verified that rolling container tags back to the prior SHA restores service within <5 minutes.

---

## 8. Final Launch Declaration

> [!NOTE]
> CareerForge is **PRODUCTION READY**.  
> The codebase, container specifications, CI pipelines, database runbooks, observability probes, and launch checklists are complete and verified.  
> **Actual cloud deployment requires human operator credentials, cloud provider selection, and final production sign-off.**
