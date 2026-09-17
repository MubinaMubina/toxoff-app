import * as Haptics from 'expo-haptics';
import React from 'react';
import { Pressable } from 'react-native';
import { Text } from './AppText';
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
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        minHeight: 44,
        justifyContent: 'center',
        borderRadius: radius.md,
        backgroundColor: active ? colors.primary : colors.neutralSoft,
        borderWidth: 1,
        borderColor: active ? colors.primary : colors.neutralBorder,
      }}
    >
      <Text
        style={{
          color: active ? colors.onPrimary : colors.neutral,
          fontSize: font.size.sm,
          fontWeight: font.weight.semibold,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
