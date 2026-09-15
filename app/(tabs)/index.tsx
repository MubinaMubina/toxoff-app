import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlatformIcon } from '../../src/components/PlatformIcon';
import { RemovedCommentRow } from '../../src/components/RemovedCommentRow';
import { Skeleton, SkeletonRows } from '../../src/components/Skeleton';
import { Button, Card, LIST_ROW, RowIcon, RowSeparator, ScreenTitle, SectionLabel, Segmented } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { useModeration } from '../../src/context/ModerationContext';
import { getPlan } from '../../src/data/plans';
import { getProtectionSummary } from '../../src/lib/protection';
import { shortDate, timeAgo } from '../../src/lib/time';
import { useTheme } from '../../src/theme/ThemeContext';

type Period = 'today' | 'week' | 'month';
const PERIODS: { label: string; value: Period }[] = [
  { label: '24 hours', value: 'today' },
  { label: '7 days', value: 'week' },
  { label: '30 days', value: 'month' },
];

export default function Dashboard() {
  const { colors, font, spacing, radius } = useTheme();
  const router = useRouter();
  const { user, subscription } = useAuth();
  const {
    status, lastSyncedAt, reload, metrics, comments, accounts, togglePause,
    freeCommentsUsed, freeCommentAllowance,
  } = useModeration();
  const [period, setPeriod] = useState<Period>('today');
  const plan = getPlan(subscription.plan);
  const paid = subscription.paying;
  const outOfFreeChecks = !paid && freeCommentsUsed >= freeCommentAllowance;
  const summary = getProtectionSummary({ accounts, maxAccounts: plan.maxAccounts, outOfFreeChecks, status });
  const firstName = user?.name?.split(' ')[0] ?? 'Creator';
  const loading = status === 'loading';
  const activityUnavailable = status === 'offline' && !lastSyncedAt;
  const feed = comments.slice(0, 3);
  const tone = summary.tone === 'warning' ? colors.warning : colors.primary;
  const action = summary.action;
  const handleAction = () => {
    if (action === 'retry') reload();
    else router.push(action === 'upgrade' ? '/paywall' : '/connect-accounts');
  };
  const actionLabel = action === 'retry' ? 'Refresh status' : action === 'upgrade' ? 'See plans' : action === 'connect' ? 'Connect Instagram' : 'Manage accounts';
  const modeDescription = status === 'offline' ? 'Last available activity' : 'Comments handled';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.gutter, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}><ScreenTitle title="Home" subtitle={`Welcome back, ${firstName}.`} /></View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open settings"
            onPress={() => router.push('/(tabs)/settings')}
            style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
          >
            <Ionicons name="settings-outline" size={22} color={colors.primary} />
          </Pressable>
        </View>

        <Card style={{ marginTop: spacing.xl, backgroundColor: summary.tone === 'warning' ? colors.warningSoft : colors.primarySoft, borderWidth: 0, padding: 20 }}>
          <Ionicons name={summary.kind === 'active' ? 'shield-checkmark-outline' : summary.kind === 'paused' ? 'pause-circle-outline' : summary.tone === 'warning' ? 'alert-circle-outline' : 'shield-outline'} size={36} color={tone} />
          <Text accessibilityRole="header" style={{ color: colors.text, fontSize: font.size.xxl, fontWeight: font.weight.bold, marginTop: 14 }}>{summary.title}</Text>
          <Text style={{ color: colors.textMuted, fontSize: font.size.md, lineHeight: 22, marginTop: 8 }}>{summary.description}</Text>
          {loading ? <Skeleton height={12} width="60%" style={{ marginTop: 14 }} /> : lastSyncedAt && (
            <Text style={{ color: colors.textMuted, fontSize: font.size.sm, marginTop: 12 }}>Status updated {timeAgo(lastSyncedAt)}</Text>
          )}
          {action && <Button label={actionLabel} onPress={handleAction} size="md" style={{ marginTop: 16 }} />}
          {summary.kind === 'quota' && (
            <Button label="View invite rewards" variant="secondary" onPress={() => router.push('/invite')} size="sm" style={{ marginTop: 10 }} />
          )}
        </Card>

        {!loading && !paid && (
          <Card style={{ marginTop: spacing.md, padding: 16 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Text style={{ color: colors.textMuted, fontSize: font.size.sm, flexShrink: 1 }}>
                {subscription.status === 'trialing' && subscription.trialEndsAt ? `${plan.name} trial · ends ${shortDate(subscription.trialEndsAt)}` : 'Free plan'}
              </Text>
              <Pressable accessibilityRole="button" onPress={() => router.push('/paywall')} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
                <Text style={{ color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.semibold }}>See plans</Text>
              </Pressable>
            </View>
            {!activityUnavailable && <View accessibilityRole="progressbar" accessibilityLabel="Free comment checks used" accessibilityValue={{ min: 0, max: freeCommentAllowance, now: Math.min(freeCommentsUsed, freeCommentAllowance) }} style={{ height: 5, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
              <View style={{ width: `${Math.min(100, freeCommentsUsed / Math.max(1, freeCommentAllowance) * 100)}%`, height: '100%', backgroundColor: outOfFreeChecks ? colors.warning : colors.primary }} />
            </View>}
            <Text style={{ color: colors.text, fontSize: font.size.md, fontWeight: font.weight.semibold, marginTop: 10 }}>{activityUnavailable ? 'Usage unavailable' : `${freeCommentsUsed} of ${freeCommentAllowance} free checks used`}</Text>
          </Card>
        )}

        {accounts.length > 0 && (
          <View style={{ marginTop: spacing.xl }}>
            <SectionLabel action={{ label: 'Manage', onPress: () => router.push('/connect-accounts') }}>Your accounts</SectionLabel>
            <Card padded={false}>
              {accounts.map((account, index) => {
                const unsupported = account.platform !== 'instagram';
                const overLimit = index >= plan.maxAccounts;
                const accountStatus = status !== 'ready' ? 'Status unavailable' : unsupported ? 'Coming soon' : !account.connected ? 'Reconnect needed' : overLimit ? `Outside your ${plan.name} limit` : outOfFreeChecks ? 'Free checks used up' : account.paused ? 'Paused' : 'Protection on';
                const healthy = status === 'ready' && !unsupported && account.connected && !overLimit && !outOfFreeChecks && !account.paused;
                return (
                  <React.Fragment key={account.id}>
                    {index > 0 && <RowSeparator />}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: LIST_ROW.gap, paddingHorizontal: LIST_ROW.inset, paddingVertical: 16 }}>
                      <RowIcon><PlatformIcon platform={account.platform} size={17} withBackground /></RowIcon>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: font.size.md, fontWeight: font.weight.semibold }}>{account.handle}</Text>
                        <Text style={{ color: healthy ? colors.primary : colors.textMuted, fontSize: font.size.sm, marginTop: 4 }}>{accountStatus}</Text>
                      </View>
                      {account.connected && !unsupported && !overLimit && !outOfFreeChecks ? (
                        <Switch
                          accessibilityLabel={`Moderation for ${account.handle}`}
                          accessibilityHint="Pause or resume checking new comments."
                          value={!account.paused}
                          disabled={status !== 'ready'}
                          onValueChange={() => { Haptics.selectionAsync().catch(() => {}); togglePause(account.id); }}
                          trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF"
                        />
                      ) : (
                        <Pressable accessibilityRole="button" accessibilityLabel={`Manage ${account.handle}`} onPress={() => router.push('/connect-accounts')} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                        </Pressable>
                      )}
                    </View>
                  </React.Fragment>
                );
              })}
            </Card>
          </View>
        )}

        <View style={{ marginTop: spacing.xl }}>
          <SectionLabel>{modeDescription}</SectionLabel>
          <Segmented options={PERIODS} value={period} onChange={setPeriod} />
          <View style={{ paddingVertical: 20 }}>
            {loading ? <Skeleton width="25%" height={44} /> : (
              <Text accessibilityLabel={activityUnavailable ? 'Activity unavailable' : undefined} style={{ color: colors.text, fontSize: 44, fontWeight: font.weight.bold, fontVariant: ['tabular-nums'] }}>{activityUnavailable ? '—' : metrics[period].toLocaleString()}</Text>
            )}
            <Text style={{ color: colors.textMuted, fontSize: font.size.md, lineHeight: 22, marginTop: 4 }}>
              {activityUnavailable ? 'Connect to load your activity.' : `${metrics[period] === 1 ? 'Comment hidden or deleted' : 'Comments hidden or deleted'} · last ${period === 'today' ? '24 hours' : period === 'week' ? '7 days' : '30 days'}`}
            </Text>
          </View>
        </View>

        <View style={{ marginTop: spacing.sm }}>
          <SectionLabel action={{ label: 'Open log', onPress: () => router.push('/(tabs)/log') }}>Recent activity</SectionLabel>
          <Text style={{ color: colors.textMuted, fontSize: font.size.sm, lineHeight: 20, marginBottom: 12 }}>The words stay out of sight here. Review a comment only when you choose.</Text>
          {loading ? <SkeletonRows count={2} /> : feed.length === 0 ? (
            <View style={{ borderTopWidth: 0.5, borderColor: colors.border, paddingVertical: 20 }}>
              <Text style={{ color: colors.text, fontSize: font.size.md, fontWeight: font.weight.semibold }}>{activityUnavailable ? 'Activity unavailable' : 'No recent activity'}</Text>
              <Text style={{ color: colors.textMuted, fontSize: font.size.sm, lineHeight: 20, marginTop: 6 }}>
                {summary.kind === 'unconnected' ? 'Connect Instagram to start checking comments.' : status === 'offline' ? 'Refresh your connection to see the latest activity.' : 'Comments handled by toxoff will appear here.'}
              </Text>
            </View>
          ) : (
            <Card padded={false}>
              {feed.map((comment, index) => (
                <React.Fragment key={comment.id}>
                  {index > 0 && <RowSeparator inset={16} />}
                  <RemovedCommentRow comment={comment} concealed />
                </React.Fragment>
              ))}
            </Card>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
