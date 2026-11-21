import type { Server as HttpServer } from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyJwt } from './authLogic';
import { store } from './store';
import type { CallParticipantInfo, CallType, InCallMessage } from '../src/types/crosscall';

interface ClientSocket extends WebSocket {
  userId?: string;
  deviceId?: string;
  activeRoomId?: string;
  isAlive?: boolean;
}

interface ActiveRoom {
  roomId: string;
  callId: string;
  callType: CallType;
  hostId: string;
  startedAt: number;
  participants: Map<string, CallParticipantInfo>;
  messages: InCallMessage[];
}

export class SignalingHub {
  private wss: WebSocketServer;
  private clientsByUser = new Map<string, Set<ClientSocket>>();
  private activeRooms = new Map<string, ActiveRoom>();
  private jwtSecret: string;

  constructor(server: HttpServer, jwtSecret: string) {
    this.jwtSecret = jwtSecret;
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.setup();
  }

  private setup(): void {
    this.wss.on('connection', (ws: ClientSocket) => {
      ws.isAlive = true;

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
          this.handleMessage(ws, msg);
        } catch {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON payload' }));
        }
      });

      ws.on('close', () => {
        this.handleDisconnect(ws);
      });
    });

    const interval = setInterval(() => {
      for (const client of this.wss.clients) {
        const c = client as ClientSocket;
        if (c.isAlive === false) {
          c.terminate();
          continue;
        }
        c.isAlive = false;
        c.ping();
      }
    }, 25_000);
    interval.unref();
  }

  private sendToUser(userId: string, payload: unknown): void {
    const sockets = this.clientsByUser.get(userId);
    if (!sockets) return;
    const serialized = JSON.stringify(payload);
    for (const sock of sockets) {
      if (sock.readyState === WebSocket.OPEN) {
        sock.send(serialized);
      }
    }
  }

  private broadcastToRoom(roomId: string, payload: unknown, excludeUserId?: string): void {
    const room = this.activeRooms.get(roomId);
    if (!room) return;
    for (const participantId of room.participants.keys()) {
      if (excludeUserId && participantId === excludeUserId) continue;
      this.sendToUser(participantId, payload);
    }
  }

  private broadcastPresence(userId: string, presence: 'online' | 'busy' | 'offline'): void {
    const payload = JSON.stringify({ type: 'presence:update', userId, presence });
    for (const client of this.wss.clients) {
      const c = client as ClientSocket;
      if (c.userId && c.readyState === WebSocket.OPEN) {
        c.send(payload);
      }
    }
  }

  private handleMessage(ws: ClientSocket, msg: Record<string, unknown>): void {
    const type = String(msg.type ?? '');

    if (type === 'auth') {
      const token = String(msg.token ?? '');
      const claims = verifyJwt(token, this.jwtSecret);
      if (!claims) {
        ws.send(JSON.stringify({ type: 'auth:error', message: 'Invalid or expired token' }));
        ws.close();
        return;
      }
      const user = store.db.users.find((u) => u.id === claims.sub);
      if (!user || user.isSuspended) {
        ws.close();
        return;
      }
      ws.userId = user.id;
      ws.deviceId = claims.deviceId;
      let set = this.clientsByUser.get(user.id);
      if (!set) {
        set = new Set();
        this.clientsByUser.set(user.id, set);
      }
      set.add(ws);
      user.presence = 'online';
      user.lastSeenAt = new Date().toISOString();
      store.save();
      ws.send(JSON.stringify({ type: 'auth:ok', userId: user.id }));
      this.broadcastPresence(user.id, 'online');
      return;
    }

    if (!ws.userId) {
      ws.send(JSON.stringify({ type: 'error', message: 'Authenticate first' }));
      return;
    }

    const userId = ws.userId;
    const sender = store.db.users.find((u) => u.id === userId);
    if (!sender) return;

    if (type === 'call:invite') {
      const targetUserId = String(msg.targetUserId ?? '');
      const callType = (String(msg.callType ?? 'audio') as CallType) || 'audio';
      const roomId = String(msg.roomId ?? `room-${crypto.randomUUID().slice(0, 8)}`);
      const target = store.db.users.find((u) => u.id === targetUserId);
      if (!target || store.isBlockedBetween(userId, targetUserId)) {
        ws.send(JSON.stringify({ type: 'call:error', message: 'Recipient unavailable' }));
        return;
      }

      const callId = `call-${crypto.randomUUID().slice(0, 8)}`;
      const startedAt = new Date().toISOString();
      store.db.calls.unshift({
        id: callId,
        roomId,
        callerId: sender.id,
        callerName: sender.fullName,
        callerUsername: sender.username,
        callerAvatar: sender.avatarUrl,
        calleeId: target.id,
        calleeName: target.fullName,
        calleeUsername: target.username,
        calleeAvatar: target.avatarUrl,
        callType,
        status: 'ringing',
        startedAt,
        endedAt: null,
        duration: 0,
        participants: [
          {
            userId: sender.id,
            fullName: sender.fullName,
            username: sender.username,
            avatarUrl: sender.avatarUrl,
            role: 'host',
          },
        ],
      });
      store.save();

      const room: ActiveRoom = {
        roomId,
        callId,
        callType,
        hostId: sender.id,
        startedAt: Date.now(),
        participants: new Map([
          [
            sender.id,
            {
              userId: sender.id,
              username: sender.username,
              fullName: sender.fullName,
              avatarUrl: sender.avatarUrl,
              role: 'host',
              joinedAt: startedAt,
              micEnabled: true,
              cameraEnabled: callType !== 'audio',
              isSpeaking: false,
            },
          ],
        ]),
        messages: [],
      };
      this.activeRooms.set(roomId, room);
      ws.activeRoomId = roomId;

      this.sendToUser(sender.id, {
        type: 'call:created',
        callId,
        roomId,
        callType,
        target: store.toPublicProfile(target, sender.id),
      });

      this.sendToUser(target.id, {
        type: 'call:incoming',
        callId,
        roomId,
        callType,
        caller: store.toPublicProfile(sender, target.id),
      });
      return;
    }

    if (type === 'call:accept') {
      const roomId = String(msg.roomId ?? '');
      const room = this.activeRooms.get(roomId);
      if (!room) return;
      const call = store.db.calls.find((c) => c.id === room.callId);
      if (call) {
        call.status = 'active';
        if (!call.participants.some((p) => p.userId === sender.id)) {
          call.participants.push({
            userId: sender.id,
            fullName: sender.fullName,
            username: sender.username,
            avatarUrl: sender.avatarUrl,
            role: 'participant',
          });
        }
      }
      sender.presence = 'busy';
      store.save();

      room.participants.set(sender.id, {
        userId: sender.id,
        username: sender.username,
        fullName: sender.fullName,
        avatarUrl: sender.avatarUrl,
        role: 'participant',
        joinedAt: new Date().toISOString(),
        micEnabled: true,
        cameraEnabled: room.callType !== 'audio',
        isSpeaking: false,
      });
      ws.activeRoomId = roomId;

      this.broadcastToRoom(roomId, {
        type: 'call:accepted',
        roomId,
        callId: room.callId,
        participants: Array.from(room.participants.values()),
      });
      this.broadcastPresence(sender.id, 'busy');
      return;
    }

    if (type === 'call:decline') {
      const roomId = String(msg.roomId ?? '');
      const room = this.activeRooms.get(roomId);
      if (!room) return;
      const call = store.db.calls.find((c) => c.id === room.callId);
      if (call) {
        call.status = 'rejected';
        call.endedAt = new Date().toISOString();
      }
      store.save();
      this.broadcastToRoom(roomId, {
        type: 'call:declined',
        roomId,
        callId: room.callId,
        byUserId: sender.id,
      });
      this.activeRooms.delete(roomId);
      return;
    }

    if (type === 'room:join') {
      const roomId = String(msg.roomId ?? '').trim();
      if (!roomId) return;
      const title = String(msg.title ?? `CrossCall · ${roomId}`);
      let room = this.activeRooms.get(roomId);
      const nowIso = new Date().toISOString();

      if (!room) {
        const callId = `call-${crypto.randomUUID().slice(0, 8)}`;
        store.db.calls.unshift({
          id: callId,
          roomId,
          callerId: sender.id,
          callerName: sender.fullName,
          callerUsername: sender.username,
          callerAvatar: sender.avatarUrl,
          callType: 'group',
          status: 'active',
          title,
          startedAt: nowIso,
          endedAt: null,
          duration: 0,
          participants: [],
        });
        room = {
          roomId,
          callId,
          callType: 'group',
          hostId: sender.id,
          startedAt: Date.now(),
          participants: new Map(),
          messages: [],
        };
        this.activeRooms.set(roomId, room);
      }

      const role = room.hostId === sender.id ? 'host' : 'participant';
      room.participants.set(sender.id, {
        userId: sender.id,
        username: sender.username,
        fullName: sender.fullName,
        avatarUrl: sender.avatarUrl,
        role,
        joinedAt: nowIso,
        micEnabled: Boolean(msg.micEnabled ?? true),
        cameraEnabled: Boolean(msg.cameraEnabled ?? true),
        isSpeaking: false,
      });
      ws.activeRoomId = roomId;

      const call = store.db.calls.find((c) => c.id === room.callId);
      if (call && !call.participants.some((p) => p.userId === sender.id)) {
        call.participants.push({
          userId: sender.id,
          fullName: sender.fullName,
          username: sender.username,
          avatarUrl: sender.avatarUrl,
          role,
        });
      }
      sender.presence = 'busy';
      store.save();

      this.broadcastToRoom(roomId, {
        type: 'room:state',
        roomId,
        callId: room.callId,
        hostId: room.hostId,
        participants: Array.from(room.participants.values()),
        messages: room.messages,
      });
      this.broadcastPresence(sender.id, 'busy');
      return;
    }

    if (type === 'room:media-toggle') {
      const roomId = String(msg.roomId ?? ws.activeRoomId ?? '');
      const room = this.activeRooms.get(roomId);
      if (!room) return;
      const participant = room.participants.get(sender.id);
      if (!participant) return;
      if (typeof msg.micEnabled === 'boolean') participant.micEnabled = msg.micEnabled;
      if (typeof msg.cameraEnabled === 'boolean') participant.cameraEnabled = msg.cameraEnabled;
      if (typeof msg.isSpeaking === 'boolean') participant.isSpeaking = msg.isSpeaking;

      this.broadcastToRoom(roomId, {
        type: 'room:state',
        roomId,
        callId: room.callId,
        hostId: room.hostId,
        participants: Array.from(room.participants.values()),
        messages: room.messages,
      });
      return;
    }

    if (type === 'room:chat') {
      const roomId = String(msg.roomId ?? ws.activeRoomId ?? '');
      const room = this.activeRooms.get(roomId);
      if (!room) return;
      const text = String(msg.text ?? '').trim().slice(0, 1000);
      const fileName = msg.fileName ? String(msg.fileName).slice(0, 120) : undefined;
      const fileSize = msg.fileSize ? String(msg.fileSize).slice(0, 32) : undefined;
      if (!text && !fileName) return;

      const chatMsg: InCallMessage = {
        id: crypto.randomUUID(),
        senderId: sender.id,
        senderName: sender.fullName,
        text,
        fileName,
        fileSize,
        createdAt: new Date().toISOString(),
      };
      room.messages.push(chatMsg);
      this.broadcastToRoom(roomId, { type: 'room:chat', roomId, message: chatMsg });
      return;
    }

    if (type === 'webrtc:signal') {
      const targetUserId = String(msg.targetUserId ?? '');
      const roomId = String(msg.roomId ?? '');
      if (!targetUserId || !roomId) return;
      this.sendToUser(targetUserId, {
        type: 'webrtc:signal',
        roomId,
        fromUserId: sender.id,
        signal: msg.signal,
      });
      return;
    }

    if (type === 'call:end' || type === 'room:leave') {
      const roomId = String(msg.roomId ?? ws.activeRoomId ?? '');
      const endForAll = Boolean(msg.endForAll);
      this.leaveOrEndRoom(sender.id, roomId, endForAll);
      ws.activeRoomId = undefined;
    }
  }

  private leaveOrEndRoom(userId: string, roomId: string, endForAll: boolean): void {
    const room = this.activeRooms.get(roomId);
    if (!room) return;
    const user = store.db.users.find((u) => u.id === userId);
    if (user) {
      user.presence = 'online';
    }

    const isHostEnding = endForAll && room.hostId === userId;
    room.participants.delete(userId);

    if (isHostEnding || room.participants.size === 0) {
      const call = store.db.calls.find((c) => c.id === room.callId);
      if (call) {
        const durationSec = Math.max(1, Math.round((Date.now() - room.startedAt) / 1000));
        if (call.status === 'ringing') {
          call.status = 'missed';
          call.duration = 0;
        } else {
          call.status = 'ended';
          call.duration = durationSec;
        }
        call.endedAt = new Date().toISOString();
      }
      store.save();

      this.broadcastToRoom(roomId, { type: 'call:ended', roomId, callId: room.callId });
      for (const remainingId of room.participants.keys()) {
        const remUser = store.db.users.find((u) => u.id === remainingId);
        if (remUser) remUser.presence = 'online';
        this.sendToUser(remainingId, { type: 'call:ended', roomId, callId: room.callId });
        this.broadcastPresence(remainingId, 'online');
      }
      this.activeRooms.delete(roomId);
    } else {
      store.save();
      this.broadcastToRoom(roomId, {
        type: 'room:state',
        roomId,
        callId: room.callId,
        hostId: room.hostId,
        participants: Array.from(room.participants.values()),
        messages: room.messages,
      });
    }
    this.broadcastPresence(userId, 'online');
  }

  private handleDisconnect(ws: ClientSocket): void {
    const userId = ws.userId;
    if (!userId) return;
    const set = this.clientsByUser.get(userId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) {
        this.clientsByUser.delete(userId);
        const user = store.db.users.find((u) => u.id === userId);
        if (user) {
          user.presence = 'offline';
          user.lastSeenAt = new Date().toISOString();
          store.save();
          this.broadcastPresence(userId, 'offline');
        }
      }
    }
    if (ws.activeRoomId) {
      this.leaveOrEndRoom(userId, ws.activeRoomId, false);
    }
  }

  getActiveConnectionCount(): number {
    return this.clientsByUser.size;
  }

  getOngoingCallsCount(): number {
    return this.activeRooms.size;
  }
}
