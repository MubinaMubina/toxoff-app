import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
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

export default function SignUp() {
  const { colors, font } = useTheme();
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
          `We sent a link to ${email.trim()}. Open it to activate your account, then log in — your 7-day trial starts right away.`
        );
        router.replace('/(auth)/login');
        return;
      }
      router.replace('/(auth)/trial-started');
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
          contentContainerStyle={{ padding: 24, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable onPress={() => router.back()} hitSlop={12} style={{ marginBottom: 20 }}>
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>

          <LogoMark size={52} />
          <H1 style={{ marginTop: 18 }}>Create your account</H1>
          <Muted style={{ marginTop: 6 }}>
            Try Plus free for 7 days with 100 free comment checks. No card needed.
          </Muted>

          <View style={{ gap: 14, marginTop: 28 }}>
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
              <Text style={{ color: colors.danger, fontSize: font.size.sm }}>{error}</Text>
            )}

            <Button label="Start free trial" onPress={submit} loading={loading} style={{ marginTop: 4 }} />

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 6 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
              <Text style={{ color: colors.textFaint, fontSize: font.size.sm }}>or</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            </View>

            <SocialSignInButtons onError={setError} />
          </View>

          <View style={{ flex: 1 }} />

          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 24 }}>
            <Text style={{ color: colors.textMuted, fontSize: font.size.md }}>
              Already have an account?{' '}
            </Text>
            <Pressable onPress={() => router.replace('/(auth)/login')}>
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
