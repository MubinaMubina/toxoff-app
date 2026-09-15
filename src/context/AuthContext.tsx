import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session, User } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { TRIAL_DAYS } from '../data/plans';
import { identifyPurchaser } from '../lib/purchases';
import {
  isVerifiedRecoverySession,
  isRetryableRecoveryError,
  parseRecoveryCallback,
  PASSWORD_RECOVERY_REDIRECT,
  PASSWORD_RECOVERY_STORAGE_KEY,
  PasswordRecoveryState,
  passwordResetError,
  RECOVERY_LINK_MESSAGE,
  RECOVERY_CONNECTION_MESSAGE,
} from '../lib/passwordRecovery';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { BillingInterval, PaidPlanId, PlanId } from '../types';

WebBrowser.maybeCompleteAuthSession();

export type AppUser = {
  id: string;
  email: string;
  name: string;
};

// The user's subscription, as the backend copies it onto their profile. The app sells through the
// App Store (src/lib/purchases.ts); 'scheduled' only ever came from Stripe, which it no longer uses.
export type Billing = {
  status: 'scheduled' | 'active' | 'past_due'; // see profiles.billing_status (supabase/migrations)
  plan: PaidPlanId;
  interval: BillingInterval;
  periodEnd: string | null; // ISO: the next charge, or when it ends if cancelling
  cancelAtPeriodEnd: boolean;
  store: 'app_store' | 'stripe' | null;
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
  passwordRecovery: PasswordRecoveryState;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (password: string) => Promise<void>;
  leavePasswordRecovery: () => Promise<void>;
  /** false until the user finishes (or skips) onboarding; null while the profile is loading. */
  onboarded: boolean | null;
  completeOnboarding: () => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<{ needsConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<SocialSignInResult>;
  signInWithApple: () => Promise<SocialSignInResult>;
  signOut: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
  setDemoBilling: (billing: Billing | null) => void;
};

const PROFILE_COLUMNS =
  'plan, trial_ends_at, sub_status, billing_status, billing_plan, billing_interval, billing_period_end, billing_cancel_at_period_end, billing_store, onboarded_at';

type ProfileRow = {
  onboarded_at: string | null;
  plan: PlanId | null;
  trial_ends_at: string | null;
  sub_status: 'trialing' | 'active' | 'none' | null;
  billing_status: 'none' | Billing['status'];
  billing_plan: PaidPlanId | null;
  billing_interval: BillingInterval | null;
  billing_period_end: string | null;
  billing_cancel_at_period_end: boolean;
  billing_store: Billing['store'];
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
    store: p.billing_store,
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
  const [sessionUser, setUser] = useState<AppUser | null>(null);
  const [subscription, setSubscription] = useState<Subscription>(FREE);
  const [authInitialized, setAuthInitialized] = useState(!isSupabaseConfigured);
  const [linksInitialized, setLinksInitialized] = useState(false);
  const loading = !authInitialized || !linksInitialized;
  const [passwordRecovery, setPasswordRecovery] = useState<PasswordRecoveryState>('idle');
  // INITIAL_SESSION can arrive before AsyncStorage or the cold-start link. Do not publish that
  // session to app screens, moderation requests, or profile subscriptions until both are checked.
  const user = !loading && passwordRecovery === 'idle' ? sessionUser : null;
  const recoveryState = useRef<PasswordRecoveryState>('idle');
  const recoverySession = useRef<{ userId: string; accessToken: string; expiresAt: number } | null>(null);
  const recoveryEvent = useRef<Session | null>(null);
  const lastRecoveryUrl = useRef<string | null>(null);
  const recoveryQueue = useRef<Promise<void>>(Promise.resolve());
  // Demo mode: existing "accounts" count as onboarded; a demo sign-up goes through onboarding.
  const [onboarded, setOnboarded] = useState<boolean | null>(isSupabaseConfigured ? null : true);
  const userId = user?.id ?? null;

  const changeRecoveryState = useCallback((state: PasswordRecoveryState) => {
    recoveryState.current = state;
    setPasswordRecovery(state);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    // Emits INITIAL_SESSION right away, then every sign-in, sign-out and token refresh.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // Do not await Supabase calls in this listener: it runs while the auth lock is held.
      if (event === 'PASSWORD_RECOVERY') {
        if (recoveryState.current === 'verifying') {
          recoveryEvent.current = session;
        } else {
          // Recovery events never become an ordinary login, even outside our expected callback.
          changeRecoveryState('invalid');
          void AsyncStorage.setItem(PASSWORD_RECOVERY_STORAGE_KEY, 'active').catch(() => {});
        }
      }
      if (recoveryState.current === 'ready' && event === 'SIGNED_IN' && session?.access_token !== recoverySession.current?.accessToken) {
        recoverySession.current = null;
        changeRecoveryState('invalid');
      }
      setUser(recoveryState.current === 'idle' && session?.user ? toAppUser(session.user) : null);
      setAuthInitialized(true);
    });
    return () => data.subscription.unsubscribe();
  }, [changeRecoveryState]);

  const handleRecoveryUrl = useCallback(async (url: string) => {
    const callback = parseRecoveryCallback(url);
    if (callback.kind === 'ignore' || lastRecoveryUrl.current === url) return;
    lastRecoveryUrl.current = url;
    recoverySession.current = null;
    recoveryEvent.current = null;
    changeRecoveryState('verifying');
    setUser(null);
    try {
      // A restarted app must not interpret an unfinished recovery session as a normal sign-in.
      // This flag contains no email, token, or other credentials.
      await AsyncStorage.setItem(PASSWORD_RECOVERY_STORAGE_KEY, 'active');
      if (callback.kind !== 'code' || !isSupabaseConfigured) throw new Error('Invalid recovery');
      const { data, error } = await supabase.auth.exchangeCodeForSession(callback.code);
      if (error || !data.session) throw new Error('Invalid recovery');
      const { data: verified, error: verificationError } = await supabase.auth.getUser(data.session.access_token);
      if (verificationError || !isVerifiedRecoverySession(recoveryEvent.current, data.session, verified.user?.id ?? null)) {
        throw new Error('Invalid recovery');
      }
      recoverySession.current = {
        userId: data.session.user.id,
        accessToken: data.session.access_token,
        expiresAt: Math.min(data.session.expires_at! * 1000, Date.now() + 15 * 60_000),
      };
      changeRecoveryState('ready');
    } catch {
      changeRecoveryState('invalid');
    }
  }, [changeRecoveryState]);

  useEffect(() => {
    let active = true;
    const enqueue = (url: string) => {
      recoveryQueue.current = recoveryQueue.current.then(() => handleRecoveryUrl(url));
      return recoveryQueue.current;
    };
    // Keep startup navigation blocked while inspecting the marker and any cold-start link.
    const initialize = async () => {
      try {
        const pending = await AsyncStorage.getItem(PASSWORD_RECOVERY_STORAGE_KEY);
        if (pending && active) {
          changeRecoveryState('invalid');
          setUser(null);
        }
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl && active) await enqueue(initialUrl);
      } catch {
        if (active) {
          changeRecoveryState('invalid');
          setUser(null);
        }
      } finally {
        if (active) setLinksInitialized(true);
      }
    };
    // Queue warm links behind initialization so a stored marker cannot overwrite a verified link.
    const initialized = initialize();
    const listener = Linking.addEventListener('url', ({ url }) => {
      void initialized.then(() => { if (active) return enqueue(url); });
    });
    return () => { active = false; listener.remove(); };
  }, [changeRecoveryState, handleRecoveryUrl]);

  const requestPasswordReset = useCallback(async (email: string) => {
    if (!isSupabaseConfigured) throw new Error('Password reset is unavailable in this preview.');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: PASSWORD_RECOVERY_REDIRECT,
      });
      if (error) throw error;
    } catch (error) {
      throw new Error(passwordResetError(error, 'request'));
    }
  }, []);

  const resetPassword = useCallback(async (password: string) => {
    const authorization = recoverySession.current;
    if (!isSupabaseConfigured || recoveryState.current !== 'ready' || !authorization || authorization.expiresAt <= Date.now()) {
      changeRecoveryState('invalid');
      throw new Error(RECOVERY_LINK_MESSAGE);
    }
    if (password.length < 8) throw new Error('Use at least 8 characters for your new password.');
    const { data: verified, error: verificationError } = await supabase.auth.getUser(authorization.accessToken)
      .catch(() => { throw new Error(RECOVERY_CONNECTION_MESSAGE); });
    if (isRetryableRecoveryError(verificationError)) throw new Error(RECOVERY_CONNECTION_MESSAGE);
    const { data: current, error: sessionError } = await supabase.auth.getSession()
      .catch(() => { throw new Error(RECOVERY_CONNECTION_MESSAGE); });
    if (isRetryableRecoveryError(sessionError)) throw new Error(RECOVERY_CONNECTION_MESSAGE);
    if (sessionError || verificationError || recoveryState.current !== 'ready' || recoverySession.current !== authorization || current.session?.access_token !== authorization.accessToken || verified.user?.id !== authorization.userId) {
      recoverySession.current = null;
      changeRecoveryState('invalid');
      throw new Error(RECOVERY_LINK_MESSAGE);
    }
    const { error } = await supabase.auth.updateUser({ password })
      .catch((error) => { throw new Error(passwordResetError(error, 'update')); });
    if (error) throw new Error(passwordResetError(error, 'update'));
    recoverySession.current = null;
    changeRecoveryState('complete');
  }, [changeRecoveryState]);

  const leavePasswordRecovery = useCallback(async () => {
    // Keep the recovery gate until the persisted auth session is cleared successfully.
    if (isSupabaseConfigured) {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw new Error('Could not finish signing out. Check your connection and try again.');
    }
    await AsyncStorage.removeItem(PASSWORD_RECOVERY_STORAGE_KEY);
    recoverySession.current = null;
    recoveryEvent.current = null;
    setUser(null);
    changeRecoveryState('idle');
  }, [changeRecoveryState]);

  const loadSubscription = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', id)
      .single();
    if (error) throw error;
    setSubscription(toSubscription(data as ProfileRow));
    setOnboarded((data as ProfileRow).onboarded_at !== null);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (!userId) {
      setSubscription(FREE);
      setOnboarded(null);
      return;
    }
    loadSubscription(userId).catch((e) => console.warn('Could not load subscription', e));

    // The App Store's webhooks (through RevenueCat) change the subscription on the server
    // (renewals, cancellations, billing problems); show it as it happens.
    const channel = supabase
      .channel(`subscription:${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (payload) => {
          const row = payload.new as ProfileRow;
          setSubscription(toSubscription(row));
          if ('onboarded_at' in row) setOnboarded(row.onboarded_at !== null);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, loadSubscription]);

  // Purchases belong to the toxoff user, so RevenueCat's webhooks can name them.
  useEffect(() => {
    identifyPurchaser(userId).catch((e) => console.warn('Could not set up purchases', e));
  }, [userId]);

  const signUp = async (email: string, password: string, name: string) => {
    if (!isSupabaseConfigured) {
      setUser({ id: 'demo-user', email, name: name || 'Creator' });
      setSubscription(demoTrial('plus'));
      setOnboarded(false);
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
    setOnboarded(false);
    return { isNew: true };
  };

  const signInWithGoogle = async (): Promise<SocialSignInResult> => {
    if (!isSupabaseConfigured) return demoSocialSignIn('you@gmail.com', 'Google Creator');

    const redirectTo = AuthSession.makeRedirectUri({ scheme: 'toxoff' });
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      // select_account: always show Google's account chooser (the branded "to continue to toxoff"
      // screen) instead of silently reusing whichever account the browser last used.
      options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
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
    setOnboarded(isSupabaseConfigured ? null : true);
  };

  // Marks onboarding done (or skipped) so the app stops sending the user there.
  const completeOnboarding = useCallback(async () => {
    setOnboarded(true);
    if (!isSupabaseConfigured || !userId) return;
    const { error } = await supabase
      .from('profiles')
      .update({ onboarded_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) console.warn('Could not save onboarding state', error.message);
  }, [userId]);

  // Billing state is written by the backend (App Store webhooks); re-read it after a purchase.
  const refreshSubscription = useCallback(async () => {
    if (isSupabaseConfigured && userId) await loadSubscription(userId);
  }, [userId, loadSubscription]);

  // Demo mode stands in for the App Store here; null ends the subscription.
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
      passwordRecovery,
      requestPasswordReset,
      resetPassword,
      leavePasswordRecovery,
      onboarded,
      completeOnboarding,
      signUp,
      signIn,
      signInWithGoogle,
      signInWithApple,
      signOut,
      refreshSubscription,
      setDemoBilling,
    }),
    [user, subscription, loading, passwordRecovery, requestPasswordReset, resetPassword, leavePasswordRecovery, onboarded, completeOnboarding, refreshSubscription]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
