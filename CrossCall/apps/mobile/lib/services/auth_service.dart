import 'dart:convert';
import 'dart:io' show Platform;
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../core/config/app_env.dart';

enum CrossCallAuthErrorCode {
  googleOauthFailed,
  appleAuthFailed,
  invalidRedirectUrl,
  emailAlreadyRegistered,
  accountLinkingRequired,
  userCancelledLogin,
  sessionExpired,
  networkError,
  providerNotConfigured,
  emailNotVerified,
  cannotUnlinkLastMethod,
}

class CrossCallAuthException implements Exception {
  final CrossCallAuthErrorCode code;
  final String message;

  const CrossCallAuthException(this.code, this.message);

  @override
  String toString() => 'CrossCallAuthException($code): $message';
}

class AuthService {
  final SupabaseClient _supabase;

  AuthService(this._supabase);

  User? get currentUser => _supabase.auth.currentUser;
  Session? get currentSession => _supabase.auth.currentSession;

  String _generateNonce([int length = 32]) {
    const charset =
        '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._';
    final random = Random.secure();
    return List.generate(
      length,
      (_) => charset[random.nextInt(charset.length)],
    ).join();
  }

  String _sha256Hex(String input) {
    final bytes = utf8.encode(input);
    return sha256.convert(bytes).toString();
  }

  /// Google Sign-In:
  /// - Web / Fallback: Supabase OAuth 2.0 Authorization Code + PKCE
  /// - Native Android & iOS: `google_sign_in` ID token exchanged into Supabase session
  Future<AuthResponse?> signInWithGoogle() async {
    try {
      if (kIsWeb || AppEnv.googleWebClientId.isEmpty) {
        final ok = await _supabase.auth.signInWithOAuth(
          OAuthProvider.google,
          redirectTo: kIsWeb ? AppEnv.oauthRedirectUri : AppEnv.oauthCallbackScheme,
          authScreenLaunchMode: LaunchMode.externalApplication,
        );
        if (!ok) {
          throw const CrossCallAuthException(
            CrossCallAuthErrorCode.googleOauthFailed,
            'Could not launch Google OAuth flow.',
          );
        }
        return null;
      }

      final googleSignIn = GoogleSignIn(
        clientId: !kIsWeb && Platform.isIOS ? AppEnv.googleIosClientId : null,
        serverClientId: AppEnv.googleWebClientId,
        scopes: const ['openid', 'email', 'profile'],
      );

      final account = await googleSignIn.signIn();
      if (account == null) {
        throw const CrossCallAuthException(
          CrossCallAuthErrorCode.userCancelledLogin,
          'User cancelled Google sign-in.',
        );
      }

      final auth = await account.authentication;
      if (auth.idToken == null || auth.accessToken == null) {
        throw const CrossCallAuthException(
          CrossCallAuthErrorCode.googleOauthFailed,
          'Missing ID token or access token from Google.',
        );
      }

      return await _supabase.auth.signInWithIdToken(
        provider: OAuthProvider.google,
        idToken: auth.idToken!,
        accessToken: auth.accessToken,
      );
    } on CrossCallAuthException {
      rethrow;
    } on AuthException catch (e) {
      throw _mapSupabaseError(e, defaultProvider: CrossCallAuthErrorCode.googleOauthFailed);
    } catch (e) {
      throw CrossCallAuthException(
        CrossCallAuthErrorCode.googleOauthFailed,
        e.toString(),
      );
    }
  }

