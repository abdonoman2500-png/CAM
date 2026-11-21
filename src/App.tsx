/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { Bell, Clock, Home, PhoneCall, Settings, Users } from 'lucide-react';
import type {
  AuthErrorCode,
  CallParticipantInfo,
  CallRecord,
  InCallMessage,
  Language,
  NotificationItem,
  PublicProfile,
  ScreenId,
  ThemeMode,
  UserSettings,
} from './types/crosscall';
import { t } from './i18n/translations';
import { api } from './services/api';
import { wsClient } from './services/wsClient';
import { playSoftTone } from './services/webrtc';
import { sanitizeRoomSlug } from './utils/callRules';
import { SplashScreen } from './components/SplashScreen';
import { OnboardingView } from './components/OnboardingView';
import { AuthViews } from './components/AuthViews';
import { CompleteProfileView } from './components/CompleteProfileView';
import { HomeView } from './components/HomeView';
import { ContactsAndSearchView } from './components/ContactsAndSearchView';
import { CallHistoryView } from './components/CallHistoryView';
import { NotificationsView } from './components/NotificationsView';
import { CallStageView, type ActiveCallSession } from './components/CallStageView';
import { SettingsViews } from './components/SettingsViews';
import { AdminDashboardView } from './components/AdminDashboardView';

function getInitialScreen(): ScreenId {
  const params = new URLSearchParams(window.location.search);
  if (params.get('admin') === '1') return 'admin-dashboard';
  if (
    params.get('autostart') === '1' ||
    params.get('meet') ||
    params.get('oauth_error') ||
    params.get('oauth_ticket')
  ) {
    return 'login';
  }
  return 'splash';
}

