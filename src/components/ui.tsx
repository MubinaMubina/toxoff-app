import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';

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
  const heights = { lg: 54, md: 46, sm: 38 };
  const fonts = { lg: font.size.lg, md: font.size.md, sm: font.size.sm };

  const bg = {
    primary: colors.primary,
    secondary: colors.primarySoft,
    ghost: 'transparent',
    danger: colors.dangerSoft,
  }[variant];

  const fg = {
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
      style={({ pressed }) => [
        {
          height: heights[size],
          borderRadius: radius.md,
          backgroundColor: bg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingHorizontal: 20,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          borderWidth: variant === 'ghost' ? 1 : 0,
          borderColor: colors.border,
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={fonts[size] + 3} color={fg} />}
          <Text style={{ color: fg, fontSize: fonts[size], fontWeight: font.weight.semibold }}>
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
          borderWidth: StyleSheet.hairlineWidth,
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
}: {
  label: string;
  color: string;
  bg: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { font } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: bg,
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: 999,
        alignSelf: 'flex-start',
      }}
    >
      {icon && <Ionicons name={icon} size={12} color={color} />}
      <Text style={{ color, fontSize: font.size.xs, fontWeight: font.weight.semibold }}>
        {label}
      </Text>
    </View>
  );
}

const REASON_TONE: Record<string, 'danger' | 'warning' | 'primary' | 'muted'> = {
  hate_speech: 'danger',
  harassment: 'warning',
  slurs: 'danger',
  spam: 'muted',
  self_harm: 'danger',
  toxicity: 'primary',
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
  const { colors } = useTheme();
  const tone = REASON_TONE[reason] ?? 'muted';
  const map = {
    danger: [colors.danger, colors.dangerSoft],
    warning: [colors.warning, colors.warningSoft],
    primary: [colors.primary, colors.primarySoft],
    muted: [colors.textMuted, colors.surfaceAlt],
  }[tone];
  return <Badge label={REASON_TEXT[reason] ?? reason} color={map[0]} bg={map[1]} />;
}

/* ---------------- Text helpers ---------------- */

export function H1({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const { colors, font } = useTheme();
  return (
    <Text style={[{ color: colors.text, fontSize: font.size.xxl, fontWeight: font.weight.heavy }, style]}>
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
    <Text style={[{ color: colors.textMuted, fontSize: font.size.md }, style]}>{children}</Text>
  );
}

// A section's uppercase label, with an optional link ("Manage", "See all") on the same baseline.
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
        marginBottom: 10,
      }}
    >
      <Text
        style={{
          color: colors.textMuted,
          fontSize: font.size.xs,
          fontWeight: font.weight.semibold,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
        }}
      >
        {children}
      </Text>
      {action && (
        // hitSlop brings the small link up to a 44pt tap target without moving the layout.
        <Pressable onPress={action.onPress} hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}>
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
        padding: 4,
        gap: 4,
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(opt.value);
            }}
            style={{
              flex: 1,
              paddingVertical: 9,
              borderRadius: radius.sm,
              backgroundColor: active ? colors.card : 'transparent',
              alignItems: 'center',
              shadowColor: '#000',
              shadowOpacity: active ? 0.06 : 0,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 1 },
              elevation: active ? 1 : 0,
            }}
          >
            <Text
              style={{
                color: active ? colors.text : colors.textMuted,
                fontWeight: active ? font.weight.semibold : font.weight.medium,
                fontSize: font.size.sm,
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
