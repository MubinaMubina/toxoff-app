import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { TRIAL_DAYS } from '../data/plans';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { PlanId } from '../types';

WebBrowser.maybeCompleteAuthSession();

export type AppUser = {
  id: string;
  email: string;
  name: string;
};

export type Subscription = {
  plan: PlanId | null;
  trialEndsAt: string | null; // ISO
  status: 'trialing' | 'active' | 'none';
};

type AuthValue = {
  user: AppUser | null;
  subscription: Subscription;
  loading: boolean;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  startTrial: (plan: PlanId) => void;
  setPlan: (plan: PlanId) => void;
};

const AuthContext = createContext<AuthValue | undefined>(undefined);

function trialEnd() {
  // Demo-mode deterministic-ish trial end; live mode reads from Supabase/Stripe.
  const d = new Date();
  d.setDate(d.getDate() + TRIAL_DAYS);
  return d.toISOString();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [subscription, setSubscription] = useState<Subscription>({
    plan: null,
    trialEndsAt: null,
    status: 'none',
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) hydrate(data.session.user);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) hydrate(session.user);
      else setUser(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  function hydrate(u: { id: string; email?: string; user_metadata?: any }) {
    setUser({
      id: u.id,
      email: u.email ?? '',
      name: u.user_metadata?.full_name ?? u.user_metadata?.name ?? 'Creator',
    });
  }

  // In demo mode (no Supabase keys) we simulate a local session.
  function demoUser(email: string, name: string): AppUser {
    return { id: 'demo-user', email, name };
  }

  const signUp = async (email: string, password: string, name: string) => {
    if (!isSupabaseConfigured) {
      setUser(demoUser(email, name || 'Creator'));
      startTrial('plus');
      return;
    }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    if (error) throw error;
    startTrial('plus');
  };

  const signIn = async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      setUser(demoUser(email, 'Creator'));
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signInWithGoogle = async () => {
    if (!isSupabaseConfigured) {
      setUser(demoUser('you@gmail.com', 'Google Creator'));
      return;
    }
    const redirectTo = AuthSession.makeRedirectUri({ scheme: 'toxoff' });
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;
    if (data.url) {
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === 'success' && result.url) {
        const url = new URL(result.url);
        const code = url.searchParams.get('code');
        if (code) await supabase.auth.exchangeCodeForSession(code);
      }
    }
  };

  const signOut = async () => {
    if (isSupabaseConfigured) await supabase.auth.signOut();
    setUser(null);
    setSubscription({ plan: null, trialEndsAt: null, status: 'none' });
  };

  const startTrial = (plan: PlanId) =>
    setSubscription({ plan, trialEndsAt: trialEnd(), status: 'trialing' });

  const setPlan = (plan: PlanId) =>
    setSubscription((s) => ({ ...s, plan, status: s.status === 'none' ? 'trialing' : s.status }));

  const value = useMemo<AuthValue>(
    () => ({
      user,
      subscription,
      loading,
      signUp,
      signIn,
      signInWithGoogle,
      signOut,
      startTrial,
      setPlan,
    }),
    [user, subscription, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
