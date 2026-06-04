import { FontAwesome } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

export function GoogleButton({ onPress, loading }: { onPress: () => void; loading?: boolean }) {
  const { colors, radius, font } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => ({
        height: 54,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {loading ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <>
          <FontAwesome name="google" size={18} color="#EA4335" />
          <Text style={{ color: colors.text, fontSize: font.size.md, fontWeight: font.weight.semibold }}>
            Continue with Google
          </Text>
        </>
      )}
    </Pressable>
  );
}
