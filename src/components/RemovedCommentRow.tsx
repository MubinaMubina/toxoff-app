import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';
import { Text } from './AppText';
import { useTheme } from '../theme/ThemeContext';
import { getSemanticColors } from '../theme/colors';
import { timeAgo } from '../lib/time';
import { RemovedComment } from '../types';
import { LIST_ROW, reasonLabel, reasonTone, RowIcon } from './ui';

/**
 * One line of the dashboard feed, for use inside a list Card. Concealed rows name the reason,
 * never the words: the Log has the comment if the user wants it.
 */
export function RemovedCommentRow({ comment, concealed }: { comment: RemovedComment; concealed: boolean }) {
  const { colors, font } = useTheme();
  const tone = getSemanticColors(colors, reasonTone(comment.reason));
  const action = comment.action === 'deleted' ? 'Deleted' : 'Hidden';
  const detail = [concealed ? action : reasonLabel(comment.reason), comment.language].filter(Boolean).join(' · ');
  return (
    <View
      accessible
      accessibilityLabel={`${action}: ${reasonLabel(comment.reason)}${comment.language ? `, ${comment.language}` : ''}, ${timeAgo(comment.createdAt)}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: LIST_ROW.gap, paddingHorizontal: LIST_ROW.inset, paddingVertical: 12 }}
    >
      <RowIcon>
        <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: tone.background, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={comment.action === 'deleted' ? 'trash-outline' : 'eye-off-outline'} size={16} color={tone.text} />
        </View>
      </RowIcon>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: colors.text, fontSize: font.size.md, fontWeight: font.weight.semibold }}>
          {concealed ? reasonLabel(comment.reason) : comment.text}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: font.size.sm, marginTop: 2 }}>
          {detail}
        </Text>
      </View>
      <Text style={{ color: colors.textFaint, fontSize: font.size.sm }}>{timeAgo(comment.createdAt)}</Text>
    </View>
  );
}
