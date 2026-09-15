import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, H1, HeaderButton } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { getPlan, PAID_PLAN_COMMON_FEATURES, PAID_PLANS } from '../src/data/plans';
import {
  annualSavings,
  formatUsd,
  listAnnualSavings,
  listAnnualTotal,
  listPrice,
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
import { BillingInterval, PaidPlanId } from '../src/types';

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
  const stackPrices = width < 375 || fontScale > 1.15;
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

  const selectedName = getPlan(selected).name;
  const trialEnd =
    subscription.status === 'trialing' && subscription.trialEndsAt
      ? shortDate(subscription.trialEndsAt)
      : null;
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
          : trialEnd
            ? `Start ${selectedName} now`
            : `Upgrade to ${selectedName}`;

  const subtitle =
    trialEnd && !paidPlan
      ? `Your free trial ends ${trialEnd}. Subscribing ends it early and starts your plan today.`
      : cancelling && billing?.periodEnd
        ? `Your ${getPlan(billing.plan).name} plan ends ${shortDate(billing.periodEnd)}. Choose a plan to keep going.`
        : subscription.status === 'free'
          ? 'Unlimited moderation, more accounts, and custom rules. Cancel anytime.'
          : 'Change your plan anytime.';

  const priceOf = (plan: PaidPlanId) => {
    const product = packages.get(productId(plan, interval))?.product;
    if (product) {
      if (interval === 'monthly') return { amount: product.priceString, unit: '/ month', note: null };
      // The saving against the store's own monthly price, so it's right in every currency.
      const monthly = packages.get(productId(plan, 'monthly'))?.product.price;
      const saving = monthly ? annualSavings(monthly, product.price) : 0;
      const details = [
        product.pricePerMonthString ? `${product.pricePerMonthString} / month` : null,
        saving > 0 ? `Save ${saving}%` : null,
      ].filter(Boolean);
      return { amount: product.priceString, unit: '/ year', note: details.join(' · ') || null };
    }
    if (storeConfigured) {
      return { amount: pricesLoading ? 'Loading price…' : 'Unavailable', unit: '', note: null };
    }
    return {
      // The amount charged is always most prominent, including annual billing.
      amount: formatUsd(interval === 'annual' ? listAnnualTotal(plan) : listPrice(plan, interval)),
      unit: interval === 'annual' ? '/ year' : '/ month',
      note:
        interval === 'annual'
          ? `${formatUsd(listPrice(plan, interval))} / month · Save ${listAnnualSavings(plan)}%`
          : null,
    };
  };

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

  const purchaseControls = (
    <View style={{ paddingTop: 14, paddingBottom: 4 }}>
      <Text
        accessibilityLiveRegion="polite"
        style={{ color: colors.text, fontSize: font.size.lg, fontWeight: font.weight.bold, textAlign: 'center' }}
      >
        {selectedName} · {selectedPrice.amount}{selectedPrice.unit ? ` ${selectedPrice.unit}` : ''}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: font.size.sm, textAlign: 'center', marginTop: 4, marginBottom: 12 }}>
        {needsStorePrice
          ? pricesLoading
            ? 'Getting your App Store price…'
            : 'This plan is currently unavailable in the App Store.'
          : onSelected && cancelling
            ? 'Manage renewal in your App Store settings.'
            : trialEnd && !paidPlan
              ? 'Starts today and ends your free trial. Renews automatically.'
              : `Billed ${interval === 'annual' ? 'yearly' : 'monthly'}. Renews automatically. Cancel anytime.`}
      </Text>
      <Button
        label={needsStorePrice && !isCurrentPlan ? (pricesLoading ? 'Loading price…' : 'Retry App Store prices') : ctaLabel}
        onPress={needsStorePrice ? loadPrices : subscribe}
        loading={busy === 'buy'}
        disabled={purchaseDisabled}
      />
      <Pressable
        onPress={restore}
        disabled={busy !== null}
        accessibilityRole="button"
        accessibilityLabel="Restore purchases"
        accessibilityState={{ disabled: busy !== null, busy: busy === 'restore' }}
        style={{ alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 12, minHeight: 44, justifyContent: 'center' }}
      >
        {busy === 'restore' ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Text style={{ color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.semibold, textAlign: 'center' }}>
            Restore purchases
          </Text>
        )}
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <HeaderButton icon="close" label="Close" onPress={() => router.back()} />
        <H1 style={{ marginTop: 8 }}>Choose your protection</H1>
        <Text style={{ color: colors.textMuted, fontSize: font.size.md, marginTop: 6 }}>
          {subtitle}
        </Text>

        <View accessibilityRole="radiogroup" accessibilityLabel="Billing period" style={{ flexDirection: 'row', gap: 4, padding: 4, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, marginTop: 20 }}>
          {(['monthly', 'annual'] as const).map((value) => (
            <Pressable
              key={value}
              onPress={() => setInterval(value)}
              disabled={busy !== null}
              accessibilityRole="radio"
              accessibilityLabel={value === 'monthly' ? 'Monthly billing' : 'Annual billing'}
              accessibilityState={{ checked: value === interval, disabled: busy !== null }}
              style={{ flex: 1, minHeight: 44, paddingHorizontal: 8, paddingVertical: 11, justifyContent: 'center', borderRadius: radius.sm, backgroundColor: value === interval ? colors.card : 'transparent' }}
            >
              <Text style={{ color: value === interval ? colors.text : colors.textMuted, fontSize: font.size.md, fontWeight: font.weight.semibold, textAlign: 'center' }}>
                {value === 'monthly' ? 'Monthly' : 'Annual'}
              </Text>
            </Pressable>
          ))}
        </View>

        <View accessibilityRole="radiogroup" accessibilityLabel="Protection plan" style={{ gap: 10, marginTop: 16 }}>
          {PAID_PLANS.map((plan) => {
            const active = selected === plan.id;
            const price = priceOf(plan.id);
            const accountLabel = `${plan.maxAccounts === 1 ? '1' : `Up to ${plan.maxAccounts}`} Instagram ${plan.maxAccounts === 1 ? 'account' : 'accounts'}`;
            return (
              <Pressable
                key={plan.id}
                onPress={() => setSelected(plan.id)}
                disabled={busy !== null}
                accessibilityRole="radio"
                accessibilityState={{ checked: active, disabled: busy !== null }}
                accessibilityLabel={`${plan.name}. ${accountLabel}. ${price.amount} ${price.unit}${price.note ? `. ${price.note}` : ''}${paidPlan === plan.id ? '. Current plan' : ''}`}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  borderRadius: radius.lg, borderWidth: 2,
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.primarySoft : colors.card,
                  padding: 14, opacity: pressed ? 0.8 : 1,
                })}
              >
                <Ionicons name={active ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={active ? colors.primary : colors.textMuted} accessible={false} />
                <View style={{ flex: 1, gap: 8 }}>
                  <View style={{ flexDirection: stackPrices ? 'column' : 'row', alignItems: stackPrices ? 'flex-start' : 'center', gap: 8 }}>
                    <View style={{ flex: stackPrices ? undefined : 1 }}>
                      <Text style={{ color: colors.textMuted, fontSize: font.size.sm, fontWeight: font.weight.medium }}>
                        {plan.name}{paidPlan === plan.id ? ' · Current plan' : plan.popular ? ' · Popular' : ''}
                      </Text>
                      <Text style={{ color: colors.text, fontSize: font.size.lg, fontWeight: font.weight.bold, marginTop: 3 }}>
                        {accountLabel}
                      </Text>
                    </View>
                    <View style={{ maxWidth: stackPrices ? '100%' : '42%', alignItems: stackPrices ? 'flex-start' : 'flex-end' }}>
                      <Text style={{ color: colors.text, fontSize: font.size.xl, fontWeight: font.weight.bold, textAlign: stackPrices ? 'left' : 'right' }}>
                        {price.amount}
                      </Text>
                      {!!price.unit && <Text style={{ color: colors.textMuted, fontSize: font.size.sm }}>{price.unit}</Text>}
                    </View>
                  </View>
                  {price.note && <Text style={{ color: colors.primary, fontSize: font.size.sm }}>{price.note}</Text>}
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={{ marginTop: 22, gap: 10 }}>
          <Text accessibilityRole="header" style={{ color: colors.text, fontSize: font.size.lg, fontWeight: font.weight.semibold }}>
            Included in every plan
          </Text>
          {PAID_PLAN_COMMON_FEATURES.map((feature) => (
            <View key={feature} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <Ionicons name="checkmark" size={18} color={colors.primary} accessible={false} />
              <Text style={{ color: colors.text, fontSize: font.size.md, flex: 1 }}>{feature}</Text>
            </View>
          ))}
          <Text style={{ color: colors.textMuted, fontSize: font.size.sm }}>
            Plus and Studio also include a blocked users list and priority support.
          </Text>
        </View>

        {!storeConfigured && (
          <Text style={{ color: colors.textMuted, fontSize: font.size.sm, marginTop: 18 }}>
            US list prices shown. Purchases are simulated in this demo.
          </Text>
        )}
        <Text style={{ color: colors.textMuted, fontSize: font.size.sm, marginTop: 18 }}>
          Payment is charged to your Apple ID. Subscriptions renew automatically unless you cancel
          at least 24 hours before the end of the period. Manage or cancel in your App Store account settings.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, marginTop: 6 }}>
          <Pressable onPress={() => openLink(TERMS_URL)} accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.semibold }}>Terms of Use</Text>
          </Pressable>
          <Pressable onPress={() => openLink(PRIVACY_URL)} accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.semibold }}>Privacy Policy</Text>
          </Pressable>
        </View>
        {!stickyPurchase && purchaseControls}
      </ScrollView>
      {stickyPurchase && (
        <View style={{ paddingHorizontal: spacing.gutter, borderTopWidth: 0.5, borderTopColor: colors.border }}>
          {purchaseControls}
        </View>
      )}
    </SafeAreaView>
  );
}
