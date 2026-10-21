-- ==============================================================================
-- CampusRide: Admin Phone Push Notifications Migration
-- SRM University-AP Carpooling Platform
--
-- Adds:
-- 1. `admin_push_subscriptions` table for storing verified administrator push endpoints
-- 2. `admin_registration_notifications` table for strict duplicate prevention / idempotency
-- 3. Secure RPCs for saving and removing admin push subscriptions
-- 4. Row Level Security ensuring regular students cannot view, register, or receive admin notifications
--
-- Instructions: Copy and run this script in the Supabase SQL Editor.
-- ==============================================================================

-- 1. Create table for administrator push subscriptions
CREATE TABLE IF NOT EXISTS public.admin_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT uq_admin_push_endpoint UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS idx_admin_push_user_id
  ON public.admin_push_subscriptions (user_id);

CREATE INDEX IF NOT EXISTS idx_admin_push_endpoint
  ON public.admin_push_subscriptions (endpoint);

-- Enable Row Level Security (RLS)
ALTER TABLE public.admin_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Security Policy: Strictly permit access ONLY to verified administrators
DROP POLICY IF EXISTS "Admins can view own push subscriptions" ON public.admin_push_subscriptions;
CREATE POLICY "Admins can view own push subscriptions"
  ON public.admin_push_subscriptions FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() AND public.is_app_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Admins can insert own push subscriptions" ON public.admin_push_subscriptions;
CREATE POLICY "Admins can insert own push subscriptions"
  ON public.admin_push_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND public.is_app_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Admins can update own push subscriptions" ON public.admin_push_subscriptions;
CREATE POLICY "Admins can update own push subscriptions"
  ON public.admin_push_subscriptions FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid() AND public.is_app_admin(auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid() AND public.is_app_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Admins can delete own push subscriptions" ON public.admin_push_subscriptions;
CREATE POLICY "Admins can delete own push subscriptions"
  ON public.admin_push_subscriptions FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid() AND public.is_app_admin(auth.uid())
  );

-- 2. Create idempotency table to track dispatched registration notifications
-- Guarantees notifications are sent strictly ONCE per new request, preventing duplicates from retries.
CREATE TABLE IF NOT EXISTS public.admin_registration_notifications (
  registration_id uuid PRIMARY KEY REFERENCES public.registrations(id) ON DELETE CASCADE,
  notified_at timestamptz DEFAULT now(),
  delivered_count integer DEFAULT 0,
  status text NOT NULL DEFAULT 'delivered'
);

CREATE INDEX IF NOT EXISTS idx_admin_reg_notif_date
  ON public.admin_registration_notifications (notified_at);

ALTER TABLE public.admin_registration_notifications ENABLE ROW LEVEL SECURITY;

-- Admins can view notification dispatch logs
DROP POLICY IF EXISTS "Admins can view notification dispatch logs" ON public.admin_registration_notifications;
CREATE POLICY "Admins can view notification dispatch logs"
  ON public.admin_registration_notifications FOR SELECT
  TO authenticated
  USING (public.is_app_admin(auth.uid()));

-- 3. Secure RPC to register or update an administrator push subscription
CREATE OR REPLACE FUNCTION public.save_admin_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  -- Strictly verify caller is an authorized administrator
  IF NOT public.is_app_admin(v_caller_id) THEN
    RAISE EXCEPTION 'Access denied: Administrator privileges required.';
  END IF;

  IF p_endpoint IS NULL OR trim(p_endpoint) = '' THEN
    RAISE EXCEPTION 'Invalid push endpoint.';
  END IF;

  IF p_p256dh IS NULL OR trim(p_p256dh) = '' OR p_auth IS NULL OR trim(p_auth) = '' THEN
    RAISE EXCEPTION 'Invalid push encryption keys.';
  END IF;

  -- Upsert subscription by endpoint
  INSERT INTO public.admin_push_subscriptions (
    user_id,
    endpoint,
    p256dh,
    auth,
    user_agent,
    updated_at
  ) VALUES (
    v_caller_id,
    trim(p_endpoint),
    trim(p_p256dh),
    trim(p_auth),
    COALESCE(trim(p_user_agent), ''),
    now()
  )
  ON CONFLICT (endpoint) DO UPDATE
  SET user_id = EXCLUDED.user_id,
      p256dh = EXCLUDED.p256dh,
      auth = EXCLUDED.auth,
      user_agent = EXCLUDED.user_agent,
      updated_at = now();

  RETURN jsonb_build_object('success', true, 'message', 'Subscription saved.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_admin_push_subscription(text, text, text, text) TO authenticated;

-- 4. Secure RPC to remove an administrator push subscription
CREATE OR REPLACE FUNCTION public.remove_admin_push_subscription(
  p_endpoint text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  -- Delete subscription matching the caller
  DELETE FROM public.admin_push_subscriptions
  WHERE endpoint = trim(p_endpoint)
    AND user_id = v_caller_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_admin_push_subscription(text) TO authenticated;
