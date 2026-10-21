-- ==============================================================================
-- CampusRide: Resubmit Rejected Registration RPC Migration
-- SRM University-AP Carpooling Platform
--
-- Fixes: "Could not find the function public.submit_student_registration(p_email, p_full_name, p_is_resubmit, p_registration_number) in the schema cache"
-- Reuses the existing rejected registration record in-place.
--
-- Instructions: Copy and run this script in the Supabase SQL Editor.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Resubmit Rejected Registration RPC
-- Validates token server-side, ensures status is 'rejected', updates record in-place,
-- resets status to 'pending', clears rejection reason and reviewer fields, and preserves record ID.
CREATE OR REPLACE FUNCTION public.resubmit_student_registration(
  p_token text,
  p_full_name text,
  p_email text,
  p_registration_number text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_token_hash text;
  v_reg record;
  v_clean_name text;
  v_clean_email text;
  v_clean_reg text;
  v_existing_auth_id uuid;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid or missing application token.');
  END IF;

  v_token_hash := encode(digest(trim(p_token), 'sha256'), 'hex');

  -- Lock the existing registration row for update
  SELECT * INTO v_reg
  FROM public.registrations
  WHERE access_token_hash = v_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Application record not found or session expired.');
  END IF;

  -- Security check: only permit resubmission when currently 'rejected'
  IF v_reg.status != 'rejected' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Only rejected applications can be resubmitted. Current status: ' || v_reg.status
    );
  END IF;

  -- Trim and normalize input
  v_clean_name := trim(p_full_name);
  v_clean_email := lower(trim(p_email));
  v_clean_reg := upper(trim(p_registration_number));

  -- Validation: required fields
  IF v_clean_name = '' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_NAME', 'message', 'Full name is required.');
  END IF;

  IF v_clean_email = '' OR NOT (v_clean_email LIKE '%@srmap.edu.in') THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_EMAIL', 'message', 'Only official SRM University-AP email addresses (@srmap.edu.in) are accepted.');
  END IF;

  IF length(v_clean_reg) < 4 OR length(v_clean_reg) > 20 THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_REG_NO', 'message', 'Please enter a valid SRM registration number.');
  END IF;

  -- Check if an active account already exists in auth.users
  SELECT id INTO v_existing_auth_id
  FROM auth.users
  WHERE lower(trim(email)) = v_clean_email;

  IF v_existing_auth_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'EXISTING_ACCOUNT',
      'message', 'You already have an active account. Please log in instead.'
    );
  END IF;

  -- Check if registration number already belongs to an active profile
  IF EXISTS (SELECT 1 FROM public.profiles WHERE upper(trim(registration_number)) = v_clean_reg) THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'EXISTING_ACCOUNT',
      'message', 'This registration number already exists in another account. Please check your registration number and try again.'
    );
  END IF;

  -- Check if another pending or approved application already uses this email
  IF EXISTS (
    SELECT 1 FROM public.registrations
    WHERE normalized_email = v_clean_email
      AND id != v_reg.id
      AND status IN ('pending', 'approved')
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'EXISTING_APPLICATION',
      'message', 'A request with this email has already been submitted.'
    );
  END IF;

  -- Check if another pending or approved application already uses this registration number
  IF EXISTS (
    SELECT 1 FROM public.registrations
    WHERE normalized_reg_no = v_clean_reg
      AND id != v_reg.id
      AND status IN ('pending', 'approved')
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'DUPLICATE_REG_NO',
      'message', 'An application has already been submitted for this registration number.'
    );
  END IF;

  -- Update existing record in-place:
  -- Status becomes 'pending', rejection reason is cleared, review fields reset to NULL
  UPDATE public.registrations
  SET full_name = v_clean_name,
      email = trim(p_email),
      normalized_email = v_clean_email,
      registration_number = v_clean_reg,
      normalized_reg_no = v_clean_reg,
      status = 'pending',
      rejection_reason = '',
      reviewed_at = NULL,
      reviewed_by = NULL,
      updated_at = now()
  WHERE id = v_reg.id;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'RESUBMITTED',
    'message', 'Your application has been resubmitted successfully and is awaiting verification.',
    'status', 'pending',
    'token', p_token,
    'registration', jsonb_build_object(
      'id', v_reg.id,
      'full_name', v_clean_name,
      'email', trim(p_email),
      'registration_number', v_clean_reg,
      'status', 'pending',
      'created_at', v_reg.created_at,
      'updated_at', now()
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resubmit_student_registration(text, text, text, text) TO anon, authenticated;

-- 2. Refresh PostgREST schema cache so the new function is immediately recognized
NOTIFY pgrst, 'reload schema';
