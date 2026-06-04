import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import {
  DEFAULT_FILTERS,
  MOCK_ACCOUNTS,
  MOCK_REMOVED,
} from '../data/mockData';
import {
  CategoryKey,
  ConnectedAccount,
  FilterSettings,
  Platform,
  RemovedComment,
  Sensitivity,
} from '../types';

type Metrics = { today: number; week: number; month: number };

type ModerationValue = {
  accounts: ConnectedAccount[];
  comments: RemovedComment[]; // active (not restored), newest first
  filters: FilterSettings;
  notificationsEnabled: boolean;
  metrics: Metrics;
  connectAccount: (platform: Platform, handle?: string) => void;
  disconnectAccount: (id: string) => void;
  togglePause: (id: string) => void;
  restoreComment: (id: string) => void;
  setSensitivity: (s: Sensitivity) => void;
  toggleCategory: (c: CategoryKey) => void;
  addKeyword: (w: string) => void;
  removeKeyword: (w: string) => void;
  addBlockedUser: (u: string) => void;
  removeBlockedUser: (u: string) => void;
  setNotificationsEnabled: (v: boolean) => void;
};

const ModerationContext = createContext<ModerationValue | undefined>(undefined);

const DAY = 86_400_000;
const NOW = new Date('2026-06-05T14:30:00Z').getTime();

export function ModerationProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>(MOCK_ACCOUNTS);
  const [allComments, setAllComments] = useState<RemovedComment[]>(MOCK_REMOVED);
  const [filters, setFilters] = useState<FilterSettings>(DEFAULT_FILTERS);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const comments = useMemo(
    () =>
      allComments
        .filter((c) => !c.restored)
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [allComments]
  );

  const metrics = useMemo<Metrics>(() => {
    const active = allComments.filter((c) => !c.restored);
    const within = (ms: number) =>
      active.filter((c) => NOW - +new Date(c.createdAt) <= ms).length;
    return { today: within(DAY), week: within(7 * DAY), month: within(30 * DAY) };
  }, [allComments]);

  const connectAccount = useCallback((platform: Platform, handle = '@yourbrand') => {
    setAccounts((prev) =>
      prev.map((a) =>
        a.platform === platform ? { ...a, connected: true, handle } : a
      )
    );
  }, []);

  const disconnectAccount = useCallback((id: string) => {
    setAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, connected: false, paused: false } : a))
    );
  }, []);

  const togglePause = useCallback((id: string) => {
    setAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, paused: !a.paused } : a))
    );
  }, []);

  const restoreComment = useCallback((id: string) => {
    setAllComments((prev) =>
      prev.map((c) => (c.id === id ? { ...c, restored: true } : c))
    );
  }, []);

  const setSensitivity = useCallback(
    (s: Sensitivity) => setFilters((f) => ({ ...f, sensitivity: s })),
    []
  );

  const toggleCategory = useCallback(
    (c: CategoryKey) =>
      setFilters((f) => ({
        ...f,
        categories: { ...f.categories, [c]: !f.categories[c] },
      })),
    []
  );

  const addKeyword = useCallback((w: string) => {
    const word = w.trim();
    if (!word) return;
    setFilters((f) =>
      f.keywords.some((k) => k.toLowerCase() === word.toLowerCase())
        ? f
        : { ...f, keywords: [...f.keywords, word] }
    );
  }, []);

  const removeKeyword = useCallback(
    (w: string) =>
      setFilters((f) => ({ ...f, keywords: f.keywords.filter((k) => k !== w) })),
    []
  );

  const addBlockedUser = useCallback((u: string) => {
    const user = u.trim().replace(/^@/, '');
    if (!user) return;
    setFilters((f) =>
      f.blockedUsers.some((b) => b.toLowerCase() === user.toLowerCase())
        ? f
        : { ...f, blockedUsers: [...f.blockedUsers, user] }
    );
  }, []);

  const removeBlockedUser = useCallback(
    (u: string) =>
      setFilters((f) => ({
        ...f,
        blockedUsers: f.blockedUsers.filter((b) => b !== u),
      })),
    []
  );

  const value = useMemo<ModerationValue>(
    () => ({
      accounts,
      comments,
      filters,
      notificationsEnabled,
      metrics,
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
    }),
    [accounts, comments, filters, notificationsEnabled, metrics]
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
