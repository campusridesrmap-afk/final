-- ==============================================================================
-- CampusRide: Set Initial Registration Password & Existing User Password Reset
-- SRM University-AP Carpooling Platform
--
-- Features:
-- 1. set_registration_password(p_email, p_token, p_password):
--    Allows student to set custom password using their verified registration token.
-- 2. Enhanced submit_student_registration(p_full_name, p_email, p_registration_number, p_verification_token):
--    - New users: creates account with temporary credentials and returns token to set password.
--    - Existing users who haven't changed password (must_change_password = true):
--      verifying email OTP again issues a fresh token and redirects them to Set Your Password!
--    - Existing users who already have a custom password: informs them to log in.
--
-- Instructions: Copy and run this script in the Supabase SQL Editor.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ==============================================================================
-- 1. Set Registration Password Function
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.set_registration_password(
  p_email text,
  p_token text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_clean_email text;
  v_token_hash text;
  v_reg record;
  v_user_id uuid;
  v_encrypted_pw text;
BEGIN
  v_clean_email := lower(trim(p_email));
  
  IF v_clean_email = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Email address is required.');
  END IF;

  IF p_password IS NULL OR length(p_password) < 6 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Password must be at least 6 characters long.');
  END IF;

  IF p_token IS NULL OR trim(p_token) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Registration session token is required.');
  END IF;

  v_token_hash := encode(digest(trim(p_token), 'sha256'), 'hex');

  -- Verify token matches the registration record for this email
  SELECT * INTO v_reg
  FROM public.registrations
  WHERE normalized_email = v_clean_email
    AND access_token_hash = v_token_hash
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Invalid or expired registration session. Please log in or register again.'
    );
  END IF;

  -- Find the auth user
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(trim(email)) = v_clean_email;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'User account not found.');
  END IF;

  -- Hash the new password using blowfish (standard bcrypt format used by GoTrue)
  v_encrypted_pw := extensions.crypt(p_password, extensions.gen_salt('bf'));

  -- Update auth.users directly
  UPDATE auth.users
  SET encrypted_password = v_encrypted_pw,
      updated_at = now()
  WHERE id = v_user_id;

  -- Update public.profiles: clear must_change_password flag
  UPDATE public.profiles
  SET must_change_password = false,
      updated_at = now()
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Password set successfully. Account setup complete.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_registration_password(text, text, text) TO anon, authenticated;


-- ==============================================================================
-- 2. Enhanced submit_student_registration with Unchanged Password Recovery
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
  v_must_change boolean;
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

  -- Validate Server-Side Email OTP Verification Proof first
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

  -- 1. Check if user already exists in auth.users
  SELECT id INTO v_existing_auth_id
  FROM auth.users
  WHERE lower(trim(email)) = v_clean_email;

  IF v_existing_auth_id IS NOT NULL THEN
    -- Check if this user has never changed their initial password
    SELECT must_change_password INTO v_must_change
    FROM public.profiles
    WHERE id = v_existing_auth_id;

    IF v_must_change IS TRUE THEN
      -- User account was created but personal password was never set!
      -- Because they just verified their email OTP, consume challenge and issue token to set password
      UPDATE public.email_otp_challenges
      SET status = 'consumed',
          consumed_at = now()
      WHERE id = v_challenge.id;

      -- Generate fresh access token
      v_raw_token := encode(gen_random_bytes(32), 'hex');
      v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');

      -- Update registration record with fresh token
      SELECT id INTO v_existing_reg_id
      FROM public.registrations
      WHERE normalized_email = v_clean_email
      ORDER BY created_at DESC
      LIMIT 1;

      IF v_existing_reg_id IS NOT NULL THEN
        UPDATE public.registrations
        SET access_token_hash = v_token_hash,
            status = 'approved',
            updated_at = now()
        WHERE id = v_existing_reg_id;
      ELSE
        INSERT INTO public.registrations (
          full_name, email, normalized_email, registration_number, normalized_reg_no,
          status, access_token_hash, reviewed_at, created_at, updated_at
        ) VALUES (
          v_clean_name, trim(p_email), v_clean_email, v_clean_reg, v_clean_reg,
          'approved', v_token_hash, now(), now(), now()
        )
        RETURNING id INTO v_existing_reg_id;
      END IF;

      RETURN jsonb_build_object(
        'success', true,
        'code', 'AUTO_APPROVED',
        'message', 'Email verified successfully. Please set your new password.',
        'status', 'approved',
        'token', v_raw_token,
        'userId', v_existing_auth_id
      );
    ELSE
      -- User already has an active account and has already set a custom password
      RETURN jsonb_build_object(
        'success', false,
        'code', 'EXISTING_ACCOUNT',
        'message', 'You already have an active account with a set password. Please log in instead.'
      );
    END IF;
  END IF;

  -- 2. Check if registration number is already assigned in profiles to another user
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

  -- Atomically consume the verification challenge for brand new user
  UPDATE public.email_otp_challenges
  SET status = 'consumed',
      consumed_at = now()
  WHERE id = v_challenge.id;

  -- 4. Automatically create student user account in auth.users & public.profiles
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

  -- Generate secure access token
  v_raw_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');

  -- Create or update registration record
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
        rejection_reason = 'Auto-approved via verified SRM email OTP',
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
      rejection_reason,
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
      'Auto-approved via verified SRM email OTP',
      now(),
      now()
    )
    RETURNING id INTO v_new_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'AUTO_APPROVED',
    'message', 'Your SRM email has been verified! Please set your personal password.',
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
