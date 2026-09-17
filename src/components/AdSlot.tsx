import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import {
  AdPlacement,
  adsConfigured,
  BANNER_UNIT,
  googleAds,
  newImpressionId,
  requestOptions,
  trackAdDisplayed,
  trackAdFailedToLoad,
  trackAdOpened,
  trackAdRevenue,
} from '../lib/ads';
import { useTheme } from '../theme/ThemeContext';

/**
 * A banner ad for the Free plan (src/lib/ads.ts). Renders nothing for paying users, in Expo Go,
 * or when no ad filled, so screens need no second layout without it.
 */
export function AdSlot({ placement }: { placement: Extract<AdPlacement, 'home_banner' | 'log_banner'> }) {
  const { subscription } = useAuth();
  const { spacing } = useTheme();
  const [failed, setFailed] = useState(false);
  const impressionId = useRef(newImpressionId());

  const g = googleAds();
  if (!g || !adsConfigured || !BANNER_UNIT || subscription.paying || failed) return null;
  const { BannerAd, BannerAdSize } = g;
  return (
    <View style={{ alignItems: 'center', marginTop: spacing.xl }} accessibilityLabel="Advertisement">
      <BannerAd
        unitId={BANNER_UNIT}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={requestOptions()}
        onAdLoaded={() => trackAdDisplayed(placement, BANNER_UNIT, impressionId.current)}
        onAdFailedToLoad={(error: Error & { code?: number }) => {
          trackAdFailedToLoad(placement, BANNER_UNIT, typeof error?.code === 'number' ? error.code : null);
          setFailed(true);
        }}
        onAdOpened={() => trackAdOpened(placement, BANNER_UNIT, impressionId.current)}
        onPaid={(event) => trackAdRevenue(placement, BANNER_UNIT, impressionId.current, event)}
      />
    </View>
  );
}
