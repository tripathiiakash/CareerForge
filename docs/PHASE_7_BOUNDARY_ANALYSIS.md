# Phase 7: Modular Service Boundary Analysis

This document provides a comprehensive inventory and architectural analysis of module boundaries within the CareerForge platform as part of **Phase 7: Selective Microservice Extraction & Service-Boundary Evaluation**.

> [!IMPORTANT]
> **Architectural Premise**: The Modular Monolith remains the authoritative, permanent default architecture for CareerForge. No microservice extraction has been performed in this phase. Service extraction is considered strictly on an evidence-based, operational-need basis (Strangler Fig migration pattern), avoiding premature distributed system complexity.

---

## 1. Architectural Overview & Domain Module Map

The CareerForge backend is structured as a NestJS modular monolith backed by PostgreSQL (`Prisma ORM`), `pg-boss` for background queue processing, and the Resend API for transactional email notifications.

```
apps/api/src/
├── core/                       # Shared infrastructure & cross-cutting concerns
│   ├── config/                 # Environment configuration (ConfigService)
│   ├── guards/                 # Authentication & authorization guards (JwtAuthGuard, RolesGuard)
│   ├── middleware/             # HTTP security middleware (SecurityHeaders, CsrfMiddleware)
│   ├── queue/                  # Asynchronous queue infrastructure (QueueService via pg-boss)
│   ├── rate-limit/             # Distributed rate limiting (RateLimitGuard, RateLimitStore)
│   └── utils/                  # Sanitization, UUID, and security helpers
├── prisma/                     # Database client & connection lifecycle (PrismaService)
└── modules/                    # Bounded Context Domain Modules
    ├── admin/                  # Administrative operations, user bans, cascades, metrics
    ├── application/            # Application lifecycle & recruiter review pipeline
    ├── auth/                   # Identity, credential hashing, JWT session management
    ├── company/                # Organization profile management
    ├── job/                    # Job posting lifecycle & AI interview preparation
    ├── notifications/          # Email dispatch, Resend provider, idempotency worker
    ├── recruiter/              # Recruiter profile & owned job listing
    ├── resume/                 # PDF upload, text extraction, Gemini ATS resume analysis
    └── student/                # Student profile management & student applications view
```

---

## 2. Detailed Module Inventory

### 2.1 Auth Module (`src/modules/auth`)
- **Primary Responsibility**: Identity, credential hashing, authentication, and JWT cookie management.
- **Controllers & Routes**: `auth.controller.ts`
  - `POST /api/v1/auth/register`
  - `POST /api/v1/auth/login`
  - `POST /api/v1/auth/logout`
  - `GET /api/v1/auth/me`
- **Services**: `AuthService`, `PasswordService`, `TokenService`, `JwtStrategy`.
- **Database Entities Owned**: `User` (`users` table).
- **Public Interfaces / Exports**: `AuthService`, `PasswordService`, `TokenService`, `AuthenticatedUser` interface, `JwtPayload` interface.
- **Cross-Module Imports**: None. Other modules import `AuthModule` to gain access to guards and `AuthenticatedUser`.
- **Queue Dispatches**: Dispatches `notification.email.welcome` to `QueueService` upon successful registration.
- **Boundary Strength**: **High**. Self-contained identity domain with clean exports.

### 2.2 Student Module (`src/modules/student`)
- **Primary Responsibility**: Student profile metadata (education, skills, graduation, URLs).
- **Controllers & Routes**: `student.controller.ts`
  - `GET /api/v1/students/me`
  - `PUT /api/v1/students/me`
  - `GET /api/v1/students/applications` (delegates to `ApplicationService`)
- **Services**: `StudentService`.
- **Database Entities Owned**: `Student` (`students` table).
- **Public Interfaces / Exports**: `StudentService` (`getProfileByUserId`, `updateProfileByUserId`).
- **Cross-Module Imports**: Imports `ApplicationModule` (to serve student applications endpoint) and `AuthModule`.
- **Database Model Access**: Strictly `prisma.student`. Zero direct reads or writes to other tables.
- **Boundary Strength**: **High**. Strict data ownership and clear public methods.

### 2.3 Company Module (`src/modules/company`)
- **Primary Responsibility**: Organization metadata (name, website, logo URL).
- **Controllers & Routes**: `company.controller.ts`
  - `POST /api/v1/companies`
