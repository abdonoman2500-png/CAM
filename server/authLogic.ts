import crypto from 'node:crypto';

export interface JwtClaims {
  sub: string;
  role: 'user' | 'moderator' | 'admin';
  deviceId?: string;
  iat: number;
  exp: number;
}

export type PasswordStrengthReason =
  | 'MIN_LENGTH'
  | 'LOWERCASE'
  | 'UPPERCASE'
  | 'DIGIT'
  | 'SYMBOL';

export interface PasswordStrengthResult {
  valid: boolean;
  reasons: PasswordStrengthReason[];
  score: number; // 0..5
}

export function validatePasswordStrength(password: string): PasswordStrengthResult {
  const reasons: PasswordStrengthReason[] = [];
  if (password.length < 8) reasons.push('MIN_LENGTH');
  if (!/[a-z]/.test(password)) reasons.push('LOWERCASE');
  if (!/[A-Z]/.test(password)) reasons.push('UPPERCASE');
  if (!/\d/.test(password)) reasons.push('DIGIT');
  if (!/[^A-Za-z0-9]/.test(password)) reasons.push('SYMBOL');
  return {
    valid: reasons.length === 0,
    reasons,
    score: 5 - reasons.length,
  };
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

export function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function base64UrlDecode(input: string): Buffer {
  const padLen = (4 - (input.length % 4)) % 4;
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen);
  return Buffer.from(padded, 'base64');
}

export function signJwt(
  payload: Omit<JwtClaims, 'iat' | 'exp'>,
  secret: string,
  ttlSeconds = 60 * 15,
  nowMs = Date.now()
): string {
  const iat = Math.floor(nowMs / 1000);
  const claims: JwtClaims = {
    ...payload,
    iat,
    exp: iat + ttlSeconds,
  };
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(claims));
  const sig = base64UrlEncode(
    crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest()
  );
  return `${header}.${body}.${sig}`;
}

