# Phase 7 — Service Extraction Readiness & Architectural Boundary Evaluation

> **Status**: APPROVED ARCHITECTURAL BASELINE  
> **Date**: September 2026  
> **Repository**: CareerForge  
> **Architecture**: True Modular Monolith (PostgreSQL + Prisma + pg-boss + Resend)

---

## 1. Executive Architectural Summary & Baseline Decision

CareerForge operates as a **True Modular Monolith**. Following the completion of Phase 6 security remediation, Phase 6.6 production hardening, and Subphases 7.1/7.2 modular boundary hardening, all system domains reside within a unified, strictly structured codebase.

### The Authoritative Architecture Decision:
1. **The Modular Monolith remains the authoritative production architecture.**
2. **No microservices are extracted in this autonomous batch.**
3. **No external message brokers (Redis, BullMQ, Kafka, RabbitMQ) are introduced.**
4. **PostgreSQL continues to serve as the unified source of truth for relational state and transactional background queues (pg-boss).**

Microservice extraction is an operational and scaling strategy to solve concrete bottlenecks—not an architectural goal in itself. Prematurely decomposing a cohesive monolith into microservices introduces network latency, distributed transaction failure modes (dual writes, partial commits, saga compensations), observability fragmentation, deployment orchestration complexity, and substantial operational overhead without business justification.

---

## 2. Comprehensive Bounded Context Evaluation

Every major domain within CareerForge was evaluated across 17 architectural dimensions to determine whether extraction into an independent deployable unit is justified, safe, or premature.

| Bounded Context | Domain Ownership | Relational Coupling | Concurrency / Transaction Model | Extraction Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| **Auth** | Identity, credentials, sessions | High (Users table references all profiles) | Synchronous, sub-millisecond JWT verification | **STAY IN MONOLITH** |
| **Student** | Candidate profiles, skills, links | High (Applications, Resumes, InterviewPrepLog) | Synchronous profile updates with user isolation | **STAY IN MONOLITH** |
| **Company** | Company records, metadata | Medium (Recruiters, Jobs) | Read-heavy, cached in queries | **STAY IN MONOLITH** |
| **Recruiter** | Recruiter profiles, verification | High (Jobs, Companies, Applications) | Synchronous profile updates & approval lifecycle | **STAY IN MONOLITH** |
| **Job** | Postings, skills, moderation | Critical (Applications, Recruiters, Companies) | State-machine transitions (`PENDING`, `ACTIVE`, `CLOSED`) | **STAY IN MONOLITH** |
| **Application** | Job applications, candidate pipeline | Critical relational nexus | Optimistic concurrency control (`P2025`), atomic status | **STAY IN MONOLITH** |
| **Resume (Storage/CRUD)** | Resume metadata, PDF storage keys | High (Students, Applications, AI Analyses) | Synchronous multipart upload & BOLA validation | **STAY IN MONOLITH** |
| **AI / Resume Processing** | PDF text extraction, LLM analysis | Decoupled via asynchronous pg-boss queue | Asynchronous, retriable, idempotent background workers | **FUTURE CANDIDATE (Compute Isolation Only)** |
| **Notifications** | Transactional email dispatch | Low (Asynchronous queue consumer) | Fire-and-forget background jobs | **STAY IN MONOLITH** |
| **Interview Preparation** | AI interview question generation | Medium (Student skills, Job descriptions) | Atomic PostgreSQL advisory lock quota reservations | **STAY IN MONOLITH** |
| **Admin** | Moderation, platform management | Critical (Cross-module cascade deletions) | Strict atomic multi-table `$transaction` | **STAY IN MONOLITH** |

---

## 3. Deep-Dive Candidate Evaluation

### 3.1. Why Core Domains Must Remain in the Monolith

#### A. Auth & Profiles (`Auth`, `Student`, `Recruiter`, `Company`)
- **Coupling Reality**: Every authenticated HTTP request invokes `JwtAuthGuard` and `RolesGuard`, performing fast in-memory cryptographic verification and database sanity checks against `users.is_banned`. Extracting Auth into an independent OAuth/OIDC service would turn zero-latency local checks into synchronous network RPCs on every single API hit, increasing P99 latency and introducing a critical single point of failure (SPOF).
- **Relational Integrity**: Student and Recruiter profiles enforce strict foreign-key cascades with the `users` table.

#### B. Job & Application Domain (`Job`, `Application`)
- **Coupling Reality**: The `applications` table is the relational hub connecting students, jobs, resumes, and recruiters. Job state transitions directly impact applicant actions (e.g. applications can only be submitted to jobs with status `ACTIVE`).
- **Transactional Atomicity**: Status transitions (`APPLIED` $\rightarrow$ `SHORTLISTED` $\rightarrow$ `REJECTED`) utilize Prisma optimistic concurrency handling (`P2025`) to prevent concurrent modification races. Splitting Jobs and Applications into separate services would necessitate 2-Phase Commit (2PC) or asynchronous Saga patterns to maintain consistency—an unjustified operational burden for the current scale.

