import type { ConnectedAccount } from '../types';

export type ProtectionSummary = {
  kind: 'loading' | 'offline' | 'unconnected' | 'quota' | 'attention' | 'paused' | 'active';
  title: string;
  description: string;
  activeCount: number;
  tone: 'primary' | 'warning';
  action: 'connect' | 'upgrade' | 'manage' | 'retry' | null;
};

type ProtectionInput = {
  accounts: readonly ConnectedAccount[];
  maxAccounts: number;
  outOfFreeChecks: boolean;
  status: 'loading' | 'ready' | 'offline';
};

/** Summarize verified coverage without treating cached or unsupported accounts as protected. */
export function getProtectionSummary({
  accounts,
  maxAccounts,
  outOfFreeChecks,
  status,
}: ProtectionInput): ProtectionSummary {
  if (status === 'loading') {
    return {
      kind: 'loading',
      title: 'Checking your protection',
      description: 'Getting the latest account status.',
      activeCount: 0,
      tone: 'primary',
      action: null,
    };
  }

  if (status === 'offline') {
    return {
      kind: 'offline',
      title: 'Protection status unavailable',
      description: 'We couldn’t refresh your accounts. Try again to check their status.',
      activeCount: 0,
      tone: 'warning',
      action: 'retry',
    };
  }

  const instagramAccounts = accounts.filter((account) => account.platform === 'instagram');
  if (instagramAccounts.length === 0) {
    return {
      kind: 'unconnected',
      title: 'Connect Instagram to get protected',
      description: 'Connect your creator or business account to start checking comments.',
      activeCount: 0,
      tone: 'primary',
      action: 'connect',
    };
  }

  if (outOfFreeChecks) {
    return {
      kind: 'quota',
      title: 'Your free checks are used up',
      description: 'New comments aren’t being checked. Upgrade to keep moderation running.',
      activeCount: 0,
      tone: 'warning',
      action: 'upgrade',
    };
  }

  const limit = Number.isFinite(maxAccounts) ? Math.max(0, Math.floor(maxAccounts)) : 0;
  // Account order is significant: after a downgrade, the oldest accounts retain plan slots.
  // Paused, disconnected, and legacy TikTok entries must not shift that order.
  const activeCount = accounts.slice(0, limit).filter(
    (account) => account.platform === 'instagram' && account.connected && !account.paused
  ).length;
  const reconnectCount = instagramAccounts.filter((account) => !account.connected).length;
  const pausedCount = instagramAccounts.filter((account) => account.connected && account.paused).length;
  const overLimitCount = accounts.filter(
    (account, index) => account.platform === 'instagram' && index >= limit
  ).length;
  const hasUnsupportedAccount = instagramAccounts.length !== accounts.length;

  if (!hasUnsupportedAccount && reconnectCount === 0 && overLimitCount === 0 && activeCount === 0) {
    return {
      kind: 'paused',
      title: 'Protection is paused',
      description: 'Resume moderation to check new comments.',
      activeCount: 0,
      tone: 'warning',
      action: 'manage',
    };
  }

  if (activeCount !== accounts.length) {
    const reasons = [
      reconnectCount > 0
        ? `${reconnectCount} ${reconnectCount === 1 ? 'account needs' : 'accounts need'} reconnecting.`
        : null,
      pausedCount > 0
        ? `${pausedCount} ${pausedCount === 1 ? 'account is' : 'accounts are'} paused.`
        : null,
      overLimitCount > 0
        ? `${overLimitCount} ${overLimitCount === 1 ? 'account is' : 'accounts are'} outside your plan limit.`
        : null,
      hasUnsupportedAccount ? 'TikTok moderation is not available.' : null,
    ].filter(Boolean);
    return {
      kind: 'attention',
      title: activeCount > 0
        ? `${activeCount} of ${accounts.length} accounts protected`
        : reconnectCount > 0
          ? 'Reconnect Instagram'
          : 'Protection needs attention',
      description: reasons.join(' '),
      activeCount,
      tone: 'warning',
      action: 'manage',
    };
  }

  return {
    kind: 'active',
    title: activeCount === 1 ? 'Your Instagram is protected' : 'Your Instagram accounts are protected',
    description: 'New comments are checked automatically using your filters.',
    activeCount,
    tone: 'primary',
    action: null,
  };
}
