import React from 'react';
import { Image, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

// The app icon itself (assets/icon.png), rounded the way iOS rounds it.
const ICON = require('../../assets/icon.png');

export function LogoMark({ size = 56 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        overflow: 'hidden',
        backgroundColor: colors.primaryDark,
        shadowColor: colors.primaryDark,
        shadowOpacity: 0.35,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
      }}
    >
      <Image source={ICON} style={{ width: size, height: size }} accessibilityLabel="toxoff" />
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
