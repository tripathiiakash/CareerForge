Product Requirements Document (PRD): CareerForge
1. Product Overview
CareerForge is an AI-powered placement and career platform designed to connect college students with early-career opportunities while empowering them with AI-driven resume analysis and career guidance. It serves as a unified ecosystem for students, recruiters, and college administrators to streamline the entry-level hiring process.

2. Problem Statement
For Students: College students often lack awareness of how their resumes perform against industry standards and struggle to find targeted entry-level roles. They need personalized career guidance but cannot afford expensive career coaches.

For Recruiters: Recruiters receive thousands of unstructured resumes for entry-level roles, making it difficult to filter and identify candidates who actually possess the required skills.

For Colleges (Admins): Managing campus placements manually via spreadsheets or fragmented tools is inefficient, error-prone, and lacks actionable analytics.

3. Vision
To democratize career guidance and early-career hiring by providing every student with an AI-powered career assistant, while giving recruiters a seamless, high-signal platform to discover emerging talent.

4. Target Users
Students: College students and recent graduates looking for internships and full-time jobs.

Recruiters: HR professionals and hiring managers looking for entry-level talent.

Admins: College placement officers or platform administrators managing the ecosystem.

5. User Personas
Rahul (The Job Seeker): A 3rd-year CS student. He has built a few projects but doesn't know how to format his resume to pass ATS systems. He wants feedback on his resume and relevant internship recommendations.

Sarah (The Recruiter): A startup HR manager. She has zero budget for expensive ATS platforms. She wants to post a job quickly, get matched with students who actually know React/Node.js, and easily move them through a hiring pipeline.

Dr. Sharma (The Admin): A college placement coordinator. Wants to ensure only verified companies post jobs and needs a dashboard to see how many students have applied or been hired.

6. Goals
Successfully match students to relevant job postings.

Provide actionable, AI-generated feedback on student resumes.

Create a frictionless job posting and applicant tracking experience for recruiters.

Establish a robust modular monolith architecture that can evolve into microservices.

7. Non-Goals
We are not building a comprehensive Applicant Tracking System (ATS) for enterprise HR (e.g., Workday or Greenhouse).

We are not building a social network (no feeds, no posts, no messaging system between users).

We are not facilitating on-platform interviews (no video calls).

We are not integrating payment gateways (the MVP is strictly free-to-use).

8. MVP Scope
The MVP will focus strictly on the core loop: Student profile creation -> AI Resume Analysis -> Recruiter Job Posting -> Student Application -> Recruiter Shortlisting. The architecture will be a modular monolith using open-source/free-tier tools to ensure a zero-dollar operating budget.

9. Features in Detail (MoSCoW)
Must Have
Authentication: Role-based access control (Student, Recruiter, Admin) via JWT.

Student Profiles: Education, skills, projects, experience, and PDF resume upload.

Job Board: Recruiters can post/edit/delete jobs; Students can search/filter jobs.

Application Flow: Students can apply to jobs; Recruiters can view, shortlist, or reject applicants.

AI Resume Analysis: Extract text from uploaded PDFs and use a free-tier LLM API (e.g., Google Gemini Free Tier) to provide a score and improvement suggestions.

Admin Dashboard: Basic CRUD operations to manage users, approve/reject job postings.

Should Have
Job Recommendations: Basic matching of job required skills vs. student profile skills.

Application Tracking: Students can see the status of their applications (Applied, Shortlisted, Rejected).

AI Interview Prep: A prompt-based generation of likely interview questions based on the job description the student is applying for.

Email Notifications: Basic transactional emails (Welcome, Application Submitted) using free-tier services (e.g., Resend).

Could Have (If time permits)
AI Career Guidance: A chatbot interface where students can ask career questions (requires more complex prompt engineering and context management).

Company Profiles: A dedicated page showing all open jobs for a specific company.

Not Now (Out of Scope for MVP)
In-app real-time messaging.

Automated skill assessment tests (coding challenges).

Complex analytics and exportable CSV reports.

Native mobile applications.

10. Student User Flow
Onboarding: Sign up -> Select "Student" -> Complete profile (Education, Skills).

Resume Upload: Upload PDF resume -> System parses text -> Displays AI feedback and ATS score.

Discovery: Browse Job Board -> Filter by role/skills -> View Job Details.

Action: Click "Apply" -> Attach generated profile/resume.

Tracking: Go to "My Applications" tab to view status.

Preparation: Select an applied job -> Click "Generate Interview Prep" -> View AI-generated study guide.

11. Recruiter User Flow
Onboarding: Sign up -> Select "Recruiter" -> Await Admin approval (optional safety step).

Job Management: Dashboard -> Create Job Post (Title, Desc, Skills, Type).

Candidate Review: View Job -> See list of applicants -> Click applicant to view profile/resume.

Action: Change applicant status to "Shortlisted" or "Rejected".

12. Admin User Flow
Onboarding: Secure login via predefined admin credentials.

Moderation: View pending Recruiter accounts/Job posts -> Approve or Reject.

Management: View user tables (Students, Recruiters, Companies) -> Delete/Ban malicious users.

Overview: View high-level metrics (Total users, active jobs, total applications).

13. Core User Stories
As a Student, I want to upload my resume and get AI feedback, so that I can improve my chances of getting hired.

