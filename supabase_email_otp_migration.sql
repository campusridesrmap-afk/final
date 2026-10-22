-- ==============================================================================
-- CampusRide: Complete Email OTP Registration & Automatic User Creation Migration
-- SRM University-AP Carpooling Platform
--
-- Description:
-- 1. Creates `public.email_otp_challenges` table for rate-limited, single-use OTPs.
-- 2. Defines self-contained `public.admin_create_student_user` function that directly
--    provisions the user in `auth.users` with encrypted temporary password (reg number)
--    and creates the corresponding profile in `public.profiles` with `must_change_password = true`.
-- 3. Defines `public.submit_student_registration` to validate the OTP verification proof,
--    call `admin_create_student_user`, and mark registration `approved` automatically.
-- ==============================================================================

-- Enable required cryptographic extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- ==============================================================================
-- 1. Create table for email OTP verification challenges
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.email_otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_email text NOT NULL,
  otp_hash text NOT NULL,
  verification_token_hash text,
  attempts_count integer DEFAULT 0,
  max_attempts integer DEFAULT 5,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'consumed', 'expired')),
  resend_available_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Optimized indexes for fast lookup and rate limiting
CREATE INDEX IF NOT EXISTS idx_email_otp_challenges_email_exp 
  ON public.email_otp_challenges (normalized_email, expires_at);

CREATE INDEX IF NOT EXISTS idx_email_otp_challenges_token_hash 
  ON public.email_otp_challenges (verification_token_hash);

CREATE INDEX IF NOT EXISTS idx_email_otp_challenges_created_at 
  ON public.email_otp_challenges (normalized_email, created_at);

-- Enable RLS (access is strictly through Edge Functions with service role or Security Definer RPCs)
ALTER TABLE public.email_otp_challenges ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 2. Self-Contained Student User Account & Profile Provisioning Function
-- ==============================================================================
DROP FUNCTION IF EXISTS public.admin_create_student_user(text, text, text, text);

