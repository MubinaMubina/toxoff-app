import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { RemovedComment } from '../types';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const REASON_LABEL: Record<string, string> = {
  hate_speech: 'hate speech',
  harassment: 'harassment',
  slurs: 'a slur',
  spam: 'spam',
  self_harm: 'self-harm content',
  toxicity: 'toxicity',
};

/** Ask for push permission and (on device) return an Expo push token. */
export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('moderation', {
      name: 'Moderation alerts',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#534AB7',
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') return null;

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    return token.data;
  } catch {
    return null;
  }
}

/** Local alert fired when moderation removes a comment (mirrors the server push). */
export async function notifyCommentRemoved(c: RemovedComment) {
  const platform = c.platform === 'instagram' ? 'Instagram' : 'TikTok';
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Comment removed on ${platform}`,
      body: `Flagged for ${REASON_LABEL[c.reason] ?? 'a policy violation'}: "${c.text.slice(0, 60)}"`,
      data: { commentId: c.id },
    },
    trigger: null,
  });
}
