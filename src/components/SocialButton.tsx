import React from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

// Shared shell for the "Continue with …" buttons: the same height (Button size lg), corners,
// label size and icon size, so Apple and Google read as a matched pair.
export function SocialButton({
  label,
  icon,
  onPress,
  loading,
  background,
  foreground,
  border,
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  loading?: boolean;
  background: string;
  foreground: string;
  border?: string;
}) {
  const { radius, font } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        height: 54,
        borderRadius: radius.md,
        borderWidth: border ? 1 : 0,
        borderColor: border,
        backgroundColor: background,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <>
          {icon}
          <Text style={{ color: foreground, fontSize: font.size.lg, fontWeight: font.weight.semibold }}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
