import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LogoMark, Wordmark } from '../src/components/Logo';
import { Button } from '../src/components/ui';
import { useTheme } from '../src/theme/ThemeContext';

const HIGHLIGHTS = [
  { icon: 'globe-outline', text: 'Detects toxic comments in any language' },
  { icon: 'flash-outline', text: 'Removes them automatically, in real time' },
  { icon: 'options-outline', text: 'You stay in control of what gets filtered' },
] as const;

export default function Splash() {
  const { colors, font } = useTheme();
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1, paddingHorizontal: 28, justifyContent: 'space-between' }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <LogoMark size={76} />
          <View style={{ height: 22 }} />
          <Wordmark size={38} />
          <Text
            style={{
              color: colors.textMuted,
              fontSize: font.size.lg,
              textAlign: 'center',
              marginTop: 16,
              lineHeight: 26,
              maxWidth: 300,
            }}
          >
            Keep hate off your comments.{'\n'}
            <Text style={{ color: colors.text, fontWeight: font.weight.semibold }}>
              Automatically.
            </Text>
          </Text>

          <View style={{ marginTop: 40, gap: 16, alignSelf: 'stretch', paddingHorizontal: 8 }}>
            {HIGHLIGHTS.map((h) => (
              <View key={h.text} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    backgroundColor: colors.primarySoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name={h.icon} size={19} color={colors.primary} />
                </View>
                <Text style={{ color: colors.text, fontSize: font.size.md, flex: 1 }}>{h.text}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ gap: 12, paddingBottom: 16 }}>
          <Button label="Start free trial" onPress={() => router.push('/(auth)/signup')} />
          <Button label="Log in" variant="ghost" onPress={() => router.push('/(auth)/login')} />
          <Text
            style={{
              color: colors.textFaint,
              fontSize: font.size.xs,
              textAlign: 'center',
              marginTop: 4,
            }}
          >
            7-day free trial · Cancel anytime
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
