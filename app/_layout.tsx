import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { ModerationProvider } from '../src/context/ModerationContext';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';

function Navigator() {
  const { colors, isDark } = useTheme();
  const { passwordRecovery, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const navigation = useRootNavigationState();
  const onRecoveryScreen = segments.some((segment) => segment === 'reset-password');

  useEffect(() => {
    if (!loading && navigation?.key && passwordRecovery !== 'idle' && !onRecoveryScreen) {
      router.replace('/(auth)/reset-password');
    }
  }, [passwordRecovery, onRecoveryScreen, navigation?.key, router, loading]);
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="splash" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen
          name="connect-accounts"
          options={{ animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="paywall" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="invite" options={{ animation: 'slide_from_bottom' }} />
      </Stack>
      {loading && (
        <View accessibilityViewIsModal accessibilityLabel="Loading your account" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', zIndex: 1000 }]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <ModerationProvider>
              <Navigator />
            </ModerationProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
