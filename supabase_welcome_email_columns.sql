-- ==============================================================================
-- CampusRide: Welcome Email Tracking Columns
-- Safe, additive migration.
-- Does NOT replace any existing RPC functions or alter existing accounts.
-- Run in Supabase SQL Editor when ready.
-- ==============================================================================

-- 1. Add email status tracking columns to public.registrations
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS welcome_email_status text NOT NULL DEFAULT 'not_sent'
    CHECK (welcome_email_status IN ('not_sent', 'sending', 'sent', 'failed')),
  ADD COLUMN IF NOT EXISTS welcome_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS welcome_email_last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS welcome_email_error text;

-- 2. Index for quick lookup of email status by admin dashboards and workers
CREATE INDEX IF NOT EXISTS idx_registrations_welcome_email_status
  ON public.registrations (welcome_email_status);

-- 3. Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
