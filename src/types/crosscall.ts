export type Language = 'en' | 'ar';
export type ThemeMode = 'dark' | 'light';
export type PresenceStatus = 'online' | 'busy' | 'offline';
export type CallType = 'audio' | 'video' | 'group';
export type CallStatus = 'ringing' | 'active' | 'ended' | 'missed' | 'rejected';
export type UserRole = 'user' | 'moderator' | 'admin';
export type AuthProvider = 'google' | 'apple' | 'email' | 'phone';

export type AuthErrorCode =
  | 'GOOGLE_OAUTH_FAILED'
  | 'APPLE_AUTH_FAILED'
  | 'INVALID_REDIRECT_URL'
  | 'EMAIL_ALREADY_REGISTERED'
  | 'ACCOUNT_LINKING_REQUIRED'
  | 'USER_CANCELLED_LOGIN'
  | 'SESSION_EXPIRED'
  | 'NETWORK_ERROR'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'EMAIL_NOT_VERIFIED'
  | 'CANNOT_UNLINK_LAST_METHOD';

export interface LinkedIdentity {
  id: string;
  provider: AuthProvider;
  providerUserId: string;
  email: string | null;
  isPrivateRelay: boolean;
  linkedAt: string;
  lastSignInAt: string;
}

export interface AuthProviderStatus {
  appName?: string;
  google: boolean;
  apple: boolean;
  supabase: boolean;
  email: boolean;
  phoneOtp: boolean;
  missingEnvVars?: {
    supabase: string[];
    google: string[];
    apple: string[];
    security: string[];
  };
}

export type ScreenId =
  | 'splash'
  | 'onboarding'
  | 'login'
  | 'register'
  | 'otp-verify'
  | 'email-verify'
  | 'forgot-password'
  | 'complete-profile'
  | 'home'
  | 'contacts'
  | 'search'
  | 'profile'
  | 'incoming-call'
  | 'outgoing-call'
  | 'active-audio-call'
  | 'active-video-call'
  | 'group-call'
  | 'call-history'
  | 'notifications'
  | 'settings'
  | 'privacy-settings'
  | 'blocked-users'
  | 'device-management'
  | 'language-settings'
  | 'av-settings'
  | 'web-meeting'
  | 'admin-dashboard';

export interface PrivacySettings {
  lastSeen: 'everyone' | 'contacts' | 'nobody';
  allowPhoneSearch: boolean;
  readReceipts: boolean;
}

export interface NotificationSettings {
  incomingCalls: boolean;
  missedCalls: boolean;
  friendRequests: boolean;
}

export interface MediaSettings {
  videoQuality: 'auto' | '1080p' | '720p' | '360p';
  noiseSuppression: boolean;
  backgroundBlur: boolean;
  preferredMicId?: string;
  preferredSpeakerId?: string;
  preferredCameraId?: string;
}

export interface UserSettings {
  language: Language;
  theme: ThemeMode;
  privacy: PrivacySettings;
  notifications: NotificationSettings;
  media: MediaSettings;
}

export interface PublicProfile {
  id: string;
  username: string;
  fullName: string;
  avatarUrl: string | null;
  email?: string;
  emailVerified?: boolean;
  phone?: string | null;
  phoneVerified?: boolean;
  role: UserRole;
  presence: PresenceStatus;
  lastSeenAt: string | null;
  createdAt?: string;
  needsProfileCompletion?: boolean;
  linkedProviders?: AuthProvider[];
  isContact?: boolean;
  friendshipStatus?: 'none' | 'pending_sent' | 'pending_received' | 'accepted';
  isBlocked?: boolean;
  isSuspended?: boolean;
}

export interface UserDevice {
  id: string;
  platform: 'android' | 'ios' | 'web';
  deviceName: string;
  createdAt: string;
  lastActiveAt: string;
  isCurrent?: boolean;
}

export interface CallParticipantInfo {
  userId: string;
  username: string;
  fullName: string;
  avatarUrl: string | null;
  role: 'host' | 'participant';
  joinedAt: string;
  micEnabled: boolean;
  cameraEnabled: boolean;
  isSpeaking?: boolean;
}

export interface CallRecord {
  id: string;
  roomId: string;
  callerId: string;
  callerName: string;
  callerUsername: string;
  callerAvatar: string | null;
  calleeId?: string;
  calleeName?: string;
  calleeUsername?: string;
  calleeAvatar?: string | null;
  callType: CallType;
  status: CallStatus;
  title?: string;
  startedAt: string;
  endedAt: string | null;
  duration: number;
  participants: Array<{
    userId: string;
    fullName: string;
    username: string;
    avatarUrl: string | null;
    role: 'host' | 'participant';
  }>;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  type: 'missed_call' | 'friend_request' | 'room_invite' | 'security' | 'system';
  isRead: boolean;
  createdAt: string;
}

export interface InCallMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  fileName?: string;
  fileSize?: string;
  createdAt: string;
}

export interface UserReport {
  id: string;
  reporterUsername: string;
  reportedUserId: string;
  reportedUsername: string;
  reason: string;
  status: 'open' | 'actioned' | 'dismissed';
  createdAt: string;
}

export interface AdminOverview {
  totalUsers: number;
  activeConnections: number;
  totalCalls: number;
  ongoingCalls: number;
  livekitStatus: 'ready' | 'signaling_fallback';
  databaseStatus: 'connected';
  uptimeSeconds: number;
  openReports: number;
  appSettings: {
    allowRegistration: boolean;
    maxGroupParticipants: number;
    maintenanceMode: boolean;
  };
  reports: UserReport[];
  users: PublicProfile[];
}
