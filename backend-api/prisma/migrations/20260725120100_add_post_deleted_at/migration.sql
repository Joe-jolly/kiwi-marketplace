-- AlterTable
ALTER TABLE "Post" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Post_ownerId_status_deletedAt_idx" ON "Post"("ownerId", "status", "deletedAt");