CREATE OR REPLACE FUNCTION public.admin_create_student_user(
  p_email text,
  p_full_name text,
  p_registration_number text,
  p_temp_password text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_clean_email text;
  v_clean_name text;
  v_clean_reg text;
  v_user_id uuid;
  v_existing_id uuid;
  v_encrypted_pw text;
BEGIN
  v_clean_email := lower(trim(p_email));
  v_clean_name := trim(p_full_name);
  v_clean_reg := upper(trim(p_registration_number));

  IF v_clean_email = '' OR NOT (v_clean_email LIKE '%@srmap.edu.in') THEN
    RAISE EXCEPTION 'Invalid SRM email address: %', v_clean_email;
  END IF;

  IF length(p_temp_password) < 6 THEN
    RAISE EXCEPTION 'Temporary password must be at least 6 characters.';
  END IF;

  -- Check if user already exists in auth.users
  SELECT id INTO v_existing_id
  FROM auth.users
  WHERE lower(trim(email)) = v_clean_email;

  IF v_existing_id IS NOT NULL THEN
    -- Ensure profile exists and is linked
    INSERT INTO public.profiles (
      id, full_name, registration_number, mobile_number, profile_completed, must_change_password, created_at, updated_at
    ) VALUES (
      v_existing_id, v_clean_name, v_clean_reg, '', false, true, now(), now()
    )
    ON CONFLICT (id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      registration_number = EXCLUDED.registration_number,
      must_change_password = true,
      updated_at = now();

    RETURN v_existing_id;
  END IF;

  -- Generate new user UUID and encrypt password using blowfish (standard GoTrue bcrypt format)
  v_user_id := gen_random_uuid();
  v_encrypted_pw := extensions.crypt(p_temp_password, extensions.gen_salt('bf'));

  -- Insert directly into auth.users with confirmed email and metadata
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_sso_user,
    created_at,
    updated_at,
    confirmation_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    v_user_id,
    'authenticated',
    'authenticated',
    v_clean_email,
    v_encrypted_pw,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'full_name', v_clean_name,
      'registration_number', v_clean_reg,
      'must_change_password', true
    ),
    false,
    now(),
    now(),
    ''
  );

  -- Insert corresponding profile record with must_change_password = true
  INSERT INTO public.profiles (
    id,
    full_name,
    registration_number,
    mobile_number,
    profile_completed,
    must_change_password,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    v_clean_name,
    v_clean_reg,
    '',
    false,
    true,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    registration_number = EXCLUDED.registration_number,
    must_change_password = true,
    updated_at = now();

  RETURN v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_student_user(text, text, text, text) TO authenticated, anon;

-- ==============================================================================
-- 3. Atomic Registration Submission & Auto-Approval Function
-- ==============================================================================
DROP FUNCTION IF EXISTS public.submit_student_registration(text, text, text, text);
DROP FUNCTION IF EXISTS public.submit_student_registration(text, text, text);

CREATE OR REPLACE FUNCTION public.submit_student_registration(
  p_full_name text,
  p_email text,
  p_registration_number text,
  p_verification_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_clean_name text;
  v_clean_email text;
  v_clean_reg text;
  v_existing_auth_id uuid;
  v_challenge record;
  v_proof_hash text;
  v_raw_token text;
  v_token_hash text;
  v_new_id uuid;
  v_new_user_id uuid;
  v_existing_reg_id uuid;
BEGIN
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

  -- 1. Check if an active account already exists in auth.users
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

  -- 2. Check if registration number is already assigned in profiles
  IF EXISTS (SELECT 1 FROM public.profiles WHERE upper(trim(registration_number)) = v_clean_reg) THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'EXISTING_ACCOUNT',
      'message', 'An account with this registration number already exists. Please log in instead.'
    );
  END IF;

  -- 3. Check if active application exists for this registration number under ANOTHER email
  IF EXISTS (
    SELECT 1 FROM public.registrations
    WHERE normalized_reg_no = v_clean_reg
      AND normalized_email != v_clean_email
      AND status IN ('pending', 'approved')
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'DUPLICATE_REG_NO',
      'message', 'An application has already been submitted for this registration number under another email.'
    );
  END IF;

  -- 4. Validate Server-Side Email OTP Verification Proof
  IF p_verification_token IS NULL OR trim(p_verification_token) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'OTP_REQUIRED',
      'message', 'Email verification is required. Please verify your SRM email address with an OTP before submitting.'
    );
  END IF;

  v_proof_hash := encode(digest(trim(p_verification_token), 'sha256'), 'hex');

  SELECT * INTO v_challenge
  FROM public.email_otp_challenges
  WHERE verification_token_hash = v_proof_hash
    AND normalized_email = v_clean_email
    AND status = 'verified'
    AND expires_at > now()
    AND consumed_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_VERIFICATION',
      'message', 'Email verification code has expired, already been used, or does not match this email. Please verify your email again.'
    );
  END IF;

  -- Atomically consume the verification challenge so it cannot be replayed or reused
  UPDATE public.email_otp_challenges
  SET status = 'consumed',
      consumed_at = now()
  WHERE id = v_challenge.id;

  -- 5. Automatically create student user account in auth.users & public.profiles
  -- Initial temporary password is the student's registration number (must be >= 6 chars)
  IF length(v_clean_reg) < 6 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_REG_NO',
      'message', 'Registration number must be at least 6 characters.'
    );
  END IF;

  BEGIN
    v_new_user_id := public.admin_create_student_user(
      p_email => v_clean_email,
      p_full_name => v_clean_name,
      p_registration_number => v_clean_reg,
      p_temp_password => v_clean_reg
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ACCOUNT_CREATION_FAILED',
      'message', 'Failed to create student account: ' || SQLERRM
    );
  END;

  IF v_new_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ACCOUNT_CREATION_FAILED',
      'message', 'Account creation could not be completed. Please contact support.'
    );
  END IF;

  -- Generate secure access token for status lookup and confirmation
  v_raw_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');

  -- 6. Check if an existing registration record already exists for this email
  SELECT id INTO v_existing_reg_id
  FROM public.registrations
  WHERE normalized_email = v_clean_email
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_reg_id IS NOT NULL THEN
    UPDATE public.registrations
    SET full_name = v_clean_name,
        email = trim(p_email),
        registration_number = v_clean_reg,
        normalized_reg_no = v_clean_reg,
        status = 'approved',
        access_token_hash = v_token_hash,
        reviewed_at = now(),
        reviewed_by = NULL,
        rejection_reason = 'Auto-approved via verified SRM email OTP',
        welcome_email_status = 'not_sent',
        updated_at = now()
    WHERE id = v_existing_reg_id;

    v_new_id := v_existing_reg_id;
  ELSE
    INSERT INTO public.registrations (
      full_name,
      email,
      normalized_email,
      registration_number,
      normalized_reg_no,
      status,
      access_token_hash,
      reviewed_at,
      reviewed_by,
      rejection_reason,
      welcome_email_status,
      created_at,
      updated_at
    ) VALUES (
      v_clean_name,
      trim(p_email),
      v_clean_email,
      v_clean_reg,
      v_clean_reg,
      'approved',
      v_token_hash,
      now(),
      NULL,
      'Auto-approved via verified SRM email OTP',
      'not_sent',
      now(),
      now()
    )
    RETURNING id INTO v_new_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'AUTO_APPROVED',
    'message', 'Your SRM email has been verified and your CampusRide account has been created successfully! You can now log in using your college email and registration number as your initial password.',
    'status', 'approved',
    'token', v_raw_token,
    'userId', v_new_user_id,
    'registration', jsonb_build_object(
      'id', v_new_id,
      'full_name', v_clean_name,
      'email', trim(p_email),
      'registration_number', v_clean_reg,
      'status', 'approved',
      'created_at', now()
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_student_registration(text, text, text, text) TO anon, authenticated;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
