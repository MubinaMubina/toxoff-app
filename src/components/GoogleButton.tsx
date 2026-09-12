import { FontAwesome } from '@expo/vector-icons';
import React from 'react';
import { useTheme } from '../theme/ThemeContext';
import { SocialButton } from './SocialButton';

export function GoogleButton({ onPress, loading }: { onPress: () => void; loading?: boolean }) {
  const { colors } = useTheme();
  return (
    <SocialButton
      label="Continue with Google"
      icon={<FontAwesome name="google" size={20} color="#EA4335" />}
      onPress={onPress}
      loading={loading}
      background={colors.card}
      foreground={colors.text}
      border={colors.border}
    />
  );
}
