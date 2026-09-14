-- CreateTable
CREATE TABLE "interview_prep_logs" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_prep_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interview_prep_logs_student_id_created_at_idx" ON "interview_prep_logs"("student_id", "created_at");

-- AddForeignKey
ALTER TABLE "interview_prep_logs" ADD CONSTRAINT "interview_prep_logs_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_prep_logs" ADD CONSTRAINT "interview_prep_logs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
