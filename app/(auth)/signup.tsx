import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { Text } from '../../src/components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LogoMark, Wordmark } from '../../src/components/Logo';
import { SocialSignInButtons } from '../../src/components/SocialSignInButtons';
import { TextField } from '../../src/components/TextField';
import { Button, H1, HeaderButton } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { FREE_CHECKS_PER_MONTH } from '../../src/data/plans';
import { useTheme } from '../../src/theme/ThemeContext';

export default function SignUp() {
  const { colors, font, spacing, radius } = useTheme();
  const router = useRouter();
  const { signUp } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!email.includes('@') || password.length < 6) {
      setError('Enter a valid email and a password of at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      const { needsConfirmation } = await signUp(email.trim(), password, name.trim());
      if (needsConfirmation) {
        Alert.alert(
          'Confirm your email',
          `We sent a link to ${email.trim()}. Open it to activate your account, then log in to set up toxoff.`
        );
        router.replace('/(auth)/login');
        return;
      }
      router.replace('/onboarding');
    } catch (e: any) {
      setError(e?.message ?? 'Could not create account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingBottom: 24, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <HeaderButton icon="chevron-back" label="Back" onPress={() => router.back()} />

          <View style={{ marginHorizontal: -spacing.gutter, paddingHorizontal: spacing.gutter, paddingTop: 16, paddingBottom: 20, backgroundColor: colors.hero, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <LogoMark size={32} />
              <Wordmark size={28} />
            </View>
            <H1 style={{ marginTop: 16 }}>Create your account</H1>
          </View>

          <View style={{ marginTop: 20, padding: 12, borderRadius: radius.md, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder }}>
            <Text style={{ color: colors.accentText, fontSize: font.size.md, lineHeight: 22 }}>Free forever · {FREE_CHECKS_PER_MONTH} comment checks a month.{'\n'}No card needed. No automatic charge.</Text>
          </View>

          <View style={{ gap: 16, marginTop: 20 }}>
            <TextField
              label="Name"
              icon="person-outline"
              placeholder="Your name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
            <TextField
              label="Email"
              icon="mail-outline"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            <TextField
              label="Password"
              icon="lock-closed-outline"
              placeholder="At least 6 characters"
              value={password}
              onChangeText={setPassword}
              isPassword
            />

            {error && (
              <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: font.size.sm }}>{error}</Text>
            )}

            <Button label="Create account" onPress={submit} loading={loading} style={{ marginTop: 4 }} />

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
              <Text style={{ color: colors.textMuted, fontSize: font.size.sm }}>or</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            </View>

            <SocialSignInButtons onError={setError} />
          </View>

          <View style={{ flex: 1 }} />

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', marginTop: 24, columnGap: 4 }}>
            <Text style={{ color: colors.textMuted, fontSize: font.size.md }}>
              Already have an account?{' '}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => router.replace('/(auth)/login')} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: colors.primary, fontSize: font.size.md, fontWeight: font.weight.semibold }}>
                Log in
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