export function verifyJwt(token: string, secret: string, nowMs = Date.now()): JwtClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  if (!header || !body || !sig) return null;
  const expectedSig = base64UrlEncode(
    crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest()
  );
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(base64UrlDecode(body).toString('utf8')) as JwtClaims;
    if (!parsed.sub || typeof parsed.exp !== 'number') return null;
    if (Math.floor(nowMs / 1000) >= parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function generateOpaqueToken(byteLength = 32): string {
  return base64UrlEncode(crypto.randomBytes(byteLength));
}

export function hashOpaqueToken(token: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

export function verifyOpaqueToken(token: string, storedHash: string, secret: string): boolean {
  const computed = Buffer.from(hashOpaqueToken(token, secret), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  if (computed.length !== stored.length) return false;
  return crypto.timingSafeEqual(computed, stored);
}

export function generateOtpCode(): string {
  return String(crypto.randomInt(100000, 999999));
}

export function hashOtpCode(code: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(code.trim()).digest('hex');
}

export function verifyOtpCode(code: string, storedHash: string, secret: string): boolean {
  const computed = Buffer.from(hashOtpCode(code, secret), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  if (computed.length !== stored.length) return false;
  return crypto.timingSafeEqual(computed, stored);
}

// PKCE (RFC 7636) helpers for Google & Apple OAuth 2.0
export function generateCodeVerifier(): string {
  return base64UrlEncode(crypto.randomBytes(32));
}

export function deriveCodeChallengeS256(verifier: string): string {
  return base64UrlEncode(crypto.createHash('sha256').update(verifier).digest());
}

export function verifyPkceChallenge(verifier: string, expectedChallenge: string): boolean {
  const computed = Buffer.from(deriveCodeChallengeS256(verifier));
  const expected = Buffer.from(expectedChallenge);
  if (computed.length !== expected.length) return false;
  return crypto.timingSafeEqual(computed, expected);
}

export function buildOAuthRedirectUri(
  appUrlEnv: string | undefined,
  requestOrigin: string,
  provider: 'google' | 'apple'
): string {
  const envUrl = appUrlEnv?.trim();
  const baseCandidate =
    envUrl && envUrl !== 'MY_APP_URL' && /^https?:\/\//i.test(envUrl) ? envUrl : requestOrigin;
  const normalized = new URL(baseCandidate);
  if (normalized.protocol !== 'http:' && normalized.protocol !== 'https:') {
    throw new Error('Invalid OAuth base URL protocol');
  }
  const origin = normalized.origin;
  return `${origin}/api/auth/oauth/${provider}/callback`;
}

export function canUnlinkAuthMethod(
  hasVerifiedPassword: boolean,
  linkedOAuthCount: number
): boolean {
  const totalMethods = (hasVerifiedPassword ? 1 : 0) + linkedOAuthCount;
  return totalMethods > 1;
}

export interface AppleIdTokenClaims {
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  sub: string;
  email?: string;
  email_verified?: boolean | 'true' | 'false';
  is_private_email?: boolean | 'true' | 'false';
  nonce?: string;
}

export interface AppleJwk extends crypto.JsonWebKey {
  kid: string;
  kty: string;
  alg?: string;
  use?: string;
}

export function verifyAppleIdTokenWithJwks(
  idToken: string,
  jwks: AppleJwk[],
  expectedAudience: string,
  expectedNonce?: string,
  nowMs = Date.now()
): AppleIdTokenClaims {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed Apple ID token');
  }
  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(base64UrlDecode(headerB64).toString('utf8')) as {
    kid?: string;
    alg?: string;
  };
  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported Apple ID token header');
  }
  const jwk = jwks.find((k) => k.kid === header.kid);
  if (!jwk) {
    throw new Error('Matching Apple public key not found');
  }

  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const isValidSig = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${headerB64}.${payloadB64}`),
    publicKey,
    base64UrlDecode(sigB64)
  );
  if (!isValidSig) {
    throw new Error('Invalid Apple ID token signature');
  }

  const claims = JSON.parse(base64UrlDecode(payloadB64).toString('utf8')) as AppleIdTokenClaims;
  const nowSec = Math.floor(nowMs / 1000);
  if (claims.iss !== 'https://appleid.apple.com') {
    throw new Error('Invalid Apple token issuer');
  }
  if (claims.aud !== expectedAudience) {
    throw new Error('Invalid Apple token audience');
  }
  if (typeof claims.exp !== 'number' || nowSec >= claims.exp) {
    throw new Error('Apple ID token expired');
  }
  if (!claims.sub) {
    throw new Error('Missing Apple subject identifier');
  }
  if (expectedNonce && claims.nonce !== expectedNonce) {
    throw new Error('Apple ID token nonce mismatch');
  }
  return claims;
}

export function signAppleClientSecret(params: {
  teamId: string;
  clientId: string;
  keyId: string;
  privateKeyPem: string;
  nowMs?: number;
}): string {
  const nowSec = Math.floor((params.nowMs ?? Date.now()) / 1000);
  const header = base64UrlEncode(
    JSON.stringify({ alg: 'ES256', kid: params.keyId, typ: 'JWT' })
  );
  const payload = base64UrlEncode(
    JSON.stringify({
      iss: params.teamId,
      iat: nowSec,
      exp: nowSec + 300,
      aud: 'https://appleid.apple.com',
      sub: params.clientId,
    })
  );
  const signingInput = `${header}.${payload}`;
  const normalizedPem = params.privateKeyPem.replace(/\\n/g, '\n');
  const signature = crypto.sign('sha256', Buffer.from(signingInput), {
    key: normalizedPem,
    dsaEncoding: 'ieee-p1363',
  });
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

export interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export function checkRateLimit(
  buckets: Map<string, RateLimitEntry>,
  key: string,
  maxHits: number,
  windowMs: number,
  nowMs = Date.now()
): { allowed: boolean; retryAfterSec: number } {
  const current = buckets.get(key);
  if (!current || nowMs >= current.resetAt) {
    buckets.set(key, { count: 1, resetAt: nowMs + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (current.count >= maxHits) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((current.resetAt - nowMs) / 1000)),
    };
  }
  current.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}
