import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Text, useBodyFontFamily } from '../../src/components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Card,
  LIST_ROW,
  RowIcon,
  RowSeparator,
  ScreenTitle,
  SectionLabel,
  Segmented,
  Toggle,
} from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { useModeration } from '../../src/context/ModerationContext';
import { AUTO_DELETE_PERCENT, getPlan, PAID_PLANS } from '../../src/data/plans';
import { useTheme } from '../../src/theme/ThemeContext';
import { CategoryKey, FlaggedAction, Plan, Sensitivity } from '../../src/types';

const plansWith = (feature: 'keywordBlocklist' | 'blockedUsers') =>
  PAID_PLANS.filter((p: Plan) => p[feature])
    .map((p) => p.name)
    .join(' and ');

const CATEGORIES: { key: CategoryKey; label: string; desc: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'hate_speech', label: 'Hate speech', desc: 'Attacks based on identity', icon: 'megaphone-outline' },
  { key: 'harassment', label: 'Harassment', desc: 'Targeted bullying & threats', icon: 'warning-outline' },
  { key: 'slurs', label: 'Slurs', desc: 'Explicit slurs & insults', icon: 'ban-outline' },
  { key: 'spam', label: 'Spam', desc: 'Scams, links & bots (off by default)', icon: 'mail-unread-outline' },
  { key: 'self_harm', label: 'Self-harm promotion', desc: 'Encouraging self-harm', icon: 'medkit-outline' },
];

const ACTION_HINT: Record<FlaggedAction, string> = {
  hide: 'Hide flagged comments on Instagram. You can restore them from the Log.',
  auto: `Permanently delete toxic comments when the AI is at least ${AUTO_DELETE_PERCENT}% confident. Hide the rest, including spam.`,
  delete: 'Permanently delete every flagged comment, including spam. Deleted comments cannot be restored.',
};

const ACTION_OPTIONS: { value: FlaggedAction; label: string; note: string }[] = [
  { value: 'hide', label: 'Hide comments', note: 'Can be restored' },
  { value: 'auto', label: 'Delete clear abuse', note: `Permanent above ${AUTO_DELETE_PERCENT}% confidence` },
  { value: 'delete', label: 'Delete all flagged comments', note: 'Permanent for every flagged comment · Default' },
];

const SENSITIVITY_HINT: Record<Sensitivity, string> = {
  low: 'Only removes clearly toxic comments. Fewest false positives.',
  medium: 'Balanced. Catches insults and bullying, allows criticism.',
  high: 'The default. Aggressively removes borderline comments. May catch more.',
};

