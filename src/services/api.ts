import type {
  AdminOverview,
  AuthErrorCode,
  AuthProvider,
  AuthProviderStatus,
  CallRecord,
  LinkedIdentity,
  NotificationItem,
  PublicProfile,
  UserDevice,
  UserSettings,
} from '../types/crosscall';

export class ApiAuthError extends Error {
  code?: AuthErrorCode;
  status: number;

  constructor(message: string, status: number, code?: AuthErrorCode) {
    super(message);
    this.name = 'ApiAuthError';
    this.status = status;
    this.code = code;
  }
}

class ApiClient {
  private userToken: string | null = null;
  private adminToken: string | null = null;
  private onSessionExpired: (() => void) | null = null;

  setToken(token: string | null): void {
    this.userToken = token;
  }

  getToken(): string | null {
    return this.userToken;
  }

  setAdminToken(token: string | null): void {
    this.adminToken = token;
  }

  getAdminToken(): string | null {
    return this.adminToken;
  }

  setSessionExpiredHandler(handler: (() => void) | null): void {
    this.onSessionExpired = handler;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
    useAdminToken = false
  ): Promise<T> {
    const token = useAdminToken ? this.adminToken : this.userToken;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    let res: Response;
    try {
      res = await fetch(path, { ...options, headers });
    } catch {
      throw new ApiAuthError('Network error', 0, 'NETWORK_ERROR');
    }

    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      code?: AuthErrorCode;
    };
    if (!res.ok) {
      if (!useAdminToken && res.status === 401 && this.userToken && data.code === 'SESSION_EXPIRED') {
        this.onSessionExpired?.();
      }
      throw new ApiAuthError(
        data.error || `Request failed (${res.status})`,
        res.status,
        data.code
      );
    }
    return data as T;
  }

  getAuthProviders() {
    return this.request<AuthProviderStatus>('/api/auth/providers');
  }

  getOAuthUrl(provider: 'google' | 'apple', mode: 'login' | 'link' = 'login') {
    const redirectUri = `${window.location.origin}/auth/callback`;
    return this.request<{ url: string }>(
      `/api/auth/oauth/${provider}/url?mode=${encodeURIComponent(mode)}&redirectUri=${encodeURIComponent(redirectUri)}`
    );
  }

  exchangeOAuthTicket(ticket: string) {
    return this.request<{
      token: string;
      deviceId: string;
      mode: 'login' | 'link';
      user: PublicProfile;
      settings: UserSettings;
    }>('/api/auth/oauth/exchange', {
      method: 'POST',
      body: JSON.stringify({ ticket, deviceName: navigator.userAgent.slice(0, 60) }),
    });
  }

  refreshSession() {
    return this.request<{ token: string }>('/api/auth/refresh', { method: 'POST' });
  }

  logoutAll() {
    return this.request<{ signedOutAll: boolean }>('/api/auth/logout-all', { method: 'POST' });
  }

  getIdentities() {
    return this.request<{ identities: LinkedIdentity[] }>('/api/auth/identities');
  }

  unlinkIdentity(provider: AuthProvider) {
    return this.request<{ identities: LinkedIdentity[] }>(
      `/api/auth/identities/${encodeURIComponent(provider)}`,
      { method: 'DELETE' }
    );
  }

  login(identifier: string, password: string) {
    return this.request<{ token: string; deviceId: string; user: PublicProfile; settings: UserSettings }>(
      '/api/auth/login',
      { method: 'POST', body: JSON.stringify({ identifier, password }) }
    );
  }

  register(payload: {
    username: string;
    fullName: string;
    email?: string;
    phone?: string;
    password: string;
  }) {
    return this.request<{ token: string; deviceId: string; user: PublicProfile; settings: UserSettings }>(
      '/api/auth/register',
      { method: 'POST', body: JSON.stringify(payload) }
    );
  }

  requestOtp(target: string, channel: 'phone' | 'email' | 'reset') {
    return this.request<{ sent: boolean; expiresInSeconds: number; previewCode?: string }>(
      '/api/auth/otp/request',
      { method: 'POST', body: JSON.stringify({ target, channel }) }
    );
  }

  verifyOtp(payload: {
    target: string;
    channel: 'phone' | 'email' | 'reset';
    code: string;
    newPassword?: string;
  }) {
    return this.request<{
      verified: boolean;
      passwordReset?: boolean;
      token?: string;
      deviceId?: string;
      user?: PublicProfile;
      settings?: UserSettings;
    }>('/api/auth/otp/verify', { method: 'POST', body: JSON.stringify(payload) });
  }

  getMe() {
    return this.request<{ user: PublicProfile; settings: UserSettings }>('/api/me');
  }

  updateProfile(payload: {
    fullName?: string;
    username?: string;
    email?: string | null;
    phone?: string | null;
    needsProfileCompletion?: boolean;
  }) {
    return this.request<{ user: PublicProfile }>('/api/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  deleteAccount() {
    return this.request<{ deleted: boolean }>('/api/me', { method: 'DELETE' });
  }

  updateSettings(settings: Partial<UserSettings>) {
    return this.request<{ settings: UserSettings }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  getDevices() {
    return this.request<{ devices: UserDevice[] }>('/api/devices');
  }

  revokeDevice(id: string) {
    return this.request<{ revoked: boolean }>(`/api/devices/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  searchUsers(q: string) {
    return this.request<{ users: PublicProfile[] }>(`/api/users/search?q=${encodeURIComponent(q)}`);
  }

  getContacts() {
    return this.request<{
      contacts: PublicProfile[];
      requests: Array<{ friendshipId: string; user: PublicProfile }>;
    }>('/api/contacts');
  }

  sendContactRequest(userId: string) {
    return this.request<{ status: string }>('/api/contacts/request', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }

  respondContactRequest(userId: string, action: 'accept' | 'decline') {
    return this.request<{ status: string }>('/api/contacts/respond', {
      method: 'POST',
      body: JSON.stringify({ userId, action }),
    });
  }

  removeContact(userId: string) {
    return this.request<{ removed: boolean }>(`/api/contacts/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
  }

  getBlocked() {
    return this.request<{ blocked: PublicProfile[] }>('/api/blocks');
  }

  blockUser(userId: string) {
    return this.request<{ blocked: boolean }>('/api/blocks', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }

  unblockUser(userId: string) {
    return this.request<{ unblocked: boolean }>(`/api/blocks/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
  }

  reportUser(userId: string, reason: string) {
    return this.request<{ submitted: boolean }>('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ userId, reason }),
    });
  }

  getCallHistory() {
    return this.request<{ calls: CallRecord[] }>('/api/calls/history');
  }

  createRoom(title: string) {
    return this.request<{ roomId: string; title: string }>('/api/rooms', {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
  }

  getNotifications() {
    return this.request<{ notifications: NotificationItem[] }>('/api/notifications');
  }

  markNotificationsRead() {
    return this.request<{ updated: boolean }>('/api/notifications/read-all', { method: 'POST' });
  }

  adminBootstrapStatus() {
    return this.request<{ envConfigured: boolean; needsClaim: boolean }>('/api/admin/bootstrap-status');
  }

  adminClaim(passcode: string) {
    return this.request<{ token: string }>('/api/admin/claim', {
      method: 'POST',
      body: JSON.stringify({ passcode }),
    });
  }

  adminLogin(passcode: string) {
    return this.request<{ token: string }>('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ passcode }),
    });
  }

  adminOverview() {
    return this.request<AdminOverview>('/api/admin/overview', {}, true);
  }

  adminSuspendUser(userId: string, suspended: boolean) {
    return this.request<{ id: string; isSuspended: boolean }>(
      `/api/admin/users/${encodeURIComponent(userId)}/suspend`,
      { method: 'POST', body: JSON.stringify({ suspended }) },
      true
    );
  }

  adminResolveReport(reportId: string, action: 'actioned' | 'dismissed') {
    return this.request(
      `/api/admin/reports/${encodeURIComponent(reportId)}`,
      { method: 'POST', body: JSON.stringify({ action }) },
      true
    );
  }

  adminUpdateAppSettings(settings: AdminOverview['appSettings']) {
    return this.request(
      '/api/admin/app-settings',
      { method: 'PUT', body: JSON.stringify(settings) },
      true
    );
  }
}

export const api = new ApiClient();
