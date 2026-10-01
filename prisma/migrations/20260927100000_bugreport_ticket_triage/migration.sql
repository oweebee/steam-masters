-- Numéro de ticket séquentiel + triage manuel (en attente / à traiter)
ALTER TABLE "BugReport" ADD COLUMN "ticketNumber" SERIAL;
ALTER TABLE "BugReport" ADD COLUMN "enAttente" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BugReport" ADD COLUMN "aTraiter" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "BugReport_ticketNumber_key" ON "BugReport"("ticketNumber");
