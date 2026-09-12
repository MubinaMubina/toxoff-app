import * as AppleAuthentication from 'expo-apple-authentication';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

// iOS only: Android users sign in with Google or email.
export function AppleButton({ onPress, loading }: { onPress: () => void; loading?: boolean }) {
  const { isDark, radius } = useTheme();
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then(setAvailable)
      .catch(() => setAvailable(false));
  }, []);

  if (!available) return null;

  if (loading) {
    return (
      <View
        style={{
          height: 54,
          borderRadius: radius.md,
          backgroundColor: isDark ? '#fff' : '#000',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={isDark ? '#000' : '#fff'} />
      </View>
    );
  }

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={
        isDark
          ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
          : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
      }
      cornerRadius={radius.md}
      style={{ height: 54, width: '100%' }}
      onPress={onPress}
    />
  );
}
