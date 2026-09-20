import React from 'react';
import { Image, View } from 'react-native';
import { Text } from './AppText';
import { useTheme } from '../theme/ThemeContext';

// The app icon itself (assets/icon.png), rounded the way iOS rounds it.
const ICON = require('../../assets/icon.png');
const MASCOT = require('../../assets/mascot/toxoff-mascot.png');

export function Mascot({ size = 224 }: { size?: number }) {
  return (
    <Image
      source={MASCOT}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

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
      }}
    >
      <Image source={ICON} style={{ width: size, height: size }} accessibilityLabel="toxoff" />
    </View>
  );
}

export function Wordmark({ size = 30 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <Text accessibilityLabel="toxoff" style={{ fontSize: size, fontWeight: '800', color: colors.text, letterSpacing: -size * 0.06, flexShrink: 1 }}>
      tox<Text style={{ color: colors.text, fontWeight: '500' }}>off</Text>
    </Text>
  );
}
