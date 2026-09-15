import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, Text, TextInput, TextInputProps, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

type Props = TextInputProps & {
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  isPassword?: boolean;
};

export function TextField({ label, icon, isPassword, ...props }: Props) {
  const { colors, radius, font } = useTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);

  return (
    <View style={{ gap: 7 }}>
      {label && (
        <Text style={{ color: colors.textMuted, fontSize: font.size.sm, fontWeight: font.weight.medium }}>
          {label}
        </Text>
      )}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surfaceAlt,
          borderRadius: radius.md,
          borderWidth: 1.5,
          borderColor: focused ? colors.primary : 'transparent',
          paddingHorizontal: 14,
          minHeight: 52,
          gap: 10,
        }}
      >
        {icon && <Ionicons name={icon} size={19} color={focused ? colors.primary : colors.textFaint} />}
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={colors.textFaint}
          secureTextEntry={isPassword && hidden}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ flex: 1, color: colors.text, fontSize: font.size.md, minHeight: 52, paddingVertical: 12 }}
          {...props}
        />
        {isPassword && (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            hitSlop={13}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
          >
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={19} color={colors.textFaint} />
          </Pressable>
        )}
      </View>
    </View>
  );
}
