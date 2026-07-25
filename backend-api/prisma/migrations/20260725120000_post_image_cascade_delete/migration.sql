-- AlterTable: recreate PostImage FK with ON DELETE CASCADE so hard-deleting a
-- Post (including cascade from User deletion) also removes its images.
ALTER TABLE "PostImage" DROP CONSTRAINT "PostImage_postId_fkey";

ALTER TABLE "PostImage"
  ADD CONSTRAINT "PostImage_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "Post"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
