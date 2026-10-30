-- ==============================================================================
-- CampusRide: Add Gender Column to Profiles
-- SRM University-AP Carpooling Platform
--
-- Safe, additive migration.
-- Run this in Supabase SQL Editor.
-- ==============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender text;

-- Optional check constraint for valid values
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_gender_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_gender_check
  CHECK (gender IS NULL OR gender IN ('Male', 'Female', 'Others'));

-- Notify PostgREST to reload schema cache immediately
NOTIFY pgrst, 'reload schema';

