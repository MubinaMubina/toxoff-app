import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlatformIcon } from '../../src/components/PlatformIcon';
import { RemovedCommentRow } from '../../src/components/RemovedCommentRow';
import { Card, EmptyState, LIST_ROW, RowIcon, RowSeparator, SectionLabel } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { useModeration } from '../../src/context/ModerationContext';
import { FREE_COMMENT_ALLOWANCE, getPlan } from '../../src/data/plans';
import { registerForPushNotifications } from '../../src/lib/notifications';
import { fullTimestamp } from '../../src/lib/time';
import { palette } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeContext';

function MetricCard({ value, label, accent }: { value: number; label: string; accent: string }) {
  const { colors, font, radius } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.card,
        borderRadius: radius.lg,
        borderWidth: 0.5,
        borderColor: colors.border,
        padding: 14,
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accent, marginBottom: 10 }} />
      <Text style={{ color: colors.text, fontSize: font.size.xxl, fontWeight: font.weight.heavy }}>
        {value.toLocaleString()}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: font.size.xs, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function FreeChecksCard({
  title,
  used,
  onUpgrade,
}: {
  title: string;
  used: number;
  onUpgrade: () => void;
}) {
  const { colors, font, radius, spacing } = useTheme();
  const limit = FREE_COMMENT_ALLOWANCE;
  const reached = used >= limit;
  return (
    <Pressable onPress={onUpgrade} style={{ marginTop: spacing.xl }}>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: colors.text, fontSize: font.size.md, fontWeight: font.weight.semibold }}>
            {title}
          </Text>
          <Text style={{ color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.semibold }}>
            Upgrade
          </Text>
        </View>
        <View
          style={{
            height: 8,
            borderRadius: radius.pill,
            backgroundColor: colors.surfaceAlt,
            marginTop: 12,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${Math.min(100, (used / limit) * 100)}%`,
              height: '100%',
              backgroundColor: reached ? colors.danger : colors.primary,
            }}
          />
        </View>
        <Text
          style={{
            color: reached ? colors.danger : colors.textMuted,
            fontSize: font.size.sm,
            marginTop: 8,
            lineHeight: 19,
          }}
        >
          {reached
            ? `You've used all ${limit} free comment checks, so new comments aren't being checked. Subscribe to keep moderating.`
            : `${used} of ${limit} free comment checks used`}
        </Text>
      </Card>
    </Pressable>
  );
}

export default function Dashboard() {
  const { colors, font, spacing } = useTheme();
  const router = useRouter();
  const { user, subscription } = useAuth();
  const {
    metrics,
    comments,
    accounts,
    togglePause,
    notificationsEnabled,
    savePushToken,
    freeCommentsUsed,
  } = useModeration();
  const plan = getPlan(subscription.plan);
  // Includes a plan chosen during the trial: from then on comments aren't counted.
  const paid = subscription.paying;
  const outOfFreeChecks = !paid && freeCommentsUsed >= FREE_COMMENT_ALLOWANCE;

  // Register for push alerts once if the user has them enabled.
  useEffect(() => {
    if (!notificationsEnabled) return;
    registerForPushNotifications()
      .then((token) => token && savePushToken(token))
      .catch(() => {});
  }, [notificationsEnabled, savePushToken]);

  const feed = comments.slice(0, 6);
  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.gutter, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={{ color: colors.textMuted, fontSize: font.size.md }}>Welcome back,</Text>
            {/* Same size as the other tabs' titles (ScreenTitle). */}
            <Text style={{ color: colors.text, fontSize: font.size.huge, fontWeight: font.weight.heavy }}>
              {firstName} 👋
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/(tabs)/settings')}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: colors.primarySoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: colors.primary, fontWeight: font.weight.bold, fontSize: font.size.lg }}>
              {firstName[0]?.toUpperCase()}
            </Text>
          </Pressable>
        </View>

        {!paid && (
          <FreeChecksCard
            title={
              subscription.status === 'trialing' && subscription.trialEndsAt
                ? `${plan.name} trial · ends ${fullTimestamp(subscription.trialEndsAt).split(',')[0]}`
                : 'Free plan'
            }
            used={freeCommentsUsed}
            onUpgrade={() => router.push('/paywall')}
          />
        )}

        {/* Metrics */}
        <View style={{ marginTop: spacing.xl }}>
          <SectionLabel>Comments removed</SectionLabel>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <MetricCard value={metrics.today} label="Today" accent={palette.purple} />
            <MetricCard value={metrics.week} label="This week" accent={palette.blue} />
            <MetricCard value={metrics.month} label="This month" accent={palette.green} />
          </View>
        </View>

        {/* Accounts pause/resume */}
        <View style={{ marginTop: spacing.xl }}>
          <SectionLabel action={{ label: 'Manage', onPress: () => router.push('/connect-accounts') }}>
            Moderation
          </SectionLabel>
          {accounts.length === 0 ? (
            <Card>
              <Pressable
                onPress={() => router.push('/connect-accounts')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
              >
                <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
                <Text style={{ color: colors.text, fontSize: font.size.md, fontWeight: font.weight.medium, flex: 1 }}>
                  Connect an account to start moderating
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
              </Pressable>
            </Card>
          ) : (
            <Card padded={false}>
              {accounts.map((acc, i) => {
                // After a downgrade, only the oldest accounts within the plan's limit are moderated.
                const overLimit = i >= plan.maxAccounts;
                const needsUpgrade = overLimit || outOfFreeChecks;
                const status = !acc.connected
                  ? 'Reconnect needed'
                  : overLimit
                    ? `Not moderated on ${plan.name}`
                    : outOfFreeChecks
                      ? 'Not moderating · free checks used up'
                      : acc.paused
                        ? 'Paused'
                        : 'Active · moderating';
                const healthy = acc.connected && !needsUpgrade && !acc.paused;
                return (
                  <React.Fragment key={acc.id}>
                    {i > 0 && <RowSeparator />}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: LIST_ROW.gap,
                        paddingHorizontal: LIST_ROW.inset,
                        paddingVertical: 14,
                      }}
                    >
                      <RowIcon>
                        <PlatformIcon platform={acc.platform} size={17} withBackground />
                      </RowIcon>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: font.size.md, fontWeight: font.weight.medium }}>
                          {acc.handle}
                        </Text>
                        <Text
                          style={{
                            color: healthy ? colors.success : colors.warning,
                            fontSize: font.size.xs,
                            marginTop: 1,
                            fontWeight: font.weight.medium,
                          }}
                        >
                          {status}
                        </Text>
                      </View>
                      {!acc.connected || needsUpgrade ? (
                        <Pressable
                          onPress={() => router.push(acc.connected ? '/paywall' : '/connect-accounts')}
                          hitSlop={8}
                        >
                          <Text style={{ color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.semibold }}>
                            {acc.connected ? 'Upgrade' : 'Fix'}
                          </Text>
                        </Pressable>
                      ) : (
                        <Switch
                          value={!acc.paused}
                          onValueChange={() => {
                            Haptics.selectionAsync().catch(() => {});
                            togglePause(acc.id);
                          }}
                          trackColor={{ false: colors.border, true: colors.primary }}
                          thumbColor="#fff"
                        />
                      )}
                    </View>
                  </React.Fragment>
                );
              })}
            </Card>
          )}
        </View>

        {/* Live feed */}
        <View style={{ marginTop: spacing.xl }}>
          <SectionLabel
            action={feed.length > 0 ? { label: 'See all', onPress: () => router.push('/(tabs)/log') } : undefined}
          >
            Recently removed
          </SectionLabel>

          {feed.length === 0 ? (
            <Card>
              <EmptyState
                icon="shield-checkmark-outline"
                title="All clear"
                subtitle="No toxic comments removed yet. We'll show them here the moment we catch one."
              />
            </Card>
          ) : (
            <Card padded={false}>
              {feed.map((c, i) => (
                <React.Fragment key={c.id}>
                  {i > 0 && <RowSeparator />}
                  <RemovedCommentRow comment={c} />
                </React.Fragment>
              ))}
            </Card>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
