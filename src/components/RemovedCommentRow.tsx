import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { timeAgo } from '../lib/time';
import { RemovedComment } from '../types';
import { LIST_ROW, ReasonBadge } from './ui';

/** Compact single-line preview used in the dashboard live feed. */
export function RemovedCommentRow({ comment, concealed }: { comment: RemovedComment; concealed: boolean }) {
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
      <View style={{ flex: 1 }}>
        {concealed ? (
          // Removed for the user: they don't need to read it. The Log has it if they want to.
          <Text
            style={{ color: colors.text, fontSize: font.size.md, lineHeight: 22, fontWeight: font.weight.medium }}
          >
            {comment.action === 'deleted' ? 'Comment deleted' : 'Comment hidden'}
          </Text>
        ) : (
          <Text numberOfLines={2} style={{ color: colors.text, fontSize: font.size.md, lineHeight: 20 }}>
            {comment.text}
          </Text>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <ReasonBadge reason={comment.reason} />
          <Text style={{ color: colors.textMuted, fontSize: font.size.sm, flexShrink: 1 }}>
            {[comment.language, timeAgo(comment.createdAt)].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>
    </View>
  );
}
