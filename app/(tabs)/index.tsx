import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlatformIcon } from '../../src/components/PlatformIcon';
import { RemovedCommentRow } from '../../src/components/RemovedCommentRow';
import { Card, EmptyState, SectionLabel } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { useModeration } from '../../src/context/ModerationContext';
import { registerForPushNotifications } from '../../src/lib/notifications';
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

export default function Dashboard() {
  const { colors, font } = useTheme();
  const router = useRouter();
  const { user, subscription } = useAuth();
  const { metrics, comments, accounts, togglePause, notificationsEnabled } = useModeration();

  // Register for push alerts once if the user has them enabled.
  useEffect(() => {
    if (notificationsEnabled) registerForPushNotifications().catch(() => {});
  }, [notificationsEnabled]);

  const connected = accounts.filter((a) => a.connected);
  const feed = comments.slice(0, 6);
  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={{ color: colors.textMuted, fontSize: font.size.md }}>Welcome back,</Text>
            <Text style={{ color: colors.text, fontSize: font.size.xxl, fontWeight: font.weight.heavy }}>
              {firstName} 👋
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/(tabs)/settings')}
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

        {/* Trial banner */}
        {subscription.status === 'trialing' && (
          <Pressable onPress={() => router.push('/paywall')}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                backgroundColor: colors.primary,
                borderRadius: 14,
                padding: 14,
                marginTop: 18,
              }}
            >
              <Ionicons name="sparkles" size={20} color="#fff" />
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontWeight: font.weight.semibold, fontSize: font.size.md }}>
                  You're on a free trial
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: font.size.sm, marginTop: 1 }}>
                  Pick a plan to keep moderation running after it ends.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#fff" />
            </View>
          </Pressable>
        )}

        {/* Metrics */}
        <View style={{ marginTop: 22 }}>
          <SectionLabel>Comments removed</SectionLabel>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <MetricCard value={metrics.today} label="Today" accent={palette.purple} />
            <MetricCard value={metrics.week} label="This week" accent={palette.blue} />
            <MetricCard value={metrics.month} label="This month" accent={palette.green} />
          </View>
        </View>

        {/* Accounts pause/resume */}
        <View style={{ marginTop: 26 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <SectionLabel>Moderation</SectionLabel>
            <Pressable onPress={() => router.push('/connect-accounts')}>
              <Text style={{ color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.semibold }}>
                Manage
              </Text>
            </Pressable>
          </View>
          {connected.length === 0 ? (
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
              {connected.map((acc, i) => (
                <View
                  key={acc.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 14,
                    borderTopWidth: i === 0 ? 0 : 0.5,
                    borderTopColor: colors.border,
                  }}
                >
                  <PlatformIcon platform={acc.platform} size={16} withBackground />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: font.size.md, fontWeight: font.weight.medium }}>
                      {acc.handle}
                    </Text>
                    <Text
                      style={{
                        color: acc.paused ? colors.warning : colors.success,
                        fontSize: font.size.xs,
                        marginTop: 1,
                        fontWeight: font.weight.medium,
                      }}
                    >
                      {acc.paused ? 'Paused' : 'Active · moderating'}
                    </Text>
                  </View>
                  <Switch
                    value={!acc.paused}
                    onValueChange={() => {
                      Haptics.selectionAsync().catch(() => {});
                      togglePause(acc.id);
                    }}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor="#fff"
                  />
                </View>
              ))}
            </Card>
          )}
        </View>

        {/* Live feed */}
        <View style={{ marginTop: 26 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <SectionLabel>Recently removed</SectionLabel>
            {feed.length > 0 && (
              <Pressable onPress={() => router.push('/(tabs)/log')}>
                <Text style={{ color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.semibold }}>
                  See all
                </Text>
              </Pressable>
            )}
          </View>

          {feed.length === 0 ? (
            <Card>
              <EmptyState
                icon="shield-checkmark-outline"
                title="All clear"
                subtitle="No toxic comments removed yet. We'll show them here the moment we catch one."
              />
            </Card>
          ) : (
            <Card padded={false} style={{ paddingHorizontal: 16 }}>
              {feed.map((c, i) => (
                <View
                  key={c.id}
                  style={i === 0 ? undefined : { borderTopWidth: 0.5, borderTopColor: colors.border }}
                >
                  <RemovedCommentRow comment={c} />
                </View>
              ))}
            </Card>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
