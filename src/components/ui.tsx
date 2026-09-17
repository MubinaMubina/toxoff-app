import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, TextStyle, View, ViewStyle } from 'react-native';
import { Text } from './AppText';
import { useTheme } from '../theme/ThemeContext';
import { BadgeTone, getSemanticColors, SemanticTone } from '../theme/colors';

/* ---------------- Button ---------------- */

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'lg' | 'md' | 'sm';
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
  loading,
  disabled,
  fullWidth = true,
  style,
}: ButtonProps) {
  const { colors, radius, font } = useTheme();
  const heights = { lg: 56, md: 48, sm: 44 };
  const fonts = { lg: font.size.lg, md: font.size.md, sm: font.size.sm };

  const bg = disabled ? colors.neutralSoft : {
    primary: colors.primary,
    secondary: colors.primarySoft,
    ghost: 'transparent',
    danger: colors.dangerSoft,
  }[variant];

  const fg = disabled ? colors.neutral : {
    primary: colors.onPrimary,
    secondary: colors.primary,
    ghost: colors.primary,
    danger: colors.danger,
  }[variant];

  return (
    <Pressable
      onPress={() => {
        if (disabled || loading) return;
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      // Small buttons keep their look but still get a 44pt tap target.
      hitSlop={Math.max(0, Math.ceil((44 - heights[size]) / 2))}
      style={({ pressed }) => [
        {
          minHeight: Math.max(44, heights[size]),
          borderRadius: radius.md,
          backgroundColor: bg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingHorizontal: 20,
          paddingVertical: 12,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          borderWidth: variant === 'ghost' || variant === 'secondary' ? 1 : 0,
          borderColor: colors.border,
          opacity: pressed && !disabled ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={fonts[size] + 3} color={fg} />}
          <Text style={{ color: fg, fontSize: fonts[size], fontWeight: font.weight.semibold, flexShrink: 1, textAlign: 'center' }}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/* ---------------- Card ---------------- */

export function Card({
  children,
  style,
  padded = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          padding: padded ? 16 : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/* ---------------- Header button ---------------- */

// Close / back for modal and onboarding screens: a 44pt box at the very top-left, where iOS puts
// the navigation bar's leading button. The negative margin cancels the glyph's built-in padding
// so its ink lines up with the screen gutter and the title below.
export function HeaderButton({
  icon,
  label,
  onPress,
}: {
  icon: 'close' | 'chevron-back';
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        justifyContent: 'center',
        marginLeft: -7,
        opacity: pressed ? 0.5 : 1,
      })}
    >
      <Ionicons name={icon} size={26} color={colors.text} />
    </Pressable>
  );
}

/* ---------------- List rows ---------------- */

// iOS-style grouped lists: rows inset like Card content, every leading icon centered in the
// same fixed slot so titles share one left edge, and separators that start at that edge.
export const LIST_ROW = { inset: 16, icon: 32, gap: 12 } as const;
const LIST_TEXT_INSET = LIST_ROW.inset + LIST_ROW.icon + LIST_ROW.gap;

export function RowIcon({ children }: { children: React.ReactNode }) {
  return <View style={{ width: LIST_ROW.icon, alignItems: 'center' }}>{children}</View>;
}

export function RowSeparator({ inset = LIST_TEXT_INSET }: { inset?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: inset }} />
  );
}

/** The disclosure indicator for rows that open another screen or a picker. */
export function Chevron() {
  const { colors } = useTheme();
  return <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />;
}

/* ---------------- Badge / Chip ---------------- */

export function Badge({
  label,
  color,
  bg,
  icon,
  tone = 'neutral',
}: {
  label: string;
  tone?: BadgeTone;
  color?: string;
  bg?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { colors, font, radius } = useTheme();
  const semantic = getSemanticColors(colors, tone);
  const foreground = color ?? semantic.text;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: bg ?? semantic.background,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: radius.pill,
        alignSelf: 'flex-start',
        maxWidth: '100%',
        flexShrink: 1,
      }}
    >
      {icon && <Ionicons name={icon} size={13} color={foreground} accessible={false} />}
      <Text style={{ color: foreground, fontSize: font.size.xs, fontWeight: font.weight.semibold, flexShrink: 1 }}>
        {label}
      </Text>
    </View>
  );
}

const REASON_TONE: Record<string, SemanticTone> = {
  hate_speech: 'danger',
  harassment: 'warning',
  slurs: 'danger',
  spam: 'info',
  self_harm: 'danger',
  toxicity: 'warning',
};

const REASON_TEXT: Record<string, string> = {
  hate_speech: 'Hate speech',
  harassment: 'Harassment',
  slurs: 'Slurs',
  spam: 'Spam',
  self_harm: 'Self-harm',
  toxicity: 'Toxicity',
};

export function ReasonBadge({ reason }: { reason: string }) {
  return <Badge label={REASON_TEXT[reason] ?? reason} tone={REASON_TONE[reason] ?? 'neutral'} />;
}

/* ---------------- Text helpers ---------------- */

/** A tab screen's title, at the iOS large-title size, with an optional line under it. */
export function ScreenTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  const { colors, font } = useTheme();
  return (
    <View>
      <Text accessibilityRole="header" style={{ color: colors.text, fontSize: font.size.huge, fontWeight: font.weight.semibold, letterSpacing: -1.4 }}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ color: colors.textMuted, fontSize: font.size.md, lineHeight: 23, marginTop: 6 }}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

