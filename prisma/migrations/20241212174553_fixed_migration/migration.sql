/*
  Warnings:

  - You are about to drop the column `initiatedAt` on the `Payments` table. All the data in the column will be lost.
  - Made the column `translationId` on table `Payments` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Payments" DROP COLUMN "initiatedAt",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "translationId" SET NOT NULL;
