import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { LayoutAnimation, Platform, Pressable, Text, UIManager, View } from 'react-native';
import { blurUsername, fullTimestamp, timeAgo } from '../lib/time';
import { useTheme } from '../theme/ThemeContext';
import { RemovedComment } from '../types';
import { PlatformIcon } from './PlatformIcon';
import { ReasonBadge } from './ui';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function LogRow({
  comment,
  onRestore,
}: {
  comment: RemovedComment;
  onRestore: (id: string) => void;
}) {
  const { colors, font } = useTheme();
  const [open, setOpen] = useState(false);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Haptics.selectionAsync().catch(() => {});
    setOpen((o) => !o);
  };

  return (
    <Pressable
      onPress={toggle}
      style={{
        backgroundColor: colors.card,
        borderRadius: 14,
        borderWidth: 0.5,
        borderColor: colors.border,
        padding: 14,
      }}
    >
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <View style={{ paddingTop: 2 }}>
          <PlatformIcon platform={comment.platform} size={14} withBackground />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.textMuted, fontSize: font.size.sm, fontWeight: font.weight.medium }}>
              {blurUsername(comment.username)}
            </Text>
            <Text style={{ color: colors.textFaint, fontSize: font.size.xs }}>
              {timeAgo(comment.createdAt)}
            </Text>
          </View>
          <Text
            numberOfLines={open ? undefined : 1}
            style={{ color: colors.text, fontSize: font.size.md, marginTop: 4, lineHeight: 20 }}
          >
            {comment.text}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
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

      {open && (
        <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 0.5, borderTopColor: colors.border, gap: 10 }}>
          <DetailRow label="Posted on" value={comment.postRef} colors={colors} font={font} />
          <DetailRow label="Language" value={comment.language} colors={colors} font={font} />
          <DetailRow
            label="AI confidence"
            value={`${Math.round(comment.confidence * 100)}%`}
            colors={colors}
            font={font}
          />
          <DetailRow label="Removed" value={fullTimestamp(comment.createdAt)} colors={colors} font={font} />

          {comment.restored ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <Ionicons name="arrow-undo" size={16} color={colors.success} />
              <Text style={{ color: colors.success, fontWeight: font.weight.semibold, fontSize: font.size.sm }}>
                Restored
              </Text>
            </View>
          ) : (
            <Pressable
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
                paddingVertical: 11,
                borderRadius: 10,
                backgroundColor: colors.primarySoft,
              }}
            >
              <Ionicons name="arrow-undo-outline" size={17} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: font.weight.semibold, fontSize: font.size.sm }}>
                Restore comment
              </Text>
            </Pressable>
          )}
          <Text style={{ color: colors.textFaint, fontSize: font.size.xs, textAlign: 'center' }}>
            Removed by mistake? Restoring re-publishes it on {comment.platform === 'instagram' ? 'Instagram' : 'TikTok'}.
          </Text>
        </View>
      )}
    </Pressable>
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
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ color: colors.textMuted, fontSize: font.size.sm }}>{label}</Text>
      <Text
        style={{ color: colors.text, fontSize: font.size.sm, fontWeight: font.weight.medium, maxWidth: '60%' }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}