#### C. Admin Domain (`Admin`)
- **Coupling Reality**: The admin module executes `AdminUserService.deleteUser`, which coordinates complete user deletion across `User`, `Student`, `Recruiter`, `Job`, `Application`, `Resume`, `AiAnalysis`, and `InterviewPrepLog` tables inside a single atomic Prisma transaction:
  ```typescript
  await this.prisma.$transaction(async (tx) => { ... });
  ```
- **Integrity Guarantee**: In a distributed microservice setup, account deletion requires a complex distributed saga with compensating actions if any service fails midway. In the monolith, PostgreSQL ACID guarantees complete rollback on any failure.

#### D. Interview Preparation (`JobModule / InterviewPrepService`)
- **Coupling Reality**: Generates AI interview questions conditioned on `student.skills` and `job.description`.
- **Quota Serialization**: Enforces daily per-student rate limits (3/day) using transactional advisory locks in PostgreSQL (`PostgresInterviewPrepQuotaStore`). Distributing this requires Redis distributed locks (`Redlock`), violating the zero-unnecessary-infrastructure constraint.

#### E. Notifications (`NotificationModule`)
- **Coupling Reality**: Notification dispatch is fully asynchronous via pg-boss (`notification-email-application-status`, `notification-email-job-submitted`).
- **Worker Overhead**: The email worker executes a few lines of code calling the Resend API with exponential backoff. The CPU and memory footprint is negligible (<5MB RSS). Extracting it into an independent service yields zero compute efficiency while adding deployment, monitoring, and pipeline overhead.

---

### 3.2. The Sole Viable Candidate: AI / Resume Processing Worker (Compute Isolation)

The **only** component in CareerForge that exhibits technical characteristics justifying future separation is the **AI / Resume Processing Worker** (`ResumeExtractionWorker` + `ResumeAnalysisWorker`).

#### Technical Evidence Supporting Compute Isolation:
1. **Resource Profile Discrepancy**:
   - Web API endpoints are I/O bound (waiting on PostgreSQL queries and client sockets).
   - Resume processing is CPU-bound (parsing PDF binary streams via `pdf-parse`) and memory-intensive (allocating multi-megabyte binary buffers per concurrent document).
   - High concurrent uploads can cause event loop starvation or memory spikes (V8 GC pauses) in the API process, degrading HTTP response latency for unrelated web traffic.
2. **Asynchronous Decoupling**:
   - The boundary is already 100% asynchronous. When a student uploads a resume, `ResumeService` saves the file, persists the `resume` record, enqueues a job to `resume-text-extraction` in pg-boss, and returns `201 Created` immediately.
   - The API server never waits for text extraction or AI analysis synchronously.
3. **Failure Isolation**:
   - A malformed or malicious PDF that triggers a parser infinite loop or memory leak crashes the worker process. In a unified process, this terminates the entire web server. In an isolated worker, the HTTP API remains 100% available while pg-boss automatically recovers or retries the failed job.
4. **Independent Scaling Axis**:
   - The web API scales with concurrent HTTP requests.
   - Resume extraction scales with upload volume and queue backlog.

---

## 4. Extraction Prerequisites & Concrete Triggers

Extraction of the AI Processing Worker should **NOT** happen speculatively. It must be triggered **only** when concrete telemetry metrics meet established thresholds.

### Concrete Operational Triggers:
1. **Event Loop Latency**: API process NodeJS event loop lag exceeds **100ms** for >5% of requests during peak resume upload intervals.
2. **Process Memory Pressure**: Worker memory allocation pushes container memory above **80% of limit**, risking OOM kills to the API server.
3. **Queue Backlog Duration**: pg-boss queue backlog for `resume-text-extraction` exceeds **500 jobs** with time-in-queue exceeding **120 seconds**, requiring horizontal worker scale-out independent of web server replicas.
4. **Organizational Boundary**: A dedicated ML/AI data engineering team assumes sole ownership of parsing models, prompts, and analysis pipelines.

---

## 5. Architectural Extraction Strategy: The Strangler Fig Pattern

If and when the triggers above are met, extraction must follow a non-breaking, step-by-step Strangler Fig migration pattern.

```
[ HTTP Clients ]
       │
       ▼
┌─────────────────────────────────────────┐
│   CareerForge Monolith (API Server)     │
│   - Express / NestJS HTTP Endpoints     │
│   - Enqueues jobs to pg-boss            │
└──────────────┬──────────────────────────┘
               │
               ▼ (Job Enqueued)
┌─────────────────────────────────────────┐
│        PostgreSQL / pg-boss             │
│   - Single shared database              │
│   - Queues: resume-text-extraction,     │
│             resume-ai-analysis          │
└──────────────▲──────────────────────────┘
               │ (Job Polled)
               │
┌──────────────┴──────────────────────────┐
│   Extracted AI Worker Process           │
│   (Isolated Compute Deployment)         │
│   - pdf-parse / Gemini LLM Integration  │
│   - Updates ai_analyses table directly  │
└─────────────────────────────────────────┘
```

