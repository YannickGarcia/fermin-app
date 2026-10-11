/**
 * Supabase browser client. Not used by the prototype yet: the calendar runs
 * on the in-memory store in lib/data/store.ts. See docs/SPEC.md §9 for the
 * migration path (each store action becomes one RPC).
 */
import {createBrowserClient} from '@supabase/ssr';

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');
  return createBrowserClient(url, key);
}
