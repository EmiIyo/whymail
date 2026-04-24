import { useState, useCallback } from 'react';
import { Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { emailsApi } from '@/api/index';
import { useAuth } from '@/hooks/useAuth';
import { useEmailStore } from '@/hooks/useEmailStore';
import { EmailList } from '@/components/EmailList';
import { EmailView } from '@/components/EmailView';

export default function SearchPage() {
  const { user } = useAuth();
  const { selectedEmailId, emails: storeEmails } = useEmailStore();
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['search', user?.id, submittedQuery],
    queryFn: () => emailsApi.search(user!.id, submittedQuery),
    enabled: !!user && submittedQuery.trim().length > 0,
  });

  const selectedEmail = results.find(e => e.id === selectedEmailId)
    ?? storeEmails.find(e => e.id === selectedEmailId);
  const showView = !!selectedEmail;

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setSubmittedQuery(query.trim());
  }, [query]);

  return (
    <div className="flex h-full overflow-hidden">
      <div className={`${showView ? 'hidden lg:flex w-80 xl:w-96 shrink-0' : 'flex flex-1 min-w-0'} border-r border-black/10 flex-col overflow-hidden bg-white`}>
        {/* Search bar */}
        <form onSubmit={handleSubmit} className="px-4 py-3 border-b border-black/10 shrink-0">
          <div className="flex items-center gap-2 border border-black/20 rounded-lg px-3 py-2 focus-within:border-black transition-colors bg-white">
            <Search size={14} className="text-black/30 shrink-0" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search emails…"
              className="flex-1 text-sm outline-none bg-transparent text-black placeholder:text-black/30"
              autoFocus
            />
            {isFetching && (
              <div className="w-3.5 h-3.5 border-2 border-black/20 border-t-black rounded-full animate-spin shrink-0" />
            )}
          </div>
        </form>

        {/* Results */}
        {submittedQuery ? (
          <EmailList
            emails={results}
            title={`Results for "${submittedQuery}"`}
            emptyMessage={isFetching ? 'Searching…' : 'No results found'}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <Search size={28} className="text-black/15 mb-2" />
            <p className="text-xs text-black/30">Type and press Enter to search</p>
          </div>
        )}
      </div>

      {showView ? (
        <div className="flex-1 min-w-0">
          <EmailView email={selectedEmail} />
        </div>
      ) : (
        <div className="hidden lg:flex flex-1 items-center justify-center flex-col gap-3 text-center">
          <Search size={36} className="text-black/15" />
          <p className="text-sm text-black/30">Search your email</p>
        </div>
      )}
    </div>
  );
}
