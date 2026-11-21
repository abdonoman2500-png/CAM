-- CrossCall Official Authentication, Provider Identities, Audit Logs & RLS (002_official_auth_rls.sql)
-- Requires PostgreSQL 15+

-- 1. Extend profiles for multi-provider official auth and Apple Hide My Email support
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_contact_required;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'email'
    CHECK (auth_provider IN ('email', 'google', 'apple', 'phone')),
  ADD COLUMN IF NOT EXISTS accepted_terms_at TIMESTAMPTZ;

-- 2. Linked OAuth Identities (Strict provider + provider_user_id matching)
CREATE TABLE IF NOT EXISTS user_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('google', 'apple')),
    provider_user_id TEXT NOT NULL,
    provider_email CITEXT,
    is_private_email BOOLEAN NOT NULL DEFAULT FALSE,
    linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities (user_id);

-- 3. Email Verification & Password Reset Tokens (Hashed, time-limited, single-use)
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    email CITEXT NOT NULL,
    channel TEXT NOT NULL CHECK (channel IN ('verify_email', 'password_reset')),
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_tokens_user ON email_verification_tokens (user_id, channel, created_at DESC);

-- 4. Rotating Refresh Sessions
CREATE TABLE IF NOT EXISTS refresh_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES user_devices(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_sessions_user ON refresh_sessions (user_id) WHERE revoked_at IS NULL;

-- 5. Authentication Audit Logs (Never stores passwords, tokens, or secrets)
CREATE TABLE IF NOT EXISTS auth_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    provider TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    success BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_audit_user ON auth_audit_logs (user_id, created_at DESC);

-- 6. Row-Level Security (RLS) Policies
-- Assumes application connections set `app.current_user_id` or Supabase `auth.uid()`.
CREATE OR REPLACE FUNCTION crosscall_actor_id()
RETURNS UUID AS $$
BEGIN
    RETURN COALESCE(
        NULLIF(current_setting('app.current_user_id', true), '')::UUID,
        NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID
    );
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_self_select ON profiles
  FOR SELECT USING (id = crosscall_actor_id() OR is_suspended = FALSE);

CREATE POLICY profiles_self_update ON profiles
  FOR UPDATE USING (id = crosscall_actor_id())
  WITH CHECK (id = crosscall_actor_id());

CREATE POLICY identities_owner_all ON user_identities
  FOR ALL USING (user_id = crosscall_actor_id())
  WITH CHECK (user_id = crosscall_actor_id());

CREATE POLICY devices_owner_all ON user_devices
  FOR ALL USING (user_id = crosscall_actor_id())
  WITH CHECK (user_id = crosscall_actor_id());

CREATE POLICY settings_owner_all ON user_settings
  FOR ALL USING (user_id = crosscall_actor_id())
  WITH CHECK (user_id = crosscall_actor_id());

CREATE POLICY notifications_owner_all ON notifications
  FOR ALL USING (user_id = crosscall_actor_id())
  WITH CHECK (user_id = crosscall_actor_id());

CREATE POLICY blocks_owner_all ON blocked_users
  FOR ALL USING (user_id = crosscall_actor_id())
  WITH CHECK (user_id = crosscall_actor_id());

CREATE POLICY calls_participant_select ON calls
  FOR SELECT USING (
    caller_id = crosscall_actor_id()
    OR EXISTS (
      SELECT 1 FROM call_participants cp
      WHERE cp.call_id = calls.id AND cp.user_id = crosscall_actor_id()
    )
  );

CREATE POLICY call_participants_self_select ON call_participants
  FOR SELECT USING (user_id = crosscall_actor_id());

CREATE POLICY audit_owner_select ON auth_audit_logs
  FOR SELECT USING (user_id = crosscall_actor_id());
