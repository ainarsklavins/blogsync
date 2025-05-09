-- AlterTable
ALTER TABLE "Translations" ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'en';

-- CreateTable
CREATE TABLE "TaskLogs" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "taskName" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB,
    "result" JSONB,
    "errorMessage" TEXT,
    "translationId" TEXT NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TaskLogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleTranslation" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "metaDescription" TEXT,
    "html" TEXT NOT NULL,
    "markdown" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArticleTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskLogs_taskName_key" ON "TaskLogs"("taskName");

-- CreateIndex
CREATE INDEX "TaskLogs_createdAt_idx" ON "TaskLogs"("createdAt");

-- CreateIndex
CREATE INDEX "TaskLogs_status_idx" ON "TaskLogs"("status");

-- CreateIndex
CREATE INDEX "TaskLogs_taskName_idx" ON "TaskLogs"("taskName");

-- CreateIndex
CREATE INDEX "TaskLogs_translationId_idx" ON "TaskLogs"("translationId");

-- CreateIndex
CREATE INDEX "ArticleTranslation_articleId_idx" ON "ArticleTranslation"("articleId");

-- CreateIndex
CREATE INDEX "ArticleTranslation_language_idx" ON "ArticleTranslation"("language");

-- CreateIndex
CREATE INDEX "ArticleTranslation_status_idx" ON "ArticleTranslation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleTranslation_articleId_language_key" ON "ArticleTranslation"("articleId", "language");

-- AddForeignKey
ALTER TABLE "TaskLogs" ADD CONSTRAINT "TaskLogs_translationId_fkey" FOREIGN KEY ("translationId") REFERENCES "Translations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleTranslation" ADD CONSTRAINT "ArticleTranslation_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "ArticleList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
