import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { Text } from '../src/components/AppText';
import type { PurchasesPackage } from 'react-native-purchases';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Mascot } from '../src/components/Logo';
import { Button, H1, HeaderButton } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { ADS_ENABLED, getPlan, PAID_PLANS } from '../src/data/plans';
import {
  annualSavings,
  formatUsd,
  listAnnualTotal,
  listPrice,
  MAX_ANNUAL_SAVINGS,
} from '../src/data/pricing';
import {
  loadStorePackages,
  manageSubscription,
  productId,
  purchasePlan,
  restorePurchases,
  storeConfigured,
} from '../src/lib/purchases';
import { openLink, PRIVACY_URL, TERMS_URL } from '../src/lib/links';
import { shortDate } from '../src/lib/time';
import { useTheme } from '../src/theme/ThemeContext';
import { BillingInterval, PaidPlanId, Plan } from '../src/types';

/** What the selected plan gets, in a few words each: the list changes as the plan does. */
function planHighlights(plan: Plan): string[] {
  return [
    plan.maxAccounts === 1 ? '1 Instagram account' : `Up to ${plan.maxAccounts} Instagram accounts`,
    'Unlimited comment checks',
    plan.blockedUsers ? 'Keyword blocklist and blocked users' : 'Keyword blocklist',
    'Your full history in the Log',
    ...(ADS_ENABLED ? ['No ads'] : []),
  ];
}

