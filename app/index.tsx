import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/theme/ThemeContext';

export default function Index() {
  const { user, loading, onboarded, passwordRecovery } = useAuth();
  const { colors } = useTheme();
  if (passwordRecovery !== 'idle') return <Redirect href="/(auth)/reset-password" />;

  // Signed in but the profile hasn't loaded yet: wait, so a new user isn't shown the tabs first.
  if (loading || (user && onboarded === null)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return <Redirect href={!user ? '/splash' : onboarded === false ? '/onboarding' : '/(tabs)'} />;
}
