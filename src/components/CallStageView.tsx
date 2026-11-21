import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Camera,
  CameraOff,
  Copy,
  MessageSquare,
  Minimize2,
  Mic,
  MicOff,
  MonitorUp,
  Paperclip,
  Phone,
  PhoneOff,
  RefreshCw,
  Send,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {
  CallParticipantInfo,
  CallType,
  InCallMessage,
  Language,
  PublicProfile,
} from '../types/crosscall';
import { t } from '../i18n/translations';
import { buildRoomInvitePath, formatCallDuration } from '../utils/callRules';
import {
  acquireLocalStream,
  acquireScreenShare,
  listMediaDevices,
  type MediaDevicesInventory,
} from '../services/webrtc';
import { Avatar } from './Avatar';

export interface ActiveCallSession {
  callId: string;
  roomId: string;
  callType: CallType;
  phase: 'incoming' | 'outgoing' | 'active' | 'prejoin';
  remoteUser?: PublicProfile;
  hostId: string;
  title?: string;
  participants: CallParticipantInfo[];
  messages: InCallMessage[];
  startedAtMs: number;
}

interface CallStageViewProps {
  lang: Language;
  currentUser: PublicProfile;
  session: ActiveCallSession;
  minimized: boolean;
  onToggleMinimize: () => void;
  onAcceptIncoming: () => void;
  onDeclineIncoming: () => void;
  onJoinPrejoin: (mic: boolean, cam: boolean) => void;
  onEndCall: (endForAll: boolean) => void;
  onToggleMic: (enabled: boolean) => void;
  onToggleCamera: (enabled: boolean) => void;
  onSendChat: (text: string, fileName?: string, fileSize?: string) => void;
}

