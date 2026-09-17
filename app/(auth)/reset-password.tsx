import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Text } from '../../src/components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextField } from '../../src/components/TextField';
import { Button, H1, Muted } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { RECOVERY_LINK_MESSAGE } from '../../src/lib/passwordRecovery';
import { useTheme } from '../../src/theme/ThemeContext';

export default function ResetPassword() {
  const { colors, font, spacing, radius } = useTheme();
  const router = useRouter();
  const { passwordRecovery, loading, resetPassword, leavePasswordRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const verifying = loading || passwordRecovery === 'verifying';
  const ready = passwordRecovery === 'ready';
  const complete = passwordRecovery === 'complete';

  const submit = async () => {
    if (busy || !ready) return;
    if (password.length < 8) { setError('Use at least 8 characters for your new password.'); return; }
    if (password !== confirmation) { setError('Your passwords do not match.'); return; }
    setError(null);
    setBusy(true);
    try {
      await resetPassword(password);
      setPassword('');
      setConfirmation('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not update your password. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const leave = async (resend: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await leavePasswordRecovery();
      router.replace(resend ? '/(auth)/forgot-password' : '/(auth)/login');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingBottom: 32, flexGrow: 1 }}>
          <View style={{ marginHorizontal: -spacing.gutter, paddingHorizontal: spacing.gutter, paddingTop: 40, paddingBottom: 28, backgroundColor: colors.hero, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ width: 56, height: 56, borderRadius: radius.md, backgroundColor: complete ? colors.successSoft : ready ? colors.infoSoft : colors.warningSoft, alignItems: 'center', justifyContent: 'center' }}>
              {verifying ? <ActivityIndicator color={colors.warning} /> : <Ionicons name={complete ? 'checkmark-circle-outline' : ready ? 'lock-closed-outline' : 'link-outline'} size={30} color={complete ? colors.success : ready ? colors.info : colors.warning} accessible={false} />}
            </View>
            <H1 style={{ marginTop: 24 }}>
              {verifying ? 'Checking your link' : complete ? 'You’re all set.' : ready ? 'Choose a new password.' : 'Request a new link.'}
            </H1>
            <Muted style={{ marginTop: 10 }}>
              {verifying ? 'This should only take a moment.' : complete ? 'Your new password is saved. Log in to get back to your comment section.' : ready ? 'Use at least 8 characters. A longer password that you don’t use elsewhere is best.' : RECOVERY_LINK_MESSAGE}
            </Muted>
          </View>

          <View style={{ gap: 16, marginTop: 28 }}>
            {ready && <>
              <TextField label="New password" accessibilityLabel="New password" icon="lock-closed-outline" placeholder="At least 8 characters" value={password} onChangeText={setPassword} isPassword autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" editable={!busy} />
              <TextField label="Confirm password" accessibilityLabel="Confirm new password" icon="lock-closed-outline" placeholder="Enter your new password again" value={confirmation} onChangeText={setConfirmation} isPassword autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" editable={!busy} returnKeyType="done" onSubmitEditing={submit} />
            </>}
            {error && <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: font.size.sm }}>{error}</Text>}
            {ready && <Button label="Save new password" onPress={submit} loading={busy} />}
            {!verifying && !ready && !complete && <Button label="Send a new reset link" onPress={() => leave(true)} loading={busy} />}
            {!verifying && <Button label={complete ? 'Log in' : 'Back to log in'} variant={complete ? 'primary' : 'secondary'} onPress={() => leave(false)} loading={busy && complete} disabled={busy && !complete} />}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