export default function Paywall() {
  const { colors, font, radius, spacing } = useTheme();
  const router = useRouter();
  const { width, height, fontScale } = useWindowDimensions();
  const { user, subscription, refreshSubscription, setDemoBilling } = useAuth();
  const billing = subscription.billing;

  // Opens on the plan the user already has, if any.
  const [interval, setInterval] = useState<BillingInterval>(billing?.interval ?? 'monthly');
  const [selected, setSelected] = useState<PaidPlanId>(billing?.plan ?? 'plus');
  const [packages, setPackages] = useState<Map<string, PurchasesPackage>>(new Map());
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);
  const [pricesLoading, setPricesLoading] = useState(true);
  // Three tiles side by side need about 110pt each; narrow screens and large text get rows.
  const tiles = width >= 360 && fontScale <= 1.2;
  // At accessibility sizes, keep every control reachable in the scroll view.
  const stickyPurchase = height >= 640 && fontScale < 1.5;

  // Live builds show App Store prices; demo builds use explicitly labelled USD list prices.
  const loadPrices = useCallback(() => {
    setPricesLoading(true);
    loadStorePackages()
      .then(setPackages)
      .catch((e) => console.warn('Could not load App Store prices', e))
      .finally(() => setPricesLoading(false));
  }, []);

  useEffect(() => {
    loadPrices();
  }, [loadPrices, user?.id]);

  const selectedPlan = getPlan(selected);
  const selectedName = selectedPlan.name;
  const cancelling = billing?.cancelAtPeriodEnd ?? false;
  // The plan the user pays for, if any.
  const paidPlan = billing?.plan ?? (subscription.status === 'active' ? subscription.plan : null);
  const onSelected = billing
    ? billing.plan === selected && billing.interval === interval
    : paidPlan === selected;
  const isCurrentPlan = onSelected && !cancelling;
  const ctaLabel = isCurrentPlan
    ? 'Your current plan'
    : onSelected
      ? `Keep ${selectedName}` // cancelled: renewal is turned back on in Apple's settings
      : paidPlan === selected
        ? `Switch to ${interval} billing`
        : paidPlan
          ? `Switch to ${selectedName}`
          : `Continue with ${selectedName}`;

  const headline = cancelling && billing?.periodEnd
    ? 'Keep your protection'
    : subscription.status === 'free'
      ? 'Never read another hateful comment.'
      : 'Change your plan';
  const subtitle = cancelling && billing?.periodEnd
    ? `Your ${getPlan(billing.plan).name} plan ends ${shortDate(billing.periodEnd)}.`
    : subscription.status === 'free'
      ? 'Unlimited checks, in every language.'
      : null;

  const priceOf = (plan: PaidPlanId) => {
    const product = packages.get(productId(plan, interval))?.product;
    if (product) {
      if (interval === 'monthly') return { amount: product.priceString, unit: '/ month', perMonth: null };
      return { amount: product.priceString, unit: '/ year', perMonth: product.pricePerMonthString ?? null };
    }
    if (storeConfigured) return { amount: null, unit: '', perMonth: null }; // loading, or not in the store
    return {
      amount: formatUsd(interval === 'annual' ? listAnnualTotal(plan) : listPrice(plan, interval)),
      unit: interval === 'annual' ? '/ year' : '/ month',
      perMonth: interval === 'annual' ? formatUsd(listPrice(plan, interval)) : null,
    };
  };

  // The biggest yearly discount, from the store's own prices when it has them.
  const storeSavings = PAID_PLANS.map((p) => {
    const monthly = packages.get(productId(p.id, 'monthly'))?.product.price;
    const annual = packages.get(productId(p.id, 'annual'))?.product.price;
    return monthly && annual ? annualSavings(monthly, annual) : 0;
  });
  const bestSaving = Math.max(...storeSavings) || MAX_ANNUAL_SAVINGS;

  const selectedPrice = priceOf(selected);
  const selectedPackageAvailable = packages.has(productId(selected, interval));
  const needsStorePrice = Boolean(user) && storeConfigured && !selectedPackageAvailable && !(onSelected && cancelling);
  const purchaseDisabled = isCurrentPlan || busy !== null || (needsStorePrice && pricesLoading);

  const subscribe = async () => {
    if (!user) {
      router.push('/(auth)/signup');
      return;
    }
    setBusy('buy');
    try {
      if (onSelected && cancelling) {
        await manageSubscription();
        await refreshSubscription();
        return;
      }
      const result = await purchasePlan(selected, interval, packages);
      if (result.status === 'cancelled') return;
      if (result.status === 'purchased' && !result.synced) {
        Alert.alert('Purchase complete', `You're on ${selectedName}. Your plan will show here in a moment.`);
        router.back();
        return;
      }
      if (result.status === 'demo') {
        const periodEnd = new Date();
        if (interval === 'annual') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        else periodEnd.setMonth(periodEnd.getMonth() + 1);
        setDemoBilling({
          status: 'active',
          plan: selected,
          interval,
          periodEnd: periodEnd.toISOString(),
          cancelAtPeriodEnd: false,
          store: 'app_store',
        });
      } else {
        await refreshSubscription();
      }
      Alert.alert(
        paidPlan ? 'Plan updated' : 'You’re all set 🎉',
        result.status === 'demo'
          ? `Demo mode: you're on ${selectedName}. Real purchases work in the App Store build.`
          : paidPlan
            ? `You're switching to ${selectedName}. Upgrades start right away; other changes start when your current period ends.`
            : `You're on ${selectedName}.`
      );
      router.back();
    } catch (e: any) {
      Alert.alert('Purchase didn’t go through', e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    setBusy('restore');
    try {
      if ((await restorePurchases()).status === 'demo') {
        Alert.alert('Demo mode', 'Restoring purchases works in the App Store build.');
        return;
      }
      await refreshSubscription();
      Alert.alert('Purchases restored', 'If this Apple ID has a toxoff subscription, it’s active again.');
    } catch (e: any) {
      Alert.alert('Couldn’t restore purchases', e?.message ?? 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const choose = (plan: PaidPlanId) => {
    Haptics.selectionAsync().catch(() => {});
    setSelected(plan);
  };

  const footnote = needsStorePrice
    ? pricesLoading
      ? 'Getting your App Store price…'
      : 'This plan isn’t available in the App Store right now.'
    : onSelected && cancelling
      ? 'Manage renewal in your App Store settings.'
      : selectedPrice.amount
        ? `${selectedPrice.amount} ${selectedPrice.unit} · Renews automatically · Cancel anytime`
        : 'Renews automatically · Cancel anytime';

  const purchaseControls = (
    <View style={{ paddingTop: 14, paddingBottom: 6, gap: 10 }}>
      <Button
        label={needsStorePrice && !isCurrentPlan ? (pricesLoading ? 'Loading price…' : 'Try again') : ctaLabel}
        onPress={needsStorePrice ? loadPrices : subscribe}
        loading={busy === 'buy'}
        disabled={purchaseDisabled}
      />
      <Text accessibilityLiveRegion="polite" style={{ color: colors.textMuted, fontSize: font.size.xs, textAlign: 'center' }}>
        {footnote}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Close on the left, Restore on the right: where iOS paywalls put them. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <HeaderButton icon="close" label="Close" onPress={() => router.back()} />
          <Pressable
            onPress={restore}
            disabled={busy !== null}
            accessibilityRole="button"
            accessibilityLabel="Restore purchases"
            accessibilityState={{ disabled: busy !== null, busy: busy === 'restore' }}
            style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', paddingLeft: 12, opacity: pressed ? 0.6 : 1 })}
          >
            {busy === 'restore' ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={{ color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.semibold }}>Restore</Text>
            )}
          </Pressable>
        </View>

        <View style={{ alignItems: 'center' }}>
          <Mascot size={height < 700 ? 88 : 112} />
          <H1 style={{ marginTop: 6, textAlign: 'center', fontWeight: font.weight.bold, letterSpacing: -0.9, lineHeight: 34 }}>
            {headline}
          </H1>
          {subtitle && (
            <Text style={{ color: colors.textMuted, fontSize: font.size.md, marginTop: 8, textAlign: 'center' }}>{subtitle}</Text>
          )}
        </View>

        {/* Billing period, with the yearly saving on its own tab */}
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Billing period"
          style={{ flexDirection: 'row', gap: 4, padding: 4, marginTop: 22, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}
        >
          {(['monthly', 'annual'] as const).map((value) => {
            const active = value === interval;
            return (
              <Pressable
                key={value}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); setInterval(value); }}
                disabled={busy !== null}
                accessibilityRole="radio"
                accessibilityLabel={value === 'monthly' ? 'Monthly billing' : `Yearly billing, save up to ${bestSaving}%`}
                accessibilityState={{ checked: active, disabled: busy !== null }}
                style={{ flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius.sm, backgroundColor: active ? colors.card : 'transparent' }}
              >
                <Text style={{ color: active ? colors.text : colors.textMuted, fontSize: font.size.md, fontWeight: font.weight.semibold }}>
                  {value === 'monthly' ? 'Monthly' : 'Yearly'}
                </Text>
                {value === 'annual' && bestSaving > 0 && (
                  <View style={{ backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ color: colors.accentText, fontSize: font.size.xs, fontWeight: font.weight.bold }}>−{bestSaving}%</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        {/* Plans: the number of accounts is what tells them apart, so it's the big figure. */}
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Protection plan"
          style={{ flexDirection: tiles ? 'row' : 'column', gap: tiles ? 8 : 10, marginTop: 14 }}
        >
          {PAID_PLANS.map((plan) => {
            const active = selected === plan.id;
            const price = priceOf(plan.id);
            const current = paidPlan === plan.id;
            const tag = current ? 'Current' : plan.popular ? 'Popular' : null;
            const accounts = plan.maxAccounts === 1 ? 'account' : 'accounts';
            const amount = price.amount ?? (pricesLoading ? '…' : '—');
            return (
              <Pressable
                key={plan.id}
                onPress={() => choose(plan.id)}
                disabled={busy !== null}
                accessibilityRole="radio"
                accessibilityState={{ checked: active, disabled: busy !== null }}
                accessibilityLabel={`${plan.name}. ${plan.maxAccounts === 1 ? '1 Instagram account' : `Up to ${plan.maxAccounts} Instagram accounts`}. ${price.amount ? `${price.amount} ${price.unit}` : 'Price not available'}${tag ? `. ${tag}` : ''}`}
                style={({ pressed }) => ({
                  flex: tiles ? 1 : undefined,
                  flexDirection: tiles ? 'column' : 'row',
                  alignItems: tiles ? 'center' : 'center',
                  gap: tiles ? 0 : 14,
                  paddingVertical: tiles ? 16 : 14,
                  paddingHorizontal: tiles ? 8 : 16,
                  borderRadius: radius.lg,
                  borderWidth: 2,
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.primarySoft : colors.card,
                  opacity: pressed ? 0.85 : !price.amount && !pricesLoading ? 0.55 : 1,
                })}
              >
                {tiles ? (
                  <>
                    <View style={{ height: 20, justifyContent: 'center' }}>
                      {tag && (
                        <View style={{ backgroundColor: active ? colors.primary : colors.accentSoft, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
                          <Text style={{ color: active ? colors.onPrimary : colors.accentText, fontSize: 11, fontWeight: font.weight.bold }}>{tag}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ color: colors.text, fontSize: font.size.md, fontWeight: font.weight.semibold, marginTop: 6 }}>{plan.name}</Text>
                    <Text style={{ color: active ? colors.primary : colors.text, fontSize: 40, fontWeight: font.weight.heavy, letterSpacing: -1.5, lineHeight: 46, marginTop: 2, fontVariant: ['tabular-nums'] }}>
                      {plan.maxAccounts}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: font.size.xs, marginTop: -2 }}>{accounts}</Text>
                    <View style={{ height: 1, alignSelf: 'stretch', backgroundColor: active ? colors.primary : colors.border, opacity: 0.35, marginVertical: 12, marginHorizontal: 6 }} />
                    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ color: colors.text, fontSize: font.size.md, fontWeight: font.weight.bold }}>
                      {amount}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: font.size.xs, marginTop: 1 }}>{price.amount ? price.unit : ' '}</Text>
                  </>
                ) : (
                  <>
                    <Text style={{ color: active ? colors.primary : colors.text, fontSize: 32, fontWeight: font.weight.heavy, minWidth: 44, textAlign: 'center', fontVariant: ['tabular-nums'] }}>
                      {plan.maxAccounts}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: font.size.md, fontWeight: font.weight.semibold }}>
                        {plan.name}{tag ? ` · ${tag}` : ''}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: font.size.sm }}>Instagram {accounts}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ color: colors.text, fontSize: font.size.md, fontWeight: font.weight.bold }}>{amount}</Text>
                      {!!price.amount && <Text style={{ color: colors.textMuted, fontSize: font.size.xs }}>{price.unit}</Text>}
                    </View>
                  </>
                )}
              </Pressable>
            );
          })}
        </View>

        {interval === 'annual' && selectedPrice.perMonth && (
          <Text style={{ color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.semibold, textAlign: 'center', marginTop: 10 }}>
            That’s {selectedPrice.perMonth} a month
          </Text>
        )}

        {/* What this plan gets */}
        <View style={{ marginTop: 20, gap: 10 }}>
          {planHighlights(selectedPlan).map((line) => (
            <View key={line} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="checkmark" size={14} color={colors.primary} accessible={false} />
              </View>
              <Text style={{ color: colors.text, fontSize: font.size.md, flex: 1 }}>{line}</Text>
            </View>
          ))}
        </View>

        {!storeConfigured && (
          <Text style={{ color: colors.textMuted, fontSize: font.size.xs, marginTop: 20 }}>
            US list prices shown. Purchases are simulated in this demo.
          </Text>
        )}
        <Text style={{ color: colors.textFaint, fontSize: font.size.xs, lineHeight: 17, marginTop: 20 }}>
          Payment is charged to your Apple ID. Subscriptions renew automatically unless you cancel
          at least 24 hours before the end of the period. Manage or cancel in your App Store account settings.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 20 }}>
          <Pressable onPress={() => openLink(TERMS_URL)} accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ color: colors.textMuted, fontSize: font.size.xs, fontWeight: font.weight.semibold, textDecorationLine: 'underline' }}>Terms of Use</Text>
          </Pressable>
          <Pressable onPress={() => openLink(PRIVACY_URL)} accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ color: colors.textMuted, fontSize: font.size.xs, fontWeight: font.weight.semibold, textDecorationLine: 'underline' }}>Privacy Policy</Text>
          </Pressable>
        </View>
        {!stickyPurchase && purchaseControls}
      </ScrollView>
      {stickyPurchase && (
        <View style={{ paddingHorizontal: spacing.gutter, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border }}>
          {purchaseControls}
        </View>
      )}
    </SafeAreaView>
  );
}
