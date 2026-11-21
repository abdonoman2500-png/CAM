import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
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
} from './oauthLogic';

test('generatePkcePair creates RFC 7636 S256 verifier and challenge', () => {
  const { codeVerifier, codeChallenge } = generatePkcePair();
  assert.ok(codeVerifier.length >= 43);
  const expected = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  assert.equal(codeChallenge, expected);
});

test('signOAuthState and verifyOAuthState reject tampering and expiry', () => {
  const secret = 'state-signing-secret-test';
  const state = signOAuthState(
    {
      provider: 'google',
      mode: 'login',
      codeVerifier: 'verifier-123',
      nonce: 'nonce-abc',
      redirectUri: 'https://app.example.com/auth/callback',
    },
    secret,
    60
  );

  const decoded = verifyOAuthState(state, secret);
  assert.equal(decoded?.provider, 'google');
  assert.equal(decoded?.codeVerifier, 'verifier-123');
  assert.equal(verifyOAuthState(`${state}x`, secret), null);

  const expiredState = signOAuthState(
    {
      provider: 'google',
      mode: 'login',
      codeVerifier: 'verifier-123',
      nonce: 'nonce-abc',
      redirectUri: 'https://app.example.com/auth/callback',
    },
    secret,
    -1000
  );
  assert.equal(verifyOAuthState(expiredState, secret), null);
});

test('isAllowedRedirectUri strictly allows only /auth/callback on allowlisted origins', () => {
  const allowed = ['https://calls.example.com', 'http://localhost:3000'];
  assert.equal(isAllowedRedirectUri('https://calls.example.com/auth/callback', allowed), true);
  assert.equal(isAllowedRedirectUri('http://localhost:3000/auth/callback/', allowed), true);
  assert.equal(isAllowedRedirectUri('https://evil.example.com/auth/callback', allowed), false);
  assert.equal(isAllowedRedirectUri('https://calls.example.com/evil', allowed), false);
});

test('buildGoogleAuthUrl and buildAppleAuthUrl include PKCE and OIDC parameters', () => {
  const gUrl = new URL(
    buildGoogleAuthUrl({
      clientId: 'g-client',
      redirectUri: 'https://calls.example.com/auth/callback',
      state: 'st1',
      codeChallenge: 'ch1',
      nonce: 'n1',
    })
  );
  assert.equal(gUrl.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(gUrl.searchParams.get('scope'), 'openid email profile');

  const aUrl = new URL(
    buildAppleAuthUrl({
      clientId: 'com.crosscall.web',
      redirectUri: 'https://calls.example.com/auth/callback',
      state: 'st2',
      nonce: 'n2',
    })
  );
  assert.equal(aUrl.searchParams.get('response_mode'), 'form_post');
  assert.equal(aUrl.searchParams.get('response_type'), 'code');
});

test('resolveOAuthIdentityAction prevents email-only account takeover and supports explicit linking', () => {
  // Existing linked provider logs into same stable user ID
  assert.deepEqual(
    resolveOAuthIdentityAction({
      mode: 'login',
      existingByProvider: {
        userId: 'user-1',
        provider: 'apple',
        providerUserId: 'apple-sub-1',
        email: 'x@privaterelay.appleid.com',
      },
      emailVerifiedByProvider: true,
    }),
    { action: 'login_existing', userId: 'user-1' }
  );

  // Email exists on another account without provider linked -> requires explicit linking
  assert.deepEqual(
    resolveOAuthIdentityAction({
      mode: 'login',
      existingUserByEmail: { id: 'user-1', emailVerified: true },
      emailVerifiedByProvider: true,
    }),
    { action: 'error', code: 'ACCOUNT_LINKING_REQUIRED' }
  );

  // Explicit link mode when signed in links to current user
  assert.deepEqual(
    resolveOAuthIdentityAction({
      mode: 'link',
      currentUserId: 'user-1',
      emailVerifiedByProvider: true,
    }),
    { action: 'link_to_current_user', userId: 'user-1' }
  );

  // Explicit link mode rejects identity already claimed by another user
  assert.deepEqual(
    resolveOAuthIdentityAction({
      mode: 'link',
      currentUserId: 'user-1',
      existingByProvider: {
        userId: 'user-2',
        provider: 'google',
        providerUserId: 'g-sub-9',
        email: 'other@example.com',
      },
      emailVerifiedByProvider: true,
    }),
    { action: 'error', code: 'EMAIL_ALREADY_REGISTERED' }
  );
});

test('canUnlinkIdentity prevents removing the last active login method', () => {
  assert.equal(canUnlinkIdentity(['google'], 'google'), false);
  assert.equal(canUnlinkIdentity(['google', 'email'], 'google'), true);
  assert.equal(canUnlinkIdentity(['apple', 'google'], 'email'), false);
});

test('isApplePrivateRelayEmail detects Hide My Email addresses', () => {
  assert.equal(isApplePrivateRelayEmail('xyz123@privaterelay.appleid.com'), true);
  assert.equal(isApplePrivateRelayEmail('user@crosscall.app'), false);
});

test('createAppleClientSecret signs valid ES256 client assertion JWT', () => {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const jwt = createAppleClientSecret({
    teamId: 'TEAM123456',
    keyId: 'KEY1234567',
    clientId: 'com.crosscall.web',
    privateKeyPem: pem,
    ttlSeconds: 300,
  });
  const parts = jwt.split('.');
  assert.equal(parts.length, 3);
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  assert.equal(header.alg, 'ES256');
  assert.equal(header.kid, 'KEY1234567');
  assert.equal(payload.iss, 'TEAM123456');
  assert.equal(payload.sub, 'com.crosscall.web');
});

test('buildSupabaseOAuthUrl builds PKCE authorize URL for Google and Apple', () => {
  const url = new URL(
    buildSupabaseOAuthUrl({
      supabaseUrl: 'https://demo.supabase.co/',
      provider: 'google',
      redirectTo: 'https://crosscall.app/auth/callback',
      codeChallenge: 'challenge-123',
    })
  );
  assert.equal(url.origin + url.pathname, 'https://demo.supabase.co/auth/v1/authorize');
  assert.equal(url.searchParams.get('provider'), 'google');
  assert.equal(url.searchParams.get('redirect_to'), 'https://crosscall.app/auth/callback');
  assert.equal(url.searchParams.get('code_challenge'), 'challenge-123');
  assert.equal(url.searchParams.get('code_challenge_method'), 's256');
});

test('classifyOAuthCallbackError handles OAuth cancellation and redirect failures explicitly', () => {
  assert.equal(
    classifyOAuthCallbackError('access_denied', 'User cancelled login', 'google'),
    'USER_CANCELLED_LOGIN'
  );
  assert.equal(
    classifyOAuthCallbackError('user_cancelled_authorize', undefined, 'apple'),
    'USER_CANCELLED_LOGIN'
  );
  assert.equal(
    classifyOAuthCallbackError('redirect_uri_mismatch', 'Invalid redirect_uri', 'google'),
    'INVALID_REDIRECT_URL'
  );
  assert.equal(
    classifyOAuthCallbackError('server_error', 'Unexpected upstream error', 'apple'),
    'APPLE_AUTH_FAILED'
  );
});
