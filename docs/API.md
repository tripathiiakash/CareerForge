# CareerForge API Specification

**Base URL:** `/api/v1`
**Content-Type:** `application/json` (unless otherwise specified)
**Authentication:** JWT Bearer Token via `Authorization: Bearer <token>` header

---

## Global Standards

### Standard Success Response

All endpoints returning a single resource:

```json
{
  "success": true,
  "data": { ... }
}
```

### Standard Paginated Response

All list endpoints follow this envelope:

```json
{
  "success": true,
  "data": [ ... ],
  "meta": {
    "total": 120,
    "page": 1,
    "limit": 10,
    "totalPages": 12
  }
}
```

### Standard Error Response

All error responses follow this envelope:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description of the error",
    "details": [
      {
        "field": "email",
        "issue": "Must be a valid email format"
      }
    ]
  }
}
```

**Error Codes:**

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request body or query parameters failed validation |
| `UNAUTHORIZED` | 401 | Missing, expired, or malformed JWT token |
| `FORBIDDEN` | 403 | Authenticated but insufficient role or ownership |
| `NOT_FOUND` | 404 | Requested resource does not exist |
| `CONFLICT` | 409 | Action conflicts with existing state (e.g., duplicate) |
| `RATE_LIMITED` | 429 | Too many requests; retry after cooldown |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

### UUID Path Parameters

All `:id`, `:jobId`, `:resumeId`, and `:applicationId` path parameters must be valid UUID v4 format. Invalid UUIDs return `400 VALIDATION_ERROR`.

---

## 1. Authentication

Manages user identity and access tokens.

---

### 1.1 Register User

**Method:** `POST`

**Endpoint:** `/api/v1/auth/register`

**Authorization Requirements:** Public

**Validation Rules:**

- `email`: Required. Must be a valid email format. Max 255 characters. Automatically normalized to lowercase and trimmed by the server.
- `password`: Required. Minimum 8 characters, maximum 72 characters (bcrypt safe limit). Must contain at least 1 number and 1 special character.
- `role`: Required. Must be exactly `'STUDENT'` or `'RECRUITER'`. Registration as `'ADMIN'` is not permitted; admin accounts are provisioned via database seed only.

**Request Body:**

```json
{
  "email": "student@university.edu",
  "password": "SecurePassword123!",
  "role": "STUDENT"
}
```

**Response Body:** (201 Created)

```json
{
  "success": true,
  "data": {
    "user_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "email": "student@university.edu",
    "role": "STUDENT",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Missing fields, invalid email format, password too short/long, missing special char, invalid role |
| 409 | `CONFLICT` | Email is already registered |
| 429 | `RATE_LIMITED` | Max 5 registrations per IP per hour |

**Database Entities:** `users`. On successful registration, the server also creates an empty `students` or `recruiters` profile record linked to `users.id`.

---

### 1.2 Login User

**Method:** `POST`

**Endpoint:** `/api/v1/auth/login`

**Authorization Requirements:** Public

**Validation Rules:**

- `email`: Required. Valid email format. Max 255 characters.
- `password`: Required. Max 72 characters.

**Request Body:**

```json
{
  "email": "student@university.edu",
  "password": "SecurePassword123!"
}
```

**Response Body:** (200 OK)

```json
{
  "success": true,
  "data": {
    "user_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "email": "student@university.edu",
    "role": "STUDENT",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Missing email or password |
| 401 | `UNAUTHORIZED` | Invalid email or password. Response must use a generic message (e.g., "Invalid credentials") and must NOT reveal whether the email exists. |
| 403 | `FORBIDDEN` | Account has been banned/suspended by an administrator. Message: "Your account has been suspended. Contact support." |
| 429 | `RATE_LIMITED` | Max 10 failed login attempts per IP per 15 minutes |

**Database Entities:** `users`

**Note:** The `403 FORBIDDEN` response requires checking the `is_banned` field on the `users` table. See DATABASE.md flagged changes.

---

## 2. Student Profile

Manages the job seeker's profile data.

---

### 2.1 Get Current Student Profile

**Method:** `GET`

**Endpoint:** `/api/v1/students/me`

**Authorization Requirements:** Bearer Token, Role: `STUDENT`

**Validation Rules:** N/A (Resolves student ID from JWT).

**Request Body:** None

**Response Body:** (200 OK)

```json
{
  "success": true,
  "data": {
    "id": "a0f3d611-9a74-4b53-b09e-012b186b51e2",
    "first_name": "Rahul",
    "last_name": "Sharma",
    "university": "State University",
    "graduation_year": 2025,
    "degree": "B.Tech Computer Science",
    "skills": ["React", "Node.js", "TypeScript"],
    "github_url": "https://github.com/rahul123",
    "linkedin_url": "https://linkedin.com/in/rahul123"
  }
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | Missing or invalid token |
| 403 | `FORBIDDEN` | Authenticated user is not a `STUDENT` |
| 404 | `NOT_FOUND` | Student profile record does not exist |

**Database Entities:** `students`

---

### 2.2 Update Student Profile

**Method:** `PATCH`

**Endpoint:** `/api/v1/students/me`

**Authorization Requirements:** Bearer Token, Role: `STUDENT`

**Validation Rules:**

- `first_name`, `last_name`: Optional. String, 1–100 characters, trimmed.
- `university`: Optional. String, max 255 characters.
- `graduation_year`: Optional. Integer between 2000 and 2035.
- `degree`: Optional. String, max 100 characters.
- `skills`: Optional. Array of strings, max 30 items, each item max 50 characters. Server automatically lowercases and deduplicates entries.
- `github_url`, `linkedin_url`: Optional. Must be valid URL format if provided, max 255 characters.

**Semantics:** This is a `PATCH` endpoint. Omitted fields remain unchanged. Only provided fields are updated.

**Request Body:**

```json
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
```

**Response Body:** (200 OK — Returns the full updated profile, same shape as GET)

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Field validation failure (e.g., skills array exceeds 30 items, invalid URL format) |
| 401 | `UNAUTHORIZED` | Missing or invalid token |

**Database Entities:** `students`

---

### 2.3 Get Student's Applications

**Method:** `GET`

**Endpoint:** `/api/v1/students/me/applications`

**Authorization Requirements:** Bearer Token, Role: `STUDENT`

**Purpose:** Lists all jobs the authenticated student has applied to, with current application status. Supports the "My Applications" tracking tab.

**Validation Rules:**

- `page`: Optional query parameter. Integer, default `1`.
- `limit`: Optional query parameter. Integer, default `10`, max `50`.
- `status`: Optional query parameter. Enum filter: `'APPLIED'`, `'SHORTLISTED'`, or `'REJECTED'`.

**Request Body:** None

**Response Body:** (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "application_id": "c71a324b-6fe7-4347-814d-fa7bb7b98544",
      "status": "SHORTLISTED",
      "applied_at": "2024-02-10T14:30:00.000Z",
      "updated_at": "2024-02-12T09:15:00.000Z",
      "job": {
        "id": "e42e476e-3607-4e68-9a2f-98eb413ce161",
        "title": "Junior Backend Developer",
        "employment_type": "FULL_TIME",
        "company_name": "TechNova Solutions"
      }
    }
  ],
  "meta": {
    "total": 3,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | Missing or invalid token |

**Database Entities:** `applications`, `jobs`, `companies`

---

## 3. Companies

Manages organizations that recruiters belong to.

---

### 3.1 Create Company

**Method:** `POST`

**Endpoint:** `/api/v1/companies`

**Authorization Requirements:** Bearer Token, Role: `RECRUITER` or `ADMIN`

**Validation Rules:**

- `name`: Required. String, 2–255 characters.
- `website`: Optional. Must be a valid URL format if provided. Max 255 characters.
- `logo_url`: Optional. Must be a valid URL format if provided. Max 512 characters.

**Request Body:**

```json
{
  "name": "TechNova Solutions",
  "website": "https://technova.example.com",
  "logo_url": "https://s3.amazonaws.com/bucket/logo.png"
}
```

**Response Body:** (201 Created)

```json
{
  "success": true,
  "data": {
    "id": "1d8b67b1-419b-43d8-a53c-ebc4d32fbb47",
    "name": "TechNova Solutions",
    "website": "https://technova.example.com",
    "logo_url": "https://s3.amazonaws.com/bucket/logo.png"
  }
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Missing name, name too short, invalid URL format |
| 401 | `UNAUTHORIZED` | Missing or invalid token |
| 403 | `FORBIDDEN` | Role is not `RECRUITER` or `ADMIN` |
| 409 | `CONFLICT` | Company with this name already exists |

**Database Entities:** `companies`

---

## 4. Recruiters

Manages the hiring manager's profile data.

---

### 4.1 Get Current Recruiter Profile

**Method:** `GET`

**Endpoint:** `/api/v1/recruiters/me`

**Authorization Requirements:** Bearer Token, Role: `RECRUITER`

**Validation Rules:** N/A (Resolves recruiter ID from JWT).

**Request Body:** None

**Response Body:** (200 OK)

```json
{
  "success": true,
  "data": {
    "id": "3c7b2e11-8974-4b53-b09e-012b186b51e9",
    "first_name": "Sarah",
    "last_name": "Connor",
    "is_approved": true,
    "company": {
      "id": "1d8b67b1-419b-43d8-a53c-ebc4d32fbb47",
      "name": "TechNova Solutions",
      "website": "https://technova.example.com",
      "logo_url": "https://s3.amazonaws.com/bucket/logo.png"
    }
  }
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | Missing or invalid token |
| 403 | `FORBIDDEN` | Role is not `RECRUITER` |
| 404 | `NOT_FOUND` | Recruiter profile does not exist |

**Database Entities:** `recruiters`, `companies`

---

### 4.2 Update Recruiter Profile

**Method:** `PATCH`

**Endpoint:** `/api/v1/recruiters/me`

**Authorization Requirements:** Bearer Token, Role: `RECRUITER`

**Validation Rules:**

- `first_name`, `last_name`: Optional. String, 1–100 characters, trimmed.
- `company_id`: Optional. Must be a valid UUID that exists in the `companies` table.

**Semantics:** This is a `PATCH` endpoint. Omitted fields remain unchanged. Only provided fields are updated.

**Request Body:**

```json
{
  "first_name": "Sarah",
  "last_name": "Connor",
  "company_id": "1d8b67b1-419b-43d8-a53c-ebc4d32fbb47"
}
```

**Response Body:** (200 OK — Returns the full updated recruiter profile, same shape as GET)

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Invalid field values or malformed UUID |
| 401 | `UNAUTHORIZED` | Missing or invalid token |
| 404 | `NOT_FOUND` | Specified `company_id` does not exist in the companies table |

**Database Entities:** `recruiters`, `companies`

---

### 4.3 List Recruiter's Posted Jobs

**Method:** `GET`

**Endpoint:** `/api/v1/recruiters/me/jobs`

**Authorization Requirements:** Bearer Token, Role: `RECRUITER`

**Purpose:** Recruiter dashboard view showing all jobs they have posted, with applicant counts per job.

**Validation Rules:**

- `page`: Optional query parameter. Integer, default `1`.
- `limit`: Optional query parameter. Integer, default `10`, max `50`.
- `status`: Optional query parameter. Enum filter: `'PENDING'`, `'ACTIVE'`, or `'REJECTED'`.

**Request Body:** None

**Response Body:** (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "id": "e42e476e-3607-4e68-9a2f-98eb413ce161",
      "title": "Junior Backend Developer",
      "employment_type": "FULL_TIME",
      "status": "ACTIVE",
      "applicant_count": 14,
      "created_at": "2024-02-05T12:00:00.000Z"
    }
  ],
  "meta": {
    "total": 3,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | Missing or invalid token |

**Database Entities:** `jobs`, `applications` (aggregated count)

---

## 5. Jobs

Manages job postings.

---

### 5.1 Create Job Posting

**Method:** `POST`

**Endpoint:** `/api/v1/jobs`

**Authorization Requirements:** Bearer Token, Role: `RECRUITER`

**Validation Rules:**

- `title`: Required. String, 3–255 characters, trimmed.
- `description`: Required. String, minimum 50 characters, maximum 10,000 characters. Server sanitizes HTML to prevent stored XSS.
- `required_skills`: Required. Array of strings, minimum 1 item, maximum 20 items, each item max 50 characters.
- `employment_type`: Required. Enum: `'INTERNSHIP'` or `'FULL_TIME'`.

**Pre-conditions:** The recruiter must have a linked `company_id` in their profile. If no company is linked, return `400`.

**Request Body:**

```json
{
  "title": "Junior Backend Developer",
  "description": "We are looking for a Node.js developer with experience in building REST APIs and working with PostgreSQL databases...",
  "required_skills": ["Node.js", "PostgreSQL", "REST APIs"],
  "employment_type": "FULL_TIME"
}
```

**Response Body:** (201 Created)

```json
{
  "success": true,
  "data": {
    "id": "e42e476e-3607-4e68-9a2f-98eb413ce161",
    "status": "PENDING",
    "message": "Job created and pending admin approval."
  }
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Missing required fields, description too short, invalid employment type, recruiter has no linked company |
| 401 | `UNAUTHORIZED` | Missing or invalid token |
| 403 | `FORBIDDEN` | Role is not `RECRUITER` |

**Database Entities:** `jobs`, `recruiters`

**Note:** New jobs always default to `status = 'PENDING'`. They become visible to students only after admin approval via `PATCH /api/v1/admin/jobs/:id/status`.

---

### 5.2 Search & List Jobs

**Method:** `GET`

**Endpoint:** `/api/v1/jobs`

**Authorization Requirements:** Public (unauthenticated users see active jobs; authenticated students may get personalized data in future)

**Validation Rules:**

- `page`: Optional query parameter. Integer, default `1`.
- `limit`: Optional query parameter. Integer, default `10`, max `50`.
- `search`: Optional query parameter. String. Searches job title and description via SQL `ILIKE`.
- `skills`: Optional query parameter. Comma-separated list of strings (e.g., `?skills=react,node.js`). Filters jobs whose `required_skills` overlap with the provided list.
- `employment_type`: Optional query parameter. Enum: `'INTERNSHIP'` or `'FULL_TIME'`.

**Request Body:** None

**Response Body:** (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "id": "e42e476e-3607-4e68-9a2f-98eb413ce161",
      "title": "Junior Backend Developer",
      "company": {
        "id": "1d8b67b1-419b-43d8-a53c-ebc4d32fbb47",
        "name": "TechNova Solutions",
        "logo_url": "https://s3.amazonaws.com/bucket/logo.png"
      },
      "required_skills": ["Node.js", "PostgreSQL"],
      "employment_type": "FULL_TIME",
      "created_at": "2024-02-05T12:00:00.000Z"
    }
  ],
  "meta": {
    "total": 45,
    "page": 1,
    "limit": 10,
    "totalPages": 5
  }
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Invalid query parameter types (e.g., non-integer page) |

**Database Entities:** `jobs` (filtered by `status = 'ACTIVE'`), `companies`

**Note:** This endpoint only returns jobs with `status = 'ACTIVE'`. Pending and rejected jobs are not visible to students.

---

### 5.3 Get Job Details

**Method:** `GET`

**Endpoint:** `/api/v1/jobs/:id`

**Authorization Requirements:** Public. If the request includes a valid Bearer Token for a `STUDENT`, the response includes `has_applied`.

**Validation Rules:**

- `id`: Required. Valid UUID path parameter.

**Request Body:** None

**Response Body:** (200 OK)

```json
{
  "success": true,
  "data": {
    "id": "e42e476e-3607-4e68-9a2f-98eb413ce161",
    "title": "Junior Backend Developer",
    "description": "We are looking for a Node.js developer with experience in building REST APIs and working with PostgreSQL databases...",
    "required_skills": ["Node.js", "PostgreSQL", "REST APIs"],
    "employment_type": "FULL_TIME",
    "company": {
      "id": "1d8b67b1-419b-43d8-a53c-ebc4d32fbb47",
      "name": "TechNova Solutions",
      "website": "https://technova.example.com",
      "logo_url": "https://s3.amazonaws.com/bucket/logo.png"
    },
    "has_applied": false,
    "created_at": "2024-02-05T12:00:00.000Z"
  }
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 404 | `NOT_FOUND` | Job does not exist or is not in `ACTIVE` status (unless requester is the owning recruiter or an admin) |

**Database Entities:** `jobs`, `companies`, `applications` (conditional query for `has_applied` when student token is present)

**Notes:**
- `has_applied` is only included when a valid `STUDENT` token is provided. Otherwise it is omitted.
- Recruiters who own the job and admins can view jobs regardless of status.

---

### 5.4 Update Job Posting

**Method:** `PATCH`

**Endpoint:** `/api/v1/jobs/:id`

**Authorization Requirements:** Bearer Token, Role: `RECRUITER`

**Purpose:** Allows a recruiter to edit their own job posting.

**Validation Rules:**

- `id`: Required. Valid UUID path parameter.
- `title`: Optional. String, 3–255 characters.
- `description`: Optional. String, min 50, max 10,000 characters. Server sanitizes HTML.
- `required_skills`: Optional. Array of strings, min 1 item, max 20 items.
- `employment_type`: Optional. Enum: `'INTERNSHIP'` or `'FULL_TIME'`.
- **Ownership check:** `job.recruiter_id` must match the authenticated recruiter's profile ID.

**Request Body:**

```json
{
  "title": "Junior Backend Developer (Updated)",
  "required_skills": ["Node.js", "PostgreSQL", "Docker"]
}
```

**Response Body:** (200 OK)

```json
{
  "success": true,
  "data": {
    "id": "e42e476e-3607-4e68-9a2f-98eb413ce161",
    "title": "Junior Backend Developer (Updated)",
    "status": "ACTIVE",
    "message": "Job updated successfully."
  }
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Field validation failure |
| 401 | `UNAUTHORIZED` | Missing or invalid token |
| 403 | `FORBIDDEN` | Recruiter does not own this job |
| 404 | `NOT_FOUND` | Job does not exist |

**Database Entities:** `jobs`

---

### 5.5 Delete Job Posting

**Method:** `DELETE`

**Endpoint:** `/api/v1/jobs/:id`

**Authorization Requirements:** Bearer Token, Role: `RECRUITER`

**Purpose:** Allows a recruiter to delete their own job posting.

**Validation Rules:**

- `id`: Required. Valid UUID path parameter.
- **Ownership check:** `job.recruiter_id` must match the authenticated recruiter's profile ID.

**Request Body:** None

**Response Body:** (200 OK)

```json
{
  "success": true,
  "message": "Job deleted successfully."
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | Missing or invalid token |
| 403 | `FORBIDDEN` | Recruiter does not own this job |
| 404 | `NOT_FOUND` | Job does not exist |

**Database Entities:** `jobs`, `applications` (associated applications should be handled on deletion)

---

### 5.6 Generate AI Interview Preparation

**Method:** `POST`

**Endpoint:** `/api/v1/jobs/:jobId/interview-prep`

**Authorization Requirements:** Bearer Token, Role: `STUDENT`

**Purpose:** Generates 5 tailored interview questions based on the student's skills and the specific job description. This is a synchronous LLM call (not queued via background worker). Frontend should display a loading state during the 2–5 second response time.

**Validation Rules:**

- `jobId`: Required. Valid UUID path parameter. Job must exist and be in `ACTIVE` status.
- **Application check:** The student must have an active application for this job with status `'APPLIED'` or `'SHORTLISTED'`. Students who have not applied cannot use this feature.
- **Rate limit:** Maximum 3 interview prep calls per student per day (protects Gemini free-tier quota).

**Request Body:** None

**Response Body:** (200 OK)

```json
{
  "success": true,
  "data": {
    "job_title": "Junior Backend Developer",
    "questions": [
      "Explain how you would design a RESTful API for a job application system.",
      "What is the difference between authentication and authorization? How would you implement both in Node.js?",
      "How do you handle N+1 query problems when using an ORM like Prisma?",
      "Describe a challenging bug you encountered in a project and how you resolved it.",
      "How would you implement rate limiting on an Express API to prevent abuse?"
    ]
  }
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Student has not applied to this job, or application status is `'REJECTED'` |
| 401 | `UNAUTHORIZED` | Missing or invalid token |
| 404 | `NOT_FOUND` | Job does not exist |
| 429 | `RATE_LIMITED` | Daily interview prep limit reached (max 3/day) |

**Database Entities:** `students`, `jobs`, `applications`

---

## 6. Resumes

Handles file uploads and resume records.

---

### 6.1 Upload Resume

**Method:** `POST`

**Endpoint:** `/api/v1/resumes/upload`

**Authorization Requirements:** Bearer Token, Role: `STUDENT`

**Validation Rules:**

- `Content-Type` must be `multipart/form-data`.
- File field name: `file`.
- File must be a PDF. The server must validate both the file extension (`.pdf`) and the file's binary magic bytes (must start with `%PDF-` signature) to prevent disguised uploads.
- Maximum file size: 5MB (5,242,880 bytes).

**Request Body:** FormData containing a `file` field.

**Response Body:** (201 Created)

```json
{
  "success": true,
  "data": {
    "id": "7823f95e-141a-4d43-8ceb-bf6a666245e3",
    "file_url": "https://cloud-storage.com/path/to/resume.pdf",
    "is_primary": true,
    "message": "Resume uploaded successfully. Text extraction queued."
  }
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | No file uploaded, file is not a valid PDF (extension or magic byte mismatch) |
| 401 | `UNAUTHORIZED` | Missing or invalid token |
| 413 | `VALIDATION_ERROR` | File exceeds 5MB size limit |

**Database Entities:** `resumes`

**Note:** The most recently uploaded resume automatically becomes the student's primary resume (`is_primary = true`). The server unsets `is_primary` on any previously primary resume within the same transaction.

---

### 6.2 List Student's Resumes

**Method:** `GET`

**Endpoint:** `/api/v1/resumes/me`

**Authorization Requirements:** Bearer Token, Role: `STUDENT`

**Purpose:** Lists all resumes uploaded by the authenticated student, with a flag indicating whether AI analysis has been completed for each.

**Validation Rules:** N/A

**Request Body:** None

**Response Body:** (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "id": "7823f95e-141a-4d43-8ceb-bf6a666245e3",
      "file_url": "https://cloud-storage.com/path/to/resume.pdf",
      "is_primary": true,
      "has_analysis": true,
      "created_at": "2024-02-01T10:00:00.000Z"
    }
  ]
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | Missing or invalid token |

**Database Entities:** `resumes`, `ai_analyses` (left join to check existence)

---

## 7. AI Resume Analysis

Triggers and retrieves the LLM-powered feedback.

---

### 7.1 Trigger Resume Analysis

**Method:** `POST`

**Endpoint:** `/api/v1/resumes/:resumeId/analyze`

**Authorization Requirements:** Bearer Token, Role: `STUDENT`

**Purpose:** Enqueues a background job that extracts text from the resume PDF and sends it to the Google Gemini API for scoring and feedback.

**Validation Rules:**

- `resumeId`: Required. Valid UUID path parameter. Must be a resume owned by the requesting student.
- **Cooldown:** A student cannot trigger a new analysis on the same resume if one was completed within the last 5 minutes. This protects the Gemini free-tier API quota.

**Request Body:** None

**Response Body:** (202 Accepted)

```json
{
  "success": true,
  "data": {
    "resume_id": "7823f95e-141a-4d43-8ceb-bf6a666245e3",
    "status": "PROCESSING",
    "message": "Resume analysis enqueued."
  }
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | Missing or invalid token |
| 403 | `FORBIDDEN` | Resume belongs to a different student |
| 404 | `NOT_FOUND` | Resume does not exist |
| 429 | `RATE_LIMITED` | Analysis cooldown in effect. Message: "Please wait before re-analyzing this resume." |

**Database Entities:** `resumes`, `ai_analyses`

---

### 7.2 Get Resume Analysis Results

**Method:** `GET`

**Endpoint:** `/api/v1/resumes/:resumeId/analysis`

**Authorization Requirements:** Bearer Token, Role: `STUDENT`

**Validation Rules:**

- `resumeId`: Required. Valid UUID path parameter. Must be a resume owned by the requesting student.

**Request Body:** None

**Response Body — Processing:** (200 OK)

```json
{
  "success": true,
  "data": {
    "status": "PROCESSING",
    "analysis": null
  }
}
```

**Response Body — Completed:** (200 OK)

```json
{
  "success": true,
  "data": {
    "status": "COMPLETED",
    "analysis": {
      "score": 75,
      "missing_skills": ["Docker", "CI/CD"],
      "formatting_tips": [
        "Use bullet points for experience instead of paragraphs.",
        "Include metrics (e.g., 'improved speed by 20%')."
      ],
      "created_at": "2024-02-01T10:02:15.000Z"
    }
  }
}
```

**Response Body — Failed:** (200 OK)

```json
{
  "success": true,
  "data": {
    "status": "FAILED",
    "error_message": "Failed to parse resume text. Please ensure the PDF is not password-protected or an image scan.",
    "analysis": null
  }
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | Missing or invalid token |
| 403 | `FORBIDDEN` | Resume belongs to a different student |
| 404 | `NOT_FOUND` | Resume or analysis record does not exist (analysis has never been triggered) |

**Database Entities:** `resumes`, `ai_analyses`

**Note:** The `status` field maps to the `status` column on `ai_analyses`: `'PROCESSING'`, `'COMPLETED'`, or `'FAILED'`. The `error_message` field maps to the `error_message` column. See DATABASE.md flagged changes.

---

## 8. Applications

Connects students to jobs.

---

### 8.1 Apply to a Job

**Method:** `POST`

**Endpoint:** `/api/v1/jobs/:jobId/apply`

**Authorization Requirements:** Bearer Token, Role: `STUDENT`

**Validation Rules:**

- `jobId`: Required. Valid UUID path parameter. Job must exist and have `status = 'ACTIVE'`.
- `resume_id`: Required in request body. Must be a valid UUID **owned by the requesting student**. The server must verify `resumes.student_id` matches the authenticated student's profile ID to prevent BOLA/IDOR attacks.
- **Duplicate check:** The database enforces a unique constraint on `(job_id, student_id)`. If the student has already applied to this job, return `409 CONFLICT`.

**Request Body:**

```json
{
  "resume_id": "7823f95e-141a-4d43-8ceb-bf6a666245e3"
}
```

**Response Body:** (201 Created)

```json
{
  "success": true,
  "data": {
    "application_id": "c71a324b-6fe7-4347-814d-fa7bb7b98544",
    "status": "APPLIED",
    "applied_at": "2024-02-10T14:30:00.000Z",
    "message": "Successfully applied to the job."
  }
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Job is not in `ACTIVE` status (e.g., `PENDING`, `REJECTED`, or closed) |
| 401 | `UNAUTHORIZED` | Missing or invalid token |
| 403 | `FORBIDDEN` | `resume_id` does not belong to the authenticated student |
| 404 | `NOT_FOUND` | Job or resume does not exist |
| 409 | `CONFLICT` | Student has already applied to this job |

**Database Entities:** `applications`, `jobs`, `resumes`, `students`

---

### 8.2 Get Applicants for a Job

**Method:** `GET`

**Endpoint:** `/api/v1/jobs/:jobId/applicants`

**Authorization Requirements:** Bearer Token, Role: `RECRUITER`

**Purpose:** Returns a paginated list of students who applied to the recruiter's job, with sufficient profile detail for evaluation.

**Validation Rules:**

- `jobId`: Required. Valid UUID path parameter. The requesting recruiter must own this job (`job.recruiter_id` matches recruiter profile ID).
- `page`: Optional query parameter. Integer, default `1`.
- `limit`: Optional query parameter. Integer, default `10`, max `50`.
- `status`: Optional query parameter. Enum filter: `'APPLIED'`, `'SHORTLISTED'`, or `'REJECTED'`.

**Request Body:** None

**Response Body:** (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "application_id": "c71a324b-6fe7-4347-814d-fa7bb7b98544",
      "student": {
        "id": "a0f3d611-9a74-4b53-b09e-012b186b51e2",
        "first_name": "Rahul",
        "last_name": "Sharma",
        "university": "State University",
        "degree": "B.Tech Computer Science",
        "graduation_year": 2025,
        "skills": ["React", "Node.js", "TypeScript"]
      },
      "resume": {
        "id": "7823f95e-141a-4d43-8ceb-bf6a666245e3",
        "file_url": "https://cloud-storage.com/path/to/resume.pdf"
      },
      "status": "APPLIED",
      "applied_at": "2024-02-10T14:30:00.000Z"
    }
  ],
  "meta": {
    "total": 14,
    "page": 1,
    "limit": 10,
    "totalPages": 2
  }
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | Missing or invalid token |
| 403 | `FORBIDDEN` | Recruiter does not own this job |
| 404 | `NOT_FOUND` | Job does not exist |

**Database Entities:** `applications`, `jobs`, `students`, `resumes`

---

### 8.3 Update Application Status

**Method:** `PATCH`

**Endpoint:** `/api/v1/applications/:id/status`

**Authorization Requirements:** Bearer Token, Role: `RECRUITER`

**Validation Rules:**

- `id`: Required. Valid UUID path parameter (Application ID).
- **Ownership check:** The recruiter must own the parent job associated with this application (`application.job_id -> job.recruiter_id` must match the authenticated recruiter).
- `status`: Required in request body. Enum: `'SHORTLISTED'` or `'REJECTED'`.

**Request Body:**

```json
{
  "status": "SHORTLISTED"
}
```

**Response Body:** (200 OK)

```json
{
  "success": true,
  "data": {
    "application_id": "c71a324b-6fe7-4347-814d-fa7bb7b98544",
    "status": "SHORTLISTED",
    "updated_at": "2024-02-12T09:15:00.000Z"
  }
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Invalid status value (must be `SHORTLISTED` or `REJECTED`) |
| 401 | `UNAUTHORIZED` | Missing or invalid token |
| 403 | `FORBIDDEN` | Recruiter does not own the parent job |
| 404 | `NOT_FOUND` | Application does not exist |

**Database Entities:** `applications`, `jobs`

---

## 9. Admin

Manages platform moderation, user management, and overview metrics. All admin endpoints require `Role: ADMIN`. Admin accounts are provisioned via database seed script only and cannot be created through the public registration endpoint.

---

### 9.1 List Pending Jobs for Moderation

**Method:** `GET`

**Endpoint:** `/api/v1/admin/jobs/pending`

**Authorization Requirements:** Bearer Token, Role: `ADMIN`

**Purpose:** Returns a paginated list of job postings awaiting admin approval. Includes recruiter and company context to aid moderation decisions.

**Validation Rules:**

- `page`: Optional query parameter. Integer, default `1`.
- `limit`: Optional query parameter. Integer, default `20`, max `50`.

**Request Body:** None

**Response Body:** (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "id": "e42e476e-3607-4e68-9a2f-98eb413ce161",
      "title": "Junior Backend Developer",
      "description": "We are looking for a Node.js developer...",
      "required_skills": ["Node.js", "PostgreSQL"],
      "employment_type": "FULL_TIME",
      "recruiter": {
        "first_name": "Sarah",
        "last_name": "Connor",
        "email": "sarah@technova.example.com"
      },
      "company": {
        "name": "TechNova Solutions"
      },
      "created_at": "2024-02-05T12:00:00.000Z"
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | Missing or invalid token |
| 403 | `FORBIDDEN` | Role is not `ADMIN` |

**Database Entities:** `jobs` (WHERE `status = 'PENDING'`), `recruiters`, `users`, `companies`

---

### 9.2 Moderate Job Status (Approve / Reject)

**Method:** `PATCH`

**Endpoint:** `/api/v1/admin/jobs/:id/status`

**Authorization Requirements:** Bearer Token, Role: `ADMIN`

**Purpose:** Approves a pending job (making it visible to students) or rejects it (hiding it from the public board and flagging it in the recruiter's dashboard).

**Validation Rules:**

- `id`: Required. Valid UUID path parameter.
- `status`: Required in request body. Enum: `'ACTIVE'` or `'REJECTED'`.

**Request Body:**

```json
{
  "status": "ACTIVE"
}
```

**Response Body:** (200 OK)

```json
{
  "success": true,
  "data": {
    "id": "e42e476e-3607-4e68-9a2f-98eb413ce161",
    "status": "ACTIVE",
    "message": "Job approved and now visible to students."
  }
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Invalid status value (must be `ACTIVE` or `REJECTED`) |
| 401 | `UNAUTHORIZED` | Missing or invalid token |
| 403 | `FORBIDDEN` | Role is not `ADMIN` |
| 404 | `NOT_FOUND` | Job does not exist |

**Database Entities:** `jobs`

---

### 9.3 List Platform Users

**Method:** `GET`

**Endpoint:** `/api/v1/admin/users`

**Authorization Requirements:** Bearer Token, Role: `ADMIN`

**Purpose:** Paginated list of all platform users for moderation. Supports filtering by role and searching by email.

**Validation Rules:**

- `page`: Optional query parameter. Integer, default `1`.
- `limit`: Optional query parameter. Integer, default `20`, max `50`.
- `role`: Optional query parameter. Enum filter: `'STUDENT'` or `'RECRUITER'`.
- `search`: Optional query parameter. String. Searches user email via SQL `ILIKE`.

**Request Body:** None

**Response Body:** (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "email": "student@university.edu",
      "role": "STUDENT",
      "is_banned": false,
      "created_at": "2024-01-15T08:00:00.000Z"
    }
  ],
  "meta": {
    "total": 120,
    "page": 1,
    "limit": 20,
    "totalPages": 6
  }
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | Missing or invalid token |
| 403 | `FORBIDDEN` | Role is not `ADMIN` |

**Database Entities:** `users`

**Note:** The `is_banned` field requires the corresponding column on the `users` table. See DATABASE.md flagged changes.

---

### 9.4 Delete / Ban User

**Method:** `DELETE`

**Endpoint:** `/api/v1/admin/users/:id`

**Authorization Requirements:** Bearer Token, Role: `ADMIN`

**Purpose:** Permanently deletes a malicious user account. Cascades deletion to all associated data: their profile (student or recruiter), resumes, AI analyses, applications, and any job postings they created.

**Validation Rules:**

- `id`: Required. Valid UUID path parameter.
- Admin cannot delete their own account.

**Request Body:** None

**Response Body:** (200 OK)

```json
{
  "success": true,
  "message": "User and associated data deleted."
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Admin attempted to delete their own account |
| 401 | `UNAUTHORIZED` | Missing or invalid token |
| 403 | `FORBIDDEN` | Role is not `ADMIN` |
| 404 | `NOT_FOUND` | User does not exist |

**Database Entities:** `users` → cascades to `students`/`recruiters` → cascades to `resumes`, `ai_analyses`, `applications`, `jobs`

---

### 9.5 Get Platform Metrics

**Method:** `GET`

**Endpoint:** `/api/v1/admin/metrics`

**Authorization Requirements:** Bearer Token, Role: `ADMIN`

**Purpose:** Returns high-level platform counters for the admin dashboard overview. Provides placement coordinators with a snapshot of platform health and activity.

**Validation Rules:** N/A

**Request Body:** None

**Response Body:** (200 OK)

```json
{
  "success": true,
  "data": {
    "total_students": 1420,
    "total_recruiters": 45,
    "active_jobs": 28,
    "pending_jobs": 3,
    "total_applications": 3890
  }
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | Missing or invalid token |
| 403 | `FORBIDDEN` | Role is not `ADMIN` |

**Database Entities:** `users` (count by role), `jobs` (count by status), `applications` (total count)

---

## 10. System

Platform health and operational endpoints.

---

### 10.1 Health Check

**Method:** `GET`

**Endpoint:** `/api/v1/health`

**Authorization Requirements:** None (Public)

**Purpose:** Liveness probe for PaaS deployment platforms (e.g., Render, Railway). Verifies that the server process is running and the database is reachable.

**Request Body:** None

**Response Body:** (200 OK)

```json
{
  "status": "healthy",
  "timestamp": "2024-02-12T10:00:00.000Z"
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 503 | `INTERNAL_ERROR` | Database connection failed |

**Database Entities:** Executes `SELECT 1` connectivity check on PostgreSQL.