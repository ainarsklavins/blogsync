/*
  Warnings:

  - You are about to drop the column `costToUs` on the `Translations` table. All the data in the column will be lost.
  - You are about to drop the column `priceForUser` on the `Translations` table. All the data in the column will be lost.
  - You are about to drop the column `selectedPlan` on the `Translations` table. All the data in the column will be lost.
  - You are about to drop the `ArticleList` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropIndex
DROP INDEX "ConsentLogs_userEmail_idx";

-- AlterTable
ALTER TABLE "SystemState" ADD COLUMN     "lastProcessedAt" TIMESTAMP(3),
ADD COLUMN     "processingStartedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Translations" DROP COLUMN "costToUs",
DROP COLUMN "priceForUser",
DROP COLUMN "selectedPlan";

-- DropTable
DROP TABLE "ArticleList";
