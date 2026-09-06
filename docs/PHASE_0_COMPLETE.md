# Phase 0 Completion Report: CareerForge

This document marks the completion of Phase 0 (Planning and Architecture) for CareerForge. It serves as a baseline of all finalized decisions before Phase 1 (Implementation) begins.

## 1. Product Scope
CareerForge is an AI-powered placement and career platform designed to connect college students with early-career opportunities. It provides students with AI-driven resume analysis and tailored interview preparation, while offering recruiters a streamlined, high-signal platform to discover and manage emerging talent.

## 2. Final MVP Features
The MVP strictly adheres to a core functional loop:
- **Authentication**: JWT-based Role-Based Access Control (RBAC).
- **Student Profiles**: Education, skills, and PDF resume upload.
- **Job Board**: Recruiters can post, edit, and delete jobs; students can search and filter them.
- **Application Flow**: 1-click apply for students; applicant tracking for recruiters (Shortlist/Reject).
- **AI Resume Analysis**: Automated PDF parsing and LLM-powered feedback (score, missing skills, formatting tips).
- **AI Interview Prep**: Synchronous generation of tailored interview questions based on job description and student skills.
- **Admin Dashboard**: Moderation of pending job posts, user management (ban/delete), and platform metrics.

## 3. User Roles
- **Student**: Job seekers who upload resumes, get AI feedback, and apply to jobs.
- **Recruiter**: Hiring managers who post jobs and review applicants.
- **Admin**: Platform moderators who approve jobs and manage users.

## 4. Final Architecture
- **Pattern**: Modular Monolith. The backend runs as a single Node.js process but internal code is strictly segregated by business domain (bounded contexts) to prepare for future microservice extraction.
- **Cross-Module Boundaries**: Modules communicate synchronously via service calls or asynchronously via an internal event emitter. Cross-module SQL joins are logically avoided where possible to maintain loose coupling.
- **Background Processing**: Heavy I/O tasks (resume parsing and AI analysis) are offloaded to a separate worker process running BullMQ and Redis to prevent blocking the main API thread.

## 5. Core Backend Modules
1. **Auth**: Identity and JWT issuance.
2. **Profiles**: Student and Recruiter/Company metadata.
3. **Jobs**: Job lifecycle (posting, searching, filtering).
4. **Applications**: Tracking student applications to jobs.
5. **AI & Resumes**: PDF upload, text extraction, and LLM orchestration.

## 6. Database Overview
- **Database**: PostgreSQL (Relational).
- **Core Tables**: 
  - `users` (with `is_banned` for moderation)
  - `companies`
  - `recruiters`
  - `students`
  - `resumes`
  - `ai_analyses` (supports async states: PROCESSING, COMPLETED, FAILED)
  - `jobs`
  - `applications` (with strict `job_id, student_id` unique constraint)

## 7. API Overview
- **Base URL**: `/api/v1`
- **Total Endpoints**: 28
- **Standardization**: Unified success envelopes (`{ success: true, data: ... }`), paginated list envelopes, and standard error envelopes (`{ success: false, error: ... }`).
- **RESTful Adherence**: Extensive use of correct HTTP verbs (`POST`, `GET`, `PATCH`, `DELETE`).

## 8. Security Decisions
- **Authentication**: Stateless JWTs passed via `Authorization: Bearer` headers.
- **Authorization (RBAC)**: Enforced via route-level middleware.
- **BOLA/IDOR Protection**: Explicit ownership checks on all sensitive endpoints (e.g., applying with a resume ID, recruiters editing a job, students requesting analysis).
- **File Upload Security**: Enforced PDF extension and binary magic-byte validation.
- **Rate Limiting**: Enforced limits on auth endpoints and expensive LLM endpoints (e.g., max 3 interview preps/day per student).

## 9. AI Features
The AI integration relies on the Google Gemini Free Tier API:
1. **Resume Analysis**: Handled asynchronously via BullMQ worker. Returns ATS score, missing skills, and formatting tips.
2. **Interview Prep**: Handled synchronously. Combines the student's skills with the applied job's description to yield 5 targeted questions.

## 10. Zero-Budget Infrastructure Strategy
To maintain a $0 operating budget, the MVP utilizes free-tier PaaS and SaaS offerings:
- **Frontend**: Vercel
- **Backend & Worker**: Render or Railway
- **Database**: Supabase or Neon (PostgreSQL)
- **Queue/Cache**: Upstash (Serverless Redis)
- **File Storage**: AWS S3 Free Tier or Cloudinary

## 11. Technologies Selected
- **Frontend**: React, TypeScript, Vite, Tailwind CSS, Shadcn/UI, React Router, React Query.
- **Backend**: Node.js, Express (or NestJS), TypeScript, Prisma ORM (or TypeORM).
- **Background Jobs**: BullMQ, Redis.
- **Validation**: Zod (or class-validator).

## 12. Features Explicitly Postponed (Out of Scope for MVP)
- Real-time in-app messaging.
- Job Recommendations engine (relying on manual skill filtering for MVP).
- Automated coding assessments.
- AI Career Guidance Chatbot.
- Native mobile applications.

## 13. Phase 1 Goals
Phase 1 transitions the project from planning to active implementation. The immediate goals are:
- Scaffold the monorepo structure.
- Establish local development environments via Docker.
- Implement the foundational PostgreSQL database schema.
- Build the core authentication module and secure middleware.

## 14. The First 10 Implementation Tasks
*(From TASKS.md)*

**Project Setup & Infrastructure**
1. Initialize Git monorepo with frontend and backend directories.
2. Set up `docker-compose.yml` for local PostgreSQL and Redis.
3. Initialize Node.js backend with TypeScript.
4. Configure ESLint and Prettier across the workspace.
5. Create global `.env.example` with required local variables.

**Database & ORM**
6. Initialize ORM (Prisma/TypeORM) in backend.
7. Define `User`, `Company`, and `Recruiter` models.
8. Define `Student`, `Resume`, and `AIAnalysis` models.
9. Define `Job` and `Application` models.
10. Run initial migration against local PostgreSQL database.
