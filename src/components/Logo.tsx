import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

export function LogoMark({ size = 56 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 3,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: colors.primary,
        shadowOpacity: 0.35,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
      }}
    >
      <Ionicons name="shield-checkmark" size={size * 0.55} color="#FFFFFF" />
    </View>
  );
}

export function Wordmark({ size = 30 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <Text style={{ fontSize: size, fontWeight: '800', color: colors.text, letterSpacing: -0.5 }}>
      tox<Text style={{ color: colors.primary }}>off</Text>
    </Text>
  );
}
