import { FontAwesome5, FontAwesome6 } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';
import { Platform } from '../types';

const COLORS: Record<Platform, string> = {
  instagram: '#E1306C',
  tiktok: '#000000',
};

export function PlatformIcon({
  platform,
  size = 18,
  withBackground = false,
  tint,
}: {
  platform: Platform;
  size?: number;
  withBackground?: boolean;
  tint?: string;
}) {
  const color = tint ?? (withBackground ? '#FFFFFF' : COLORS[platform]);
  const icon =
    platform === 'instagram' ? (
      <FontAwesome5 name="instagram" size={size} color={color} />
    ) : (
      <FontAwesome6 name="tiktok" size={size} color={color} />
    );

  if (!withBackground) return icon;

  const box = Math.round(size * 1.9); // whole points, so tiles line up with fixed icon slots
  return (
    <View
      style={{
        width: box,
        height: box,
        borderRadius: box / 3.2,
        backgroundColor: COLORS[platform],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {icon}
    </View>
  );
}
