import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppFontProvider, MANROPE_FONTS } from '../src/components/AppText';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { ModerationProvider } from '../src/context/ModerationContext';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';

// The launch screen (the mascot on the icon's green) stays up while the app starts, then fades
// into the first real screen, so there is no spinner or colour jump in between.
SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ duration: 400, fade: true });
// A slow network must never trap the user on the launch screen: after this the app's own
// loading state shows instead.
const LAUNCH_SCREEN_LIMIT_MS = 6000;

function Navigator({ fontsPending }: { fontsPending: boolean }) {
  const { colors, isDark } = useTheme();
  const { passwordRecovery, loading, user, onboarded, profileError } = useAuth();

  // Ready once fonts are in and we know where the user goes: signed out, or the profile says
  // whether onboarding is done (or failed, which shows its own Try again screen).
  const firstScreenReady = !fontsPending && !loading && (!user || onboarded !== null || !!profileError);
  useEffect(() => {
    if (!firstScreenReady) return;
    // One beat for the redirect's screen to draw before the fade uncovers it.
    const beat = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 100);
    return () => clearTimeout(beat);
  }, [firstScreenReady]);
  useEffect(() => {
    const limit = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), LAUNCH_SCREEN_LIMIT_MS);
    return () => clearTimeout(limit);
  }, []);
  const router = useRouter();
  const segments = useSegments();
  const navigation = useRootNavigationState();
  const onRecoveryScreen = segments.some((segment) => segment === 'reset-password');

  useEffect(() => {
    if (!loading && navigation?.key && passwordRecovery !== 'idle' && !onRecoveryScreen) {
      router.replace('/(auth)/reset-password');
    }
  }, [passwordRecovery, onRecoveryScreen, navigation?.key, router, loading]);

  // Signed-out sessions (a revoked refresh token, a password changed elsewhere, a deep link opened
  // while logged out) leave every app screen; only the welcome and auth screens stay reachable.
  const first: string | undefined = segments[0];
  const onPublicScreen = first === undefined || first === 'splash' || first === '(auth)';
  useEffect(() => {
    if (!loading && navigation?.key && passwordRecovery === 'idle' && !user && !onPublicScreen) {
      router.replace('/splash');
    }
  }, [user, onPublicScreen, navigation?.key, router, loading, passwordRecovery]);
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