export function CallStageView({
  lang,
  currentUser,
  session,
  minimized,
  onToggleMinimize,
  onAcceptIncoming,
  onDeclineIncoming,
  onJoinPrejoin,
  onEndCall,
  onToggleMic,
  onToggleCamera,
  onSendChat,
}: CallStageViewProps) {
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(session.callType !== 'audio');
  const [speakerOn, setSpeakerOn] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [screenSharing, setScreenSharing] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [mediaNotice, setMediaNotice] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDevicesInventory>({
    audioInputs: [],
    audioOutputs: [],
    videoInputs: [],
  });
  const [selectedAudioIn, setSelectedAudioIn] = useState('');

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (session.phase !== 'active') {
      setElapsed(0);
      return;
    }
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - session.startedAtMs) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [session.phase, session.startedAtMs]);

  useEffect(() => {
    let active = true;
    async function initMedia() {
      if (session.phase === 'incoming') return;
      const inv = await listMediaDevices();
      if (active) setDevices(inv);

      const { stream, errorReason } = await acquireLocalStream({
        audio: micOn,
        video: camOn && session.callType !== 'audio',
        facingMode,
        audioDeviceId: selectedAudioIn || undefined,
      });

      if (!active) {
        stream?.getTracks().forEach((tr) => tr.stop());
        return;
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((tr) => tr.stop());
      }
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      setMediaNotice(errorReason);
    }

    initMedia();
    return () => {
      active = false;
      localStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      screenStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, [session.roomId, session.phase, session.callType, facingMode, selectedAudioIn, camOn, micOn]);

  function handleMicClick() {
    const next = !micOn;
    setMicOn(next);
    localStreamRef.current?.getAudioTracks().forEach((tr) => {
      tr.enabled = next;
    });
    onToggleMic(next);
  }

  function handleCamClick() {
    const next = !camOn;
    setCamOn(next);
    localStreamRef.current?.getVideoTracks().forEach((tr) => {
      tr.enabled = next;
    });
    onToggleCamera(next);
  }

  async function handleScreenShare() {
    if (screenSharing) {
      screenStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      screenStreamRef.current = null;
      setScreenSharing(false);
      return;
    }
    const stream = await acquireScreenShare();
    if (!stream) {
      setMediaNotice('Screen sharing cancelled or unsupported in this browser.');
      return;
    }
    screenStreamRef.current = stream;
    setScreenSharing(true);
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
  }

  function handleCopyInvite() {
    const url = `${window.location.origin}/${buildRoomInvitePath(session.roomId)}`;
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  function handleSendChat(e: FormEvent) {
    e.preventDefault();
    if (!chatInput.trim()) return;
    onSendChat(chatInput.trim());
    setChatInput('');
  }

  if (minimized && session.phase === 'active') {
    return (
      <div className="fixed bottom-20 end-4 z-50 rounded-xl border border-slate-700 bg-[#111827] text-white px-4 py-3 shadow-xl flex items-center gap-4">
        <div>
          <p className="text-xs font-semibold">
            {session.remoteUser?.fullName || session.title || session.roomId}
          </p>
          <p className="text-xs text-slate-400 tabular-nums">{formatCallDuration(elapsed)}</p>
        </div>
        <button
          type="button"
          onClick={onToggleMinimize}
          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-medium whitespace-nowrap"
        >
          {t(lang, 'restoreCall')}
        </button>
        <button
          type="button"
          aria-label={t(lang, 'endCall')}
          onClick={() => onEndCall(false)}
          className="h-8 w-8 rounded-lg bg-red-600 hover:bg-red-700 flex items-center justify-center"
        >
          <PhoneOff className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // Screen 12: Incoming Call
  if (session.phase === 'incoming') {
    const caller = session.remoteUser;
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t(lang, 'incomingCall')}
        className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-6"
      >
        <div className="max-w-sm w-full rounded-2xl border border-slate-800 bg-[#111827] p-8 text-center text-white space-y-6">
          <p className="text-xs font-medium text-blue-400">
            {t(lang, 'incomingCall')} · {session.callType}
          </p>
          <div className="flex justify-center">
            <Avatar name={caller?.fullName || 'Caller'} src={caller?.avatarUrl} size="xl" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold">{caller?.fullName || 'Caller'}</h2>
            <p className="text-sm text-slate-400 mt-1">@{caller?.username || 'crosscall'}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={onDeclineIncoming}
              className="inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium text-sm"
            >
              <PhoneOff className="h-4 w-4" />
              {t(lang, 'decline')}
            </button>
            <button
              type="button"
              onClick={onAcceptIncoming}
              className="inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm"
            >
              <Phone className="h-4 w-4" />
              {t(lang, 'answer')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Screen 25: Web Meeting Pre-Join Screen
  if (session.phase === 'prejoin') {
    return (
      <section className="max-w-4xl mx-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 sm:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 relative rounded-xl overflow-hidden bg-slate-950 aspect-video border border-slate-800 flex items-center justify-center">
            {camOn && !mediaNotice ? (
              <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
            ) : (
              <div className="text-center p-6 text-slate-300 space-y-3">
                <Avatar name={currentUser.fullName} src={currentUser.avatarUrl} size="xl" />
                <p className="text-xs text-slate-400">{mediaNotice || t(lang, 'cameraOff')}</p>
              </div>
            )}
          </div>

          <div className="lg:col-span-5 space-y-5">
            <div>
              <p className="text-xs font-mono text-blue-600 dark:text-blue-400">{session.roomId}</p>
              <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white mt-1">
                {session.title || 'CrossCall Meeting'}
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleMicClick}
                className={`flex-1 py-2.5 rounded-lg border text-sm font-medium inline-flex items-center justify-center gap-2 ${
                  micOn
                    ? 'border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200'
                    : 'border-red-500/40 bg-red-500/10 text-red-500'
                }`}
              >
                {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                {micOn ? t(lang, 'mute') : t(lang, 'unmute')}
              </button>
              <button
                type="button"
                onClick={handleCamClick}
                className={`flex-1 py-2.5 rounded-lg border text-sm font-medium inline-flex items-center justify-center gap-2 ${
                  camOn
                    ? 'border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200'
                    : 'border-red-500/40 bg-red-500/10 text-red-500'
                }`}
              >
                {camOn ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4" />}
                {camOn ? t(lang, 'cameraOn') : t(lang, 'cameraOff')}
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopyInvite}
              className="w-full py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center justify-center gap-2"
            >
              <Copy className="h-4 w-4" />
              {copied ? t(lang, 'copied') : t(lang, 'copyInvite')}
            </button>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => onEndCall(false)}
                className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                {t(lang, 'decline')}
              </button>
              <button
                type="button"
                onClick={() => onJoinPrejoin(micOn, camOn)}
                className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
              >
                {t(lang, 'joinRoom')}
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // Screens 13, 14, 15, 16: Outgoing, Active Audio, Active Video, Group Call
  const isHost = session.hostId === currentUser.id;
  const participants = session.participants.length > 0
    ? session.participants
    : [
        {
          userId: currentUser.id,
          username: currentUser.username,
          fullName: currentUser.fullName,
          avatarUrl: currentUser.avatarUrl,
          role: 'host' as const,
          joinedAt: new Date().toISOString(),
          micEnabled: micOn,
          cameraEnabled: camOn,
        },
      ];

  return (
    <section className="rounded-2xl border border-slate-800 bg-[#0B0F19] text-white overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-lg font-semibold">
            {session.callType === 'group'
              ? session.title || session.roomId
              : session.remoteUser?.fullName || 'Call'}
          </h1>
          <p className="text-xs text-slate-400 tabular-nums">
            {session.phase === 'outgoing' ? t(lang, 'outgoingCall') : formatCallDuration(elapsed)} ·{' '}
            {t(lang, 'networkGood')} · {t(lang, 'networkAdaptive')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyInvite}
            className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? t(lang, 'copied') : t(lang, 'copyInvite')}
          </button>
          <button
            type="button"
            aria-label={t(lang, 'minimizeCall')}
            onClick={onToggleMinimize}
            className="h-9 w-9 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 flex items-center justify-center"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12">
        <div className={`${chatOpen ? 'lg:col-span-8' : 'lg:col-span-12'} p-6 min-h-[380px] flex flex-col justify-between gap-6`}>
          {session.callType === 'audio' ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-10 space-y-4">
              <Avatar
                name={session.remoteUser?.fullName || currentUser.fullName}
                src={session.remoteUser?.avatarUrl}
                size="xl"
              />
              <div>
                <h2 className="font-display text-2xl font-bold">
                  {session.remoteUser?.fullName || session.roomId}
                </h2>
                <p className="text-sm text-slate-400 mt-1 tabular-nums">
                  {session.phase === 'outgoing' ? t(lang, 'ringing') : formatCallDuration(elapsed)}
                </p>
              </div>
              {mediaNotice && <p className="text-xs text-amber-400 max-w-md">{mediaNotice}</p>}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
              {/* Local Video Tile */}
              <div className="relative rounded-xl overflow-hidden bg-slate-900 border border-slate-800 aspect-video flex items-center justify-center">
                {camOn && !mediaNotice ? (
                  <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center space-y-2 p-4">
                    <Avatar name={currentUser.fullName} src={currentUser.avatarUrl} size="lg" />
                    <p className="text-xs text-slate-400">{mediaNotice || t(lang, 'cameraOff')}</p>
                  </div>
                )}
                <div className="absolute bottom-3 start-3 bg-black/70 px-2.5 py-1 rounded text-xs font-medium">
                  {currentUser.fullName} (You) {!micOn ? '· Muted' : ''}
                </div>
              </div>

              {/* Remote / Group Participant Tiles */}
              {session.callType === 'video' && session.remoteUser ? (
                <div className="relative rounded-xl overflow-hidden bg-slate-900 border border-slate-800 aspect-video flex flex-col items-center justify-center p-6">
                  <Avatar name={session.remoteUser.fullName} src={session.remoteUser.avatarUrl} size="lg" />
                  <p className="mt-3 text-sm font-medium">{session.remoteUser.fullName}</p>
                  <p className="text-xs text-slate-400">
                    {session.phase === 'outgoing' ? t(lang, 'ringing') : t(lang, 'connected')}
                  </p>
                </div>
              ) : (
                participants
                  .filter((p) => p.userId !== currentUser.id)
                  .map((p) => (
                    <div
                      key={p.userId}
                      className={`relative rounded-xl overflow-hidden bg-slate-900 border aspect-video flex flex-col items-center justify-center p-6 ${
                        p.isSpeaking ? 'border-blue-500' : 'border-slate-800'
                      }`}
                    >
                      <Avatar name={p.fullName} src={p.avatarUrl} size="lg" />
                      <p className="mt-3 text-sm font-medium">{p.fullName}</p>
                      <p className="text-xs text-slate-400">
                        {p.role} · {p.micEnabled ? 'Mic On' : 'Muted'}
                      </p>
                    </div>
                  ))
              )}
            </div>
          )}

          {/* Audio Device Selector + Control Dock */}
          <div className="space-y-4">
            {devices.audioInputs.length > 0 && (
              <div className="flex items-center justify-center gap-3 text-xs text-slate-400">
                <label htmlFor="in-call-mic-select">{t(lang, 'micDevice')}:</label>
                <select
                  id="in-call-mic-select"
                  value={selectedAudioIn}
                  onChange={(e) => setSelectedAudioIn(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-200"
                >
                  <option value="">Default Microphone</option>
                  {devices.audioInputs.map((d, idx) => (
                    <option key={d.deviceId || idx} value={d.deviceId}>
                      {d.label || `Microphone ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleMicClick}
                aria-label={micOn ? t(lang, 'mute') : t(lang, 'unmute')}
                className={`h-12 px-4 rounded-xl text-xs font-medium inline-flex items-center gap-2 transition-colors ${
                  micOn ? 'bg-slate-800 hover:bg-slate-700 text-white' : 'bg-red-600 text-white'
                }`}
              >
                {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                {micOn ? t(lang, 'mute') : t(lang, 'unmute')}
              </button>

              {session.callType !== 'audio' && (
                <>
                  <button
                    type="button"
                    onClick={handleCamClick}
                    aria-label={camOn ? t(lang, 'cameraOn') : t(lang, 'cameraOff')}
                    className={`h-12 px-4 rounded-xl text-xs font-medium inline-flex items-center gap-2 transition-colors ${
                      camOn ? 'bg-slate-800 hover:bg-slate-700 text-white' : 'bg-red-600 text-white'
                    }`}
                  >
                    {camOn ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4" />}
                    {camOn ? t(lang, 'cameraOn') : t(lang, 'cameraOff')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFacingMode((m) => (m === 'user' ? 'environment' : 'user'))}
                    className="h-12 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium inline-flex items-center gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {t(lang, 'switchCamera')}
                  </button>
                  <button
                    type="button"
                    onClick={handleScreenShare}
                    className={`h-12 px-4 rounded-xl text-xs font-medium inline-flex items-center gap-2 ${
                      screenSharing ? 'bg-blue-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white'
                    }`}
                  >
                    <MonitorUp className="h-4 w-4" />
                    {screenSharing ? t(lang, 'stopShare') : t(lang, 'shareScreen')}
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => setSpeakerOn((s) => !s)}
                className="h-12 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium inline-flex items-center gap-2"
              >
                {speakerOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                {speakerOn ? t(lang, 'speaker') : t(lang, 'earpiece')}
              </button>

              <button
                type="button"
                onClick={() => setChatOpen((o) => !o)}
                className={`h-12 px-4 rounded-xl text-xs font-medium inline-flex items-center gap-2 ${
                  chatOpen ? 'bg-blue-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white'
                }`}
              >
                <MessageSquare className="h-4 w-4" />
                {t(lang, 'inCallChat')}
              </button>

              <button
                type="button"
                onClick={() => onEndCall(false)}
                className="h-12 px-5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-2"
              >
                <PhoneOff className="h-4 w-4" />
                {session.callType === 'group' ? t(lang, 'leaveRoom') : t(lang, 'endCall')}
              </button>

              {session.callType === 'group' && isHost && (
                <button
                  type="button"
                  onClick={() => onEndCall(true)}
                  className="h-12 px-4 rounded-xl border border-red-500/40 text-red-400 hover:bg-red-500/10 text-xs font-medium"
                >
                  {t(lang, 'endForAll')}
                </button>
              )}
            </div>
          </div>
        </div>

        {chatOpen && (
          <aside className="lg:col-span-4 border-t lg:border-t-0 lg:border-s border-slate-800 bg-slate-900/60 p-4 flex flex-col justify-between min-h-[340px]">
            <div className="space-y-3 overflow-y-auto max-h-80">
              <h3 className="text-sm font-semibold text-white">{t(lang, 'inCallChat')}</h3>
              {session.messages.length === 0 ? (
                <p className="text-xs text-slate-400">No messages yet.</p>
              ) : (
                session.messages.map((m) => (
                  <div key={m.id} className="rounded-lg bg-slate-800/80 p-2.5 text-xs space-y-1">
                    <div className="font-semibold text-blue-400">{m.senderName}</div>
                    {m.text && <p className="text-slate-200">{m.text}</p>}
                    {m.fileName && (
                      <p className="text-emerald-400 font-mono">
                        {m.fileName} ({m.fileSize})
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleSendChat} className="mt-4 flex items-center gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={t(lang, 'sendMessage')}
                className="flex-1 rounded-lg border border-slate-700 bg-[#0B0F19] px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <label className="h-9 w-9 rounded-lg border border-slate-700 hover:bg-slate-800 flex items-center justify-center cursor-pointer" title={t(lang, 'attachFile')}>
                <Paperclip className="h-4 w-4 text-slate-300" />
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      onSendChat('', f.name, `${Math.max(1, Math.round(f.size / 1024))} KB`);
                    }
                  }}
                />
              </label>
              <button
                type="submit"
                aria-label={t(lang, 'sendMessage')}
                className="h-9 w-9 rounded-lg bg-blue-600 hover:bg-blue-700 flex items-center justify-center"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </aside>
        )}
      </div>
    </section>
  );
}
