import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlatformIcon } from '../src/components/PlatformIcon';
import { Button, Card, H1, Muted } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { useModeration } from '../src/context/ModerationContext';
import { getPlan } from '../src/data/plans';
import { useTheme } from '../src/theme/ThemeContext';
import { Platform } from '../src/types';

const META: Record<Platform, { name: string; blurb: string }> = {
  instagram: { name: 'Instagram', blurb: 'Comments on posts, reels & stories' },
  tiktok: { name: 'TikTok', blurb: 'Comments on your videos' },
};

export default function ConnectAccounts() {
  const { colors, font } = useTheme();
  const router = useRouter();
  const { accounts, connectAccount } = useModeration();
  const { subscription } = useAuth();
  const [connecting, setConnecting] = useState<Platform | null>(null);

  const plan = getPlan(subscription.plan ?? 'solo');
  const connectedCount = accounts.filter((a) => a.connected).length;
  const atLimit = connectedCount >= plan.maxAccounts;

  // OAuth flow placeholder — in production this opens the platform's OAuth
  // consent screen via expo-web-browser, then stores the returned token.
  const connect = (platform: Platform) => {
    setConnecting(platform);
    setTimeout(() => {
      connectAccount(platform);
      setConnecting(null);
    }, 1100);
  };

  const anyConnected = accounts.some((a) => a.connected);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1, paddingHorizontal: 24 }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ paddingVertical: 14 }}>
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>

        <H1>Connect your accounts</H1>
        <Muted style={{ marginTop: 6 }}>
          toxoff needs access to moderate comments. You can disconnect anytime.
        </Muted>

        <View style={{ gap: 14, marginTop: 28 }}>
          {accounts.map((acc) => (
            <Card key={acc.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <PlatformIcon platform={acc.platform} size={20} withBackground />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: font.size.lg, fontWeight: font.weight.semibold }}>
                    {META[acc.platform].name}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: font.size.sm, marginTop: 2 }}>
                    {acc.connected ? acc.handle : META[acc.platform].blurb}
                  </Text>
                </View>

                {acc.connected ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                    <Text style={{ color: colors.success, fontWeight: font.weight.semibold, fontSize: font.size.sm }}>
                      Connected
                    </Text>
                  </View>
                ) : connecting === acc.platform ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Button
                    label="Connect"
                    size="sm"
                    fullWidth={false}
                    disabled={atLimit}
                    onPress={() => connect(acc.platform)}
                  />
                )}
              </View>
            </Card>
          ))}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingHorizontal: 2 }}>
          <Text style={{ color: colors.textMuted, fontSize: font.size.sm, flex: 1 }}>
            {connectedCount} of {plan.maxAccounts} account{plan.maxAccounts > 1 ? 's' : ''} used ·{' '}
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

        {atLimit && plan.id === 'solo' && (
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
              Solo covers one account. Upgrade to Plus to moderate up to 5 across Instagram & TikTok.
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
            We only request permission to read and remove comments. We never post on your behalf or
            access your DMs.
          </Text>
        </View>

        <View style={{ flex: 1 }} />

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
      </View>
    </SafeAreaView>
  );
}
