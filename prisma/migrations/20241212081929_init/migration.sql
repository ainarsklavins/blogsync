-- CreateTable
CREATE TABLE "RawUploads" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "shortFileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "rawName" TEXT NOT NULL,
    "tokenCount" INTEGER NOT NULL,

    CONSTRAINT "RawUploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payments" (
    "id" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DOUBLE PRECISION NOT NULL,
    "isSuccessful" BOOLEAN NOT NULL DEFAULT false,
    "translationId" TEXT,

    CONSTRAINT "Payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Translations" (
    "id" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "uploadedFileId" TEXT NOT NULL,
    "targetLang" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "finishedAt" TIMESTAMP(3),
    "finishStatus" TEXT,

    CONSTRAINT "Translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "Payments" ADD CONSTRAINT "Payments_userEmail_fkey" FOREIGN KEY ("userEmail") REFERENCES "User"("email") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payments" ADD CONSTRAINT "Payments_translationId_fkey" FOREIGN KEY ("translationId") REFERENCES "Translations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Translations" ADD CONSTRAINT "Translations_userEmail_fkey" FOREIGN KEY ("userEmail") REFERENCES "User"("email") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Translations" ADD CONSTRAINT "Translations_uploadedFileId_fkey" FOREIGN KEY ("uploadedFileId") REFERENCES "RawUploads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
