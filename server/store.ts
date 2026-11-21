import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  AuthProvider,
  CallRecord,
  LinkedIdentity,
  NotificationItem,
  PublicProfile,
  UserDevice,
  UserReport,
  UserRole,
  UserSettings,
} from '../src/types/crosscall';
import { canViewLastSeen, canViewUserPhone } from '../src/utils/callRules';

export interface StoredUser {
  id: string;
  username: string;
  fullName: string;
  avatarUrl: string | null;
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
  phoneVerified: boolean;
  passwordHash: string | null;
  role: UserRole;
  presence: 'online' | 'busy' | 'offline';
  lastSeenAt: string;
  needsProfileCompletion: boolean;
  isSuspended: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StoredIdentity extends LinkedIdentity {
  userId: string;
}

export interface StoredDevice extends UserDevice {
  userId: string;
  isRevoked: boolean;
}

export interface StoredOtpChallenge {
  id: string;
  target: string;
  channel: 'phone' | 'email' | 'reset';
  codeHash: string;
  attempts: number;
  maxAttempts: number;
  expiresAt: number;
  consumedAt: number | null;
}

export interface StoredFriendship {
  id: string;
  requesterId: string;
  receiverId: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
}

export interface StoredBlock {
  userId: string;
  blockedUserId: string;
  createdAt: string;
}

export interface StoredNotification extends NotificationItem {
  userId: string;
}

export interface DatabaseSchema {
  users: StoredUser[];
  identities: StoredIdentity[];
  settings: Record<string, UserSettings>;
  devices: StoredDevice[];
  friendships: StoredFriendship[];
  blocks: StoredBlock[];
  calls: CallRecord[];
  notifications: StoredNotification[];
  reports: UserReport[];
  otpChallenges: StoredOtpChallenge[];
  adminCredentialHash: string | null;
  appSettings: {
    allowRegistration: boolean;
    maxGroupParticipants: number;
    maintenanceMode: boolean;
  };
}

const DATA_DIR = path.resolve(process.cwd(), '.crosscall-data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

function defaultSettings(): UserSettings {
  return {
    language: 'en',
    theme: 'dark',
    privacy: {
      lastSeen: 'contacts',
      allowPhoneSearch: false,
      readReceipts: true,
    },
    notifications: {
      incomingCalls: true,
      missedCalls: true,
      friendRequests: true,
    },
    media: {
      videoQuality: 'auto',
      noiseSuppression: true,
      backgroundBlur: false,
    },
  };
}

function createInitialDb(): DatabaseSchema {
  return {
    users: [],
    identities: [],
    settings: {},
    devices: [],
    friendships: [],
    blocks: [],
    calls: [],
    notifications: [],
    reports: [],
    otpChallenges: [],
    adminCredentialHash: null,
    appSettings: {
      allowRegistration: true,
      maxGroupParticipants: 25,
      maintenanceMode: false,
    },
  };
}

class CrossCallStore {
  private data: DatabaseSchema;

  constructor() {
    this.data = this.load();
  }

  private load(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_PATH)) {
        const raw = fs.readFileSync(DB_PATH, 'utf8');
        const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
        return {
          ...createInitialDb(),
          ...parsed,
          identities: parsed.identities ?? [],
        };
      }
    } catch {
      // Fallback to clean schema if snapshot unreadable
    }
    const fresh = createInitialDb();
    this.saveData(fresh);
    return fresh;
  }

  private saveData(snapshot: DatabaseSchema): void {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${DB_PATH}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 2), 'utf8');
    fs.renameSync(tmp, DB_PATH);
  }

  save(): void {
    this.saveData(this.data);
  }

  get db(): DatabaseSchema {
    return this.data;
  }

  getUserSettings(userId: string): UserSettings {
    if (!this.data.settings[userId]) {
      this.data.settings[userId] = defaultSettings();
      this.save();
    }
    return this.data.settings[userId];
  }

  getUserIdentities(userId: string): StoredIdentity[] {
    return this.data.identities.filter((id) => id.userId === userId);
  }

  upsertIdentity(params: {
    userId: string;
    provider: AuthProvider;
    providerUserId: string;
    email: string | null;
    isPrivateRelay?: boolean;
  }): StoredIdentity {
    const now = new Date().toISOString();
    const existing = this.data.identities.find(
      (id) => id.provider === params.provider && id.providerUserId === params.providerUserId
    );
    if (existing) {
      existing.lastSignInAt = now;
      if (params.email) existing.email = params.email;
      this.save();
      return existing;
    }
    const created: StoredIdentity = {
      id: crypto.randomUUID(),
      userId: params.userId,
      provider: params.provider,
      providerUserId: params.providerUserId,
      email: params.email,
      isPrivateRelay: Boolean(params.isPrivateRelay),
      linkedAt: now,
      lastSignInAt: now,
    };
    this.data.identities.push(created);
    this.save();
    return created;
  }

  isBlockedBetween(userA: string, userB: string): boolean {
    return this.data.blocks.some(
      (b) =>
        (b.userId === userA && b.blockedUserId === userB) ||
        (b.userId === userB && b.blockedUserId === userA)
    );
  }

  isContact(userId: string, otherId: string): boolean {
    return this.data.friendships.some(
      (f) =>
        f.status === 'accepted' &&
        ((f.requesterId === userId && f.receiverId === otherId) ||
          (f.requesterId === otherId && f.receiverId === userId))
    );
  }

  getFriendshipStatus(
    viewerId: string,
    targetId: string
  ): 'none' | 'pending_sent' | 'pending_received' | 'accepted' {
    const f = this.data.friendships.find(
      (fr) =>
        (fr.requesterId === viewerId && fr.receiverId === targetId) ||
        (fr.requesterId === targetId && fr.receiverId === viewerId)
    );
    if (!f || f.status === 'declined') return 'none';
    if (f.status === 'accepted') return 'accepted';
    return f.requesterId === viewerId ? 'pending_sent' : 'pending_received';
  }

  toPublicProfile(user: StoredUser, viewerId: string, includeEmail = false): PublicProfile {
    const isOwn = user.id === viewerId;
    const settings = this.getUserSettings(user.id);
    const contact = isOwn ? true : this.isContact(viewerId, user.id);
    const blocked = isOwn
      ? false
      : this.data.blocks.some((b) => b.userId === viewerId && b.blockedUserId === user.id);
    const linkedProviders = isOwn
      ? this.getUserIdentities(user.id).map((i) => i.provider)
      : undefined;

    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      email: isOwn || includeEmail ? (user.email ?? undefined) : undefined,
      emailVerified: isOwn ? user.emailVerified : undefined,
      phone: canViewUserPhone(settings.privacy.allowPhoneSearch, isOwn) ? user.phone : null,
      phoneVerified: isOwn ? user.phoneVerified : undefined,
      role: user.role,
      presence: user.presence,
      lastSeenAt: canViewLastSeen(settings.privacy.lastSeen, contact, isOwn)
        ? user.lastSeenAt
        : null,
      createdAt: isOwn ? user.createdAt : undefined,
      needsProfileCompletion: isOwn ? user.needsProfileCompletion : undefined,
      linkedProviders,
      isContact: contact,
      friendshipStatus: isOwn ? 'accepted' : this.getFriendshipStatus(viewerId, user.id),
      isBlocked: blocked,
      isSuspended: user.isSuspended,
    };
  }
}

export const store = new CrossCallStore();
