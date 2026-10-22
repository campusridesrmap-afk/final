-- ==============================================================================
-- CampusRide: Secure Email OTP Verification Migration
-- SRM University-AP Carpooling Platform
--
-- Description:
-- 1. Creates `public.email_otp_challenges` table for secure, rate-limited,
--    single-use OTP verification challenges.
-- 2. Enforces Row Level Security (RLS) ensuring challenges cannot be read or
--    tampered with directly by clients.
-- 3. Updates `submit_student_registration` to require a server-validated,
--    single-use verification token bound to the student's normalized SRM email.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Create table for email OTP challenges
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

-- Optimized indexes for rapid lookup and rate limiting
CREATE INDEX IF NOT EXISTS idx_email_otp_challenges_email_exp 
  ON public.email_otp_challenges (normalized_email, expires_at);

CREATE INDEX IF NOT EXISTS idx_email_otp_challenges_token_hash 
  ON public.email_otp_challenges (verification_token_hash);

CREATE INDEX IF NOT EXISTS idx_email_otp_challenges_created_at 
  ON public.email_otp_challenges (normalized_email, created_at);

-- Enable RLS: Zero direct client access (access is strictly through Edge Functions with service role or Security Definer RPCs)
ALTER TABLE public.email_otp_challenges ENABLE ROW LEVEL SECURITY;

-- 2. Update submit_student_registration to require valid email verification proof
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
  v_active_reg record;
  v_active_reg_by_no record;
  v_rejected_reg record;
  v_challenge record;
  v_proof_hash text;
  v_raw_token text;
  v_token_hash text;
  v_new_id uuid;
  v_new_user_id uuid;
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

  -- Case A: Check if an active account already exists in auth.users
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

  -- Also check if registration number is already assigned in profiles
  IF EXISTS (SELECT 1 FROM public.profiles WHERE upper(trim(registration_number)) = v_clean_reg) THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'EXISTING_ACCOUNT',
      'message', 'An account with this registration number already exists. Please log in instead.'
    );
  END IF;

  -- Case B1: Check if an active (pending or approved) application exists for this email
  SELECT * INTO v_active_reg
  FROM public.registrations
  WHERE normalized_email = v_clean_email
    AND status IN ('pending', 'approved')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_active_reg.id IS NOT NULL THEN
    v_raw_token := encode(gen_random_bytes(32), 'hex');
    v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');

    UPDATE public.registrations
    SET access_token_hash = v_token_hash,
        updated_at = now()
    WHERE id = v_active_reg.id;

    RETURN jsonb_build_object(
      'success', true,
      'code', 'EXISTING_APPLICATION',
      'message', 'A request with this email has already been submitted.',
      'status', v_active_reg.status,
      'token', v_raw_token,
      'registration', jsonb_build_object(
        'id', v_active_reg.id,
        'full_name', v_active_reg.full_name,
        'email', v_active_reg.email,
        'registration_number', v_active_reg.registration_number,
        'status', v_active_reg.status,
        'created_at', v_active_reg.created_at,
        'reviewed_at', v_active_reg.reviewed_at,
        'rejection_reason', v_active_reg.rejection_reason
      )
    );
  END IF;

  -- Case B2: Check if active application exists for this registration number under another email
  SELECT * INTO v_active_reg_by_no
  FROM public.registrations
  WHERE normalized_reg_no = v_clean_reg
    AND status IN ('pending', 'approved')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_active_reg_by_no.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'DUPLICATE_REG_NO',
      'message', 'An application has already been submitted for this registration number.'
    );
  END IF;

  -- Case B3: Check if a prior rejected application exists for this email
  SELECT * INTO v_rejected_reg
  FROM public.registrations
  WHERE normalized_email = v_clean_email
    AND status = 'rejected'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_rejected_reg.id IS NOT NULL THEN
    v_raw_token := encode(gen_random_bytes(32), 'hex');
    v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');

    UPDATE public.registrations
    SET access_token_hash = v_token_hash,
        updated_at = now()
    WHERE id = v_rejected_reg.id;

    RETURN jsonb_build_object(
      'success', true,
      'code', 'EXISTING_APPLICATION',
      'message', 'A request with this email has already been submitted.',
      'status', 'rejected',
      'token', v_raw_token,
      'registration', jsonb_build_object(
        'id', v_rejected_reg.id,
        'full_name', v_rejected_reg.full_name,
        'email', v_rejected_reg.email,
        'registration_number', v_rejected_reg.registration_number,
        'status', 'rejected',
        'created_at', v_rejected_reg.created_at,
        'reviewed_at', v_rejected_reg.reviewed_at,
        'rejection_reason', v_rejected_reg.rejection_reason
      )
    );
  END IF;

  -- Case C: Validate Server-Side Email OTP Verification Proof
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

  -- Case D: Automatically create student user account in auth.users & public.profiles
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

  -- If prior rejected record existed for this email, update it in-place to approved
  IF v_rejected_reg.id IS NOT NULL THEN
    UPDATE public.registrations
    SET full_name = v_clean_name,
        email = trim(p_email),
        normalized_email = v_clean_email,
        registration_number = v_clean_reg,
        normalized_reg_no = v_clean_reg,
        status = 'approved',
        access_token_hash = v_token_hash,
        reviewed_at = now(),
        reviewed_by = NULL,
        rejection_reason = 'Auto-approved on resubmission via verified SRM email OTP',
        welcome_email_status = 'not_sent',
        updated_at = now()
    WHERE id = v_rejected_reg.id;

    v_new_id := v_rejected_reg.id;
  ELSE
    -- Insert new registration record directly with status 'approved'
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
