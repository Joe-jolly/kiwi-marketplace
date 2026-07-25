-- Hand-written migration. See ADR-004 (Geospatial Feed Architecture).
--
-- Prisma cannot express PostGIS extensions, generated columns, or GiST
-- indexes natively, so this file is authored and reviewed by hand rather
-- than fully auto-generated. The corresponding `schema.prisma` field is
-- declared as `Unsupported("geography(Point, 4326)")` so Prisma Client
-- never attempts to read or write this column directly.

-- Enable the PostGIS extension (idempotent; safe to re-run).
CREATE EXTENSION IF NOT EXISTS postgis;

-- AlterTable: add a generated `location` column, always derived from the
-- existing `latitude`/`longitude` columns. `latitude`/`longitude` remain
-- the Prisma-writable source of truth; `location` is computed by the
-- database on every insert/update and can never drift out of sync with
-- them, because Postgres itself rejects any direct write to a STORED
-- generated column.
--
-- ST_MakePoint(x, y) takes (longitude, latitude) — X is longitude, Y is
-- latitude, per standard GIS convention. SRID 4326 is WGS84, matching
-- device GPS/geolocation output.
ALTER TABLE "Post"
  ADD COLUMN "location" geography(Point, 4326)
  GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
  ) STORED;

-- CreateIndex: GiST index backing both radius containment and
-- nearest-neighbor ordering queries against `location`.
CREATE INDEX "Post_location_idx" ON "Post" USING GIST ("location");
