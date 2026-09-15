import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Linking, Platform } from 'react-native';
import Purchases, { type PurchasesPackage } from 'react-native-purchases';
import { BillingInterval, PaidPlanId } from '../types';
import { apiPost, isApiConfigured } from './api';

/**
 * Subscriptions: Apple's in-app purchase, through RevenueCat (backend: supabase/functions/api/store.ts).
 *
 * RevenueCat knows each user by their toxoff user id, so its webhooks tell the backend whose
 * subscription changed; right after a purchase or restore the app asks the backend to re-read it too.
 * The App Store products are toxoff_<plan>_<interval> (toxoff_solo_monthly, ...), in RevenueCat's
 * current offering.
 *
 * Real purchases need an App Store build: in Expo Go, or without a RevenueCat key, everything here
 * resolves to { status: 'demo' } and the paywall shows the list prices.
 */

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
export const storeConfigured = Platform.OS === 'ios' && !inExpoGo && Boolean(IOS_KEY) && isApiConfigured;

export const productId = (plan: PaidPlanId, interval: BillingInterval) => `toxoff_${plan}_${interval}`;

let configured = false;

/** Signs RevenueCat in as the toxoff user; null when they sign out. */
export async function identifyPurchaser(userId: string | null): Promise<void> {
  if (!storeConfigured) return;
  if (!configured) {
    if (!userId) return;
    Purchases.configure({ apiKey: IOS_KEY, appUserID: userId });
    configured = true;
    return;
  }
  if (userId) await Purchases.logIn(userId);
  else if (!(await Purchases.isAnonymous())) await Purchases.logOut();
}

/** The App Store's packages by product id, with prices in the user's own currency. */
export async function loadStorePackages(): Promise<Map<string, PurchasesPackage>> {
  if (!storeConfigured || !configured) return new Map();
  const offerings = await Purchases.getOfferings();
  const packages = offerings.current?.availablePackages ?? [];
  return new Map(packages.map((p) => [p.product.identifier, p]));
}

const syncWithBackend = () => apiPost('/billing/app-store/sync');

export type PurchaseResult = { status: 'demo' } | { status: 'cancelled' } | { status: 'purchased' };

export async function purchasePlan(
  plan: PaidPlanId,
  interval: BillingInterval,
  packages: Map<string, PurchasesPackage>
): Promise<PurchaseResult> {
  if (!storeConfigured) return { status: 'demo' };
  const pkg = packages.get(productId(plan, interval));
  if (!pkg) throw new Error('This plan isn’t available from the App Store right now. Please try again later.');
  try {
    // Switching between Solo, Plus and Studio is the same call: Apple treats it as an upgrade or
    // downgrade within the subscription group.
    await Purchases.purchasePackage(pkg);
  } catch (e: any) {
    if (e?.userCancelled) return { status: 'cancelled' };
    throw e;
  }
  // RevenueCat's webhook reports it too; this makes the new plan show straight away.
  await syncWithBackend();
  return { status: 'purchased' };
}

/** Required by the App Store: brings back subscriptions bought with this Apple ID. */
export async function restorePurchases(): Promise<{ status: 'demo' | 'restored' }> {
  if (!storeConfigured) return { status: 'demo' };
  await Purchases.restorePurchases();
  await syncWithBackend();
  return { status: 'restored' };
}

/** Apple's own page for changing plan, the payment method, or cancelling. */
export async function manageSubscription(): Promise<void> {
  if (storeConfigured && configured) {
    await Purchases.showManageSubscriptions();
    await syncWithBackend().catch(() => {});
    return;
  }
  await Linking.openURL('https://apps.apple.com/account/subscriptions');
}
