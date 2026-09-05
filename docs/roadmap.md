Here is the 6-month product and engineering roadmap for CareerForge, specifically tailored for a single student developer utilizing free-tier tools and building a modular monolith.

Month 1: Foundation & Identity
Goals
Establish the core infrastructure, continuous integration, and secure user authentication.

Features

Role-Based Authentication (Student, Recruiter, Admin).

JWT generation and secure cookie/header storage.

Basic Profile creation (Student details, Recruiter company linking).

Modular directory structure setup.

Technologies

Frontend: React, TypeScript, Vite, Tailwind CSS, React Router.

Backend: Node.js, Express (or NestJS), TypeScript, Prisma ORM.

Database: PostgreSQL (local via Docker).

Security: Bcrypt (hashing), jsonwebtoken.

Deliverables

Working docker-compose.yml for local Node + Postgres development.

Functioning user registration and login flows.

Protected frontend routes based on user role.

Initial database schema migrated and seeded with mock data.

Month 2: Core Job Board & Storage
Goals
Enable the primary marketplace loop: Recruiters posting jobs and Students viewing/applying to them.

Features

Job Management: Create, edit, and delete job postings (Recruiter).

Job Discovery: Search, filter, and view job details (Student).

Resume Upload: Secure PDF upload and storage.

Basic Application creation (linking student, resume, and job).

Technologies

Storage: Cloudinary or AWS S3 (Free Tier) for PDF storage.

Backend: Multer (handling multipart form data).

Frontend: React Query (data fetching and caching), Shadcn/UI components (forms, tables).

Deliverables

Public and authenticated job feed.

Working file upload system returning a cloud URL.

"Apply Now" button that successfully creates an application record in the database.

Month 3: The AI Engine & Asynchronous Processing
Goals
Build the core Unique Selling Proposition (USP) by integrating background workers and LLMs.

Features

Text extraction from uploaded PDFs.

AI Resume Analysis (Scoring, missing skills, formatting tips).

AI Interview Preparation (Generating questions based on Job + Profile).

Background job queue to prevent blocking the main API thread.

Technologies

Queue: Redis, BullMQ.

AI: Google Gemini API (Free Tier).

Parsing: pdf-parse (Node.js library).

Deliverables

Background worker process running independently of the main API.

Student dashboard displaying dynamic AI feedback on their resume.

Loading states (skeletons/spinners) on the frontend while AI processes.

Month 4: Recruiter Pipeline & Admin Moderation
Goals
Provide value to recruiters by allowing them to manage applicants, and secure the platform with admin oversight.

Features

Recruiter Dashboard: View applicant lists, filter by skills, update statuses (Shortlisted/Rejected).

Student Application Tracking: View status updates for applied jobs.

Admin Moderation: Approve/Reject pending job posts, view user tables, ban users.

Technologies

Database: Advanced PostgreSQL queries (Array overlaps for skill matching, pagination).

Frontend: Data tables, status dropdowns, modal views for student profiles.

Deliverables

Fully functional applicant tracking pipeline for recruiters.

Admin panel with job approval queue.

Cascading deletes implemented (e.g., deleting a job removes its applications).

Month 5: UX Polish, Notifications & Optimization
Goals
Make the MVP feel professional, responsive, and communicative.

Features

Transactional Emails: Welcome emails, application status updates.

UI/UX Polish: Error handling, toast notifications, mobile responsiveness.

API Optimization: Rate limiting on Auth and AI routes.

Input Sanitization: Hardening against XSS and SQL injection.

Technologies

Emails: Resend API (Free Tier).

Security: Helmet.js, Express-Rate-Limit, Zod (schema validation).

Frontend: Sonner or React-Toastify for alerts.

Deliverables

Automated email dispatching upon application status changes.

Mobile-friendly UI that looks good on phone screens.

Secured API endpoints that reject invalid payloads gracefully.

Month 6: Deployment, Beta Launch & Monitoring
Goals
Push the application to production and onboard the first cohort of beta testers.

Features

Production infrastructure setup.

Basic analytics tracking (Page views, button clicks).

Feedback collection form for beta users.

Technologies

Hosting: Vercel (Frontend), Render or Railway (Backend + Worker).

Database Hosting: Supabase or Neon (PostgreSQL), Upstash (Serverless Redis).

Analytics: Vercel Analytics or Google Analytics.

Deliverables

Live, publicly accessible domains (e.g., careerforge.app and api.careerforge.app).

Successful onboarding of 10-20 real student users and 1-2 friendly recruiters for beta testing.

A prioritized backlog of post-launch bug fixes and feature requests.