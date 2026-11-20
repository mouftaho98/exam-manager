-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "building" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Seat" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "row" INTEGER NOT NULL,
    "col" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "accessible" BOOLEAN NOT NULL DEFAULT false,
    "leftHanded" BOOLEAN NOT NULL DEFAULT false,
    "broken" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Seat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exam" (
    "id" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seatingGeneratedAt" TIMESTAMP(3),

    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamRoom" (
    "examId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,

    CONSTRAINT "ExamRoom_pkey" PRIMARY KEY ("examId","roomId")
);

-- CreateTable
CREATE TABLE "SeatAssignment" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "seatId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "checkinCode" TEXT NOT NULL,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeatAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Seat_roomId_row_col_key" ON "Seat"("roomId", "row", "col");

-- CreateIndex
CREATE UNIQUE INDEX "Seat_roomId_label_key" ON "Seat"("roomId", "label");

-- CreateIndex
CREATE INDEX "SeatAssignment_examId_roomId_idx" ON "SeatAssignment"("examId", "roomId");

-- CreateIndex
CREATE UNIQUE INDEX "SeatAssignment_examId_memberId_key" ON "SeatAssignment"("examId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "SeatAssignment_examId_seatId_key" ON "SeatAssignment"("examId", "seatId");

-- CreateIndex
CREATE UNIQUE INDEX "SeatAssignment_examId_checkinCode_key" ON "SeatAssignment"("examId", "checkinCode");

-- AddForeignKey
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamRoom" ADD CONSTRAINT "ExamRoom_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamRoom" ADD CONSTRAINT "ExamRoom_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatAssignment" ADD CONSTRAINT "SeatAssignment_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatAssignment" ADD CONSTRAINT "SeatAssignment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "OfferingMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatAssignment" ADD CONSTRAINT "SeatAssignment_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "Seat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

