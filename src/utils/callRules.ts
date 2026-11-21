import type { CallRecord } from '../types/crosscall';

export function formatCallDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function validateUsername(username: string): boolean {
  return /^[a-zA-Z0-9._]{3,30}$/.test(username.trim());
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export function validatePhone(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone.trim());
}

export function validateOtpCode(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}

export interface ClientPasswordCheck {
  valid: boolean;
  minLength: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasDigit: boolean;
  hasSymbol: boolean;
}

export function evaluatePasswordStrength(password: string): ClientPasswordCheck {
  const minLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  return {
    valid: minLength && hasUpper && hasLower && hasDigit && hasSymbol,
    minLength,
    hasUpper,
    hasLower,
    hasDigit,
    hasSymbol,
  };
}

export function canViewUserPhone(allowPhoneSearch: boolean, isOwnProfile: boolean): boolean {
  return isOwnProfile || allowPhoneSearch;
}

export function canViewLastSeen(
  policy: 'everyone' | 'contacts' | 'nobody',
  isContact: boolean,
  isOwnProfile: boolean
): boolean {
  if (isOwnProfile) return true;
  if (policy === 'everyone') return true;
  if (policy === 'contacts') return isContact;
  return false;
}

export type HistoryFilter = 'all' | 'outgoing' | 'incoming' | 'missed' | 'rejected';

export function filterCallHistory(
  calls: CallRecord[],
  filter: HistoryFilter,
  currentUserId: string
): CallRecord[] {
  if (filter === 'all') return calls;
  return calls.filter((call) => {
    if (filter === 'outgoing') return call.callerId === currentUserId;
    if (filter === 'incoming') return call.callerId !== currentUserId && call.status === 'ended';
    if (filter === 'missed') return call.status === 'missed';
    if (filter === 'rejected') return call.status === 'rejected';
    return true;
  });
}

export function sanitizeRoomSlug(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return cleaned.length >= 3 ? cleaned : 'crosscall-room';
}

export function buildRoomInvitePath(roomId: string): string {
  return `?meet=${encodeURIComponent(sanitizeRoomSlug(roomId))}`;
}
