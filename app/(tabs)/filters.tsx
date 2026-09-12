import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Card,
  LIST_ROW,
  RowIcon,
  RowSeparator,
  ScreenTitle,
  SectionLabel,
  Segmented,
} from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { useModeration } from '../../src/context/ModerationContext';
import { getPlan, PAID_PLANS } from '../../src/data/plans';
import { useTheme } from '../../src/theme/ThemeContext';
import { CategoryKey, Plan, Sensitivity } from '../../src/types';

const plansWith = (feature: 'keywordBlocklist' | 'blockedUsers') =>
  PAID_PLANS.filter((p: Plan) => p[feature])
    .map((p) => p.name)
    .join(' and ');

const CATEGORIES: { key: CategoryKey; label: string; desc: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'hate_speech', label: 'Hate speech', desc: 'Attacks based on identity', icon: 'megaphone-outline' },
  { key: 'harassment', label: 'Harassment', desc: 'Targeted bullying & threats', icon: 'warning-outline' },
  { key: 'slurs', label: 'Slurs', desc: 'Explicit slurs & insults', icon: 'ban-outline' },
  { key: 'spam', label: 'Spam', desc: 'Scams, links & bots', icon: 'mail-unread-outline' },
  { key: 'self_harm', label: 'Self-harm promotion', desc: 'Encouraging self-harm', icon: 'medkit-outline' },
];

const SENSITIVITY_HINT: Record<Sensitivity, string> = {
  low: 'Only removes clearly toxic comments. Fewest false positives.',
  medium: 'Balanced — recommended for most creators.',
  high: 'Aggressively removes borderline comments. May catch more.',
};

export default function Filters() {
  const { colors, font, radius, spacing } = useTheme();
  const router = useRouter();
  const plan = getPlan(useAuth().subscription.plan);
  const {
    filters,
    setSensitivity,
    toggleCategory,
    addKeyword,
    removeKeyword,
    addBlockedUser,
    removeBlockedUser,
  } = useModeration();

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
            <Text style={{ color: colors.textMuted, fontSize: font.size.sm, marginTop: 10, lineHeight: 19 }}>
              {SENSITIVITY_HINT[filters.sensitivity]}
            </Text>
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
                          backgroundColor: colors.surfaceAlt,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Ionicons name={c.icon} size={17} color={colors.primary} />
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
                    <Switch
                      value={filters.categories[c.key]}
                      onValueChange={() => {
                        Haptics.selectionAsync().catch(() => {});
                        toggleCategory(c.key);
                      }}
                      trackColor={{ false: colors.border, true: colors.primary }}
                      thumbColor="#fff"
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
                      height: 50,
                      justifyContent: 'center',
                    }}
                  >
                    <TextInput
                      value={keyword}
                      onChangeText={setKeyword}
                      onSubmitEditing={submitKeyword}
                      placeholder="Add a word or phrase"
                      placeholderTextColor={colors.textFaint}
                      autoCapitalize="none"
                      returnKeyType="done"
                      style={{ color: colors.text, fontSize: font.size.md }}
                    />
                  </View>
                  <AddButton onPress={submitKeyword} />
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
                      height: 50,
                    }}
                  >
                    <Text style={{ color: colors.textFaint, fontSize: font.size.md }}>@</Text>
                    <TextInput
                      value={blockedUser}
                      onChangeText={setBlockedUser}
                      onSubmitEditing={submitUser}
                      placeholder="username"
                      placeholderTextColor={colors.textFaint}
                      autoCapitalize="none"
                      returnKeyType="done"
                      style={{ color: colors.text, fontSize: font.size.md, flex: 1, marginLeft: 2 }}
                    />
                  </View>
                  <AddButton onPress={submitUser} />
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
    <Pressable onPress={onUpgrade}>
      {/* Icon on the first line of text, action under the text: reads top to bottom at any length. */}
      <Card style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <Ionicons name="lock-closed" size={18} color={colors.primary} style={{ marginTop: 1 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: font.size.sm, lineHeight: 19 }}>{description}</Text>
          <Text style={{ color: colors.textMuted, fontSize: font.size.xs, marginTop: 4, lineHeight: 17 }}>
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

function AddButton({ onPress }: { onPress: () => void }) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
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
      <Ionicons name="add" size={26} color="#fff" />
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
      <Text style={{ color: colors.textFaint, fontSize: font.size.sm, marginTop: 12 }}>{empty}</Text>
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
            backgroundColor: colors.primarySoft,
            paddingLeft: 12,
            paddingRight: 8,
            paddingVertical: 7,
            borderRadius: radius.pill,
          }}
        >
          <Text style={{ color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.medium }}>
            {item}
          </Text>
          <Pressable onPress={() => onRemove(item)} hitSlop={6}>
            <Ionicons name="close-circle" size={17} color={colors.primary} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}
