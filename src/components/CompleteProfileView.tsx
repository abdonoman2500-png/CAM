import { useState, type FormEvent } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { Language, PublicProfile } from '../types/crosscall';
import { t, tAuthError } from '../i18n/translations';
import { api, ApiAuthError } from '../services/api';

interface CompleteProfileViewProps {
  lang: Language;
  currentUser: PublicProfile;
  onCompleted: (updatedUser: PublicProfile) => void;
  onSignOut: () => void;
}

export function CompleteProfileView({
  lang,
  currentUser,
  onCompleted,
  onSignOut,
}: CompleteProfileViewProps) {
  const [fullName, setFullName] = useState(currentUser.fullName || '');
  const [username, setUsername] = useState(currentUser.username || '');
  const [phone, setPhone] = useState(currentUser.phone || '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.updateProfile({
        fullName: fullName.trim(),
        username: username.trim().toLowerCase(),
        phone: phone.trim() ? phone.trim() : null,
        needsProfileCompletion: false,
      });
      onCompleted({ ...res.user, needsProfileCompletion: false });
    } catch (err) {
      if (err instanceof ApiAuthError && err.code) {
        setError(tAuthError(lang, err.code, err.message));
      } else {
        setError(err instanceof Error ? err.message : tAuthError(lang, 'NETWORK_ERROR'));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0B0F19] px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 sm:p-8 space-y-6">
        <div className="space-y-1.5">
          <div className="h-10 w-10 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            {t(lang, 'completeProfileTitle')}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t(lang, 'completeProfileBody')}
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="cp-fullname"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              {t(lang, 'fullName')}
            </label>
            <input
              id="cp-fullname"
              type="text"
              required
              minLength={2}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F19] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="cp-username"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              {t(lang, 'username')}
            </label>
            <input
              id="cp-username"
              type="text"
              dir="ltr"
              required
              minLength={3}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F19] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="cp-phone"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              {t(lang, 'phone')}
            </label>
            <input
              id="cp-phone"
              type="tel"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+971501234567"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F19] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={onSignOut}
              className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {t(lang, 'signOut')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium"
            >
              {t(lang, 'finishSetup')}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
