import { useEffect } from 'react';
import { PhoneCall } from 'lucide-react';
import type { Language } from '../types/crosscall';
import { t } from '../i18n/translations';

interface SplashScreenProps {
  lang: Language;
  onDone: () => void;
}

export function SplashScreen({ lang, onDone }: SplashScreenProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 900);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 bg-slate-50 dark:bg-[#0B0F19]">
      <div className="flex flex-col items-center text-center max-w-md">
        <div className="h-16 w-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/25 mb-6">
          <PhoneCall className="h-8 w-8" />
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          {t(lang, 'appName')}
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {t(lang, 'tagline')}
        </p>
        <button
          type="button"
          onClick={onDone}
          className="mt-8 px-5 py-2.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
        >
          {t(lang, 'getStarted')}
        </button>
      </div>
    </main>
  );
}
