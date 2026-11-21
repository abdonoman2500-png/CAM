import type { AuthErrorCode, PublicProfile, UserSettings } from '../types/crosscall';
import { api, ApiAuthError } from '../services/api';

export interface OAuthResultMessage {
  type: 'CROSSCALL_OAUTH_RESULT';
  ok: boolean;
  ticket?: string;
  mode: 'login' | 'link';
  provider: 'google' | 'apple';
  errorCode?: AuthErrorCode;
}

export async function runOAuthPopup(
  provider: 'google' | 'apple',
  mode: 'login' | 'link'
): Promise<{
  token: string;
  deviceId: string;
  mode: 'login' | 'link';
  user: PublicProfile;
  settings: UserSettings;
}> {
  const { url } = await api.getOAuthUrl(provider, mode);

  const popup = window.open(
    url,
    `crosscall_oauth_${provider}`,
    'width=540,height=680,scrollbars=yes,resizable=yes'
  );
  if (!popup) {
    throw new ApiAuthError('Popup blocked', 0, 'NETWORK_ERROR');
  }

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      window.clearInterval(closePoll);
      window.clearTimeout(timeoutId);
    };

    const onMessage = async (event: MessageEvent) => {
      const origin = event.origin || '';
      if (
        origin !== window.location.origin &&
        !origin.endsWith('.run.app') &&
        !origin.includes('localhost')
      ) {
        return;
      }
      const data = event.data as OAuthResultMessage | undefined;
      if (!data || data.type !== 'CROSSCALL_OAUTH_RESULT') return;

      settled = true;
      cleanup();

      if (!data.ok || !data.ticket) {
        reject(
          new ApiAuthError(
            data.errorCode || 'OAuth authentication failed',
            401,
            data.errorCode || (provider === 'apple' ? 'APPLE_AUTH_FAILED' : 'GOOGLE_OAUTH_FAILED')
          )
        );
        return;
      }

      try {
        const exchanged = await api.exchangeOAuthTicket(data.ticket);
        resolve(exchanged);
      } catch (err) {
        reject(err);
      }
    };

    const closePoll = window.setInterval(() => {
      if (settled) return;
      if (popup.closed) {
        settled = true;
        cleanup();
        reject(new ApiAuthError('Sign-in cancelled', 0, 'USER_CANCELLED_LOGIN'));
      }
    }, 350);

    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        popup.close();
      } catch {
        // ignore cross-origin close error
      }
      reject(new ApiAuthError('Sign-in timed out', 408, 'SESSION_EXPIRED'));
    }, 180_000);

    window.addEventListener('message', onMessage);
  });
}
