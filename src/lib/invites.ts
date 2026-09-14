import { INVITE_BONUS, MAX_INVITE_REWARDS } from '../data/plans';
import { isSupabaseConfigured, supabase } from './supabase';

// Invites (public.invite_status / public.redeem_invite_code in supabase/migrations).

export type InviteStatus = {
  code: string | null; // null: all extra checks earned, or waiting on friends who used earlier codes
  rewarded: number; // friends who joined and connected Instagram
  pending: number; // friends who entered a code but haven't connected Instagram yet
  max: number;
  canRedeem: boolean; // this account is new enough and hasn't used a friend's code yet
};

const DEMO_STATUS: InviteStatus = { code: 'DEMO2FUN', rewarded: 1, pending: 0, max: MAX_INVITE_REWARDS, canRedeem: true };

export async function getInviteStatus(): Promise<InviteStatus> {
  if (!isSupabaseConfigured) return DEMO_STATUS;
  const { data, error } = await supabase.rpc('invite_status');
  if (error) throw new Error('Could not load your invite code. Please try again.');
  return data as InviteStatus;
}

/** "ABCD2345" → "ABCD-2345", easier to read out and type. */
export const formatInviteCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

export const inviteMessage = (code: string) =>
  `I use toxoff to hide toxic and spam comments on my Instagram. Join with my invite code ` +
  `${formatInviteCode(code)} (enter it in Settings → Invite friends) and we both get ` +
  `${INVITE_BONUS} extra free comment checks once you connect your Instagram.`;

type RedeemResult = { ok: boolean; title: string; message: string };

const REDEEM_RESULTS: Record<string, RedeemResult> = {
  rewarded: {
    ok: true,
    title: 'Code applied',
    message: `You and your friend each got ${INVITE_BONUS} extra free comment checks.`,
  },
  pending: {
    ok: true,
    title: 'Code saved',
    message: `Connect your Instagram and you and your friend will each get ${INVITE_BONUS} extra free comment checks.`,
  },
  not_found: { ok: false, title: 'Code not found', message: 'Check the code and try again.' },
  used: { ok: false, title: 'Code already used', message: 'Each code works once. Ask your friend for a new one.' },
  own_code: { ok: false, title: 'That’s your own code', message: 'Share it with a friend instead.' },
  invited_you: {
    ok: false,
    title: 'You invited this friend',
    message: 'Codes can’t be swapped back and forth. Invite someone new instead.',
  },
  already_redeemed: { ok: false, title: 'Already used a code', message: 'Each account can use one friend’s code.' },
  too_late: {
    ok: false,
    title: 'Only for new accounts',
    message: 'Friends’ codes can be used in the first 7 days after signing up.',
  },
};

export async function redeemInviteCode(code: string): Promise<RedeemResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, title: 'Demo mode', message: 'Sign in to a real account to use invite codes.' };
  }
  const { data, error } = await supabase.rpc('redeem_invite_code', { p_code: code });
  if (error) throw new Error('Could not check that code. Please try again.');
  return REDEEM_RESULTS[data as string] ?? { ok: false, title: 'Something went wrong', message: 'Please try again.' };
}
