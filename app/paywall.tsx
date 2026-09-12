import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, Button, Segmented } from '../src/components/ui';
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
import { fullTimestamp } from '../src/lib/time';
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
  const { colors, font, radius, spacing } = useTheme();
  const router = useRouter();
  const { user, subscription, refreshSubscription, setDemoPlan } = useAuth();
  const { region, available, setRegionCode } = useRegion();

  const [interval, setInterval] = useState<BillingInterval>('monthly');
  const [selected, setSelected] = useState<PaidPlanId>('plus');
  const [method, setMethod] = useState<PaymentMethod>(region.methods[0]);
  const [loading, setLoading] = useState(false);

  const selectedName = getPlan(selected).name;
  const trialEnd =
    subscription.status === 'trialing' && subscription.trialEndsAt
      ? fullTimestamp(subscription.trialEndsAt).split(',')[0]
      : null;
  const isCurrentPlan = subscription.status === 'active' && subscription.plan === selected;
  const ctaLabel = isCurrentPlan
    ? 'Your current plan'
    : subscription.status === 'active'
      ? `Switch to ${selectedName}`
      : subscription.status === 'trialing'
        ? `Choose ${selectedName}`
        : `Upgrade to ${selectedName}`;

  const cycleRegion = () => {
    const idx = available.findIndex((r) => r.code === region.code);
    const next = available[(idx + 1) % available.length];
    setRegionCode(next.code);
    setMethod(next.methods[0]);
  };

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
      });
      if (result.status === 'cancelled') return;
      if (result.status === 'demo') setDemoPlan(selected);
      else await refreshSubscription();
      Alert.alert(
        'You’re all set 🎉',
        result.status === 'demo'
          ? `Demo mode: you're on ${selectedName}. Connect a real ${region.provider === 'safepay' ? 'Safepay' : 'Stripe'} backend to take live payments.`
          : trialEnd
            ? `You're on ${selectedName}. You won’t be charged until your free trial ends on ${trialEnd}.`
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
      <ScrollView contentContainerStyle={{ padding: spacing.gutter, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ paddingVertical: 4 }}>
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>

        <Text style={{ color: colors.text, fontSize: font.size.huge, fontWeight: font.weight.heavy, marginTop: 8 }}>
          Choose your plan
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: font.size.md, marginTop: 6, lineHeight: 21 }}>
          {trialEnd
            ? `Your free trial ends ${trialEnd}. Pick a plan now — you won’t be charged until then.`
            : subscription.status === 'free'
              ? 'Unlimited moderation, more accounts, and custom rules. Cancel anytime.'
              : 'Change your plan anytime.'}
        </Text>

        {/* Region indicator */}
        <Pressable
          onPress={cycleRegion}
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

                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginTop: 12 }}>
                  <Text style={{ color: colors.text, fontSize: font.size.huge, fontWeight: font.weight.heavy }}>
                    {formatPrice(region, perMonth)}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: font.size.md, marginBottom: 6 }}>/mo</Text>
                  <View style={{ flex: 1 }} />
                  {subscription.status === 'active' && subscription.plan === plan.id && (
                    <Badge label="Current plan" color={colors.success} bg={colors.successSoft} />
                  )}
                </View>

                {interval === 'annual' && (
                  <Text style={{ color: colors.primary, fontSize: font.size.xs, marginTop: 2 }}>
                    {formatPrice(region, annualTotal(region, plan.id))} billed yearly · 2 months free
                  </Text>
                )}

                <View style={{ marginTop: 14, gap: 8 }}>
                  {plan.features.map((f) => (
                    <View key={f} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="checkmark" size={16} color={colors.primary} />
                      <Text style={{ color: colors.text, fontSize: font.size.sm, flex: 1 }}>{f}</Text>
                    </View>
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Payment methods */}
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
