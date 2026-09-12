import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { SocialSignInResult, useAuth } from '../context/AuthContext';
import { AppleButton } from './AppleButton';
import { GoogleButton } from './GoogleButton';

type Provider = 'google' | 'apple';

const LABEL: Record<Provider, string> = { google: 'Google', apple: 'Apple' };

// Works for both sign-up and log-in: new accounts see the trial screen, returning users go home.
export function SocialSignInButtons({ onError }: { onError: (message: string | null) => void }) {
  const router = useRouter();
  const { signInWithGoogle, signInWithApple } = useAuth();
  const [pending, setPending] = useState<Provider | null>(null);

  const start = async (provider: Provider) => {
    if (pending) return;
    setPending(provider);
    onError(null);
    try {
      const result: SocialSignInResult =
        provider === 'google' ? await signInWithGoogle() : await signInWithApple();
      if (!result) return;
      router.replace(result.isNew ? '/(auth)/trial-started' : '/(tabs)');
    } catch (e: any) {
      onError(e?.message ?? `${LABEL[provider]} sign-in failed.`);
    } finally {
      setPending(null);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <AppleButton onPress={() => start('apple')} loading={pending === 'apple'} />
      <GoogleButton onPress={() => start('google')} loading={pending === 'google'} />
    </View>
  );
}
