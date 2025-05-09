-- AlterTable
ALTER TABLE "ArticleTranslation" ADD COLUMN     "blog" JSONB,
ADD COLUMN     "category" JSONB,
ADD COLUMN     "image" JSONB,
ADD COLUMN     "metaKeywords" TEXT,
ADD COLUMN     "myImageUrl" TEXT,
ADD COLUMN     "outline" TEXT,
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "readingTime" INTEGER,
ADD COLUMN     "relatedPosts" JSONB,
ADD COLUMN     "slug" TEXT NOT NULL DEFAULT 'temp-slug',
ADD COLUMN     "tags" JSONB,
ALTER COLUMN "headline" SET DEFAULT 'Temp Headline',
ALTER COLUMN "html" SET DEFAULT '<p>Temp HTML</p>';

-- CreateIndex
CREATE INDEX "ArticleTranslation_slug_idx" ON "ArticleTranslation"("slug");

-- CreateIndex
CREATE INDEX "ArticleTranslation_published_idx" ON "ArticleTranslation"("published");
