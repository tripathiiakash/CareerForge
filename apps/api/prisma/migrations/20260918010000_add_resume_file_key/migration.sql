-- AlterTable
ALTER TABLE "resumes" ADD COLUMN "file_key" VARCHAR(255);

-- Backfill existing rows with extracted key from file_url
UPDATE "resumes"
SET "file_key" = regexp_replace(split_part("file_url", '?', 1), '^.*/', '')
WHERE "file_key" IS NULL AND "file_url" IS NOT NULL;

-- CreateIndex
CREATE INDEX "resumes_file_key_idx" ON "resumes"("file_key");