export function H1({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const { colors, font } = useTheme();
  return (
    <Text accessibilityRole="header" style={[{ color: colors.text, fontSize: font.size.xxl, fontWeight: font.weight.semibold, letterSpacing: -1 }, style]}>
      {children}
    </Text>
  );
}

export function Muted({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  const { colors, font } = useTheme();
  return (
    <Text style={[{ color: colors.textMuted, fontSize: font.size.md, lineHeight: 24 }, style]}>{children}</Text>
  );
}

// A quiet section label, with an optional link on the same baseline.
export function SectionLabel({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: { label: string; onPress: () => void };
}) {
  const { colors, font } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 10,
      }}
    >
      <Text
        style={{
          color: colors.textMuted,
          fontSize: font.size.sm,
          fontWeight: font.weight.semibold,
          letterSpacing: 0.15,
        }}
      >
        {children}
      </Text>
      {action && (
        // hitSlop brings the small link up to a 44pt tap target without moving the layout.
        <Pressable accessibilityRole="button" onPress={action.onPress} hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}>
          <Text style={{ color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.semibold }}>
            {action.label}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/* ---------------- Segmented control ---------------- */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { colors, radius, font } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.surfaceAlt,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 4,
        gap: 4,
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={opt.label}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(opt.value);
            }}
            style={{
              flex: 1,
              minHeight: 44,
              paddingVertical: 9,
              paddingHorizontal: 6,
              borderRadius: radius.sm,
              backgroundColor: active ? colors.card : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: active ? colors.border : 'transparent',
            }}
          >
            <Text
              style={{
                color: active ? colors.text : colors.textMuted,
                fontWeight: active ? font.weight.semibold : font.weight.medium,
                fontSize: font.size.sm,
                textAlign: 'center',
                flexShrink: 1,
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------------- Empty state ---------------- */

export function EmptyState({
  icon = 'shield-checkmark-outline',
  title,
  subtitle,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
}) {
  const { colors, font } = useTheme();
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 32 }}>
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
        }}
      >
        <Ionicons name={icon} size={34} color={colors.primary} />
      </View>
      <Text
        style={{
          color: colors.text,
          fontSize: font.size.lg,
          fontWeight: font.weight.semibold,
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
      {subtitle && (
        <Text
          style={{
            color: colors.textMuted,
            fontSize: font.size.md,
            textAlign: 'center',
            marginTop: 6,
            lineHeight: 21,
          }}
        >
          {subtitle}
        </Text>
      )}
    </View>
  );
}
