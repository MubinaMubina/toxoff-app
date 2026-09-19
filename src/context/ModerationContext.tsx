import * as AuthSession from 'expo-auth-session';
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
import { Alert } from 'react-native';
import {
  DEFAULT_FILTERS,
  MOCK_ACCOUNTS,
  MOCK_FREE_COMMENTS_USED,
  MOCK_REMOVED,
} from '../data/mockData';
import { DEFAULT_FLAGGED_ACTION, DEFAULT_SENSITIVITY, flaggedActionOr, sensitivityOr } from '../data/moderationDefaults';
import { AD_REWARDS_PER_DAY, FREE_CHECKS_PER_MONTH, freePeriod } from '../data/plans';
import { initAds } from '../lib/ads';
import { apiPost } from '../lib/api';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { DAY_MS } from '../lib/time';
import {
  AutoEraseDays,
  CategoryKey,
  ConnectedAccount,
  FilterSettings,
  FlaggedAction,
  LogVisibility,
  ModerationReason,
  NotificationMode,
  Persona,
  Platform,
  RemovedComment,
  Sensitivity,
} from '../types';
import { useAuth } from './AuthContext';

type Metrics = { today: number; week: number; month: number };

/** Preferences set during onboarding (app/onboarding.tsx); each changeable later in Settings. */
export type Preferences = {
  persona: Persona | null;
  logVisibility: LogVisibility;
  autoEraseDays: AutoEraseDays;
  notificationMode: NotificationMode;
};

export type OnboardingAnswers = Preferences & {
  sensitivity: Sensitivity;
  categories: Record<CategoryKey, boolean>;
  keywords: string[];
  flaggedAction?: FlaggedAction;
  pushToken?: string | null; // omitted: preserve the existing token and permission
};

/** The Free plan's comment checks: this month's allowance, plus the pool of extra ones. */
export type FreeChecks = {
  used: number; // this month
  allowance: number; // FREE_CHECKS_PER_MONTH
  bonus: number; // extra checks left, from invites and rewarded ads
  left: number; // in all: the rest of this month's, plus the extra ones
  periodEnd: string | null; // ISO: when the monthly count starts again
  adsLeftToday: number; // rewarded ads still available today
};

const DEFAULT_PREFERENCES: Preferences = {
  persona: null,
  logVisibility: 'conceal_deleted',
  autoEraseDays: null,
  notificationMode: 'each',
};

/** loading: first fetch in flight (screens show skeletons); offline: it failed (banner + retry). */
export type LoadStatus = 'loading' | 'ready' | 'offline';

type ModerationValue = {
  status: LoadStatus;
  /** When the app last fetched account status; not a moderation-engine heartbeat. */
  lastSyncedAt: string | null;
  /** Fetches everything again, e.g. from the offline banner. */
  reload: () => void;
  accounts: ConnectedAccount[];
  comments: RemovedComment[]; // active (not restored, not erased), newest first
  filters: FilterSettings;
  preferences: Preferences;
  /** Whether this comment's words should stay out of sight, per the user's log visibility. */
  concealed: (c: RemovedComment) => boolean;
  notificationsEnabled: boolean;
  metrics: Metrics;
  freeChecks: FreeChecks;
  /** Re-reads the checks and today's ad rewards, e.g. after watching an ad. */
  refreshFreeChecks: () => Promise<void>;
  connectAccount: (platform: Platform, returnPath?: 'connect-accounts' | 'onboarding') => Promise<void>;
  disconnectAccount: (id: string) => Promise<void>;
  togglePause: (id: string) => void;
  restoreComment: (id: string) => Promise<void>;
  /** Wipes deleted comments from the log for good: the ids given, or all of them. */
  eraseDeletedComments: (ids?: string[]) => Promise<void>;
  setSensitivity: (s: Sensitivity) => void;
  setFlaggedAction: (a: FlaggedAction) => void;
  toggleCategory: (c: CategoryKey) => void;
  addKeyword: (w: string) => void;
  removeKeyword: (w: string) => void;
  addBlockedUser: (u: string) => void;
  removeBlockedUser: (u: string) => void;
  setNotificationsEnabled: (v: boolean) => void;
  savePushToken: (token: string) => void;
  setPersona: (p: Persona) => void;
  setLogVisibility: (v: LogVisibility) => void;
  setAutoEraseDays: (d: AutoEraseDays) => void;
  /** 'none' also turns notifications off; the other modes turn them on. */
  setNotificationMode: (m: NotificationMode) => void;
  /** Saves every onboarding answer at once: filters and preferences. */
  applyOnboarding: (answers: OnboardingAnswers) => Promise<void>;
};

