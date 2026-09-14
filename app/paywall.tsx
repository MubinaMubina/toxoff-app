import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, Button, H1, HeaderButton, Segmented } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { getPlan, PAID_PLANS } from '../src/data/plans';
import { formatUsd, listAnnualTotal, listPrice } from '../src/data/pricing';
import {
  loadStorePackages,
  manageSubscription,
  productId,
  purchasePlan,
  restorePurchases,
} from '../src/lib/purchases';
import { openLink, PRIVACY_URL, TERMS_URL } from '../src/lib/links';
import { shortDate } from '../src/lib/time';
import { useTheme } from '../src/theme/ThemeContext';
import { BillingInterval, PaidPlanId } from '../src/types';

export default function Paywall() {
  const { colors, font, radius, spacing } = useTheme();
  const router = useRouter();
  const { user, subscription, refreshSubscription, setDemoBilling } = useAuth();
  const billing = subscription.billing;

  // Opens on the plan the user already has, if any.
  const [interval, setInterval] = useState<BillingInterval>(billing?.interval ?? 'monthly');
  const [selected, setSelected] = useState<PaidPlanId>(billing?.plan ?? 'plus');
  const [packages, setPackages] = useState<Map<string, PurchasesPackage>>(new Map());
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);

  // The App Store's prices, in the user's own currency. Until they load (or in Expo Go), list prices.
  useEffect(() => {
    loadStorePackages()
      .then(setPackages)
      .catch((e) => console.warn('Could not load App Store prices', e));
  }, []);

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
      return interval === 'monthly'
        ? { amount: product.priceString, unit: '/mo', note: null }
        : {
            amount: product.priceString,
            unit: '/yr',
            note: product.pricePerMonthString
              ? `${product.pricePerMonthString}/mo · 2 months free`
              : '2 months free',
          };
    }
    return {
      amount: formatUsd(listPrice(plan, interval)),
      unit: '/mo',
      note: interval === 'annual' ? `${formatUsd(listAnnualTotal(plan))} billed yearly · 2 months free` : null,
    };
  };

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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        <HeaderButton icon="close" label="Close" onPress={() => router.back()} />

        <H1 style={{ marginTop: 8 }}>Choose your plan</H1>
        <Text style={{ color: colors.textMuted, fontSize: font.size.md, marginTop: 6, lineHeight: 21 }}>
          {subtitle}
        </Text>

        {/* Billing interval */}
        <View style={{ marginTop: 18 }}>
          <Segmented<BillingInterval>
            value={interval}
            onChange={setInterval}
            options={[
              { label: 'Monthly', value: 'monthly' },
              { label: 'Annual · save 17%', value: 'annual' },
            ]}
          />
        </View>

        {/* Plans */}
        <View style={{ gap: 14, marginTop: 18 }}>
          {PAID_PLANS.map((plan) => {
            const active = selected === plan.id;
            const price = priceOf(plan.id);
            return (
              <Pressable
                key={plan.id}
                onPress={() => setSelected(plan.id)}
                style={{
                  borderRadius: radius.lg,
                  borderWidth: 2,
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.primarySoft : colors.card,
                  padding: 18,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: colors.text, fontSize: font.size.xl, fontWeight: font.weight.bold }}>
                      {plan.name}
                    </Text>
                    {plan.popular && <Badge label="Most popular" color={colors.onPrimary} bg={colors.primary} />}
                  </View>
                  <Ionicons
                    name={active ? 'checkmark-circle' : 'ellipse-outline'}
                    size={24}
                    color={active ? colors.primary : colors.textFaint}
                  />
                </View>

                <Text style={{ color: colors.textMuted, fontSize: font.size.sm, marginTop: 2 }}>
                  {plan.tagline}
                </Text>

                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 12 }}>
                  <Text style={{ color: colors.text, fontSize: font.size.huge, fontWeight: font.weight.heavy }}>
                    {price.amount}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: font.size.md }}>{price.unit}</Text>
                  <View style={{ flex: 1 }} />
                  {paidPlan === plan.id && (
                    // Centred on the price (Badge alone would sit at the top of this baseline row).
                    <View style={{ alignSelf: 'center' }}>
                      <Badge label="Current plan" color={colors.success} bg={colors.successSoft} />
                    </View>
                  )}
                </View>

                {price.note && (
                  <Text style={{ color: colors.primary, fontSize: font.size.xs, marginTop: 2 }}>{price.note}</Text>
                )}

                <View style={{ marginTop: 14, gap: 8 }}>
                  {plan.features.map((f) => (
                    <View key={f} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                      {/* On the first line, so a feature that wraps keeps its check beside its start. */}
                      <Ionicons name="checkmark" size={16} color={colors.primary} style={{ marginTop: 1 }} />
                      <Text style={{ color: colors.text, fontSize: font.size.sm, flex: 1 }}>{f}</Text>
                    </View>
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* The App Store's required subscription terms. */}
        <Text style={{ color: colors.textMuted, fontSize: font.size.xs, lineHeight: 17, marginTop: 20 }}>
          Paid with the payment method on your Apple ID. Subscriptions renew automatically unless you cancel
          at least 24 hours before the end of the period. Manage or cancel anytime in your App Store
          account settings.
        </Text>
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 10 }}>
          <Pressable onPress={() => openLink(TERMS_URL)} accessibilityRole="link" hitSlop={10}>
            <Text style={{ color: colors.primary, fontSize: font.size.xs, fontWeight: font.weight.semibold }}>
              Terms of Use
            </Text>
          </Pressable>
          <Pressable onPress={() => openLink(PRIVACY_URL)} accessibilityRole="link" hitSlop={10}>
            <Text style={{ color: colors.primary, fontSize: font.size.xs, fontWeight: font.weight.semibold }}>
              Privacy Policy
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: spacing.gutter, paddingBottom: 16, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: colors.border }}>
        <Button
          label={ctaLabel}
          onPress={subscribe}
          loading={busy === 'buy'}
          disabled={isCurrentPlan || busy === 'restore'}
        />
        <Pressable
          onPress={restore}
          disabled={busy !== null}
          accessibilityRole="button"
          hitSlop={{ top: 10, bottom: 10, left: 16, right: 16 }}
          style={{ alignSelf: 'center', marginTop: 12, minHeight: 20, justifyContent: 'center' }}
        >
          {busy === 'restore' ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={{ color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.semibold }}>
              Restore purchases
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
