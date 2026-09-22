-- Hand-trimmed. Prisma's auto-generated diff for this migration also
-- included spurious statements unrelated to the `Favorite` model: dropping
-- the hand-written pg_trgm indexes (`20260801130000_enable_pg_trgm_search_indexes`)
-- and `Post_location_idx` (ADR-004), plus `ALTER TABLE "Post" ALTER COLUMN
-- "location" DROP DEFAULT` — both are long-standing Prisma quirks with this
-- schema's `Unsupported("geography(...)")` generated column and the
-- intentionally hand-maintained, schema.prisma-unrepresented trigram
-- indexes (see that migration's own header comment), not a real diff. Those
-- statements were removed by hand; only the genuine `Favorite` model change
-- remains below.

-- CreateTable
CREATE TABLE "Favorite" (
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("userId","postId")
);

-- CreateIndex
CREATE INDEX "Favorite_postId_idx" ON "Favorite"("postId");

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
