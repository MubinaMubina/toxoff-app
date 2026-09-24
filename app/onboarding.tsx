import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';
import { Text } from '../src/components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlatformIcon } from '../src/components/PlatformIcon';
import { Button, Card, H1, HeaderButton, Muted, RowSeparator, Toggle } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { useModeration } from '../src/context/ModerationContext';
import { DEFAULT_FLAGGED_ACTION, DEFAULT_SENSITIVITY } from '../src/data/moderationDefaults';
import { AUTO_DELETE_PERCENT, getPlan } from '../src/data/plans';
import { useTheme } from '../src/theme/ThemeContext';
import { Sensitivity } from '../src/types';

const STEPS = ['Connect', 'Protection', 'Ready'] as const;
const PROTECTION_LEVELS: { value: Sensitivity; label: string; description: string }[] = [
  { value: 'low', label: 'Gentle', description: 'Focus on clear abuse, including threats and direct attacks.' },
  { value: 'medium', label: 'Balanced', description: 'Catch insults and bullying while allowing criticism of your content.' },
  { value: 'high', label: 'Strict', description: 'Catch more borderline comments. May also remove harsh criticism.' },
];

// Only connection and a protection level are needed to get started. Filters and Settings
// keep the advanced choices, and running setup again preserves saved preferences.
export default function Onboarding() {
  const { colors, font, spacing, radius } = useTheme();
  const router = useRouter();
  const { completeOnboarding, onboarded, subscription } = useAuth();
  const { accounts, filters, preferences, status, reload, connectAccount, applyOnboarding } = useModeration();
  const [index, setIndex] = useState(0);
  const [selectedSensitivity, setSelectedSensitivity] = useState<Sensitivity | null>(null);
  const [spamProtection, setSpamProtection] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const sensitivity = selectedSensitivity ?? filters.sensitivity;
  const spamEnabled = spamProtection ?? filters.categories.spam;
  // New users start on auto: clear abuse deleted for good, the rest hidden. Changed in Filters.
  const action = onboarded ? filters.flaggedAction : DEFAULT_FLAGGED_ACTION;
  const connectedAccount = accounts.find((a) => a.platform === 'instagram' && a.connected);
  const atLimit = accounts.length >= getPlan(subscription.plan).maxAccounts;
  const busy = connecting || saving;
  const ready = status === 'ready' && onboarded !== null;
  const level = PROTECTION_LEVELS.find((p) => p.value === sensitivity)!;

  const go = (next: number) => {
    if (busy) return;
    Haptics.selectionAsync().catch(() => {});
    setIndex(next);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const saveProtection = () => applyOnboarding({
    ...preferences,
    sensitivity,
    categories: { ...filters.categories, spam: spamEnabled },
    keywords: filters.keywords,
    flaggedAction: action,
  });

  const connect = async () => {
    if (!ready || busy || atLimit) return;
    setConnecting(true);
    try {
      // Moderation can start on connection: save the reversible first-run action before OAuth.
      await saveProtection();
      await connectAccount('instagram', 'onboarding');
    } catch (e: any) {
      Alert.alert('Could not connect Instagram', e?.message ?? 'Please try again.');
    } finally {
      setConnecting(false);
    }
  };

  const finish = async () => {
    if (!ready || busy) return;
    setSaving(true);
    try {
      await saveProtection();
      await completeOnboarding();
      router.replace('/(tabs)');
    } catch (e: any) {
      Alert.alert('Could not finish setup', e?.message ?? 'Please try again. Your account connection is saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ backgroundColor: colors.hero, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.gutter, minHeight: 44 }}>
        <View style={{ width: 44 }}>
          {index > 0 && !busy && <HeaderButton icon="chevron-back" label="Previous setup step" onPress={() => go(index - 1)} />}
        </View>
        <Text accessibilityRole="header" style={{ flex: 1, color: colors.textMuted, fontSize: font.size.md, textAlign: 'center' }}>
          {index + 1} of {STEPS.length} · {STEPS[index]}
        </Text>
        <View style={{ width: 44 }} />
      </View>
      <View accessible={false} style={{ flexDirection: 'row', gap: 6, paddingHorizontal: spacing.gutter, marginTop: 8 }}>
        {STEPS.map((step, i) => (
          <View key={step} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= index ? colors.primary : colors.surfaceAlt }} />
        ))}
      </View>
      </View>
      <ScrollView ref={scrollRef} contentContainerStyle={{ flexGrow: 1, paddingHorizontal: spacing.gutter, paddingTop: 28, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        {!ready ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            {status === 'offline' ? (
              <><Muted>We couldn’t load your saved settings.</Muted><Button label="Try again" onPress={reload} fullWidth={false} /></>
            ) : (
              <><ActivityIndicator color={colors.primary} /><Muted>Loading your settings…</Muted></>
            )}
          </View>
        ) : (
          <>
            {index === 0 && (
              <>
                <Text style={{ color: colors.textMuted, fontSize: font.size.sm, fontWeight: font.weight.medium, marginBottom: 12 }}>A BOUNDARY WORTH SETTING</Text>
                <H1>Connect your Instagram.</H1>
                <Muted style={{ marginTop: 10 }}>More room for the good comments. Let toxoff handle the harmful ones in the background.</Muted>
                <Card style={{ marginTop: 28, gap: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <PlatformIcon platform="instagram" size={24} withBackground />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: font.size.lg, fontWeight: font.weight.semibold }}>Instagram</Text>
                      <Text style={{ color: colors.textMuted, fontSize: font.size.md, marginTop: 3 }}>Comments on your posts and reels</Text>
                    </View>
                  </View>
                  {connectedAccount ? (
                    <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="checkmark-circle" color={colors.success} size={22} />
                      <Text style={{ color: colors.text, fontSize: font.size.md, flex: 1 }}>{connectedAccount.handle} connected</Text>
                    </View>
                  ) : (
                    <>
                      <Button label="Connect Instagram" onPress={connect} loading={connecting} disabled={busy || atLimit} />
                      {atLimit && <Muted>Your plan’s account slots are in use. Manage connections from Home after setup.</Muted>}
                    </>
                  )}
                </Card>
                <View accessibilityLabel="TikTok. Coming soon, unavailable." style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18, paddingHorizontal: 4 }}>
                  <PlatformIcon platform="tiktok" size={18} withBackground />
                  <Text style={{ flex: 1, color: colors.textMuted, fontSize: font.size.md }}>TikTok</Text>
                  <Text style={{ color: colors.neutral, fontSize: font.size.sm }}>Coming soon</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 26 }}>
                  <Ionicons name="lock-closed-outline" size={20} color={colors.info} />
                  <Text style={{ flex: 1, color: colors.info, fontSize: font.size.md, lineHeight: 22 }}>
                    toxoff can read, hide and restore comments, and delete them if you enable deletion. We never publish posts or access your DMs. Disconnect anytime.
                  </Text>
                </View>
              </>
            )}
            {index === 1 && (
              <>
                <H1>Your boundaries, your way.</H1>
                <Muted style={{ marginTop: 10 }}>Choose a protection level that feels right. Fine-tune it anytime in Filters.</Muted>
                <View accessibilityRole="radiogroup" style={{ gap: 12, marginTop: 24 }}>
                  {PROTECTION_LEVELS.map((option) => {
                    const selected = sensitivity === option.value;
                    return (
                      <Pressable key={option.value} onPress={() => { Haptics.selectionAsync().catch(() => {}); setSelectedSensitivity(option.value); }} disabled={busy}
                        accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: busy }}
                        accessibilityLabel={`${option.label}${option.value === DEFAULT_SENSITIVITY ? ', the default' : ''}. ${option.description}`}
                        style={({ pressed }) => ({ padding: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.hero : colors.card, flexDirection: 'row', gap: 12, opacity: pressed ? 0.8 : 1 })}>
                        <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={selected ? colors.primary : colors.textMuted} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.text, fontSize: font.size.lg, fontWeight: font.weight.semibold }}>{option.label}</Text>
                          {option.value === DEFAULT_SENSITIVITY && <Text style={{ color: colors.info, fontSize: font.size.sm, fontWeight: font.weight.semibold, marginTop: 2 }}>Default</Text>}
                          <Text style={{ color: colors.textMuted, fontSize: font.size.md, lineHeight: 21, marginTop: 6 }}>{option.description}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 20 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: font.size.lg, fontWeight: font.weight.medium }}>Include spam protection</Text>
                    <Text style={{ color: colors.textMuted, fontSize: font.size.md, marginTop: 4 }}>Catch scams, bots and unwanted promotions.</Text>
                  </View>
                  <Toggle accessibilityLabel="Include spam protection" value={spamEnabled} disabled={busy} onValueChange={setSpamProtection} />
                </View>
                <View style={{ backgroundColor: action === 'hide' ? colors.infoSoft : colors.warningSoft, borderWidth: 1, borderColor: action === 'hide' ? colors.infoBorder : colors.warningBorder, borderRadius: radius.md, padding: 16 }}>
                  <Text style={{ color: action === 'hide' ? colors.info : colors.warning, fontSize: font.size.md, lineHeight: 23 }}>
                    {action === 'auto'
                      ? `Clear abuse, where the AI is at least ${AUTO_DELETE_PERCENT}% sure, is deleted for good so you never have to read it. Everything else is hidden and can be restored from the Log. You can switch to hiding everything in Filters.`
                      : action === 'hide'
                        ? 'Flagged comments will be hidden, so you can restore them from the Log. Nothing is permanently deleted.'
                        : 'Every flagged comment will be permanently deleted. You can switch to hiding in Filters.'}
                  </Text>
                </View>
              </>
            )}
            {index === 2 && (
              <>
                <View style={{ width: 60, height: 60, borderRadius: radius.md, backgroundColor: colors.infoSoft, borderWidth: 1, borderColor: colors.infoBorder, alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
                  <Ionicons name="shield-checkmark-outline" size={32} color={colors.info} />
                </View>
                <H1>{connectedAccount ? 'Make room for the good comments.' : 'Your preferences are ready.'}</H1>
                <Muted style={{ marginTop: 10 }}>{connectedAccount ? 'Finish setup to save your protection preferences.' : 'Connect Instagram from Home when you’re ready. Protection starts once an account is connected.'}</Muted>
                <Card padded={false} style={{ marginTop: 26 }}>
                  <SummaryRow label="Instagram" value={connectedAccount?.handle ?? 'Not connected yet'} />
                  <RowSeparator inset={16} /><SummaryRow label="Protection" value={level.label} />
                  <RowSeparator inset={16} /><SummaryRow label="Spam protection" value={spamEnabled ? 'On' : 'Off'} />
                  <RowSeparator inset={16} /><SummaryRow label="Flagged comments" value={action === 'hide' ? 'Hidden · can be restored' : action === 'auto' ? 'Clear abuse deleted · permanent' : 'All deleted · permanent'} />
                </Card>
                <Text style={{ color: colors.textMuted, fontSize: font.size.md, lineHeight: 22, marginTop: 20 }}>Keywords and categories live in Filters. Choose what you see in the Log and when to receive notifications in Settings.</Text>
              </>
            )}
            <View style={{ flex: 1, minHeight: 28 }} />
            <View style={{ gap: 8 }}>
              {index === 0 ? (
                connectedAccount ? <Button label="Continue" onPress={() => go(1)} disabled={busy} /> : (
                  <Pressable accessibilityRole="button" disabled={busy} accessibilityState={{ disabled: busy }} onPress={() => go(1)} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.45 : 1 }}>
                    <Text style={{ color: colors.textMuted, fontSize: font.size.lg, fontWeight: font.weight.medium }}>Connect later</Text>
                  </Pressable>
                )
              ) : index === 1 ? <Button label="Continue" onPress={() => go(2)} disabled={busy} /> : <Button label="Finish setup" onPress={finish} loading={saving} disabled={busy} />}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  const { colors, font } = useTheme();
  return (
    <View style={{ padding: 16, gap: 4 }}>
      <Text style={{ color: colors.textMuted, fontSize: font.size.sm }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: font.size.lg, fontWeight: font.weight.medium }}>{value}</Text>
    </View>
  );
}
