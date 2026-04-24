import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { emailsApi, accountsApi } from '@/api/index';
import { useEmailStore } from '@/hooks/useEmailStore';
import { EmailList } from '@/components/EmailList';
import { EmailView } from '@/components/EmailView';
import { supabase } from '@/lib/supabase';
import type { Email } from '@/lib/index';

export default function InboxPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { selectedEmailId, setSelectedEmail, activeAccountId, setActiveAccount } = useEmailStore();

  // Load real accounts
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list(),
    enabled: !!user,
  });

  // Set active account from DB
  useEffect(() => {
    if (accounts.length > 0 && !accounts.find(a => a.id === activeAccountId)) {
      setActiveAccount(accounts[0].id);
    }
  }, [accounts, activeAccountId, setActiveAccount]);

  // Load emails for active account
  const { data: emails = [] } = useQuery({
    queryKey: ['emails', activeAccountId, 'inbox'],
    queryFn: () => emailsApi.list(activeAccountId, 'inbox'),
    enabled: !!activeAccountId && activeAccountId !== 'acc1',
    refetchInterval: 30000,
  });

  // Real-time subscription
  useEffect(() => {
    if (!user) return;
    const channel = emailsApi.subscribeToInbox(user.id, (_email: Email) => {
      qc.invalidateQueries({ queryKey: ['emails'] });
    });
    return () => { supabase.removeChannel(channel); };
  }, [user, qc]);

  // Mark read mutation
  const markReadMut = useMutation({
    mutationFn: (id: string) => emailsApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['emails'] }),
  });

  const useRealData = activeAccountId !== 'acc1' && accounts.length > 0;
  const { emails: mockEmails, getEmailsByFolder } = useEmailStore();
  const folderEmails = useRealData ? emails : getEmailsByFolder('inbox');
  const selectedEmail = (useRealData ? emails : mockEmails).find(e => e.id === selectedEmailId)
    ?? mockEmails.find(e => e.id === selectedEmailId);

  const handleSelect = (email: Email) => {
    setSelectedEmail(email.id);
    if (!email.read) markReadMut.mutate(email.id);
  };

  const showView = !!selectedEmail;

  return (
    <div className="flex h-full overflow-hidden">
      <div className={`${showView ? 'hidden lg:flex w-80 xl:w-96 shrink-0' : 'flex flex-1 min-w-0'} border-r border-border flex-col overflow-hidden`}>
        <EmailList emails={folderEmails} title="Inbox" emptyMessage="Your inbox is empty." onSelect={handleSelect} />
      </div>
      {showView ? (
        <div className="flex-1 min-w-0"><EmailView email={selectedEmail} /></div>
      ) : (
        <div className="hidden lg:flex flex-1 items-center justify-center text-muted-foreground flex-col gap-3">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center"><span className="text-2xl">✉️</span></div>
          <p className="text-sm">Select an email to read</p>
        </div>
      )}
    </div>
  );
}
