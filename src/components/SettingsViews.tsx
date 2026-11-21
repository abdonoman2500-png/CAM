import { useEffect, useState } from 'react';
import {
  Ban,
  ChevronRight,
  Globe,
  Laptop,
  LogOut,
  Shield,
  Sliders,
  Trash2,
  User,
  Video,
} from 'lucide-react';
import type {
  Language,
  PublicProfile,
  ScreenId,
  ThemeMode,
  UserDevice,
  UserSettings,
} from '../types/crosscall';
import { t } from '../i18n/translations';
import { api } from '../services/api';
import { Avatar } from './Avatar';

interface SettingsViewsProps {
  screen:
    | 'settings'
    | 'privacy-settings'
    | 'blocked-users'
    | 'device-management'
    | 'language-settings'
    | 'av-settings';
  lang: Language;
  theme: ThemeMode;
  settings: UserSettings;
  onNavigate: (s: ScreenId) => void;
  onUpdateSettings: (partial: Partial<UserSettings>) => Promise<void>;
  onSignOut: () => void;
  onSignOutAllDevices: () => void;
  onDeleteAccount: () => Promise<void>;
  onOpenAdmin: () => void;
}

export function SettingsViews({
  screen,
  lang,
  theme,
  settings,
  onNavigate,
  onUpdateSettings,
  onSignOut,
  onSignOutAllDevices,
  onDeleteAccount,
  onOpenAdmin,
}: SettingsViewsProps) {
  const [devices, setDevices] = useState<UserDevice[]>([]);
  const [blocked, setBlocked] = useState<PublicProfile[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (screen === 'device-management') {
      api.getDevices().then((r) => setDevices(r.devices)).catch(() => {});
    }
    if (screen === 'blocked-users') {
      api.getBlocked().then((r) => setBlocked(r.blocked)).catch(() => {});
    }
  }, [screen]);

  if (screen === 'privacy-settings') {
    return (
      <section className="max-w-2xl mx-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            {t(lang, 'privacySettings')}
          </h1>
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            {t(lang, 'settings')}
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="privacy-lastseen" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              {t(lang, 'lastSeenPolicy')}
            </label>
            <select
              id="privacy-lastseen"
              value={settings.privacy.lastSeen}
              onChange={(e) =>
                onUpdateSettings({
                  privacy: {
                    ...settings.privacy,
                    lastSeen: e.target.value as 'everyone' | 'contacts' | 'nobody',
                  },
                })
              }
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F19] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
            >
              <option value="everyone">{t(lang, 'everyone')}</option>
              <option value="contacts">{t(lang, 'contactsOnly')}</option>
              <option value="nobody">{t(lang, 'nobody')}</option>
            </select>
          </div>

          <label className="flex items-center justify-between gap-4 py-3 border-t border-slate-200 dark:border-slate-800 cursor-pointer">
            <span className="text-sm text-slate-800 dark:text-slate-200">{t(lang, 'allowPhoneSearch')}</span>
            <input
              type="checkbox"
              checked={settings.privacy.allowPhoneSearch}
              onChange={(e) =>
                onUpdateSettings({
                  privacy: { ...settings.privacy, allowPhoneSearch: e.target.checked },
                })
              }
              className="h-4 w-4 accent-blue-600"
            />
          </label>

          <label className="flex items-center justify-between gap-4 py-3 border-t border-slate-200 dark:border-slate-800 cursor-pointer">
            <span className="text-sm text-slate-800 dark:text-slate-200">{t(lang, 'readReceipts')}</span>
            <input
              type="checkbox"
              checked={settings.privacy.readReceipts}
              onChange={(e) =>
                onUpdateSettings({
                  privacy: { ...settings.privacy, readReceipts: e.target.checked },
                })
              }
              className="h-4 w-4 accent-blue-600"
            />
          </label>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-800">
          {t(lang, 'e2eeNote')}
        </p>
      </section>
    );
  }

  if (screen === 'blocked-users') {
    return (
      <section className="max-w-2xl mx-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            {t(lang, 'blockedUsers')}
          </h1>
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            {t(lang, 'settings')}
          </button>
        </div>

        {blocked.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 py-6">{t(lang, 'noBlocked')}</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {blocked.map((u) => (
              <li key={u.id} className="py-3.5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Avatar name={u.fullName} src={u.avatarUrl} />
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{u.fullName}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">@{u.username}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await api.unblockUser(u.id);
                    setBlocked((list) => list.filter((x) => x.id !== u.id));
                  }}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {t(lang, 'unblock')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  if (screen === 'device-management') {
    return (
      <section className="max-w-2xl mx-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            {t(lang, 'deviceManagement')}
          </h1>
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            {t(lang, 'settings')}
          </button>
        </div>

        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {devices.map((d) => (
            <li key={d.id} className="py-3.5 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {d.deviceName} {d.isCurrent ? `(${t(lang, 'currentDevice')})` : ''}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {d.platform.toUpperCase()} · Last active {new Date(d.lastActiveAt).toLocaleString()}
                </p>
              </div>
              {!d.isCurrent && (
                <button
                  type="button"
                  onClick={async () => {
                    await api.revokeDevice(d.id);
                    setDevices((list) => list.filter((x) => x.id !== d.id));
                  }}
                  className="px-3 py-1.5 rounded-lg border border-red-500/30 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10"
                >
                  {t(lang, 'revokeSession')}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (screen === 'language-settings') {
    return (
      <section className="max-w-2xl mx-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            {t(lang, 'languageSettings')}
          </h1>
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            {t(lang, 'settings')}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onUpdateSettings({ language: 'en' })}
            className={`p-4 rounded-xl border text-start ${
              lang === 'en'
                ? 'border-blue-600 bg-blue-600/10 text-blue-600 dark:text-blue-400'
                : 'border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
            }`}
          >
            <div className="font-semibold text-sm">{t(lang, 'english')}</div>
            <div className="text-xs opacity-75 mt-1">Left-to-Right layout</div>
          </button>
          <button
            type="button"
            onClick={() => onUpdateSettings({ language: 'ar' })}
            className={`p-4 rounded-xl border text-start ${
              lang === 'ar'
                ? 'border-blue-600 bg-blue-600/10 text-blue-600 dark:text-blue-400'
                : 'border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
            }`}
          >
            <div className="font-semibold text-sm">{t(lang, 'arabic')}</div>
            <div className="text-xs opacity-75 mt-1">تخطيط من اليمين إلى اليسار</div>
          </button>
        </div>

        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex gap-3">
          <button
            type="button"
            onClick={() => onUpdateSettings({ theme: 'dark' })}
            className={`flex-1 py-2.5 rounded-lg border text-sm font-medium ${
              theme === 'dark'
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
            }`}
          >
            {t(lang, 'darkTheme')}
          </button>
          <button
            type="button"
            onClick={() => onUpdateSettings({ theme: 'light' })}
            className={`flex-1 py-2.5 rounded-lg border text-sm font-medium ${
              theme === 'light'
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
            }`}
          >
            {t(lang, 'lightTheme')}
          </button>
        </div>
      </section>
    );
  }

  if (screen === 'av-settings') {
    return (
      <section className="max-w-2xl mx-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            {t(lang, 'avSettings')}
          </h1>
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            {t(lang, 'settings')}
          </button>
        </div>

        <div>
          <label htmlFor="av-quality" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            {t(lang, 'videoQuality')}
          </label>
          <select
            id="av-quality"
            value={settings.media.videoQuality}
            onChange={(e) =>
              onUpdateSettings({
                media: {
                  ...settings.media,
                  videoQuality: e.target.value as 'auto' | '1080p' | '720p' | '360p',
                },
              })
            }
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F19] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
          >
            <option value="auto">Adaptive (Simulcast Auto)</option>
            <option value="1080p">1080p HD</option>
            <option value="720p">720p Balanced</option>
            <option value="360p">360p Data Saver</option>
          </select>
        </div>

        <label className="flex items-center justify-between gap-4 py-3 border-t border-slate-200 dark:border-slate-800 cursor-pointer">
          <span className="text-sm text-slate-800 dark:text-slate-200">{t(lang, 'noiseSuppression')}</span>
          <input
            type="checkbox"
            checked={settings.media.noiseSuppression}
            onChange={(e) =>
              onUpdateSettings({
                media: { ...settings.media, noiseSuppression: e.target.checked },
              })
            }
            className="h-4 w-4 accent-blue-600"
          />
        </label>

        <label className="flex items-center justify-between gap-4 py-3 border-t border-slate-200 dark:border-slate-800 cursor-pointer">
          <span className="text-sm text-slate-800 dark:text-slate-200">{t(lang, 'backgroundBlur')}</span>
          <input
            type="checkbox"
            checked={settings.media.backgroundBlur}
            onChange={(e) =>
              onUpdateSettings({
                media: { ...settings.media, backgroundBlur: e.target.checked },
              })
            }
            className="h-4 w-4 accent-blue-600"
          />
        </label>
      </section>
    );
  }

  // Screen 19: Settings Hub
  const links: Array<{ id: ScreenId; label: string; icon: typeof Shield }> = [
    { id: 'profile', label: 'Profile & Linked Accounts', icon: User },
    { id: 'privacy-settings', label: t(lang, 'privacySettings'), icon: Shield },
    { id: 'blocked-users', label: t(lang, 'blockedUsers'), icon: Ban },
    { id: 'device-management', label: t(lang, 'deviceManagement'), icon: Laptop },
    { id: 'language-settings', label: `${t(lang, 'languageSettings')} · ${theme}`, icon: Globe },
    { id: 'av-settings', label: t(lang, 'avSettings'), icon: Video },
  ];

  return (
    <section className="max-w-2xl mx-auto space-y-6">
      <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
        {t(lang, 'settings')}
      </h1>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] divide-y divide-slate-200 dark:divide-slate-800">
        {links.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className="w-full px-6 py-4 flex items-center justify-between text-start hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
            >
              <span className="inline-flex items-center gap-3 text-sm font-medium text-slate-900 dark:text-white">
                <Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                {item.label}
              </span>
              <ChevronRight className="h-4 w-4 text-slate-400 rtl:rotate-180" />
            </button>
          );
        })}

        <button
          type="button"
          onClick={onOpenAdmin}
          className="w-full px-6 py-4 flex items-center justify-between text-start hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
        >
          <span className="inline-flex items-center gap-3 text-sm font-medium text-slate-900 dark:text-white">
            <Sliders className="h-4 w-4 text-indigo-500" />
            {t(lang, 'adminConsole')}
          </span>
          <ChevronRight className="h-4 w-4 text-slate-400 rtl:rotate-180" />
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <LogOut className="h-4 w-4" />
            {t(lang, 'signOut')}
          </button>
          <button
            type="button"
            onClick={onSignOutAllDevices}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {t(lang, 'signOutAllDevices')}
          </button>
        </div>

        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-red-500/30 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10"
          >
            <Trash2 className="h-4 w-4" />
            {t(lang, 'deleteAccount')}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDeleteAccount}
              className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700"
            >
              Confirm Permanent Deletion
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
