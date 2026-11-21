-- CrossCall Migration 002: Unified Supabase Auth, Identity Linking, Automatic Profile Trigger & RLS

-- 1. Ensure user_profiles / users table links cleanly to auth.users(id)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS needs_profile_completion BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON users(auth_user_id);

-- 2. Linked Identities Table (1 User ID -> Google / Apple / Email / Phone)
CREATE TABLE IF NOT EXISTS user_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'apple', 'email', 'phone')),
  provider_user_id TEXT NOT NULL,
  provider_email TEXT,
  is_private_relay BOOLEAN NOT NULL DEFAULT FALSE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sign_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_user_id),
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities(user_id);

-- 3. Automatic Profile Creation & Metadata Sync Trigger on Supabase auth.users
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider TEXT;
  v_full_name TEXT;
  v_avatar_url TEXT;
  v_username TEXT;
  v_is_private_relay BOOLEAN;
BEGIN
  v_provider := COALESCE(NEW.raw_app_meta_data->>'provider', 'email');
  v_full_name := NULLIF(
    TRIM(
      COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        ''
      )
    ),
    ''
  );
  v_avatar_url := NEW.raw_user_meta_data->>'avatar_url';
  v_is_private_relay := COALESCE(NEW.email ILIKE '%@privaterelay.appleid.com', FALSE);

  v_username := LOWER(
    REGEXP_REPLACE(
      COALESCE(
        SPLIT_PART(NEW.email, '@', 1),
        'user_' || SUBSTRING(NEW.id::TEXT FROM 1 FOR 6)
      ),
      '[^a-z0-9._]',
      '',
      'g'
    )
  );
  IF LENGTH(v_username) < 3 THEN
    v_username := 'user_' || SUBSTRING(NEW.id::TEXT FROM 1 FOR 6);
  END IF;

  IF EXISTS (SELECT 1 FROM public.users WHERE username = v_username) THEN
    v_username := LEFT(v_username, 18) || '_' || SUBSTRING(NEW.id::TEXT FROM 1 FOR 4);
  END IF;

  INSERT INTO public.users (
    id,
    auth_user_id,
    username,
    full_name,
    avatar_url,
    email,
    email_verified,
    phone,
    phone_verified,
    needs_profile_completion,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.id,
    v_username,
    COALESCE(v_full_name, CASE WHEN v_provider = 'apple' THEN 'Apple User' WHEN v_provider = 'google' THEN 'Google User' ELSE 'CrossCall User' END),
    v_avatar_url,
    LOWER(NEW.email),
    COALESCE(NEW.email_confirmed_at IS NOT NULL, FALSE),
    NEW.phone,
    COALESCE(NEW.phone_confirmed_at IS NOT NULL, FALSE),
    (v_full_name IS NULL),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, public.users.email),
    email_verified = public.users.email_verified OR EXCLUDED.email_verified,
    avatar_url = COALESCE(public.users.avatar_url, EXCLUDED.avatar_url),
    updated_at = NOW();

  IF v_provider IN ('google', 'apple', 'email', 'phone') THEN
    INSERT INTO public.user_identities (
      user_id,
      provider,
      provider_user_id,
      provider_email,
      is_private_relay,
      email_verified,
      linked_at,
      last_sign_in_at
    ) VALUES (
      NEW.id,
      v_provider,
      COALESCE(NEW.raw_user_meta_data->>'sub', NEW.id::TEXT),
      LOWER(NEW.email),
      v_is_private_relay,
      COALESCE(NEW.email_confirmed_at IS NOT NULL, FALSE),
      NOW(),
      NOW()
    )
    ON CONFLICT (provider, provider_user_id) DO UPDATE SET
      last_sign_in_at = NOW(),
      provider_email = COALESCE(EXCLUDED.provider_email, public.user_identities.provider_email);
  END IF;

  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- 4. Guardrail Function: Prevent Unlinking Last Sign-In Identity
CREATE OR REPLACE FUNCTION public.prevent_unlink_last_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  remaining_count INT;
BEGIN
  SELECT COUNT(*) INTO remaining_count
  FROM public.user_identities
  WHERE user_id = OLD.user_id AND id <> OLD.id;

  IF remaining_count = 0 THEN
    RAISE EXCEPTION 'CANNOT_UNLINK_LAST_METHOD';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_unlink_last_identity ON public.user_identities;
CREATE TRIGGER trg_prevent_unlink_last_identity
  BEFORE DELETE ON public.user_identities
  FOR EACH ROW EXECUTE FUNCTION public.prevent_unlink_last_identity();

-- 5. Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_authenticated" ON users;
CREATE POLICY "users_select_authenticated"
  ON users FOR SELECT
  TO authenticated
  USING (NOT is_suspended OR auth.uid() = id);

DROP POLICY IF EXISTS "users_update_own" ON users;
CREATE POLICY "users_update_own"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "identities_select_own" ON user_identities;
CREATE POLICY "identities_select_own"
  ON user_identities FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "identities_delete_own" ON user_identities;
CREATE POLICY "identities_delete_own"
  ON user_identities FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "settings_all_own" ON user_settings;
CREATE POLICY "settings_all_own"
  ON user_settings FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "devices_all_own" ON devices;
CREATE POLICY "devices_all_own"
  ON devices FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
