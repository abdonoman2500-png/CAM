import { useState, type FormEvent } from 'react';
import { Phone, Plus, Search, Users, Video } from 'lucide-react';
import type { CallRecord, Language, PublicProfile, ScreenId } from '../types/crosscall';
import { t } from '../i18n/translations';
import { formatCallDuration, sanitizeRoomSlug } from '../utils/callRules';
import { Avatar } from './Avatar';

interface HomeViewProps {
  lang: Language;
  currentUser: PublicProfile;
  contacts: PublicProfile[];
  recentCalls: CallRecord[];
  onStartCall: (target: PublicProfile, type: 'audio' | 'video') => void;
  onCreateRoom: (title: string) => void;
  onJoinRoom: (roomId: string) => void;
  onNavigate: (s: ScreenId) => void;
}

export function HomeView({
  lang,
  currentUser,
  contacts,
  recentCalls,
  onStartCall,
  onCreateRoom,
  onJoinRoom,
  onNavigate,
}: HomeViewProps) {
  const [roomTitle, setRoomTitle] = useState('');
  const [joinCode, setJoinCode] = useState('');

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    onCreateRoom(roomTitle.trim() || `${currentUser.fullName.split(' ')[0]}'s Room`);
    setRoomTitle('');
  }

  function handleJoin(e: FormEvent) {
    e.preventDefault();
    if (!joinCode.trim()) return;
    onJoinRoom(sanitizeRoomSlug(joinCode));
    setJoinCode('');
  }

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 sm:p-8 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
              <span dir="ltr" className="inline-block">@{currentUser.username}</span> · {currentUser.presence}
            </p>
            <h1 className="mt-2 font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white text-balance">
              {currentUser.fullName}
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-xl">
              {t(lang, 'tagline')}
            </p>
          </div>

          <form onSubmit={handleCreate} className="mt-6 flex flex-col sm:flex-row gap-3">
            <label htmlFor="home-room-title" className="sr-only">
              {t(lang, 'newMeeting')}
            </label>
            <input
              id="home-room-title"
              type="text"
              value={roomTitle}
              onChange={(e) => setRoomTitle(e.target.value)}
              placeholder={t(lang, 'newMeeting')}
              className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F19] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" />
              {t(lang, 'createRoom')}
            </button>
          </form>
        </div>

        <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 sm:p-8 flex flex-col justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
              {t(lang, 'joinMeeting')}
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {t(lang, 'roomCodePlaceholder')}
            </p>
          </div>

          <form onSubmit={handleJoin} className="mt-6 space-y-3">
            <label htmlFor="join-room-code" className="sr-only">
              {t(lang, 'joinMeeting')}
            </label>
            <input
              id="join-room-code"
              type="text"
              required
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder={t(lang, 'roomCodePlaceholder')}
              className="w-full font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F19] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white text-sm font-medium px-4 py-2.5 transition-colors"
            >
              <Users className="h-4 w-4" />
              {t(lang, 'joinRoom')}
            </button>
          </form>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
              {t(lang, 'onlineNow')}
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('search')}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
            >
              <Search className="h-3.5 w-3.5" />
              {t(lang, 'searchUsers')}
            </button>
          </div>

          {contacts.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-6">{t(lang, 'noContacts')}</p>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {contacts.map((c) => (
                <li key={c.id} className="py-3.5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={c.fullName} src={c.avatarUrl} presence={c.presence} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {c.fullName}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        <span dir="ltr" className="inline-block">@{c.username}</span> · {c.presence}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      aria-label={`${t(lang, 'audioCall')} ${c.fullName}`}
                      onClick={() => onStartCall(c, 'audio')}
                      className="h-10 w-10 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 flex items-center justify-center transition-colors"
                    >
                      <Phone className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`${t(lang, 'videoCall')} ${c.fullName}`}
                      onClick={() => onStartCall(c, 'video')}
                      className="h-10 w-10 rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center justify-center transition-colors"
                    >
                      <Video className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
              {t(lang, 'recentCalls')}
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('call-history')}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
            >
              {t(lang, 'all')}
            </button>
          </div>

          {recentCalls.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-6">{t(lang, 'noCalls')}</p>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {recentCalls.slice(0, 5).map((call) => {
                const label =
                  call.callType === 'group'
                    ? call.title || call.roomId
                    : call.callerId === currentUser.id
                      ? call.calleeName || call.calleeUsername || 'Contact'
                      : call.callerName;
                return (
                  <li key={call.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {label}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        {call.callType} · {call.status} · {formatCallDuration(call.duration)}
                      </p>
                    </div>
                    {call.callType === 'group' ? (
                      <button
                        type="button"
                        onClick={() => onJoinRoom(call.roomId)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                      >
                        {t(lang, 'joinRoom')}
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