export default function Filters() {
  const { colors, font, radius, spacing } = useTheme();
  const fontFamily = useBodyFontFamily();
  const router = useRouter();
  const plan = getPlan(useAuth().subscription.plan);
  const {
    filters,
    setSensitivity,
    setFlaggedAction,
    toggleCategory,
    addKeyword,
    removeKeyword,
    addBlockedUser,
    removeBlockedUser,
  } = useModeration();

  // Both deletion modes can permanently remove comments, so each requires an explicit choice.
  const chooseAction = (action: FlaggedAction) => {
    if (action === filters.flaggedAction) return;
    if (action === 'hide') {
      setFlaggedAction(action);
      return;
    }
    Alert.alert(
      action === 'auto' ? 'Permanently delete clear abuse?' : 'Permanently delete every flagged comment?',
      action === 'auto'
        ? `toxoff will permanently delete toxic comments when the AI is at least ${AUTO_DELETE_PERCENT}% confident. Spam and lower-confidence comments will be hidden. Deleted comments cannot be restored, even if the AI makes a mistake.`
        : 'toxoff will permanently delete every flagged comment from Instagram, including spam and borderline comments. Deleted comments cannot be restored, even if the AI makes a mistake.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Enable permanent deletion', style: 'destructive', onPress: () => setFlaggedAction(action) },
      ]
    );
  };

  const [keyword, setKeyword] = useState('');
  const [blockedUser, setBlockedUser] = useState('');

  const submitKeyword = () => {
    addKeyword(keyword);
    setKeyword('');
  };
  const submitUser = () => {
    addBlockedUser(blockedUser);
    setBlockedUser('');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: spacing.gutter, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ScreenTitle title="Filters" subtitle="Tune what toxoff removes for you." />

          {/* Sensitivity */}
          <View style={{ marginTop: spacing.xl }}>
            <SectionLabel>Sensitivity</SectionLabel>
            <Segmented<Sensitivity>
              value={filters.sensitivity}
              onChange={setSensitivity}
              options={[
                { label: 'Low', value: 'low' },
                { label: 'Medium', value: 'medium' },
                { label: 'High', value: 'high' },
              ]}
            />
            <Text style={{ color: colors.info, fontSize: font.size.sm, marginTop: 10, lineHeight: 19 }}>
              {SENSITIVITY_HINT[filters.sensitivity]}
            </Text>
          </View>

          {/* What happens to a flagged comment */}
          <View style={{ marginTop: spacing.xl }}>
            <SectionLabel>When a comment is flagged</SectionLabel>
            <View accessibilityRole="radiogroup" style={{ gap: 10 }}>
              {ACTION_OPTIONS.map((option) => {
                const selected = option.value === filters.flaggedAction;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`${option.label}. ${option.note}. ${ACTION_HINT[option.value]}`}
                    accessibilityHint={option.value === 'hide' ? 'Switch to reversible hiding' : 'Opens a confirmation before enabling permanent deletion'}
                    onPress={() => chooseAction(option.value)}
                    style={({ pressed }) => ({
                      flexDirection: 'row', gap: 12, padding: 16, borderRadius: radius.lg,
                      backgroundColor: selected ? colors.primarySoft : colors.card,
                      borderWidth: 1.5, borderColor: selected ? colors.primary : colors.border,
                      opacity: pressed ? 0.8 : 1,
                    })}
                  >
                    <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} color={selected ? colors.primary : colors.textMuted} size={22} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: font.size.md, fontWeight: font.weight.semibold }}>{option.label}</Text>
                      <Text style={{ color: option.value === 'hide' ? colors.info : colors.warning, fontSize: font.size.sm, marginTop: 3 }}>{option.note}</Text>
                      {selected && (
                        <View style={{
                          backgroundColor: option.value === 'hide' ? colors.infoSoft : colors.warningSoft,
                          borderColor: option.value === 'hide' ? colors.infoBorder : colors.warningBorder,
                          borderWidth: 1, borderRadius: radius.md, padding: 12, marginTop: 8,
                        }}>
                          <Text style={{ color: option.value === 'hide' ? colors.info : colors.warning, fontSize: font.size.sm, lineHeight: 19 }}>{ACTION_HINT[option.value]}</Text>
                        </View>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Categories */}
          <View style={{ marginTop: spacing.xl }}>
            <SectionLabel>Categories</SectionLabel>
            <Card padded={false}>
              {CATEGORIES.map((c, i) => (
                <React.Fragment key={c.key}>
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
                      <View
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 9,
                          backgroundColor: colors.infoSoft,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Ionicons name={c.icon} size={17} color={colors.info} />
                      </View>
                    </RowIcon>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: font.size.md, fontWeight: font.weight.medium }}>
                        {c.label}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: font.size.xs, marginTop: 1 }}>
                        {c.desc}
                      </Text>
                    </View>
                    <Toggle
                      accessibilityLabel={`${c.label} protection`}
                      accessibilityHint={c.desc}
                      value={filters.categories[c.key]}
                      onValueChange={() => {
                        Haptics.selectionAsync().catch(() => {});
                        toggleCategory(c.key);
                      }}
                    />
                  </View>
                </React.Fragment>
              ))}
            </Card>
          </View>

          {/* Keyword blocklist */}
          <View style={{ marginTop: spacing.xl }}>
            <SectionLabel>Keyword blocklist</SectionLabel>
            {!plan.keywordBlocklist ? (
              <LockedFeature
                description="Always remove comments containing words or phrases you choose."
                availableOn={plansWith('keywordBlocklist')}
                savedCount={filters.keywords.length}
                savedNoun="keyword"
                onUpgrade={() => router.push('/paywall')}
              />
            ) : (
              <>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View
                    style={{
                      flex: 1,
                      backgroundColor: colors.surfaceAlt,
                      borderRadius: radius.md,
                      paddingHorizontal: 14,
                      minHeight: 50,
                      paddingVertical: 10,
                      justifyContent: 'center',
                    }}
                  >
                    <TextInput
                      accessibilityLabel="Keyword to block"
                      value={keyword}
                      onChangeText={setKeyword}
                      onSubmitEditing={submitKeyword}
                      placeholder="Add a word or phrase"
                      placeholderTextColor={colors.textFaint}
                      autoCapitalize="none"
                      returnKeyType="done"
                      style={{ color: colors.text, fontFamily, fontSize: font.size.md }}
                    />
                  </View>
                  <AddButton label="Add blocked keyword" onPress={submitKeyword} />
                </View>
                <ChipList
                  items={filters.keywords}
                  onRemove={removeKeyword}
                  empty="No blocked keywords yet."
                />
              </>
            )}
          </View>

          {/* Blocked users */}
          <View style={{ marginTop: spacing.xl }}>
            <SectionLabel>Blocked users</SectionLabel>
            {!plan.blockedUsers ? (
              <LockedFeature
                description="Always remove every comment from specific accounts."
                availableOn={plansWith('blockedUsers')}
                savedCount={filters.blockedUsers.length}
                savedNoun="blocked user"
                onUpgrade={() => router.push('/paywall')}
              />
            ) : (
              <>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: colors.surfaceAlt,
                      borderRadius: radius.md,
                      paddingHorizontal: 14,
                      minHeight: 50,
                      paddingVertical: 10,
                    }}
                  >
                    <Text style={{ color: colors.textFaint, fontSize: font.size.md }}>@</Text>
                    <TextInput
                      accessibilityLabel="Username to block"
                      value={blockedUser}
                      onChangeText={setBlockedUser}
                      onSubmitEditing={submitUser}
                      placeholder="username"
                      placeholderTextColor={colors.textFaint}
                      autoCapitalize="none"
                      returnKeyType="done"
                      style={{ color: colors.text, fontFamily, fontSize: font.size.md, flex: 1, marginLeft: 2 }}
                    />
                  </View>
                  <AddButton label="Add blocked user" onPress={submitUser} />
                </View>
                <ChipList
                  items={filters.blockedUsers.map((u) => `@${u}`)}
                  onRemove={(label) => removeBlockedUser(label.replace(/^@/, ''))}
                  empty="No blocked users yet."
                />
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function LockedFeature({
  description,
  availableOn,
  savedCount,
  savedNoun,
  onUpgrade,
}: {
  description: string;
  availableOn: string;
  savedCount: number;
  savedNoun: string;
  onUpgrade: () => void;
}) {
  const { colors, font } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${description} Available on ${availableOn}. Upgrade to unlock.`} onPress={onUpgrade}>
      {/* Icon on the first line of text, action under the text: reads top to bottom at any length. */}
      <Card style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <Ionicons name="lock-closed" size={18} color={colors.info} style={{ marginTop: 1 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: font.size.sm, lineHeight: 19 }}>{description}</Text>
          <Text style={{ color: colors.info, fontSize: font.size.xs, marginTop: 4, lineHeight: 17 }}>
            Available on {availableOn}.
            {savedCount > 0 &&
              ` Your ${savedCount} saved ${savedNoun}${savedCount === 1 ? '' : 's'} will apply again when you upgrade.`}
          </Text>
          <Text
            style={{
              color: colors.primary,
              fontSize: font.size.sm,
              fontWeight: font.weight.semibold,
              marginTop: 10,
            }}
          >
            Upgrade to unlock
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

function AddButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={{
        width: 50,
        height: 50,
        borderRadius: radius.md,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name="add" size={26} color={colors.onPrimary} />
    </Pressable>
  );
}

function ChipList({
  items,
  onRemove,
  empty,
}: {
  items: string[];
  onRemove: (item: string) => void;
  empty: string;
}) {
  const { colors, font, radius } = useTheme();
  if (items.length === 0) {
    return (
      <Text style={{ color: colors.textMuted, fontSize: font.size.sm, marginTop: 12 }}>{empty}</Text>
    );
  }
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
      {items.map((item) => (
        <View
          key={item}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: colors.neutralSoft,
            borderColor: colors.neutralBorder,
            borderWidth: 1,
            paddingLeft: 12,
            paddingRight: 8,
            paddingVertical: 7,
            borderRadius: radius.pill,
          }}
        >
          <Text style={{ color: colors.neutral, fontSize: font.size.sm, fontWeight: font.weight.medium }}>
            {item}
          </Text>
          <Pressable
            onPress={() => onRemove(item)}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${item}`}
          >
            <Ionicons name="close-circle" size={17} color={colors.neutral} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}
