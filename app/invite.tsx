import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextField } from '../src/components/TextField';
import { Button, Card, H1, HeaderButton, Muted, SectionLabel } from '../src/components/ui';
import { INVITE_BONUS } from '../src/data/plans';
import {
  formatInviteCode,
  getInviteStatus,
  inviteMessage,
  type InviteStatus,
  redeemInviteCode,
} from '../src/lib/invites';
import { useTheme } from '../src/theme/ThemeContext';

// Invite friends: share your single-use code, or enter a friend's (new accounts only).
// toxoff://invite?code=ABCD2345 opens it with the friend's code filled in.
export default function Invite() {
  const { colors, font, spacing } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const [status, setStatus] = useState<InviteStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [friendCode, setFriendCode] = useState(params.code ?? '');
  const [redeeming, setRedeeming] = useState(false);

  // Only the latest request updates the screen, so a slow earlier one can't bring back an old error.
  const latestLoad = useRef(0);
  const load = useCallback(() => {
    const id = ++latestLoad.current;
    setLoadError(null);
    getInviteStatus()
      .then((s) => id === latestLoad.current && setStatus(s))
      .catch((e: Error) => id === latestLoad.current && setLoadError(e.message));
  }, []);
  useEffect(load, [load]);

  const share = () => {
    if (!status?.code) return;
    Share.share({ message: inviteMessage(status.code) }).catch(() => {});
  };

  const redeem = async () => {
    setRedeeming(true);
    try {
      const result = await redeemInviteCode(friendCode);
      Alert.alert(result.title, result.message);
      if (result.ok) {
        setFriendCode('');
        load();
      }
    } catch (e: any) {
      Alert.alert('Something went wrong', e?.message ?? 'Please try again.');
    } finally {
      setRedeeming(false);
    }
  };

  const earned = (status?.rewarded ?? 0) * INVITE_BONUS;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: spacing.gutter, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <HeaderButton icon="close" label="Close" onPress={() => router.back()} />

        <H1 style={{ marginTop: 8 }}>Invite friends</H1>
        <Muted style={{ marginTop: 6, lineHeight: 21 }}>
          When a friend joins with your code and connects their Instagram, you both get {INVITE_BONUS} more free
          comment checks. Works for up to {status?.max ?? 3} friends.
        </Muted>

        <View style={{ marginTop: spacing.xl }}>
          <SectionLabel>Your code</SectionLabel>
          <Card>
            {!status && !loadError && <ActivityIndicator color={colors.primary} style={{ paddingVertical: 24 }} />}
            {loadError && (
              <View style={{ gap: 12 }}>
                <Muted>{loadError}</Muted>
                <Button label="Try again" variant="secondary" size="md" onPress={load} />
              </View>
            )}
            {status && (
              <View style={{ gap: 14 }}>
                {status.code ? (
                  <Text
                    selectable
                    accessibilityLabel={`Your invite code: ${status.code.split('').join(' ')}`}
                    style={{
                      color: colors.text,
                      fontSize: font.size.xxl,
                      fontWeight: font.weight.heavy,
                      letterSpacing: 3,
                      textAlign: 'center',
                      paddingVertical: 6,
                    }}
                  >
                    {formatInviteCode(status.code)}
                  </Text>
                ) : (
                  <Muted style={{ lineHeight: 21 }}>
                    {status.rewarded >= status.max
                      ? `You’ve earned all ${earned} extra checks. Thanks for sharing toxoff!`
                      : 'Waiting for friends who used your code to connect Instagram. You can share again once they do.'}
                  </Muted>
                )}

                <Text style={{ color: colors.textMuted, fontSize: font.size.sm }}>
                  {status.rewarded} of {status.max} friends joined
                  {earned > 0 ? ` · ${earned} extra checks earned` : ''}
                  {status.pending > 0 ? ` · ${status.pending} waiting to connect Instagram` : ''}
                </Text>

                {status.code && <Button label="Share invite" icon="share-outline" onPress={share} />}
              </View>
            )}
          </Card>
        </View>

        {status?.canRedeem && (
          <View style={{ marginTop: spacing.xl }}>
            <SectionLabel>Have a friend’s code?</SectionLabel>
            <Card style={{ gap: 12 }}>
              <TextField
                value={friendCode}
                onChangeText={setFriendCode}
                placeholder="ABCD-2345"
                icon="gift-outline"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={12}
                returnKeyType="done"
                onSubmitEditing={() => friendCode.trim() && redeem()}
                accessibilityLabel="Friend’s invite code"
              />
              <Button
                label="Use code"
                variant="secondary"
                size="md"
                onPress={redeem}
                loading={redeeming}
                disabled={!friendCode.trim()}
              />
            </Card>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