type AccountRow = {
  id: string;
  platform: Platform;
  handle: string;
  connected: boolean | null;
  paused: boolean | null;
};

type LogRow = {
  id: string;
  platform: Platform;
  username: string;
  text: string;
  reason: ModerationReason;
  confidence: number;
  language: string | null;
  post_ref: string | null;
  restored: boolean | null;
  action: 'hidden' | 'deleted' | null;
  erased_at: string | null;
  created_at: string;
};

type FiltersRow = {
  sensitivity: Sensitivity | null;
  categories: Partial<Record<CategoryKey, boolean>> | null;
  keywords: string[] | null;
  blocked_users: string[] | null;
  flagged_action: FlaggedAction | null;
};

const ModerationContext = createContext<ModerationValue | undefined>(undefined);

const ACCOUNT_COLUMNS = 'id, platform, handle, connected, paused';
const LOG_COLUMNS =
  'id, platform, username, text, reason, confidence, language, post_ref, restored, action, erased_at, created_at';
const LOG_LIMIT = 200;

const PROFILE_PREFS =
  'notifications_enabled, free_comments_used, free_period_start, bonus_comment_checks, created_at, persona, log_visibility, auto_erase_days, notification_mode';

type ProfilePrefsRow = {
  notifications_enabled: boolean;
  free_comments_used: number;
  free_period_start: string | null;
  bonus_comment_checks: number | null;
  created_at: string | null;
  persona: Persona | null;
  log_visibility: LogVisibility | null;
  auto_erase_days: number | null;
  notification_mode: NotificationMode | null;
};

const toPreferences = (p: ProfilePrefsRow): Preferences => ({
  persona: p.persona ?? null,
  logVisibility: p.log_visibility ?? DEFAULT_PREFERENCES.logVisibility,
  autoEraseDays: p.auto_erase_days === 7 || p.auto_erase_days === 30 ? p.auto_erase_days : null,
  notificationMode: p.notification_mode ?? DEFAULT_PREFERENCES.notificationMode,
});

const ZERO_METRICS: Metrics = { today: 0, week: 0, month: 0 };
const EMPTY_FILTERS: FilterSettings = {
  sensitivity: DEFAULT_SENSITIVITY,
  categories: DEFAULT_FILTERS.categories,
  keywords: [],
  blockedUsers: [],
  flaggedAction: DEFAULT_FLAGGED_ACTION,
};

const toAccount = (r: AccountRow): ConnectedAccount => ({
  id: r.id,
  platform: r.platform,
  handle: r.handle,
  connected: r.connected ?? true,
  paused: r.paused ?? false,
});

const toComment = (r: LogRow): RemovedComment => ({
  id: r.id,
  platform: r.platform,
  username: r.username,
  text: r.text,
  reason: r.reason,
  confidence: r.confidence,
  language: r.language,
  postRef: r.post_ref ?? '—',
  createdAt: r.created_at,
  restored: r.restored ?? false,
  action: r.action ?? 'hidden',
  erased: r.erased_at != null,
});

const toFilters = (r: FiltersRow): FilterSettings => ({
  sensitivity: sensitivityOr(r.sensitivity),
  categories: { ...EMPTY_FILTERS.categories, ...r.categories },
  keywords: r.keywords ?? [],
  blockedUsers: r.blocked_users ?? [],
  flaggedAction: flaggedActionOr(r.flagged_action),
});

