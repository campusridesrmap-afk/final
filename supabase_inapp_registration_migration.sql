-- ==============================================================================
-- CampusRide: In-App Student Registration & Admin Approval Migration
-- SRM University-AP Carpooling Platform
--
-- Safe, additive, backward-compatible migration.
-- Paste and run in the Supabase SQL Editor.
-- ==============================================================================

-- 0. Enable pgcrypto for cryptographic token hashing and generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ==============================================================================
-- 1. ADMIN USERS TABLE & AUTHORIZATION FUNCTION
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.app_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view admin list" ON public.app_admins;
CREATE POLICY "Admins can view admin list"
  ON public.app_admins FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Authoritative server-side function to check if caller is an administrator
CREATE OR REPLACE FUNCTION public.is_app_admin(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_admins
    WHERE user_id = COALESCE(p_user_id, auth.uid())
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_app_admin(uuid) TO authenticated, anon;

-- ==============================================================================
-- 2. STUDENT REGISTRATIONS TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  normalized_email text NOT NULL,
  registration_number text NOT NULL,
  normalized_reg_no text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  access_token_hash text NOT NULL,
  rejection_reason text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id)
);

-- Active-only unique indexes: strictly prevents concurrent duplicate active applications
-- while preserving past review history and allowing rejected students to resubmit
DROP INDEX IF EXISTS idx_registrations_normalized_email;
DROP INDEX IF EXISTS idx_registrations_normalized_reg_no;

CREATE UNIQUE INDEX IF NOT EXISTS idx_registrations_active_email
  ON public.registrations (normalized_email)
  WHERE status IN ('pending', 'approved');

CREATE UNIQUE INDEX IF NOT EXISTS idx_registrations_active_reg_no
  ON public.registrations (normalized_reg_no)
  WHERE status IN ('pending', 'approved');

CREATE INDEX IF NOT EXISTS idx_registrations_token_hash
  ON public.registrations (access_token_hash);

CREATE INDEX IF NOT EXISTS idx_registrations_status
  ON public.registrations (status);

ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

