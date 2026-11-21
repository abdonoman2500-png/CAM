import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import {
  checkRateLimit,
  generateOtpCode,
  hashOtpCode,
  hashPassword,
  signJwt,
  verifyJwt,
  verifyOtpCode,
  verifyPassword,
  type JwtClaims,
  type RateLimitEntry,
} from './server/authLogic';
import { getPublicClientEnv, validateEnvConfig } from './server/envConfig';
import {
  buildAppleAuthUrl,
  buildGoogleAuthUrl,
  buildSupabaseOAuthUrl,
  canUnlinkIdentity,
  classifyOAuthCallbackError,
  createAppleClientSecret,
  generatePkcePair,
  isAllowedRedirectUri,
  isApplePrivateRelayEmail,
  resolveOAuthIdentityAction,
  signOAuthState,
  verifyOAuthState,
} from './server/oauthLogic';
import { exchangeSupabasePkceCode } from './server/supabaseAdmin';
import { store, type StoredUser } from './server/store';
import { SignalingHub } from './server/wsHub';
import type { AuthErrorCode, AuthProvider } from './src/types/crosscall';
import {
  sanitizeRoomSlug,
  validateEmail,
  validateOtpCode,
  validatePhone,
  validateUsername,
} from './src/utils/callRules';

const envConfig = validateEnvConfig();
const PORT = envConfig.port;
const BOOT_TIME = Date.now();
const JWT_SECRET =
  process.env.AUTH_SESSION_SECRET ||
  process.env.JWT_ACCESS_SECRET ||
  crypto.randomBytes(32).toString('hex');
const OTP_SECRET = process.env.OTP_HMAC_SECRET || crypto.randomBytes(32).toString('hex');
const OAUTH_STATE_SECRET = process.env.AUTH_SESSION_SECRET || JWT_SECRET;

const rateBuckets = new Map<string, RateLimitEntry>();
const oauthTickets = new Map<
  string,
  {
    userId: string;
    mode: 'login' | 'link';
    provider: 'google' | 'apple';
    expiresAt: number;
  }
>();
const supabasePkceFlows = new Map<
  string,
  {
    provider: 'google' | 'apple';
    mode: 'login' | 'link';
    userId?: string;
    codeVerifier: string;
    expiresAt: number;
  }
>();

interface AuthedRequest extends Request {
  auth?: JwtClaims;
  currentUser?: StoredUser;
}

function getClientIp(req: Request): string {
  return String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? 'local');
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required', code: 'SESSION_EXPIRED' });
    return;
  }
  const token = header.slice(7).trim();
  const claims = verifyJwt(token, JWT_SECRET);
  if (!claims) {
    res.status(401).json({ error: 'Invalid or expired session', code: 'SESSION_EXPIRED' });
    return;
  }
  if (claims.deviceId) {
    const device = store.db.devices.find((d) => d.id === claims.deviceId);
    if (!device || device.isRevoked) {
      res.status(401).json({ error: 'Device session revoked', code: 'SESSION_EXPIRED' });
      return;
    }
    device.lastActiveAt = new Date().toISOString();
  }
  if (claims.role !== 'admin') {
    const user = store.db.users.find((u) => u.id === claims.sub);
    if (!user || user.isSuspended) {
      res.status(403).json({ error: 'Account unavailable or suspended' });
      return;
    }
    req.currentUser = user;
  }
  req.auth = claims;
  next();
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.auth?.role !== 'admin') {
      res.status(403).json({ error: 'Administrator privileges required' });
      return;
    }
    next();
  });
}

function registerDeviceAndIssueToken(
  user: StoredUser,
  platform: 'web' | 'android' | 'ios',
  deviceName: string
) {
  const deviceId = `dev-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  store.db.devices.unshift({
    id: deviceId,
    userId: user.id,
    platform,
    deviceName: deviceName.slice(0, 80) || 'Web Browser Session',
    createdAt: now,
    lastActiveAt: now,
    isRevoked: false,
  });
  user.presence = 'online';
  user.lastSeenAt = now;
  store.save();
  const token = signJwt({ sub: user.id, role: user.role, deviceId }, JWT_SECRET);
  return { token, deviceId };
}

function getAllowedBaseUrls(): string[] {
  const set = new Set<string>([
    envConfig.appUrl,
    `http://localhost:${PORT}`,
    ...envConfig.allowedRedirectUrls,
  ]);
  return Array.from(set).filter(Boolean);
}

function readApplePrivateKeyPem(): string | null {
  if (process.env.APPLE_PRIVATE_KEY?.trim()) {
    return process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n');
  }
  const keyPath = process.env.APPLE_PRIVATE_KEY_PATH?.trim();
  if (keyPath && fs.existsSync(path.resolve(process.cwd(), keyPath))) {
    return fs.readFileSync(path.resolve(process.cwd(), keyPath), 'utf8');
  }
  return null;
}

function generateUniqueUsername(seed: string): string {
  const base = seed
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, '')
    .slice(0, 20) || 'user';
  const candidate = base.length >= 3 ? base : `user_${base}`;
  if (!store.db.users.some((u) => u.username.toLowerCase() === candidate)) {
    return candidate;
  }
  return `${candidate.slice(0, 18)}_${crypto.randomInt(100, 999)}`;
}

function renderOAuthPopupResultHtml(payload: {
  ok: boolean;
  ticket?: string;
  mode: 'login' | 'link';
  provider: 'google' | 'apple';
  errorCode?: AuthErrorCode;
}) {
  const serialized = JSON.stringify({
    type: 'CROSSCALL_OAUTH_RESULT',
    ...payload,
  });
  const fallbackRedirect = payload.ok && payload.ticket
    ? `/?oauth_ticket=${encodeURIComponent(payload.ticket)}`
    : `/?oauth_error=${encodeURIComponent(payload.errorCode || 'GOOGLE_OAUTH_FAILED')}`;
  return `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>${envConfig.appName} Authentication</title></head>
  <body style="font-family:system-ui,sans-serif;background:#0B0F19;color:#F8FAFC;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
    <div style="text-align:center;padding:24px">
      <p>${payload.ok ? 'Authentication complete. Returning to CrossCall…' : 'Authentication did not complete. Returning to CrossCall…'}</p>
    </div>
    <script>
      (function() {
        var msg = ${serialized};
        if (window.opener) {
          window.opener.postMessage(msg, '*');
          window.close();
        } else {
          window.location.href = ${JSON.stringify(fallbackRedirect)};
        }
      })();
    </script>
  </body>
</html>`;
}

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

