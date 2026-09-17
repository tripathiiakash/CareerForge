-- CreateTable
CREATE TABLE "rate_limits" (
    "key" VARCHAR(255) NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 1,
    "reset_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "rate_limits_reset_at_idx" ON "rate_limits"("reset_at");
