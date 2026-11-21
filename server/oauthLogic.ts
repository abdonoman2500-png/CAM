import crypto from 'node:crypto';
import type { AuthErrorCode, AuthProvider } from '../src/types/crosscall';

export interface OAuthStatePayload {
  provider: 'google' | 'apple';
  mode: 'login' | 'link';
  userId?: string;
  codeVerifier: string;
  nonce: string;
  redirectUri: string;
  exp: number;
}

export interface StoredIdentityRecord {
  userId: string;
  provider: AuthProvider;
  providerUserId: string;
  email: string | null;
}

export interface IdentityLinkDecision {
  action: 'login_existing' | 'create_new_user' | 'link_to_current_user' | 'error';
  userId?: string;
  code?: AuthErrorCode;
}

export function generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  return { codeVerifier, codeChallenge };
}

export function signOAuthState(
  payload: Omit<OAuthStatePayload, 'exp'>,
  secret: string,
  ttlMs = 10 * 60 * 1000
): string {
  const fullPayload: OAuthStatePayload = { ...payload, exp: Date.now() + ttlMs };
  const encoded = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyOAuthState(state: string, secret: string): OAuthStatePayload | null {
  const dot = state.indexOf('.');
  if (dot <= 0) return null;
  const encoded = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expectedSig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as OAuthStatePayload;
    if (!parsed.exp || Date.now() > parsed.exp) return null;
    if (parsed.provider !== 'google' && parsed.provider !== 'apple') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isAllowedRedirectUri(redirectUri: string, allowedBaseUrls: string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(redirectUri);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return false;
  }
  const normalizedPath = parsed.pathname.replace(/\/+$/, '');
  if (normalizedPath !== '/auth/callback') {
    return false;
  }
  const candidateOrigin = parsed.origin.toLowerCase();
  return allowedBaseUrls.some((base) => {
    try {
      return new URL(base).origin.toLowerCase() === candidateOrigin;
    } catch {
      return false;
    }
  });
}

export function classifyOAuthCallbackError(
  rawError: string | undefined,
  rawDescription: string | undefined,
  provider: 'google' | 'apple'
): AuthErrorCode {
  const err = (rawError || '').toLowerCase();
  const desc = (rawDescription || '').toLowerCase();

  if (
    err === 'access_denied' ||
    err === 'user_cancelled_authorize' ||
    err === 'user_cancelled' ||
    err === 'cancelled' ||
    desc.includes('cancel') ||
    desc.includes('denied')
  ) {
    return 'USER_CANCELLED_LOGIN';
  }

  if (
    err === 'redirect_uri_mismatch' ||
    err === 'invalid_redirect_uri' ||
    desc.includes('redirect_uri') ||
    desc.includes('redirect uri') ||
    desc.includes('redirect url')
  ) {
    return 'INVALID_REDIRECT_URL';
  }

  return provider === 'apple' ? 'APPLE_AUTH_FAILED' : 'GOOGLE_OAUTH_FAILED';
}

export function buildGoogleAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  nonce: string;
}): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', params.state);
  url.searchParams.set('nonce', params.nonce);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

export function buildAppleAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
}): string {
  const url = new URL('https://appleid.apple.com/auth/authorize');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('response_mode', 'form_post');
  url.searchParams.set('scope', 'name email');
  url.searchParams.set('state', params.state);
  url.searchParams.set('nonce', params.nonce);
  return url.toString();
}

export function buildSupabaseOAuthUrl(params: {
  supabaseUrl: string;
  provider: 'google' | 'apple';
  redirectTo: string;
  codeChallenge: string;
}): string {
  const base = params.supabaseUrl.replace(/\/+$/, '');
  const url = new URL(`${base}/auth/v1/authorize`);
  url.searchParams.set('provider', params.provider);
  url.searchParams.set('redirect_to', params.redirectTo);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 's256');
  if (params.provider === 'google') {
    url.searchParams.set('scopes', 'openid email profile');
  }
  return url.toString();
}

export function isApplePrivateRelayEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase().endsWith('@privaterelay.appleid.com');
}

/**
 * Security-critical account linking rule:
 * - Never auto-merge an external OAuth login into an existing account by email similarity alone.
 * - Linking requires an explicitly authenticated session (`mode === 'link'` + `currentUserId`).
 */
export function resolveOAuthIdentityAction(input: {
  mode: 'login' | 'link';
  currentUserId?: string;
  existingByProvider?: StoredIdentityRecord;
  existingUserByEmail?: { id: string; emailVerified: boolean };
  emailVerifiedByProvider: boolean;
}): IdentityLinkDecision {
  const { mode, currentUserId, existingByProvider, existingUserByEmail } = input;

  if (mode === 'link') {
    if (!currentUserId) {
      return { action: 'error', code: 'SESSION_EXPIRED' };
    }
    if (existingByProvider && existingByProvider.userId !== currentUserId) {
      return { action: 'error', code: 'EMAIL_ALREADY_REGISTERED' };
    }
    if (existingUserByEmail && existingUserByEmail.id !== currentUserId) {
      return { action: 'error', code: 'EMAIL_ALREADY_REGISTERED' };
    }
    return { action: 'link_to_current_user', userId: currentUserId };
  }

  if (existingByProvider) {
    return { action: 'login_existing', userId: existingByProvider.userId };
  }

  if (existingUserByEmail) {
    return { action: 'error', code: 'ACCOUNT_LINKING_REQUIRED' };
  }

  return { action: 'create_new_user' };
}

export function canUnlinkIdentity(
  activeProviders: AuthProvider[],
  targetProvider: AuthProvider
): boolean {
  if (!activeProviders.includes(targetProvider)) return false;
  return activeProviders.filter((p) => p !== targetProvider).length >= 1;
}

export function createAppleClientSecret(params: {
  teamId: string;
  keyId: string;
  clientId: string;
  privateKeyPem: string;
  ttlSeconds?: number;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.min(params.ttlSeconds ?? 300, 15_777_000);
  const header = Buffer.from(
    JSON.stringify({ alg: 'ES256', kid: params.keyId, typ: 'JWT' })
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: params.teamId,
      iat: now,
      exp: now + ttl,
      aud: 'https://appleid.apple.com',
      sub: params.clientId,
    })
  ).toString('base64url');
  const signingInput = `${header}.${payload}`;
  const sig = crypto.sign('sha256', Buffer.from(signingInput), {
    key: params.privateKeyPem,
    dsaEncoding: 'ieee-p1363',
  });
  return `${signingInput}.${sig.toString('base64url')}`;
}
