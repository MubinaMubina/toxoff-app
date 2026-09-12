import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, Button, H1, HeaderButton, Segmented } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { useRegion } from '../src/context/RegionContext';
import { getPlan, PAID_PLANS } from '../src/data/plans';
import {
  annualTotal,
  formatPrice,
  METHOD_LABEL,
  priceFor,
} from '../src/data/pricing';
import { startSubscription } from '../src/lib/billing';
import { shortDate } from '../src/lib/time';
import { useTheme } from '../src/theme/ThemeContext';
import { BillingInterval, PaidPlanId, PaymentMethod } from '../src/types';

const METHOD_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  card: 'card-outline',
  apple_pay: 'logo-apple',
  google_pay: 'logo-google',
  jazzcash: 'phone-portrait-outline',
  easypaisa: 'wallet-outline',
  bank: 'business-outline',
};

export default function Paywall() {
  const { colors, font, radius, spacing, isDark } = useTheme();
  const router = useRouter();
  const { user, subscription, refreshSubscription, setDemoBilling } = useAuth();
  const { region, chooseRegion } = useRegion();
  const billing = subscription.billing;

  // Opens on the plan the user already has, if any.
  const [interval, setInterval] = useState<BillingInterval>(billing?.interval ?? 'monthly');
  const [selected, setSelected] = useState<PaidPlanId>(billing?.plan ?? 'plus');
  const [method, setMethod] = useState<PaymentMethod>(region.methods[0]);
  const [loading, setLoading] = useState(false);

  const selectedName = getPlan(selected).name;
  const trialEnd =
    subscription.status === 'trialing' && subscription.trialEndsAt
      ? shortDate(subscription.trialEndsAt)
      : null;
  const scheduled = billing?.status === 'scheduled';
  const cancelling = billing?.cancelAtPeriodEnd ?? false;
  // The plan the user pays for (or has chosen for after the trial), if any.
  const paidPlan = billing?.plan ?? (subscription.status === 'active' ? subscription.plan : null);
  const onSelected = billing
    ? billing.plan === selected && billing.interval === interval
    : paidPlan === selected;
  const isCurrentPlan = onSelected && !cancelling;
  const ctaLabel = isCurrentPlan
    ? scheduled
      ? 'Starts when your trial ends'
      : 'Your current plan'
    : onSelected
      ? `Keep ${selectedName}` // cancelling: this takes it back
      : paidPlan === selected
        ? `Switch to ${interval} billing`
        : paidPlan
          ? `Switch to ${selectedName}`
          : subscription.status === 'trialing'
            ? `Choose ${selectedName}`
            : `Upgrade to ${selectedName}`;

  const subtitle =
    scheduled && trialEnd
      ? `${getPlan(billing!.plan).name} starts ${trialEnd}, when your free trial ends. You won’t be charged before then.`
      : trialEnd
        ? `Your free trial ends ${trialEnd}. Pick a plan now — you won’t be charged until then.`
        : cancelling && billing?.periodEnd
          ? `Your ${getPlan(billing.plan).name} plan ends ${shortDate(billing.periodEnd)}. Choose a plan to keep going.`
          : subscription.status === 'free'
            ? 'Unlimited moderation, more accounts, and custom rules. Cancel anytime.'
            : 'Change your plan anytime.';

  // A new region can have different payment methods, so start from its first one.
  const changeRegion = () => chooseRegion((next) => setMethod(next.methods[0]));

  const subscribe = async () => {
    if (!user) {
      router.push('/(auth)/signup');
      return;
    }
    setLoading(true);
    try {
      const result = await startSubscription({
        planId: selected,
        interval,
        region,
        method,
        email: user.email,
        dark: isDark,
      });
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
        });
      } else {
        await refreshSubscription();
      }
      Alert.alert(
        result.status === 'changed' ? 'Plan updated' : 'You’re all set 🎉',
        result.status === 'demo'
          ? `Demo mode: you're on ${selectedName}. Connect a real ${region.provider === 'safepay' ? 'Safepay' : 'Stripe'} backend to take live payments.`
          : result.status === 'changed'
            ? onSelected
              ? `${selectedName} will keep renewing.`
              : scheduled && trialEnd
                ? `${selectedName} starts ${trialEnd}, when your free trial ends, billed ${interval === 'annual' ? 'yearly' : 'monthly'}.`
                : `You're now on ${selectedName}, billed ${interval === 'annual' ? 'yearly' : 'monthly'}.`
            : result.startsLater && trialEnd
              ? `${selectedName} starts ${trialEnd}, when your free trial ends. You won’t be charged before then.`
              : `You're on ${selectedName}.`
      );
      router.back();
    } catch (e: any) {
      Alert.alert('Payment error', e?.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
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

        {/* Region indicator */}
        <Pressable
          onPress={changeRegion}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            alignSelf: 'flex-start',
            marginTop: 14,
            backgroundColor: colors.surfaceAlt,
            paddingHorizontal: 12,
            paddingVertical: 7,
            borderRadius: radius.pill,
          }}
        >
          <Ionicons name="location-outline" size={14} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, fontSize: font.size.sm }}>
            {region.country} · {region.currency}
          </Text>
          <Text style={{ color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.semibold }}>
            Change
          </Text>
        </Pressable>

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
            const perMonth = priceFor(region, plan.id, interval);
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
                    {formatPrice(region, perMonth)}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: font.size.md }}>/mo</Text>
                  <View style={{ flex: 1 }} />
                  {paidPlan === plan.id && (
                    // Centred on the price (Badge alone would sit at the top of this baseline row).
                    <View style={{ alignSelf: 'center' }}>
                      <Badge
                        label={scheduled && billing?.periodEnd ? `Starts ${shortDate(billing.periodEnd)}` : 'Current plan'}
                        color={colors.success}
                        bg={colors.successSoft}
                      />
                    </View>
                  )}
                </View>

                {interval === 'annual' && (
                  <Text style={{ color: colors.primary, fontSize: font.size.xs, marginTop: 2 }}>
                    {formatPrice(region, annualTotal(region, plan.id))} billed yearly · 2 months free
                  </Text>
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

        {/* Payment methods. Stripe's payment sheet offers its own (card, and Apple Pay or Google Pay
            where set up), so the choice here is only for Safepay's JazzCash and Easypaisa. */}
        {region.provider === 'safepay' && (
          <>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: font.size.xs,
                fontWeight: font.weight.semibold,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                marginTop: 24,
                marginBottom: 10,
              }}
            >
              Pay with
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {region.methods.map((m) => {
                const active = method === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setMethod(m)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 7,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderRadius: radius.md,
                      borderWidth: 1.5,
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.primarySoft : colors.card,
                    }}
                  >
                    <Ionicons name={METHOD_ICON[m]} size={17} color={active ? colors.primary : colors.textMuted} />
                    <Text
                      style={{
                        color: active ? colors.primary : colors.text,
                        fontSize: font.size.sm,
                        fontWeight: font.weight.medium,
                      }}
                    >
                      {METHOD_LABEL[m]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      <View style={{ paddingHorizontal: spacing.gutter, paddingBottom: 16, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: colors.border }}>
        <Button label={ctaLabel} onPress={subscribe} loading={loading} disabled={isCurrentPlan} />
        <Text style={{ color: colors.textFaint, fontSize: font.size.xs, textAlign: 'center', marginTop: 10 }}>
          Powered by {region.provider === 'safepay' ? 'Safepay' : 'Stripe'} · Secure payments
        </Text>
      </View>
    </SafeAreaView>
  );
}
