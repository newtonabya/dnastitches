-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "displayName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "moderatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Review_isApproved_createdAt_idx" ON "Review"("isApproved", "createdAt");

-- CreateIndex
CREATE INDEX "Review_productId_isApproved_idx" ON "Review"("productId", "isApproved");

