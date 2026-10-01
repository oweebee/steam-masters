-- AlterTable: infos studio saisies manuellement par un admin (pas de source API)
ALTER TABLE "Studio" ADD COLUMN "about" TEXT;
ALTER TABLE "Studio" ADD COLUMN "avatarUrl" TEXT;
