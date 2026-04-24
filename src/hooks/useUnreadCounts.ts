import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Folder } from '@/lib/index';

export type UnreadCounts = Record<Folder, number>;

const EMPTY_COUNTS: UnreadCounts = {
  inbox: 0,
  sent: 0,
  drafts: 0,
  spam: 0,
  trash: 0,
};

// Returns per-folder unread counts for the given account. Runs a single grouped
// query; refreshed whenever the `unread-counts` cache is invalidated (e.g. by
// email mutations).
export function useUnreadCounts(accountId: string | null | undefined): UnreadCounts {
  const { data } = useQuery<UnreadCounts>({
    queryKey: ['unread-counts', accountId],
    queryFn: async () => {
      if (!accountId) return EMPTY_COUNTS;
      const { data: rows, error } = await supabase
        .from('emails')
        .select('folder')
        .eq('account_id', accountId)
        .eq('is_read', false);
      if (error) throw error;
      const counts: UnreadCounts = { ...EMPTY_COUNTS };
      for (const r of rows ?? []) {
        const f = (r as { folder: Folder }).folder;
        if (f in counts) counts[f]++;
      }
      return counts;
    },
    enabled: !!accountId,
    staleTime: 10_000,
  });
  return data ?? EMPTY_COUNTS;
}
