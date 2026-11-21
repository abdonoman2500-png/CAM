import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, Lock, Mail, Phone, Shield, UserPlus } from 'lucide-react';
import type {
  AuthErrorCode,
  AuthProviderStatus,
  Language,
  PublicProfile,
  ScreenId,
  ThemeMode,
  UserSettings,
} from '../types/crosscall';
import { t, tAuthError } from '../i18n/translations';
import { api, ApiAuthError } from '../services/api';
import { runOAuthPopup } from '../utils/oauthPopup';

interface AuthViewsProps {
  screen: 'login' | 'register' | 'otp-verify' | 'email-verify' | 'forgot-password';
  lang: Language;
  theme: ThemeMode;
  initialErrorCode?: AuthErrorCode | null;
  onClearInitialError?: () => void;
  onNavigate: (s: ScreenId) => void;
  onToggleLang: () => void;
  onToggleTheme: () => void;
  onAuthSuccess: (data: { token: string; user: PublicProfile; settings: UserSettings }) => void;
  onOpenAdmin: () => void;
}

function GoogleMark() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
      />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg className="h-4 w-4 shrink-0 fill-current" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43Zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45Z" />
    </svg>
  );
}

export function AuthViews({
  screen,
  lang,
  theme,
  initialErrorCode,
  onClearInitialError,
  onNavigate,
  onToggleLang,
  onToggleTheme,
  onAuthSuccess,
  onOpenAdmin,
}: AuthViewsProps) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [otpTarget, setOtpTarget] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [previewCode, setPreviewCode] = useState<string | null>(null);
  const [codeRequested, setCodeRequested] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [errorState, setErrorState] = useState<{ code?: AuthErrorCode; fallback: string } | null>(
    initialErrorCode ? { code: initialErrorCode, fallback: initialErrorCode } : null
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oauthBusy, setOauthBusy] = useState<'google' | 'apple' | null>(null);
  const [providers, setProviders] = useState<AuthProviderStatus | null>(null);

  useEffect(() => {
    if (initialErrorCode) {
      setErrorState({ code: initialErrorCode, fallback: initialErrorCode });
      onClearInitialError?.();
    }
  }, [initialErrorCode, onClearInitialError]);

  useEffect(() => {
    api
      .getAuthProviders()
      .then(setProviders)
      .catch(() => {
        // non-blocking provider capability fetch
      });
  }, []);

  function toErrorState(err: unknown): { code?: AuthErrorCode; fallback: string } {
    if (err instanceof ApiAuthError) {
      if (err.code === 'NETWORK_ERROR' && err.message === 'Popup blocked') {
        return { fallback: t(lang, 'popupBlocked') };
      }
      return { code: err.code, fallback: err.message };
    }
    return {
      code: 'NETWORK_ERROR',
      fallback: err instanceof Error ? err.message : tAuthError(lang, 'NETWORK_ERROR'),
    };
  }

  const error = errorState
    ? errorState.code
      ? tAuthError(lang, errorState.code, errorState.fallback)
      : errorState.fallback
    : null;

  const setError = (val: { code?: AuthErrorCode; fallback: string } | null) => setErrorState(val);

  async function handleOAuthClick(provider: 'google' | 'apple') {
    setError(null);
    setNotice(null);
    setOauthBusy(provider);
    try {
      const res = await runOAuthPopup(provider, 'login');
      onAuthSuccess({ token: res.token, user: res.user, settings: res.settings });
    } catch (err) {
      setError(toErrorState(err));
    } finally {
      setOauthBusy(null);
    }
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const res = await api.login(identifier, password);
      onAuthSuccess(res);
    } catch (err) {
      setError(toErrorState(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const res = await api.register({
        fullName,
        username,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        password,
      });
      onAuthSuccess(res);
    } catch (err) {
      setError(toErrorState(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestOtp(channel: 'phone' | 'email' | 'reset') {
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const res = await api.requestOtp(otpTarget, channel);
      setCodeRequested(true);
      setPreviewCode(res.previewCode ?? null);
      setNotice(
        res.previewCode
          ? `Verification code (development): ${res.previewCode}`
          : lang === 'ar'
            ? 'تم إرسال رمز التحقق بنجاح.'
            : 'Verification code dispatched.'
      );
    } catch (err) {
      setError(toErrorState(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: FormEvent, channel: 'phone' | 'email' | 'reset') {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.verifyOtp({
        target: otpTarget,
        channel,
        code: otpCode,
        newPassword: channel === 'reset' ? newPassword : undefined,
      });
      if (channel === 'reset') {
        setNotice(
          lang === 'ar'
            ? 'تم تحديث كلمة المرور. يمكنك تسجيل الدخول الآن.'
            : 'Password updated. You may now sign in.'
        );
        onNavigate('login');
      } else if (res.token && res.user && res.settings) {
        onAuthSuccess({ token: res.token, user: res.user, settings: res.settings });
      }
    } catch (err) {
      setError(toErrorState(err));
    } finally {
      setLoading(false);
    }
  }

  const showOAuthButtons = screen === 'login' || screen === 'register';

  return (
    <main className="min-h-screen flex flex-col justify-between bg-slate-50 dark:bg-[#0B0F19] px-4 sm:px-6 py-6 sm:py-8">
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => {
            setError(null);
            onNavigate('login');
          }}
          className="inline-flex items-center gap-2.5 text-slate-900 dark:text-white whitespace-nowrap"
        >
          <span className="h-8 w-8 rounded-lg bg-blue-600 text-white font-display font-bold text-sm flex items-center justify-center shadow-sm">
            CC
          </span>
          <span className="font-display text-lg font-bold tracking-tight">
            {t(lang, 'appName')}
          </span>
        </button>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onToggleLang}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            {lang === 'en' ? 'العربية' : 'English'}
          </button>
          <button
            type="button"
            onClick={onToggleTheme}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            {theme === 'dark' ? t(lang, 'lightTheme') : t(lang, 'darkTheme')}
          </button>
          <button
            type="button"
            onClick={onOpenAdmin}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <Shield className="h-3.5 w-3.5" />
            {t(lang, 'adminConsole')}
          </button>
        </div>
      </header>

      <div className="w-full max-w-[460px] mx-auto my-8">
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 sm:p-8 shadow-sm">
          {/* Logo & Welcome Title */}
          <div className="text-center mb-6">
            <div className="mx-auto mb-3 h-11 w-11 rounded-xl bg-blue-600 text-white font-display font-bold text-base flex items-center justify-center shadow-sm">
              CC
            </div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              {screen === 'login'
                ? t(lang, 'welcomeBack')
                : screen === 'register'
                  ? t(lang, 'register')
                  : screen === 'otp-verify'
                    ? t(lang, 'verifyOtp')
                    : screen === 'email-verify'
                      ? t(lang, 'verifyEmail')
                      : t(lang, 'resetPassword')}
            </h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t(lang, 'tagline')}
            </p>
          </div>

          {/* Alerts */}
          {error && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400"
            >
              {error}
            </div>
          )}

          {notice && (
            <div className="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-600 dark:text-blue-400 tabular-nums">
              {notice}
            </div>
          )}

          {/* Official Google & Apple Sign-In Buttons (Section 10 Exact Placement) */}
          {showOAuthButtons && (
            <>
              <div className="space-y-2.5">
                <button
                  type="button"
                  disabled={loading || oauthBusy !== null}
                  onClick={() => handleOAuthClick('google')}
                  data-testid="oauth-google-btn"
                  className="w-full h-11 inline-flex items-center justify-center gap-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-900 dark:text-white text-sm font-medium transition-colors disabled:opacity-60 whitespace-nowrap"
                >
                  <GoogleMark />
                  <span>
                    {oauthBusy === 'google'
                      ? t(lang, 'connecting')
                      : t(lang, 'continueWithGoogle')}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={loading || oauthBusy !== null}
                  onClick={() => handleOAuthClick('apple')}
                  data-testid="oauth-apple-btn"
                  className="w-full h-11 inline-flex items-center justify-center gap-3 rounded-lg bg-slate-950 hover:bg-slate-900 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-950 text-sm font-medium transition-colors disabled:opacity-60 whitespace-nowrap"
                >
                  <AppleMark />
                  <span>
                    {oauthBusy === 'apple'
                      ? t(lang, 'connecting')
                      : t(lang, 'continueWithApple')}
                  </span>
                </button>
              </div>

              {providers && (!providers.google || !providers.apple) && (
                <p className="mt-2.5 text-[11px] text-slate-500 dark:text-slate-400 text-center">
                  {t(lang, 'providerUnconfiguredHint')}
                </p>
              )}

              <div className="my-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  {t(lang, 'orDivider')}
                </span>
                <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              </div>
            </>
          )}

          {/* Email + Password Login */}
          {screen === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label
                  htmlFor="login-identifier"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  {t(lang, 'emailOrUsername')}
                </label>
                <input
                  id="login-identifier"
                  type="text"
                  required
                  dir="ltr"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0F19] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="login-password"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    {t(lang, 'password')}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setNotice(null);
                      setCodeRequested(false);
                      onNavigate('forgot-password');
                    }}
                    className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                  >
                    {t(lang, 'forgotPassword')}
                  </button>
                </div>
                <input
                  id="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0F19] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading || oauthBusy !== null}
                className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium text-sm transition-colors"
              >
                <Lock className="h-4 w-4" />
                {t(lang, 'signIn')}
              </button>

              <p className="pt-2 text-center text-sm text-slate-600 dark:text-slate-400">
                {t(lang, 'noAccountPrompt')}{' '}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setNotice(null);
                    onNavigate('register');
                  }}
                  className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {t(lang, 'register')}
                </button>
              </p>
            </form>
          )}

          {/* Create Account */}
          {screen === 'register' && (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="reg-fullname"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    {t(lang, 'fullName')}
                  </label>
                  <input
                    id="reg-fullname"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={lang === 'ar' ? 'أحمد المنصور' : 'Nadia Mansour'}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0F19] px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="reg-username"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    {t(lang, 'username')}
                  </label>
                  <input
                    id="reg-username"
                    type="text"
                    required
                    dir="ltr"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="nadia.dev"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0F19] px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="reg-email"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    {t(lang, 'email')}
                  </label>
                  <input
                    id="reg-email"
                    type="email"
                    dir="ltr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nadia@example.com"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0F19] px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="reg-phone"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    {t(lang, 'phone')}
                  </label>
                  <input
                    id="reg-phone"
                    type="tel"
                    dir="ltr"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+971501234567"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0F19] px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="reg-password"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  {t(lang, 'password')}
                </label>
                <input
                  id="reg-password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0F19] px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading || oauthBusy !== null}
                className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium text-sm transition-colors"
              >
                <UserPlus className="h-4 w-4" />
                {t(lang, 'register')}
              </button>

              <p className="pt-2 text-center text-sm text-slate-600 dark:text-slate-400">
                {t(lang, 'alreadyHaveAccount')}{' '}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setNotice(null);
                    onNavigate('login');
                  }}
                  className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {t(lang, 'signIn')}
                </button>
              </p>
            </form>
          )}

          {/* Phone OTP / Email Verify / Forgot Password */}
          {(screen === 'otp-verify' || screen === 'email-verify' || screen === 'forgot-password') && (
            <form
              onSubmit={(e) =>
                handleVerifyOtp(
                  e,
                  screen === 'otp-verify' ? 'phone' : screen === 'email-verify' ? 'email' : 'reset'
                )
              }
              className="space-y-4"
            >
              <div>
                <label
                  htmlFor="otp-target"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  {screen === 'otp-verify' ? t(lang, 'phone') : t(lang, 'email')}
                </label>
                <div className="flex gap-2">
                  <input
                    id="otp-target"
                    type={screen === 'otp-verify' ? 'tel' : 'email'}
                    dir="ltr"
                    required
                    value={otpTarget}
                    onChange={(e) => setOtpTarget(e.target.value)}
                    placeholder={screen === 'otp-verify' ? '+971501112233' : 'name@company.com'}
                    className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0F19] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() =>
                      handleRequestOtp(
                        screen === 'otp-verify' ? 'phone' : screen === 'email-verify' ? 'email' : 'reset'
                      )
                    }
                    className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                  >
                    {t(lang, 'sendCode')}
                  </button>
                </div>
              </div>

              {codeRequested && (
                <>
                  <div>
                    <label
                      htmlFor="otp-code"
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      {t(lang, 'codePlaceholder')}
                    </label>
                    <input
                      id="otp-code"
                      type="text"
                      inputMode="numeric"
                      dir="ltr"
                      required
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      placeholder={previewCode ?? '123456'}
                      className="w-full font-mono tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0F19] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  {screen === 'forgot-password' && (
                    <div>
                      <label
                        htmlFor="reset-pass"
                        className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                      >
                        {t(lang, 'newPassword')}
                      </label>
                      <input
                        id="reset-pass"
                        type="password"
                        required
                        minLength={8}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0F19] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors"
                  >
                    {screen === 'otp-verify' ? (
                      <Phone className="h-4 w-4" />
                    ) : screen === 'email-verify' ? (
                      <Mail className="h-4 w-4" />
                    ) : (
                      <KeyRound className="h-4 w-4" />
                    )}
                    {t(lang, 'verifyOtp')}
                  </button>
                </>
              )}

              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setNotice(null);
                    onNavigate('login');
                  }}
                  className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                  {t(lang, 'signIn')}
                </button>
              </div>
            </form>
          )}

          {/* Secondary Auth Modes Bar (Phone OTP / Email Verify) */}
          <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-center gap-4 text-xs">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setNotice(null);
                setCodeRequested(false);
                onNavigate('otp-verify');
              }}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap ${
                screen === 'otp-verify'
                  ? 'text-blue-600 dark:text-blue-400 font-semibold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Phone className="h-3.5 w-3.5" />
              {lang === 'ar' ? 'الدخول برمز الهاتف' : 'Phone OTP'}
            </button>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setNotice(null);
                setCodeRequested(false);
                onNavigate('email-verify');
              }}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap ${
                screen === 'email-verify'
                  ? 'text-blue-600 dark:text-blue-400 font-semibold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Mail className="h-3.5 w-3.5" />
              {t(lang, 'verifyEmail')}
            </button>
          </div>
        </section>
      </div>

      <footer className="max-w-5xl w-full mx-auto text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-2">
        <span>CrossCall · Google &amp; Apple OAuth 2.0 + WebRTC</span>
        <span>{t(lang, 'e2eeNote')}</span>
      </footer>
    </main>
  );
}