- **Services**: `CompanyService`.
- **Database Entities Owned**: `Company` (`companies` table).
- **Public Interfaces / Exports**: `CompanyService` (`createCompany`).
- **Cross-Module Imports**: Imports `AuthModule`.
- **Boundary Weakness**: Currently only exposes `createCompany`. Lacks a read method (e.g., `findById`), which forces other modules (such as `RecruiterService`) to query `prisma.company` directly when validating company associations.
- **Boundary Strength**: **Moderate** (clean data isolation, but incomplete service API).

### 2.4 Recruiter Module (`src/modules/recruiter`)
- **Primary Responsibility**: Recruiter profile management and retrieval of owned job postings.
- **Controllers & Routes**: `recruiter.controller.ts`
  - `GET /api/v1/recruiters/me`
  - `PUT /api/v1/recruiters/me`
  - `GET /api/v1/recruiters/jobs`
- **Services**: `RecruiterService`.
- **Database Entities Owned**: `Recruiter` (`recruiters` table).
- **Public Interfaces / Exports**: `RecruiterService`.
- **Cross-Module Imports**: Imports `AuthModule`.
- **Cross-Module Prisma Access**:
  - Directly queries `prisma.company.findUnique` in `updateProfileByUserId` to verify company existence.
  - Directly queries `prisma.job.findMany` in `getJobsByUserId` to retrieve recruiter's jobs.
- **Boundary Strength**: **Moderate** (tight coupling to `companies` and `jobs` tables via direct Prisma calls).

### 2.5 Job Module (`src/modules/job`)
- **Primary Responsibility**: Job postings lifecycle (create, update, delete, list, filter, admin moderation) and AI Interview Preparation.
- **Controllers & Routes**: `job.controller.ts`, `admin-job.controller.ts`
  - `POST /api/v1/jobs`
  - `GET /api/v1/jobs`
  - `GET /api/v1/jobs/:id`
  - `PUT /api/v1/jobs/:id`
  - `DELETE /api/v1/jobs/:id`
  - `POST /api/v1/jobs/:id/interview-prep`
  - `GET /api/v1/admin/jobs/pending`
  - `PATCH /api/v1/admin/jobs/:id/status`
- **Services**: `JobService`, `InterviewPrepService`, `PostgresInterviewPrepQuotaStore`, `GeminiInterviewPrepProvider`, `MockInterviewPrepProvider`.
- **Database Entities Owned**: `Job` (`jobs` table), `InterviewPrepLog` (`interview_prep_logs` table).
- **Public Interfaces / Exports**: `JobService`, `InterviewPrepService`.
- **Cross-Module Imports**: Imports `StudentModule` (used by `InterviewPrepService`) and `AuthModule`.
- **Cross-Module Prisma Access**:
  - `job.service.ts`: Directly queries `prisma.recruiter` in `createJob`, `updateJob`, `deleteJob` to verify approval and ownership.
  - `job.service.ts`: Directly queries `prisma.application` in `getJobById` to compute the `hasApplied` flag for authenticated students.
  - `interview-prep.service.ts`: Directly queries `prisma.application` to verify student application state before generating questions.
- **Boundary Strength**: **Moderate** (interview prep logic is colocated with job management; contains cross-module queries into `applications` and `recruiters`).

### 2.6 Application Module (`src/modules/application`)
- **Primary Responsibility**: Student job applications, applicant listings, recruiter status updates, and notification triggers.
- **Controllers & Routes**: `application.controller.ts`, `application-status.controller.ts`
  - `POST /api/v1/jobs/:id/apply`
  - `GET /api/v1/jobs/:id/applicants`
  - `PATCH /api/v1/applications/:id/status`
- **Services**: `ApplicationService`.
- **Database Entities Owned**: `Application` (`applications` table).
- **Public Interfaces / Exports**: `ApplicationService`, DTOs.
- **Cross-Module Imports**: Imports `AuthModule`.
- **Cross-Module Prisma Access**:
  - In `applyToJob`: Directly queries `prisma.student`, `prisma.job`, and `prisma.resume`.
  - In `getJobApplicants` & `updateStatus`: Directly queries `prisma.recruiter` and `prisma.job`.
