import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlatformIcon } from '../../src/components/PlatformIcon';
import { OfflineBanner, SkeletonRows } from '../../src/components/Skeleton';
import {
  Badge,
  Button,
  Card,
  Chevron,
  LIST_ROW,
  RowIcon,
  RowSeparator,
  ScreenTitle,
  SectionLabel,
  Segmented,
} from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { useModeration } from '../../src/context/ModerationContext';
import { getPlan, INVITE_BONUS } from '../../src/data/plans';
import { apiPost, isApiConfigured } from '../../src/lib/api';
import { emailSupport, openLink, PRIVACY_URL, TERMS_URL } from '../../src/lib/links';
import { registerForPushNotifications } from '../../src/lib/notifications';
import { manageSubscription } from '../../src/lib/purchases';
import { shortDate } from '../../src/lib/time';
import { useTheme } from '../../src/theme/ThemeContext';
import { AutoEraseDays, LogVisibility, NotificationMode } from '../../src/types';

export default function Settings() {
  const { colors, font, pref, setPref, spacing } = useTheme();
  const router = useRouter();
  const { user, subscription, signOut, refreshSubscription } = useAuth();
  const { status, reload, accounts, preferences, savePushToken, setNotificationMode, setLogVisibility, setAutoEraseDays } =
    useModeration();

  const [savingPush, setSavingPush] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const plan = getPlan(subscription.plan);
  const billing = subscription.billing;
  const billingPlan = billing ? getPlan(billing.plan).name : '';

  const planDetail =
    billing?.status === 'past_due'
      ? 'Payment problem. Update your payment method in the App Store.'
      : subscription.status === 'trialing' && subscription.trialEndsAt
        ? `Trial ends ${shortDate(subscription.trialEndsAt)}, then ${billing?.status === 'scheduled' ? billingPlan : 'Free'}`
        : billing?.periodEnd
          ? billing.status === 'scheduled'
            ? `Starts ${shortDate(billing.periodEnd)}`
            : billing.cancelAtPeriodEnd
              ? `Ends ${shortDate(billing.periodEnd)}`
              : `Renews ${shortDate(billing.periodEnd)} · billed ${billing.interval === 'annual' ? 'yearly' : 'monthly'}`
          : subscription.status === 'free'
            ? 'Upgrade for unlimited moderation'
            : 'Manage your plan & billing';

  // Changing plan, the payment method, or cancelling all happen on Apple's own subscriptions page.
  const manageBilling = async () => {
    setBillingBusy(true);
    try {
      await manageSubscription();
      await refreshSubscription();
    } catch (e: any) {
      Alert.alert('Something went wrong', e?.message ?? 'Please try again.');
    } finally {
      setBillingBusy(false);
    }
  };

  // 'each' and 'daily' need the device's permission; 'none' just switches alerts off.
  const chooseNotifications = async (mode: NotificationMode) => {
    if (mode === preferences.notificationMode) return;
    if (mode === 'none') {
      setNotificationMode('none');
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
      setNotificationMode('none');
      return;
    }
    savePushToken(token);
    setNotificationMode(mode);
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

  // Apple requires deletion from inside the app. Two confirmations, and a reminder that an App
  // Store subscription lives with Apple and must be cancelled there.
  const [deleting, setDeleting] = useState(false);
  const deleteAccount = async () => {
    setDeleting(true);
    try {
      if (isApiConfigured) await apiPost('/account/delete', { confirm: true });
      await signOut().catch(() => {}); // the session is already gone on the server
      router.replace('/splash');
      Alert.alert('Account deleted', 'Your toxoff account and its data are gone. Thank you for trying toxoff.');
    } catch (e: any) {
      Alert.alert('Could not delete your account', e?.message ?? 'Please try again, or email support@toxoff.app.');
    } finally {
      setDeleting(false);
    }
  };
  const confirmDelete = () => {
    const subscribed = billing !== null && billing.store === 'app_store';
    Alert.alert(
      'Delete your account?',
      (subscribed
        ? 'You have an active subscription. Deleting your account does not cancel it: cancel it first in your iPhone Settings > your name > Subscriptions, or Apple will keep charging you.\n\n'
        : '') +
        'This deletes your account, your connected Instagram accounts, your removed-comment history and your settings. toxoff stops moderating your comments straight away.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () =>
            Alert.alert('This can’t be undone', 'Delete your toxoff account and all of its data for good?', [
              { text: 'Keep my account', style: 'cancel' },
              { text: 'Delete forever', style: 'destructive', onPress: deleteAccount },
            ]),
        },
      ]
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.gutter, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <ScreenTitle title="Settings" />

        {status === 'offline' && (
          <View style={{ marginTop: spacing.md }}>
            <OfflineBanner onRetry={reload} />
          </View>
        )}

        {/* Profile */}
        <Card style={{ marginTop: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
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
        <View style={{ marginTop: spacing.xl }}>
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
                  <Text
                    style={{
                      color: billing?.status === 'past_due' ? colors.warning : colors.textMuted,
                      fontSize: font.size.sm,
                      marginTop: 3,
                    }}
                  >
                    {planDetail}
                  </Text>
                </View>
                <Chevron />
              </View>
            </Card>
          </Pressable>

          {billing && (
            <Card padded={false} style={{ marginTop: spacing.md, opacity: billingBusy ? 0.6 : 1 }}>
              <Pressable onPress={manageBilling} disabled={billingBusy} style={ROW}>
                <RowIcon>
                  <Ionicons name="card-outline" size={20} color={colors.text} />
                </RowIcon>
                <Text style={{ color: colors.text, fontSize: font.size.md, flex: 1, fontWeight: font.weight.medium }}>
                  Manage subscription
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: font.size.sm }}>
                  {billing.cancelAtPeriodEnd ? `Keep ${billingPlan}` : 'Change or cancel'}
                </Text>
                <Chevron />
              </Pressable>
            </Card>
          )}

          <Card padded={false} style={{ marginTop: spacing.md }}>
            <Pressable onPress={() => router.push('/invite')} style={ROW}>
              <RowIcon>
                <Ionicons name="gift-outline" size={20} color={colors.text} />
              </RowIcon>
              <Text style={{ color: colors.text, fontSize: font.size.md, flex: 1, fontWeight: font.weight.medium }}>
                Invite friends
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: font.size.sm }}>+{INVITE_BONUS} checks each</Text>
              <Chevron />
            </Pressable>
          </Card>
        </View>

        {/* Connected accounts */}
        <View style={{ marginTop: spacing.xl }}>
          <SectionLabel>Connected accounts</SectionLabel>
          {status !== 'ready' && accounts.length === 0 ? (
            <SkeletonRows count={1} lines={1} />
          ) : (
          <Card padded={false}>
            {accounts.map((acc) => (
              <React.Fragment key={acc.id}>
                <View style={ROW}>
                  <RowIcon>
                    <PlatformIcon platform={acc.platform} size={17} withBackground />
                  </RowIcon>
                  <Text style={{ color: colors.text, fontSize: font.size.md, flex: 1, fontWeight: font.weight.medium }}>
                    {acc.handle}
                  </Text>
                  <Ionicons
                    name={acc.connected ? 'checkmark-circle' : 'alert-circle'}
                    size={20}
                    color={acc.connected ? colors.success : colors.warning}
                  />
                </View>
                <RowSeparator />
              </React.Fragment>
            ))}
            <Pressable onPress={() => router.push('/connect-accounts')} style={ROW}>
              <RowIcon>
                <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
              </RowIcon>
              <Text style={{ color: colors.primary, fontSize: font.size.md, fontWeight: font.weight.medium }}>
                {accounts.length ? 'Manage accounts' : 'Connect an account'}
              </Text>
            </Pressable>
          </Card>
          )}
        </View>

        {/* Peace of mind: what the user sees of removed comments, and how they hear about them */}
        <View style={{ marginTop: spacing.xl }}>
          <SectionLabel>Peace of mind</SectionLabel>
          <Card padded={false}>
            <ChoiceBlock
              icon="eye-off-outline"
              title="Removed comments in your log"
              hint={
                preferences.logVisibility === 'all'
                  ? 'Every removed comment’s words are shown.'
                  : preferences.logVisibility === 'conceal_deleted'
                    ? 'Deleted comments stay out of sight. Hidden ones can be read and restored.'
                    : 'No words at all. You see how many were removed, and why.'
              }
            >
              <Segmented<LogVisibility>
                value={preferences.logVisibility}
                onChange={setLogVisibility}
                options={[
                  { label: 'Show all', value: 'all' },
                  { label: 'Hide deleted', value: 'conceal_deleted' },
                  { label: 'Count only', value: 'count_only' },
                ]}
              />
            </ChoiceBlock>

            <RowSeparator />
            <ChoiceBlock
              icon="flame-outline"
              title="Auto-erase deleted comments"
              hint="Their words are wiped from your log for good, unread. Your totals on Home still count them."
            >
              <Segmented<'never' | '7' | '30'>
                value={preferences.autoEraseDays === null ? 'never' : (String(preferences.autoEraseDays) as '7' | '30')}
                onChange={(v) => setAutoEraseDays(v === 'never' ? null : (Number(v) as AutoEraseDays))}
                options={[
                  { label: 'Never', value: 'never' },
                  { label: 'After 7 days', value: '7' },
                  { label: 'After 30 days', value: '30' },
                ]}
              />
            </ChoiceBlock>

            <RowSeparator />
            <ChoiceBlock
              icon="notifications-outline"
              title="Alerts"
              hint={
                savingPush
                  ? 'Asking your device for permission…'
                  : preferences.notificationMode === 'each'
                    ? 'A push the moment a comment is removed. Never includes the comment itself.'
                    : preferences.notificationMode === 'daily'
                      ? 'One message a day with the count, at 9am.'
                      : 'No alerts. Check the Log whenever you like.'
              }
            >
              <Segmented<NotificationMode>
                value={preferences.notificationMode}
                onChange={chooseNotifications}
                options={[
                  { label: 'Every time', value: 'each' },
                  { label: 'Daily', value: 'daily' },
                  { label: 'Off', value: 'none' },
                ]}
              />
            </ChoiceBlock>
          </Card>
        </View>

        {/* Preferences */}
        <View style={{ marginTop: spacing.xl }}>
          <SectionLabel>Preferences</SectionLabel>
          <Card padded={false}>
            <ChoiceBlock icon="contrast-outline" title="Appearance">
              <Segmented
                value={pref}
                onChange={setPref}
                options={[
                  { label: 'System', value: 'system' },
                  { label: 'Light', value: 'light' },
                  { label: 'Dark', value: 'dark' },
                ]}
              />
            </ChoiceBlock>
          </Card>
        </View>

        {/* About */}
        <View style={{ marginTop: spacing.xl }}>
          <SectionLabel>About</SectionLabel>
          <Card padded={false}>
            <LinkRow icon="document-text-outline" label="Privacy policy" onPress={() => openLink(PRIVACY_URL)} />
            <RowSeparator />
            <LinkRow icon="shield-checkmark-outline" label="Terms of service" onPress={() => openLink(TERMS_URL)} />
            <RowSeparator />
            <LinkRow icon="help-circle-outline" label="Help & support" onPress={emailSupport} />
          </Card>
        </View>

        {/* Logout */}
        <Button
          label="Log out"
          icon="log-out-outline"
          variant="danger"
          onPress={confirmLogout}
          style={{ marginTop: spacing.xl }}
        />

        {/* Account deletion: deliberately quiet, but present (App Store rule 5.1.1(v)). */}
        <Pressable
          onPress={confirmDelete}
          disabled={deleting}
          accessibilityRole="button"
          hitSlop={8}
          style={{ alignSelf: 'center', marginTop: 16, minHeight: 24, justifyContent: 'center', opacity: deleting ? 0.5 : 1 }}
        >
          <Text style={{ color: colors.textMuted, fontSize: font.size.sm, fontWeight: font.weight.medium }}>
            {deleting ? 'Deleting your account…' : 'Delete my account'}
          </Text>
        </Pressable>

        <Text style={{ color: colors.textFaint, fontSize: font.size.xs, textAlign: 'center', marginTop: 18 }}>
          toxoff v1.0.0
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const ROW = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: LIST_ROW.gap,
  paddingHorizontal: LIST_ROW.inset,
  paddingVertical: 14,
} as const;

/** A titled row with a control underneath and, optionally, a line explaining the current choice. */
function ChoiceBlock({
  icon,
  title,
  hint,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const { colors, font } = useTheme();
  return (
    <View style={{ paddingHorizontal: LIST_ROW.inset, paddingVertical: 14, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: LIST_ROW.gap }}>
        <RowIcon>
          <Ionicons name={icon} size={20} color={colors.text} />
        </RowIcon>
        <Text style={{ color: colors.text, fontSize: font.size.md, fontWeight: font.weight.medium, flex: 1 }}>
          {title}
        </Text>
      </View>
      {children}
      {hint && (
        <Text style={{ color: colors.textMuted, fontSize: font.size.xs, lineHeight: 17 }}>{hint}</Text>
      )}
    </View>
  );
}

function LinkRow({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { colors, font } = useTheme();
  return (
    <Pressable style={ROW} onPress={onPress} accessibilityRole="link">
      <RowIcon>
        <Ionicons name={icon} size={20} color={colors.text} />
      </RowIcon>
      <Text style={{ color: colors.text, fontSize: font.size.md, flex: 1, fontWeight: font.weight.medium }}>
        {label}
      </Text>
      <Chevron />
    </Pressable>
  );
}
