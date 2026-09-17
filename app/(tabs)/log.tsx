import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useMemo, useState } from 'react';
import { Alert, FlatList, LayoutAnimation, Pressable, View } from 'react-native';
import { Text } from '../../src/components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FilterChip } from '../../src/components/FilterChip';
import { LogRow } from '../../src/components/LogRow';
import { OfflineBanner, SkeletonLogRows } from '../../src/components/Skeleton';
import { useRouter } from 'expo-router';
import { AdSlot } from '../../src/components/AdSlot';
import { Button, Card, EmptyState, ScreenTitle, Segmented } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { useModeration } from '../../src/context/ModerationContext';
import { REASON_LABELS } from '../../src/data/mockData';
import { getPlan } from '../../src/data/plans';
import { DAY_MS } from '../../src/lib/time';
import { useTheme } from '../../src/theme/ThemeContext';
import { ModerationReason, Platform } from '../../src/types';

// The screen has one primary control, the Hidden / Deleted switch. Hidden comments can be read and
// restored. Deleted ones are gone from the platform; that section keeps their words out of sight
// and offers to erase them from the log for good, unread. Filters live in a panel that stays
// closed until needed, with a one-line summary of what's applied.
type Section = 'hidden' | 'deleted';

type DateRange = 'all' | 'today' | 'week' | 'month';
const RANGE_MS: Record<DateRange, number> = {
  all: Number.MAX_SAFE_INTEGER,
  today: DAY_MS,
  week: 7 * DAY_MS,
  month: 30 * DAY_MS,
};
const RANGE_LABEL: Record<DateRange, string> = {
  all: 'All time',
  today: 'Today',
  week: 'This week',
  month: 'This month',
};

const PLATFORM_LABEL: Record<Platform, string> = { instagram: 'Instagram', tiktok: 'TikTok' };

const REASONS: ModerationReason[] = [
  'hate_speech',
  'harassment',
  'slurs',
  'spam',
  'self_harm',
  'toxicity',
];

