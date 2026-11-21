import test from 'node:test';
import assert from 'node:assert/strict';
import { getPublicClientEnv, validateEnvConfig } from './envConfig';

test('validateEnvConfig sets APP_NAME to CrossCall and reports missing OAuth/Supabase keys accurately', () => {
  const report = validateEnvConfig({
    NODE_ENV: 'development',
    PORT: '3000',
    APP_URL: 'https://ais-dev-example.run.app',
  });

  assert.equal(report.appName, 'CrossCall');
  assert.equal(report.providers.google, false);
  assert.equal(report.providers.apple, false);
  assert.equal(report.providers.supabase, false);
  assert.deepEqual(report.missingEnvVars.google, ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']);
  assert.deepEqual(report.missingEnvVars.apple, [
    'APPLE_CLIENT_ID',
    'APPLE_TEAM_ID',
    'APPLE_KEY_ID',
    'APPLE_PRIVATE_KEY (or APPLE_PRIVATE_KEY_PATH)',
  ]);
  assert.deepEqual(report.missingEnvVars.supabase, [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ]);
});

test('validateEnvConfig throws if SUPABASE_SERVICE_ROLE_KEY is mistakenly prefixed with VITE_', () => {
  assert.throws(
    () =>
      validateEnvConfig({
        VITE_SUPABASE_SERVICE_ROLE_KEY: 'secret-role-key',
      }),
    /SECURITY VIOLATION/
  );
});

test('getPublicClientEnv strictly isolates frontend metadata from backend secrets', () => {
  const pub = getPublicClientEnv({
    APP_NAME: 'CrossCall',
    APP_URL: 'https://crosscall.app',
    SUPABASE_URL: 'https://abc123.supabase.co',
    SUPABASE_ANON_KEY: 'anon-public-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-super-secret',
    GOOGLE_CLIENT_ID: 'google-client-id',
    GOOGLE_CLIENT_SECRET: 'google-secret',
    AUTH_SESSION_SECRET: 'jwt-secret',
  });

  const serialized = JSON.stringify(pub);
  assert.equal(pub.appName, 'CrossCall');
  assert.equal(pub.supabaseUrl, 'https://abc123.supabase.co');
  assert.equal(pub.supabaseAnonKey, 'anon-public-key');
  assert.equal(pub.supabaseAuthReady, true);
  assert.equal(pub.googleOAuthReady, true);
  assert.ok(!serialized.includes('service-role-super-secret'));
  assert.ok(!serialized.includes('google-secret'));
  assert.ok(!serialized.includes('jwt-secret'));
});
