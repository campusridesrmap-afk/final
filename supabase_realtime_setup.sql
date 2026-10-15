-- ==============================================================================
-- CampusRide Realtime Setup Migration
-- ==============================================================================
-- Enables PostgreSQL Logical Replication (Supabase Realtime) for `rides` and `bookings`.
--
-- Why this is required:
-- 1. By default, newly created Postgres tables are not published to `supabase_realtime`.
--    Without this, client subscriptions connect but Postgres never broadcasts change events.
-- 2. REPLICA IDENTITY FULL ensures that UPDATE and DELETE WAL records include all row columns,
--    allowing Supabase Realtime to correctly evaluate Row Level Security (RLS) policies
--    so drivers and passengers receive authorized change notifications in real time.
-- ==============================================================================

-- 1. Add tables to supabase_realtime publication (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'rides'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rides;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'bookings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
  END IF;
END $$;

-- 2. Enable Full Replica Identity for accurate RLS evaluation during UPDATE & DELETE
ALTER TABLE public.rides REPLICA IDENTITY FULL;
ALTER TABLE public.bookings REPLICA IDENTITY FULL;
