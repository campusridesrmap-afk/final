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

-- Update vehicle type check constraint to include 'Auto' alongside 'Car' and 'Bike'
ALTER TABLE rides DROP CONSTRAINT IF EXISTS rides_vehicle_type_check;
ALTER TABLE rides ADD CONSTRAINT rides_vehicle_type_check CHECK (vehicle_type IN ('Car', 'Bike', 'Auto'));

-- 2. Enhance `bookings` table for segment-based booking
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_location text DEFAULT '';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS dropoff_location text DEFAULT '';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_coords jsonb;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS dropoff_coords jsonb;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_stop_index integer DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS dropoff_stop_index integer DEFAULT 0;

-- Update bookings status check constraint to include 'expired' and 'completed' alongside 'pending', 'accepted', 'rejected', 'cancelled'
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled', 'completed', 'expired'));

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

  -- Fetch associated ride with atomic row lock to prevent concurrent overbooking
  SELECT * INTO v_ride FROM rides WHERE id = v_booking.ride_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associated ride not found';
  END IF;

  -- Ensure caller is the ride provider
  IF v_ride.provider_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the ride provider can accept or reject bookings';
  END IF;

  -- Ensure ride has not reached or passed its departure deadline
  IF v_ride.departure_at::timestamptz <= NOW() THEN
    UPDATE bookings SET status = 'expired' WHERE id = p_booking_id;
    RAISE EXCEPTION 'Cannot accept requests for a ride whose departure deadline has passed';
  END IF;

  IF v_booking.status != 'pending' THEN
    RAISE EXCEPTION 'Cannot respond to booking with status: %', v_booking.status;
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

-- 5a. Rides Table Policies
-- Allow public (both unauthenticated guests and authenticated students) to view active open rides
DROP POLICY IF EXISTS "Public can view open active rides" ON rides;
CREATE POLICY "Public can view open active rides"
  ON rides FOR SELECT
  TO public
  USING (status = 'open' OR (auth.uid() IS NOT NULL AND provider_id = auth.uid()));

-- Allow authenticated users to publish rides
DROP POLICY IF EXISTS "Users can insert own rides" ON rides;
CREATE POLICY "Users can insert own rides"
  ON rides FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = provider_id);

-- Helper functions with SECURITY DEFINER to break mutual recursion between rides and bookings
CREATE OR REPLACE FUNCTION public.is_ride_driver(p_ride_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rides
    WHERE id = p_ride_id AND provider_id = p_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_ride_driver(uuid, uuid) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.is_accepted_passenger(p_ride_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings
    WHERE ride_id = p_ride_id
      AND passenger_id = p_user_id
      AND status IN ('accepted', 'completed')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_accepted_passenger(uuid, uuid) TO authenticated, anon;

-- Allow providers and accepted passengers to update rides (providers manage; accepted passengers can complete)
DROP POLICY IF EXISTS "Providers can update own rides" ON rides;
DROP POLICY IF EXISTS "Trip participants can update rides" ON rides;
CREATE POLICY "Trip participants can update rides"
  ON rides FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = provider_id
    OR
    public.is_accepted_passenger(id, auth.uid())
  )
  WITH CHECK (
    auth.uid() = provider_id
    OR (
      status = 'completed'
      AND public.is_accepted_passenger(id, auth.uid())
    )
  );

-- 5b. Profiles Table Policies
-- Allow public to view driver display names for open rides (preserves privacy)
DROP POLICY IF EXISTS "Public can view driver display names" ON profiles;
CREATE POLICY "Public can view driver display names"
  ON profiles FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM rides
      WHERE rides.provider_id = profiles.id
        AND rides.status = 'open'
    )
    OR auth.uid() IS NOT NULL
  );

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

-- 5c. Bookings Table Policies
-- Only authenticated users can create bookings (never guests)
DROP POLICY IF EXISTS "Authenticated users can create bookings" ON bookings;
CREATE POLICY "Authenticated users can create bookings"
  ON bookings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = passenger_id);

