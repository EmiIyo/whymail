import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

interface AdminPermissions {
  isSuperAdmin: boolean;
  canCreateDomains: boolean;
  isLoading: boolean;
}

/**
 * Returns the signed-in user's platform-level permissions:
 *  - isSuperAdmin: row in public.super_admins
 *  - canCreateDomains: super admin OR profile flag granted by super admin
 * Cached for 5 minutes; super admin grant/revoke invalidates the query.
 */
export function useSuperAdmin(): AdminPermissions {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-permissions', user?.id],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [superRes, profileRes] = await Promise.all([
        supabase
          .from('super_admins')
          .select('user_id', { count: 'exact', head: true })
          .eq('user_id', user!.id),
        supabase
          .from('profiles')
          .select('can_create_domains')
          .eq('id', user!.id)
          .maybeSingle(),
      ]);
      if (superRes.error) throw superRes.error;
      if (profileRes.error) throw profileRes.error;
      const isSuper = (superRes.count ?? 0) > 0;
      const flag = !!profileRes.data?.can_create_domains;
      return { isSuper, canCreate: isSuper || flag };
    },
  });
  return {
    isSuperAdmin: !!data?.isSuper,
    canCreateDomains: !!data?.canCreate,
    isLoading,
  };
}
