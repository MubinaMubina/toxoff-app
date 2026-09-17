import React, { createContext, forwardRef, useContext, useMemo } from 'react';
import { StyleSheet, Text as NativeText, TextProps, TextStyle } from 'react-native';

/** Static assets work offline in both the native app and Expo Go. */
export const MANROPE_FONTS = {
  'Manrope-Regular': require('../../assets/fonts/Manrope-Regular.ttf'),
  'Manrope-Medium': require('../../assets/fonts/Manrope-Medium.ttf'),
  'Manrope-SemiBold': require('../../assets/fonts/Manrope-SemiBold.ttf'),
  'Manrope-Bold': require('../../assets/fonts/Manrope-Bold.ttf'),
  'Manrope-ExtraBold': require('../../assets/fonts/Manrope-ExtraBold.ttf'),
} as const;

const AppFontContext = createContext(false);
type TextInheritance = { weight: TextStyle['fontWeight']; customFamily: boolean };
const TextInheritanceContext = createContext<TextInheritance | null>(null);

export function AppFontProvider({ loaded, children }: { loaded: boolean; children: React.ReactNode }) {
  return <AppFontContext.Provider value={loaded}>{children}</AppFontContext.Provider>;
}

/** Undefined deliberately uses the native system font if loading failed or timed out. */
export function useBodyFontFamily(): string | undefined {
  return useContext(AppFontContext) ? 'Manrope-Regular' : undefined;
}

function familyForWeight(weight: TextStyle['fontWeight']): keyof typeof MANROPE_FONTS {
  const numeric = weight === 'bold' ? 700 : Number(weight ?? 400);
  if (numeric >= 800) return 'Manrope-ExtraBold';
  if (numeric >= 700) return 'Manrope-Bold';
  if (numeric >= 600) return 'Manrope-SemiBold';
  if (numeric >= 500) return 'Manrope-Medium';
  return 'Manrope-Regular';
}

/**
 * Drop-in native Text: accessibility, Dynamic Type, refs, and all other props are unchanged.
 * Nested text inherits its parent's face unless it asks for a different weight or font family.
 */
export const Text = forwardRef<NativeText, TextProps>(function AppText({ style, ...props }, ref) {
  const loaded = useContext(AppFontContext);
  const parent = useContext(TextInheritanceContext);
  const flattened = StyleSheet.flatten(style);
  const hasCustomFamily = flattened?.fontFamily != null;
  const customFamily = hasCustomFamily || Boolean(parent?.customFamily);
  const weight = flattened?.fontWeight ?? parent?.weight;
  const inheritance = useMemo(() => ({ weight, customFamily }), [weight, customFamily]);
  const applyBodyFamily = loaded && !customFamily && (!parent || flattened?.fontWeight != null);
  // The chosen file already carries the weight. Reset fontWeight to avoid synthetic bold or a
  // native family lookup replacing that exact face. Preserve the requested weight in context.
  const bodyStyle: TextStyle | undefined = applyBodyFamily
    ? { fontFamily: familyForWeight(weight), fontWeight: 'normal' }
    : undefined;

  return (
    <TextInheritanceContext.Provider value={inheritance}>
      <NativeText ref={ref} {...props} style={[style, bodyStyle]} />
    </TextInheritanceContext.Provider>
  );
});
