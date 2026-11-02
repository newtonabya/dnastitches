-- AlterTable
ALTER TABLE "MeasurementProfile" ADD COLUMN     "previousVersionId" TEXT,
ADD COLUMN     "supersededAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "MeasurementProfile_previousVersionId_key" ON "MeasurementProfile"("previousVersionId");

-- CreateIndex
CREATE INDEX "MeasurementProfile_userId_supersededAt_idx" ON "MeasurementProfile"("userId", "supersededAt");

-- AddForeignKey
ALTER TABLE "MeasurementProfile" ADD CONSTRAINT "MeasurementProfile_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "MeasurementProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

