-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'NEEDS_CLARIFICATION', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "recruiter_verifications" (
    "id" UUID NOT NULL,
    "recruiter_id" UUID NOT NULL,
    "organization_name" VARCHAR(255) NOT NULL,
    "website_url" VARCHAR(255),
    "linkedin_url" VARCHAR(255),
    "designation" VARCHAR(100),
    "description" TEXT,
    "evidence_file_key" VARCHAR(255),
    "evidence_original_name" VARCHAR(255),
    "evidence_mime_type" VARCHAR(100),
    "evidence_size_bytes" INTEGER,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "clarification_message" TEXT,
    "clarification_requested_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recruiter_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recruiter_verifications_recruiter_id_key" ON "recruiter_verifications"("recruiter_id");

-- CreateIndex
CREATE INDEX "recruiter_verifications_status_idx" ON "recruiter_verifications"("status");

-- AddForeignKey
ALTER TABLE "recruiter_verifications" ADD CONSTRAINT "recruiter_verifications_recruiter_id_fkey" FOREIGN KEY ("recruiter_id") REFERENCES "recruiters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruiter_verifications" ADD CONSTRAINT "recruiter_verifications_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