  /// Sign in with Apple:
  /// - Native iOS/macOS with raw/SHA256 nonce + one-time first-login name capture
  /// - Android & Web via OAuth `signInWithOAuth` / Services ID
  Future<AuthResponse?> signInWithApple() async {
    try {
      if (!kIsWeb && (Platform.isIOS || Platform.isMacOS)) {
        final rawNonce = _generateNonce();
        final hashedNonce = _sha256Hex(rawNonce);

        final credential = await SignInWithApple.getAppleIDCredential(
          scopes: [
            AppleIDAuthorizationScopes.email,
            AppleIDAuthorizationScopes.fullName,
          ],
          nonce: hashedNonce,
        );

        final idToken = credential.identityToken;
        if (idToken == null) {
          throw const CrossCallAuthException(
            CrossCallAuthErrorCode.appleAuthFailed,
            'Apple did not return an identity token.',
          );
        }

        final response = await _supabase.auth.signInWithIdToken(
          provider: OAuthProvider.apple,
          idToken: idToken,
          nonce: rawNonce,
        );

        // Apple provides givenName / familyName ONLY on the very first login.
        final given = credential.givenName?.trim() ?? '';
        final family = credential.familyName?.trim() ?? '';
        final fullName = '$given $family'.trim();
        if (fullName.isNotEmpty) {
          await _supabase.auth.updateUser(
            UserAttributes(data: {'full_name': fullName}),
          );
        }

        return response;
      }

      // Android / Web OAuth flow
      final ok = await _supabase.auth.signInWithOAuth(
        OAuthProvider.apple,
        redirectTo: kIsWeb ? AppEnv.oauthRedirectUri : AppEnv.oauthCallbackScheme,
        authScreenLaunchMode: LaunchMode.externalApplication,
      );
      if (!ok) {
        throw const CrossCallAuthException(
          CrossCallAuthErrorCode.appleAuthFailed,
          'Could not launch Apple OAuth flow.',
        );
      }
      return null;
    } on SignInWithAppleAuthorizationException catch (e) {
      if (e.code == AuthorizationErrorCode.canceled) {
        throw const CrossCallAuthException(
          CrossCallAuthErrorCode.userCancelledLogin,
          'User cancelled Apple sign-in.',
        );
      }
      throw CrossCallAuthException(
        CrossCallAuthErrorCode.appleAuthFailed,
        e.message,
      );
    } on CrossCallAuthException {
      rethrow;
    } on AuthException catch (e) {
      throw _mapSupabaseError(e, defaultProvider: CrossCallAuthErrorCode.appleAuthFailed);
    } catch (e) {
      throw CrossCallAuthException(
        CrossCallAuthErrorCode.appleAuthFailed,
        e.toString(),
      );
    }
  }

  /// Links Google or Apple identity to the currently signed-in user ID
  /// after verifying active authentication ownership.
  Future<void> linkIdentity(OAuthProvider provider) async {
    if (_supabase.auth.currentSession == null) {
      throw const CrossCallAuthException(
        CrossCallAuthErrorCode.sessionExpired,
        'Active session required before linking an account.',
      );
    }
    try {
      await _supabase.auth.linkIdentity(
        provider,
        redirectTo: kIsWeb ? AppEnv.oauthRedirectUri : AppEnv.oauthCallbackScheme,
      );
    } on AuthException catch (e) {
      throw _mapSupabaseError(
        e,
        defaultProvider: provider == OAuthProvider.apple
            ? CrossCallAuthErrorCode.appleAuthFailed
            : CrossCallAuthErrorCode.googleOauthFailed,
      );
    }
  }

  /// Unlinks a secondary identity after verifying it is not the sole sign-in method.
  Future<void> unlinkIdentity(UserIdentity identity) async {
    final identities = _supabase.auth.currentUser?.identities ?? [];
    if (identities.length <= 1) {
      throw const CrossCallAuthException(
        CrossCallAuthErrorCode.cannotUnlinkLastMethod,
        'Cannot unlink the last remaining authentication method.',
      );
    }
    try {
      await _supabase.auth.unlinkIdentity(identity);
    } on AuthException catch (e) {
      throw _mapSupabaseError(e);
    }
  }

  Future<AuthResponse> signInWithEmail({
    required String email,
    required String password,
  }) async {
    try {
      return await _supabase.auth.signInWithPassword(
        email: email.trim(),
        password: password,
      );
    } on AuthException catch (e) {
      throw _mapSupabaseError(e);
    }
  }

  Future<void> signOut() async {
    await _supabase.auth.signOut();
    if (!kIsWeb) {
      try {
        await GoogleSignIn().signOut();
      } catch (_) {
        // ignore if not signed in via Google native SDK
      }
    }
  }

  CrossCallAuthException _mapSupabaseError(
    AuthException e, {
    CrossCallAuthErrorCode defaultProvider = CrossCallAuthErrorCode.networkError,
  }) {
    final msg = e.message.toLowerCase();
    if (msg.contains('already registered') || msg.contains('already exists')) {
      return CrossCallAuthException(
        CrossCallAuthErrorCode.emailAlreadyRegistered,
        e.message,
      );
    }
    if (msg.contains('not confirmed') || msg.contains('verify')) {
      return CrossCallAuthException(
        CrossCallAuthErrorCode.emailNotVerified,
        e.message,
      );
    }
    if (msg.contains('redirect')) {
      return CrossCallAuthException(
        CrossCallAuthErrorCode.invalidRedirectUrl,
        e.message,
      );
    }
    if (msg.contains('expired') || msg.contains('invalid jwt')) {
      return CrossCallAuthException(
        CrossCallAuthErrorCode.sessionExpired,
        e.message,
      );
    }
    if (msg.contains('manual linking') || msg.contains('identity')) {
      return CrossCallAuthException(
        CrossCallAuthErrorCode.accountLinkingRequired,
        e.message,
      );
    }
    return CrossCallAuthException(defaultProvider, e.message);
  }
}
