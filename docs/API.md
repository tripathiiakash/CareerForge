1. Authentication
Manages user identity and access tokens.

Register User
Method: POST

Endpoint: /api/v1/auth/register

Authorization Requirements: Public

Validation Rules:

email: Must be a valid email format.

password: Minimum 8 characters, at least 1 number and 1 special character.

role: Must be exactly 'STUDENT' or 'RECRUITER'.

Request Body:

JSON
{
  "email": "student@university.edu",
  "password": "SecurePassword123!",
  "role": "STUDENT"
}
Response Body: (201 Created)

JSON
{
  "message": "User registered successfully",
  "user_id": "uuid-1234",
  "token": "jwt.header.payload.signature"
}
Login User
Method: POST

Endpoint: /api/v1/auth/login

Authorization Requirements: Public

Validation Rules:

email: Required, valid email.

password: Required.

Request Body:

JSON
{
  "email": "student@university.edu",
  "password": "SecurePassword123!"
}
Response Body: (200 OK)

JSON
{
  "token": "jwt.header.payload.signature",
  "role": "STUDENT",
  "user_id": "uuid-1234"
}
2. Student Profile
Manages the job seeker's data.

Get Current Student Profile
Method: GET

Endpoint: /api/v1/students/me

Authorization Requirements: Bearer Token, Role: STUDENT

Validation Rules: N/A (Resolves ID from JWT).

Request Body: None

Response Body: (200 OK)

JSON
{
  "id": "uuid-student-123",
  "first_name": "Rahul",
  "last_name": "Sharma",
  "university": "State University",
  "graduation_year": 2025,
  "degree": "B.Tech Computer Science",
  "skills": ["React", "Node.js", "TypeScript"],
  "github_url": "https://github.com/rahul123",
  "linkedin_url": "https://linkedin.com/in/rahul123"
}
Update Student Profile
Method: PUT

Endpoint: /api/v1/students/me

Authorization Requirements: Bearer Token, Role: STUDENT

Validation Rules:

first_name, last_name: Required, max 100 characters.

skills: Must be an array of strings.

github_url, linkedin_url: Must be valid URLs if provided.

Request Body: (Omitted fields are cleared or left unchanged based on PATCH/PUT semantics; using PUT here requires full object)

JSON
{
  "first_name": "Rahul",
  "last_name": "Sharma",
  "university": "State University",
  "graduation_year": 2025,
  "degree": "B.Tech Computer Science",
  "skills": ["React", "Node.js", "TypeScript", "PostgreSQL"],
  "github_url": "https://github.com/rahul123",
  "linkedin_url": "https://linkedin.com/in/rahul123"
}
Response Body: (200 OK - Returns updated profile)

3. Companies
Manages organizations that recruiters belong to.

Create Company
Method: POST

Endpoint: /api/v1/companies

Authorization Requirements: Bearer Token, Role: RECRUITER or ADMIN

Validation Rules:

name: Required, min 2 chars.

website: Valid URL.

Request Body:

JSON
{
  "name": "TechNova Solutions",
  "website": "https://technova.example.com",
  "logo_url": "https://s3.amazonaws.com/bucket/logo.png"
}
Response Body: (201 Created)

JSON
{
  "id": "uuid-company-123",
  "name": "TechNova Solutions",
  "website": "https://technova.example.com"
}
4. Recruiters
Manages the hiring manager's data.

Update Recruiter Profile
Method: PUT

Endpoint: /api/v1/recruiters/me

Authorization Requirements: Bearer Token, Role: RECRUITER

Validation Rules:

first_name, last_name: Required.

company_id: Must be a valid UUID existing in the Companies table.

Request Body:

JSON
{
  "first_name": "Sarah",
  "last_name": "Connor",
  "company_id": "uuid-company-123"
}
Response Body: (200 OK - Returns updated recruiter profile)

5. Jobs
Manages job postings.

Create Job Posting
Method: POST

Endpoint: /api/v1/jobs

Authorization Requirements: Bearer Token, Role: RECRUITER

Validation Rules:

title: Required, max 255 chars.

description: Required, min 50 chars.

required_skills: Required, Array of strings, min 1 item.

employment_type: Must be 'INTERNSHIP' or 'FULL_TIME'.

Request Body:

JSON
{
  "title": "Junior Backend Developer",
  "description": "We are looking for a Node.js developer...",
  "required_skills": ["Node.js", "PostgreSQL", "REST APIs"],
  "employment_type": "FULL_TIME"
}
Response Body: (201 Created)