function setSupabaseFlowCookie(res: Response, flowId: string): void {
  const securePart = envConfig.cookieSecure ? '; Secure' : '';
  const sameSitePart =
    envConfig.cookieSameSite === 'none'
      ? '; SameSite=None; Partitioned'
      : envConfig.cookieSameSite === 'strict'
        ? '; SameSite=Strict'
        : '; SameSite=Lax';
  res.setHeader(
    'Set-Cookie',
    `cc_oauth_flow=${encodeURIComponent(flowId)}; Path=/auth/callback; HttpOnly; Max-Age=600${securePart}${sameSitePart}`
  );
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));

  const httpServer = http.createServer(app);
  const wsHub = new SignalingHub(httpServer, JWT_SECRET);

  // Health & Provider Readiness (public status booleans only, zero secrets)
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      appName: envConfig.appName,
      livekitMode: process.env.LIVEKIT_URL ? 'livekit_sfu' : 'webrtc_ws_signaling',
      database: 'connected',
      uptimeSeconds: Math.floor((Date.now() - BOOT_TIME) / 1000),
      providers: envConfig.providers,
    });
  });

  app.get('/api/auth/providers', (_req, res) => {
    const publicEnv = getPublicClientEnv();
    res.json({
      appName: publicEnv.appName,
      google: publicEnv.googleOAuthReady,
      apple: publicEnv.appleOAuthReady,
      supabase: publicEnv.supabaseAuthReady,
      email: true,
      phoneOtp: true,
      missingEnvVars: envConfig.missingEnvVars,
    });
  });

  // Google OAuth Authorization URL (Direct Google OIDC + PKCE or Supabase Auth PKCE)
  app.get('/api/auth/oauth/google/url', (req: AuthedRequest, res) => {
    const mode = req.query.mode === 'link' ? 'link' : 'login';
    let userId: string | undefined;

    if (mode === 'link') {
      const header = req.headers.authorization;
      const claims = header?.startsWith('Bearer ')
        ? verifyJwt(header.slice(7).trim(), JWT_SECRET)
        : null;
      if (!claims) {
        res.status(401).json({ error: 'Authentication required to link Google account', code: 'SESSION_EXPIRED' });
        return;
      }
      userId = claims.sub;
    }

    const requestedRedirect = String(
      req.query.redirectUri || `${envConfig.appUrl}/auth/callback`
    );
    if (!isAllowedRedirectUri(requestedRedirect, getAllowedBaseUrls())) {
      res.status(400).json({ error: 'Invalid Redirect URL', code: 'INVALID_REDIRECT_URL' });
      return;
    }

    if (!envConfig.providers.google && !envConfig.providers.supabase) {
      res.status(503).json({
        error: 'Google OAuth credentials are not configured on the server yet.',
        code: 'PROVIDER_NOT_CONFIGURED',
      });
      return;
    }

    const { codeVerifier, codeChallenge } = generatePkcePair();
    const nonce = crypto.randomBytes(16).toString('hex');
    const state = signOAuthState(
      {
        provider: 'google',
        mode,
        userId,
        codeVerifier,
        nonce,
        redirectUri: requestedRedirect,
      },
      OAUTH_STATE_SECRET
    );

    if (envConfig.providers.google && process.env.GOOGLE_CLIENT_ID) {
      const url = buildGoogleAuthUrl({
        clientId: process.env.GOOGLE_CLIENT_ID,
        redirectUri: requestedRedirect,
        state,
        codeChallenge,
        nonce,
      });
      res.json({ url });
      return;
    }

    // Supabase Auth OAuth PKCE flow
    const flowId = crypto.randomBytes(24).toString('hex');
    supabasePkceFlows.set(flowId, {
      provider: 'google',
      mode,
      userId,
      codeVerifier,
      expiresAt: Date.now() + 10 * 60_000,
    });
    setSupabaseFlowCookie(res, flowId);
    const url = buildSupabaseOAuthUrl({
      supabaseUrl: process.env.SUPABASE_URL!,
      provider: 'google',
      redirectTo: requestedRedirect,
      codeChallenge,
    });
    res.json({ url });
  });

  // Apple Sign-In Authorization URL
  app.get('/api/auth/oauth/apple/url', (req: AuthedRequest, res) => {
    const mode = req.query.mode === 'link' ? 'link' : 'login';
    let userId: string | undefined;

    if (mode === 'link') {
      const header = req.headers.authorization;
      const claims = header?.startsWith('Bearer ')
        ? verifyJwt(header.slice(7).trim(), JWT_SECRET)
        : null;
      if (!claims) {
        res.status(401).json({ error: 'Authentication required to link Apple ID', code: 'SESSION_EXPIRED' });
        return;
      }
      userId = claims.sub;
    }

    const requestedRedirect = String(
      req.query.redirectUri || `${envConfig.appUrl}/auth/callback`
    );
    if (!isAllowedRedirectUri(requestedRedirect, getAllowedBaseUrls())) {
      res.status(400).json({ error: 'Invalid Redirect URL', code: 'INVALID_REDIRECT_URL' });
      return;
    }

    if (!envConfig.providers.apple && !envConfig.providers.supabase) {
      res.status(503).json({
        error: 'Apple Sign-In credentials are not configured on the server yet.',
        code: 'PROVIDER_NOT_CONFIGURED',
      });
      return;
    }

    const { codeVerifier } = generatePkcePair();
    const nonce = crypto.randomBytes(16).toString('hex');
    const state = signOAuthState(
      {
        provider: 'apple',
        mode,
        userId,
        codeVerifier,
        nonce,
        redirectUri: requestedRedirect,
      },
      OAUTH_STATE_SECRET
    );

    if (envConfig.providers.apple && process.env.APPLE_CLIENT_ID) {
      const url = buildAppleAuthUrl({
        clientId: process.env.APPLE_CLIENT_ID,
        redirectUri: requestedRedirect,
        state,
        nonce,
      });
      res.json({ url });
      return;
    }

    const { codeChallenge } = generatePkcePair();
    const flowId = crypto.randomBytes(24).toString('hex');
    supabasePkceFlows.set(flowId, {
      provider: 'apple',
      mode,
      userId,
      codeVerifier,
      expiresAt: Date.now() + 10 * 60_000,
    });
    setSupabaseFlowCookie(res, flowId);
    const url = buildSupabaseOAuthUrl({
      supabaseUrl: process.env.SUPABASE_URL!,
      provider: 'apple',
      redirectTo: requestedRedirect,
      codeChallenge,
    });
    res.json({ url });
  });

  // Shared OAuth Callback Handler (GET for Google/Supabase, POST form_post for Apple)
  const oauthCallbackHandler = async (req: Request, res: Response) => {
    const payload = req.method === 'POST' ? req.body : req.query;
    const rawError = payload?.error ? String(payload.error) : '';
    const rawErrorDesc = payload?.error_description ? String(payload.error_description) : '';
    const stateStr = payload?.state ? String(payload.state) : '';
    const code = payload?.code ? String(payload.code) : '';

    const parsedState = stateStr ? verifyOAuthState(stateStr, OAUTH_STATE_SECRET) : null;
    const flowCookie = readCookie(req, 'cc_oauth_flow');
    const supabaseFlow = flowCookie ? supabasePkceFlows.get(flowCookie) : undefined;
    if (flowCookie) {
      supabasePkceFlows.delete(flowCookie);
      res.setHeader('Set-Cookie', 'cc_oauth_flow=; Path=/auth/callback; HttpOnly; Max-Age=0');
    }

    const activeProvider: 'google' | 'apple' =
      parsedState?.provider ?? supabaseFlow?.provider ?? 'google';
    const activeMode: 'login' | 'link' =
      parsedState?.mode ?? supabaseFlow?.mode ?? 'login';
    const activeUserId: string | undefined =
      parsedState?.userId ?? supabaseFlow?.userId;

    if (rawError) {
      const errorCode = classifyOAuthCallbackError(rawError, rawErrorDesc, activeProvider);
      res.send(
        renderOAuthPopupResultHtml({
          ok: false,
          mode: activeMode,
          provider: activeProvider,
          errorCode,
        })
      );
      return;
    }

    const validDirectFlow = Boolean(parsedState && code);
    const validSupabaseFlow = Boolean(
      supabaseFlow && code && Date.now() <= supabaseFlow.expiresAt
    );

    if (!validDirectFlow && !validSupabaseFlow) {
      res.status(400).send(
        renderOAuthPopupResultHtml({
          ok: false,
          mode: activeMode,
          provider: activeProvider,
          errorCode: activeProvider === 'apple' ? 'APPLE_AUTH_FAILED' : 'GOOGLE_OAUTH_FAILED',
        })
      );
      return;
    }

    try {
      let providerSub = '';
      let email: string | null = null;
      let emailVerified = false;
      let fullName = '';
      let avatarUrl: string | null = null;
      let isPrivateRelay = false;

      if (validSupabaseFlow && supabaseFlow) {
        const supaIdentity = await exchangeSupabasePkceCode({
          code,
          codeVerifier: supabaseFlow.codeVerifier,
          providerHint: supabaseFlow.provider,
        });
        providerSub = supaIdentity.sub;
        email = supaIdentity.email;
        emailVerified = supaIdentity.emailVerified;
        fullName = supaIdentity.fullName;
        avatarUrl = supaIdentity.avatarUrl;
        isPrivateRelay = supaIdentity.isPrivateRelay;
      } else if (parsedState?.provider === 'google') {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: process.env.GOOGLE_CLIENT_ID || '',
            client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
            redirect_uri: parsedState.redirectUri,
            grant_type: 'authorization_code',
            code_verifier: parsedState.codeVerifier,
          }),
        });
        if (!tokenRes.ok) {
          throw new Error('GOOGLE_OAUTH_FAILED');
        }
        const tokenJson = (await tokenRes.json()) as { access_token?: string };
        const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
          headers: { Authorization: `Bearer ${tokenJson.access_token}` },
        });
        if (!userRes.ok) {
          throw new Error('GOOGLE_OAUTH_FAILED');
        }
        const userInfo = (await userRes.json()) as {
          sub?: string;
          email?: string;
          email_verified?: boolean;
          name?: string;
          picture?: string;
        };
        if (!userInfo.sub) throw new Error('GOOGLE_OAUTH_FAILED');
        providerSub = userInfo.sub;
        email = userInfo.email?.toLowerCase() ?? null;
        emailVerified = Boolean(userInfo.email_verified);
        fullName = userInfo.name?.trim() || '';
        avatarUrl = userInfo.picture ?? null;
      } else if (parsedState?.provider === 'apple') {
        // Sign in with Apple code exchange + one-time user JSON handling
        const appleKeyPem = readApplePrivateKeyPem();
        if (!appleKeyPem || !process.env.APPLE_TEAM_ID || !process.env.APPLE_KEY_ID || !process.env.APPLE_CLIENT_ID) {
          throw new Error('PROVIDER_NOT_CONFIGURED');
        }
        const clientSecret = createAppleClientSecret({
          teamId: process.env.APPLE_TEAM_ID,
          keyId: process.env.APPLE_KEY_ID,
          clientId: process.env.APPLE_CLIENT_ID,
          privateKeyPem: appleKeyPem,
        });
        const appleRes = await fetch('https://appleid.apple.com/auth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.APPLE_CLIENT_ID,
            client_secret: clientSecret,
            code,
            grant_type: 'authorization_code',
            redirect_uri: parsedState.redirectUri,
          }),
        });
        if (!appleRes.ok) {
          throw new Error('APPLE_AUTH_FAILED');
        }
        const appleTokens = (await appleRes.json()) as { id_token?: string };
        const idToken = appleTokens.id_token || String(payload?.id_token || '');
        const tokenParts = idToken.split('.');
        if (tokenParts.length !== 3) throw new Error('APPLE_AUTH_FAILED');
        const claims = JSON.parse(Buffer.from(tokenParts[1], 'base64url').toString('utf8')) as {
          sub?: string;
          email?: string;
          email_verified?: boolean | string;
          is_private_email?: boolean | string;
        };
        if (!claims.sub) throw new Error('APPLE_AUTH_FAILED');
        providerSub = claims.sub;
        email = claims.email?.toLowerCase() ?? null;
        emailVerified = claims.email_verified === true || claims.email_verified === 'true';
        isPrivateRelay =
          claims.is_private_email === true ||
          claims.is_private_email === 'true' ||
          isApplePrivateRelayEmail(email);

        if (payload?.user) {
          try {
            const appleUser = JSON.parse(String(payload.user)) as {
              name?: { firstName?: string; lastName?: string };
            };
            fullName = [appleUser.name?.firstName, appleUser.name?.lastName]
              .filter(Boolean)
              .join(' ')
              .trim();
          } catch {
            // Apple sends user object only on first authorization
          }
        }
      }

      const existingIdentity = store.db.identities.find(
        (id) => id.provider === activeProvider && id.providerUserId === providerSub
      );
      const existingByEmail = email
        ? store.db.users.find((u) => u.email?.toLowerCase() === email)
        : undefined;

      const decision = resolveOAuthIdentityAction({
        mode: activeMode,
        currentUserId: activeUserId,
        existingByProvider: existingIdentity
          ? {
              userId: existingIdentity.userId,
              provider: existingIdentity.provider,
              providerUserId: existingIdentity.providerUserId,
              email: existingIdentity.email,
            }
          : undefined,
        existingUserByEmail: existingByEmail
          ? { id: existingByEmail.id, emailVerified: existingByEmail.emailVerified }
          : undefined,
        emailVerifiedByProvider: emailVerified,
      });

      if (decision.action === 'error') {
        res.send(
          renderOAuthPopupResultHtml({
            ok: false,
            mode: activeMode,
            provider: activeProvider,
            errorCode: decision.code,
          })
        );
        return;
      }

      let targetUserId: string;
      if (decision.action === 'create_new_user') {
        const now = new Date().toISOString();
        const emailSeed = email ? email.split('@')[0] : activeProvider;
        const userId = crypto.randomUUID();
        const needsProfileCompletion = !fullName;
        const createdUser: StoredUser = {
          id: userId,
          username: generateUniqueUsername(emailSeed),
          fullName: fullName || (activeProvider === 'apple' ? 'Apple User' : 'Google User'),
          avatarUrl,
          email,
          emailVerified,
          phone: null,
          phoneVerified: false,
          passwordHash: null,
          role: 'user',
          presence: 'online',
          lastSeenAt: now,
          needsProfileCompletion,
          isSuspended: false,
          createdAt: now,
          updatedAt: now,
        };
        store.db.users.push(createdUser);
        store.getUserSettings(userId);
        targetUserId = userId;
      } else {
        targetUserId = decision.userId!;
        const existingUser = store.db.users.find((u) => u.id === targetUserId);
        if (existingUser) {
          if (fullName && existingUser.needsProfileCompletion) {
            existingUser.fullName = fullName;
          }
          if (avatarUrl && !existingUser.avatarUrl) {
            existingUser.avatarUrl = avatarUrl;
          }
        }
      }

      store.upsertIdentity({
        userId: targetUserId,
        provider: activeProvider,
        providerUserId: providerSub,
        email,
        isPrivateRelay,
      });

      const ticket = crypto.randomBytes(24).toString('hex');
      oauthTickets.set(ticket, {
        userId: targetUserId,
        mode: activeMode,
        provider: activeProvider,
        expiresAt: Date.now() + 60_000,
      });

      res.send(
        renderOAuthPopupResultHtml({
          ok: true,
          ticket,
          mode: activeMode,
          provider: activeProvider,
        })
      );
    } catch (err) {
      const codeName = (err instanceof Error ? err.message : '') as AuthErrorCode;
      const mapped: AuthErrorCode =
        codeName === 'PROVIDER_NOT_CONFIGURED' ||
        codeName === 'APPLE_AUTH_FAILED' ||
        codeName === 'GOOGLE_OAUTH_FAILED' ||
        codeName === 'INVALID_REDIRECT_URL' ||
        codeName === 'USER_CANCELLED_LOGIN'
          ? codeName
          : activeProvider === 'apple'
            ? 'APPLE_AUTH_FAILED'
            : 'GOOGLE_OAUTH_FAILED';
      res.status(500).send(
        renderOAuthPopupResultHtml({
          ok: false,
          mode: activeMode,
          provider: activeProvider,
          errorCode: mapped,
        })
      );
    }
  };

  app.get(['/auth/callback', '/auth/callback/'], oauthCallbackHandler);
  app.post(['/auth/callback', '/auth/callback/'], oauthCallbackHandler);

  // Exchange one-time OAuth callback ticket for Bearer JWT
  app.post('/api/auth/oauth/exchange', (req, res) => {
    const ticket = String(req.body?.ticket ?? '');
    const record = oauthTickets.get(ticket);
    oauthTickets.delete(ticket);
    if (!record || Date.now() > record.expiresAt) {
      res.status(401).json({ error: 'OAuth ticket expired', code: 'SESSION_EXPIRED' });
      return;
    }
    const user = store.db.users.find((u) => u.id === record.userId);
    if (!user || user.isSuspended) {
      res.status(403).json({ error: 'Account unavailable' });
      return;
    }
    const { token, deviceId } = registerDeviceAndIssueToken(
      user,
      'web',
      String(req.body?.deviceName ?? `Web Browser · ${record.provider}`)
    );
    res.json({
      token,
      deviceId,
      mode: record.mode,
      user: store.toPublicProfile(user, user.id, true),
      settings: store.getUserSettings(user.id),
    });
  });

  // Register New User (Email or Phone + Password)
  app.post('/api/auth/register', (req, res) => {
    const rl = checkRateLimit(
      rateBuckets,
      `reg:${getClientIp(req)}`,
      envConfig.rateLimitMaxRequests,
      envConfig.rateLimitWindowMs
    );
    if (!rl.allowed) {
      res.status(429).json({ error: `Rate limit exceeded. Retry in ${rl.retryAfterSec}s` });
      return;
    }
    if (!store.db.appSettings.allowRegistration) {
      res.status(403).json({ error: 'Registration is currently disabled by administrator' });
      return;
    }

    const username = String(req.body?.username ?? '').trim().toLowerCase();
    const fullName = String(req.body?.fullName ?? '').trim();
    const email = req.body?.email ? String(req.body.email).trim().toLowerCase() : null;
    const phone = req.body?.phone ? String(req.body.phone).trim() : null;
    const password = String(req.body?.password ?? '');

    if (!validateUsername(username)) {
      res.status(400).json({ error: 'Username must be 3-30 characters (letters, numbers, . or _)' });
      return;
    }
    if (fullName.length < 2 || fullName.length > 64) {
      res.status(400).json({ error: 'Full name must be between 2 and 64 characters' });
      return;
    }
    if (!email && !phone) {
      res.status(400).json({ error: 'Either a valid email or phone number is required' });
      return;
    }
    if (email && !validateEmail(email)) {
      res.status(400).json({ error: 'Invalid email address format' });
      return;
    }
    if (phone && !validatePhone(phone)) {
      res.status(400).json({ error: 'Phone number must be in E.164 format (e.g. +971501234567)' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    const emailConflict = email && store.db.users.some((u) => u.email?.toLowerCase() === email);
    if (emailConflict) {
      res.status(409).json({ error: 'Email already registered', code: 'EMAIL_ALREADY_REGISTERED' });
      return;
    }

    const exists = store.db.users.some(
      (u) => u.username.toLowerCase() === username || (phone && u.phone === phone)
    );
    if (exists) {
      res.status(409).json({ error: 'Username or phone already registered' });
      return;
    }

    const now = new Date().toISOString();
    const newUser: StoredUser = {
      id: crypto.randomUUID(),
      username,
      fullName,
      avatarUrl: null,
      email,
      emailVerified: false,
      phone,
      phoneVerified: false,
      passwordHash: hashPassword(password),
      role: 'user',
      presence: 'online',
      lastSeenAt: now,
      needsProfileCompletion: false,
      isSuspended: false,
      createdAt: now,
      updatedAt: now,
    };
    store.db.users.push(newUser);
    store.getUserSettings(newUser.id);
    if (email) {
      store.upsertIdentity({
        userId: newUser.id,
        provider: 'email',
        providerUserId: email,
        email,
      });
    }
    if (phone) {
      store.upsertIdentity({
        userId: newUser.id,
        provider: 'phone',
        providerUserId: phone,
        email: null,
      });
    }
    const { token, deviceId } = registerDeviceAndIssueToken(
      newUser,
      'web',
      String(req.body?.deviceName ?? 'Web Browser')
    );

    res.status(201).json({
      token,
      deviceId,
      user: store.toPublicProfile(newUser, newUser.id, true),
      settings: store.getUserSettings(newUser.id),
    });
  });

  // Email + Password Login
  app.post('/api/auth/login', (req, res) => {
    const rl = checkRateLimit(
      rateBuckets,
      `login:${getClientIp(req)}`,
      envConfig.rateLimitMaxRequests,
      envConfig.rateLimitWindowMs
    );
    if (!rl.allowed) {
      res.status(429).json({ error: `Too many login attempts. Retry in ${rl.retryAfterSec}s` });
      return;
    }
    const identifier = String(req.body?.identifier ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    if (!identifier || !password) {
      res.status(400).json({ error: 'Email/username and password are required' });
      return;
    }
    const user = store.db.users.find(
      (u) => u.email?.toLowerCase() === identifier || u.username.toLowerCase() === identifier
    );
    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    if (user.isSuspended) {
      res.status(403).json({ error: 'Account has been suspended' });
      return;
    }
    const { token, deviceId } = registerDeviceAndIssueToken(
      user,
      'web',
      String(req.body?.deviceName ?? 'Web Browser')
    );
    res.json({
      token,
      deviceId,
      user: store.toPublicProfile(user, user.id, true),
      settings: store.getUserSettings(user.id),
    });
  });

  // Refresh Session Token
  app.post('/api/auth/refresh', requireAuth, (req: AuthedRequest, res) => {
    const user = req.currentUser!;
    const token = signJwt(
      { sub: user.id, role: user.role, deviceId: req.auth?.deviceId },
      JWT_SECRET
    );
    res.json({ token });
  });

  // Sign out all active device sessions for current user
  app.post('/api/auth/logout-all', requireAuth, (req: AuthedRequest, res) => {
    const userId = req.currentUser!.id;
    for (const dev of store.db.devices) {
      if (dev.userId === userId) {
        dev.isRevoked = true;
      }
    }
    req.currentUser!.presence = 'offline';
    req.currentUser!.lastSeenAt = new Date().toISOString();
    store.save();
    res.json({ signedOutAll: true });
  });

  // Linked Auth Identities (View / Unlink with Last-Method Protection)
  app.get('/api/auth/identities', requireAuth, (req: AuthedRequest, res) => {
    const identities = store.getUserIdentities(req.currentUser!.id);
    res.json({ identities });
  });

  app.delete('/api/auth/identities/:provider', requireAuth, (req: AuthedRequest, res) => {
    const userId = req.currentUser!.id;
    const targetProvider = req.params.provider as AuthProvider;
    const identities = store.getUserIdentities(userId);
    const activeProviders = identities.map((i) => i.provider);

    if (!canUnlinkIdentity(activeProviders, targetProvider)) {
      res.status(400).json({
        error: 'Cannot unlink your only active sign-in method. Link another method first.',
        code: 'CANNOT_UNLINK_LAST_METHOD',
      });
      return;
    }

    store.db.identities = store.db.identities.filter(
      (i) => !(i.userId === userId && i.provider === targetProvider)
    );
    store.save();
    res.json({ identities: store.getUserIdentities(userId) });
  });

  // Request OTP (Phone Login / Email Verify / Password Reset)
  app.post('/api/auth/otp/request', (req, res) => {
    const rl = checkRateLimit(rateBuckets, `otp-req:${getClientIp(req)}`, 8, 60_000);
    if (!rl.allowed) {
      res.status(429).json({ error: `Too many OTP requests. Retry in ${rl.retryAfterSec}s` });
      return;
    }
    const target = String(req.body?.target ?? '').trim();
    const channel = String(req.body?.channel ?? 'phone') as 'phone' | 'email' | 'reset';
    if (channel === 'phone' && !validatePhone(target)) {
      res.status(400).json({ error: 'Enter a valid phone in E.164 format (+971...)' });
      return;
    }
    if ((channel === 'email' || channel === 'reset') && !validateEmail(target)) {
      res.status(400).json({ error: 'Enter a valid email address' });
      return;
    }

    const code = generateOtpCode();
    store.db.otpChallenges.push({
      id: crypto.randomUUID(),
      target: target.toLowerCase(),
      channel,
      codeHash: hashOtpCode(code, OTP_SECRET),
      attempts: 0,
      maxAttempts: 5,
      expiresAt: Date.now() + 5 * 60_000,
      consumedAt: null,
    });
    store.save();

    res.json({
      sent: true,
      expiresInSeconds: 300,
      previewCode: process.env.NODE_ENV === 'production' ? undefined : code,
    });
  });

  // Verify OTP (Phone Login, Email Verification, Password Reset, or Authenticated Linking)
  app.post('/api/auth/otp/verify', (req, res) => {
    const rl = checkRateLimit(rateBuckets, `otp-ver:${getClientIp(req)}`, 15, 60_000);
    if (!rl.allowed) {
      res.status(429).json({ error: `Too many attempts. Retry in ${rl.retryAfterSec}s` });
      return;
    }
    const target = String(req.body?.target ?? '').trim().toLowerCase();
    const channel = String(req.body?.channel ?? 'phone') as 'phone' | 'email' | 'reset';
    const code = String(req.body?.code ?? '').trim();
    if (!validateOtpCode(code)) {
      res.status(400).json({ error: 'OTP must be 6 digits' });
      return;
    }

    const challenge = [...store.db.otpChallenges]
      .reverse()
      .find((c) => c.target === target && c.channel === channel && c.consumedAt === null);

    if (!challenge || Date.now() > challenge.expiresAt) {
      res.status(400).json({ error: 'Verification code expired or not found' });
      return;
    }
    if (challenge.attempts >= challenge.maxAttempts) {
      res.status(429).json({ error: 'Maximum OTP attempts reached. Request a new code.' });
      return;
    }

    challenge.attempts += 1;
    if (!verifyOtpCode(code, challenge.codeHash, OTP_SECRET)) {
      store.save();
      res.status(401).json({ error: 'Incorrect verification code' });
      return;
    }

    challenge.consumedAt = Date.now();

    if (channel === 'reset') {
      const newPassword = String(req.body?.newPassword ?? '');
      if (newPassword.length < 8) {
        res.status(400).json({ error: 'New password must be at least 8 characters' });
        return;
      }
      const user = store.db.users.find((u) => u.email?.toLowerCase() === target);
      if (!user) {
        res.status(404).json({ error: 'Account not found' });
        return;
      }
      user.passwordHash = hashPassword(newPassword);
      store.save();
      res.json({ verified: true, passwordReset: true });
      return;
    }

    let user = store.db.users.find((u) =>
      channel === 'phone' ? u.phone === target : u.email?.toLowerCase() === target
    );

    if (!user && channel === 'phone') {
      const now = new Date().toISOString();
      const suffix = target.slice(-4);
      user = {
        id: crypto.randomUUID(),
        username: generateUniqueUsername(`user_${suffix}`),
        fullName: `CrossCall User ${suffix}`,
        avatarUrl: null,
        email: null,
        emailVerified: false,
        phone: target,
        phoneVerified: true,
        passwordHash: null,
        role: 'user',
        presence: 'online',
        lastSeenAt: now,
        needsProfileCompletion: true,
        isSuspended: false,
        createdAt: now,
        updatedAt: now,
      };
      store.db.users.push(user);
      store.getUserSettings(user.id);
    }

    if (!user) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    if (channel === 'phone') {
      user.phoneVerified = true;
      store.upsertIdentity({
        userId: user.id,
        provider: 'phone',
        providerUserId: target,
        email: null,
      });
    }
    if (channel === 'email') user.emailVerified = true;
    const { token, deviceId } = registerDeviceAndIssueToken(user, 'web', 'Web Browser');
    res.json({
      verified: true,
      token,
      deviceId,
      user: store.toPublicProfile(user, user.id, true),
      settings: store.getUserSettings(user.id),
    });
  });

  // Current User Profile & Complete Profile
  app.get('/api/me', requireAuth, (req: AuthedRequest, res) => {
    const user = req.currentUser!;
    res.json({
      user: store.toPublicProfile(user, user.id, true),
      settings: store.getUserSettings(user.id),
    });
  });

  app.patch('/api/me', requireAuth, (req: AuthedRequest, res) => {
    const user = req.currentUser!;
    const fullName =
      req.body?.fullName !== undefined ? String(req.body.fullName).trim() : user.fullName;
    const username =
      req.body?.username !== undefined
        ? String(req.body.username).trim().toLowerCase()
        : user.username;
    const email =
      req.body?.email !== undefined
        ? req.body.email
          ? String(req.body.email).trim().toLowerCase()
          : null
        : user.email;
    const phone =
      req.body?.phone !== undefined
        ? req.body.phone
          ? String(req.body.phone).trim()
          : null
        : user.phone;

    if (fullName.length < 2 || fullName.length > 64) {
      res.status(400).json({ error: 'Full name must be 2-64 characters' });
      return;
    }
    if (!validateUsername(username)) {
      res.status(400).json({ error: 'Invalid username format' });
      return;
    }
    if (email && !validateEmail(email)) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }
    if (phone && !validatePhone(phone)) {
      res.status(400).json({ error: 'Phone must use E.164 format (+971...)' });
      return;
    }
    const conflict = store.db.users.some(
      (u) =>
        u.id !== user.id &&
        (u.username.toLowerCase() === username ||
          (email && u.email?.toLowerCase() === email) ||
          (phone && u.phone === phone))
    );
    if (conflict) {
      res.status(409).json({ error: 'Username, email, or phone is already in use' });
      return;
    }

    user.fullName = fullName;
    user.username = username;
    if (email !== user.email) {
      user.email = email;
      user.emailVerified = false;
    }
    if (phone !== user.phone) {
      user.phone = phone;
      user.phoneVerified = false;
    }
    user.needsProfileCompletion = false;
    user.updatedAt = new Date().toISOString();
    store.save();
    res.json({ user: store.toPublicProfile(user, user.id, true) });
  });

  app.delete('/api/me', requireAuth, (req: AuthedRequest, res) => {
    const userId = req.currentUser!.id;
    store.db.users = store.db.users.filter((u) => u.id !== userId);
    store.db.identities = store.db.identities.filter((i) => i.userId !== userId);
    store.db.friendships = store.db.friendships.filter(
      (f) => f.requesterId !== userId && f.receiverId !== userId
    );
    store.db.devices = store.db.devices.filter((d) => d.userId !== userId);
    store.db.notifications = store.db.notifications.filter((n) => n.userId !== userId);
    delete store.db.settings[userId];
    store.save();
    res.json({ deleted: true });
  });

  // Settings
  app.put('/api/settings', requireAuth, (req: AuthedRequest, res) => {
    const userId = req.currentUser!.id;
    const current = store.getUserSettings(userId);
    const body = req.body ?? {};
    const updated = {
      language: body.language === 'ar' || body.language === 'en' ? body.language : current.language,
      theme: body.theme === 'light' || body.theme === 'dark' ? body.theme : current.theme,
      privacy: { ...current.privacy, ...(body.privacy ?? {}) },
      notifications: { ...current.notifications, ...(body.notifications ?? {}) },
      media: { ...current.media, ...(body.media ?? {}) },
    };
    store.db.settings[userId] = updated;
    store.save();
    res.json({ settings: updated });
  });

  // Devices
  app.get('/api/devices', requireAuth, (req: AuthedRequest, res) => {
    const userId = req.currentUser!.id;
    const currentDeviceId = req.auth?.deviceId;
    const devices = store.db.devices
      .filter((d) => d.userId === userId && !d.isRevoked)
      .map((d) => ({
        id: d.id,
        platform: d.platform,
        deviceName: d.deviceName,
        createdAt: d.createdAt,
        lastActiveAt: d.lastActiveAt,
        isCurrent: d.id === currentDeviceId,
      }));
    res.json({ devices });
  });

  app.delete('/api/devices/:id', requireAuth, (req: AuthedRequest, res) => {
    const device = store.db.devices.find(
      (d) => d.id === req.params.id && d.userId === req.currentUser!.id
    );
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }
    device.isRevoked = true;
    store.save();
    res.json({ revoked: true });
  });

  // Contacts, Search & Friend Requests
  app.get('/api/users/search', requireAuth, (req: AuthedRequest, res) => {
    const viewerId = req.currentUser!.id;
    const q = String(req.query.q ?? '').trim().toLowerCase();
    const results = store.db.users
      .filter((u) => {
        if (u.id === viewerId || u.isSuspended) return false;
        if (store.isBlockedBetween(viewerId, u.id)) return false;
        if (!q) return true;
        const matchName =
          u.username.toLowerCase().includes(q) || u.fullName.toLowerCase().includes(q);
        const allowPhone = store.getUserSettings(u.id).privacy.allowPhoneSearch;
        const matchPhone = allowPhone && u.phone?.toLowerCase().includes(q);
        return matchName || Boolean(matchPhone);
      })
      .map((u) => store.toPublicProfile(u, viewerId));
    res.json({ users: results });
  });

  app.get('/api/contacts', requireAuth, (req: AuthedRequest, res) => {
    const viewerId = req.currentUser!.id;
    const contacts = store.db.users
      .filter(
        (u) =>
          u.id !== viewerId &&
          !u.isSuspended &&
          !store.isBlockedBetween(viewerId, u.id) &&
          store.isContact(viewerId, u.id)
      )
      .map((u) => store.toPublicProfile(u, viewerId));

    const requests = store.db.friendships
      .filter((f) => f.receiverId === viewerId && f.status === 'pending')
      .map((f) => {
        const requester = store.db.users.find((u) => u.id === f.requesterId);
        return requester
          ? { friendshipId: f.id, user: store.toPublicProfile(requester, viewerId) }
          : null;
      })
      .filter(Boolean);

    res.json({ contacts, requests });
  });

  app.post('/api/contacts/request', requireAuth, (req: AuthedRequest, res) => {
    const requesterId = req.currentUser!.id;
    const receiverId = String(req.body?.userId ?? '');
    if (!receiverId || receiverId === requesterId) {
      res.status(400).json({ error: 'Invalid contact user' });
      return;
    }
    const receiver = store.db.users.find((u) => u.id === receiverId && !u.isSuspended);
    if (!receiver || store.isBlockedBetween(requesterId, receiverId)) {
      res.status(404).json({ error: 'User not available' });
      return;
    }
    const existing = store.db.friendships.find(
      (f) =>
        (f.requesterId === requesterId && f.receiverId === receiverId) ||
        (f.requesterId === receiverId && f.receiverId === requesterId)
    );
    if (existing) {
      if (existing.status === 'declined') {
        existing.status = 'pending';
        existing.requesterId = requesterId;
        existing.receiverId = receiverId;
        store.save();
      }
      res.json({ status: existing.status });
      return;
    }
    store.db.friendships.push({
      id: crypto.randomUUID(),
      requesterId,
      receiverId,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
    store.db.notifications.unshift({
      id: crypto.randomUUID(),
      userId: receiverId,
      title: 'New Contact Request',
      body: `${req.currentUser!.fullName} (@${req.currentUser!.username}) sent a contact request.`,
      type: 'friend_request',
      isRead: false,
      createdAt: new Date().toISOString(),
    });
    store.save();
    res.status(201).json({ status: 'pending' });
  });

  app.post('/api/contacts/respond', requireAuth, (req: AuthedRequest, res) => {
    const viewerId = req.currentUser!.id;
    const requesterId = String(req.body?.userId ?? '');
    const action = req.body?.action === 'accept' ? 'accepted' : 'declined';
    const f = store.db.friendships.find(
      (fr) => fr.requesterId === requesterId && fr.receiverId === viewerId && fr.status === 'pending'
    );
    if (!f) {
      res.status(404).json({ error: 'Pending request not found' });
      return;
    }
    f.status = action;
    store.save();
    res.json({ status: action });
  });

  app.delete('/api/contacts/:userId', requireAuth, (req: AuthedRequest, res) => {
    const viewerId = req.currentUser!.id;
    const otherId = req.params.userId;
    store.db.friendships = store.db.friendships.filter(
      (f) =>
        !(
          (f.requesterId === viewerId && f.receiverId === otherId) ||
          (f.requesterId === otherId && f.receiverId === viewerId)
        )
    );
    store.save();
    res.json({ removed: true });
  });

  // Blocked Users & Reports
  app.get('/api/blocks', requireAuth, (req: AuthedRequest, res) => {
    const viewerId = req.currentUser!.id;
    const blocked = store.db.blocks
      .filter((b) => b.userId === viewerId)
      .map((b) => store.db.users.find((u) => u.id === b.blockedUserId))
      .filter((u): u is StoredUser => Boolean(u))
      .map((u) => store.toPublicProfile(u, viewerId));
    res.json({ blocked });
  });

  app.post('/api/blocks', requireAuth, (req: AuthedRequest, res) => {
    const viewerId = req.currentUser!.id;
    const targetId = String(req.body?.userId ?? '');
    if (!targetId || targetId === viewerId) {
      res.status(400).json({ error: 'Invalid user to block' });
      return;
    }
    if (!store.db.blocks.some((b) => b.userId === viewerId && b.blockedUserId === targetId)) {
      store.db.blocks.push({ userId: viewerId, blockedUserId: targetId, createdAt: new Date().toISOString() });
      store.db.friendships = store.db.friendships.filter(
        (f) =>
          !(
            (f.requesterId === viewerId && f.receiverId === targetId) ||
            (f.requesterId === targetId && f.receiverId === viewerId)
          )
      );
      store.save();
    }
    res.json({ blocked: true });
  });

  app.delete('/api/blocks/:userId', requireAuth, (req: AuthedRequest, res) => {
    const viewerId = req.currentUser!.id;
    store.db.blocks = store.db.blocks.filter(
      (b) => !(b.userId === viewerId && b.blockedUserId === req.params.userId)
    );
    store.save();
    res.json({ unblocked: true });
  });

  app.post('/api/reports', requireAuth, (req: AuthedRequest, res) => {
    const targetId = String(req.body?.userId ?? '');
    const reason = String(req.body?.reason ?? '').trim();
    const target = store.db.users.find((u) => u.id === targetId);
    if (!target || reason.length < 4) {
      res.status(400).json({ error: 'Provide a valid user and reason' });
      return;
    }
    store.db.reports.unshift({
      id: crypto.randomUUID(),
      reporterUsername: req.currentUser!.username,
      reportedUserId: target.id,
      reportedUsername: target.username,
      reason: reason.slice(0, 300),
      status: 'open',
      createdAt: new Date().toISOString(),
    });
    store.save();
    res.status(201).json({ submitted: true });
  });

  // Call History & Room Helpers
  app.get('/api/calls/history', requireAuth, (req: AuthedRequest, res) => {
    const userId = req.currentUser!.id;
    const history = store.db.calls.filter(
      (c) =>
        c.callerId === userId ||
        c.calleeId === userId ||
        c.participants.some((p) => p.userId === userId)
    );
    res.json({ calls: history });
  });

  app.post('/api/rooms', requireAuth, (req: AuthedRequest, res) => {
    const slug = sanitizeRoomSlug(String(req.body?.title ?? `meet-${crypto.randomUUID().slice(0, 6)}`));
    const roomId = `${slug}-${crypto.randomInt(100, 999)}`;
    res.status(201).json({ roomId, title: String(req.body?.title ?? 'CrossCall Meeting').slice(0, 80) });
  });

  // Notifications
  app.get('/api/notifications', requireAuth, (req: AuthedRequest, res) => {
    const items = store.db.notifications.filter((n) => n.userId === req.currentUser!.id);
    res.json({ notifications: items });
  });

  app.post('/api/notifications/read-all', requireAuth, (req: AuthedRequest, res) => {
    for (const n of store.db.notifications) {
      if (n.userId === req.currentUser!.id) n.isRead = true;
    }
    store.save();
    res.json({ updated: true });
  });

  // Admin Bootstrap & Protected Console Routes
  app.get('/api/admin/bootstrap-status', (_req, res) => {
    const envConfigured = Boolean(process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0);
    res.json({
      envConfigured,
      needsClaim: !envConfigured && !store.db.adminCredentialHash,
    });
  });

  app.post('/api/admin/claim', (req, res) => {
    const envPasscode = process.env.ADMIN_PASSCODE?.trim();
    if (envPasscode) {
      res.status(409).json({ error: 'Admin passcode is configured via server environment' });
      return;
    }
    if (store.db.adminCredentialHash) {
      res.status(409).json({ error: 'Admin passcode already claimed' });
      return;
    }
    const passcode = String(req.body?.passcode ?? '');
    if (passcode.length < 8) {
      res.status(400).json({ error: 'Admin passcode must be at least 8 characters' });
      return;
    }
    store.db.adminCredentialHash = hashPassword(passcode);
    store.save();
    const token = signJwt({ sub: 'crosscall-admin', role: 'admin' }, JWT_SECRET, 60 * 60 * 4);
    res.status(201).json({ token });
  });

  app.post('/api/admin/login', (req, res) => {
    const rl = checkRateLimit(rateBuckets, `admin-login:${getClientIp(req)}`, 10, 60_000);
    if (!rl.allowed) {
      res.status(429).json({ error: `Too many admin login attempts. Retry in ${rl.retryAfterSec}s` });
      return;
    }
    const passcode = String(req.body?.passcode ?? '');
    const envPasscode = process.env.ADMIN_PASSCODE?.trim();

    if (envPasscode) {
      const a = Buffer.from(passcode);
      const b = Buffer.from(envPasscode);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        res.status(401).json({ error: 'Invalid admin passcode' });
        return;
      }
    } else if (store.db.adminCredentialHash) {
      if (!verifyPassword(passcode, store.db.adminCredentialHash)) {
        res.status(401).json({ error: 'Invalid admin passcode' });
        return;
      }
    } else {
      res.status(400).json({ error: 'Admin setup required first' });
      return;
    }

    const token = signJwt({ sub: 'crosscall-admin', role: 'admin' }, JWT_SECRET, 60 * 60 * 4);
    res.json({ token });
  });

  app.get('/api/admin/overview', requireAdmin, (_req, res) => {
    res.json({
      totalUsers: store.db.users.length,
      activeConnections: wsHub.getActiveConnectionCount(),
      totalCalls: store.db.calls.length,
      ongoingCalls: wsHub.getOngoingCallsCount(),
      livekitStatus: process.env.LIVEKIT_URL ? 'ready' : 'signaling_fallback',
      databaseStatus: 'connected',
      uptimeSeconds: Math.floor((Date.now() - BOOT_TIME) / 1000),
      openReports: store.db.reports.filter((r) => r.status === 'open').length,
      appSettings: store.db.appSettings,
      reports: store.db.reports,
      users: store.db.users.map((u) => store.toPublicProfile(u, u.id, true)),
    });
  });

  app.post('/api/admin/users/:id/suspend', requireAdmin, (req, res) => {
    const target = store.db.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    target.isSuspended = Boolean(req.body?.suspended);
    if (target.isSuspended) target.presence = 'offline';
    store.save();
    res.json({ id: target.id, isSuspended: target.isSuspended });
  });

  app.post('/api/admin/reports/:id', requireAdmin, (req, res) => {
    const report = store.db.reports.find((r) => r.id === req.params.id);
    if (!report) {
      res.status(404).json({ error: 'Report not found' });
      return;
    }
    const action = req.body?.action === 'actioned' ? 'actioned' : 'dismissed';
    report.status = action;
    if (action === 'actioned') {
      const target = store.db.users.find((u) => u.id === report.reportedUserId);
      if (target) target.isSuspended = true;
    }
    store.save();
    res.json({ report });
  });

  app.put('/api/admin/app-settings', requireAdmin, (req, res) => {
    const b = req.body ?? {};
    store.db.appSettings = {
      allowRegistration:
        typeof b.allowRegistration === 'boolean'
          ? b.allowRegistration
          : store.db.appSettings.allowRegistration,
      maxGroupParticipants:
        typeof b.maxGroupParticipants === 'number'
          ? Math.max(2, Math.min(100, b.maxGroupParticipants))
          : store.db.appSettings.maxGroupParticipants,
      maintenanceMode:
        typeof b.maintenanceMode === 'boolean'
          ? b.maintenanceMode
          : store.db.appSettings.maintenanceMode,
    };
    store.save();
    res.json({ appSettings: store.db.appSettings });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`CrossCall server running on http://0.0.0.0:${PORT}`);
    if (envConfig.warnings.length > 0) {
      console.log(`OAuth config notice: ${envConfig.warnings.join(' | ')}`);
    }
  });
}

startServer().catch((err) => {
  console.error('Failed to start CrossCall server:', err);
  process.exit(1);
});
