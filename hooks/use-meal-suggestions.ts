'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { databaseClient } from '@/lib/supabase/database-client';
import { fetchAllRows } from '@/lib/supabase/pagination';

export function useMealSuggestionHistory() {
  const { user } = useAuth();
  const db = databaseClient(createClient());
  return useQuery({
    queryKey: ['meal-suggestions', user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const [ratings, requests, merges] = await Promise.all([
        fetchAllRows((from,to) => db.from('menu_ratings').select('menu_item,rating,rated_by').order('id').range(from,to)),
        fetchAllRows((from,to) => db.from('food_requests').select('food_name,status,completed_at,requested_by').order('id').range(from,to)),
        fetchAllRows((from,to) => db.from('menu_item_merges').select('source_name,canonical_name').is('unmerged_at',null).order('id').range(from,to)),
      ]);
      return { ratings, requests, merges: merges.map(merge => ({ sourceName: merge.source_name, canonicalName: merge.canonical_name })) };
    },
  });
}
