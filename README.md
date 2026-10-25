# CareerForge

> An AI-powered career launchpad connecting students with modern job opportunities, featuring automated ATS resume analysis, skill-gap detection, recruiter workflows, and interview preparation.

---

## Architecture Overview

CareerForge is architected as a modular monorepo using **npm workspaces** and **Turborepo**:

- **Frontend (`apps/web`)**: React 18, Vite, Tailwind CSS, TanStack Query, React Hook Form + Zod, Lucide icons.
- **Backend API (`apps/api`)**: NestJS 10, Express, Prisma ORM, PostgreSQL 16.
- **Job Queue (`pg-boss`)**: Transactional background job queue running natively within PostgreSQL without external Redis dependency.
- **AI Processing**: Google Gemini 2.5 Flash for ATS scoring, missing skill extraction, and personalized interview prep questions.
- **Storage**: Multi-provider storage engine supporting local filesystem storage, Backblaze B2 Native API, and AWS S3 / Cloudflare R2.
- **Shared Packages (`packages/*`)**:
  - `@careerforge/types`: Shared domain interfaces, DTOs, and enumeration types.
  - `@careerforge/validation`: Shared Zod schemas ensuring runtime contract consistency across web and API.
  - `@careerforge/config`: Shared ESLint, Prettier, and TypeScript configurations.

---

## Getting Started

### Prerequisites

- **Node.js**: `v20.x` or `v22.x`
- **npm**: `v10.x` or `v11.x`
- **Docker & Docker Compose**: For local PostgreSQL container

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/tripathiiakash/CareerForge.git
cd CareerForge
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` in the root and in `apps/api`:

```bash
cp .env.example .env
cp .env.example apps/api/.env
```

### 3. Start PostgreSQL Container

```bash
docker compose up -d postgres
```

### 4. Database Setup & Migrations

```bash
npm run prisma:generate --workspace=@careerforge/api
npm run prisma:migrate:dev --workspace=@careerforge/api
```

### 5. (Optional) Bootstrap Admin Account

```bash
npm run admin:bootstrap
```

### 6. Start Development Servers

```bash
npm run dev
```

- **Frontend**: [http://localhost:5173](http://localhost:5173) (Vite proxies `/api` to the backend)
- **Backend API**: [http://localhost:5000/api/v1](http://localhost:5000/api/v1)

---

## Testing

CareerForge maintains an automated testing suite across all tiers:

```bash
# Run all unit and DOM tests across workspaces
npm test

# Run backend API unit tests only
npm run test --workspace=@careerforge/api

# Run frontend web and DOM component tests
npm run test --workspace=@careerforge/web

# Run TypeScript typechecks
npm run typecheck

# Run database integration tests (requires PostgreSQL)
$env:TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/careerforge_test?schema=public"
npm run test:integration --workspace=@careerforge/api

# Run Playwright E2E browser tests
npm run test:e2e
```

---

## Security & Operational Safeguards

- **SEC-01 (Session Management)**: Authentication uses HttpOnly, SameSite cookies with server-side validation. JWT tokens are never exposed in browser localStorage.
- **BUS-01 (Quota Enforcement)**: Lifetime student application quotas enforced via PostgreSQL pessimistic row locks (`SELECT FOR UPDATE`).
- **Data Protection**: Strict cascading deletion policies for administrative actions ensure zero orphaned records and clean relational lifecycle management.
