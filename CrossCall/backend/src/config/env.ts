import 'dotenv/config';

export interface BackendEnvConfig {
  nodeEnv: 'development' | 'staging' | 'production' | 'test';
  port: number;
  appName: string;
  appUrl: string;
  apiUrl: string;
  corsOrigins: string[];
  allowedRedirectUrls: string[];
  databaseUrl: string;
  redisUrl: string;
  jwtAccessSecret: string;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  cookieSecure: boolean;
  cookieSameSite: 'lax' | 'strict' | 'none';
  providers: {
    supabase: boolean;
    google: boolean;
    apple: boolean;
  };
}

export function loadBackendEnv(): BackendEnvConfig {
  if (process.env.VITE_SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error('SECURITY VIOLATION: SUPABASE_SERVICE_ROLE_KEY must never have a VITE_ prefix');
  }
  const rawEnv = process.env.NODE_ENV || process.env.APP_ENV || 'development';
  const nodeEnv: BackendEnvConfig['nodeEnv'] =
    rawEnv === 'production' || rawEnv === 'staging' || rawEnv === 'test'
      ? rawEnv
      : 'development';

  const port = Number(process.env.PORT || 4000);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error('Invalid PORT environment variable');
  }

  const appName = process.env.APP_NAME?.trim() || 'CrossCall';
  const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const apiUrl = (process.env.API_URL || `http://localhost:${port}`).replace(/\/+$/, '');
  const databaseUrl = process.env.DATABASE_URL || '';
  const redisUrl = process.env.REDIS_URL || '';
  const jwtAccessSecret = process.env.JWT_ACCESS_SECRET || '';

  if (nodeEnv === 'production') {
    const requiredVars: Array<[string, string]> = [
      ['DATABASE_URL', databaseUrl],
      ['JWT_ACCESS_SECRET', jwtAccessSecret],
      ['APP_URL', process.env.APP_URL || ''],
    ];
    const missing = requiredVars.filter(([, val]) => !val).map(([key]) => key);
    if (missing.length > 0) {
      throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
    }
  }

  const corsOrigins = (process.env.CORS_ORIGINS || appUrl)
    .split(',')
    .map((item) => item.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  const allowedRedirectUrls = (
    process.env.ALLOWED_REDIRECT_URLS || `${appUrl}/auth/callback`
  )
    .split(',')
    .map((item) => item.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  const sameSiteRaw = (process.env.COOKIE_SAMESITE || 'none').toLowerCase();
  const cookieSameSite: 'lax' | 'strict' | 'none' =
    sameSiteRaw === 'strict' || sameSiteRaw === 'lax' ? sameSiteRaw : 'none';

  return {
    nodeEnv,
    port,
    appName,
    appUrl,
    apiUrl,
    corsOrigins,
    allowedRedirectUrls,
    databaseUrl,
    redisUrl,
    jwtAccessSecret,
    rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
    rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 100),
    cookieSecure: process.env.COOKIE_SECURE !== 'false',
    cookieSameSite,
    providers: {
      supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
      google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      apple: Boolean(
        process.env.APPLE_CLIENT_ID &&
          process.env.APPLE_TEAM_ID &&
          process.env.APPLE_KEY_ID &&
          (process.env.APPLE_PRIVATE_KEY || process.env.APPLE_PRIVATE_KEY_PATH)
      ),
    },
  };
}
