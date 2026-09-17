import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import Purchases, { AdFormat, AdMediatorName, AdRevenuePrecision } from 'react-native-purchases';
import { purchasesConfigured, storeConfigured } from './purchases';

/**
 * Ads on the Free plan: Google AdMob, reported to RevenueCat ("RevenueCat Ads") so ad revenue sits
 * next to subscriptions in its dashboard.
 *
 * - A banner at the bottom of Home and Log (src/components/AdSlot.tsx).
 * - Rewarded ads from the checks meter on Home: watching one earns AD_REWARD_CHECKS more comment
 *   checks. The reward is added ONLY when Google's servers confirm the view to the backend
 *   (server-side verification, supabase/functions/api/ads.ts); the app just asks Google to include
 *   the toxoff user id in that callback and then waits for the profile to update.
 *
 * The AdMob SDK is native, so none of this runs in Expo Go: there, and for paying users, every
 * entry point is a no-op (adsConfigured = false, `watch` answers 'demo'). The app id lives in
 * app.json (the AdMob config plugin); the ad unit ids in .env, with Google's test units in
 * development builds when they're not set.
 */

type GoogleAds = typeof import('react-native-google-mobile-ads');

const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
export const adsConfigured = Platform.OS === 'ios' && !inExpoGo;

let sdk: GoogleAds | null = null;
/** The AdMob SDK, loaded only where its native module exists. */
export function googleAds(): GoogleAds | null {
  if (!adsConfigured) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  sdk ??= require('react-native-google-mobile-ads') as GoogleAds;
  return sdk;
}

const unit = (configured: string | undefined, test: () => string) =>
  configured || (__DEV__ && adsConfigured ? test() : '');
export const BANNER_UNIT = unit(process.env.EXPO_PUBLIC_ADMOB_BANNER_UNIT, () => googleAds()!.TestIds.ADAPTIVE_BANNER);
export const REWARDED_UNIT = unit(process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT, () => googleAds()!.TestIds.REWARDED);

let initialized: Promise<void> | null = null;
let personalized = false;

/**
 * Once per app run, before the first ad: Google's consent form where the law requires one (EEA),
 * Apple's tracking prompt (declining it just means non-personalised ads), then the SDK.
 */
export function initAds(): Promise<void> {
  const g = googleAds();
  if (!g) return Promise.resolve();
  initialized ??= (async () => {
    try {
      await g.AdsConsent.gatherConsent();
    } catch (e) {
      console.warn('Ad consent form failed', e);
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Tracking = require('expo-tracking-transparency') as typeof import('expo-tracking-transparency');
      const { status } = await Tracking.requestTrackingPermissionsAsync();
      personalized = status === 'granted';
    } catch {
      personalized = false;
    }
    await g.default().initialize();
  })();
  return initialized;
}

/** Ad requests honour the tracking choice: without permission, only non-personalised ads. */
export const requestOptions = () => ({ requestNonPersonalizedAdsOnly: !personalized });

// ---- RevenueCat Ads: every ad event goes to RevenueCat's ad tracker ----

export type AdPlacement = 'home_banner' | 'log_banner' | 'checks_reward';

const tracker = () => (storeConfigured && purchasesConfigured() ? Purchases.adTracker : null);
const format = (placement: AdPlacement) => (placement === 'checks_reward' ? AdFormat.rewarded : AdFormat.banner);
const base = (placement: AdPlacement, adUnitId: string, impressionId: string) => ({
  mediatorName: AdMediatorName.adMob,
  adFormat: format(placement),
  adUnitId,
  impressionId,
  placement,
});

export const newImpressionId = () => Crypto.randomUUID();

export const trackAdLoaded = (placement: AdPlacement, adUnitId: string, impressionId: string) =>
  tracker()?.trackAdLoaded(base(placement, adUnitId, impressionId)).catch(() => {});
export const trackAdDisplayed = (placement: AdPlacement, adUnitId: string, impressionId: string) =>
  tracker()?.trackAdDisplayed(base(placement, adUnitId, impressionId)).catch(() => {});
export const trackAdOpened = (placement: AdPlacement, adUnitId: string, impressionId: string) =>
  tracker()?.trackAdOpened(base(placement, adUnitId, impressionId)).catch(() => {});
