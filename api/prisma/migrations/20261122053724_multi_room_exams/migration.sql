/*
  Warnings:

  - You are about to drop the column `roomId` on the `Exam` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Exam" DROP CONSTRAINT "Exam_roomId_fkey";

-- AlterTable
ALTER TABLE "Exam" DROP COLUMN "roomId";

-- CreateTable
CREATE TABLE "ExamRoom" (
    "examId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,

    CONSTRAINT "ExamRoom_pkey" PRIMARY KEY ("examId","roomId")
);

-- AddForeignKey
ALTER TABLE "ExamRoom" ADD CONSTRAINT "ExamRoom_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamRoom" ADD CONSTRAINT "ExamRoom_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
