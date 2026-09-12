import React, { useMemo, useState } from 'react';
import { Alert, FlatList, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FilterChip } from '../../src/components/FilterChip';
import { LogRow } from '../../src/components/LogRow';
import { EmptyState, Segmented } from '../../src/components/ui';
import { useModeration } from '../../src/context/ModerationContext';
import { REASON_LABELS } from '../../src/data/mockData';
import { DAY_MS } from '../../src/lib/time';
import { useTheme } from '../../src/theme/ThemeContext';
import { ModerationReason, Platform } from '../../src/types';

type DateRange = 'today' | 'week' | 'month' | 'all';
const RANGE_MS: Record<DateRange, number> = {
  today: DAY_MS,
  week: 7 * DAY_MS,
  month: 30 * DAY_MS,
  all: Number.MAX_SAFE_INTEGER,
};

const REASONS: ModerationReason[] = [
  'hate_speech',
  'harassment',
  'slurs',
  'spam',
  'self_harm',
  'toxicity',
];

export default function Log() {
  const { colors, font } = useTheme();
  const { comments, restoreComment } = useModeration();

  const [platform, setPlatform] = useState<Platform | 'all'>('all');
  const [reason, setReason] = useState<ModerationReason | 'all'>('all');
  const [range, setRange] = useState<DateRange>('all');

  const restore = (id: string) =>
    restoreComment(id).catch((e: any) =>
      Alert.alert('Could not restore comment', e?.message ?? 'Please try again.')
    );

  const filtered = useMemo(() => {
    const now = Date.now();
    return comments.filter((c) => {
      if (platform !== 'all' && c.platform !== platform) return false;
      if (reason !== 'all' && c.reason !== reason) return false;
      if (now - new Date(c.createdAt).getTime() > RANGE_MS[range]) return false;
      return true;
    });
  }, [comments, platform, reason, range]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 }}>
        <Text style={{ color: colors.text, fontSize: font.size.xxl, fontWeight: font.weight.heavy }}>
          Moderation log
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: font.size.md, marginTop: 2 }}>
          {filtered.length} removed {filtered.length === 1 ? 'comment' : 'comments'}
        </Text>
      </View>

      {/* Filters */}
      <View style={{ paddingTop: 8 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
        >
          <FilterChip label="All platforms" active={platform === 'all'} onPress={() => setPlatform('all')} />
          <FilterChip label="Instagram" active={platform === 'instagram'} onPress={() => setPlatform('instagram')} />
          <FilterChip label="TikTok" active={platform === 'tiktok'} onPress={() => setPlatform('tiktok')} />
        </ScrollView>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingTop: 8 }}
        >
          <FilterChip label="All reasons" active={reason === 'all'} onPress={() => setReason('all')} />
          {REASONS.map((r) => (
            <FilterChip
              key={r}
              label={REASON_LABELS[r]}
              active={reason === r}
              onPress={() => setReason((cur) => (cur === r ? 'all' : r))}
            />
          ))}
        </ScrollView>

        <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
          <Segmented<DateRange>
            value={range}
            onChange={setRange}
            options={[
              { label: 'Today', value: 'today' },
              { label: 'Week', value: 'week' },
              { label: 'Month', value: 'month' },
              { label: 'All', value: 'all' },
            ]}
          />
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => <LogRow comment={item} onRestore={restore} />}
        contentContainerStyle={{ padding: 20, gap: 10, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon="search-outline"
            title="No comments match"
            subtitle="Try widening your filters or date range to see more of your moderation history."
          />
        }
      />
    </SafeAreaView>
  );
}
