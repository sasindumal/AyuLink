-- AlterTable
ALTER TABLE "PrescriptionItem" ADD COLUMN     "dispensed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dispensedAt" TIMESTAMP(3);
