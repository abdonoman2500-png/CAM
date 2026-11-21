/**
 * Server-side Supabase Auth & Admin bridge.
 * Strictly backend-only: reads SUPABASE_SERVICE_ROLE_KEY from process.env and NEVER ships to browser/mobile clients.
 */
export interface SupabaseVerifiedIdentity {
  sub: string;
  provider: 'google' | 'apple';
  email: string | null;
  emailVerified: boolean;
  fullName: string;
  avatarUrl: string | null;
  isPrivateRelay: boolean;
}

export function getSupabaseServerCredentials(env: NodeJS.ProcessEnv = process.env): {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
} | null {
  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const anonKey = (env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim();
  const serviceRoleKey = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (
    !url ||
    !anonKey ||
    !serviceRoleKey ||
    url.includes('YOUR_PROJECT') ||
    anonKey.startsWith('YOUR_') ||
    serviceRoleKey.startsWith('YOUR_')
  ) {
    return null;
  }

  return { url, anonKey, serviceRoleKey };
}

export async function exchangeSupabasePkceCode(params: {
  code: string;
  codeVerifier: string;
  providerHint: 'google' | 'apple';
}): Promise<SupabaseVerifiedIdentity> {
  const creds = getSupabaseServerCredentials();
  if (!creds) {
    throw new Error('PROVIDER_NOT_CONFIGURED');
  }

  const tokenRes = await fetch(`${creds.url}/auth/v1/token?grant_type=pkce`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: creds.anonKey,
    },
    body: JSON.stringify({
      auth_code: params.code,
      code_verifier: params.codeVerifier,
    }),
  });

  if (!tokenRes.ok) {
    throw new Error(
      params.providerHint === 'apple' ? 'APPLE_AUTH_FAILED' : 'GOOGLE_OAUTH_FAILED'
    );
  }

  const tokenPayload = (await tokenRes.json()) as {
    user?: {
      id?: string;
      email?: string;
      email_confirmed_at?: string | null;
      app_metadata?: { provider?: string };
      user_metadata?: { full_name?: string; name?: string; avatar_url?: string; sub?: string };
    };
  };

  const userId = tokenPayload.user?.id;
  if (!userId) {
    throw new Error(
      params.providerHint === 'apple' ? 'APPLE_AUTH_FAILED' : 'GOOGLE_OAUTH_FAILED'
    );
  }

  // Authoritative verification via server-only SUPABASE_SERVICE_ROLE_KEY
  const adminRes = await fetch(`${creds.url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    headers: {
      apikey: creds.serviceRoleKey,
      Authorization: `Bearer ${creds.serviceRoleKey}`,
    },
  });

  const authoritativeUser = adminRes.ok
    ? ((await adminRes.json()) as {
        id: string;
        email?: string;
        email_confirmed_at?: string | null;
        app_metadata?: { provider?: string };
        user_metadata?: { full_name?: string; name?: string; avatar_url?: string; sub?: string };
        identities?: Array<{ provider?: string; id?: string; identity_data?: { sub?: string; email?: string } }>;
      })
    : null;

  const userObj = authoritativeUser || tokenPayload.user;
  const providerRaw = userObj?.app_metadata?.provider;
  const provider: 'google' | 'apple' =
    providerRaw === 'apple' ? 'apple' : providerRaw === 'google' ? 'google' : params.providerHint;

  const email = (userObj?.email || null)?.toLowerCase() ?? null;
  const isPrivateRelay = Boolean(email && email.endsWith('@privaterelay.appleid.com'));
  const matchingIdentity = authoritativeUser?.identities?.find((i) => i.provider === provider);
  const sub =
    matchingIdentity?.identity_data?.sub ||
    matchingIdentity?.id ||
    userObj?.user_metadata?.sub ||
    userId;

  const fullName = (
    userObj?.user_metadata?.full_name ||
    userObj?.user_metadata?.name ||
    ''
  ).trim();

  return {
    sub,
    provider,
    email,
    emailVerified: Boolean(userObj?.email_confirmed_at),
    fullName,
    avatarUrl: userObj?.user_metadata?.avatar_url || null,
    isPrivateRelay,
  };
}
