import { Bell, CheckCheck } from 'lucide-react';
import type { Language, NotificationItem } from '../types/crosscall';
import { t } from '../i18n/translations';

interface NotificationsViewProps {
  lang: Language;
  notifications: NotificationItem[];
  onMarkAllRead: () => void;
}

export function NotificationsView({ lang, notifications, onMarkAllRead }: NotificationsViewProps) {
  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          {t(lang, 'notifications')}
        </h1>
        {notifications.some((n) => !n.isRead) && (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            {t(lang, 'markAllRead')}
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6">
        {notifications.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
            {t(lang, 'noNotifications')}
          </p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {notifications.map((item) => (
              <li key={item.id} className="py-4 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                      item.isRead
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                        : 'bg-blue-600/15 text-blue-600 dark:text-blue-400'
                    }`}
                  >
                    <Bell className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{item.body}</p>
                    <p className="mt-1 text-xs text-slate-400 tabular-nums">
                      {new Date(item.createdAt).toLocaleString()} · {item.isRead ? 'Read' : 'Unread'}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
