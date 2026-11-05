-- AlterEnum
ALTER TYPE "ReminderChannel" ADD VALUE 'SMS';

-- DropIndex
DROP INDEX "Reminder_appointmentId_offsetMinutes_key";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "smsReminders" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_appointmentId_channel_offsetMinutes_key" ON "Reminder"("appointmentId", "channel", "offsetMinutes");

