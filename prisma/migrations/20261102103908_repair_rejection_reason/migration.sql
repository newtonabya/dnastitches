-- AlterTable
ALTER TABLE "RepairRequest" ADD COLUMN     "rejectionReason" TEXT;

-- CreateIndex
CREATE INDEX "RepairRequest_orderId_idx" ON "RepairRequest"("orderId");

-- CreateIndex
CREATE INDEX "RepairRequest_customOrderId_idx" ON "RepairRequest"("customOrderId");

