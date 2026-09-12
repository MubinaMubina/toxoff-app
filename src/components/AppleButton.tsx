import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { SocialButton } from './SocialButton';

// iOS only: Android users sign in with Google or email.
// A custom Sign in with Apple button, which Apple's guidelines allow, so it matches the Google
// button (the native one scales its title with its height and came out far larger). It keeps
// Apple's rules: the title "Continue with Apple" in the system font, logo and title in one
// color, white on dark and black on light, and no smaller than the other sign-in buttons.
export function AppleButton({ onPress, loading }: { onPress: () => void; loading?: boolean }) {
  const { isDark } = useTheme();
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then(setAvailable)
      .catch(() => setAvailable(false));
  }, []);

  if (!available) return null;

  const foreground = isDark ? '#000' : '#fff';
  return (
    <SocialButton
      label="Continue with Apple"
      icon={<Ionicons name="logo-apple" size={20} color={foreground} />}
      onPress={onPress}
      loading={loading}
      background={isDark ? '#fff' : '#000'}
      foreground={foreground}
    />
  );
}
