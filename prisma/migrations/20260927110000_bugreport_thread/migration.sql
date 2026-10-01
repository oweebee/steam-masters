-- Fil de discussion bug reports : reponses supplementaires des deux cotes
CREATE TABLE "BugReportMessage" (
    "id" TEXT NOT NULL,
    "bugReportId" TEXT NOT NULL,
    "authorId" TEXT,
    "fromAdmin" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BugReportMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BugReportMessage_bugReportId_createdAt_idx" ON "BugReportMessage"("bugReportId", "createdAt");

ALTER TABLE "BugReportMessage" ADD CONSTRAINT "BugReportMessage_bugReportId_fkey" FOREIGN KEY ("bugReportId") REFERENCES "BugReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BugReportMessage" ADD CONSTRAINT "BugReportMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