- **Queue Dispatches**: Dispatches `notification.email.application-submitted-student`, `notification.email.application-submitted-recruiter`, and `notification.email.application-status` via `QueueService`.
- **Boundary Strength**: **Moderate** (central relational nexus connecting students, resumes, jobs, and recruiters).

### 2.7 Resume & AI Module (`src/modules/resume`)
- **Primary Responsibility**: PDF resume storage, text extraction worker, AI resume analysis worker, and analysis retrieval.
- **Controllers & Routes**: `resume.controller.ts`
  - `POST /api/v1/resumes/upload`
  - `GET /api/v1/resumes`
  - `GET /api/v1/resumes/file/:identifier`
  - `POST /api/v1/resumes/:id/analyze`
  - `GET /api/v1/resumes/:id/analysis`
- **Services**: `ResumeService`, `ResumeAnalysisService`, `PdfParserService`, `ResumeStorageService`, `GeminiProvider`, `MockAiProvider`, `LocalStorageProvider`.
- **Workers**:
  - `ResumeExtractionWorker` (consumes `resume-text-extraction`).
  - `ResumeAnalysisWorker` (consumes `resume-ai-analysis`).
- **Database Entities Owned**: `Resume` (`resumes` table), `AiAnalysis` (`ai_analyses` table).
- **Public Interfaces / Exports**: `ResumeService`, `ResumeAnalysisService`.
- **Cross-Module Imports**: Imports `StudentModule` (to verify student profile) and `AuthModule`.
- **Cross-Module Prisma Access**:
  - In `getResumeFile`: Directly queries `prisma.application` to verify that a recruiter requesting a candidate's resume has an active application on one of their posted jobs.
- **Boundary Strength**: **High** (strong cohesion around PDF handling, workers, and Gemini integration).

### 2.8 Notifications Module (`src/modules/notifications`)
- **Primary Responsibility**: Transactional email dispatch, template rendering, provider abstraction (Resend), idempotency tracking, and email worker execution.
- **Controllers & Routes**: None (purely event/queue-driven).
- **Services**: `EmailService`, `ResendEmailProvider`, `MockEmailProvider`, `NotificationEmailWorker`.
- **Workers**: `NotificationEmailWorker` (consumes all `notification.email.*` queues).
- **Database Entities Owned**: `EmailDelivery` (`email_deliveries` table).
- **Public Interfaces / Exports**: `EmailService`, `EmailProvider` interface.
- **Cross-Module Prisma Access**:
  - Worker queries `prisma.user` (to verify recipient email/status) and `prisma.application` (to retrieve job/company title and candidate details for email content).
- **Boundary Strength**: **High** (fully decoupled via asynchronous `pg-boss` queues).

### 2.9 Admin Module (`src/modules/admin`)
- **Primary Responsibility**: User management, account ban toggling, administrative user deletion lifecycle, platform metrics, and admin bootstrap.
- **Controllers & Routes**: `admin-user.controller.ts`, `admin-metrics.controller.ts`
  - `GET /api/v1/admin/users`
  - `PATCH /api/v1/admin/users/:id/ban`
  - `DELETE /api/v1/admin/users/:id`
  - `GET /api/v1/admin/metrics`
- **Services**: `AdminUserService`, `AdminMetricsService`, `AdminBootstrapService`.
- **Database Entities Owned**: None directly; coordinates platform-wide entities.
- **Cross-Module Imports**: Imports `AuthModule` (uses `PasswordService` during bootstrap).
- **Cross-Module Prisma Access**:
  - `deleteUser`: Executes atomic multi-table cascading deletions in a single Prisma `$transaction` across `applications`, `interview_prep_logs`, `ai_analyses`, `resumes`, `jobs`, `students`, `recruiters`, and `users`.
  - `getMetrics`: Queries counts on `users`, `jobs`, and `applications`.
- **Boundary Strength**: **Moderate** (inherently cross-cutting administrative domain).

---

## 3. Dependency Direction & Module Coupling Matrix

