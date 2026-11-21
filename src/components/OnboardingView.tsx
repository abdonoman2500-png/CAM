import { useState } from 'react';
import { Globe, ShieldCheck, Video } from 'lucide-react';
import type { Language, ThemeMode } from '../types/crosscall';
import { t } from '../i18n/translations';

interface OnboardingViewProps {
  lang: Language;
  theme: ThemeMode;
  onToggleLang: () => void;
  onToggleTheme: () => void;
  onComplete: () => void;
}

export function OnboardingView({
  lang,
  theme,
  onToggleLang,
  onToggleTheme,
  onComplete,
}: OnboardingViewProps) {
  const [step, setStep] = useState(0);

  const slides = [
    {
      icon: Video,
      title: t(lang, 'onboarding1Title'),
      body: t(lang, 'onboarding1Body'),
    },
    {
      icon: Globe,
      title: t(lang, 'onboarding2Title'),
      body: t(lang, 'onboarding2Body'),
    },
    {
      icon: ShieldCheck,
      title: t(lang, 'onboarding3Title'),
      body: t(lang, 'onboarding3Body'),
    },
  ];

  const current = slides[step];
  const Icon = current.icon;

  return (
    <main className="min-h-screen flex flex-col justify-between bg-slate-50 dark:bg-[#0B0F19] px-6 py-8">
      <div className="max-w-5xl w-full mx-auto flex items-center justify-between gap-4">
        <span className="font-display text-xl font-bold text-slate-900 dark:text-white whitespace-nowrap">
          {t(lang, 'appName')}
        </span>
        <div className="flex items-center gap-3">
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
            onClick={onComplete}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
          >
            {t(lang, 'skip')}
          </button>
        </div>
      </div>

      <section className="max-w-5xl w-full mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 items-stretch my-10">
        <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 min-h-[280px]">
          <img
            src="/src/assets/images/crosscall_studio_hero_1795233183731.jpg"
            alt="CrossCall acoustic studio"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-8">
          <div>
            <div className="h-12 w-12 rounded-xl bg-blue-600/15 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-6">
              <Icon className="h-6 w-6" />
            </div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums mb-2">
              {`0${step + 1} / 0${slides.length}`}
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white text-balance">
              {current.title}
            </h1>
            <p className="mt-4 text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              {current.body}
            </p>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {slides.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  aria-label={`Slide ${idx + 1}`}
                  onClick={() => setStep(idx)}
                  className={`h-2 rounded-full transition-all ${
                    idx === step ? 'w-7 bg-blue-600' : 'w-2 bg-slate-300 dark:bg-slate-700'
                  }`}
                />
              ))}
            </div>

            {step < slides.length - 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
              >
                {t(lang, 'next')}
              </button>
            ) : (
              <button
                type="button"
                onClick={onComplete}
                className="px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
              >
                {t(lang, 'getStarted')}
              </button>
            )}
          </div>
        </div>
      </section>

      <footer className="max-w-5xl w-full mx-auto text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
        <span>CrossCall · Android · iOS · Web</span>
        <span>DTLS-SRTP Transport</span>
      </footer>
    </main>
  );
}
