import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { LayoutAnimation, Platform, Pressable, UIManager, View } from 'react-native';
import { Text } from './AppText';
import { blurUsername, fullTimestamp, timeAgo } from '../lib/time';
import { useTheme } from '../theme/ThemeContext';
import { RemovedComment } from '../types';
import { PlatformIcon } from './PlatformIcon';
import { Badge, ReasonBadge } from './ui';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function LogRow({
  comment,
  onRestore,
  onErase,
  conceal,
}: {
  comment: RemovedComment;
  onRestore: (id: string) => void;
  /** Deleted comments only: wipe this one from the log for good. */
  onErase: (id: string) => void;
  /** Keep the words out of sight (the user's log visibility, ModerationContext.concealed). */
  conceal: boolean;
}) {
  const { colors, font } = useTheme();
  const [open, setOpen] = useState(false);
  // Concealed words stay out of sight unless the user asks: the comment was removed for them.
  const [revealed, setRevealed] = useState(false);
  const deleted = comment.action === 'deleted';
  const concealed = conceal && !revealed;
  const platformName = comment.platform === 'instagram' ? 'Instagram' : 'TikTok';

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Haptics.selectionAsync().catch(() => {});
    setOpen((o) => !o);
  };

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 14,
      }}
    >
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={concealed
          ? `${deleted ? 'Deleted' : 'Hidden'} comment from ${blurUsername(comment.username)}. ${comment.reason.replace(/_/g, ' ')}. ${timeAgo(comment.createdAt)}`
          : undefined}
        accessibilityHint={open ? 'Collapse comment details.' : 'Expand comment details.'}
        style={{ minHeight: 44 }}
      >
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <View style={{ paddingTop: 2 }}>
          <PlatformIcon platform={comment.platform} size={14} withBackground />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 12, rowGap: 4 }}>
            <Text style={{ color: colors.textMuted, fontSize: font.size.sm, fontWeight: font.weight.medium, flexShrink: 1, maxWidth: '100%' }}>
              {blurUsername(comment.username)}
            </Text>
            <Text style={{ color: colors.textFaint, fontSize: font.size.xs, flexShrink: 1, maxWidth: '100%' }}>
              {timeAgo(comment.createdAt)}
            </Text>
          </View>
          {concealed ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, padding: 10, backgroundColor: colors.filtered, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.filteredBorder, borderRadius: 6 }}>
              <Ionicons name="eye-off-outline" size={16} color={colors.neutral} />
              <Text style={{ color: colors.text, fontSize: font.size.md, flex: 1 }}>
                {deleted ? 'Deleted' : 'Hidden'} for you · not shown
              </Text>
            </View>
          ) : (
            <Text
              numberOfLines={open ? undefined : 1}
              style={{ color: colors.text, fontSize: font.size.md, marginTop: 4, lineHeight: 20 }}
            >
              {comment.text}
            </Text>
          )}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <ReasonBadge reason={comment.reason} />
            <Ionicons
              name={open ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.textFaint}
              style={{ marginLeft: 'auto' }}
            />
          </View>
        </View>
      </View>
      </Pressable>

      {open && (
        <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 0.5, borderTopColor: colors.border, gap: 10 }}>
          <DetailRow label="Posted on" value={comment.postRef} colors={colors} font={font} />
          {comment.language && (
            <DetailRow label="Language" value={comment.language} colors={colors} font={font} />
          )}
          <DetailRow
            label="AI confidence"
            value={`${Math.round(comment.confidence * 100)}%`}
            colors={colors}
            font={font}
          />
          <DetailRow
            label={deleted ? 'Deleted' : 'Hidden'}
            value={fullTimestamp(comment.createdAt)}
            colors={colors}
            font={font}
          />

          {deleted ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 4, padding: 12, borderRadius: 8, backgroundColor: colors.warningSoft }}>
                <Ionicons name="trash-outline" size={16} color={colors.warning} style={{ marginTop: 2 }} />
                <Text style={{ color: colors.warning, fontWeight: font.weight.semibold, fontSize: font.size.sm, flex: 1 }}>
                  Deleted from {platformName}. This can’t be undone.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Erase from log forever"
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                  onErase(comment.id);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  marginTop: 4,
                  minHeight: 44,
                  paddingHorizontal: 12,
                  paddingVertical: 11,
                  borderRadius: 10,
                  backgroundColor: colors.dangerSoft,
                }}
              >
                <Ionicons name="flame-outline" size={17} color={colors.danger} />
                <Text style={{ color: colors.danger, fontWeight: font.weight.semibold, fontSize: font.size.sm, flexShrink: 1, textAlign: 'center' }}>
                  Erase from log forever
                </Text>
              </Pressable>
              <Text style={{ color: colors.textFaint, fontSize: font.size.xs, textAlign: 'center' }}>
                Erasing wipes its words from your log. It still counts on Home.
              </Text>
            </>
          ) : comment.restored ? (
            <Badge label="Restored" tone="success" icon="arrow-undo" />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Restore comment"
              onPress={() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                onRestore(comment.id);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                marginTop: 4,
                minHeight: 44,
                paddingHorizontal: 12,
                paddingVertical: 11,
                borderRadius: 10,
                backgroundColor: colors.primarySoft,
              }}
            >
              <Ionicons name="arrow-undo-outline" size={17} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: font.weight.semibold, fontSize: font.size.sm, flexShrink: 1, textAlign: 'center' }}>
                Restore comment
              </Text>
            </Pressable>
          )}
          {!deleted && (
            <Text style={{ color: colors.textFaint, fontSize: font.size.xs, textAlign: 'center' }}>
              Removed by mistake? Restoring re-publishes it on {platformName}.
            </Text>
          )}
          {concealed && (
            <Pressable
              onPress={() => setRevealed(true)}
              accessibilityRole="button"
              accessibilityLabel="Read this comment anyway"
              style={{ alignSelf: 'center', maxWidth: '100%', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8 }}
            >
              <Text style={{ color: colors.textFaint, fontSize: font.size.xs, textAlign: 'center' }}>Read it anyway</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function DetailRow({
  label,
  value,
  colors,
  font,
}: {
  label: string;
  value: string;
  colors: any;
  font: any;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', columnGap: 12, rowGap: 4 }}>
      <Text style={{ color: colors.textMuted, fontSize: font.size.sm, flexShrink: 1 }}>{label}</Text>
      <Text
        style={{ color: colors.text, fontSize: font.size.sm, fontWeight: font.weight.medium, maxWidth: '100%', flexShrink: 1, textAlign: 'right' }}
      >
        {value}
      </Text>
    </View>
  );
}
