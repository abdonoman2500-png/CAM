import { useState } from 'react';
import { Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Users, Video } from 'lucide-react';
import type { CallRecord, Language, PublicProfile } from '../types/crosscall';
import { t } from '../i18n/translations';
import { filterCallHistory, formatCallDuration, type HistoryFilter } from '../utils/callRules';

interface CallHistoryViewProps {
  lang: Language;
  currentUserId: string;
  calls: CallRecord[];
  contacts: PublicProfile[];
  onStartCall: (target: PublicProfile, type: 'audio' | 'video') => void;
  onJoinRoom: (roomId: string) => void;
}

export function CallHistoryView({
  lang,
  currentUserId,
  calls,
  contacts,
  onStartCall,
  onJoinRoom,
}: CallHistoryViewProps) {
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const filtered = filterCallHistory(calls, filter, currentUserId);

  const tabs: Array<{ id: HistoryFilter; label: string }> = [
    { id: 'all', label: t(lang, 'all') },
    { id: 'outgoing', label: t(lang, 'outgoing') },
    { id: 'incoming', label: t(lang, 'incoming') },
    { id: 'missed', label: t(lang, 'missed') },
    { id: 'rejected', label: t(lang, 'rejected') },
  ];

  function handleRedial(call: CallRecord) {
    if (call.callType === 'group') {
      onJoinRoom(call.roomId);
      return;
    }
    const targetId = call.callerId === currentUserId ? call.calleeId : call.callerId;
    const matched = contacts.find((c) => c.id === targetId);
    if (matched) {
      onStartCall(matched, call.callType === 'video' ? 'video' : 'audio');
      return;
    }
    if (targetId) {
      onStartCall(
        {
          id: targetId,
          username: call.callerId === currentUserId ? (call.calleeUsername ?? 'user') : call.callerUsername,
          fullName: call.callerId === currentUserId ? (call.calleeName ?? 'Contact') : call.callerName,
          avatarUrl: call.callerId === currentUserId ? (call.calleeAvatar ?? null) : call.callerAvatar,
          role: 'user',
          presence: 'online',
          lastSeenAt: null,
        },
        call.callType === 'video' ? 'video' : 'audio'
      );
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          {t(lang, 'history')}
        </h1>
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                filter === tab.id
                  ? 'bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6">
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
            {t(lang, 'noCalls')}
          </p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {filtered.map((call) => {
              const isOutgoing = call.callerId === currentUserId;
              const title =
                call.callType === 'group'
                  ? call.title || call.roomId
                  : isOutgoing
                    ? call.calleeName || call.calleeUsername || 'Contact'
                    : call.callerName;
              const Icon =
                call.callType === 'group'
                  ? Users
                  : call.status === 'missed' || call.status === 'rejected'
                    ? PhoneMissed
                    : isOutgoing
                      ? PhoneOutgoing
                      : PhoneIncoming;

              return (
                <li key={call.id} className="py-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                        call.status === 'missed' || call.status === 'rejected'
                          ? 'bg-red-500/10 text-red-500'
                          : 'bg-blue-500/10 text-blue-500'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        {call.callType} · {call.status} · {formatCallDuration(call.duration)} ·{' '}
                        {new Date(call.startedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRedial(call)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-colors whitespace-nowrap"
                  >
                    {call.callType === 'video' ? <Video className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />}
                    {call.callType === 'group' ? t(lang, 'joinRoom') : t(lang, 'redial')}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