export default function Log() {
  const { colors, font, radius, spacing } = useTheme();
  const router = useRouter();
  const { subscription } = useAuth();
  const { status, reload, comments, concealed, restoreComment, eraseDeletedComments } = useModeration();
  const historyDays = getPlan(subscription.plan).logHistoryDays;

  const [section, setSection] = useState<Section>('hidden');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform | 'all'>('all');
  const [reason, setReason] = useState<ModerationReason | 'all'>('all');
  const [range, setRange] = useState<DateRange>('all');
  const [erasing, setErasing] = useState(false);

  const restore = (id: string) =>
    restoreComment(id).catch((e: any) =>
      Alert.alert('Could not restore comment', e?.message ?? 'Please try again.')
    );

  const inSection = useMemo(
    () => comments.filter((c) => (c.action === 'deleted') === (section === 'deleted')),
    [comments, section]
  );
  const deletedCount = useMemo(() => comments.filter((c) => c.action === 'deleted').length, [comments]);
  const hiddenCount = comments.length - deletedCount;

  const filtered = useMemo(() => {
    const now = Date.now();
    return inSection.filter((c) => {
      if (platform !== 'all' && c.platform !== platform) return false;
      if (reason !== 'all' && c.reason !== reason) return false;
      if (now - new Date(c.createdAt).getTime() > RANGE_MS[range]) return false;
      return true;
    });
  }, [inSection, platform, reason, range]);

  const activeFilters = [
    platform !== 'all' ? PLATFORM_LABEL[platform] : null,
    reason !== 'all' ? REASON_LABELS[reason] : null,
    range !== 'all' ? RANGE_LABEL[range] : null,
  ].filter((x): x is string => x !== null);

  const clearFilters = () => {
    setPlatform('all');
    setReason('all');
    setRange('all');
  };

  const toggleFilters = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Haptics.selectionAsync().catch(() => {});
    setFiltersOpen((o) => !o);
  };

  // Erasing is permanent, so it always asks first. ids missing = every deleted comment.
  const confirmErase = (ids?: string[]) => {
    const count = ids ? ids.length : deletedCount;
    if (!count) return;
    const noun = count === 1 ? 'this deleted comment' : `${count} deleted comments`;
    Alert.alert(
      `Erase ${noun} forever?`,
      'The words and who wrote them are wiped from your log permanently, unread. Your totals on Home still count them.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Erase forever',
          style: 'destructive',
          onPress: () => {
            setErasing(true);
            eraseDeletedComments(ids)
              .catch((e: any) => Alert.alert('Could not erase', e?.message ?? 'Please try again.'))
              .finally(() => setErasing(false));
          },
        },
      ]
    );
  };

  const plural = (n: number) => (n === 1 ? 'comment' : 'comments');
  const subtitle =
    activeFilters.length && filtered.length !== inSection.length
      ? `${filtered.length} of ${inSection.length} ${section} ${plural(inSection.length)}`
      : `${inSection.length} ${section} ${plural(inSection.length)}`;

  const Label = ({ children }: { children: string }) => (
    <Text
      style={{
        color: colors.textMuted,
        fontSize: font.size.xs,
        fontWeight: font.weight.semibold,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        marginBottom: 8,
      }}
    >
      {children}
    </Text>
  );

  const filterPanel = filtersOpen ? (
          <Card style={{ marginBottom: 4, gap: 16 }}>
            <View>
              <Label>Platform</Label>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <FilterChip label="All" active={platform === 'all'} onPress={() => setPlatform('all')} />
                {(Object.keys(PLATFORM_LABEL) as Platform[]).map((p) => (
                  <FilterChip key={p} label={PLATFORM_LABEL[p]} active={platform === p} onPress={() => setPlatform(p)} />
                ))}
              </View>
            </View>
            <View>
              <Label>Reason</Label>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <FilterChip label="All" active={reason === 'all'} onPress={() => setReason('all')} />
                {REASONS.map((r) => (
                  <FilterChip key={r} label={REASON_LABELS[r]} active={reason === r} onPress={() => setReason(r)} />
                ))}
              </View>
            </View>
            <View>
              <Label>Period</Label>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {(Object.keys(RANGE_LABEL) as DateRange[]).map((r) => (
                  <FilterChip key={r} label={RANGE_LABEL[r]} active={range === r} onPress={() => setRange(r)} />
                ))}
              </View>
            </View>
          </Card>
  ) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.gutter }}>
        <ScreenTitle title="Moderation log" subtitle={subtitle} />

        {/* The one primary control */}
        <View style={{ marginTop: 14 }}>
          <Segmented<Section>
            value={section}
            onChange={setSection}
            options={[
              { label: `Hidden · ${hiddenCount}`, value: 'hidden' },
              { label: `Deleted · ${deletedCount}`, value: 'deleted' },
            ]}
          />
        </View>

        {/* Filters: a summary line, and a panel that opens on demand */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, minHeight: 36 }}>
          <Pressable
            onPress={toggleFilters}
            accessibilityRole="button"
            accessibilityState={{ expanded: filtersOpen }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: radius.pill,
              backgroundColor: filtersOpen || activeFilters.length ? colors.primarySoft : colors.surfaceAlt,
              borderWidth: 1,
              borderColor: filtersOpen || activeFilters.length ? colors.primary : colors.border,
            }}
          >
            <Ionicons name="options-outline" size={16} color={activeFilters.length || filtersOpen ? colors.primary : colors.textMuted} />
            <Text
              style={{
                color: activeFilters.length || filtersOpen ? colors.primary : colors.textMuted,
                fontSize: font.size.sm,
                fontWeight: font.weight.semibold,
              }}
            >
              {activeFilters.length ? `Filters · ${activeFilters.length}` : 'Filters'}
            </Text>
            <Ionicons name={filtersOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textFaint} />
          </Pressable>
          <Text numberOfLines={1} style={{ flex: 1, color: colors.textFaint, fontSize: font.size.sm }}>
            {activeFilters.length ? activeFilters.join(' · ') : 'All platforms · All reasons · All time'}
          </Text>
          {activeFilters.length > 0 && (
            <Pressable onPress={clearFilters} hitSlop={10} accessibilityRole="button">
              <Text style={{ color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.semibold }}>
                Clear
              </Text>
            </Pressable>
          )}
        </View>

      </View>

      <FlatList
        data={filtered}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => (
          <LogRow comment={item} conceal={concealed(item)} onRestore={restore} onErase={(id) => confirmErase([id])} />
        )}
        contentContainerStyle={{ padding: spacing.gutter, gap: 10, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {status === 'offline' && (
              <View style={{ marginBottom: 4 }}>
                <OfflineBanner onRetry={reload} />
              </View>
            )}
            {filterPanel}
            {section === 'deleted' && deletedCount > 0 && (
            <Card style={{ marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                <Ionicons name="heart-outline" size={22} color={colors.primary} style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: font.size.md, fontWeight: font.weight.semibold }}>
                    You don’t need to read these
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: font.size.sm, marginTop: 4, lineHeight: 19 }}>
                    toxoff already deleted them from your account. Their words are kept out of sight here.
                    Erase them from your log for good, unread, and move on.
                  </Text>
                </View>
              </View>
              <View style={{ marginTop: 14 }}>
                <Button
                  label={`Erase all ${deletedCount} forever`}
                  variant="danger"
                  size="md"
                  icon="flame-outline"
                  loading={erasing}
                  onPress={() => confirmErase()}
                />
              </View>
            </Card>
            )}
          </>
        }
        ListFooterComponent={
          <>
            {historyDays !== null && status === 'ready' && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Showing the last ${historyDays} days. Upgrade to keep your full history.`}
                onPress={() => router.push('/paywall')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, padding: 14, backgroundColor: colors.hero, borderLeftWidth: 3, borderLeftColor: colors.border, borderRadius: radius.sm }}
              >
                <Ionicons name="time-outline" size={18} color={colors.textMuted} accessible={false} />
                <Text style={{ color: colors.textMuted, fontSize: font.size.sm, flex: 1, lineHeight: 20 }}>
                  Showing the last {historyDays} days. <Text style={{ color: colors.primary, fontWeight: font.weight.semibold }}>Upgrade</Text> to keep your full history.
                </Text>
              </Pressable>
            )}
            <AdSlot placement="log_banner" />
          </>
        }
        ListEmptyComponent={
          status !== 'ready' && comments.length === 0 ? (
            <SkeletonLogRows /> // still loading, or failed before anything arrived
          ) : inSection.length === 0 ? (
            section === 'deleted' ? (
              <EmptyState
                icon="shield-checkmark-outline"
                title="Nothing deleted"
                subtitle="Comments toxoff deletes for you show up here, unread, so you can erase them for good without ever seeing them."
              />
            ) : (
              <EmptyState
                icon="shield-checkmark-outline"
                title="Nothing hidden yet"
                subtitle="Comments toxoff hides show up here. You can read them and restore any removed by mistake."
              />
            )
          ) : (
            <View style={{ gap: 12 }}>
              <EmptyState
                icon="search-outline"
                title="No comments match"
                subtitle={`None of your ${inSection.length} ${section} ${plural(inSection.length)} match these filters.`}
              />
              <View style={{ alignSelf: 'center' }}>
                <Button label="Clear filters" variant="secondary" size="sm" fullWidth={false} onPress={clearFilters} />
              </View>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}
