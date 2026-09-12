import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlatformIcon } from '../src/components/PlatformIcon';
import { Button, Card, H1, Muted } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { useModeration } from '../src/context/ModerationContext';
import { getPlan } from '../src/data/plans';
import { useTheme } from '../src/theme/ThemeContext';
import { ConnectedAccount, Platform } from '../src/types';

const PLATFORMS: Platform[] = ['instagram', 'tiktok'];

const META: Record<Platform, { name: string; blurb: string }> = {
  instagram: { name: 'Instagram', blurb: 'Comments on posts, reels & stories' },
  tiktok: { name: 'TikTok', blurb: 'Comments on your videos' },
};

export default function ConnectAccounts() {
  const { colors, font, spacing } = useTheme();
  const router = useRouter();
  const { accounts, connectAccount, disconnectAccount } = useModeration();
  const { subscription } = useAuth();
  const [connecting, setConnecting] = useState<Platform | null>(null);

  const plan = getPlan(subscription.plan);
  const atLimit = accounts.length >= plan.maxAccounts;
  const anyConnected = accounts.length > 0;

  const connect = async (platform: Platform) => {
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
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ paddingVertical: 14 }}>
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>

        <H1>Connect your accounts</H1>
        <Muted style={{ marginTop: 6 }}>
          toxoff needs access to moderate comments. You can disconnect anytime.
        </Muted>

        <View style={{ gap: 14, marginTop: 28 }}>
          {PLATFORMS.map((platform) => {
            const linked = accounts.filter((a) => a.platform === platform);
            return (
              <Card key={platform}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <PlatformIcon platform={platform} size={20} withBackground />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: font.size.lg, fontWeight: font.weight.semibold }}>
                      {META[platform].name}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: font.size.sm, marginTop: 2 }}>
                      {META[platform].blurb}
                    </Text>
                  </View>
                  {connecting === platform ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Button
                      label={linked.length ? 'Add' : 'Connect'}
                      size="sm"
                      fullWidth={false}
                      disabled={atLimit || connecting !== null}
                      onPress={() => connect(platform)}
                    />
                  )}
                </View>

                {linked.map((account) => {
                  const overLimit = accounts.indexOf(account) >= plan.maxAccounts;
                  const warning = !account.connected
                    ? 'Access expired — disconnect and connect again'
                    : overLimit
                      ? `Not moderated on ${plan.name} — upgrade or disconnect another account`
                      : null;
                  return (
                    <View
                      key={account.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        marginTop: 14,
                        paddingTop: 12,
                        borderTopWidth: 0.5,
                        borderTopColor: colors.border,
                      }}
                    >
                      <Ionicons
                        name={warning ? 'alert-circle' : 'checkmark-circle'}
                        size={20}
                        color={warning ? colors.warning : colors.success}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: font.size.md, fontWeight: font.weight.medium }}>
                          {account.handle}
                        </Text>
                        {warning && (
                          <Text style={{ color: colors.warning, fontSize: font.size.xs, marginTop: 1 }}>
                            {warning}
                          </Text>
                        )}
                      </View>
                      <Pressable onPress={() => confirmDisconnect(account)} hitSlop={8}>
                        <Text style={{ color: colors.danger, fontSize: font.size.sm, fontWeight: font.weight.semibold }}>
                          Disconnect
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </Card>
            );
          })}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingHorizontal: 2 }}>
          <Text style={{ color: colors.textMuted, fontSize: font.size.sm, flex: 1 }}>
            {accounts.length} of {plan.maxAccounts} account{plan.maxAccounts > 1 ? 's' : ''} used ·{' '}
            {plan.name} plan
          </Text>
          {atLimit && (
            <Pressable onPress={() => router.push('/paywall')}>
              <Text style={{ color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.semibold }}>
                Upgrade
              </Text>
            </Pressable>
          )}
        </View>

        {atLimit && plan.maxAccounts === 1 && (
          <Pressable
            onPress={() => router.push('/paywall')}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              marginTop: 12,
              padding: 14,
              backgroundColor: colors.primarySoft,
              borderRadius: 14,
            }}
          >
            <Ionicons name="sparkles" size={18} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: font.size.sm, flex: 1, lineHeight: 19 }}>
              {plan.name} covers one account. Upgrade to Plus to moderate up to 5 across Instagram &
              TikTok.
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.primary} />
          </Pressable>
        )}

        <View
          style={{
            flexDirection: 'row',
            gap: 10,
            marginTop: 16,
            padding: 14,
            backgroundColor: colors.surfaceAlt,
            borderRadius: 14,
          }}
        >
          <Ionicons name="lock-closed" size={18} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, fontSize: font.size.sm, flex: 1, lineHeight: 19 }}>
            We only request permission to read and hide comments. We never post on your behalf or
            access your DMs.
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
            <Pressable onPress={() => router.replace('/(tabs)')}>
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
