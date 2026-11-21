export interface MediaDevicesInventory {
  audioInputs: MediaDeviceInfo[];
  audioOutputs: MediaDeviceInfo[];
  videoInputs: MediaDeviceInfo[];
}

export async function listMediaDevices(): Promise<MediaDevicesInventory> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return { audioInputs: [], audioOutputs: [], videoInputs: [] };
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      audioInputs: devices.filter((d) => d.kind === 'audioinput'),
      audioOutputs: devices.filter((d) => d.kind === 'audiooutput'),
      videoInputs: devices.filter((d) => d.kind === 'videoinput'),
    };
  } catch {
    return { audioInputs: [], audioOutputs: [], videoInputs: [] };
  }
}

export async function acquireLocalStream(options: {
  audio: boolean;
  video: boolean;
  facingMode?: 'user' | 'environment';
  audioDeviceId?: string;
  videoDeviceId?: string;
  noiseSuppression?: boolean;
}): Promise<{ stream: MediaStream | null; errorReason: string | null }> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { stream: null, errorReason: 'MediaDevices API unavailable in this browser context' };
  }
  try {
    const constraints: MediaStreamConstraints = {
      audio: options.audio
        ? {
            deviceId: options.audioDeviceId ? { exact: options.audioDeviceId } : undefined,
            noiseSuppression: options.noiseSuppression ?? true,
            echoCancellation: true,
          }
        : false,
      video: options.video
        ? {
            deviceId: options.videoDeviceId ? { exact: options.videoDeviceId } : undefined,
            facingMode: options.videoDeviceId ? undefined : (options.facingMode ?? 'user'),
            width: { ideal: 1280 },
            height: { ideal: 720 },
          }
        : false,
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    return { stream, errorReason: null };
  } catch (err) {
    return {
      stream: null,
      errorReason: err instanceof Error ? err.message : 'Camera or microphone unavailable',
    };
  }
}

export async function acquireScreenShare(): Promise<MediaStream | null> {
  if (!navigator.mediaDevices?.getDisplayMedia) return null;
  try {
    return await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  } catch {
    return null;
  }
}

export function playSoftTone(frequency = 440, durationMs = 140): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
    window.setTimeout(() => ctx.close().catch(() => {}), durationMs + 50);
  } catch {
    // Ignore autoplay restriction errors
  }
}
