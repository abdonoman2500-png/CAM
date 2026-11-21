import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRoomInvitePath,
  canViewLastSeen,
  canViewUserPhone,
  evaluatePasswordStrength,
  filterCallHistory,
  formatCallDuration,
  sanitizeRoomSlug,
  validateEmail,
  validateOtpCode,
  validatePhone,
  validateUsername,
} from './callRules';
import type { CallRecord } from '../types/crosscall';

test('evaluatePasswordStrength flags weak passwords and accepts compliant ones', () => {
  const ok = evaluatePasswordStrength('CrossCall!2026');
  assert.equal(ok.valid, true);
  assert.equal(evaluatePasswordStrength('weak').valid, false);
  assert.equal(evaluatePasswordStrength('NoDigits!Abc').hasDigit, false);
});

test('formatCallDuration formats seconds, minutes, and hours cleanly', () => {
  assert.equal(formatCallDuration(0), '00:00');
  assert.equal(formatCallDuration(65), '01:05');
  assert.equal(formatCallDuration(3661), '01:01:01');
  assert.equal(formatCallDuration(-10), '00:00');
});

test('validators enforce strict formats for username, email, E.164 phone, and OTP', () => {
  assert.equal(validateUsername('layla.arch'), true);
  assert.equal(validateUsername('a'), false);
  assert.equal(validateUsername('bad name!'), false);

  assert.equal(validateEmail('omar@crosscall.app'), true);
  assert.equal(validateEmail('not-an-email'), false);

  assert.equal(validatePhone('+971501234567'), true);
  assert.equal(validatePhone('0501234567'), false);

  assert.equal(validateOtpCode('482910'), true);
  assert.equal(validateOtpCode('12345'), false);
  assert.equal(validateOtpCode('12a456'), false);
});

test('privacy helpers protect phone numbers and last-seen visibility', () => {
  assert.equal(canViewUserPhone(false, false), false);
  assert.equal(canViewUserPhone(false, true), true);
  assert.equal(canViewUserPhone(true, false), true);

  assert.equal(canViewLastSeen('nobody', true, false), false);
  assert.equal(canViewLastSeen('nobody', true, true), true);
  assert.equal(canViewLastSeen('contacts', true, false), true);
  assert.equal(canViewLastSeen('contacts', false, false), false);
  assert.equal(canViewLastSeen('everyone', false, false), true);
});

test('filterCallHistory correctly filters outgoing, incoming, missed, and rejected calls', () => {
  const sample: CallRecord[] = [
    {
      id: '1',
      roomId: 'r1',
      callerId: 'u1',
      callerName: 'Layla',
      callerUsername: 'layla',
      callerAvatar: null,
      callType: 'audio',
      status: 'ended',
      startedAt: '2026-11-20T10:00:00Z',
      endedAt: '2026-11-20T10:02:00Z',
      duration: 120,
      participants: [],
    },
    {
      id: '2',
      roomId: 'r2',
      callerId: 'u2',
      callerName: 'Omar',
      callerUsername: 'omar',
      callerAvatar: null,
      callType: 'video',
      status: 'missed',
      startedAt: '2026-11-20T11:00:00Z',
      endedAt: null,
      duration: 0,
      participants: [],
    },
    {
      id: '3',
      roomId: 'r3',
      callerId: 'u2',
      callerName: 'Omar',
      callerUsername: 'omar',
      callerAvatar: null,
      callType: 'audio',
      status: 'rejected',
      startedAt: '2026-11-20T12:00:00Z',
      endedAt: null,
      duration: 0,
      participants: [],
    },
  ];

  assert.equal(filterCallHistory(sample, 'all', 'u1').length, 3);
  assert.equal(filterCallHistory(sample, 'outgoing', 'u1').map((c) => c.id).join(','), '1');
  assert.equal(filterCallHistory(sample, 'missed', 'u1').map((c) => c.id).join(','), '2');
  assert.equal(filterCallHistory(sample, 'rejected', 'u1').map((c) => c.id).join(','), '3');
});

test('sanitizeRoomSlug and buildRoomInvitePath strip unsafe characters', () => {
  assert.equal(sanitizeRoomSlug('  Team Sync #42! '), 'team-sync-42');
  assert.equal(buildRoomInvitePath('Design Review'), '?meet=design-review');
});