// Counted server-side, over the whole log: beyond the rows loaded here, and beyond the days the
// Free plan's log reaches back.
async function fetchMetrics(): Promise<Metrics> {
  const { data, error } = await supabase.rpc('moderation_counts');
  if (error) throw error;
  const counts = (data ?? {}) as Partial<Metrics>;
  return { today: counts.today ?? 0, week: counts.week ?? 0, month: counts.month ?? 0 };
}

// Rewarded ads watched in the last day (the backend records each one Google confirms).
async function fetchAdsToday(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('ad_rewards')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', new Date(Date.now() - DAY_MS).toISOString());
  if (error) throw error;
  return count ?? 0;
}

// What the profile says about the free checks; the current month is worked out at render time.
type ChecksRow = { used: number; periodStart: string | null; joined: string | null };
const NO_CHECKS: ChecksRow = { used: 0, periodStart: null, joined: null };

export function ModerationProvider({ children }: { children: React.ReactNode }) {
  const { user, subscription } = useAuth();
  // null in demo mode: every mutation below checks it to decide whether to persist.
  const userId = isSupabaseConfigured ? user?.id ?? null : null;

  const [accounts, setAccounts] = useState<ConnectedAccount[]>(
    isSupabaseConfigured ? [] : MOCK_ACCOUNTS
  );
  const [allComments, setAllComments] = useState<RemovedComment[]>(
    isSupabaseConfigured ? [] : MOCK_REMOVED
  );
  const [filters, setFilters] = useState<FilterSettings>(
    isSupabaseConfigured ? EMPTY_FILTERS : DEFAULT_FILTERS
  );
  const [notificationsEnabled, setNotificationsEnabledState] = useState(true);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [status, setStatus] = useState<LoadStatus>(isSupabaseConfigured ? 'loading' : 'ready');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [liveMetrics, setLiveMetrics] = useState<Metrics>(ZERO_METRICS);
  const [checksRow, setChecksRow] = useState<ChecksRow>(
    isSupabaseConfigured ? NO_CHECKS : { ...NO_CHECKS, used: MOCK_FREE_COMMENTS_USED }
  );
  const [bonusChecks, setBonusChecks] = useState(0);
  const [adsToday, setAdsToday] = useState(0);
  const filtersDirty = useRef(false);

  const refreshMetrics = useCallback(() => {
    if (!userId) return;
    fetchMetrics()
      .then(setLiveMetrics)
      .catch((e) => console.warn('Could not load metrics', e));
  }, [userId]);

  const refreshFreeChecks = useCallback(async () => {
    if (!userId) return;
    const [prof, ads] = await Promise.all([
      supabase.from('profiles').select('free_comments_used, free_period_start, bonus_comment_checks, created_at').eq('id', userId).single(),
      fetchAdsToday(userId),
    ]);
    if (prof.error) throw prof.error;
    const p = prof.data as Pick<ProfilePrefsRow, 'free_comments_used' | 'free_period_start' | 'bonus_comment_checks' | 'created_at'>;
    setChecksRow({ used: p.free_comments_used, periodStart: p.free_period_start, joined: p.created_at });
    setBonusChecks(p.bonus_comment_checks ?? 0);
    setAdsToday(ads);
  }, [userId]);

  // Ads show on the Free plan only; the SDK is set up once someone who'll see them is signed in.
  useEffect(() => {
    if (userId && !subscription.paying) initAds().catch((e) => console.warn('Could not set up ads', e));
  }, [userId, subscription.paying]);

  const reloadAccounts = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('accounts')
      .select(ACCOUNT_COLUMNS)
      .eq('user_id', userId)
      .order('created_at');
    if (error) throw error;
    setAccounts((data as AccountRow[]).map(toAccount));
    setLastSyncedAt(new Date().toISOString());
  }, [userId]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (!userId) {
      setAccounts([]);
      setAllComments([]);
      setFilters(EMPTY_FILTERS);
      setPreferences(DEFAULT_PREFERENCES);
      setLiveMetrics(ZERO_METRICS);
      setChecksRow(NO_CHECKS);
      setBonusChecks(0);
      setAdsToday(0);
      setLastSyncedAt(null);
      setStatus('loading'); // the next user starts with skeletons, not the last one's data
      return;
    }

    let cancelled = false;
    setStatus('loading');
    (async () => {
      const [acc, flt, log, prof, ads] = await Promise.all([
        supabase.from('accounts').select(ACCOUNT_COLUMNS).eq('user_id', userId).order('created_at'),
        supabase
          .from('filters')
          .select('sensitivity, categories, keywords, blocked_users, flagged_action')
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('moderation_log')
          .select(LOG_COLUMNS)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(LOG_LIMIT),
        supabase
          .from('profiles')
          .select(PROFILE_PREFS)
          .eq('id', userId)
          .maybeSingle(),
        fetchAdsToday(userId).catch((e) => {
          console.warn('Could not load ad rewards', e);
          return 0;
        }),
      ]);
      if (cancelled) return;
      const error = acc.error ?? flt.error ?? log.error ?? prof.error;
      if (error) {
        // Most often no connection; the screens show a banner with Retry instead of empty states.
        console.warn('Could not load moderation data', error.message);
        setStatus('offline');
        return;
      }
      setStatus('ready');
      setLastSyncedAt(new Date().toISOString());
      setAccounts(((acc.data ?? []) as AccountRow[]).map(toAccount));
      setAllComments(((log.data ?? []) as LogRow[]).map(toComment));
      if (flt.data) setFilters(toFilters(flt.data as FiltersRow));
      if (prof.data) {
        const p = prof.data as ProfilePrefsRow;
        setNotificationsEnabledState(p.notifications_enabled);
        setChecksRow({ used: p.free_comments_used, periodStart: p.free_period_start, joined: p.created_at });
        setBonusChecks(p.bonus_comment_checks ?? 0);
        setPreferences(toPreferences(p));
      }
      setAdsToday(ads);
    })().catch((e) => {
      if (cancelled) return;
      console.warn('Could not load moderation data', e);
      setStatus('offline');
    });
    refreshMetrics();

    // The backend's writes show up without a refresh: removed comments, the free-checks meter and
    // checks earned by invites and rewarded ads.
    const channel = supabase
      .channel(`moderation:${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'accounts', filter: `user_id=eq.${userId}` },
        (payload) => {
          const account = toAccount(payload.new as AccountRow);
          setAccounts((prev) => prev.map((item) => item.id === account.id ? account : item));
          setLastSyncedAt(new Date().toISOString());
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'moderation_log', filter: `user_id=eq.${userId}` },
        (payload) => {
          setAllComments((prev) => [toComment(payload.new as LogRow), ...prev]);
          refreshMetrics();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (payload) => {
          const row = payload.new as Partial<ProfilePrefsRow>;
          if (typeof row.free_comments_used === 'number') {
            setChecksRow((c) => ({ ...c, used: row.free_comments_used!, periodStart: row.free_period_start ?? c.periodStart }));
          }
          if (typeof row.bonus_comment_checks === 'number') {
            setBonusChecks((was) => {
              // More extra checks: an invite or a rewarded ad landed; recount today's ads.
              if (row.bonus_comment_checks! > was) fetchAdsToday(userId).then(setAdsToday).catch(() => {});
              return row.bonus_comment_checks!;
            });
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId, refreshMetrics, reloadTick]);

  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  // Filter edits are saved half a second after the last change, so rapid toggles make one write.
  useEffect(() => {
    if (!userId || !filtersDirty.current) return;
    const timer = setTimeout(() => {
      filtersDirty.current = false;
      supabase
        .from('filters')
        .update({
          sensitivity: filters.sensitivity,
          categories: filters.categories,
          keywords: filters.keywords,
          blocked_users: filters.blockedUsers,
          flagged_action: filters.flaggedAction,
        })
        .eq('user_id', userId)
        .then(({ error }) => {
          if (error) Alert.alert('Could not save your filters', error.message);
        });
    }, 500);
    return () => clearTimeout(timer);
  }, [filters, userId]);

  const editFilters = useCallback((update: (f: FilterSettings) => FilterSettings) => {
    filtersDirty.current = true;
    setFilters(update);
  }, []);

  const comments = useMemo(
    () =>
      allComments
        .filter((c) => !c.restored && !c.erased)
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [allComments]
  );

  // Erased comments still count: they were removed, only their words are gone (as in fetchMetrics).
  const demoMetrics = useMemo<Metrics>(() => {
    const now = Date.now();
    const counted = allComments.filter((c) => !c.restored);
    const within = (ms: number) => counted.filter((c) => now - +new Date(c.createdAt) <= ms).length;
    return { today: within(DAY_MS), week: within(7 * DAY_MS), month: within(30 * DAY_MS) };
  }, [allComments]);

  const metrics = isSupabaseConfigured ? liveMetrics : demoMetrics;

  // The profile's count belongs to the month it was made in; a month that has since ended means
  // nothing has been counted this month yet. Mirrors consume_comment_check() (supabase/migrations).
  const freeChecks = useMemo<FreeChecks>(() => {
    const joined = checksRow.joined ? new Date(checksRow.joined) : null;
    const period = joined ? freePeriod(joined) : null;
    const thisMonth = !period || (checksRow.periodStart !== null && new Date(checksRow.periodStart) >= period.start);
    const used = thisMonth ? checksRow.used : 0;
    return {
      used,
      allowance: FREE_CHECKS_PER_MONTH,
      bonus: bonusChecks,
      left: Math.max(0, FREE_CHECKS_PER_MONTH - used) + bonusChecks,
      periodEnd: period?.end.toISOString() ?? null,
      adsLeftToday: Math.max(0, AD_REWARDS_PER_DAY - adsToday),
    };
  }, [checksRow, bonusChecks, adsToday]);

  const connectAccount = useCallback(
    async (platform: Platform, returnPath: 'connect-accounts' | 'onboarding' = 'connect-accounts') => {
      if (platform !== 'instagram') throw new Error('TikTok support is coming soon. Connect Instagram to start protection.');
      if (!userId) {
        await new Promise((resolve) => setTimeout(resolve, 1100)); // simulated consent screen
        setAccounts((prev) => [
          ...prev,
          {
            id: `demo_${platform}_${Date.now()}`,
            platform,
            handle: prev.length ? `@yourbrand${prev.length + 1}` : '@yourbrand',
            connected: true,
            paused: false,
          },
        ]);
        return;
      }
      // The backend's OAuth callback sends the browser back here (Expo Go uses an exp:// URL).
      const returnUrl = AuthSession.makeRedirectUri({ scheme: 'toxoff', path: returnPath });
      const { url } = await apiPost<{ url: string }>('/connect/start', { platform, returnUrl });
      const result = await WebBrowser.openAuthSessionAsync(url, returnUrl);
      if (result.type !== 'success') return;
      const params = new URL(result.url).searchParams;
      const failure = params.get('error');
      if (failure) throw new Error(failure);
      const pending = params.get('pending');
      if (!pending) return; // cancelled on the platform's consent screen
      // Linking happens with this session, so only the person who started can finish.
      await apiPost('/connect/finish', { pending });
      await reloadAccounts();
    },
    [userId, reloadAccounts]
  );

  const disconnectAccount = useCallback(
    async (id: string) => {
      if (userId) {
        const { error } = await supabase.from('accounts').delete().eq('id', id);
        if (error) throw error;
      }
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    },
    [userId]
  );

  const togglePause = useCallback(
    (id: string) => {
      const account = accounts.find((a) => a.id === id);
      if (!account) return;
      const paused = !account.paused;
      const apply = (value: boolean) =>
        setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, paused: value } : a)));
      apply(paused);
      if (!userId) return;
      supabase
        .from('accounts')
        .update({ paused })
        .eq('id', id)
        .then(({ error }) => {
          if (!error) return;
          apply(!paused);
          Alert.alert('Could not update account', error.message);
        });
    },
    [accounts, userId]
  );

  // Live restores go through the backend, which un-hides the comment on the platform first.
  const restoreComment = useCallback(
    async (id: string) => {
      if (userId) await apiPost('/comments/restore', { commentId: id });
      setAllComments((prev) => prev.map((c) => (c.id === id ? { ...c, restored: true } : c)));
      refreshMetrics();
    },
    [userId, refreshMetrics]
  );

  // The backend wipes the text and author but keeps the rows, so Home's counts don't change.
  const eraseDeletedComments = useCallback(
    async (ids?: string[]) => {
      if (userId) await apiPost('/comments/erase-deleted', ids ? { commentIds: ids } : {});
      setAllComments((prev) =>
        prev.map((c) =>
          c.action === 'deleted' && (!ids || ids.includes(c.id)) ? { ...c, text: '', username: '', erased: true } : c
        )
      );
    },
    [userId]
  );

  const setSensitivity = useCallback(
    (s: Sensitivity) => editFilters((f) => ({ ...f, sensitivity: s })),
    [editFilters]
  );

  const setFlaggedAction = useCallback(
    (a: FlaggedAction) => editFilters((f) => ({ ...f, flaggedAction: a })),
    [editFilters]
  );

  const toggleCategory = useCallback(
    (c: CategoryKey) =>
      editFilters((f) => ({
        ...f,
        categories: { ...f.categories, [c]: !f.categories[c] },
      })),
    [editFilters]
  );

  const addKeyword = useCallback(
    (w: string) => {
      const word = w.trim();
      if (!word) return;
      editFilters((f) =>
        f.keywords.some((k) => k.toLowerCase() === word.toLowerCase())
          ? f
          : { ...f, keywords: [...f.keywords, word] }
      );
    },
    [editFilters]
  );

  const removeKeyword = useCallback(
    (w: string) => editFilters((f) => ({ ...f, keywords: f.keywords.filter((k) => k !== w) })),
    [editFilters]
  );

  const addBlockedUser = useCallback(
    (u: string) => {
      const blocked = u.trim().replace(/^@/, '');
      if (!blocked) return;
      editFilters((f) =>
        f.blockedUsers.some((b) => b.toLowerCase() === blocked.toLowerCase())
          ? f
          : { ...f, blockedUsers: [...f.blockedUsers, blocked] }
      );
    },
    [editFilters]
  );

  const removeBlockedUser = useCallback(
    (u: string) =>
      editFilters((f) => ({
        ...f,
        blockedUsers: f.blockedUsers.filter((b) => b !== u),
      })),
    [editFilters]
  );

  const setNotificationsEnabled = useCallback(
    (enabled: boolean) => {
      setNotificationsEnabledState(enabled);
      if (!userId) return;
      supabase
        .from('profiles')
        .update({ notifications_enabled: enabled })
        .eq('id', userId)
        .then(({ error }) => {
          if (error) console.warn('Could not save notification preference', error.message);
        });
    },
    [userId]
  );

  const savePushToken = useCallback(
    (token: string) => {
      if (!userId) return;
      supabase
        .from('profiles')
        .update({ push_token: token })
        .eq('id', userId)
        .then(({ error }) => {
          if (error) console.warn('Could not save push token', error.message);
        });
    },
    [userId]
  );

  // Preferences are saved straight away, one column each; the state updates first.
  const savePreference = useCallback(
    (patch: Partial<Preferences>, columns: Record<string, unknown>) => {
      setPreferences((p) => ({ ...p, ...patch }));
      if (!userId) return;
      supabase
        .from('profiles')
        .update(columns)
        .eq('id', userId)
        .then(({ error }) => {
          if (error) Alert.alert('Could not save your preference', error.message);
        });
    },
    [userId]
  );

  const setPersona = useCallback((persona: Persona) => savePreference({ persona }, { persona }), [savePreference]);
  const setLogVisibility = useCallback(
    (logVisibility: LogVisibility) => savePreference({ logVisibility }, { log_visibility: logVisibility }),
    [savePreference]
  );
  const setAutoEraseDays = useCallback(
    (autoEraseDays: AutoEraseDays) => savePreference({ autoEraseDays }, { auto_erase_days: autoEraseDays }),
    [savePreference]
  );
  const setNotificationMode = useCallback(
    (notificationMode: NotificationMode) => {
      setNotificationsEnabledState(notificationMode !== 'none');
      savePreference(
        { notificationMode },
        { notification_mode: notificationMode, notifications_enabled: notificationMode !== 'none' }
      );
    },
    [savePreference]
  );

  const applyOnboarding = useCallback(
    async (a: OnboardingAnswers) => {
      const nextFilters: FilterSettings = {
        ...filters,
        sensitivity: a.sensitivity,
        categories: a.categories,
        keywords: a.keywords,
        flaggedAction: a.flaggedAction ?? DEFAULT_FLAGGED_ACTION,
      };
      const notificationsOn = a.notificationMode !== 'none' &&
        (a.pushToken === undefined ? notificationsEnabled : a.pushToken !== null);
      if (userId) {
        // Confirm the filter row was saved before onboarding may connect an account.
        const f = await supabase
          .from('filters')
          .update({ sensitivity: a.sensitivity, categories: a.categories, keywords: a.keywords, flagged_action: nextFilters.flaggedAction })
          .eq('user_id', userId)
          .select('user_id')
          .single();
        if (f.error) throw f.error;
        const p = await supabase
          .from('profiles')
          .update({
            persona: a.persona,
            log_visibility: a.logVisibility,
            auto_erase_days: a.autoEraseDays,
            notification_mode: a.notificationMode,
            notifications_enabled: notificationsOn,
            ...(a.pushToken !== undefined ? { push_token: a.pushToken } : {}),
          })
          .eq('id', userId)
          .select('id')
          .single();
        if (p.error) throw p.error;
      }
      filtersDirty.current = false;
      setFilters(nextFilters);
      setPreferences({ persona: a.persona, logVisibility: a.logVisibility, autoEraseDays: a.autoEraseDays, notificationMode: a.notificationMode });
      setNotificationsEnabledState(notificationsOn);
    },
    [filters, userId, notificationsEnabled]
  );

  const concealed = useCallback(
    (c: RemovedComment) =>
      preferences.logVisibility === 'count_only' ||
      (preferences.logVisibility === 'conceal_deleted' && c.action === 'deleted'),
    [preferences.logVisibility]
  );

  const value = useMemo<ModerationValue>(
    () => ({
      status,
      lastSyncedAt,
      reload,
      accounts,
      comments,
      filters,
      preferences,
      concealed,
      notificationsEnabled,
      metrics,
      freeChecks,
      refreshFreeChecks,
      connectAccount,
      disconnectAccount,
      togglePause,
      restoreComment,
      eraseDeletedComments,
      setSensitivity,
      setFlaggedAction,
      toggleCategory,
      addKeyword,
      removeKeyword,
      addBlockedUser,
      removeBlockedUser,
      setNotificationsEnabled,
      savePushToken,
      setPersona,
      setLogVisibility,
      setAutoEraseDays,
      setNotificationMode,
      applyOnboarding,
    }),
    [
      status,
      lastSyncedAt,
      reload,
      accounts,
      comments,
      filters,
      preferences,
      concealed,
      notificationsEnabled,
      metrics,
      freeChecks,
      refreshFreeChecks,
      connectAccount,
      disconnectAccount,
      togglePause,
      restoreComment,
      eraseDeletedComments,
      setSensitivity,
      setFlaggedAction,
      toggleCategory,
      addKeyword,
      removeKeyword,
      addBlockedUser,
      removeBlockedUser,
      setNotificationsEnabled,
      savePushToken,
      setPersona,
      setLogVisibility,
      setAutoEraseDays,
      setNotificationMode,
      applyOnboarding,
    ]
  );

  return (
    <ModerationContext.Provider value={value}>
      {children}
    </ModerationContext.Provider>
  );
}

export function useModeration() {
  const ctx = useContext(ModerationContext);
  if (!ctx) throw new Error('useModeration must be used within ModerationProvider');
  return ctx;
}
