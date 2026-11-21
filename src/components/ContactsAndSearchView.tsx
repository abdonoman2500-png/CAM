import { useEffect, useState, type FormEvent } from 'react';
import { Ban, Flag, Link2, Phone, Search, Unlink, UserCheck, UserMinus, UserPlus, Video } from 'lucide-react';
import type { AuthProvider, Language, LinkedIdentity, PublicProfile, ScreenId } from '../types/crosscall';
import { t, tAuthError } from '../i18n/translations';
import { api, ApiAuthError } from '../services/api';
import { runOAuthPopup } from '../utils/oauthPopup';
import { Avatar } from './Avatar';

interface ContactsAndSearchProps {
  mode: 'contacts' | 'search' | 'profile';
  lang: Language;
  currentUser: PublicProfile;
  selectedProfile: PublicProfile | null;
  contacts: PublicProfile[];
  pendingRequests: Array<{ friendshipId: string; user: PublicProfile }>;
  onSelectProfile: (user: PublicProfile) => void;
  onStartCall: (target: PublicProfile, type: 'audio' | 'video') => void;
  onRefreshContacts: () => Promise<void>;
  onProfileUpdated: (user: PublicProfile) => void;
  onNavigate: (s: ScreenId) => void;
}

export function ContactsAndSearchView({
  mode,
  lang,
  currentUser,
  selectedProfile,
  contacts,
  pendingRequests,
  onSelectProfile,
  onStartCall,
  onRefreshContacts,
  onProfileUpdated,
  onNavigate,
}: ContactsAndSearchProps) {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PublicProfile[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [showReportBox, setShowReportBox] = useState(false);

  // Own profile editing & linked accounts
  const viewingProfile = selectedProfile ?? currentUser;
  const isOwnProfile = viewingProfile.id === currentUser.id;
  const [editFullName, setEditFullName] = useState(currentUser.fullName);
  const [editUsername, setEditUsername] = useState(currentUser.username);
  const [editEmail, setEditEmail] = useState(currentUser.email ?? '');
  const [editPhone, setEditPhone] = useState(currentUser.phone ?? '');
  const [identities, setIdentities] = useState<LinkedIdentity[]>([]);
  const [linkingProvider, setLinkingProvider] = useState<'google' | 'apple' | null>(null);

  useEffect(() => {
    if (mode === 'profile' && isOwnProfile) {
      api
        .getIdentities()
        .then((res) => setIdentities(res.identities))
        .catch(() => {
          // ignore transient fetch failure
        });
    }
  }, [mode, isOwnProfile]);

  async function handleLinkOAuth(provider: 'google' | 'apple') {
    setErrorMsg(null);
    setStatusMsg(null);
    setLinkingProvider(provider);
    try {
      const res = await runOAuthPopup(provider, 'link');
      onProfileUpdated(res.user);
      const idRes = await api.getIdentities();
      setIdentities(idRes.identities);
      setStatusMsg(t(lang, 'saved'));
    } catch (err) {
      if (err instanceof ApiAuthError && err.code) {
        setErrorMsg(
          err.code === 'NETWORK_ERROR' && err.message === 'Popup blocked'
            ? t(lang, 'popupBlocked')
            : tAuthError(lang, err.code, err.message)
        );
      } else {
        setErrorMsg(err instanceof Error ? err.message : tAuthError(lang, 'NETWORK_ERROR'));
      }
    } finally {
      setLinkingProvider(null);
    }
  }

  async function handleUnlinkProvider(provider: AuthProvider) {
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await api.unlinkIdentity(provider);
      setIdentities(res.identities);
      setStatusMsg(t(lang, 'saved'));
    } catch (err) {
      if (err instanceof ApiAuthError && err.code) {
        setErrorMsg(tAuthError(lang, err.code, err.message));
      } else {
        setErrorMsg(err instanceof Error ? err.message : tAuthError(lang, 'NETWORK_ERROR'));
      }
    }
  }

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    try {
      const res = await api.searchUsers(query);
      setSearchResults(res.users);
      setHasSearched(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Search failed');
    }
  }

  async function handleAddContact(userId: string) {
    setErrorMsg(null);
    try {
      await api.sendContactRequest(userId);
      setStatusMsg(t(lang, 'requestSent'));
      if (hasSearched) {
        const res = await api.searchUsers(query);
        setSearchResults(res.users);
      }
      await onRefreshContacts();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not send request');
    }
  }

  async function handleRespond(userId: string, action: 'accept' | 'decline') {
    await api.respondContactRequest(userId, action);
    await onRefreshContacts();
  }

  async function handleRemoveContact(userId: string) {
    await api.removeContact(userId);
    await onRefreshContacts();
    setStatusMsg(t(lang, 'saved'));
  }

  async function handleBlockUser(userId: string) {
    await api.blockUser(userId);
    await onRefreshContacts();
    onNavigate('contacts');
  }

  async function handleReportSubmit(e: FormEvent) {
    e.preventDefault();
    if (!reportReason.trim()) return;
    try {
      await api.reportUser(viewingProfile.id, reportReason);
      setShowReportBox(false);
      setReportReason('');
      setStatusMsg('Report submitted to moderation team.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not submit report');
    }
  }

  async function handleSaveOwnProfile(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await api.updateProfile({
        fullName: editFullName,
        username: editUsername,
        email: editEmail.trim() || null,
        phone: editPhone.trim() || null,
      });
      onProfileUpdated(res.user);
      setStatusMsg(t(lang, 'saved'));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update profile');
    }
  }

  if (mode === 'profile') {
    return (
      <section className="max-w-3xl mx-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 sm:p-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-4">
            <Avatar name={viewingProfile.fullName} src={viewingProfile.avatarUrl} size="lg" presence={viewingProfile.presence} />
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                {viewingProfile.fullName}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                <span dir="ltr" className="inline-block">@{viewingProfile.username}</span> · {viewingProfile.presence}
              </p>
            </div>
          </div>

          {!isOwnProfile && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onStartCall(viewingProfile, 'audio')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium whitespace-nowrap"
              >
                <Phone className="h-4 w-4" />
                {t(lang, 'audioCall')}
              </button>
              <button
                type="button"
                onClick={() => onStartCall(viewingProfile, 'video')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium whitespace-nowrap"
              >
                <Video className="h-4 w-4" />
                {t(lang, 'videoCall')}
              </button>
            </div>
          )}
        </div>

        {statusMsg && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-600 dark:text-emerald-400">
            {statusMsg}
          </div>
        )}
        {errorMsg && (
          <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">
            {errorMsg}
          </div>
        )}

        {isOwnProfile ? (
          <div className="space-y-8">
            <form onSubmit={handleSaveOwnProfile} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="prof-fullname" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t(lang, 'fullName')}
                  </label>
                  <input
                    id="prof-fullname"
                    type="text"
                    required
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F19] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="prof-username" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t(lang, 'username')}
                  </label>
                  <input
                    id="prof-username"
                    type="text"
                    required
                    dir="ltr"
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F19] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="prof-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t(lang, 'email')}
                  </label>
                  <input
                    id="prof-email"
                    type="email"
                    dir="ltr"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F19] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="prof-phone" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t(lang, 'phone')}
                  </label>
                  <input
                    id="prof-phone"
                    type="tel"
                    dir="ltr"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F19] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  {t(lang, 'userIdLabel')}: <code dir="ltr" className="font-mono text-slate-700 dark:text-slate-300">{currentUser.id}</code>
                </span>
                {currentUser.createdAt && (
                  <span>
                    {t(lang, 'accountCreatedAt')}: {new Date(currentUser.createdAt).toLocaleDateString(lang === 'ar' ? 'ar' : 'en')}
                  </span>
                )}
              </div>

              <button
                type="submit"
                className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
              >
                {t(lang, 'saveChanges')}
              </button>
            </form>

            <div className="pt-6 border-t border-slate-200 dark:border-slate-800 space-y-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                  {t(lang, 'linkedAccounts')}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {t(lang, 'linkedAccountsHint')}
                </p>
              </div>

              <div className="divide-y divide-slate-200 dark:divide-slate-800 border-y border-slate-200 dark:border-slate-800">
                {identities.map((ident) => (
                  <div key={ident.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white capitalize">
                        {ident.provider}{' '}
                        <span className="text-xs font-normal text-emerald-600 dark:text-emerald-400">
                          · {t(lang, 'linkedStatus')}
                        </span>
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        <span dir="ltr" className="inline-block">{ident.email || ident.providerUserId}</span>
                        {ident.isPrivateRelay ? ` · ${t(lang, 'privateRelayNote')}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUnlinkProvider(ident.provider)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                    >
                      <Unlink className="h-3.5 w-3.5" />
                      {t(lang, 'unlink')}
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {!identities.some((i) => i.provider === 'google') && (
                  <button
                    type="button"
                    disabled={linkingProvider !== null}
                    onClick={() => handleLinkOAuth('google')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    {t(lang, 'linkGoogle')}
                  </button>
                )}
                {!identities.some((i) => i.provider === 'apple') && (
                  <button
                    type="button"
                    disabled={linkingProvider !== null}
                    onClick={() => handleLinkOAuth('apple')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    {t(lang, 'linkApple')}
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
              {viewingProfile.phone ? (
                <p>Phone: <span className="font-mono text-slate-900 dark:text-white">{viewingProfile.phone}</span></p>
              ) : (
                <p>Phone number hidden by user privacy policy.</p>
              )}
              <p>
                Last seen:{' '}
                {viewingProfile.lastSeenAt
                  ? new Date(viewingProfile.lastSeenAt).toLocaleString()
                  : 'Hidden'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
              {viewingProfile.isContact ? (
                <button
                  type="button"
                  onClick={() => handleRemoveContact(viewingProfile.id)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <UserMinus className="h-4 w-4" />
                  {t(lang, 'removeContact')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleAddContact(viewingProfile.id)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                >
                  <UserPlus className="h-4 w-4" />
                  {t(lang, 'addContact')}
                </button>
              )}
              <button
                type="button"
                onClick={() => handleBlockUser(viewingProfile.id)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-500/30 text-sm text-red-600 dark:text-red-400 hover:bg-red-500/10"
              >
                <Ban className="h-4 w-4" />
                {t(lang, 'blockUser')}
              </button>
              <button
                type="button"
                onClick={() => setShowReportBox((v) => !v)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Flag className="h-4 w-4" />
                {t(lang, 'reportUser')}
              </button>
            </div>

            {showReportBox && (
              <form onSubmit={handleReportSubmit} className="pt-3 flex gap-2">
                <input
                  type="text"
                  required
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  placeholder="Describe the issue..."
                  className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F19] px-3 py-2 text-sm text-slate-900 dark:text-white"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700"
                >
                  Submit
                </button>
              </form>
            )}
          </div>
        )}
      </section>
    );
  }

  if (mode === 'search') {
    return (
      <section className="space-y-6">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6">
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white mb-4">
            {t(lang, 'searchUsers')}
          </h1>
          <form onSubmit={handleSearch} className="flex gap-3">
            <label htmlFor="user-search-input" className="sr-only">
              {t(lang, 'searchUsers')}
            </label>
            <input
              id="user-search-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t(lang, 'searchPlaceholder')}
              className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F19] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium whitespace-nowrap"
            >
              <Search className="h-4 w-4" />
              {t(lang, 'searchUsers')}
            </button>
          </form>
          {statusMsg && <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">{statusMsg}</p>}
          {errorMsg && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{errorMsg}</p>}
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6">
          {!hasSearched ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t(lang, 'searchPlaceholder')}
            </p>
          ) : searchResults.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No matching users found.</p>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {searchResults.map((u) => (
                <li key={u.id} className="py-3.5 flex flex-wrap items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={() => { onSelectProfile(u); onNavigate('profile'); }}
                    className="flex items-center gap-3 text-start hover:opacity-80"
                  >
                    <Avatar name={u.fullName} src={u.avatarUrl} presence={u.presence} />
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{u.fullName}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        @{u.username} {u.phone ? `· ${u.phone}` : ''}
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center gap-2">
                    {u.friendshipStatus === 'accepted' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => onStartCall(u, 'audio')}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-emerald-600 hover:text-white"
                        >
                          {t(lang, 'audioCall')}
                        </button>
                        <button
                          type="button"
                          onClick={() => onStartCall(u, 'video')}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
                        >
                          {t(lang, 'videoCall')}
                        </button>
                      </>
                    ) : u.friendshipStatus === 'pending_sent' ? (
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        {t(lang, 'requestSent')}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAddContact(u.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        {t(lang, 'addContact')}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          {t(lang, 'contacts')}
        </h1>
        <button
          type="button"
          onClick={() => onNavigate('search')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium whitespace-nowrap"
        >
          <UserPlus className="h-4 w-4" />
          {t(lang, 'searchUsers')}
        </button>
      </div>

      {pendingRequests.length > 0 && (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white mb-4">
            Contact Requests ({pendingRequests.length})
          </h2>
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {pendingRequests.map((req) => (
              <li key={req.friendshipId} className="py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Avatar name={req.user.fullName} src={req.user.avatarUrl} />
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{req.user.fullName}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">@{req.user.username}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleRespond(req.user.id, 'accept')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700"
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    {t(lang, 'accept')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRespond(req.user.id, 'decline')}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {t(lang, 'decline')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6">
        {contacts.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
            {t(lang, 'noContacts')}
          </p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {contacts.map((c) => (
              <li key={c.id} className="py-3.5 flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => { onSelectProfile(c); onNavigate('profile'); }}
                  className="flex items-center gap-3 text-start min-w-0 hover:opacity-80"
                >
                  <Avatar name={c.fullName} src={c.avatarUrl} presence={c.presence} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{c.fullName}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      <span dir="ltr" className="inline-block">@{c.username}</span> · {c.presence}
                    </p>
                  </div>
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    aria-label={`${t(lang, 'audioCall')} ${c.fullName}`}
                    onClick={() => onStartCall(c, 'audio')}
                    className="h-10 w-10 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-emerald-600 hover:text-white flex items-center justify-center transition-colors"
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
      </section>
    </div>
  );
}
