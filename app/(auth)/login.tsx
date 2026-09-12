import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LogoMark } from '../../src/components/Logo';
import { SocialSignInButtons } from '../../src/components/SocialSignInButtons';
import { TextField } from '../../src/components/TextField';
import { Button, H1, Muted } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/theme/ThemeContext';

export default function Login() {
  const { colors, font } = useTheme();
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
      router.replace('/(tabs)');
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
          contentContainerStyle={{ padding: 24, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable onPress={() => router.back()} hitSlop={12} style={{ marginBottom: 20 }}>
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>

          <LogoMark size={52} />
          <H1 style={{ marginTop: 18 }}>Welcome back</H1>
          <Muted style={{ marginTop: 6 }}>Log in to your toxoff dashboard.</Muted>

          <View style={{ gap: 14, marginTop: 28 }}>
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

            <Pressable style={{ alignSelf: 'flex-end' }}>
              <Text style={{ color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.medium }}>
                Forgot password?
              </Text>
            </Pressable>

            {error && <Text style={{ color: colors.danger, fontSize: font.size.sm }}>{error}</Text>}

            <Button label="Log in" onPress={submit} loading={loading} />

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 6 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
              <Text style={{ color: colors.textFaint, fontSize: font.size.sm }}>or</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            </View>

            <SocialSignInButtons onError={setError} />
          </View>

          <View style={{ flex: 1 }} />

          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 24 }}>
            <Text style={{ color: colors.textMuted, fontSize: font.size.md }}>New to toxoff? </Text>
            <Pressable onPress={() => router.replace('/(auth)/signup')}>
              <Text style={{ color: colors.primary, fontSize: font.size.md, fontWeight: font.weight.semibold }}>
                Start free trial
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
