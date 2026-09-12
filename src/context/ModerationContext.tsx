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
import { apiPost } from '../lib/api';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { DAY_MS } from '../lib/time';
import {
  CategoryKey,
  ConnectedAccount,
  FilterSettings,
  ModerationReason,
  Platform,
  RemovedComment,
  Sensitivity,
} from '../types';
import { useAuth } from './AuthContext';

type Metrics = { today: number; week: number; month: number };

type ModerationValue = {
  accounts: ConnectedAccount[];
  comments: RemovedComment[]; // active (not restored), newest first
  filters: FilterSettings;
  notificationsEnabled: boolean;
  metrics: Metrics;
  freeCommentsUsed: number; // of FREE_COMMENT_ALLOWANCE, shared by the trial and Free
  connectAccount: (platform: Platform) => Promise<void>;
  disconnectAccount: (id: string) => Promise<void>;
  togglePause: (id: string) => void;
  restoreComment: (id: string) => Promise<void>;
  setSensitivity: (s: Sensitivity) => void;
  toggleCategory: (c: CategoryKey) => void;
  addKeyword: (w: string) => void;
  removeKeyword: (w: string) => void;
  addBlockedUser: (u: string) => void;
  removeBlockedUser: (u: string) => void;
  setNotificationsEnabled: (v: boolean) => void;
  savePushToken: (token: string) => void;
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
  created_at: string;
};

type FiltersRow = {
  sensitivity: Sensitivity | null;
  categories: Partial<Record<CategoryKey, boolean>> | null;
  keywords: string[] | null;
  blocked_users: string[] | null;
};

const ModerationContext = createContext<ModerationValue | undefined>(undefined);

const ACCOUNT_COLUMNS = 'id, platform, handle, connected, paused';
const LOG_COLUMNS =
  'id, platform, username, text, reason, confidence, language, post_ref, restored, created_at';
const LOG_LIMIT = 200;
// The backend's OAuth callback redirects here when the platform consent screen finishes.
const CONNECT_RETURN_URL = 'toxoff://connect-accounts';

const ZERO_METRICS: Metrics = { today: 0, week: 0, month: 0 };
const EMPTY_FILTERS: FilterSettings = {
  sensitivity: 'medium',
  categories: DEFAULT_FILTERS.categories,
  keywords: [],
  blockedUsers: [],
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
  language: r.language ?? 'Unknown',
  postRef: r.post_ref ?? '—',
  createdAt: r.created_at,
  restored: r.restored ?? false,
});

const toFilters = (r: FiltersRow): FilterSettings => ({
  sensitivity: r.sensitivity ?? 'medium',
  categories: { ...EMPTY_FILTERS.categories, ...r.categories },
  keywords: r.keywords ?? [],
  blockedUsers: r.blocked_users ?? [],
});

// Counted server-side so metrics stay right beyond the rows loaded into the log.
async function fetchMetrics(userId: string): Promise<Metrics> {
  const since = (ms: number) =>
    supabase
      .from('moderation_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('restored', false)
      .gte('created_at', new Date(Date.now() - ms).toISOString());
  const [today, week, month] = await Promise.all([since(DAY_MS), since(7 * DAY_MS), since(30 * DAY_MS)]);
  return { today: today.count ?? 0, week: week.count ?? 0, month: month.count ?? 0 };
}

export function ModerationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
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
  const [liveMetrics, setLiveMetrics] = useState<Metrics>(ZERO_METRICS);
  const [freeCommentsUsed, setFreeCommentsUsed] = useState(
    isSupabaseConfigured ? 0 : MOCK_FREE_COMMENTS_USED
  );
  const filtersDirty = useRef(false);

  const refreshMetrics = useCallback(() => {
    if (!userId) return;
    fetchMetrics(userId)
      .then(setLiveMetrics)
      .catch((e) => console.warn('Could not load metrics', e));
  }, [userId]);

  const reloadAccounts = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('accounts')
      .select(ACCOUNT_COLUMNS)
      .eq('user_id', userId)
      .order('created_at');
    if (error) throw error;
    setAccounts((data as AccountRow[]).map(toAccount));
  }, [userId]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (!userId) {
      setAccounts([]);
      setAllComments([]);
      setFilters(EMPTY_FILTERS);
      setLiveMetrics(ZERO_METRICS);
      setFreeCommentsUsed(0);
      return;
    }

    let cancelled = false;
    (async () => {
      const [acc, flt, log, prof] = await Promise.all([
        supabase.from('accounts').select(ACCOUNT_COLUMNS).eq('user_id', userId).order('created_at'),
        supabase
          .from('filters')
          .select('sensitivity, categories, keywords, blocked_users')
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
          .select('notifications_enabled, free_comments_used')
          .eq('id', userId)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const error = acc.error ?? flt.error ?? log.error ?? prof.error;
      if (error) console.warn('Could not load moderation data', error.message);
      setAccounts(((acc.data ?? []) as AccountRow[]).map(toAccount));
      setAllComments(((log.data ?? []) as LogRow[]).map(toComment));
      if (flt.data) setFilters(toFilters(flt.data as FiltersRow));
      if (prof.data) {
        setNotificationsEnabledState(prof.data.notifications_enabled);
        setFreeCommentsUsed(prof.data.free_comments_used);
      }
    })().catch((e) => console.warn('Could not load moderation data', e));
    refreshMetrics();

    // The backend's writes show up without a refresh: removed comments and the free-checks meter.
    const channel = supabase
      .channel(`moderation:${userId}`)
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
          const row = payload.new as { free_comments_used?: number };
          if (typeof row.free_comments_used === 'number') setFreeCommentsUsed(row.free_comments_used);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId, refreshMetrics]);

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
        .filter((c) => !c.restored)
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [allComments]
  );

  const demoMetrics = useMemo<Metrics>(() => {
    const now = Date.now();
    const within = (ms: number) => comments.filter((c) => now - +new Date(c.createdAt) <= ms).length;
    return { today: within(DAY_MS), week: within(7 * DAY_MS), month: within(30 * DAY_MS) };
  }, [comments]);

  const metrics = isSupabaseConfigured ? liveMetrics : demoMetrics;

  const connectAccount = useCallback(
    async (platform: Platform) => {
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
      const { url } = await apiPost<{ url: string }>('/connect/start', { platform });
      const result = await WebBrowser.openAuthSessionAsync(url, CONNECT_RETURN_URL);
      if (result.type !== 'success') return;
      const failure = new URL(result.url).searchParams.get('error');
      if (failure) throw new Error(failure);
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

  const setSensitivity = useCallback(
    (s: Sensitivity) => editFilters((f) => ({ ...f, sensitivity: s })),
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

  const value = useMemo<ModerationValue>(
    () => ({
      accounts,
      comments,
      filters,
      notificationsEnabled,
      metrics,
      freeCommentsUsed,
      connectAccount,
      disconnectAccount,
      togglePause,
      restoreComment,
      setSensitivity,
      toggleCategory,
      addKeyword,
      removeKeyword,
      addBlockedUser,
      removeBlockedUser,
      setNotificationsEnabled,
      savePushToken,
    }),
    [
      accounts,
      comments,
      filters,
      notificationsEnabled,
      metrics,
      freeCommentsUsed,
      connectAccount,
      disconnectAccount,
      togglePause,
      restoreComment,
      setSensitivity,
      toggleCategory,
      addKeyword,
      removeKeyword,
      addBlockedUser,
      removeBlockedUser,
      setNotificationsEnabled,
      savePushToken,
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
