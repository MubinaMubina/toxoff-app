import * as Haptics from 'expo-haptics';
import React from 'react';
import { Pressable, Text } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

export function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { colors, font, radius } = useTheme();
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: radius.pill,
        backgroundColor: active ? colors.primary : colors.surfaceAlt,
        borderWidth: 1,
        borderColor: active ? colors.primary : colors.border,
      }}
    >
      <Text
        style={{
          color: active ? colors.onPrimary : colors.textMuted,
          fontSize: font.size.sm,
          fontWeight: font.weight.semibold,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
