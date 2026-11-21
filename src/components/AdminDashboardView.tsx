import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, Shield, ShieldAlert, Users } from 'lucide-react';
import type { AdminOverview, Language } from '../types/crosscall';
import { t } from '../i18n/translations';
import { api } from '../services/api';

interface AdminDashboardViewProps {
  lang: Language;
  onExit: () => void;
}

export function AdminDashboardView({ lang, onExit }: AdminDashboardViewProps) {
  const [needsClaim, setNeedsClaim] = useState<boolean | null>(null);
  const [passcode, setPasscode] = useState('');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadOverview() {
    const data = await api.adminOverview();
    setOverview(data);
  }

  useEffect(() => {
    if (api.getAdminToken()) {
      loadOverview().catch(() => {
        api.setAdminToken(null);
      });
    }
    api.adminBootstrapStatus().then((s) => setNeedsClaim(s.needsClaim)).catch(() => setNeedsClaim(false));
  }, []);

  async function handleAuth(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = needsClaim ? await api.adminClaim(passcode) : await api.adminLogin(passcode);
      api.setAdminToken(res.token);
      setNeedsClaim(false);
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Admin authentication failed');
    } finally {
      setLoading(false);
    }
  }

  if (!overview) {
    return (
      <main className="min-h-screen bg-slate-50 dark:bg-[#0B0F19] px-6 py-10 flex flex-col justify-center">
        <div className="max-w-md w-full mx-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div className="h-10 w-10 rounded-xl bg-indigo-600/15 text-indigo-500 flex items-center justify-center">
              <Shield className="h-5 w-5" />
            </div>
            <button
              type="button"
              onClick={onExit}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
              {t(lang, 'backToApp')}
            </button>
          </div>

          <div>
            <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              {needsClaim ? t(lang, 'adminSetupTitle') : t(lang, 'adminLoginTitle')}
            </h1>
            {needsClaim && (
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                {t(lang, 'adminSetupBody')}
              </p>
            )}
          </div>

          {error && (
            <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-500">
              {error}
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label htmlFor="admin-passcode-input" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t(lang, 'adminPasscode')}
              </label>
              <input
                id="admin-passcode-input"
                type="password"
                required
                minLength={8}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Min 8 characters"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F19] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading || needsClaim === null}
              className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
            >
              {t(lang, 'unlockConsole')}
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-indigo-500" />
            <span className="font-display text-lg font-bold whitespace-nowrap">
              CrossCall Admin
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => loadOverview()}
              className="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={onExit}
              className="px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium whitespace-nowrap"
            >
              {t(lang, 'backToApp')}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6 space-y-8">
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Users', value: overview.totalUsers },
            { label: 'Active WebSocket Users', value: overview.activeConnections },
            { label: 'Total Calls Logged', value: overview.totalCalls },
            { label: 'Ongoing Calls', value: overview.ongoingCalls },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5">
              <p className="text-xs text-slate-500 dark:text-slate-400">{stat.label}</p>
              <p className="mt-2 font-display text-2xl font-bold tabular-nums">{stat.value}</p>
            </div>
          ))}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-amber-500" />
                Moderation Reports ({overview.openReports} open)
              </h2>
            </div>

            {overview.reports.length === 0 ? (
              <p className="text-sm text-slate-500">No abuse reports.</p>
            ) : (
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {overview.reports.map((rep) => (
                  <li key={rep.id} className="py-3.5 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold">
                        @{rep.reportedUsername} · {rep.status}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Reported by @{rep.reporterUsername} — {rep.reason}
                      </p>
                    </div>
                    {rep.status === 'open' && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            await api.adminResolveReport(rep.id, 'actioned');
                            await loadOverview();
                          }}
                          className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700"
                        >
                          Ban User
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await api.adminResolveReport(rep.id, 'dismissed');
                            await loadOverview();
                          }}
                          className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 space-y-5">
            <h2 className="font-display text-lg font-semibold">Infrastructure &amp; App Controls</h2>
            <div className="text-sm space-y-2 text-slate-600 dark:text-slate-300">
              <p>Signaling Engine: <span className="font-mono">{overview.livekitStatus}</span></p>
              <p>Database: <span className="font-mono text-emerald-500">{overview.databaseStatus}</span></p>
              <p>Server Uptime: <span className="font-mono tabular-nums">{overview.uptimeSeconds}s</span></p>
              <p className="text-xs text-slate-500 pt-1">
                Private call media and in-call messages are never accessible from this console.
              </p>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <label className="flex items-center justify-between text-sm cursor-pointer">
                <span>Allow New Registrations</span>
                <input
                  type="checkbox"
                  checked={overview.appSettings.allowRegistration}
                  onChange={async (e) => {
                    await api.adminUpdateAppSettings({
                      ...overview.appSettings,
                      allowRegistration: e.target.checked,
                    });
                    await loadOverview();
                  }}
                  className="h-4 w-4 accent-indigo-600"
                />
              </label>
              <label className="flex items-center justify-between text-sm cursor-pointer">
                <span>Maintenance Mode</span>
                <input
                  type="checkbox"
                  checked={overview.appSettings.maintenanceMode}
                  onChange={async (e) => {
                    await api.adminUpdateAppSettings({
                      ...overview.appSettings,
                      maintenanceMode: e.target.checked,
                    });
                    await loadOverview();
                  }}
                  className="h-4 w-4 accent-indigo-600"
                />
              </label>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 space-y-4">
          <h2 className="font-display text-lg font-semibold flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-500" />
            Registered Users ({overview.users.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-start">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                <tr>
                  <th className="py-2.5 text-start font-medium">User</th>
                  <th className="py-2.5 text-start font-medium">Username</th>
                  <th className="py-2.5 text-start font-medium">Presence</th>
                  <th className="py-2.5 text-end font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {overview.users.map((u) => (
                  <tr key={u.id}>
                    <td className="py-3 font-medium">{u.fullName}</td>
                    <td className="py-3 font-mono text-xs text-slate-500">@{u.username}</td>
                    <td className="py-3 text-xs">{u.isSuspended ? 'Suspended' : u.presence}</td>
                    <td className="py-3 text-end">
                      <button
                        type="button"
                        onClick={async () => {
                          await api.adminSuspendUser(u.id, !u.isSuspended);
                          await loadOverview();
                        }}
                        className={`px-3 py-1 rounded-md text-xs font-medium ${
                          u.isSuspended
                            ? 'bg-emerald-600 text-white'
                            : 'border border-red-500/30 text-red-500 hover:bg-red-500/10'
                        }`}
                      >
                        {u.isSuspended ? 'Restore' : 'Suspend'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
