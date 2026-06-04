import { Stack } from 'expo-router';
import React from 'react';
import { useTheme } from '../../src/theme/ThemeContext';

export default function AuthLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="trial-started" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
