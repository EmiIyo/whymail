import { NavLink } from 'react-router-dom';
import { Inbox, Send, Search, Menu } from 'lucide-react';
import { ROUTE_PATHS } from '@/lib/index';
import { useEmailStore } from '@/hooks/useEmailStore';
import { useUnreadCounts } from '@/hooks/useUnreadCounts';
import { useAccounts } from '@/hooks/useAccounts';

const TABS = [
  { label: 'Inbox', icon: Inbox, path: ROUTE_PATHS.INBOX, end: true, folderKey: 'inbox' as const },
  { label: 'Sent',  icon: Send,  path: ROUTE_PATHS.SENT,  folderKey: 'sent' as const },
  { label: 'Search',icon: Search,path: ROUTE_PATHS.SEARCH },
];

export function MobileTabBar() {
  const { setSidebarOpen, sidebarOpen } = useEmailStore();
  const { activeAccountId } = useAccounts();
  const unread = useUnreadCounts(activeAccountId || null);

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 flex items-stretch border-t border-border bg-background/95 backdrop-blur-md"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {TABS.map(({ label, icon: Icon, path, end, folderKey }) => {
        const count = folderKey ? unread[folderKey] : 0;
        return (
          <NavLink
            key={path}
            to={path}
            end={end}
            className={({ isActive }) =>
              `relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium tracking-wide transition-colors ${
                isActive ? 'text-foreground' : 'text-muted-foreground'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={`w-[22px] h-[22px] transition-transform ${isActive ? 'scale-105' : ''}`} strokeWidth={isActive ? 2.2 : 1.8} />
                <span className="leading-none">{label}</span>
                {count > 0 && (
                  <span className="absolute top-1.5 left-1/2 ml-2 min-w-[16px] h-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-semibold flex items-center justify-center">
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </>
            )}
          </NavLink>
        );
      })}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium tracking-wide text-muted-foreground"
      >
        <Menu className="w-[22px] h-[22px]" strokeWidth={1.8} />
        <span className="leading-none">More</span>
      </button>
    </nav>
  );
}
