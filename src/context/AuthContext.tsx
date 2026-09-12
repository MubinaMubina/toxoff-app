import type { User } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { TRIAL_DAYS } from '../data/plans';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { BillingInterval, PaidPlanId, PlanId } from '../types';

WebBrowser.maybeCompleteAuthSession();

export type AppUser = {
  id: string;
  email: string;
  name: string;
};

// The user's Stripe subscription, as the backend copies it onto their profile.
export type Billing = {
  status: 'scheduled' | 'active' | 'past_due'; // see profiles.billing_status (supabase/migrations)
  plan: PaidPlanId;
  interval: BillingInterval;
  periodEnd: string | null; // ISO: the next charge, or when it ends if cancelling
  cancelAtPeriodEnd: boolean;
};

export type Subscription = {
  plan: PlanId; // what the user can use right now
  status: 'trialing' | 'active' | 'free';
  trialEndsAt: string | null; // ISO
  billing: Billing | null;
  paying: boolean; // comments aren't counted against the free checks
};

// null = the user closed the sign-in sheet; isNew = the account was just created.
export type SocialSignInResult = { isNew: boolean } | null;

type AuthValue = {
  user: AppUser | null;
  subscription: Subscription;
  loading: boolean;
  signUp: (email: string, password: string, name: string) => Promise<{ needsConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<SocialSignInResult>;
  signInWithApple: () => Promise<SocialSignInResult>;
  signOut: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
  setDemoBilling: (billing: Billing | null) => void;
};

const PROFILE_COLUMNS =
  'plan, trial_ends_at, sub_status, billing_status, billing_plan, billing_interval, billing_period_end, billing_cancel_at_period_end';

type ProfileRow = {
  plan: PlanId | null;
  trial_ends_at: string | null;
  sub_status: 'trialing' | 'active' | 'none' | null;
  billing_status: 'none' | Billing['status'];
  billing_plan: PaidPlanId | null;
  billing_interval: BillingInterval | null;
  billing_period_end: string | null;
  billing_cancel_at_period_end: boolean;
};

const FREE: Subscription = { plan: 'free', status: 'free', trialEndsAt: null, billing: null, paying: false };

// How long a plan chosen during the trial holds after the trial ends while Stripe hasn't reported
// the first charge yet. Must match effective_plan() (supabase/migrations).
const SCHEDULED_GRACE_MS = 3 * 86_400_000;

const AuthContext = createContext<AuthValue | undefined>(undefined);

function toBilling(p: ProfileRow): Billing | null {
  if (p.billing_status === 'none' || !p.billing_plan || !p.billing_interval) return null;
  return {
    status: p.billing_status,
    plan: p.billing_plan,
    interval: p.billing_interval,
    periodEnd: p.billing_period_end,
    cancelAtPeriodEnd: p.billing_cancel_at_period_end,
  };
}

// Mirrors public.effective_plan() and public.is_paying() (supabase/migrations).
function toSubscription(p: ProfileRow): Subscription {
  const billing = toBilling(p);
  const scheduled =
    billing?.status === 'scheduled' &&
    billing.periodEnd !== null &&
    Date.parse(billing.periodEnd) > Date.now() - SCHEDULED_GRACE_MS;
  const common = { trialEndsAt: p.trial_ends_at, billing, paying: p.sub_status === 'active' || scheduled };
  if (p.sub_status === 'active' && p.plan) {
    return { ...common, plan: p.plan, status: 'active' };
  }
  const inTrial =
    p.sub_status === 'trialing' &&
    p.trial_ends_at !== null &&
    new Date(p.trial_ends_at).getTime() > Date.now();
  if (inTrial && p.plan) {
    return { ...common, plan: p.plan, status: 'trialing' };
  }
  // Chosen during the trial, which has ended: the plan holds while Stripe reports the first charge.
  if (scheduled && billing) return { ...common, plan: billing.plan, status: 'active' };
  return { ...common, plan: 'free', status: 'free' };
}

// Supabase stamps created_at and last_sign_in_at together on an account's first sign-in.
function isNewAccount(u: User): boolean {
  if (!u.last_sign_in_at) return true;
  return Math.abs(Date.parse(u.last_sign_in_at) - Date.parse(u.created_at)) < 10_000;
}

function toAppUser(u: User): AppUser {
  return {
    id: u.id,
    email: u.email ?? '',
    name: u.user_metadata?.full_name ?? u.user_metadata?.name ?? 'Creator',
  };
}

function demoTrial(plan: PlanId): Subscription {
  const d = new Date();
  d.setDate(d.getDate() + TRIAL_DAYS);
  return { plan, trialEndsAt: d.toISOString(), status: 'trialing', billing: null, paying: false };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [subscription, setSubscription] = useState<Subscription>(FREE);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    // Emits INITIAL_SESSION right away, then every sign-in, sign-out and token refresh.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? toAppUser(session.user) : null);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const loadSubscription = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', id)
      .single();
    if (error) throw error;
    setSubscription(toSubscription(data as ProfileRow));
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (!userId) {
      setSubscription(FREE);
      return;
    }
    loadSubscription(userId).catch((e) => console.warn('Could not load subscription', e));

    // Stripe's webhooks change the subscription on the server (renewals, failed charges, the
    // first charge after the trial); show it as it happens.
    const channel = supabase
      .channel(`subscription:${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (payload) => setSubscription(toSubscription(payload.new as ProfileRow))
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, loadSubscription]);

  const signUp = async (email: string, password: string, name: string) => {
    if (!isSupabaseConfigured) {
      setUser({ id: 'demo-user', email, name: name || 'Creator' });
      setSubscription(demoTrial('plus'));
      return { needsConfirmation: false };
    }
    // The handle_new_user trigger (supabase/migrations) creates the profile and starts the trial.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    if (error) throw error;
    return { needsConfirmation: !data.session };
  };

  const signIn = async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      setUser({ id: 'demo-user', email, name: 'Creator' });
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  // Demo mode treats every social sign-in as a new account, so the trial flow is walkable.
  const demoSocialSignIn = (email: string, name: string): SocialSignInResult => {
    setUser({ id: 'demo-user', email, name });
    setSubscription(demoTrial('plus'));
    return { isNew: true };
  };

  const signInWithGoogle = async (): Promise<SocialSignInResult> => {
    if (!isSupabaseConfigured) return demoSocialSignIn('you@gmail.com', 'Google Creator');

    const redirectTo = AuthSession.makeRedirectUri({ scheme: 'toxoff' });
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return null;
    const code = new URL(result.url).searchParams.get('code');
    if (!code) throw new Error('Google sign-in did not complete. Please try again.');
    const { data: session, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    return { isNew: isNewAccount(session.user) };
  };

  const signInWithApple = async (): Promise<SocialSignInResult> => {
    if (!isSupabaseConfigured) return demoSocialSignIn('you@privaterelay.appleid.com', 'Apple Creator');

    // Apple gets the hashed nonce; Supabase checks the raw one against the token.
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
    let credential: AppleAuthentication.AppleAuthenticationCredential;
    try {
      credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
    } catch (e: any) {
      if (e?.code === 'ERR_REQUEST_CANCELED') return null;
      throw e;
    }
    if (!credential.identityToken) throw new Error('Apple sign-in did not return an identity token.');

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: rawNonce,
    });
    if (error) throw error;

    // Apple shares the user's name only on the very first sign-in, so save it now.
    const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
      .filter(Boolean)
      .join(' ');
    if (fullName) {
      await supabase.auth.updateUser({ data: { full_name: fullName } });
      await supabase.from('profiles').update({ full_name: fullName }).eq('id', data.user.id);
      setUser((u) => (u ? { ...u, name: fullName } : u));
    }
    return { isNew: isNewAccount(data.user) };
  };

  const signOut = async () => {
    if (isSupabaseConfigured) await supabase.auth.signOut();
    setUser(null);
    setSubscription(FREE);
  };

  // Billing state is written by the backend (Stripe webhooks); re-read it after checkout.
  const refreshSubscription = useCallback(async () => {
    if (isSupabaseConfigured && userId) await loadSubscription(userId);
  }, [userId, loadSubscription]);

  // Demo mode stands in for Stripe here; null ends the subscription.
  const setDemoBilling = (billing: Billing | null) =>
    setSubscription((s) =>
      billing
        ? { ...s, plan: billing.plan, status: 'active', billing, paying: true }
        : { ...s, plan: 'free', status: 'free', billing: null, paying: false }
    );

  const value = useMemo<AuthValue>(
    () => ({
      user,
      subscription,
      loading,
      signUp,
      signIn,
      signInWithGoogle,
      signInWithApple,
      signOut,
      refreshSubscription,
      setDemoBilling,
    }),
    [user, subscription, loading, refreshSubscription]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