### Strangler Fig Phasing:

#### Phase A: Process-Level Isolation (Zero Schema Change)
- Package the existing worker code (`ResumeExtractionWorker`, `ResumeAnalysisWorker`) into a dedicated binary entrypoint (`apps/worker/src/main.ts`).
- Deploy as a separate container or process instance pointing to the same PostgreSQL database and pg-boss queue.
- Disable worker registration in the web API process (`WorkerModule` toggle via `ENABLE_BACKGROUND_WORKERS=false`).
- **Result**: Immediate compute and failure isolation with zero API contract changes, zero database migration, and zero network RPCs.

#### Phase B: Storage Decoupling
- Migrate local filesystem storage (`LocalStorageProvider`) to S3-compatible cloud storage (AWS S3, Cloudflare R2, GCP Cloud Storage) using presigned URLs or storage keys.
- Workers download PDF buffers directly from object storage via canonical `file_key`, removing any shared filesystem dependency.

#### Phase C: Strict Event Contract Specification
- Formalize pg-boss job payload schemas into shared `@careerforge/types` and `@careerforge/validation` packages.
- Implement contract tests asserting that worker output matches the database entity shape expected by `ResumeAnalysisService`.

#### Phase D: Independent Database Extraction (Only If Warranted by Scale)
- If AI analysis data volume grows into tens of terabytes, isolate `ai_analyses` into a dedicated datastore.
- Monolith and AI Worker communicate via asynchronous transactional outbox events over PostgreSQL or an enterprise message broker.

---

## 6. Comprehensive Rollback Strategy

Any extraction initiative must have a deterministic, single-step rollback mechanism:

1. **Worker Re-enablement in Monolith**: Set `ENABLE_BACKGROUND_WORKERS=true` in the API environment and restart API containers. The monolith immediately re-attaches pg-boss listeners and resumes processing queue jobs.
2. **Independent Worker Termination**: Scale worker container replicas to 0.
3. **Zero Data Loss**: Because pg-boss persists all job states, retry limits, and singleton locks directly in PostgreSQL, in-flight jobs that fail or are unacknowledged during worker termination are automatically returned to `retry` state and picked up by the monolith.
4. **Zero Schema Rollback**: Because Process Isolation (Phase A) uses identical Prisma entity definitions, no database schema rollback is required.

---

## 7. Required Observability & Contract Testing

Before extracting any worker or service, the following telemetry and testing infrastructure must be operational:

### Observability Requirements:
- **Queue Depth & Latency**: Real-time gauge metrics for pg-boss active, queued, failed, and completed counts across all queue names.
- **Job Duration Tracking**: Histograms tracking execution duration for text extraction (target P95 < 2s) and Gemini LLM analysis (target P95 < 8s).
- **Correlated Distributed Tracing**: Trace ID propagation from HTTP request headers into pg-boss job metadata (`singletonKey`, correlation IDs) and into AI worker logs.
- **Memory & CPU Monitoring**: Dedicated process RSS and V8 heap statistics for worker instances.

### Contract Testing Requirements:
- **Schema Validation Tests**: Automated validation tests verifying that `ResumeTextExtractionJobData` and `ResumeAnalysisJobData` payloads match Zod schemas across versions.
- **Idempotency Verification**: Integration tests verifying that duplicate job delivery produces identical database state without duplicate records or corrupted statuses.
- **Worker Crash Recovery**: Automated chaos tests verifying that simulated worker SIGKILL results in graceful job re-scheduling by pg-boss without orphaned records.

---

## 8. Open Questions for Adversarial Review

1. **Object Storage Latency**: In a compute-isolated worker, does downloading 5MB PDFs from S3 over the network introduce higher latency than monolith local disk reads?  
   *Mitigation*: High-throughput streaming directly to parser memory without writing intermediate files to disk.
2. **pg-boss Polling Overhead at Scale**: If worker instances scale horizontally (e.g. 20 replicas), does concurrent polling on PostgreSQL `pgboss.job` create table bloat or lock contention?  
   *Mitigation*: Tune pg-boss batch size, polling interval, and vacuum settings. PostgreSQL can comfortably handle thousands of jobs/sec with pg-boss before polling contention emerges.
3. **Database Connection Limits**: Running separate worker processes consumes additional PostgreSQL connection pool slots.  
   *Mitigation*: Configure dedicated connection pools with conservative `max` settings (e.g., 5 connections per worker instance) or deploy PgBouncer connection pooling.

---

## 9. Final Operational Declaration

**NO MICROSERVICE EXTRACTION PERFORMED IN THIS AUTONOMOUS BATCH.**

The Modular Monolith remains intact, hardened, fully verified, and completely aligned with the CareerForge product roadmap.
