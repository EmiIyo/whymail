import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { accountsApi } from '@/api/index';
import { useAuth } from '@/hooks/useAuth';
import { useEmailStore } from '@/hooks/useEmailStore';

// Fetches the user's real email accounts and keeps the store in sync so the
// sidebar dropdown and activeAccountId always reflect the server truth.
// When no account is selected (or the selected one was deleted), picks the
// first available account.
export function useAccounts() {
  const { user } = useAuth();
  const accounts = useEmailStore((s) => s.accounts);
  const activeAccountId = useEmailStore((s) => s.activeAccountId);
  const setAccounts = useEmailStore((s) => s.setAccounts);
  const setActiveAccount = useEmailStore((s) => s.setActiveAccount);

  const query = useQuery({
    queryKey: ['accounts', user?.id],
    queryFn: () => accountsApi.list(),
    enabled: !!user,
  });

  useEffect(() => {
    if (query.data) setAccounts(query.data);
  }, [query.data, setAccounts]);

  useEffect(() => {
    if (!query.data) return;
    if (query.data.length === 0) {
      if (activeAccountId) setActiveAccount('');
      return;
    }
    const stillExists = query.data.some((a) => a.id === activeAccountId);
    if (!stillExists) setActiveAccount(query.data[0].id);
  }, [query.data, activeAccountId, setActiveAccount]);

  return {
    accounts,
    activeAccountId,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
