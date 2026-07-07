import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Star, Paperclip, Inbox } from 'lucide-react';
import { emailsApi } from '@/api/index';
import { useAuth } from '@/hooks/useAuth';
import { useAccounts } from '@/hooks/useAccounts';
import { useEmailStore } from '@/hooks/useEmailStore';
import { useEmailMutations } from '@/hooks/useEmailMutations';
import { formatEmailDate, getInitials } from '@/lib/index';
import { EmailView } from '@/components/EmailView';
import type { Email } from '@/lib/index';

export default function AllInboxPage() {
  const { user } = useAuth();
  const { setSelectedEmail } = useEmailStore();
  const { accounts } = useAccounts();
  const { markRead } = useEmailMutations();
  const [selected, setSelected] = useState<Email | null>(null);

  const { data: emails = [], isLoading } = useQuery({
    queryKey: ['all-inbox', user?.id],
    queryFn: () => emailsApi.listAll(user!.id),
    enabled: !!user,
    refetchInterval: 60_000,
  });

  const showView = !!selected;

  const handleSelect = (email: Email) => {
    setSelected(email);
    setSelectedEmail(email.id);
    if (!email.read) void markRead(email.id);
  };

  const getAccountBadge = (accountId: string) => {
    const acc = accounts.find(a => a.id === accountId);
    // Full email so the user can see WHICH domain a message landed on, not
    // just the local part (e.g. "admin@whymail.cc" vs the old "admin").
    return acc?.email ?? accountId.slice(0, 6);
  };

  const unreadCount = emails.filter(e => !e.read).length;

  return (
    <div className="flex h-full overflow-hidden bg-background text-foreground">
      {/* List pane */}
      <div className={`${showView ? 'hidden lg:flex w-80 xl:w-96 shrink-0' : 'flex flex-1 min-w-0'} border-r border-border flex-col overflow-hidden bg-background`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-foreground text-sm">All Inboxes</h2>
            {unreadCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 bg-primary text-primary-foreground rounded-full font-medium">{unreadCount}</span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">{emails.length} emails</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <div className="w-5 h-5 border-2 border-border border-t-foreground rounded-full animate-spin" />
            </div>
          )}
          {!isLoading && emails.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <Inbox size={32} className="text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No emails</p>
            </div>
          )}
          {emails.map(email => (
            <button
              key={email.id}
              onClick={() => handleSelect(email)}
              className={`w-full text-left px-4 py-3 border-b border-border hover:bg-accent/50 transition-colors ${
                selected?.id === email.id ? 'bg-accent' : ''
              }`}
            >
              <div className="flex items-start gap-3 min-w-0">
                {/* Avatar */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${!email.read ? 'bg-primary' : 'bg-muted'}`}>
                  <span className={`text-[11px] font-semibold ${!email.read ? 'text-primary-foreground' : 'text-muted-foreground'}`}>{getInitials(email.fromName || email.from)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className={`text-xs truncate ${email.read ? 'text-foreground/70 font-normal' : 'text-foreground font-semibold'}`}>
                      {email.fromName || email.from}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{formatEmailDate(email.date)}</span>
                  </div>
                  <p className={`text-xs truncate mb-1 ${email.read ? 'text-muted-foreground' : 'text-foreground/85'}`}>{email.subject || '(no subject)'}</p>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded font-medium truncate min-w-0 max-w-full">
                      {getAccountBadge(email.accountId)}
                    </span>
                    {email.attachments && email.attachments.length > 0 && <Paperclip size={10} className="text-muted-foreground" />}
                    {email.starred && <Star size={10} className="text-foreground fill-foreground" />}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* View pane */}
      {showView ? (
        <div className="flex-1 min-w-0">
          <EmailView email={selected} />
        </div>
      ) : (
        <div className="hidden lg:flex flex-1 items-center justify-center flex-col gap-3 text-center">
          <Inbox size={40} className="text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Select an email to read</p>
        </div>
      )}
    </div>
  );
}
