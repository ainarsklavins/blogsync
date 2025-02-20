/*
  Warnings:

  - You are about to drop the column `initiatedAt` on the `Payments` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `Payments` table without a default value. This is not possible if the table is not empty.
  - Made the column `translationId` on table `Payments` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Payments" DROP CONSTRAINT "Payments_translationId_fkey";

-- DropForeignKey
ALTER TABLE "Payments" DROP CONSTRAINT "Payments_userEmail_fkey";

-- First create the column (with default)
ALTER TABLE "Payments" 
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Then update existing records if needed (though not necessary since we have a default)
-- UPDATE "Payments" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL;

-- After all existing records have a value, you can remove the default if desired
ALTER TABLE "Payments" 
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- Add other new columns
ALTER TABLE "Payments"
ADD COLUMN "stripeSessionId" TEXT;

-- Add the index
CREATE INDEX "Payments_translationId_idx" ON "Payments"("translationId");

-- AddForeignKey
ALTER TABLE "Payments" ADD CONSTRAINT "Payments_translationId_fkey" FOREIGN KEY ("translationId") REFERENCES "Translations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- First add the userId column
ALTER TABLE "Payments" 
ADD COLUMN "userId" TEXT;

-- Then create the foreign key constraint
ALTER TABLE "Payments" ADD CONSTRAINT "Payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
