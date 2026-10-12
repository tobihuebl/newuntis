-- AlterTable
ALTER TABLE "TimetableVersion" ADD COLUMN     "name" TEXT;

-- Job-Queue (pg-boss): eigenes Schema, das der Laufzeit-Rolle gehört. sp_app darf dort Tabellen anlegen,
-- im Schema "public" weiterhin nicht. pg-boss legt seine Tabellen beim Start selbst an.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_namespace WHERE nspname = 'pgboss') THEN
    CREATE SCHEMA pgboss AUTHORIZATION sp_app;
  END IF;
END
$$;
