-- CreateTable
CREATE TABLE "ArticleList" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "metaDescription" TEXT,
    "metaKeywords" TEXT,
    "html" TEXT NOT NULL,
    "markdown" TEXT,
    "outline" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "image" JSONB,
    "myImageUrl" TEXT,
    "tags" JSONB,
    "category" JSONB,
    "readingTime" INTEGER,
    "blog" JSONB,
    "relatedPosts" JSONB,

    CONSTRAINT "ArticleList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentLogs" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "consentGiven" BOOLEAN NOT NULL DEFAULT true,
    "userEmail" TEXT,
    "rawUploadId" TEXT NOT NULL,

    CONSTRAINT "ConsentLogs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArticleList_slug_key" ON "ArticleList"("slug");

-- CreateIndex
CREATE INDEX "ConsentLogs_ipAddress_idx" ON "ConsentLogs"("ipAddress");

-- CreateIndex
CREATE INDEX "ConsentLogs_userEmail_idx" ON "ConsentLogs"("userEmail");

-- CreateIndex
CREATE INDEX "ConsentLogs_rawUploadId_idx" ON "ConsentLogs"("rawUploadId");

-- AddForeignKey
ALTER TABLE "ConsentLogs" ADD CONSTRAINT "ConsentLogs_rawUploadId_fkey" FOREIGN KEY ("rawUploadId") REFERENCES "RawUploads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