JSON
{
  "id": "uuid-job-123",
  "status": "PENDING",
  "message": "Job created and pending admin approval."
}
Search & List Jobs
Method: GET

Endpoint: /api/v1/jobs

Authorization Requirements: Bearer Token, Role: STUDENT (or Public depending on visibility rules)

Validation Rules:

page, limit: Optional integers for pagination.

skills: Optional comma-separated list of strings.

search: Optional string.

Request Body: None

Response Body: (200 OK)

JSON
{
  "data": [
    {
      "id": "uuid-job-123",
      "title": "Junior Backend Developer",
      "company_name": "TechNova Solutions",
      "required_skills": ["Node.js", "PostgreSQL"],
      "employment_type": "FULL_TIME",
      "created_at": "2023-10-01T12:00:00Z"
    }
  ],
  "meta": {
    "total": 45,
    "page": 1,
    "limit": 10
  }
}
6. Resumes
Handles file uploads and resume records.

Upload Resume
Method: POST

Endpoint: /api/v1/resumes/upload

Authorization Requirements: Bearer Token, Role: STUDENT

Validation Rules:

Content-Type must be multipart/form-data.

File must be a .pdf.

File size max 5MB.

Request Body: FormData containing a file field.

Response Body: (201 Created)

JSON
{
  "id": "uuid-resume-456",
  "file_url": "https://cloud-storage.com/path/to/resume.pdf",
  "message": "Resume uploaded successfully. Text extraction queued."
}
7. AI Resume Analysis
Triggers and retrieves the LLM-powered feedback.

Trigger Resume Analysis
Method: POST

Endpoint: /api/v1/resumes/:resumeId/analyze

Authorization Requirements: Bearer Token, Role: STUDENT

Validation Rules:

resumeId: Must be a valid UUID owned by the requesting student.

Request Body: None

Response Body: (202 Accepted)

JSON
{
  "message": "Analysis queued.",
  "job_id": "bullmq-job-889"
}
Get Resume Analysis Results
Method: GET

Endpoint: /api/v1/resumes/:resumeId/analysis

Authorization Requirements: Bearer Token, Role: STUDENT

Validation Rules:

resumeId: Must be a valid UUID owned by the requesting student.

Request Body: None

Response Body: (200 OK)

JSON
{
  "status": "COMPLETED",
  "data": {
    "score": 75,
    "missing_skills": ["Docker", "CI/CD"],
    "formatting_tips": [
      "Use bullet points for experience instead of paragraphs.",
      "Include metrics (e.g., 'improved speed by 20%')."
    ],
    "created_at": "2023-10-02T14:30:00Z"
  }
}
(Note: If the background job is still running, status will be "PENDING" and data will be null)

8. Applications
Connects students to jobs.

Apply to a Job
Method: POST

Endpoint: /api/v1/jobs/:jobId/apply

Authorization Requirements: Bearer Token, Role: STUDENT

Validation Rules:

jobId: Must be a valid, ACTIVE job UUID.

resume_id: Required, must be a valid UUID owned by the student.

Request Body:

JSON
{
  "resume_id": "uuid-resume-456"
}
Response Body: (201 Created)

JSON
{
  "application_id": "uuid-app-789",
  "status": "APPLIED",
  "message": "Successfully applied to the job."
}
Get Applicants for a Job
Method: GET

Endpoint: /api/v1/jobs/:jobId/applicants

Authorization Requirements: Bearer Token, Role: RECRUITER

Validation Rules:

jobId: Required. The requesting recruiter must own the job.

Request Body: None

Response Body: (200 OK)

JSON
{
  "data": [
    {
      "application_id": "uuid-app-789",
      "student": {
        "first_name": "Rahul",
        "last_name": "Sharma",
        "skills": ["React", "Node.js"]
      },
      "resume_url": "https://cloud-storage.com/path/to/resume.pdf",
      "status": "APPLIED",
      "applied_at": "2023-10-03T10:00:00Z"
    }
  ]
}
Update Application Status
Method: PATCH

Endpoint: /api/v1/applications/:id/status

Authorization Requirements: Bearer Token, Role: RECRUITER

Validation Rules:

id: Required Application UUID. The recruiter must own the parent job.

status: Must be 'SHORTLISTED' or 'REJECTED'.

Request Body:

JSON
{
  "status": "SHORTLISTED"
}
Response Body: (200 OK)

JSON
{
  "application_id": "uuid-app-789",
  "status": "SHORTLISTED",
  "updated_at": "2023-10-04T09:15:00Z"
}