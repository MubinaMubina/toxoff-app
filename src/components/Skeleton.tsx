import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, DimensionValue, Pressable, StyleProp, View, ViewStyle } from 'react-native';
import { Text } from './AppText';
import { useTheme } from '../theme/ThemeContext';
import { Card, LIST_ROW, RowSeparator } from './ui';

// Placeholders shown while the user's data loads (ModerationContext.status === 'loading'), so a
// slow connection shows the shape of the screen instead of empty states that look like "nothing
// here". One shared pulse keeps every block breathing in step.

const pulse = new Animated.Value(0.45);
let pulsing = false;
function startPulse() {
  if (pulsing) return;
  pulsing = true;
  Animated.loop(
    Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
    ])
  ).start();
}

export function Skeleton({
  width = '100%',
  height = 14,
  radius = 7,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const started = useRef(false);
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      startPulse();
    }
  }, []);
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: radius, backgroundColor: colors.surfaceAlt, opacity: pulse }, style]}
    />
  );
}

/** List rows the shape of an account or comment row: an icon tile and two lines of text. */
export function SkeletonRows({ count = 3, lines = 2 }: { count?: number; lines?: 1 | 2 }) {
  return (
    <Card padded={false}>
      {Array.from({ length: count }, (_, i) => (
        <React.Fragment key={i}>
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
            <Skeleton width={LIST_ROW.icon} height={LIST_ROW.icon} radius={10} />
            <View style={{ flex: 1, gap: 8 }}>
              <Skeleton width={i % 2 ? '55%' : '70%'} height={14} />
              {lines === 2 && <Skeleton width={i % 2 ? '35%' : '45%'} height={11} radius={5} />}
            </View>
          </View>
        </React.Fragment>
      ))}
    </Card>
  );
}

/** Stand-alone cards the shape of a Log row: author line, one line of text, a badge. */
export function SkeletonLogRows({ count = 4 }: { count?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 0.5, borderColor: colors.border, padding: 14 }}
        >
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <Skeleton width={28} height={28} radius={8} />
            <View style={{ flex: 1, gap: 9 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Skeleton width={90} height={12} radius={6} />
                <Skeleton width={48} height={10} radius={5} />
              </View>
              <Skeleton width={i % 2 ? '80%' : '95%'} height={14} />
              <Skeleton width={84} height={22} radius={11} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Shown when the user's data couldn't be loaded, with a way to try again. */
export function OfflineBanner({ onRetry, retrying }: { onRetry: () => void; retrying?: boolean }) {
  const { colors, font, radius } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 12,
        borderRadius: radius.md,
        backgroundColor: colors.warningSoft,
      }}
    >
      <Ionicons name="cloud-offline-outline" size={20} color={colors.warning} />
      <Text style={{ color: colors.text, fontSize: font.size.sm, flex: 1, lineHeight: 19 }}>
        Can’t refresh your account status right now. Check your connection and try again.
      </Text>
      <Pressable onPress={onRetry} disabled={retrying} hitSlop={10} accessibilityRole="button">
        <Text style={{ color: colors.warning, fontSize: font.size.sm, fontWeight: font.weight.semibold }}>
          {retrying ? 'Trying…' : 'Retry'}
        </Text>
      </Pressable>
    </View>
  );
}
