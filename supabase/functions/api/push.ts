// Expo's push service. The app saves its token in profiles.push_token (src/lib/notifications.ts).
export type PushResult = 'sent' | 'unregistered' | 'failed';

export async function sendPush(
  to: string,
  message: { title: string; body: string; data?: Record<string, unknown> }
): Promise<PushResult> {
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ to, sound: 'default', channelId: 'moderation', ...message }),
    });
    const body = await res.json().catch(() => null);
    const ticket = Array.isArray(body?.data) ? body.data[0] : body?.data;
    if (ticket?.status === 'ok') return 'sent';
    // The app was uninstalled or the token was replaced.
    if (ticket?.details?.error === 'DeviceNotRegistered') return 'unregistered';
    console.warn('Push not sent', res.status, JSON.stringify(body));
    return 'failed';
  } catch (e) {
    console.warn('Push not sent', e);
    return 'failed';
  }
}
