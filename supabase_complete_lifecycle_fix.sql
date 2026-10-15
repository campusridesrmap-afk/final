-- ==============================================================================
-- CampusRide Migration: Fix Ride-Completion Lifecycle Bug
-- SRM University-AP Carpooling Platform
--
-- Description:
-- 1. Introduces complete_passenger_trip(p_booking_id uuid) to complete only an
--    individual passenger's trip/booking without touching the provider ride or
--    other passengers' trips.
-- 2. Restricts complete_ride(p_ride_id uuid, p_force boolean) exclusively to the
--    ride driver/provider (passengers can NEVER complete the whole ride).
-- 3. Enforces that complete_ride requires explicit confirmation (p_force = true)
--    if any active accepted passenger trips remain.
-- 4. Restricts public.rides UPDATE policy to the provider only, preventing passengers
--    from directly modifying ride status to completed.
-- ==============================================================================

-- 1. Complete Individual Passenger Trip
-- Callable by the passenger (to complete own trip) or the ride driver (to drop off a passenger)
CREATE OR REPLACE FUNCTION complete_passenger_trip(p_booking_id uuid)
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

  -- Fetch associated ride
  SELECT * INTO v_ride FROM rides WHERE id = v_booking.ride_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associated ride not found';
  END IF;

  -- Authorization check: Caller must be the passenger OR the ride driver
  IF v_caller_id <> v_booking.passenger_id AND v_caller_id <> v_ride.provider_id THEN
    RAISE EXCEPTION 'Unauthorized: Only the passenger or the ride driver can complete this trip';
  END IF;

  -- Idempotency check: If already completed, return success
  IF v_booking.status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'status', 'completed', 'already_completed', true);
  END IF;

  IF v_booking.status <> 'accepted' THEN
    RAISE EXCEPTION 'Only accepted bookings can be completed (current status: %)', v_booking.status;
  END IF;

  -- Update ONLY this passenger's booking to completed
  UPDATE bookings
  SET status = 'completed',
      updated_at = now()
  WHERE id = p_booking_id;

  -- NOTE: The provider's ride status remains open.
  -- Other co-passengers' bookings remain active.
  -- Available seats remain intact.

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'ride_id', v_booking.ride_id,
    'status', 'completed'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION complete_passenger_trip(uuid) TO authenticated;

-- 2. Complete Overall Ride (Driver Only)
-- Drop existing single-argument function if needed to ensure clean signature
DROP FUNCTION IF EXISTS complete_ride(uuid);

CREATE OR REPLACE FUNCTION complete_ride(
  p_ride_id uuid,
  p_force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_ride record;
  v_caller_id uuid;
  v_active_count integer;
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

  -- ONLY the driver who offered this ride can complete it!
  IF v_ride.provider_id <> v_caller_id THEN
    RAISE EXCEPTION 'Unauthorized: Only the ride provider can complete the overall ride';
  END IF;

  -- Idempotency check: If already completed, return success
  IF v_ride.status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'status', 'completed', 'already_completed', true);
  END IF;

  IF v_ride.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot complete a cancelled ride';
  END IF;

  -- Count remaining active accepted passengers
  SELECT count(*) INTO v_active_count
  FROM bookings
  WHERE ride_id = p_ride_id
    AND status = 'accepted';

  -- If active passengers remain and p_force is false, reject with explicit error
  IF v_active_count > 0 AND NOT p_force THEN
    RAISE EXCEPTION 'Cannot complete ride: % active passenger trip(s) remain. Confirm ending the ride with active passengers or complete passenger trips first.', v_active_count;
  END IF;

  -- Mark ride terminal status completed and close remaining seats
  UPDATE rides
  SET status = 'completed',
      available_seats = 0
  WHERE id = p_ride_id;

  -- If any accepted passengers remain (driver explicitly forced ending the overall ride),
  -- mark them completed to end their trip cleanly
  IF v_active_count > 0 THEN
    UPDATE bookings
    SET status = 'completed',
        updated_at = now()
    WHERE ride_id = p_ride_id
      AND status = 'accepted';
  END IF;

  -- Cancel any leftover pending bookings
  UPDATE bookings
  SET status = 'cancelled',
      updated_at = now()
  WHERE ride_id = p_ride_id
    AND status = 'pending';

  RETURN jsonb_build_object(
    'success', true,
    'status', 'completed',
    'completed_passengers_count', v_active_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION complete_ride(uuid, boolean) TO authenticated;

-- 3. Secure RLS Policy: Only Providers can update rides
-- Prevents passengers from directly modifying ride records in the database.
DROP POLICY IF EXISTS "Trip participants can update rides" ON public.rides;
DROP POLICY IF EXISTS "Providers can update own rides" ON public.rides;

CREATE POLICY "Providers can update own rides"
  ON public.rides FOR UPDATE
  TO authenticated
  USING (provider_id = auth.uid())
  WITH CHECK (provider_id = auth.uid());