-- Only trip participants can view bookings (uses SECURITY DEFINER helper to prevent RLS recursion)
DROP POLICY IF EXISTS "Trip participants can view bookings" ON bookings;
CREATE POLICY "Trip participants can view bookings"
  ON bookings FOR SELECT
  TO authenticated
  USING (
    auth.uid() = passenger_id
    OR
    public.is_ride_driver(ride_id, auth.uid())
  );

-- Allow trip participants to update bookings (passengers can cancel/withdraw/complete own; drivers can manage requests on their rides)
-- No self-referential subqueries to bookings, preventing 42P17 infinite recursion!
DROP POLICY IF EXISTS "Passengers can cancel own bookings" ON bookings;
DROP POLICY IF EXISTS "Trip participants can update bookings" ON bookings;
CREATE POLICY "Trip participants can update bookings"
  ON bookings FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = passenger_id
    OR
    public.is_ride_driver(ride_id, auth.uid())
  )
  WITH CHECK (
    auth.uid() = passenger_id
    OR
    public.is_ride_driver(ride_id, auth.uid())
  );

-- 5d. Replace global unique booking constraint with active-only unique index
-- This allows passengers to withdraw/cancel and re-request while preventing duplicate concurrent active requests
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_ride_id_passenger_id_key;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS unique_ride_passenger_booking;
CREATE UNIQUE INDEX IF NOT EXISTS bookings_active_unique_idx
  ON bookings (ride_id, passenger_id)
  WHERE status IN ('pending', 'accepted');

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

-- ==============================================================================
-- 8. Complete Ride Lifecycle & Secure Sharing Management
-- ==============================================================================

