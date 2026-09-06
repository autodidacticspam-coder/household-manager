import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/** Opt a shared client into generated schema checks as each data boundary is migrated. */
export function databaseClient(client: SupabaseClient): SupabaseClient<Database> {
  return client as SupabaseClient<Database>;
}