-- Admins can view and update registrations
DROP POLICY IF EXISTS "Admins can view registrations" ON public.registrations;
CREATE POLICY "Admins can view registrations"
  ON public.registrations FOR SELECT
  TO authenticated
  USING (public.is_app_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update registrations" ON public.registrations;
CREATE POLICY "Admins can update registrations"
  ON public.registrations FOR UPDATE
  TO authenticated
  USING (public.is_app_admin(auth.uid()))
  WITH CHECK (public.is_app_admin(auth.uid()));

-- ==============================================================================
-- 3. SUBMIT NEW STUDENT REGISTRATION RPC (EXACT 3-ARGUMENT SIGNATURE)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.submit_student_registration(
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
  v_clean_name text;
  v_clean_email text;
  v_clean_reg text;
  v_existing_auth_id uuid;
  v_active_reg record;
  v_active_reg_by_no record;
  v_rejected_reg record;
  v_raw_token text;
  v_token_hash text;
  v_new_id uuid;
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

  -- Case C: Create new application with status 'pending'
  v_raw_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');

  INSERT INTO public.registrations (
    full_name,
    email,
    normalized_email,
    registration_number,
    normalized_reg_no,
    status,
    access_token_hash,
    created_at,
    updated_at
  ) VALUES (
    v_clean_name,
    trim(p_email),
    v_clean_email,
    v_clean_reg,
    v_clean_reg,
    'pending',
    v_token_hash,
    now(),
    now()
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'CREATED',
    'message', 'Your application has been submitted successfully and is awaiting verification.',
    'status', 'pending',
    'token', v_raw_token,
    'registration', jsonb_build_object(
      'id', v_new_id,
      'full_name', v_clean_name,
      'email', trim(p_email),
      'registration_number', v_clean_reg,
      'status', 'pending',
      'created_at', now()
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_student_registration(text, text, text) TO anon, authenticated;

-- ==============================================================================
-- 4. RESUBMIT REJECTED REGISTRATION RPC (REUSES EXISTING RECORD)
-- ==============================================================================

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

-- ==============================================================================
-- 5. GET APPLICATION STATUS RPC (UNGUESSABLE TOKEN)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_registration_status(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
STABLE
AS $$
DECLARE
  v_token_hash text;
  v_reg record;
  v_masked_reg text;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid access token.');
  END IF;

  v_token_hash := encode(digest(trim(p_token), 'sha256'), 'hex');

  SELECT * INTO v_reg
  FROM public.registrations
  WHERE access_token_hash = v_token_hash;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Application not found or link expired.');
  END IF;

  -- Mask registration number: show first 2 and last 4 characters (e.g. AP•••••0265)
  IF length(v_reg.registration_number) > 6 THEN
    v_masked_reg := substr(v_reg.registration_number, 1, 2) || '•••••' || substr(v_reg.registration_number, length(v_reg.registration_number) - 3);
  ELSE
    v_masked_reg := v_reg.registration_number;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'registration', jsonb_build_object(
      'id', v_reg.id,
      'full_name', v_reg.full_name,
      'email', v_reg.email,
      'masked_registration_number', v_masked_reg,
      'status', v_reg.status,
      'created_at', v_reg.created_at,
      'updated_at', v_reg.updated_at,
      'reviewed_at', v_reg.reviewed_at,
      'rejection_reason', v_reg.rejection_reason
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_registration_status(text) TO anon, authenticated;

-- ==============================================================================
-- 6. RECOVER STATUS TOKEN RPC (2-FACTOR: SRM EMAIL + REG NO)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.recover_registration_token(
  p_email text,
  p_registration_number text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_clean_email text;
  v_clean_reg text;
  v_reg record;
  v_raw_token text;
  v_token_hash text;
BEGIN
  v_clean_email := lower(trim(p_email));
  v_clean_reg := upper(trim(p_registration_number));

  SELECT * INTO v_reg
  FROM public.registrations
  WHERE normalized_email = v_clean_email
    AND normalized_reg_no = v_clean_reg
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'No matching application found. Please verify your SRM email and registration number.'
    );
  END IF;

  v_raw_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');

  UPDATE public.registrations
  SET access_token_hash = v_token_hash,
      updated_at = now()
  WHERE id = v_reg.id;

  RETURN jsonb_build_object(
    'success', true,
    'token', v_raw_token,
    'status', v_reg.status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.recover_registration_token(text, text) TO anon, authenticated;

-- ==============================================================================
-- 7. ADMIN GET REGISTRATIONS RPC (AUTHENTICATED ADMINS ONLY)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_registrations(p_status_filter text DEFAULT 'all')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
DECLARE
  v_caller_id uuid;
  v_results jsonb;
BEGIN
  v_caller_id := auth.uid();
  IF NOT public.is_app_admin(v_caller_id) THEN
    RAISE EXCEPTION 'Unauthorized: Administrator access required.';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'full_name', r.full_name,
      'email', r.email,
      'registration_number', r.registration_number,
      'status', r.status,
      'created_at', r.created_at,
      'updated_at', r.updated_at,
      'reviewed_at', r.reviewed_at,
      'reviewed_by', r.reviewed_by,
      'rejection_reason', r.rejection_reason
    ) ORDER BY r.created_at DESC
  ) INTO v_results
  FROM public.registrations r
  WHERE (p_status_filter = 'all' OR r.status = p_status_filter);

  RETURN COALESCE(v_results, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_registrations(text) TO authenticated;

-- ==============================================================================
-- 8. ADMIN APPROVE REGISTRATION RPC (ATOMIC & CONCURRENCY SAFE)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.admin_approve_registration(p_registration_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id uuid;
  v_reg record;
  v_existing_auth_id uuid;
  v_new_user_id uuid;
BEGIN
  v_caller_id := auth.uid();
  IF NOT public.is_app_admin(v_caller_id) THEN
    RAISE EXCEPTION 'Unauthorized: Administrator access required.';
  END IF;

  -- Lock row for update to prevent concurrent approval race conditions
  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = p_registration_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Registration not found.');
  END IF;

  IF v_reg.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Cannot approve registration with status: ' || v_reg.status,
      'status', v_reg.status
    );
  END IF;

  -- Revalidate: check if account was already created
  SELECT id INTO v_existing_auth_id
  FROM auth.users
  WHERE lower(trim(email)) = v_reg.normalized_email;

  IF v_existing_auth_id IS NOT NULL THEN
    UPDATE public.registrations
    SET status = 'approved',
        reviewed_at = now(),
        reviewed_by = v_caller_id,
        updated_at = now()
    WHERE id = p_registration_id;

    RETURN jsonb_build_object('success', true, 'message', 'Account already exists. Marked as approved.', 'user_id', v_existing_auth_id);
  END IF;

  -- Call the existing admin_create_student_user function with registration number as temporary password
  -- Using explicit named parameter binding to ensure temp password and full name are correctly bound
  v_new_user_id := public.admin_create_student_user(
    p_email => v_reg.normalized_email,
    p_full_name => v_reg.full_name,
    p_registration_number => v_reg.normalized_reg_no,
    p_temp_password => v_reg.normalized_reg_no
  );

  IF v_new_user_id IS NULL THEN
    RAISE EXCEPTION 'Account provisioning function returned null.';
  END IF;

  -- Update status to approved ONLY after successful account creation
  UPDATE public.registrations
  SET status = 'approved',
      reviewed_at = now(),
      reviewed_by = v_caller_id,
      updated_at = now()
  WHERE id = p_registration_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Registration approved and student account created successfully.',
    'user_id', v_new_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_approve_registration(uuid) TO authenticated;

-- ==============================================================================
-- 9. ADMIN REJECT REGISTRATION RPC
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.admin_reject_registration(
  p_registration_id uuid,
  p_reason text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id uuid;
  v_reg record;
BEGIN
  v_caller_id := auth.uid();
  IF NOT public.is_app_admin(v_caller_id) THEN
    RAISE EXCEPTION 'Unauthorized: Administrator access required.';
  END IF;

  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = p_registration_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Registration not found.');
  END IF;

  IF v_reg.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Cannot reject registration with status: ' || v_reg.status,
      'status', v_reg.status
    );
  END IF;

  UPDATE public.registrations
  SET status = 'rejected',
      rejection_reason = trim(p_reason),
      reviewed_at = now(),
      reviewed_by = v_caller_id,
      updated_at = now()
  WHERE id = p_registration_id;

  RETURN jsonb_build_object('success', true, 'message', 'Registration rejected.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reject_registration(uuid, text) TO authenticated;

-- ==============================================================================
-- 10. REFRESH POSTGREST SCHEMA CACHE
-- ==============================================================================
NOTIFY pgrst, 'reload schema';
