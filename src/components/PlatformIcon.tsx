import React from 'react';
import { Image, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { palette } from '../theme/colors';
import type { Platform } from '../types';

const SOURCES: Record<Platform, ImageSourcePropType> = {
  instagram: require('../../assets/platforms/instagram.png'),
  tiktok: require('../../assets/platforms/tiktok.png'),
};

export function PlatformIcon({
  platform,
  size = 18,
  withBackground = false,
}: {
  platform: Platform;
  size?: number;
  withBackground?: boolean;
}) {
  const icon = (
    <Image
      source={SOURCES[platform]}
      resizeMode="contain"
      style={{ width: size, height: size }}
      accessible={false}
    />
  );

  if (!withBackground) return icon;

  const box = Math.round(size * 1.9); // whole points, so tiles line up with fixed icon slots
  return (
    <View
      style={{
        width: box,
        height: box,
        borderRadius: box / 3.2,
        backgroundColor: palette.white,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {icon}
    </View>
  );
}
