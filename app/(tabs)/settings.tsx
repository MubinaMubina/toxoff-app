import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlatformIcon } from '../../src/components/PlatformIcon';
import { Badge, Card, SectionLabel, Segmented } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { useModeration } from '../../src/context/ModerationContext';
import { useRegion } from '../../src/context/RegionContext';
import { getPlan } from '../../src/data/plans';
import { registerForPushNotifications } from '../../src/lib/notifications';
import { fullTimestamp } from '../../src/lib/time';
import { useTheme } from '../../src/theme/ThemeContext';

export default function Settings() {
  const { colors, font, pref, setPref } = useTheme();
  const router = useRouter();
  const { user, subscription, signOut } = useAuth();
  const { accounts, notificationsEnabled, setNotificationsEnabled, savePushToken } = useModeration();
  const { region, available, setRegionCode } = useRegion();

  const [savingPush, setSavingPush] = useState(false);
  const plan = getPlan(subscription.plan);

  const togglePush = async (value: boolean) => {
    if (!value) {
      setNotificationsEnabled(false);
      return;
    }
    setSavingPush(true);
    const token = await registerForPushNotifications();
    setSavingPush(false);
    if (token === null) {
      Alert.alert(
        'Notifications are off',
        'Enable notifications for toxoff in your device settings to get alerts when comments are removed.'
      );
      setNotificationsEnabled(false);
      return;
    }
    savePushToken(token);
    setNotificationsEnabled(true);
  };

  const changeRegion = () => {
    Alert.alert(
      'Billing region',
      'Pick the region used for pricing and payment methods.',
      [
        ...available.map((r) => ({
          text: `${r.country} (${r.currency})`,
          onPress: () => setRegionCode(r.code),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ]
    );
  };

  const confirmLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/splash');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Text style={{ color: colors.text, fontSize: font.size.xxl, fontWeight: font.weight.heavy }}>
          Settings
        </Text>

        {/* Profile */}
        <Card style={{ marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View
            style={{
              width: 54,
              height: 54,
              borderRadius: 27,
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontSize: font.size.xl, fontWeight: font.weight.bold }}>
              {(user?.name?.[0] ?? 'C').toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: font.size.lg, fontWeight: font.weight.semibold }}>
              {user?.name ?? 'Creator'}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: font.size.sm }} numberOfLines={1}>
              {user?.email ?? 'you@example.com'}
            </Text>
          </View>
        </Card>

        {/* Subscription */}
        <View style={{ marginTop: 24 }}>
          <SectionLabel>Subscription</SectionLabel>
          <Pressable onPress={() => router.push('/paywall')}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: colors.text, fontSize: font.size.lg, fontWeight: font.weight.semibold }}>
                      {plan.name} plan
                    </Text>
                    {subscription.status === 'trialing' && (
                      <Badge label="Trial" color={colors.success} bg={colors.successSoft} />
                    )}
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: font.size.sm, marginTop: 3 }}>
                    {subscription.status === 'trialing' && subscription.trialEndsAt
                      ? `Trial ends ${fullTimestamp(subscription.trialEndsAt).split(',')[0]}, then Free`
                      : subscription.status === 'free'
                        ? 'Upgrade for unlimited moderation'
                        : 'Manage your plan & billing'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
              </View>
            </Card>
          </Pressable>
        </View>

        {/* Connected accounts */}
        <View style={{ marginTop: 24 }}>
          <SectionLabel>Connected accounts</SectionLabel>
          <Card padded={false}>
            {accounts.map((acc, i) => (
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
                <PlatformIcon platform={acc.platform} size={15} withBackground />
                <Text style={{ color: colors.text, fontSize: font.size.md, flex: 1, fontWeight: font.weight.medium }}>
                  {acc.handle}
                </Text>
                <Ionicons
                  name={acc.connected ? 'checkmark-circle' : 'alert-circle'}
                  size={20}
                  color={acc.connected ? colors.success : colors.warning}
                />
              </View>
            ))}
            <Pressable
              onPress={() => router.push('/connect-accounts')}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                padding: 14,
                borderTopWidth: accounts.length ? 0.5 : 0,
                borderTopColor: colors.border,
              }}
            >
              <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: font.size.md, fontWeight: font.weight.medium }}>
                {accounts.length ? 'Manage accounts' : 'Connect an account'}
              </Text>
            </Pressable>
          </Card>
        </View>

        {/* Preferences */}
        <View style={{ marginTop: 24 }}>
          <SectionLabel>Preferences</SectionLabel>
          <Card padded={false}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
              <Ionicons name="notifications-outline" size={20} color={colors.text} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: font.size.md, fontWeight: font.weight.medium }}>
                  Push alerts
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: font.size.xs, marginTop: 1 }}>
                  Notify me when comments are removed
                </Text>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={togglePush}
                disabled={savingPush}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#fff"
              />
            </View>

            <Pressable
              onPress={changeRegion}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 14,
                borderTopWidth: 0.5,
                borderTopColor: colors.border,
              }}
            >
              <Ionicons name="globe-outline" size={20} color={colors.text} />
              <Text style={{ color: colors.text, fontSize: font.size.md, flex: 1, fontWeight: font.weight.medium }}>
                Billing region
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: font.size.sm }}>
                {region.country} · {region.currency}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </Pressable>

            <View style={{ padding: 14, borderTopWidth: 0.5, borderTopColor: colors.border, gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Ionicons name="contrast-outline" size={20} color={colors.text} />
                <Text style={{ color: colors.text, fontSize: font.size.md, fontWeight: font.weight.medium }}>
                  Appearance
                </Text>
              </View>
              <Segmented
                value={pref}
                onChange={setPref}
                options={[
                  { label: 'System', value: 'system' },
                  { label: 'Light', value: 'light' },
                  { label: 'Dark', value: 'dark' },
                ]}
              />
            </View>
          </Card>
        </View>

        {/* About */}
        <View style={{ marginTop: 24 }}>
          <SectionLabel>About</SectionLabel>
          <Card padded={false}>
            <LinkRow icon="document-text-outline" label="Privacy policy" />
            <LinkRow icon="shield-checkmark-outline" label="Terms of service" border />
            <LinkRow icon="help-circle-outline" label="Help & support" border />
          </Card>
        </View>

        {/* Logout */}
        <Pressable
          onPress={confirmLogout}
          style={{
            marginTop: 24,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 15,
            borderRadius: 14,
            backgroundColor: colors.dangerSoft,
          }}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={{ color: colors.danger, fontSize: font.size.md, fontWeight: font.weight.semibold }}>
            Log out
          </Text>
        </Pressable>

        <Text style={{ color: colors.textFaint, fontSize: font.size.xs, textAlign: 'center', marginTop: 18 }}>
          toxoff v1.0.0
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function LinkRow({
  icon,
  label,
  border,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  border?: boolean;
}) {
  const { colors, font } = useTheme();
  return (
    <Pressable
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderTopWidth: border ? 0.5 : 0,
        borderTopColor: colors.border,
      }}
    >
      <Ionicons name={icon} size={20} color={colors.text} />
      <Text style={{ color: colors.text, fontSize: font.size.md, flex: 1 }}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Pressable>
  );
}