-- 8a. Driver: Cancel Ride Sharing
CREATE OR REPLACE FUNCTION cancel_ride_sharing(p_ride_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_ride record;
  v_caller_id uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Verify ride exists and caller is the driver
  SELECT * INTO v_ride FROM rides WHERE id = p_ride_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ride not found';
  END IF;

  IF v_ride.provider_id != v_caller_id THEN
    RAISE EXCEPTION 'Unauthorized: Only the driver who offered this ride can cancel it';
  END IF;

  IF v_ride.status = 'completed' THEN
    RAISE EXCEPTION 'Cannot cancel an already completed ride';
  END IF;

  IF v_ride.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', true, 'status', 'cancelled', 'already_cancelled', true);
  END IF;

  -- Update ride status to cancelled and close seats
  UPDATE rides
  SET status = 'cancelled',
      available_seats = 0
  WHERE id = p_ride_id;

  -- Update all active bookings on this ride to cancelled
  UPDATE bookings
  SET status = 'cancelled'
  WHERE ride_id = p_ride_id
    AND status IN ('pending', 'accepted');

  -- Deactivate all live locations for this ride
  UPDATE trip_live_locations
  SET is_active = false,
      updated_at = NOW()
  WHERE ride_id = p_ride_id;

  RETURN jsonb_build_object('success', true, 'status', 'cancelled');
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_ride_sharing(uuid) TO authenticated;

-- 8b. Passenger: Withdraw Pending Request
CREATE OR REPLACE FUNCTION withdraw_booking_request(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_booking record;
  v_caller_id uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Fetch booking
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking request not found';
  END IF;

  IF v_booking.passenger_id != v_caller_id THEN
    RAISE EXCEPTION 'Unauthorized: You can only withdraw your own requests';
  END IF;

  IF v_booking.status = 'accepted' THEN
    RAISE EXCEPTION 'Cannot withdraw an accepted booking. Please use Cancel Booking instead.';
  END IF;

  IF v_booking.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', true, 'status', 'cancelled', 'already_withdrawn', true);
  END IF;

  -- Pending requests did not decrement available seats, so no seat restoration needed!
  UPDATE bookings
  SET status = 'cancelled'
  WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true, 'status', 'cancelled');
END;
$$;

GRANT EXECUTE ON FUNCTION withdraw_booking_request(uuid) TO authenticated;

-- 8c. Passenger: Cancel Accepted Booking
CREATE OR REPLACE FUNCTION cancel_accepted_booking(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_booking record;
  v_ride record;
  v_caller_id uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Fetch booking
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_booking.passenger_id != v_caller_id THEN
    RAISE EXCEPTION 'Unauthorized: You can only cancel your own bookings';
  END IF;

  IF v_booking.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', true, 'status', 'cancelled', 'already_cancelled', true);
  END IF;

  SELECT * INTO v_ride FROM rides WHERE id = v_booking.ride_id;

  -- If ride is still open, restore available seats safely without exceeding total_seats
  IF v_ride.id IS NOT NULL AND v_ride.status = 'open' THEN
    UPDATE rides
    SET available_seats = LEAST(COALESCE(v_ride.total_seats, 4), v_ride.available_seats + COALESCE(v_booking.seats_requested, 1))
    WHERE id = v_booking.ride_id;
  END IF;

  -- Update booking status
  UPDATE bookings
  SET status = 'cancelled'
  WHERE id = p_booking_id;

  -- Deactivate passenger live location
  UPDATE trip_live_locations
  SET is_active = false,
      updated_at = NOW()
  WHERE ride_id = v_booking.ride_id
    AND user_id = v_caller_id;

  RETURN jsonb_build_object('success', true, 'status', 'cancelled');
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_accepted_booking(uuid) TO authenticated;

-- 8d. Driver or Accepted Passenger: Complete Ride
CREATE OR REPLACE FUNCTION complete_ride(p_ride_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_ride record;
  v_caller_id uuid;
  v_is_driver boolean := false;
  v_is_passenger boolean := false;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Fetch ride
  SELECT * INTO v_ride FROM rides WHERE id = p_ride_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ride not found';
  END IF;

  -- Check if caller is driver
  IF v_ride.provider_id = v_caller_id THEN
    v_is_driver := true;
  END IF;

  -- Check if caller is accepted passenger
  IF NOT v_is_driver THEN
    SELECT EXISTS (
      SELECT 1 FROM bookings
      WHERE ride_id = p_ride_id
        AND passenger_id = v_caller_id
        AND status IN ('accepted', 'completed')
    ) INTO v_is_passenger;
  END IF;

  IF NOT v_is_driver AND NOT v_is_passenger THEN
    RAISE EXCEPTION 'Unauthorized: Only the driver or an accepted passenger can complete this ride';
  END IF;

  -- Idempotency check: If already completed, return success
  IF v_ride.status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'status', 'completed', 'already_completed', true);
  END IF;

  IF v_ride.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot complete a cancelled ride';
  END IF;

  -- Mark ride terminal status completed and close remaining seats
  UPDATE rides
  SET status = 'completed',
      available_seats = 0
  WHERE id = p_ride_id;

  -- Mark accepted bookings as completed
  UPDATE bookings
  SET status = 'completed'
  WHERE ride_id = p_ride_id
    AND status = 'accepted';

  -- Reject any leftover pending bookings
  UPDATE bookings
  SET status = 'cancelled'
  WHERE ride_id = p_ride_id
    AND status = 'pending';

  -- Terminate all active live location sessions for this ride
  UPDATE trip_live_locations
  SET is_active = false,
      updated_at = NOW()
  WHERE ride_id = p_ride_id;

  RETURN jsonb_build_object('success', true, 'status', 'completed');
END;
$$;

GRANT EXECUTE ON FUNCTION complete_ride(uuid) TO authenticated;

-- 8e. Update RLS policy on trip_live_locations to strictly require rides.status = 'open'
DROP POLICY IF EXISTS "Authorized trip participants can view live locations" ON trip_live_locations;
CREATE POLICY "Authorized trip participants can view live locations"
  ON trip_live_locations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rides
      WHERE rides.id = trip_live_locations.ride_id
        AND rides.status = 'open'
        AND (
          rides.provider_id = auth.uid()
          OR
          EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.ride_id = trip_live_locations.ride_id
              AND bookings.passenger_id = auth.uid()
              AND bookings.status = 'accepted'
          )
        )
    )
  );

