import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Text } from '../src/components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlatformIcon } from '../src/components/PlatformIcon';
import { Badge, Button, Card, H1, HeaderButton, Muted, RowSeparator } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { useModeration } from '../src/context/ModerationContext';
import { getPlan } from '../src/data/plans';
import { useTheme } from '../src/theme/ThemeContext';
import { getSemanticColors } from '../src/theme/colors';
import { ConnectedAccount, Platform } from '../src/types';

const PLATFORMS: Platform[] = ['instagram', 'tiktok'];

const META: Record<Platform, { name: string; blurb: string }> = {
  instagram: { name: 'Instagram', blurb: 'Comments on your posts and reels' },
  tiktok: { name: 'TikTok', blurb: 'Coming soon' },
};

// Linked accounts sit in the same two columns as the platform header: status icon under the
// logo, handle under the platform name.
const LOGO_SIZE = 20;
const LOGO_BOX = 38; // PlatformIcon's tile at LOGO_SIZE
const COLUMN_GAP = 14;

export default function ConnectAccounts() {
  const { colors, font, spacing, radius } = useTheme();
  const router = useRouter();
  const { accounts, status, connectAccount, disconnectAccount, togglePause, freeChecks } = useModeration();
  const { subscription } = useAuth();
  const [connecting, setConnecting] = useState<Platform | null>(null);

  const plan = getPlan(subscription.plan);
  const atLimit = accounts.length >= plan.maxAccounts;
  const anyConnected = accounts.some((a) => a.platform === 'instagram' && a.connected);
  const outOfFreeChecks = !subscription.paying && freeChecks.left <= 0;

  const connect = async (platform: Platform) => {
    if (platform !== 'instagram' || atLimit || connecting !== null) return;
    setConnecting(platform);
    try {
      await connectAccount(platform);
    } catch (e: any) {
      Alert.alert(`Couldn't connect ${META[platform].name}`, e?.message ?? 'Please try again.');
    } finally {
      setConnecting(null);
    }
  };

  const confirmDisconnect = (account: ConnectedAccount) => {
    Alert.alert(
      `Disconnect ${account.handle}?`,
      `toxoff will stop moderating comments on this ${META[account.platform].name} account.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () =>
            disconnectAccount(account.id).catch((e: any) =>
              Alert.alert('Could not disconnect', e?.message ?? 'Please try again.')
            ),
        },
      ]
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: spacing.gutter }}>
        <HeaderButton icon="close" label="Close" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} />

        <H1 style={{ marginTop: 8, fontWeight: font.weight.semibold, letterSpacing: -0.8 }}>Connect your accounts</H1>
        <Muted style={{ marginTop: 8, lineHeight: 22 }}>
          toxoff needs access to moderate comments. You can disconnect anytime.
        </Muted>

        <View style={{ gap: 14, marginTop: 28 }}>
          {PLATFORMS.map((platform) => {
            const linked = accounts.filter((a) => a.platform === platform);
            return (
              <Card key={platform} style={{ borderWidth: 1, backgroundColor: platform === 'tiktok' ? colors.neutralSoft : colors.card, borderColor: platform === 'tiktok' ? colors.neutralBorder : colors.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: COLUMN_GAP }}>
                  <PlatformIcon platform={platform} size={LOGO_SIZE} withBackground />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: font.size.lg, fontWeight: font.weight.semibold }}>
                      {META[platform].name}
                    </Text>
                    {platform === 'tiktok' ? (
                      <View style={{ marginTop: 6, alignItems: 'flex-start' }}>
                        <Badge label={META[platform].blurb} tone="neutral" icon="time-outline" />
                      </View>
                    ) : (
                      <Text style={{ color: colors.textMuted, fontSize: font.size.sm, marginTop: 2 }}>
                        {META[platform].blurb}
                      </Text>
                    )}
                  </View>
                </View>
                {platform === 'instagram' && (
                  <Button
                    label={linked.length ? 'Add Instagram account' : 'Connect Instagram'}
                    size="md"
                    loading={connecting === platform}
                    disabled={atLimit || connecting !== null}
                    onPress={() => connect(platform)}
                    style={{ marginTop: 16 }}
                  />
                )}

                {linked.map((account) => {
                  const overLimit = accounts.indexOf(account) >= plan.maxAccounts;
                  const eligible = account.platform === 'instagram' && account.connected && !overLimit && !outOfFreeChecks;
                  const healthy = status === 'ready' && eligible && !account.paused;
                  const accountTone = status !== 'ready' ? 'warning' : account.platform === 'tiktok' ? 'neutral' : healthy ? 'success' : 'warning';
                  const accountColors = getSemanticColors(colors, accountTone);
                  const accountLabel = status === 'loading'
                    ? 'Checking status'
                    : status === 'offline'
                      ? 'Status unavailable'
                      : account.platform === 'tiktok'
                        ? 'Coming soon'
                        : !account.connected
                          ? 'Reconnect needed'
                          : overLimit
                            ? 'Plan limit reached'
                            : outOfFreeChecks
                              ? 'Free checks used up'
                              : account.paused
                                ? 'Paused'
                                : 'Protection on';
                  const accountIcon = status === 'loading'
                    ? 'time-outline'
                    : status === 'offline'
                      ? 'cloud-offline-outline'
                      : account.platform === 'tiktok'
                        ? 'time-outline'
                        : healthy
                          ? 'checkmark-circle-outline'
                          : status === 'ready' && eligible && account.paused
                            ? 'pause-circle-outline'
                            : 'alert-circle-outline';
                  const accountStatus = status === 'loading'
                    ? 'Checking account status…'
                    : status === 'offline'
                      ? 'Status unavailable. Refresh Home to check again.'
                      : account.platform === 'tiktok'
                        ? 'TikTok moderation is not available yet'
                        : !account.connected
                          ? 'Access expired. Disconnect and connect again.'
                          : overLimit
                            ? `Outside your ${plan.name} limit. Upgrade or disconnect another account.`
                            : outOfFreeChecks
                              ? 'Free checks used up. New comments aren’t being checked.'
                              : account.paused
                                ? 'Paused. New comments aren’t being checked.'
                                : 'Protection on';
                  return (
                    <View key={account.id} style={{ marginTop: 14 }}>
                      <RowSeparator inset={LOGO_BOX + COLUMN_GAP} />
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: COLUMN_GAP, paddingTop: 12 }}>
                        <View style={{ width: LOGO_BOX, alignItems: 'center' }}>
                          <Ionicons
                            name={accountIcon}
                            size={20}
                            color={accountColors.text}
                            accessible={false}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.text, fontSize: font.size.md, fontWeight: font.weight.medium }}>
                            {account.handle}
                          </Text>
                          <View style={{ marginTop: 6, alignItems: 'flex-start' }}>
                            <Badge label={accountLabel} tone={accountTone} />
                          </View>
                          {status !== 'loading' && accountStatus !== accountLabel && (
                            <Text style={{ color: colors.textMuted, fontSize: font.size.sm, marginTop: 6 }}>
                              {accountStatus}
                            </Text>
                          )}
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 4, marginTop: 10, marginLeft: LOGO_BOX + COLUMN_GAP }}>
                        {eligible && (
                          <Button
                            label={account.paused ? 'Resume moderation' : 'Pause moderation'}
                            onPress={() => togglePause(account.id)}
                            disabled={status !== 'ready'}
                            size="sm"
                            variant="secondary"
                            fullWidth={false}
                            style={{ maxWidth: '100%' }}
                          />
                        )}
                        {status === 'ready' && account.platform === 'instagram' && account.connected && (overLimit || outOfFreeChecks) && (
                          <Button label="See plans" onPress={() => router.push('/paywall')} size="sm" variant="secondary" fullWidth={false} />
                        )}
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Disconnect ${account.handle}`}
                          onPress={() => confirmDisconnect(account)}
                          style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}
                        >
                          <Text style={{ color: colors.danger, fontSize: font.size.sm, fontWeight: font.weight.semibold }}>
                            Disconnect
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </Card>
            );
          })}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 2 }}>
          <Text style={{ color: colors.textMuted, fontSize: font.size.sm, flex: 1 }}>
            {accounts.length} of {plan.maxAccounts} account{plan.maxAccounts > 1 ? 's' : ''} used ·{' '}
            {plan.name} plan
          </Text>
          {/* One-account plans get the upgrade banner below instead of a second link. */}
          {atLimit && plan.maxAccounts > 1 && (
            <Pressable accessibilityRole="button" accessibilityLabel="Upgrade your plan" onPress={() => router.push('/paywall')} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.semibold }}>
                Upgrade
              </Text>
            </Pressable>
          )}
        </View>

        {atLimit && plan.maxAccounts === 1 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Upgrade from ${plan.name} to moderate up to 5 Instagram accounts`}
            onPress={() => router.push('/paywall')}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              marginTop: 12,
              padding: 14,
              backgroundColor: colors.accentSoft,
              borderWidth: 1,
              borderColor: colors.accentBorder,
              borderRadius: radius.sm,
            }}
          >
            <Ionicons name="sparkles-outline" size={18} color={colors.accentText} />
            <Text style={{ color: colors.accentText, fontSize: font.size.sm, flex: 1, lineHeight: 20 }}>
              {plan.name} covers one account. Upgrade to Plus to moderate up to 5 Instagram accounts.
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.accentText} />
          </Pressable>
        )}

        <View
          style={{
            flexDirection: 'row',
            gap: 10,
            marginTop: 16,
            padding: 14,
            backgroundColor: colors.hero,
            borderLeftWidth: 3,
            borderLeftColor: colors.border,
            borderRadius: radius.sm,
          }}
        >
          <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, fontSize: font.size.sm, flex: 1, lineHeight: 20 }}>
            toxoff can read, hide and restore comments, and delete them if you enable deletion.
            We never publish posts or access your DMs. You can disconnect anytime.
          </Text>
        </View>

        <View style={{ flex: 1, minHeight: 24 }} />

        <View style={{ paddingBottom: 20, gap: 12 }}>
          <Button
            label={anyConnected ? 'Go to dashboard' : 'Continue'}
            onPress={() => router.replace('/(tabs)')}
            disabled={!anyConnected}
          />
          {!anyConnected && (
            <Pressable accessibilityRole="button" onPress={() => router.replace('/(tabs)')} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ color: colors.textMuted, textAlign: 'center', fontSize: font.size.md }}>
                I'll do this later
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
