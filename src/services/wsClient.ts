export type WsEventHandler = (event: Record<string, unknown>) => void;

class SignalingClient {
  private socket: WebSocket | null = null;
  private token: string | null = null;
  private listeners = new Set<WsEventHandler>();
  private reconnectTimer: number | null = null;
  private shouldStayConnected = false;

  connect(token: string): void {
    this.token = token;
    this.shouldStayConnected = true;
    this.openSocket();
  }

  private openSocket(): void {
    if (!this.token || !this.shouldStayConnected) return;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
    this.socket = ws;

    ws.onopen = () => {
      if (this.token) {
        ws.send(JSON.stringify({ type: 'auth', token: this.token }));
      }
    };

    ws.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.data)) as Record<string, unknown>;
        for (const cb of this.listeners) cb(parsed);
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = () => {
      this.socket = null;
      if (this.shouldStayConnected) {
        this.reconnectTimer = window.setTimeout(() => this.openSocket(), 2500);
      }
    };
  }

  send(payload: Record<string, unknown>): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  subscribe(handler: WsEventHandler): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  disconnect(): void {
    this.shouldStayConnected = false;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.token = null;
  }
}

export const wsClient = new SignalingClient();
