-- ==============================================================================
-- CampusRide Migration: Safely Remove Live-Location Sharing
-- ==============================================================================
-- Description:
-- 1. Updates lifecycle RPCs (cancel_ride_sharing, cancel_accepted_booking, complete_ride)
--    to remove references to trip_live_locations.
-- 2. Removes policies and drops the trip_live_locations table cleanly.
-- 3. Retains all ride records, bookings, user profiles, and direct contact sharing.
-- ==============================================================================

-- 1. Driver: Cancel Ride Sharing (Updated: without live location update)
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

  RETURN jsonb_build_object('success', true, 'status', 'cancelled');
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_ride_sharing(uuid) TO authenticated;

-- 2. Passenger: Cancel Accepted Booking (Updated: without live location update)
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

  RETURN jsonb_build_object('success', true, 'status', 'cancelled');
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_accepted_booking(uuid) TO authenticated;

-- 3. Driver or Accepted Passenger: Complete Ride (Updated: without live location update)
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

  -- Mark accepted bookings as completed (stops contact access immediately)
  UPDATE bookings
  SET status = 'completed'
  WHERE ride_id = p_ride_id
    AND status = 'accepted';

  -- Reject any leftover pending bookings
  UPDATE bookings
  SET status = 'cancelled'
  WHERE ride_id = p_ride_id
    AND status = 'pending';

  RETURN jsonb_build_object('success', true, 'status', 'completed');
END;
$$;

GRANT EXECUTE ON FUNCTION complete_ride(uuid) TO authenticated;

-- 4. Safely drop policies and obsolete trip_live_locations table
DROP POLICY IF EXISTS "Users can upsert own live location" ON trip_live_locations;
DROP POLICY IF EXISTS "Authorized trip participants can view live locations" ON trip_live_locations;
DROP TABLE IF EXISTS trip_live_locations CASCADE;
