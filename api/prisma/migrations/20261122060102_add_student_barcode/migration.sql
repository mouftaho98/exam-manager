-- CreateTable
CREATE TABLE "StudentBarcode" (
    "id" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "studentNumber" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentBarcode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentBarcode_barcode_key" ON "StudentBarcode"("barcode");
