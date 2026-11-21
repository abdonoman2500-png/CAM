export interface PublicClientEnv {
  appName: string;
  appUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  googleOAuthReady: boolean;
  appleOAuthReady: boolean;
  supabaseAuthReady: boolean;
}

export interface EnvValidationReport {
  nodeEnv: string;
  port: number;
  appName: string;
  appUrl: string;
  apiUrl: string;
  corsOrigins: string[];
  allowedRedirectUrls: string[];
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  cookieSecure: boolean;
  cookieSameSite: 'lax' | 'strict' | 'none';
  providers: {
    supabase: boolean;
    google: boolean;
    apple: boolean;
  };
  missingEnvVars: {
    supabase: string[];
    google: string[];
    apple: string[];
    security: string[];
  };
  warnings: string[];
}

function isPlaceholder(val: string | undefined): boolean {
  if (!val) return true;
  const trimmed = val.trim();
  if (!trimmed) return true;
  return (
    trimmed.startsWith('YOUR_') ||
    trimmed.startsWith('CHANGE_') ||
    trimmed === 'MY_APP_URL' ||
    trimmed.includes('your-domain.com') ||
    trimmed.includes('YOUR_PROJECT')
  );
}

function cleanEnvValue(val: string | undefined): string {
  return isPlaceholder(val) ? '' : (val?.trim() || '');
}

function parseBool(val: string | undefined, fallback: boolean): boolean {
  if (val === undefined || val === '') return fallback;
  return val.toLowerCase() === 'true';
}

function parseUrlList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => {
      if (isPlaceholder(s)) return false;
      try {
        const u = new URL(s);
        return u.protocol === 'https:' || u.protocol === 'http:';
      } catch {
        return false;
      }
    });
}

/**
 * Validates server and public client environment configuration.
 * Ensures SUPABASE_SERVICE_ROLE_KEY and OAuth secrets remain strictly server-only.
 */
