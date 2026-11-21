import 'package:flutter/material.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

import '../../services/auth_service.dart';

class CrossCallLoginScreen extends StatefulWidget {
  final AuthService authService;
  final VoidCallback onSignedIn;
  final VoidCallback onOpenForgotPassword;
  final VoidCallback onOpenRegister;

  const CrossCallLoginScreen({
    super.key,
    required this.authService,
    required this.onSignedIn,
    required this.onOpenForgotPassword,
    required this.onOpenRegister,
  });

  @override
  State<CrossCallLoginScreen> createState() => _CrossCallLoginScreenState();
}

class _CrossCallLoginScreenState extends State<CrossCallLoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _busy = false;
  String? _errorText;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _handleGoogle() async {
    setState(() {
      _busy = true;
      _errorText = null;
    });
    try {
      await widget.authService.signInWithGoogle();
      if (widget.authService.currentUser != null && mounted) {
        widget.onSignedIn();
      }
    } on CrossCallAuthException catch (e) {
      setState(() => _errorText = _localizeError(context, e.code));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _handleApple() async {
    setState(() {
      _busy = true;
      _errorText = null;
    });
    try {
      await widget.authService.signInWithApple();
      if (widget.authService.currentUser != null && mounted) {
        widget.onSignedIn();
      }
    } on CrossCallAuthException catch (e) {
      setState(() => _errorText = _localizeError(context, e.code));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _handleEmailLogin() async {
    setState(() {
      _busy = true;
      _errorText = null;
    });
    try {
      await widget.authService.signInWithEmail(
        email: _emailController.text,
        password: _passwordController.text,
      );
      if (mounted) widget.onSignedIn();
    } on CrossCallAuthException catch (e) {
      setState(() => _errorText = _localizeError(context, e.code));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _localizeError(BuildContext context, CrossCallAuthErrorCode code) {
    final isAr = Localizations.localeOf(context).languageCode == 'ar';
    switch (code) {
      case CrossCallAuthErrorCode.googleOauthFailed:
        return isAr ? 'تعذّر إتمام المصادقة عبر Google.' : 'Google authentication failed.';
      case CrossCallAuthErrorCode.appleAuthFailed:
        return isAr ? 'فشل تسجيل الدخول عبر Apple.' : 'Apple authentication failed.';
      case CrossCallAuthErrorCode.userCancelledLogin:
        return isAr ? 'تم إلغاء تسجيل الدخول.' : 'Sign-in was cancelled.';
      case CrossCallAuthErrorCode.accountLinkingRequired:
        return isAr
            ? 'يوجد حساب بهذا البريد. سجّل الدخول أولاً ثم اربط المزود من ملفك.'
            : 'An account exists with this email. Sign in first to link this provider.';
      case CrossCallAuthErrorCode.sessionExpired:
        return isAr ? 'انتهت الجلسة. أعد تسجيل الدخول.' : 'Session expired. Please sign in again.';
      default:
        return isAr ? 'حدث خطأ أثناء المصادقة.' : 'Authentication error occurred.';
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAr = Localizations.localeOf(context).languageCode == 'ar';
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child: Container(
                      width: 52,
                      height: 52,
                      decoration: BoxDecoration(
                        color: const Color(0xFF2563EB),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      alignment: Alignment.center,
                      child: const Text(
                        'CC',
                        style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                          fontSize: 18,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    isAr ? 'مرحباً بك في CrossCall' : 'Welcome Back',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                  const SizedBox(height: 24),
                  if (_errorText != null)
                    Container(
                      margin: const EdgeInsets.only(bottom: 16),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.red.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: Colors.red.withValues(alpha: 0.35)),
                      ),
                      child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                    ),
                  OutlinedButton.icon(
                    onPressed: _busy ? null : _handleGoogle,
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                    icon: const Icon(Icons.g_mobiledata, size: 24),
                    label: Text(isAr ? 'المتابعة باستخدام Google' : 'Continue with Google'),
                  ),
                  const SizedBox(height: 12),
                  SignInWithAppleButton(
                    onPressed: _busy ? () {} : _handleApple,
                    text: isAr ? 'المتابعة باستخدام Apple' : 'Continue with Apple',
                    style: isDark ? SignInWithAppleButtonStyle.white : SignInWithAppleButtonStyle.black,
                    height: 48,
                  ),
                  const SizedBox(height: 20),
                  Row(
                    children: [
                      const Expanded(child: Divider()),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        child: Text(isAr ? 'أو' : 'OR'),
                      ),
                      const Expanded(child: Divider()),
                    ],
                  ),
                  const SizedBox(height: 20),
                  TextField(
                    controller: _emailController,
                    keyboardType: TextInputType.emailAddress,
                    decoration: InputDecoration(
                      labelText: isAr ? 'البريد الإلكتروني' : 'Email Address',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _passwordController,
                    obscureText: true,
                    decoration: InputDecoration(
                      labelText: isAr ? 'كلمة المرور' : 'Password',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                  ),
                  Align(
                    alignment: AlignmentDirectional.centerEnd,
                    child: TextButton(
                      onPressed: widget.onOpenForgotPassword,
                      child: Text(isAr ? 'نسيت كلمة المرور؟' : 'Forgot Password?'),
                    ),
                  ),
                  const SizedBox(height: 4),
                  FilledButton(
                    onPressed: _busy ? null : _handleEmailLogin,
                    style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                    child: Text(isAr ? 'تسجيل الدخول' : 'Sign In'),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(isAr ? 'ليس لديك حساب؟' : "Don't have an account?"),
                      TextButton(
                        onPressed: widget.onOpenRegister,
                        child: Text(isAr ? 'إنشاء حساب' : 'Create Account'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
