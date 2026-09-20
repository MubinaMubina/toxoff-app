import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { Text } from '../src/components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Mascot, Wordmark } from '../src/components/Logo';
import { Button, H1 } from '../src/components/ui';
import { FREE_CHECKS_PER_MONTH } from '../src/data/plans';
import { useTheme } from '../src/theme/ThemeContext';

export default function Splash() {
  const { colors, font, spacing, radius } = useTheme();
  const router = useRouter();
  const { height, fontScale } = useWindowDimensions();
  // Give enlarged text and the two actions priority over decorative artwork.
  const compactArtwork = height < 780 || fontScale > 1.2;
  const mascotSize = compactArtwork ? 160 : 224;
  // Display lettering grows to 200%; body copy and controls keep the full system scale.
  const displayScale = Math.min(fontScale, 2) / fontScale;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: spacing.gutter, paddingTop: 16, paddingBottom: 24 }}>
        <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 24 }}>
          <View style={{ alignItems: 'center' }}>
            <View
              accessible={false}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              pointerEvents="none"
              style={{ alignItems: 'center', justifyContent: 'center' }}
            >
              <Mascot size={mascotSize} />
            </View>
            <View style={{ marginTop: 4 }}>
              <Wordmark size={44 * displayScale} />
            </View>
          </View>

          <View style={{ marginTop: 24, backgroundColor: colors.hero, borderRadius: radius.xl, padding: 24 }}>
            <H1 style={{ fontSize: 40 * displayScale, lineHeight: 46 * displayScale, letterSpacing: -1.2, fontWeight: font.weight.bold }}>
              You create.{'\n'}<Text style={{ color: colors.accentText }}>We filter.</Text>
            </H1>
            <Text style={{ marginTop: 12, color: colors.textMuted, fontSize: font.size.lg, lineHeight: 24 }}>
              Automatically filters toxic and spam comments on your Instagram posts.
            </Text>
          </View>
        </View>

        <View style={{ gap: 12 }}>
          <Button label="Get started free" icon="arrow-forward" onPress={() => router.push('/(auth)/signup')} />
          <Button label="Log in" icon="log-in-outline" variant="secondary" style={{ backgroundColor: colors.card, borderColor: colors.primary, borderWidth: 2 }} onPress={() => router.push('/(auth)/login')} />
          <Text style={{ color: colors.textMuted, fontSize: font.size.sm, textAlign: 'center', lineHeight: 20, marginTop: 4 }}>Free forever · {FREE_CHECKS_PER_MONTH} checks a month · No card</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
