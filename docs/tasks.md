Project Setup & Infrastructure
├── Repository & Development Environment
│   ├── [ ] Initialize Git monorepo with frontend and backend directories
│   ├── [ ] Set up docker-compose.yml for local PostgreSQL and Redis
│   ├── [ ] Initialize Node.js backend (Express or NestJS) with TypeScript
│   ├── [ ] Configure ESLint and Prettier across the workspace
│   └── [ ] Create global .env.example with required local variables

Database & ORM
├── Schema Design (Prisma / TypeORM)
│   ├── [ ] Initialize ORM in backend
│   ├── [ ] Define User, Company, and Recruiter models
│   ├── [ ] Define Student, Resume, and AIAnalysis models
│   ├── [ ] Define Job and Application models
│   ├── [ ] Run initial migration against local PostgreSQL database
│   └── [ ] Write a database seed script to generate mock users and jobs

Authentication Module
├── Core Auth API
│   ├── [ ] Implement password hashing utility (Bcrypt)
│   ├── [ ] Implement JWT generation utility
│   ├── [ ] Build POST /api/v1/auth/register (creates user in DB)
│   └── [ ] Build POST /api/v1/auth/login (validates password, returns JWT)
├── Security Middleware
│   ├── [ ] Create JWT verification middleware (extracts token from header/cookie)
│   └── [ ] Create Role-Based Access Control (RBAC) middleware to guard routes

Profiles Module
├── Student Profiles
│   ├── [ ] Build schema validation for student data (using Zod or Joi)
│   ├── [ ] Build GET /api/v1/students/me (fetch current student)
│   └── [ ] Build PUT /api/v1/students/me (update skills, education)
├── Recruiter & Company Profiles
│   ├── [ ] Build POST /api/v1/companies (create company profile)
│   └── [ ] Build PUT /api/v1/recruiters/me (link recruiter to company)

Jobs Module
├── Job Management API
│   ├── [ ] Build POST /api/v1/jobs (create job posting)
│   ├── [ ] Build GET /api/v1/jobs (list jobs with pagination, filters, and search)
│   ├── [ ] Build GET /api/v1/jobs/:id (fetch single job details)
│   ├── [ ] Build PUT /api/v1/jobs/:id (update job posting)
│   └── [ ] Build DELETE /api/v1/jobs/:id (delete job posting)

Resumes & AI Module
├── File Upload
│   ├── [ ] Set up Multer for handling multipart/form-data
│   ├── [ ] Integrate free-tier cloud storage SDK (AWS S3 or Cloudinary)
│   └── [ ] Build POST /api/v1/resumes/upload (save file, store URL in DB)
├── Background Worker & AI Processing
│   ├── [ ] Configure Redis connection and set up BullMQ queue
│   ├── [ ] Create standalone worker process to consume the queue
│   ├── [ ] Integrate pdf-parse in worker to extract text from PDF URL
│   ├── [ ] Integrate Google Gemini API to analyze extracted text
│   └── [ ] Save AI analysis results to ai_analyses table
├── AI API Endpoints
│   ├── [ ] Build POST /api/v1/resumes/:id/analyze (enqueue BullMQ job)
│   ├── [ ] Build GET /api/v1/resumes/:id/analysis (fetch job results)
│   └── [ ] Build POST /api/v1/jobs/:id/interview-prep (synchronous LLM call for prep questions)

Applications Module
├── Application Pipeline
│   ├── [ ] Build POST /api/v1/jobs/:id/apply (link student/resume to job)
│   ├── [ ] Build GET /api/v1/students/me/applications (Student view of applied jobs)
│   ├── [ ] Build GET /api/v1/jobs/:id/applicants (Recruiter view of applicants)
│   └── [ ] Build PATCH /api/v1/applications/:id/status (update status to Shortlisted/Rejected)

Admin Module
├── Moderation API
│   ├── [ ] Build GET /api/v1/admin/jobs/pending (fetch jobs awaiting approval)
│   ├── [ ] Build PATCH /api/v1/admin/jobs/:id/status (approve/reject job)
│   ├── [ ] Build GET /api/v1/admin/users (list all users)
│   └── [ ] Build DELETE /api/v1/admin/users/:id (ban user and trigger cascade delete events)

Frontend - Foundation
├── App Setup
│   ├── [ ] Initialize Vite + React + TypeScript application
│   ├── [ ] Install and configure Tailwind CSS
│   ├── [ ] Setup Shadcn/UI (install base components: Button, Input, Card, Table)
│   ├── [ ] Configure React Router (define Public, Student, Recruiter, Admin layouts)
│   └── [ ] Setup Axios instance with automatic JWT header injection interceptor

Frontend - Auth & Profiles
├── Authentication UI
│   ├── [ ] Build Login Page form
│   ├── [ ] Build Registration Page (with student/recruiter role toggle)
│   └── [ ] Implement React Context (AuthContext) for global user state
├── Onboarding UI
│   ├── [ ] Build Student Profile form (Education, degree, comma-separated skills)
│   └── [ ] Build Recruiter Onboarding form (Company creation/selection)

Frontend - Core Application
├── Student Experience
│   ├── [ ] Build Job Board Page (feed of jobs with search bar and filter chips)
│   ├── [ ] Build Job Details view with "Apply" button logic
│   ├── [ ] Build Resume Upload component (drag-and-drop zone)
│   ├── [ ] Build AI Feedback Dashboard (display score, skeleton loaders during polling)
│   └── [ ] Build "My Applications" tracking table
├── Recruiter Experience
│   ├── [ ] Build Recruiter Dashboard (stats and list of posted jobs)
│   ├── [ ] Build "Create Job" form
│   ├── [ ] Build Job Applicants View (data table of students)
│   └── [ ] Build Applicant Detail Modal (view student profile, PDF preview, accept/reject buttons)
├── Admin Experience
│   ├── [ ] Build Admin Dashboard (Pending Jobs table with Approve/Reject actions)
│   └── [ ] Build User Management table

Deployment & Launch
├── Production Release
│   ├── [ ] Provision Supabase/Neon for production PostgreSQL
│   ├── [ ] Provision Upstash for production serverless Redis
│   ├── [ ] Deploy Node.js Backend & Worker to Render or Railway
│   ├── [ ] Deploy React Frontend to Vercel
│   └── [ ] Run end-to-end tests in production to verify integrations