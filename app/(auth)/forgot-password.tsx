import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Text } from '../../src/components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextField } from '../../src/components/TextField';
import { Button, H1, HeaderButton, Muted } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/theme/ThemeContext';

export default function ForgotPassword() {
  const { colors, font, spacing, radius } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));

  useEffect(() => {
    if (!resendAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [resendAt]);

  const send = async () => {
    if (busy || (sentTo && secondsLeft > 0)) return;
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError('Enter a valid email address.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await requestPasswordReset(address);
      setSentTo(address);
      setNow(Date.now());
      setResendAt(Date.now() + 60_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not send a reset link. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingBottom: 32, flexGrow: 1 }}>
          <HeaderButton icon="chevron-back" label="Back to log in" onPress={() => router.replace('/(auth)/login')} />
          <View style={{ marginHorizontal: -spacing.gutter, paddingHorizontal: spacing.gutter, paddingTop: 20, paddingBottom: 28, backgroundColor: colors.hero, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ width: 52, height: 52, borderRadius: radius.md, backgroundColor: sentTo ? colors.successSoft : colors.infoSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={sentTo ? 'mail-outline' : 'lock-open-outline'} size={27} color={sentTo ? colors.success : colors.info} accessible={false} />
            </View>
            <H1 style={{ marginTop: 22 }}>{sentTo ? 'Check your email.' : 'Let’s get you back in.'}</H1>
            <Muted style={{ marginTop: 10 }}>
              {sentTo ? `If an account exists for ${sentTo}, you’ll receive a password reset link shortly.` : 'Enter the email you use for toxoff. We’ll send you a link to choose a new password.'}
            </Muted>
          </View>

          <View style={{ gap: 18, marginTop: 28 }}>
            {sentTo ? (
              <View style={{ padding: 16, borderRadius: radius.md, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder }}>
                <Text style={{ color: colors.accentText, fontSize: font.size.md, lineHeight: 24 }}>
                  Open the newest link on this device. Check your spam folder if it hasn’t arrived.
                </Text>
              </View>
            ) : (
              <TextField
                label="Email"
                accessibilityLabel="Email address for password reset"
                icon="mail-outline"
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
                editable={!busy}
                returnKeyType="send"
                onSubmitEditing={send}
              />
            )}
            {error && <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: font.size.sm }}>{error}</Text>}
            <Button
              label={sentTo ? secondsLeft ? `Resend in ${secondsLeft}s` : 'Send another link' : 'Send reset link'}
              onPress={send}
              loading={busy}
              disabled={Boolean(sentTo && secondsLeft > 0)}
            />
            {sentTo && <Button label="Use a different email" variant="ghost" disabled={busy} onPress={() => { setSentTo(null); setError(null); }} />}
            <Button label="Back to log in" variant="secondary" disabled={busy} onPress={() => router.replace('/(auth)/login')} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
