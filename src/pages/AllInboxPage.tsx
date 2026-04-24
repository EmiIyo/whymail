import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Star, Paperclip, Inbox } from 'lucide-react';
import { emailsApi, accountsApi } from '@/api/index';
import { useAuth } from '@/hooks/useAuth';
import { useEmailStore } from '@/hooks/useEmailStore';
import { formatEmailDate, getInitials } from '@/lib/index';
import { EmailView } from '@/components/EmailView';
import type { Email } from '@/lib/index';

export default function AllInboxPage() {
  const { user } = useAuth();
  const { selectedEmailId, setSelectedEmail, markRead } = useEmailStore();
  const [selected, setSelected] = useState<Email | null>(null);

  const { data: emails = [], isLoading } = useQuery({
    queryKey: ['all-inbox', user?.id],
    queryFn: () => emailsApi.listAll(user!.id),
    enabled: !!user,
    refetchInterval: 60_000,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list(),
    enabled: !!user,
  });

  const showView = !!selected;

  const handleSelect = (email: Email) => {
    setSelected(email);
    setSelectedEmail(email.id);
    if (!email.read) markRead(email.id);
  };

  const getAccountBadge = (accountId: string) => {
    const acc = accounts.find(a => a.id === accountId);
    return acc?.email.split('@')[0] ?? accountId.slice(0, 6);
  };

  const unreadCount = emails.filter(e => !e.read).length;

  return (
    <div className="flex h-full overflow-hidden">
      {/* List pane */}
      <div className={`${showView ? 'hidden lg:flex w-80 xl:w-96 shrink-0' : 'flex flex-1 min-w-0'} border-r border-black/10 flex-col overflow-hidden bg-white`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/10 shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-black text-sm">All Inboxes</h2>
            {unreadCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 bg-black text-white rounded-full font-medium">{unreadCount}</span>
            )}
          </div>
          <span className="text-xs text-black/30">{emails.length} emails</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
            </div>
          )}
          {!isLoading && emails.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <Inbox size={32} className="text-black/20 mb-2" />
              <p className="text-sm text-black/40">No emails</p>
            </div>
          )}
          {emails.map(email => (
            <button
              key={email.id}
              onClick={() => handleSelect(email)}
              className={`w-full text-left px-4 py-3 border-b border-black/5 hover:bg-black/[0.02] transition-colors ${
                selected?.id === email.id ? 'bg-black/[0.04]' : ''
              }`}
            >
              <div className="flex items-start gap-3 min-w-0">
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-white text-[11px] font-semibold">{getInitials(email.fromName || email.from)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className={`text-xs truncate ${email.read ? 'text-black/60 font-normal' : 'text-black font-semibold'}`}>
                      {email.fromName || email.from}
                    </span>
                    <span className="text-[10px] text-black/30 shrink-0">{formatEmailDate(email.date)}</span>
                  </div>
                  <p className={`text-xs truncate mb-1 ${email.read ? 'text-black/50' : 'text-black/80'}`}>{email.subject || '(no subject)'}</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] px-1.5 py-0.5 bg-black/5 text-black/40 rounded font-medium truncate max-w-[80px]">
                      {getAccountBadge(email.accountId)}
                    </span>
                    {email.attachments && email.attachments.length > 0 && <Paperclip size={10} className="text-black/30" />}
                    {email.starred && <Star size={10} className="text-black fill-black" />}
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
          <Inbox size={40} className="text-black/15" />
          <p className="text-sm text-black/30">Select an email to read</p>
        </div>
      )}
    </div>
  );
}