| Source Module | Target Module | Dependency Type | Details |
| :--- | :--- | :--- | :--- |
| `StudentModule` | `ApplicationModule` | NestJS Module Import | To serve `/students/applications` via `ApplicationService` |
| `JobModule` | `StudentModule` | NestJS Module Import | `InterviewPrepService` calls `StudentService.getProfileByUserId` |
| `ResumeModule` | `StudentModule` | NestJS Module Import | `ResumeService` calls `StudentService.getProfileByUserId` |
| `AdminModule` | `AuthModule` | NestJS Module Import | `AdminBootstrapService` uses `PasswordService` |
| *All Modules* | `AuthModule` | NestJS Module Import | Route guards (`JwtAuthGuard`, `RolesGuard`) & `AuthenticatedUser` |
| *All Modules* | `PrismaModule` | Global Injection | Database connection pool access |
| *All Modules* | `QueueModule` | Global Injection | Background job enqueue via `QueueService` |

### Key Architectural Coupling Points
1. **Application Hub Coupling**: `Application` is the relational pivot of the system. It connects `Job`, `Student`, `Resume`, and `Recruiter`. As a result, `ApplicationService` reads from 4 foreign tables, while `ResumeService` and `JobService` check application state.
2. **Admin Cascading Deletion Coupling**: `AdminUserService.deleteUser` requires synchronous transactional atomicity across all relational tables. In a distributed architecture, this would require complex saga choreography or outbox patterns. In the modular monolith, it is cleanly handled by PostgreSQL `$transaction`.
3. **Queue Payload Coupling**: Queues are decoupled by `pg-boss`, but worker jobs (`NotificationEmailWorker`, `ResumeExtractionWorker`) currently fetch extra context from PostgreSQL rather than carrying fully self-contained event payloads.

---

## 4. Evaluation of Microservice Extraction Candidates

| Candidate Sub-Domain | Compute / Scaling Profile | Data Coupling | Readiness Assessment | Verdict |
| :--- | :--- | :--- | :--- | :--- |
| **Resume Extraction & AI Worker** | High CPU (PDF parsing) & High I/O (Gemini API) | Moderate (`resumes`, `ai_analyses`) | Asynchronous boundary via `pg-boss` already exists. Could run as independent worker process. | **Candidate for future compute isolation** (only if CPU load threatens API latency) |
| **Notifications Service** | Low CPU, High I/O (Resend HTTP API) | Low (`email_deliveries` only) | Asynchronous boundary via `pg-boss` already exists. Payloads need enrichment. | **Viable candidate**, but low operational benefit at current scale |
| **Auth / Identity Service** | Low CPU, latency-critical | High (referenced by all modules) | Extracting would add network round-trips to every authenticated request. | **Keep in Monolith** |
| **Job & Applications** | Low-to-moderate I/O, relational | Extremely High (FKs, concurrency locks, cascading deletes) | Distributed transactions would introduce severe latency and failure modes. | **Keep in Monolith** |
| **Admin Operations** | Low volume, cross-cutting | Global relational access | Needs transactional access to all tables. | **Keep in Monolith** |

---

## 5. Concrete Boundary-Hardening Recommendations (Subphase 7.2)

To prepare for future architectural evolution without breaking the modular monolith, the following low-risk internal boundary improvements are recommended:

1. **Add `findById` to `CompanyService`**:
   - `RecruiterService.updateProfileByUserId` directly queries `prisma.company.findUnique`.
   - Adding `CompanyService.getCompanyById(id: string)` enables `RecruiterService` to access company data through a defined public service interface.
2. **Clarify Job-by-Recruiter Query Boundary**:
   - `RecruiterService.getJobsByUserId` directly queries `prisma.job.findMany`.
   - Exposing a dedicated method on `JobService` (`listJobsByRecruiterId`) allows `RecruiterService` to delegate job queries to the domain owner.
3. **Maintain Strict In-Process Interfaces**:
   - Continue using direct method injection rather than internal HTTP/REST calls.
   - Maintain Prisma transaction boundaries for multi-table administrative operations.

---

## 6. Formal Boundary Statement

> [!NOTE]
> **NO MICROSERVICE EXTRACTION PERFORMED IN THIS AUTONOMOUS BATCH.**
>
> All analysis confirms that the modular monolith is operating with high structural integrity, zero circular module dependencies, robust database-level concurrency guarantees, and clean test coverage (1,399/1,399 passing). Microservice extraction at this stage would introduce distributed systems latency, operational overhead, and failure modes without concrete business or scaling justification.