-- 8f. Secure contact fetching function: ensures contact details are NEVER returned for completed or cancelled rides
CREATE OR REPLACE FUNCTION get_trip_participant_contact(p_ride_id uuid, p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id uuid;
  v_ride record;
  v_profile record;
  v_is_authorized boolean := false;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Verify ride is active and open
  SELECT * INTO v_ride FROM rides WHERE id = p_ride_id;
  IF NOT FOUND OR v_ride.status != 'open' THEN
    RETURN NULL; -- Ride completed or cancelled: stop sharing contact details immediately
  END IF;

  -- Check authorization: caller is driver and target is accepted passenger
  IF v_ride.provider_id = v_caller_id THEN
    SELECT EXISTS (
      SELECT 1 FROM bookings
      WHERE ride_id = p_ride_id
        AND passenger_id = p_target_user_id
        AND status = 'accepted'
    ) INTO v_is_authorized;
  -- OR caller is accepted passenger and target is driver
  ELSIF v_ride.provider_id = p_target_user_id THEN
    SELECT EXISTS (
      SELECT 1 FROM bookings
      WHERE ride_id = p_ride_id
        AND passenger_id = v_caller_id
        AND status = 'accepted'
    ) INTO v_is_authorized;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN NULL;
  END IF;

  SELECT id, full_name, mobile_number, registration_number
  INTO v_profile
  FROM profiles
  WHERE id = p_target_user_id;

  RETURN jsonb_build_object(
    'id', v_profile.id,
    'full_name', v_profile.full_name,
    'mobile_number', v_profile.mobile_number,
    'registration_number', v_profile.registration_number
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_trip_participant_contact(uuid, uuid) TO authenticated;

-- ==============================================================================
-- 9. FIX: INFINITE RECURSION IN BOOKINGS POLICY (Error 42P17)
-- Run this block in Supabase SQL Editor if you encounter:
-- "infinite recursion detected in policy for relation 'bookings'"
-- ==============================================================================

-- 9a. Helper function to check ride ownership without triggering RLS on rides
CREATE OR REPLACE FUNCTION public.is_ride_driver(p_ride_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rides
    WHERE id = p_ride_id AND provider_id = p_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_ride_driver(uuid, uuid) TO authenticated, anon;

-- 9b. Helper function to check accepted passenger without triggering RLS on bookings
CREATE OR REPLACE FUNCTION public.is_accepted_passenger(p_ride_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings
    WHERE ride_id = p_ride_id
      AND passenger_id = p_user_id
      AND status IN ('accepted', 'completed')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_accepted_passenger(uuid, uuid) TO authenticated, anon;

-- 9c. Drop all existing potentially recursive policies on bookings
DROP POLICY IF EXISTS "Trip participants can view bookings" ON public.bookings;
DROP POLICY IF EXISTS "Passengers can cancel own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Trip participants can update bookings" ON public.bookings;
DROP POLICY IF EXISTS "Passengers can update own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Drivers can update bookings" ON public.bookings;

-- 9d. Re-create clean non-recursive policies on bookings
CREATE POLICY "Trip participants can view bookings"
  ON public.bookings FOR SELECT
  TO authenticated
  USING (
    passenger_id = auth.uid()
    OR
    public.is_ride_driver(ride_id, auth.uid())
  );

CREATE POLICY "Trip participants can update bookings"
  ON public.bookings FOR UPDATE
  TO authenticated
  USING (
    passenger_id = auth.uid()
    OR
    public.is_ride_driver(ride_id, auth.uid())
  )
  WITH CHECK (
    passenger_id = auth.uid()
    OR
    public.is_ride_driver(ride_id, auth.uid())
  );

-- 9e. Re-create clean non-recursive policies on rides
DROP POLICY IF EXISTS "Providers can update own rides" ON public.rides;
DROP POLICY IF EXISTS "Trip participants can update rides" ON public.rides;

CREATE POLICY "Trip participants can update rides"
  ON public.rides FOR UPDATE
  TO authenticated
  USING (
    provider_id = auth.uid()
    OR
    public.is_accepted_passenger(id, auth.uid())
  )
  WITH CHECK (
    provider_id = auth.uid()
    OR (
      status = 'completed'
      AND public.is_accepted_passenger(id, auth.uid())
    )
  );

-- ==============================================================================
-- 10. AUTOMATIC BOOKING CLOSURE AT DEPARTURE TIME
-- Authoritative database-side enforcement preventing new seat requests from being
-- created or reactivated after the ride's departure time (departure_at) has passed.
-- ==============================================================================

-- 10a. Helper function to check if a ride is actively bookable (open and departure in future)
CREATE OR REPLACE FUNCTION public.is_ride_open_for_booking(p_ride_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rides
    WHERE id = p_ride_id
      AND status = 'open'
      AND departure_at::timestamptz > NOW()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_ride_open_for_booking(uuid) TO authenticated, anon;

-- 10b. Update RLS INSERT policy on bookings to enforce departure deadline at policy level
DROP POLICY IF EXISTS "Authenticated users can create bookings" ON public.bookings;
CREATE POLICY "Authenticated users can create bookings"
  ON public.bookings FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = passenger_id
    AND
    public.is_ride_open_for_booking(ride_id)
  );

-- 10c. Authoritative database trigger on bookings:
-- Blocks both direct inserts and reactivations of pending bookings if departure time has arrived or passed.
-- Preserves existing accepted/rejected/cancelled/completed bookings and history intact.
CREATE OR REPLACE FUNCTION public.check_booking_departure_deadline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_departure_at timestamptz;
  v_ride_status text;
BEGIN
  -- Only evaluate when a booking is being newly requested or reactivated as 'pending'
  IF NEW.status = 'pending' THEN
    SELECT departure_at::timestamptz, status INTO v_departure_at, v_ride_status
    FROM public.rides
    WHERE id = NEW.ride_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Associated ride not found';
    END IF;

    IF v_ride_status != 'open' THEN
      RAISE EXCEPTION 'Cannot book seats on a ride that is not open (status: %)', v_ride_status;
    END IF;

    -- Authoritative server-side comparison against current UTC time (NOW())
    IF v_departure_at IS NOT NULL AND v_departure_at <= NOW() THEN
      RAISE EXCEPTION 'Booking closed because the departure time has passed';
    END IF;

    -- Check vehicle type and seat capacity constraints
    IF v_ride.vehicle_type = 'Bike' AND NEW.seats_requested > 1 THEN
      RAISE EXCEPTION 'Only 1 seat can be requested on a motorcycle / scooter';
    END IF;

    IF NEW.seats_requested > 7 THEN
      RAISE EXCEPTION 'Cannot request more than 7 seats for a ride';
    END IF;

    IF NEW.seats_requested > v_ride.available_seats THEN
      RAISE EXCEPTION 'Requested seats (%) exceed available seats (%)', NEW.seats_requested, v_ride.available_seats;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_booking_departure_deadline ON public.bookings;
CREATE TRIGGER trg_check_booking_departure_deadline
  BEFORE INSERT OR UPDATE OF status, ride_id, seats_requested ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.check_booking_departure_deadline();

-- ==============================================================================
-- 11. AUTOMATICALLY EXPIRE PENDING REQUESTS AFTER DEPARTURE
-- Safely marks pending requests as 'expired' once the ride's departure deadline passes.
-- Preserves accepted bookings and booking history without marking rides completed.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.close_expired_pending_bookings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.bookings b
  SET status = 'expired'
  FROM public.rides r
  WHERE b.ride_id = r.id
    AND b.status = 'pending'
    AND r.departure_at::timestamptz <= NOW();
EXCEPTION
  WHEN check_violation THEN
    -- Fallback safety: If bookings_status_check in the database does not yet permit 'expired'
    -- (e.g. before the ALTER TABLE migration is executed in Supabase SQL editor),
    -- do not abort with 400 Bad Request error.
    NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_expired_pending_bookings() TO authenticated, anon;




