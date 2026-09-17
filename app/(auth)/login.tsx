import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { Text } from '../../src/components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LogoMark, Wordmark } from '../../src/components/Logo';
import { SocialSignInButtons } from '../../src/components/SocialSignInButtons';
import { TextField } from '../../src/components/TextField';
import { Button, H1, HeaderButton } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/theme/ThemeContext';

export default function Login() {
  const { colors, font, spacing } = useTheme();
  const router = useRouter();
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!email.includes('@') || !password) {
      setError('Enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      router.replace('/'); // the index decides: onboarding if never done, else the tabs
    } catch (e: any) {
      setError(e?.message ?? 'Could not log in.');
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
            <H1 style={{ marginTop: 16 }}>Log in</H1>
          </View>

          <View style={{ gap: 16, marginTop: 20 }}>
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
              placeholder="Your password"
              value={password}
              onChangeText={setPassword}
              isPassword
            />

            <Pressable
              onPress={() => router.push({ pathname: '/(auth)/forgot-password', params: { email: email.trim() } })}
              accessibilityRole="button"
              accessibilityLabel="Reset your password"
              style={{ alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={{ color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.medium }}>
                Forgot password?
              </Text>
            </Pressable>

            {error && <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: font.size.sm }}>{error}</Text>}

            <Button label="Log in" onPress={submit} loading={loading} />

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
              <Text style={{ color: colors.textMuted, fontSize: font.size.sm }}>or</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            </View>

            <SocialSignInButtons onError={setError} />
          </View>

          <View style={{ flex: 1 }} />

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', marginTop: 24, columnGap: 4 }}>
            <Text style={{ color: colors.textMuted, fontSize: font.size.md }}>New to toxoff? </Text>
            <Pressable accessibilityRole="button" onPress={() => router.replace('/(auth)/signup')} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ color: colors.primary, fontSize: font.size.md, fontWeight: font.weight.semibold }}>
                Create a free account
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
