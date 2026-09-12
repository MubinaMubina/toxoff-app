// toxoff backend: Instagram connect, comment webhooks, restores and token refresh.
// Routes are in router.ts; deploy with `npx supabase functions deploy api`.
import { handle } from './router.ts';

Deno.serve(handle);
