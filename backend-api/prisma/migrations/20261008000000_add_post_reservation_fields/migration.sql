-- Phase 11 Reservation: adds the single nullable, unique FK (`reservedChatId`)
-- plus `reservedAt`/`completedAt` timestamps to `Post` (Database Constitution
-- §22, Technical Constitution §19, Project Constitution §8 Rules 4/5).
--
-- Hand-trimmed from `prisma migrate diff`'s raw output: the diff (run via a
-- throwaway shadow database, per the Phase 9/10 precedent) spuriously
-- included `DROP INDEX` statements for the hand-maintained pg_trgm/GiST
-- indexes and an `ALTER COLUMN "location" DROP DEFAULT`, caused by Prisma's
-- introspection not recognizing the `Unsupported("geography(...)")`
-- generated column and its hand-written indexes (ADR-004). None of those
-- statements are related to this migration's actual change and are
-- intentionally omitted here, exactly as in the Phase 9/10 migrations.

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "reservedAt" TIMESTAMP(3),
ADD COLUMN     "reservedChatId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Post_reservedChatId_key" ON "Post"("reservedChatId");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_reservedChatId_fkey" FOREIGN KEY ("reservedChatId") REFERENCES "Chat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
