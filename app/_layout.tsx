import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppFontProvider, MANROPE_FONTS } from '../src/components/AppText';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { ModerationProvider } from '../src/context/ModerationContext';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';

function Navigator({ fontsPending }: { fontsPending: boolean }) {
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
      {(loading || fontsPending) && (
        <View accessibilityViewIsModal accessibilityLabel={fontsPending ? 'Loading toxoff' : 'Loading your account'} style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', zIndex: 1000 }]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(MANROPE_FONTS);
  const [fontWaitExpired, setFontWaitExpired] = useState(false);

  useEffect(() => {
    if (fontsLoaded || fontError) return;
    // Bundled fonts normally load immediately. A native asset failure must not block the app.
    const timeout = setTimeout(() => setFontWaitExpired(true), 4000);
    return () => clearTimeout(timeout);
  }, [fontsLoaded, fontError]);

  const fontsPending = !fontsLoaded && !fontError && !fontWaitExpired;
  return (
    <AppFontProvider loaded={fontsLoaded}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ThemeProvider>
            <AuthProvider>
              <ModerationProvider>
                <Navigator fontsPending={fontsPending} />
              </ModerationProvider>
            </AuthProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </AppFontProvider>
  );
}
