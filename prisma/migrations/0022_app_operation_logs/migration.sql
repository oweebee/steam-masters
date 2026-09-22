CREATE TABLE "AppLog" (
  "id" TEXT NOT NULL,
  "runId" TEXT,
  "category" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AppLog_createdAt_idx" ON "AppLog"("createdAt");
CREATE INDEX "AppLog_runId_createdAt_idx" ON "AppLog"("runId", "createdAt");
CREATE INDEX "AppLog_category_createdAt_idx" ON "AppLog"("category", "createdAt");
