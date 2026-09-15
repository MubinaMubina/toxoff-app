import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { FREE_COMMENT_ALLOWANCE, TRIAL_DAYS } from '../../src/data/plans';
import { fullTimestamp } from '../../src/lib/time';
import { useTheme } from '../../src/theme/ThemeContext';

export default function TrialStarted() {
  const { colors, font, spacing } = useTheme();
  const router = useRouter();
  const { subscription } = useAuth();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1, paddingHorizontal: spacing.gutter, alignItems: 'center', justifyContent: 'center' }}>
        <View
          style={{
            width: 110,
            height: 110,
            borderRadius: 55,
            backgroundColor: colors.successSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="checkmark-circle" size={68} color={colors.success} />
        </View>

        <Text
          style={{
            color: colors.text,
            fontSize: font.size.huge,
            fontWeight: font.weight.heavy,
            textAlign: 'center',
            marginTop: 28,
          }}
        >
          7-day free trial{'\n'}started 🎉
        </Text>

        <Text
          style={{
            color: colors.textMuted,
            fontSize: font.size.lg,
            textAlign: 'center',
            marginTop: 14,
            lineHeight: 26,
            maxWidth: 320,
          }}
        >
          You have {TRIAL_DAYS} days of Plus and {FREE_COMMENT_ALLOWANCE} free comment checks. Any
          checks you don't use carry over to the Free plan — no card needed, no surprise charges.
        </Text>

        {subscription.trialEndsAt && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              marginTop: 24,
              backgroundColor: colors.primarySoft,
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 999,
            }}
          >
            <Ionicons name="calendar-outline" size={16} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: font.weight.semibold, fontSize: font.size.sm }}>
              Trial ends {fullTimestamp(subscription.trialEndsAt).split(',')[0]}
            </Text>
          </View>
        )}
      </View>

      {/* A few questions set the filters up (app/onboarding.tsx); it ends by connecting an account. */}
      <View style={{ paddingHorizontal: spacing.gutter, paddingBottom: 24, gap: 12 }}>
        <Button label="Set up toxoff" icon="sparkles-outline" onPress={() => router.replace('/onboarding')} />
        <Text style={{ color: colors.textFaint, fontSize: font.size.xs, textAlign: 'center' }}>
          A minute of questions, so the filter fits you.
        </Text>
      </View>
    </SafeAreaView>
  );
}
