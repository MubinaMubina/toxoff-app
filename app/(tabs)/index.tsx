import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Switch, View } from 'react-native';
import { Text } from '../../src/components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AdSlot } from '../../src/components/AdSlot';
import { PlatformIcon } from '../../src/components/PlatformIcon';
import { LogoMark, Wordmark } from '../../src/components/Logo';
import { RemovedCommentRow } from '../../src/components/RemovedCommentRow';
import { Skeleton, SkeletonRows } from '../../src/components/Skeleton';
import { Badge, Button, Card, LIST_ROW, RowIcon, RowSeparator, SectionLabel, Segmented } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { useModeration } from '../../src/context/ModerationContext';
import { AD_REWARD_CHECKS, AD_REWARDS_PER_DAY, ADS_ENABLED, getPlan } from '../../src/data/plans';
import { useRewardedAd } from '../../src/lib/ads';
import { getProtectionSummary } from '../../src/lib/protection';
import { shortDate, timeAgo } from '../../src/lib/time';
import { useTheme } from '../../src/theme/ThemeContext';
import { getSemanticColors } from '../../src/theme/colors';

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
    freeChecks, refreshFreeChecks,
  } = useModeration();
  const [period, setPeriod] = useState<Period>('today');
  const plan = getPlan(subscription.plan);
  const paid = subscription.paying;
  const outOfFreeChecks = !paid && freeChecks.left <= 0;
  const rewarded = useRewardedAd(user?.id ?? null);

  // Watching a rewarded ad: Google confirms the view to the backend, which adds the checks; the
  // meter updates live when they land (and is re-read as a fallback).
  const watchAd = async () => {
    let outcome: Awaited<ReturnType<typeof rewarded.watch>>;
    try {
      outcome = await rewarded.watch();
    } catch (e) {
      console.warn('Rewarded ad failed', e);
      Alert.alert('No ad available right now', 'Please try again in a little while.');
      return;
    }
    if (outcome === 'demo') {
      Alert.alert('Ads run in the App Store build', `There, watching a short ad adds ${AD_REWARD_CHECKS} comment checks, up to ${AD_REWARDS_PER_DAY} ads a day.`);
    } else if (outcome === 'unavailable') {
      Alert.alert('No ad available right now', 'Please try again in a little while.');
    } else if (outcome === 'rewarded') {
      Alert.alert('Thanks for watching', `${AD_REWARD_CHECKS} more checks are on their way. They show here in a moment.`);
      setTimeout(() => refreshFreeChecks().catch(() => {}), 4000);
    }
  };
  const monthLeft = Math.max(0, freeChecks.allowance - freeChecks.used);
  const summary = getProtectionSummary({ accounts, maxAccounts: plan.maxAccounts, outOfFreeChecks, adsEnabled: ADS_ENABLED, status });
  const firstName = user?.name?.split(' ')[0] ?? 'Creator';
  const loading = status === 'loading';
  const activityUnavailable = status === 'offline' && !lastSyncedAt;
  const feed = comments.slice(0, 3);
  const protectionColors = getSemanticColors(colors, summary.tone);
  const usageColors = getSemanticColors(colors, outOfFreeChecks || activityUnavailable ? 'warning' : 'info');
  const protectionIcon = summary.kind === 'active'
    ? 'shield-checkmark-outline'
    : summary.kind === 'paused'
      ? 'pause-circle-outline'
      : summary.kind === 'loading'
        ? 'time-outline'
        : summary.kind === 'offline'
          ? 'cloud-offline-outline'
          : summary.kind === 'unconnected'
            ? 'information-circle-outline'
            : 'alert-circle-outline';
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
          <View style={{ flex: 1, gap: 6 }}>
            <Wordmark size={32} />
            <Text style={{ color: colors.textMuted, fontSize: font.size.sm }}>Welcome back, {firstName}.</Text>
          </View>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <LogoMark size={44} />
          </View>
        </View>

        <Card style={{ marginTop: spacing.xl, backgroundColor: protectionColors.background, borderColor: protectionColors.border, padding: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name={protectionIcon} size={20} color={protectionColors.text} accessible={false} />
            <Text style={{ color: protectionColors.text, fontSize: font.size.sm, fontWeight: font.weight.semibold, flexShrink: 1 }}>
              {summary.kind === 'active' ? `${summary.activeCount} ${summary.activeCount === 1 ? 'account' : 'accounts'} protected` : 'Your protection'}
            </Text>
          </View>
          <Text accessibilityRole="header" style={{ color: colors.text, fontSize: summary.kind === 'active' ? 32 : font.size.xxl, fontWeight: font.weight.semibold, letterSpacing: -1.3, marginTop: 14 }}>
            {summary.kind === 'active' ? <>Your peace.{'\n'}<Text style={{ fontWeight: font.weight.heavy }}>Protected.</Text></> : summary.title}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: font.size.md, lineHeight: 24, marginTop: 10 }}>{summary.description}</Text>
          {loading ? <Skeleton height={12} width="60%" style={{ marginTop: 14 }} /> : lastSyncedAt && (
            <Text style={{ color: colors.textMuted, fontSize: font.size.sm, marginTop: 12 }}>Status updated {timeAgo(lastSyncedAt)}</Text>
          )}
          {action && <Button label={actionLabel} onPress={handleAction} size="md" style={{ marginTop: 16 }} />}
          {summary.kind === 'quota' && (
            <Button label="View invite rewards" variant="secondary" onPress={() => router.push('/invite')} size="sm" style={{ marginTop: 10 }} />
          )}
        </Card>

        {!loading && !paid && (
          <Card style={{ marginTop: spacing.md, padding: 16, backgroundColor: usageColors.background, borderColor: usageColors.border }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Text style={{ color: colors.textMuted, fontSize: font.size.sm, flexShrink: 1 }}>
                {freeChecks.periodEnd ? `Free plan · checks reset ${shortDate(freeChecks.periodEnd)}` : 'Free plan'}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel="See plans" onPress={() => router.push('/paywall')} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 8 }}>
                <Text style={{ color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.semibold }}>See plans</Text>
                <Ionicons name="arrow-up-outline" size={16} color={colors.primary} style={{ transform: [{ rotate: '45deg' }] }} accessible={false} />
              </Pressable>
            </View>
            {!activityUnavailable && <View accessibilityRole="progressbar" accessibilityLabel="Comment checks used this month" accessibilityValue={{ min: 0, max: freeChecks.allowance, now: Math.min(freeChecks.used, freeChecks.allowance) }} style={{ height: 5, borderRadius: radius.pill, backgroundColor: usageColors.border, overflow: 'hidden' }}>
              <View style={{ width: `${Math.min(100, freeChecks.used / Math.max(1, freeChecks.allowance) * 100)}%`, height: '100%', backgroundColor: usageColors.text }} />
            </View>}
            <Text style={{ color: colors.text, fontSize: font.size.md, fontWeight: font.weight.semibold, marginTop: 10 }}>
              {activityUnavailable
                ? 'Usage unavailable'
                : `${monthLeft} of ${freeChecks.allowance} checks left this month${freeChecks.bonus > 0 ? ` · +${freeChecks.bonus} extra` : ''}`}
            </Text>
            {ADS_ENABLED && !activityUnavailable && (freeChecks.adsLeftToday > 0 ? (
              <Button
                label={`Watch an ad for +${AD_REWARD_CHECKS} checks`}
                icon="play-circle-outline"
                variant="secondary"
                size="md"
                loading={rewarded.busy}
                onPress={watchAd}
                style={{ marginTop: 12 }}
              />
            ) : (
              <Text style={{ color: colors.textMuted, fontSize: font.size.sm, marginTop: 10 }}>
                Today's {AD_REWARDS_PER_DAY} ads watched. More checks tomorrow, or upgrade for unlimited.
              </Text>
            ))}
          </Card>
        )}

        {accounts.length > 0 && (
          <View style={{ marginTop: spacing.xl }}>
            <SectionLabel action={{ label: 'Manage', onPress: () => router.push('/connect-accounts') }}>Your accounts</SectionLabel>
            <Card padded={false}>
              {accounts.map((account, index) => {
                const unsupported = account.platform !== 'instagram';
                const overLimit = index >= plan.maxAccounts;
                const accountStatus = status === 'loading' ? 'Checking status' : status === 'offline' ? 'Status unavailable' : unsupported ? 'Coming soon' : !account.connected ? 'Reconnect needed' : overLimit ? `Outside your ${plan.name} limit` : outOfFreeChecks ? 'Free checks used up' : account.paused ? 'Paused' : 'Protection on';
                const healthy = status === 'ready' && !unsupported && account.connected && !overLimit && !outOfFreeChecks && !account.paused;
                const accountTone = status !== 'ready' ? 'warning' : unsupported ? 'neutral' : healthy ? 'success' : 'warning';
                const accountIcon = status === 'loading' ? 'time-outline' : status === 'offline' ? 'cloud-offline-outline' : unsupported ? 'time-outline' : healthy ? 'checkmark-circle-outline' : account.paused && account.connected && !overLimit && !outOfFreeChecks ? 'pause-circle-outline' : 'alert-circle-outline';
                return (
                  <React.Fragment key={account.id}>
                    {index > 0 && <RowSeparator />}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: LIST_ROW.gap, paddingHorizontal: LIST_ROW.inset, paddingVertical: 16 }}>
                      <RowIcon><PlatformIcon platform={account.platform} size={17} withBackground /></RowIcon>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: font.size.md, fontWeight: font.weight.semibold }}>{account.handle}</Text>
                        <View style={{ marginTop: 6, alignItems: 'flex-start' }}>
                          <Badge label={accountStatus} tone={accountTone} icon={accountIcon} />
                        </View>
                      </View>
                      {account.connected && !unsupported && !overLimit && !outOfFreeChecks ? (
                        <Switch
                          accessibilityLabel={`Moderation for ${account.handle}`}
                          accessibilityHint="Pause or resume checking new comments."
                          value={!account.paused}
                          disabled={status !== 'ready'}
                          onValueChange={() => { Haptics.selectionAsync().catch(() => {}); togglePause(account.id); }}
                          trackColor={{ false: colors.switchOff, true: colors.switchOn }}
                          thumbColor={colors.switchThumb}
                          ios_backgroundColor={colors.switchOff}
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
            <View style={{ gap: 10 }}>
              {feed.map((comment) => (
                <RemovedCommentRow key={comment.id} comment={comment} concealed />
              ))}
            </View>
          )}
        </View>

        <AdSlot placement="home_banner" />
      </ScrollView>
    </SafeAreaView>
  );
}
