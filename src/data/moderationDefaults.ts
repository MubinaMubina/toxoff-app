import { FlaggedAction, Sensitivity } from '../types';

// What a new account starts with (decided 19 September 2026): the strictest level, and every
// flagged comment deleted for good. Both can be changed in onboarding and in Filters.
// Must match the column defaults on public.filters (supabase/migrations) and the fallbacks in
// loadFilters() (supabase/functions/api/pipeline.ts).
export const DEFAULT_SENSITIVITY: Sensitivity = 'high';
export const DEFAULT_FLAGGED_ACTION: FlaggedAction = 'delete';

const ACTIONS: readonly FlaggedAction[] = ['hide', 'auto', 'delete'];
const LEVELS: readonly Sensitivity[] = ['low', 'medium', 'high'];

/** A stored value if it is a known one, else the default. */
export const flaggedActionOr = (value: unknown): FlaggedAction =>
  ACTIONS.includes(value as FlaggedAction) ? (value as FlaggedAction) : DEFAULT_FLAGGED_ACTION;
export const sensitivityOr = (value: unknown): Sensitivity =>
  LEVELS.includes(value as Sensitivity) ? (value as Sensitivity) : DEFAULT_SENSITIVITY;
