import { StripeProvider } from '@stripe/stripe-react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/context/AuthContext';
import { ModerationProvider } from '../src/context/ModerationContext';
import { RegionProvider } from '../src/context/RegionContext';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';

const STRIPE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

function Navigator() {
  const { colors, isDark } = useTheme();
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
        <Stack.Screen
          name="connect-accounts"
          options={{ animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="paywall" options={{ animation: 'slide_from_bottom' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StripeProvider
          publishableKey={STRIPE_KEY}
          merchantIdentifier="merchant.com.toxoff.app"
        >
          <ThemeProvider>
            <RegionProvider>
              <AuthProvider>
                <ModerationProvider>
                  <Navigator />
                </ModerationProvider>
              </AuthProvider>
            </RegionProvider>
          </ThemeProvider>
        </StripeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
