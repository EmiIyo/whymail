import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox as InboxIcon } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAccounts } from '@/hooks/useAccounts';
import { useEmailMutations } from '@/hooks/useEmailMutations';
import { emailsApi } from '@/api/index';
import { useEmailStore } from '@/hooks/useEmailStore';
import { EmailList } from '@/components/EmailList';
import { EmailView } from '@/components/EmailView';
import { supabase } from '@/lib/supabase';
import type { Email } from '@/lib/index';

export default function InboxPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { selectedEmailId, setSelectedEmail } = useEmailStore();
  const { activeAccountId, accounts } = useAccounts();
  const { markRead } = useEmailMutations();

  const { data: emails = [], isLoading } = useQuery({
    queryKey: ['emails', activeAccountId, 'inbox'],
    queryFn: () => emailsApi.list(activeAccountId, 'inbox'),
    enabled: !!activeAccountId,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!user) return;
    const channel = emailsApi.subscribeToInbox(user.id, () => {
      qc.invalidateQueries({ queryKey: ['emails'] });
      qc.invalidateQueries({ queryKey: ['all-inbox'] });
      qc.invalidateQueries({ queryKey: ['unread-counts'] });
    });
    return () => { supabase.removeChannel(channel); };
  }, [user, qc]);

  const selectedEmail = emails.find((e) => e.id === selectedEmailId);
  const showView = !!selectedEmail;

  const handleSelect = (email: Email) => {
    setSelectedEmail(email.id);
    if (!email.read) void markRead(email.id);
  };

  if (accounts.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 p-6">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
          <InboxIcon className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">No email account yet</p>
        <p className="text-xs text-muted-foreground max-w-xs">Add an IMAP/SMTP account on the Accounts page to start sending and receiving mail.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className={`${showView ? 'hidden lg:flex w-80 xl:w-96 shrink-0' : 'flex flex-1 min-w-0'} border-r border-border flex-col overflow-hidden`}>
        <EmailList emails={emails} title="Inbox" emptyMessage="Your inbox is empty." onSelect={handleSelect} />
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
