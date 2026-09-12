import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { timeAgo } from '../lib/time';
import { RemovedComment } from '../types';
import { PlatformIcon } from './PlatformIcon';
import { LIST_ROW, ReasonBadge, RowIcon } from './ui';

/** Compact single-line preview used in the dashboard live feed. */
export function RemovedCommentRow({ comment }: { comment: RemovedComment }) {
  const { colors, font } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: LIST_ROW.gap,
        paddingVertical: 12,
        paddingHorizontal: LIST_ROW.inset,
        alignItems: 'flex-start',
      }}
    >
      <RowIcon>
        <PlatformIcon platform={comment.platform} size={14} withBackground />
      </RowIcon>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={2} style={{ color: colors.text, fontSize: font.size.md, lineHeight: 20 }}>
          {comment.text}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 7 }}>
          <ReasonBadge reason={comment.reason} />
          <Text style={{ color: colors.textFaint, fontSize: font.size.xs }}>
            {[comment.language, timeAgo(comment.createdAt)].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>
    </View>
  );
}
