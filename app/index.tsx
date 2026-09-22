import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Text } from '../src/components/AppText';
import { Button } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/theme/ThemeContext';

export default function Index() {
  const { user, loading, onboarded, passwordRecovery, profileError, retryProfile, signOut } = useAuth();
  const { colors, font, spacing } = useTheme();
  if (passwordRecovery !== 'idle') return <Redirect href="/(auth)/reset-password" />;

  // Signed in but the profile hasn't loaded yet: wait, so a new user isn't shown the tabs first.
  if (loading || (user && onboarded === null)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, paddingHorizontal: spacing.gutter }}>
        {user && profileError ? (
          <View style={{ alignItems: 'center', gap: 12, maxWidth: 360 }}>
            <Text style={{ color: colors.text, fontSize: font.size.md, textAlign: 'center', lineHeight: 22 }}>{profileError}</Text>
            <Button label="Try again" icon="refresh-outline" onPress={retryProfile} />
            <Button label="Log out" variant="secondary" onPress={() => signOut().catch(() => {})} />
          </View>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </View>
    );
  }

  return <Redirect href={!user ? '/splash' : onboarded === false ? '/onboarding' : '/(tabs)'} />;
}
