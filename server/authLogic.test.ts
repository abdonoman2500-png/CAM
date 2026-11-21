import crypto from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOAuthRedirectUri,
  canUnlinkAuthMethod,
  checkRateLimit,
  deriveCodeChallengeS256,
  generateCodeVerifier,
  generateOpaqueToken,
  generateOtpCode,
  hashOpaqueToken,
  hashOtpCode,
  hashPassword,
  signAppleClientSecret,
  signJwt,
  validatePasswordStrength,
  verifyAppleIdTokenWithJwks,
  verifyJwt,
  verifyOpaqueToken,
  verifyOtpCode,
  verifyPassword,
  verifyPkceChallenge,
  type AppleJwk,
  type RateLimitEntry,
} from './authLogic';

test('scrypt password hashing verifies matching password and rejects wrong password', () => {
  const hash = hashPassword('StrongPass!2026');
  assert.equal(verifyPassword('StrongPass!2026', hash), true);
  assert.equal(verifyPassword('WrongPass', hash), false);
  assert.equal(verifyPassword('StrongPass!2026', 'invalid'), false);
});

test('validatePasswordStrength enforces minimum 8 chars, upper, lower, digit, and symbol', () => {
  assert.equal(validatePasswordStrength('Strong!2026').valid, true);
  assert.equal(validatePasswordStrength('Short!1').reasons.includes('MIN_LENGTH'), true);
  assert.equal(validatePasswordStrength('noupper!2026').reasons.includes('UPPERCASE'), true);
  assert.equal(validatePasswordStrength('NOLOWER!2026').reasons.includes('LOWERCASE'), true);
  assert.equal(validatePasswordStrength('NoDigits!Aa').reasons.includes('DIGIT'), true);
  assert.equal(validatePasswordStrength('NoSymbol2026').reasons.includes('SYMBOL'), true);
});

test('JWT signing verifies valid tokens and rejects tampered or expired tokens', () => {
  const secret = 'test-secret-key-at-least-32-bytes-long';
  const now = 1_700_000_000_000;
  const token = signJwt({ sub: 'user-1', role: 'user', deviceId: 'dev-1' }, secret, 60, now);

  const decoded = verifyJwt(token, secret, now + 10_000);
  assert.equal(decoded?.sub, 'user-1');
  assert.equal(decoded?.role, 'user');

  // Expired
  assert.equal(verifyJwt(token, secret, now + 61_000), null);

  // Tampered payload
  const parts = token.split('.');
  const tampered = `${parts[0]}.${parts[1]}x.${parts[2]}`;
  assert.equal(verifyJwt(tampered, secret, now + 10_000), null);
});

test('OTP and opaque token HMAC verification reject invalid or mismatched values', () => {
  const secret = 'hmac-secret-test';
  const code = generateOtpCode();
  assert.match(code, /^\d{6}$/);
  const hashedCode = hashOtpCode(code, secret);
  assert.equal(verifyOtpCode(code, hashedCode, secret), true);
  assert.equal(verifyOtpCode('000000', hashedCode, secret), code === '000000');

  const rawToken = generateOpaqueToken(24);
  const hashedToken = hashOpaqueToken(rawToken, secret);
  assert.equal(verifyOpaqueToken(rawToken, hashedToken, secret), true);
  assert.equal(verifyOpaqueToken(`${rawToken}x`, hashedToken, secret), false);
});

test('PKCE code verifier and S256 challenge match RFC 7636 and reject tampering', () => {
  const verifier = generateCodeVerifier();
  const challenge = deriveCodeChallengeS256(verifier);
  assert.equal(verifyPkceChallenge(verifier, challenge), true);
  assert.equal(verifyPkceChallenge(`${verifier}tampered`, challenge), false);
});

test('buildOAuthRedirectUri uses APP_URL when configured and requestOrigin fallback otherwise', () => {
  assert.equal(
    buildOAuthRedirectUri('https://ais-dev-demo.run.app/', 'http://localhost:3000', 'google'),
    'https://ais-dev-demo.run.app/api/auth/oauth/google/callback'
  );
  assert.equal(
    buildOAuthRedirectUri('MY_APP_URL', 'http://localhost:3000', 'apple'),
    'http://localhost:3000/api/auth/oauth/apple/callback'
  );
});

test('canUnlinkAuthMethod prevents removing the final remaining authentication method', () => {
  assert.equal(canUnlinkAuthMethod(false, 1), false); // Only Google linked
  assert.equal(canUnlinkAuthMethod(true, 0), false);  // Only Email/Password
  assert.equal(canUnlinkAuthMethod(true, 1), true);   // Email/Password + Google
  assert.equal(canUnlinkAuthMethod(false, 2), true);  // Google + Apple
});

test('Apple ID token RS256 JWKS verification and ES256 client_secret signing succeed with valid keys', () => {
  const { privateKey: rsaPriv, publicKey: rsaPub } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const jwk = rsaPub.export({ format: 'jwk' }) as AppleJwk;
  jwk.kid = 'apple-key-1';

  const nowMs = 1_750_000_000_000;
  const nowSec = Math.floor(nowMs / 1000);
  const b64 = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  const header = b64({ alg: 'RS256', kid: 'apple-key-1', typ: 'JWT' });
  const payload = b64({
    iss: 'https://appleid.apple.com',
    aud: 'com.crosscall.web',
    iat: nowSec,
    exp: nowSec + 600,
    sub: '001234.abcdef567890.0123',
    email: 'relay@privaterelay.appleid.com',
    is_private_email: true,
    nonce: 'nonce-123',
  });
  const sig = crypto
    .sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), rsaPriv)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const idToken = `${header}.${payload}.${sig}`;

  const verified = verifyAppleIdTokenWithJwks(
    idToken,
    [jwk],
    'com.crosscall.web',
    'nonce-123',
    nowMs
  );
  assert.equal(verified.sub, '001234.abcdef567890.0123');
  assert.equal(verified.is_private_email, true);

  assert.throws(() =>
    verifyAppleIdTokenWithJwks(idToken, [jwk], 'wrong.audience', 'nonce-123', nowMs)
  );
  assert.throws(() =>
    verifyAppleIdTokenWithJwks(idToken, [jwk], 'com.crosscall.web', 'wrong-nonce', nowMs)
  );

  // Also test ES256 client_secret signing
  const { privateKey: ecPriv } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pem = ecPriv.export({ type: 'pkcs8', format: 'pem' }).toString();
  const clientSecret = signAppleClientSecret({
    teamId: 'TEAM123456',
    clientId: 'com.crosscall.web',
    keyId: 'KEY1234567',
    privateKeyPem: pem,
    nowMs,
  });
  assert.equal(clientSecret.split('.').length, 3);
});

test('checkRateLimit enforces maxHits per window and resets after window expires', () => {
  const buckets = new Map<string, RateLimitEntry>();
  const t0 = 1_000_000;
  assert.equal(checkRateLimit(buckets, 'ip:otp', 2, 60_000, t0).allowed, true);
  assert.equal(checkRateLimit(buckets, 'ip:otp', 2, 60_000, t0 + 100).allowed, true);
  const blocked = checkRateLimit(buckets, 'ip:otp', 2, 60_000, t0 + 200);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec >= 59);

  // Window resets
  assert.equal(checkRateLimit(buckets, 'ip:otp', 2, 60_000, t0 + 60_001).allowed, true);
});
