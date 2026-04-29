import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

/**
 * Returns true when the signed-in user is in public.super_admins.
 * Cached for 5 minutes to avoid hammering on every navigation.
 */
export function useSuperAdmin(): { isSuperAdmin: boolean; isLoading: boolean } {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['is-super-admin', user?.id],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('super_admins')
        .select('user_id', { count: 'exact', head: true })
        .eq('user_id', user!.id);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
  });
  return { isSuperAdmin: !!data, isLoading };
}