export default function App() {
  const [screen, setScreen] = useState<ScreenId>(getInitialScreen);
  const [lang, setLang] = useState<Language>('en');
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [currentUser, setCurrentUser] = useState<PublicProfile | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [contacts, setContacts] = useState<PublicProfile[]>([]);
  const [pendingRequests, setPendingRequests] = useState<
    Array<{ friendshipId: string; user: PublicProfile }>
  >([]);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<PublicProfile | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCallSession | null>(null);
  const [callMinimized, setCallMinimized] = useState(false);
  const [initialAuthError, setInitialAuthError] = useState<AuthErrorCode | null>(() => {
    const code = new URLSearchParams(window.location.search).get('oauth_error');
    return code ? (code as AuthErrorCode) : null;
  });

  // Sync HTML dir, lang, and .dark class
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    api.setSessionExpiredHandler(() => {
      wsClient.disconnect();
      api.setToken(null);
      setCurrentUser(null);
      setActiveCall(null);
      setScreen('login');
    });
    return () => api.setSessionExpiredHandler(null);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ticket = params.get('oauth_ticket');
    const oauthError = params.get('oauth_error');
    if (ticket || oauthError) {
      params.delete('oauth_ticket');
      params.delete('oauth_error');
      const cleaned = params.toString();
      window.history.replaceState({}, '', cleaned ? `/?${cleaned}` : '/');
    }
    if (ticket) {
      api
        .exchangeOAuthTicket(ticket)
        .then((res) => handleAuthSuccess({ token: res.token, user: res.user, settings: res.settings }))
        .catch(() => {
          setInitialAuthError('SESSION_EXPIRED');
          setScreen('login');
        });
    }
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const interval = window.setInterval(async () => {
      try {
        const res = await api.refreshSession();
        api.setToken(res.token);
      } catch {
        // handled by session expired handler if 401
      }
    }, 10 * 60_000);
    return () => window.clearInterval(interval);
  }, [currentUser]);

  const refreshWorkspace = useCallback(async () => {
    if (!api.getToken()) return;
    try {
      const [cRes, hRes, nRes] = await Promise.all([
        api.getContacts(),
        api.getCallHistory(),
        api.getNotifications(),
      ]);
      setContacts(cRes.contacts);
      setPendingRequests(cRes.requests);
      setCalls(hRes.calls);
      setNotifications(nRes.notifications);
    } catch {
      // ignore transient refresh failure
    }
  }, []);

  // Subscribe to real-time WebSocket signaling
  useEffect(() => {
    if (!currentUser) return;
    const unsub = wsClient.subscribe((ev) => {
      const type = String(ev.type ?? '');

      if (type === 'presence:update') {
        const uid = String(ev.userId ?? '');
        const presence = ev.presence as PublicProfile['presence'];
        setContacts((prev) => prev.map((c) => (c.id === uid ? { ...c, presence } : c)));
      }

      if (type === 'call:created') {
        const target = ev.target as PublicProfile;
        setActiveCall({
          callId: String(ev.callId),
          roomId: String(ev.roomId),
          callType: ev.callType as 'audio' | 'video',
          phase: 'outgoing',
          remoteUser: target,
          hostId: currentUser.id,
          participants: [],
          messages: [],
          startedAtMs: Date.now(),
        });
        setCallMinimized(false);
        setScreen(ev.callType === 'audio' ? 'active-audio-call' : 'active-video-call');
      }

      if (type === 'call:incoming') {
        playSoftTone(520, 220);
        const caller = ev.caller as PublicProfile;
        setActiveCall({
          callId: String(ev.callId),
          roomId: String(ev.roomId),
          callType: ev.callType as 'audio' | 'video',
          phase: 'incoming',
          remoteUser: caller,
          hostId: caller.id,
          participants: [],
          messages: [],
          startedAtMs: Date.now(),
        });
        setCallMinimized(false);
      }

      if (type === 'call:accepted') {
        playSoftTone(660, 120);
        const participants = (ev.participants as CallParticipantInfo[]) ?? [];
        setActiveCall((prev) =>
          prev
            ? {
                ...prev,
                phase: 'active',
                participants,
                startedAtMs: Date.now(),
              }
            : null
        );
      }

      if (type === 'room:state') {
        const participants = (ev.participants as CallParticipantInfo[]) ?? [];
        const messages = (ev.messages as InCallMessage[]) ?? [];
        setActiveCall((prev) =>
          prev
            ? {
                ...prev,
                phase: 'active',
                hostId: String(ev.hostId ?? prev.hostId),
                participants,
                messages,
              }
            : null
        );
      }

      if (type === 'room:chat') {
        const msg = ev.message as InCallMessage;
        setActiveCall((prev) =>
          prev ? { ...prev, messages: [...prev.messages, msg] } : null
        );
      }

      if (type === 'call:declined' || type === 'call:ended') {
        setActiveCall(null);
        setCallMinimized(false);
        setScreen((curr) =>
          curr === 'active-audio-call' || curr === 'active-video-call' || curr === 'group-call' || curr === 'web-meeting'
            ? 'home'
            : curr
        );
        refreshWorkspace();
      }
    });

    return () => {
      unsub();
    };
  }, [currentUser, refreshWorkspace]);

  async function handleAuthSuccess(data: {
    token: string;
    user: PublicProfile;
    settings: UserSettings;
  }) {
    api.setToken(data.token);
    setCurrentUser(data.user);
    setSettings(data.settings);
    setLang(data.settings.language);
    setTheme(data.settings.theme);
    wsClient.connect(data.token);
    await refreshWorkspace();

    if (data.user.needsProfileCompletion) {
      setScreen('complete-profile');
      return;
    }

    const meetParam = new URLSearchParams(window.location.search).get('meet');
    if (meetParam) {
      const slug = sanitizeRoomSlug(meetParam);
      setActiveCall({
        callId: 'prejoin',
        roomId: slug,
        callType: 'group',
        phase: 'prejoin',
        hostId: data.user.id,
        title: `Meeting · ${slug}`,
        participants: [],
        messages: [],
        startedAtMs: Date.now(),
      });
      setScreen('web-meeting');
    } else {
      setScreen('home');
    }
  }

  function handleStartCall(target: PublicProfile, type: 'audio' | 'video') {
    if (!currentUser) return;
    playSoftTone(440, 120);
    wsClient.send({ type: 'call:invite', targetUserId: target.id, callType: type });
    // Optimistically open outgoing call stage immediately
    setActiveCall({
      callId: 'pending',
      roomId: `room-${target.id.slice(0, 6)}`,
      callType: type,
      phase: 'outgoing',
      remoteUser: target,
      hostId: currentUser.id,
      participants: [],
      messages: [],
      startedAtMs: Date.now(),
    });
    setCallMinimized(false);
    setScreen(type === 'audio' ? 'active-audio-call' : 'active-video-call');
  }

  async function handleCreateRoom(title: string) {
    if (!currentUser) return;
    const res = await api.createRoom(title);
    setActiveCall({
      callId: 'prejoin',
      roomId: res.roomId,
      callType: 'group',
      phase: 'prejoin',
      hostId: currentUser.id,
      title: res.title,
      participants: [],
      messages: [],
      startedAtMs: Date.now(),
    });
    setCallMinimized(false);
    setScreen('web-meeting');
  }

  function handleJoinRoom(roomId: string) {
    if (!currentUser) return;
    const slug = sanitizeRoomSlug(roomId);
    setActiveCall({
      callId: 'prejoin',
      roomId: slug,
      callType: 'group',
      phase: 'prejoin',
      hostId: currentUser.id,
      title: `CrossCall · ${slug}`,
      participants: [],
      messages: [],
      startedAtMs: Date.now(),
    });
    setCallMinimized(false);
    setScreen('web-meeting');
  }

  async function handleUpdateSettings(partial: Partial<UserSettings>) {
    if (partial.language) setLang(partial.language);
    if (partial.theme) setTheme(partial.theme);
    const res = await api.updateSettings(partial);
    setSettings(res.settings);
  }

  function handleSignOut() {
    wsClient.disconnect();
    api.setToken(null);
    setCurrentUser(null);
    setActiveCall(null);
    setScreen('login');
  }

  async function handleDeleteAccount() {
    await api.deleteAccount();
    handleSignOut();
  }

  if (screen === 'admin-dashboard') {
    return (
      <AdminDashboardView
        lang={lang}
        onExit={() => setScreen(currentUser ? 'settings' : 'login')}
      />
    );
  }

  if (screen === 'splash') {
    return <SplashScreen lang={lang} onDone={() => setScreen('onboarding')} />;
  }

  if (screen === 'onboarding') {
    return (
      <OnboardingView
        lang={lang}
        theme={theme}
        onToggleLang={() => setLang((l) => (l === 'en' ? 'ar' : 'en'))}
        onToggleTheme={() => setTheme((th) => (th === 'dark' ? 'light' : 'dark'))}
        onComplete={() => setScreen('login')}
      />
    );
  }

  if (
    !currentUser ||
    screen === 'login' ||
    screen === 'register' ||
    screen === 'otp-verify' ||
    screen === 'email-verify' ||
    screen === 'forgot-password'
  ) {
    const authScreen =
      screen === 'register' ||
      screen === 'otp-verify' ||
      screen === 'email-verify' ||
      screen === 'forgot-password'
        ? screen
        : 'login';
    return (
      <AuthViews
        screen={authScreen}
        lang={lang}
        theme={theme}
        initialErrorCode={initialAuthError}
        onClearInitialError={() => setInitialAuthError(null)}
        onNavigate={setScreen}
        onToggleLang={() => setLang((l) => (l === 'en' ? 'ar' : 'en'))}
        onToggleTheme={() => setTheme((th) => (th === 'dark' ? 'light' : 'dark'))}
        onAuthSuccess={handleAuthSuccess}
        onOpenAdmin={() => setScreen('admin-dashboard')}
      />
    );
  }

  if (screen === 'complete-profile' || currentUser.needsProfileCompletion) {
    return (
      <CompleteProfileView
        lang={lang}
        currentUser={currentUser}
        onCompleted={(updatedUser) => {
          setCurrentUser(updatedUser);
          setScreen('home');
        }}
        onSignOut={handleSignOut}
      />
    );
  }

  const unreadAlerts = notifications.filter((n) => !n.isRead).length;
  const navItems: Array<{ id: ScreenId; label: string; icon: typeof Home }> = [
    { id: 'home', label: t(lang, 'home'), icon: Home },
    { id: 'contacts', label: t(lang, 'contacts'), icon: Users },
    { id: 'call-history', label: t(lang, 'history'), icon: Clock },
    { id: 'notifications', label: unreadAlerts > 0 ? `${t(lang, 'notifications')} (${unreadAlerts})` : t(lang, 'notifications'), icon: Bell },
    { id: 'settings', label: t(lang, 'settings'), icon: Settings },
  ];

  const showFullCallStage =
    activeCall &&
    (!callMinimized || activeCall.phase === 'incoming') &&
    (activeCall.phase === 'incoming' ||
      screen === 'active-audio-call' ||
      screen === 'active-video-call' ||
      screen === 'group-call' ||
      screen === 'web-meeting');

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100 pb-20 md:pb-8">
      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-[#0B0F19]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Wordmark */}
          <button
            type="button"
            onClick={() => {
              if (activeCall && !callMinimized) setCallMinimized(true);
              setScreen('home');
            }}
            className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
          >
            {t(lang, 'appName')}
          </button>

          {/* Zone 2: 5 concise single-line nav links */}
          <nav aria-label="Primary" className="hidden md:flex items-center gap-6 text-sm font-medium">
            {navItems.map((item) => {
              const active =
                screen === item.id ||
                (item.id === 'contacts' && (screen === 'search' || screen === 'profile')) ||
                (item.id === 'settings' && screen.endsWith('-settings')) ||
                (item.id === 'settings' && (screen === 'blocked-users' || screen === 'device-management'));
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (activeCall && !callMinimized) setCallMinimized(true);
                    if (item.id === 'contacts') setSelectedProfile(null);
                    setScreen(item.id);
                  }}
                  className={`whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'text-blue-600 dark:text-blue-400 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary CTA */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => handleCreateRoom(`${currentUser.fullName.split(' ')[0]}'s Sync`)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium whitespace-nowrap shrink-0 transition-colors"
            >
              <PhoneCall className="h-3.5 w-3.5" />
              {t(lang, 'newMeeting')}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {showFullCallStage ? (
          <CallStageView
            lang={lang}
            currentUser={currentUser}
            session={activeCall}
            minimized={false}
            onToggleMinimize={() => {
              setCallMinimized(true);
              setScreen('home');
            }}
            onAcceptIncoming={() => {
              wsClient.send({ type: 'call:accept', roomId: activeCall.roomId });
              setActiveCall((prev) =>
                prev ? { ...prev, phase: 'active', startedAtMs: Date.now() } : null
              );
              setScreen(activeCall.callType === 'audio' ? 'active-audio-call' : 'active-video-call');
            }}
            onDeclineIncoming={() => {
              wsClient.send({ type: 'call:decline', roomId: activeCall.roomId });
              setActiveCall(null);
            }}
            onJoinPrejoin={(mic, cam) => {
              wsClient.send({
                type: 'room:join',
                roomId: activeCall.roomId,
                title: activeCall.title,
                micEnabled: mic,
                cameraEnabled: cam,
              });
              setActiveCall((prev) =>
                prev ? { ...prev, phase: 'active', startedAtMs: Date.now() } : null
              );
              setScreen('group-call');
            }}
            onEndCall={(endForAll) => {
              wsClient.send({ type: 'call:end', roomId: activeCall.roomId, endForAll });
              setActiveCall(null);
              setCallMinimized(false);
              setScreen('home');
              refreshWorkspace();
            }}
            onToggleMic={(enabled) => {
              wsClient.send({
                type: 'room:media-toggle',
                roomId: activeCall.roomId,
                micEnabled: enabled,
              });
            }}
            onToggleCamera={(enabled) => {
              wsClient.send({
                type: 'room:media-toggle',
                roomId: activeCall.roomId,
                cameraEnabled: enabled,
              });
            }}
            onSendChat={(text, fileName, fileSize) => {
              wsClient.send({
                type: 'room:chat',
                roomId: activeCall.roomId,
                text,
                fileName,
                fileSize,
              });
            }}
          />
        ) : (
          <>
            {screen === 'home' && (
              <HomeView
                lang={lang}
                currentUser={currentUser}
                contacts={contacts}
                recentCalls={calls}
                onStartCall={handleStartCall}
                onCreateRoom={handleCreateRoom}
                onJoinRoom={handleJoinRoom}
                onNavigate={setScreen}
              />
            )}

            {(screen === 'contacts' || screen === 'search' || screen === 'profile') && (
              <ContactsAndSearchView
                mode={screen}
                lang={lang}
                currentUser={currentUser}
                selectedProfile={selectedProfile}
                contacts={contacts}
                pendingRequests={pendingRequests}
                onSelectProfile={setSelectedProfile}
                onStartCall={handleStartCall}
                onRefreshContacts={refreshWorkspace}
                onProfileUpdated={setCurrentUser}
                onNavigate={setScreen}
              />
            )}

            {screen === 'call-history' && (
              <CallHistoryView
                lang={lang}
                currentUserId={currentUser.id}
                calls={calls}
                contacts={contacts}
                onStartCall={handleStartCall}
                onJoinRoom={handleJoinRoom}
              />
            )}

            {screen === 'notifications' && (
              <NotificationsView
                lang={lang}
                notifications={notifications}
                onMarkAllRead={async () => {
                  await api.markNotificationsRead();
                  setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
                }}
              />
            )}

            {(screen === 'settings' ||
              screen === 'privacy-settings' ||
              screen === 'blocked-users' ||
              screen === 'device-management' ||
              screen === 'language-settings' ||
              screen === 'av-settings') &&
              settings && (
                <SettingsViews
                  screen={screen}
                  lang={lang}
                  theme={theme}
                  settings={settings}
                  onNavigate={(target) => {
                    if (target === 'profile') setSelectedProfile(currentUser);
                    setScreen(target);
                  }}
                  onUpdateSettings={handleUpdateSettings}
                  onSignOut={handleSignOut}
                  onSignOutAllDevices={async () => {
                    try {
                      await api.logoutAll();
                    } finally {
                      handleSignOut();
                    }
                  }}
                  onDeleteAccount={handleDeleteAccount}
                  onOpenAdmin={() => setScreen('admin-dashboard')}
                />
              )}
          </>
        )}
      </main>

      {/* Minimized PiP Call Bar */}
      {activeCall && callMinimized && activeCall.phase === 'active' && (
        <CallStageView
          lang={lang}
          currentUser={currentUser}
          session={activeCall}
          minimized={true}
          onToggleMinimize={() => {
            setCallMinimized(false);
            setScreen(
              activeCall.callType === 'audio'
                ? 'active-audio-call'
                : activeCall.callType === 'video'
                  ? 'active-video-call'
                  : 'group-call'
            );
          }}
          onAcceptIncoming={() => {}}
          onDeclineIncoming={() => {}}
          onJoinPrejoin={() => {}}
          onEndCall={(endForAll) => {
            wsClient.send({ type: 'call:end', roomId: activeCall.roomId, endForAll });
            setActiveCall(null);
            setCallMinimized(false);
            refreshWorkspace();
          }}
          onToggleMic={() => {}}
          onToggleCamera={() => {}}
          onSendChat={() => {}}
        />
      )}

      {/* Mobile Bottom Tab Bar (<= 15% viewport height) */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-white/95 dark:bg-[#111827]/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 items-center"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = screen === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (activeCall && !callMinimized) setCallMinimized(true);
                setScreen(item.id);
              }}
              className={`h-full flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
                active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="truncate max-w-[64px]">{item.id === 'notifications' ? t(lang, 'notifications') : item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
