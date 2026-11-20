-- CreateTable
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "checkedInById" TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CheckIn_examId_roomId_idx" ON "CheckIn"("examId", "roomId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckIn_examId_memberId_key" ON "CheckIn"("examId", "memberId");

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "OfferingMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

