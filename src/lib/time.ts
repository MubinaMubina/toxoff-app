export const DAY_MS = 86_400_000;

export function timeAgo(iso: string, now: number = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  return `${w}w ago`;
}

export function fullTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "Sep 20", or "Sep 20, 2027" when it isn't this year. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  const otherYear = d.getFullYear() !== new Date().getFullYear();
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(otherYear && { year: 'numeric' }) });
}

/** Blur a username for the log: keep first 2 chars, mask the rest. */
export function blurUsername(username: string): string {
  const u = username.replace(/^@/, '');
  if (u.length <= 2) return `@${u[0] ?? ''}•••`;
  return `@${u.slice(0, 2)}${'•'.repeat(Math.min(6, u.length - 2))}`;
}