As a Student, I want to apply for jobs with one click, so that I save time during my job hunt.

As a Recruiter, I want to filter job applicants by skills, so that I can quickly find the most qualified candidates.

As a Recruiter, I want to update an applicant's status, so that I can manage my hiring pipeline.

As an Admin, I want to review and approve job postings, so that the platform remains free of spam.

14. Functional Requirements
Data Storage: PostgreSQL will store user profiles, job postings, and application statuses.

File Uploads: Resumes will be stored locally in the MVP or via a free-tier cloud bucket (AWS S3 Free Tier / Cloudinary), saving only the URL in the database.

Authentication: Email/Password based authentication with bcrypt hashing. No OAuth for MVP to save time.

Search: Basic SQL ILIKE or full-text search capabilities in PostgreSQL for jobs and candidates.

Background Jobs: Redis + BullMQ (or similar) to handle asynchronous tasks like parsing resumes and calling LLM APIs without blocking the main thread.

15. Non-Functional Requirements
Architecture (Modular Monolith): The codebase must be separated by business domains (e.g., /modules/users, /modules/jobs, /modules/applications).

Microservices Preparedness: Modules should not tightly couple SQL joins across domain boundaries. Instead, fetch IDs and assemble data in the service layer, preparing for a future where these modules sit on different servers.

Cost: Must run on $0. Use Vercel/Netlify for Frontend, Render/Railway free tier for Backend, Supabase/Neon free tier for PostgreSQL, and Upstash for Redis.

Maintainability: Strict TypeScript typing across frontend and backend. Unified linting and formatting (ESLint/Prettier).

16. AI Features
Strategy: Keep it stateless and API-driven to avoid high infrastructure costs.

Feature 1: Resume Parser & Grader:

Mechanism: Extract text using an open-source Node library (e.g., pdf-parse). Send text to Gemini API with a system prompt: "Act as an expert technical recruiter. Review this resume text. Give it a score out of 100, identify 3 missing key skills, and provide 2 actionable formatting tips. Return strictly in JSON format."

Feature 2: Interview Prep:

Mechanism: Combine Student Skills + Job Description -> Send to LLM -> Receive 5 tailored interview questions.

17. Security Requirements
API Security: All REST API routes must be protected by JWT middleware.

Authorization (RBAC): A student cannot hit a recruiter endpoint (e.g., POST /jobs). Middleware must check user.role.

Data Sanitization: Prevent SQL injection using parameterized queries (via Prisma or TypeORM). Prevent XSS by sanitizing inputs on the React frontend.

Rate Limiting: Implement basic rate limiting (e.g., express-rate-limit) on Auth and AI endpoints to prevent abuse and API billing overages.

18. Performance Requirements
API Response Time: Standard CRUD operations should resolve in < 300ms.

AI Processing Time: Resume analysis can take up to 5-10 seconds. The UI must show a loading skeleton or progress state. Do not block the UI.

Pagination: All list endpoints (Job list, Applicant list) must be paginated (Limit/Offset) to ensure fast load times.

19. Scalability Requirements
Stateless Backend: The Node.js application must be stateless. Sessions are managed via JWT.

Caching: Use Redis to cache the list of active job postings (which are read frequently but updated infrequently).

Decoupling: Use event-driven internal patterns (e.g., Node's EventEmitter) for cross-module communication (e.g., when a user is deleted, emit UserDeleted, and the Jobs module listens and deletes their applications).

20. Success Metrics
Activation Rate: % of registered students who upload a resume.

AI Utilization: % of students who use the AI Resume Analysis feature.

Liquidity: Average number of applications per job posting.

Engagement: Number of Daily Active Users (DAU).

21. Risks and Mitigations
Risk: Free-tier limits for LLM APIs are reached.

Mitigation: Implement strict daily rate limits per user on the backend. Handle API 429 (Too Many Requests) gracefully in the UI.

Risk: Developer burnout (single dev, large scope).

Mitigation: Strictly adhere to the MVP scope. Use UI component libraries (e.g., shadcn/ui, Tailwind) to rapidly build the frontend.

Risk: Fake recruiter accounts posting spam.

Mitigation: The Admin moderation workflow requires manual approval of the first job post from any new recruiter.

22. Future Features (Post-MVP)
Splitting the monolith into microservices (Auth Service, Job Service, AI Service).

Real-time WebSocket chat between recruiters and candidates.

Automated coding assessments integrated into the application pipeline.

Webhooks for enterprise ATS integrations.

Alumni networking and mentorship matching.

23. What should NOT be built in MVP
Do not build custom UI components from scratch (use Tailwind + Shadcn or MUI).

Do not build a custom AI model (strictly rely on free third-party APIs).

Do not overcomplicate the database schema with deeply nested relational constraints across domains; keep boundaries clean.

Do not set up Kubernetes; standard Docker containers on a PaaS (like Render) are sufficient.

24. MVP Acceptance Criteria
A student can create an account, upload a PDF, and view an AI-generated score and feedback.

A recruiter can create an account, post a job, and view it on the public job board.

A student can successfully apply to a job, and their application appears in the recruiter's dashboard.

The recruiter can change the status of that application to "Shortlisted", and the student sees this update on their tracking page.

An admin can log in and delete a job post or ban a user.

The application is successfully deployed using free-tier hosting solutions and is accessible via a public URL.