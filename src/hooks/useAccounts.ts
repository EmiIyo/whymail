import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { accountsApi } from '@/api/index';
import { useAuth } from '@/hooks/useAuth';
import { useEmailStore } from '@/hooks/useEmailStore';

// Fetches the user's OWNED mailboxes and keeps the store in sync. The sidebar
// dropdown, inbox view, and compose all act on these. Domain admins can also
// see mailboxes they manage via the Accounts page, but only the mailbox owner
// can send from a mailbox — so we deliberately exclude non-owned ones here to
// keep the active-account selection consistent with what send-email permits.
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

  // Filter to OWNED mailboxes only. Use query.data directly as the dep so the
  // effects fire when React Query refetches, not on every render (which would
  // create a re-render loop because `.filter()` returns a new array each time).
  useEffect(() => {
    if (!query.data) return;
    setAccounts(query.data.filter((a) => a.ownerUserId === user?.id));
  }, [query.data, user?.id, setAccounts]);

  useEffect(() => {
    if (!query.data) return;
    const owned = query.data.filter((a) => a.ownerUserId === user?.id);
    if (owned.length === 0) {
      if (activeAccountId) setActiveAccount('');
      return;
    }
    const stillExists = owned.some((a) => a.id === activeAccountId);
    if (!stillExists) setActiveAccount(owned[0].id);
  }, [query.data, user?.id, activeAccountId, setActiveAccount]);

  return {
    accounts,
    activeAccountId,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
