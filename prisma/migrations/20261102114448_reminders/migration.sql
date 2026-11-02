-- AlterTable
ALTER TABLE "Reminder" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "offsetMinutes" INTEGER NOT NULL,
ADD COLUMN     "skippedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_appointmentId_offsetMinutes_key" ON "Reminder"("appointmentId", "offsetMinutes");

