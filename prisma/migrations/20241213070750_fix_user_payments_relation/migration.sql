/*
  Warnings:

  - You are about to drop the column `userId` on the `Payments` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Payments" DROP CONSTRAINT "Payments_userId_fkey";

-- AlterTable
ALTER TABLE "Payments" DROP COLUMN "userId";

-- CreateIndex
CREATE INDEX "Payments_userEmail_idx" ON "Payments"("userEmail");

-- AddForeignKey
ALTER TABLE "Payments" ADD CONSTRAINT "Payments_userEmail_fkey" FOREIGN KEY ("userEmail") REFERENCES "User"("email") ON DELETE RESTRICT ON UPDATE CASCADE;