export const trackAdFailedToLoad = (placement: AdPlacement, adUnitId: string, code?: number | null) =>
  tracker()?.trackAdFailedToLoad({
    mediatorName: AdMediatorName.adMob,
    adFormat: format(placement),
    adUnitId,
    placement,
    mediatorErrorCode: code ?? null,
  }).catch(() => {});

/** Google's paid event: what this impression earned, as Google reports it. */
export type PaidEvent = { value: number; currency: string; precision: string | number };

export const trackAdRevenue = (placement: AdPlacement, adUnitId: string, impressionId: string, event: PaidEvent) =>
  tracker()?.trackAdRevenue({
    ...base(placement, adUnitId, impressionId),
    revenueMicros: Math.round(event.value * 1_000_000),
    currency: event.currency,
    precision: precisionOf(event.precision),
  }).catch(() => {});

// Google's SDK reports the precision as an enum (ESTIMATED, PRECISE, PUBLISHER_PROVIDED, UNKNOWN).
function precisionOf(precision: string | number): AdRevenuePrecision {
  const name = typeof precision === 'number' ? googleAds()?.RevenuePrecisions[precision] ?? '' : precision;
  const p = String(name).toLowerCase();
  if (p.includes('precise') || p.includes('exact')) return AdRevenuePrecision.exact;
  if (p.includes('estimat')) return AdRevenuePrecision.estimated;
  if (p.includes('publisher')) return AdRevenuePrecision.publisherDefined;
  return AdRevenuePrecision.unknown;
}

// ---- rewarded ads ----

export type RewardOutcome =
  | 'demo' // not an App Store build: nothing to show
  | 'unavailable' // no ad to show right now
  | 'dismissed' // closed before the end: no reward
  | 'rewarded'; // watched: Google is telling the backend, the checks arrive in a moment

const LOAD_TIMEOUT_MS = 20_000;

/**
 * Loads and shows one rewarded ad for the signed-in user. Google's callback to the backend names
 * the user (user_id and custom_data), so the reward lands on the right account.
 */
export async function showRewardedAd(userId: string): Promise<RewardOutcome> {
  const g = googleAds();
  if (!g || !REWARDED_UNIT) return 'demo';
  await initAds();
  const impressionId = newImpressionId();
  const ad = g.RewardedAd.createForAdRequest(REWARDED_UNIT, {
    ...requestOptions(),
    serverSideVerificationOptions: { userId, customData: userId },
  });

  const loaded = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), LOAD_TIMEOUT_MS);
    const done = (ok: boolean) => {
      clearTimeout(timer);
      resolve(ok);
    };
    ad.addAdEventListener(g.RewardedAdEventType.LOADED, () => {
      trackAdLoaded('checks_reward', REWARDED_UNIT, impressionId);
      done(true);
    });
    ad.addAdEventListener(g.AdEventType.ERROR, (error: { code?: number; message?: string }) => {
      trackAdFailedToLoad('checks_reward', REWARDED_UNIT, typeof error?.code === 'number' ? error.code : null);
      done(false);
    });
    ad.load();
  });
  if (!loaded) return 'unavailable';

  return new Promise<RewardOutcome>((resolve) => {
    let earned = false;
    ad.addAdEventListener(g.RewardedAdEventType.EARNED_REWARD, () => {
      earned = true;
    });
    ad.addAdEventListener(g.AdEventType.OPENED, () => trackAdDisplayed('checks_reward', REWARDED_UNIT, impressionId));
    ad.addAdEventListener(g.AdEventType.CLICKED, () => trackAdOpened('checks_reward', REWARDED_UNIT, impressionId));
    ad.addAdEventListener(g.AdEventType.PAID, (event?: PaidEvent) => {
      if (event) trackAdRevenue('checks_reward', REWARDED_UNIT, impressionId, event);
    });
    ad.addAdEventListener(g.AdEventType.CLOSED, () => resolve(earned ? 'rewarded' : 'dismissed'));
    ad.addAdEventListener(g.AdEventType.ERROR, () => resolve(earned ? 'rewarded' : 'unavailable'));
    ad.show().catch(() => resolve('unavailable'));
  });
}

/** One rewarded ad at a time; `busy` while it loads and plays. */
export function useRewardedAd(userId: string | null) {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const watch = useCallback(async (): Promise<RewardOutcome> => {
    if (!userId || running.current) return 'unavailable';
    running.current = true;
    setBusy(true);
    try {
      return await showRewardedAd(userId);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, [userId]);
  return { busy, watch, available: adsConfigured && Boolean(REWARDED_UNIT) };
}
