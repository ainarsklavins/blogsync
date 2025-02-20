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

-- CreateIndex
CREATE UNIQUE INDEX "ArticleList_slug_key" ON "ArticleList"("slug");
