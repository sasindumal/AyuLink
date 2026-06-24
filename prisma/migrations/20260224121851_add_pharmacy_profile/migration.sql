-- AlterTable
ALTER TABLE "PrescriptionItem" ADD COLUMN     "dispensedById" TEXT;

-- CreateTable
CREATE TABLE "PharmacyProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pharmacyName" TEXT NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "pharmacyAddress" TEXT NOT NULL,

    CONSTRAINT "PharmacyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyProfile_userId_key" ON "PharmacyProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyProfile_licenseNumber_key" ON "PharmacyProfile"("licenseNumber");

-- AddForeignKey
ALTER TABLE "PharmacyProfile" ADD CONSTRAINT "PharmacyProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_dispensedById_fkey" FOREIGN KEY ("dispensedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
