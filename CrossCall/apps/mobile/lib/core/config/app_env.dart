enum AppEnvironment { development, staging, production }

/// Client-safe runtime configuration injected via `--dart-define`.
/// NEVER put private keys (`SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_SECRET`,
/// or Apple `.p8` private keys) inside Flutter / Web client code.
class AppEnv {
  static const String envName = String.fromEnvironment(
    'APP_ENV',
    defaultValue: 'development',
  );

  static const String appUrl = String.fromEnvironment(
    'APP_URL',
    defaultValue: 'https://crosscall.app',
  );

  static const String apiUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'https://api.crosscall.app',
  );

  static const String supabaseUrl = String.fromEnvironment(
    'SUPABASE_URL',
    defaultValue: '',
  );

  static const String supabaseAnonKey = String.fromEnvironment(
    'SUPABASE_ANON_KEY',
    defaultValue: '',
  );

  static const String googleWebClientId = String.fromEnvironment(
    'GOOGLE_CLIENT_ID',
    defaultValue: '',
  );

  static const String googleIosClientId = String.fromEnvironment(
    'GOOGLE_IOS_CLIENT_ID',
    defaultValue: '',
  );

  static const String appleServiceId = String.fromEnvironment(
    'APPLE_CLIENT_ID',
    defaultValue: 'app.crosscall.web',
  );

  static const String oauthCallbackScheme = 'app.crosscall://auth/callback';

  static AppEnvironment get environment {
    switch (envName.toLowerCase()) {
      case 'production':
        return AppEnvironment.production;
      case 'staging':
        return AppEnvironment.staging;
      default:
        return AppEnvironment.development;
    }
  }

  static String get oauthRedirectUri {
    return '$appUrl/auth/callback';
  }
}