export function validateEnvConfig(env: NodeJS.ProcessEnv = process.env): EnvValidationReport {
  if (env.VITE_SUPABASE_SERVICE_ROLE_KEY && env.VITE_SUPABASE_SERVICE_ROLE_KEY.trim()) {
    throw new Error(
      'SECURITY VIOLATION: SUPABASE_SERVICE_ROLE_KEY must never be prefixed with VITE_ or exposed to the browser.'
    );
  }

  const warnings: string[] = [];
  const nodeEnv = env.NODE_ENV || 'development';
  const port = Number(env.PORT || 3000);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error('Invalid PORT environment variable');
  }

  const appName = cleanEnvValue(env.APP_NAME) || cleanEnvValue(env.VITE_APP_NAME) || 'CrossCall';
  const appUrl = (cleanEnvValue(env.APP_URL) || `http://localhost:${port}`).replace(/\/+$/, '');
  const apiUrl = (cleanEnvValue(env.API_URL) || appUrl).replace(/\/+$/, '');

  const supabaseUrl = cleanEnvValue(env.SUPABASE_URL) || cleanEnvValue(env.VITE_SUPABASE_URL);
  const supabaseAnonKey =
    cleanEnvValue(env.SUPABASE_ANON_KEY) || cleanEnvValue(env.VITE_SUPABASE_ANON_KEY);
  const supabaseServiceRole = cleanEnvValue(env.SUPABASE_SERVICE_ROLE_KEY);

  const googleClientId = cleanEnvValue(env.GOOGLE_CLIENT_ID);
  const googleClientSecret = cleanEnvValue(env.GOOGLE_CLIENT_SECRET);

  const appleClientId = cleanEnvValue(env.APPLE_CLIENT_ID);
  const appleTeamId = cleanEnvValue(env.APPLE_TEAM_ID);
  const appleKeyId = cleanEnvValue(env.APPLE_KEY_ID);
  const appleKey = cleanEnvValue(env.APPLE_PRIVATE_KEY) || cleanEnvValue(env.APPLE_PRIVATE_KEY_PATH);

  const missingSupabase: string[] = [];
  if (!supabaseUrl) missingSupabase.push('SUPABASE_URL');
  if (!supabaseAnonKey) missingSupabase.push('SUPABASE_ANON_KEY');
  if (!supabaseServiceRole) missingSupabase.push('SUPABASE_SERVICE_ROLE_KEY');

  const missingGoogle: string[] = [];
  if (!googleClientId) missingGoogle.push('GOOGLE_CLIENT_ID');
  if (!googleClientSecret) missingGoogle.push('GOOGLE_CLIENT_SECRET');

  const missingApple: string[] = [];
  if (!appleClientId) missingApple.push('APPLE_CLIENT_ID');
  if (!appleTeamId) missingApple.push('APPLE_TEAM_ID');
  if (!appleKeyId) missingApple.push('APPLE_KEY_ID');
  if (!appleKey) missingApple.push('APPLE_PRIVATE_KEY (or APPLE_PRIVATE_KEY_PATH)');

  const missingSecurity: string[] = [];
  if (!cleanEnvValue(env.AUTH_SESSION_SECRET)) {
    missingSecurity.push('AUTH_SESSION_SECRET');
  }

  const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey && supabaseServiceRole);
  const googleConfigured = Boolean(googleClientId && googleClientSecret);
  const appleConfigured = Boolean(appleClientId && appleTeamId && appleKeyId && appleKey);

  if (!googleConfigured && !supabaseConfigured) {
    warnings.push(`Google OAuth missing: ${missingGoogle.join(', ')}`);
  }
  if (!appleConfigured && !supabaseConfigured) {
    warnings.push(`Apple Sign-In missing: ${missingApple.join(', ')}`);
  }
  if (missingSupabase.length > 0) {
    warnings.push(`Supabase Auth backend missing: ${missingSupabase.join(', ')}`);
  }
  if (nodeEnv === 'production' && missingSecurity.length > 0) {
    warnings.push('AUTH_SESSION_SECRET is unset; using ephemeral in-memory signing secret.');
  }

  const sameSiteRaw = (env.COOKIE_SAME_SITE || 'none').toLowerCase();
  const cookieSameSite: 'lax' | 'strict' | 'none' =
    sameSiteRaw === 'strict' ? 'strict' : sameSiteRaw === 'lax' ? 'lax' : 'none';

  return {
    nodeEnv,
    port,
    appName,
    appUrl,
    apiUrl,
    corsOrigins: parseUrlList(env.CORS_ORIGINS),
    allowedRedirectUrls: parseUrlList(env.ALLOWED_REDIRECT_URLS),
    rateLimitWindowMs: Math.max(1000, Number(env.RATE_LIMIT_WINDOW_MS || 60000)),
    rateLimitMaxRequests: Math.max(5, Number(env.RATE_LIMIT_MAX_REQUESTS || 30)),
    cookieSecure: parseBool(env.COOKIE_SECURE, true),
    cookieSameSite,
    providers: {
      supabase: supabaseConfigured,
      google: googleConfigured,
      apple: appleConfigured,
    },
    missingEnvVars: {
      supabase: missingSupabase,
      google: missingGoogle,
      apple: missingApple,
      security: missingSecurity,
    },
    warnings,
  };
}

/**
 * Returns strictly non-secret Frontend public metadata.
 * NEVER exposes SUPABASE_SERVICE_ROLE_KEY, GOOGLE_CLIENT_SECRET, APPLE_PRIVATE_KEY, or AUTH_SESSION_SECRET.
 */
export function getPublicClientEnv(env: NodeJS.ProcessEnv = process.env): PublicClientEnv {
  const report = validateEnvConfig(env);
  const supabaseUrl = cleanEnvValue(env.VITE_SUPABASE_URL) || cleanEnvValue(env.SUPABASE_URL);
  const supabaseAnonKey =
    cleanEnvValue(env.VITE_SUPABASE_ANON_KEY) || cleanEnvValue(env.SUPABASE_ANON_KEY);

  return {
    appName: report.appName,
    appUrl: report.appUrl,
    supabaseUrl,
    supabaseAnonKey,
    googleOAuthReady: report.providers.google || report.providers.supabase,
    appleOAuthReady: report.providers.apple || report.providers.supabase,
    supabaseAuthReady: report.providers.supabase,
  };
}
