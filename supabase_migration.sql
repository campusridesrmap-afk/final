-- ==============================================================================
-- CampusRide 2.0 Database Migration Script
-- SRM University-AP Carpooling Platform
--
-- Safe, backward-compatible migration. Run in the Supabase SQL Editor.
-- ==============================================================================

-- 1. Enhance `rides` table for multi-stop routes and geometry
ALTER TABLE rides ADD COLUMN IF NOT EXISTS route_geometry jsonb DEFAULT '[]'::jsonb;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS stops jsonb DEFAULT '[]'::jsonb;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS pickup_coords jsonb;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS destination_coords jsonb;

-- 2. Enhance `bookings` table for segment-based booking
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_location text DEFAULT '';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS dropoff_location text DEFAULT '';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_coords jsonb;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS dropoff_coords jsonb;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_stop_index integer DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS dropoff_stop_index integer DEFAULT 0;

-- 3. Enhance `profiles` table for student identity & phone sharing
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS registration_number text DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mobile_number text DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_completed boolean DEFAULT false;

-- 4. Secure RPC function to process booking response atomically
CREATE OR REPLACE FUNCTION process_booking_response(
  p_booking_id uuid,
  p_response text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking record;
  v_ride record;
  v_new_status text;
BEGIN
  -- Fetch booking
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  -- Fetch associated ride
  SELECT * INTO v_ride FROM rides WHERE id = v_booking.ride_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associated ride not found';
  END IF;

  -- Ensure caller is the ride provider
  IF v_ride.provider_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the ride provider can accept or reject bookings';
  END IF;

  IF p_response = 'accept' THEN
    v_new_status := 'accepted';
    
    -- Check seat availability
    IF v_ride.available_seats < v_booking.seats_requested THEN
      RAISE EXCEPTION 'Not enough seats available on this ride';
    END IF;

    -- Decrement available seats
    UPDATE rides
    SET available_seats = available_seats - v_booking.seats_requested
    WHERE id = v_booking.ride_id;

  ELSIF p_response = 'reject' THEN
    v_new_status := 'rejected';
  ELSE
    RAISE EXCEPTION 'Invalid response. Expected accept or reject';
  END IF;

  -- Update booking status
  UPDATE bookings
  SET status = v_new_status
  WHERE id = p_booking_id;

  RETURN json_build_object('success', true, 'status', v_new_status);
END;
$$;

-- 5. Row Level Security (RLS) policies check
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view profiles
DROP POLICY IF EXISTS "Public profiles are viewable by authenticated users" ON profiles;
CREATE POLICY "Public profiles are viewable by authenticated users"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

-- Allow users to update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- 6. Student Live Location Sharing Table & Secure Trip-Participant RLS
CREATE TABLE IF NOT EXISTS trip_live_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid REFERENCES rides(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  user_role text NOT NULL CHECK (user_role IN ('driver', 'passenger')),
  user_name text DEFAULT '',
  place_name text NOT NULL DEFAULT '',
  lat double precision,
  lng double precision,
  is_active boolean DEFAULT true,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(ride_id, user_id)
);

ALTER TABLE trip_live_locations ENABLE ROW LEVEL SECURITY;

-- Users can upsert their own live location
DROP POLICY IF EXISTS "Users can upsert own live location" ON trip_live_locations;
CREATE POLICY "Users can upsert own live location"
  ON trip_live_locations FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Only authorized trip participants (driver or accepted passenger on that ride) can view live locations
DROP POLICY IF EXISTS "Authorized trip participants can view live locations" ON trip_live_locations;
CREATE POLICY "Authorized trip participants can view live locations"
  ON trip_live_locations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rides
      WHERE rides.id = trip_live_locations.ride_id
        AND rides.provider_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.ride_id = trip_live_locations.ride_id
        AND bookings.passenger_id = auth.uid()
        AND bookings.status = 'accepted'
    )
  );

-- 7. Direct Password Update Function (Allows users to update password without current password enforcement)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_user_password(new_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  IF length(new_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters long';
  END IF;

  -- Update encrypted password in auth.users directly
  UPDATE auth.users
  SET encrypted_password = crypt(new_password, gen_salt('bf')),
      updated_at = NOW()
  WHERE id = v_user_id;

  -- Clear must_change_password flag in profiles
  UPDATE public.profiles
  SET must_change_password = false,
      updated_at = NOW()
  WHERE id = v_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION set_user_password(text) TO authenticated;

