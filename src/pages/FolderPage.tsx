import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { emailsApi, accountsApi } from '@/api/index';
import { useAuth } from '@/hooks/useAuth';
import { useEmailStore } from '@/hooks/useEmailStore';
import { EmailList } from '@/components/EmailList';
import { EmailView } from '@/components/EmailView';
import type { Folder } from '@/lib/index';

interface FolderPageProps {
  folder: Exclude<Folder, 'inbox'>;
  title: string;
  emptyMessage: string;
}

export function FolderPage({ folder, title, emptyMessage }: FolderPageProps) {
  const { user } = useAuth();
  const { selectedEmailId, emails: storeEmails } = useEmailStore();

  // Get accounts to pick the active one
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list(),
    enabled: !!user,
  });

  const activeAccountId = accounts[0]?.id ?? '';

  const { data: folderEmails = [], isLoading } = useQuery({
    queryKey: ['emails', activeAccountId, folder],
    queryFn: () => emailsApi.list(activeAccountId, folder),
    enabled: !!activeAccountId,
    refetchInterval: 60_000,
  });

  const selectedEmail = folderEmails.find(e => e.id === selectedEmailId)
    ?? storeEmails.find(e => e.id === selectedEmailId);
  const showView = !!selectedEmail;

  return (
    <div className="flex h-full overflow-hidden">
      <div className={`${showView ? 'hidden lg:flex w-80 xl:w-96 shrink-0' : 'flex flex-1 min-w-0'} border-r border-black/10 flex-col overflow-hidden bg-white`}>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
          </div>
        ) : (
          <EmailList emails={folderEmails} title={title} emptyMessage={emptyMessage} />
        )}
      </div>
      {showView ? (
        <div className="flex-1 min-w-0">
          <EmailView email={selectedEmail} />
        </div>
      ) : (
        <div className="hidden lg:flex flex-1 items-center justify-center text-black/20 flex-col gap-3">
          <div className="w-16 h-16 rounded-full bg-black/5 flex items-center justify-center">
            <span className="text-2xl">📂</span>
          </div>
          <p className="text-sm">{title}</p>
        </div>
      )}
    </div>
  );
}
