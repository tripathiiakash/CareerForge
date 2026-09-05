Student Stories
1. Profile Creation and Resume Upload

As a Student,
I want to create a profile and upload my PDF resume,
So that recruiters can evaluate my qualifications and I can apply for jobs easily.

Acceptance Criteria:

The student can input fields: Education, Skills, Projects, and Experience.

The system allows the upload of a single PDF file (max size 5MB).

The file is stored via a free-tier storage bucket (e.g., AWS S3/Cloudinary) and the URL is saved in the database.

A success message is displayed upon profile completion.

2. AI Resume Analysis

As a Student,
I want to receive AI-generated feedback on my uploaded resume,
So that I can improve my ATS score and format before applying.

Acceptance Criteria:

Upon resume upload, the system extracts text using a PDF parser.

The extracted text is sent to the LLM API via a background job to prevent blocking the UI.

The UI displays a loading skeleton or spinner while processing.

The final output strictly displays: a score out of 100, 3 missing key skills, and 2 actionable formatting tips.

If the LLM API fails or rate limits, the UI gracefully displays a "Try again later" error message.

3. Job Discovery

As a Student,
I want to search and filter active job postings by skills and role,
So that I can find early-career opportunities that match my background.

Acceptance Criteria:

The student can view a paginated list of approved, active job postings.

A search bar allows filtering by job title using ILIKE queries in PostgreSQL.

Students can filter jobs by matching required skills.

Clicking a job card opens a detailed view showing the full description, company, and required skills.

4. 1-Click Application and Tracking

As a Student,
I want to apply for a job and track my application status,
So that I know exactly where I stand in the hiring process.

Acceptance Criteria:

The job detail page features an "Apply Now" button.

Clicking the button attaches the student's current profile and resume to the job (preventing duplicate data entry).

The student has a "My Applications" tab showing all applied jobs.

The status updates dynamically when a recruiter changes it (e.g., from "Applied" to "Shortlisted" or "Rejected").

5. AI Interview Preparation

As a Student,
I want to generate AI interview questions for a specific job I applied for,
So that I can prepare effectively for the upcoming interview.

Acceptance Criteria:

An "Interview Prep" button is available on jobs with an "Applied" or "Shortlisted" status.

Clicking it sends the student's skills and the specific job description to the LLM API.

The system returns exactly 5 tailored interview questions.

Recruiter Stories
1. Job Posting Creation

As a Recruiter,
I want to create and publish job postings,
So that students can view and apply for open roles at my company.

Acceptance Criteria:

The recruiter can access a form with fields: Job Title, Description, Required Skills (comma-separated), and Employment Type (Internship/Full-time).

Saving the form creates a record in the database.

The job status defaults to "Pending" if admin approval is required, or "Active" if automatically published.

2. Viewing and Filtering Applicants

As a Recruiter,
I want to view and filter the list of applicants for my job postings,
So that I can quickly identify the most qualified candidates.

Acceptance Criteria:

The recruiter dashboard displays a list of their active job postings with an applicant count for each.

Clicking a job shows a paginated list of student applicants.

The recruiter can filter this list by specific skills matching the students' profiles.

Clicking an applicant opens a modal/page displaying their full profile and a link to view their PDF resume.

3. Applicant Pipeline Management

As a Recruiter,
I want to update an applicant's status,
So that I can manage my hiring pipeline and notify candidates.

Acceptance Criteria:

Next to each applicant's name, there is a status dropdown or action buttons (Shortlist, Reject).

Updating the status triggers a database update.

The UI reflects the new status immediately without requiring a page refresh.

Admin Stories
1. Job Moderation

As an Admin,
I want to review and approve or reject new job postings,
So that the platform remains free of spam and low-quality listings.

Acceptance Criteria:

The admin dashboard contains a "Pending Jobs" queue.

The admin can view the job details and click "Approve" or "Reject".

Approved jobs become visible on the public student job board.

Rejected jobs are hidden and flagged in the recruiter's dashboard.

2. Platform and User Management

As an Admin,
I want to view and manage all platform users,
So that I can maintain a safe ecosystem and remove malicious accounts.

Acceptance Criteria:

The admin can view paginated tables for "Students" and "Recruiters".

The admin has a "Ban/Delete" button next to each user.

Deleting a user emits an internal system event to cleanly cascade and remove their applications/jobs to maintain database integrity (preparing for the future microservices boundary).

Banned users receive an authorization error if they attempt to log in.