-- ==============================================================================
-- CampusRide: Remove Obsolete Admin Registration and Welcome Email Infrastructure
-- SRM University-AP Carpooling Platform
--
-- Main Objective:
-- Clean up retired manual admin review RPCs, push notification tables, and obsolete
-- functions after transitioning to automatic account activation via Email OTP.
--
-- Safety Guarantees:
-- 1. Does NOT drop public.registrations, public.profiles, or auth.users.
-- 2. Does NOT drop public.admin_create_student_user (actively used by submit_student_registration).
-- 3. Does NOT drop public.submit_student_registration or public.email_otp_challenges.
-- 4. Preserves all existing student accounts, ride offerings, and bookings.
-- ==============================================================================

-- 1. Drop retired manual admin registration approval RPC
-- Replaced by atomic auto-approval in public.submit_student_registration
DROP FUNCTION IF EXISTS public.admin_approve_registration(uuid);

-- 2. Drop retired manual admin registration rejection RPC
DROP FUNCTION IF EXISTS public.admin_reject_registration(uuid, text);
DROP FUNCTION IF EXISTS public.admin_reject_registration(uuid);

-- 3. Drop retired admin registration query RPC
DROP FUNCTION IF EXISTS public.admin_get_registrations(text);
DROP FUNCTION IF EXISTS public.admin_get_registrations();

-- 4. Clean up retired admin push notification subscriptions table & policies
-- (Used solely by retired manual review alert system)
DROP TABLE IF EXISTS public.admin_push_subscriptions CASCADE;

-- 5. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
