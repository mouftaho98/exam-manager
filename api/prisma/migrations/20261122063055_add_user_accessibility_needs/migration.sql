-- AlterTable
ALTER TABLE "User" ADD COLUMN     "needsAccessible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "needsLeftHanded" BOOLEAN NOT NULL DEFAULT false;
