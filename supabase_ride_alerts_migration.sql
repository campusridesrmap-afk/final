-- ==============================================================================
-- CampusRide: Ride Alert Notifications Table & Security Policies
-- SRM University-AP Carpooling Platform
--
-- Run this migration in Supabase SQL Editor.
-- Allows students to subscribe to route alerts when no rides are available.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.ride_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text NOT NULL,
  user_name text NOT NULL DEFAULT 'SRM Student',
  from_location text NOT NULL,
  to_location text NOT NULL,
  date_filter text DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'notified', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz
);

-- Index for speedy route matching when new rides are offered
CREATE INDEX IF NOT EXISTS idx_ride_alerts_status_routes 
  ON public.ride_alerts(status, from_location, to_location);

CREATE INDEX IF NOT EXISTS idx_ride_alerts_user_id 
  ON public.ride_alerts(user_id);

-- Enable Row Level Security
ALTER TABLE public.ride_alerts ENABLE ROW LEVEL SECURITY;

-- Policy 1: Users can read their own active/past alerts
CREATE POLICY "Users can view their own ride alerts"
  ON public.ride_alerts FOR SELECT
  USING (auth.uid() = user_id);

-- Policy 2: Authenticated users can insert their own ride alerts
CREATE POLICY "Users can create their own ride alerts"
  ON public.ride_alerts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy 3: Users can update/cancel their own ride alerts
CREATE POLICY "Users can update their own ride alerts"
  ON public.ride_alerts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy 4: Users can delete their own alerts
CREATE POLICY "Users can delete their own ride alerts"
  ON public.ride_alerts FOR DELETE
  USING (auth.uid() = user_id);

