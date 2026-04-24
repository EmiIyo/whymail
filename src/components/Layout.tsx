import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Inbox, Send, FileText, AlertTriangle, Trash2, Search,
  Globe, Users, Settings, PenSquare, ChevronDown,
  Menu, X, LogOut, Bell, MailsIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { useEmailStore } from '@/hooks/useEmailStore';
import { useAccounts } from '@/hooks/useAccounts';
import { useUnreadCounts } from '@/hooks/useUnreadCounts';
import { ROUTE_PATHS, getInitials } from '@/lib/index';
import { useAuth } from '@/hooks/useAuth';
import { ComposeModal } from '@/components/ComposeModal';
import { springPresets } from '@/lib/motion';

import type { Folder } from '@/lib/index';

type FolderNavItem = { label: string; icon: React.ComponentType<{ className?: string }>; path: string; folder: Folder | null };

const folderNav: FolderNavItem[] = [
  { label: 'All Inboxes', icon: MailsIcon, path: ROUTE_PATHS.ALL_INBOX, folder: null },
  { label: 'Inbox', icon: Inbox, path: ROUTE_PATHS.INBOX, folder: 'inbox' },
  { label: 'Sent', icon: Send, path: ROUTE_PATHS.SENT, folder: 'sent' },
  { label: 'Drafts', icon: FileText, path: ROUTE_PATHS.DRAFTS, folder: 'drafts' },
  { label: 'Spam', icon: AlertTriangle, path: ROUTE_PATHS.SPAM, folder: 'spam' },
  { label: 'Trash', icon: Trash2, path: ROUTE_PATHS.TRASH, folder: 'trash' },
];

const manageNav = [
  { label: 'Domains', icon: Globe, path: ROUTE_PATHS.DOMAINS },
  { label: 'Accounts', icon: Users, path: ROUTE_PATHS.ACCOUNTS },
  { label: 'Settings', icon: Settings, path: ROUTE_PATHS.SETTINGS },
];

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const { composeOpen, closeCompose, composeDraft, openCompose,
    setActiveAccount, sidebarOpen, setSidebarOpen } = useEmailStore();
  const { accounts, activeAccountId } = useAccounts();
  const unreadCounts = useUnreadCounts(activeAccountId || null);
  const { signOut } = useAuth();
  const [searchInput, setSearchInput] = useState('');

  const activeAccount = accounts.find(a => a.id === activeAccountId);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      navigate(`${ROUTE_PATHS.SEARCH}?q=${encodeURIComponent(searchInput.trim())}`);
    }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            className="fixed inset-0 bg-black/50 z-20 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <motion.aside
        className="fixed lg:relative z-30 flex flex-col h-full bg-sidebar text-sidebar-foreground border-r border-sidebar-border shrink-0 overflow-hidden"
        initial={false}
        animate={{
          x: sidebarOpen ? 0 : -288,
          width: sidebarOpen ? 288 : 0,
        }}
        transition={springPresets.gentle}
        style={{ willChange: 'transform, width' }}
      >
        {/* Brand */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-sidebar-border min-w-[288px]">
          <div className="flex items-center gap-2.5">
            <img src="/icon.png" alt="WhyMail icon" className="w-8 h-8 rounded-lg object-contain" />
            <img src="/logo.png" alt="WhyMail" className="h-6 object-contain brightness-0 invert" />
          </div>
          <button
            className="lg:hidden p-1 rounded hover:bg-sidebar-accent text-sidebar-foreground/60"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Account switcher */}
        <div className="px-4 py-3 border-b border-sidebar-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2.5 w-full px-2 py-2 rounded-lg hover:bg-sidebar-accent transition-colors group">
                <Avatar className="w-7 h-7 shrink-0">
                  <AvatarFallback className="text-xs bg-sidebar-primary text-sidebar-primary-foreground">
                    {getInitials(activeAccount?.name ?? 'WM')}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium text-sidebar-foreground truncate">{activeAccount?.name}</p>
                  <p className="text-xs text-sidebar-foreground/50 truncate font-mono">{activeAccount?.email}</p>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-sidebar-foreground/40 group-hover:text-sidebar-foreground/70 transition-colors" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              {accounts.map(acc => (
                <DropdownMenuItem
                  key={acc.id}
                  onClick={() => setActiveAccount(acc.id)}
                  className="flex items-center gap-2.5 py-2"
                >
                  <Avatar className="w-6 h-6 shrink-0">
                    <AvatarFallback className="text-xs">{getInitials(acc.name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{acc.name}</p>
                    <p className="text-xs text-muted-foreground font-mono truncate">{acc.email}</p>
                  </div>
                  {acc.id === activeAccountId && (
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate(ROUTE_PATHS.ACCOUNTS)}>
                <Users className="w-3.5 h-3.5 mr-2" /> Manage accounts
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Compose button */}
        <div className="px-4 pt-4 pb-2">
          <Button
            onClick={() => openCompose()}
            className="w-full gap-2 bg-sidebar-primary hover:bg-sidebar-primary/90 text-sidebar-primary-foreground shadow-sm"
          >
            <PenSquare className="w-4 h-4" />
            Compose
          </Button>
        </div>

        {/* Search */}
        <div className="px-4 py-2">
          <form onSubmit={handleSearch}>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-sidebar-foreground/40" />
              <input
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Search emails..."
                className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg bg-sidebar-accent border border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-foreground/40 focus:outline-none focus:ring-1 focus:ring-sidebar-ring transition"
              />
            </div>
          </form>
        </div>

        <ScrollArea className="flex-1 px-2 py-2">
          {/* Folder nav */}
          <div className="mb-1">
            <p className="px-3 py-1 text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/40">Mail</p>
            {folderNav.map(({ label, icon: Icon, path, folder }) => {
              const unread = folder ? unreadCounts[folder] : unreadCounts.inbox;
              return (
                <NavLink
                  key={path}
                  to={path}
                  end={path === '/'}
                  className={({ isActive }) =>
                    `flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all duration-150 mb-0.5 ${
                      isActive
                        ? 'bg-sidebar-primary/15 text-sidebar-primary font-semibold'
                        : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                    }`
                  }
                  onClick={() => setSidebarOpen(false)}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    {label}
                  </span>
                  {unread > 0 && (
                    <Badge className="h-4 min-w-4 text-[10px] px-1 bg-sidebar-primary text-sidebar-primary-foreground">
                      {unread}
                    </Badge>
                  )}
                </NavLink>
              );
            })}
          </div>

          <Separator className="my-2 bg-sidebar-border" />

          {/* Management nav */}
          <div>
            <p className="px-3 py-1 text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/40">Manage</p>
            {manageNav.map(({ label, icon: Icon, path }) => (
              <NavLink
                key={path}
                to={path}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150 mb-0.5 ${
                    isActive
                      ? 'bg-sidebar-primary/15 text-sidebar-primary font-semibold'
                      : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                  }`
                }
                onClick={() => setSidebarOpen(false)}
              >
                <Icon className="w-4 h-4" />
                {label}
              </NavLink>
            ))}
          </div>
        </ScrollArea>

        {/* Sidebar footer */}
        <div className="px-4 py-3 border-t border-sidebar-border">
          <button
            onClick={async () => { await signOut(); navigate(ROUTE_PATHS.LOGIN); }}
            className="flex items-center gap-2 text-sm text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors w-full"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </motion.aside>

      {/* ── Main Area ────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 h-full w-full">
        {/* Top bar */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background shrink-0">
          <button
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <Menu className="w-4 h-4 text-muted-foreground" />
          </button>

          <div className="flex-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <button className="p-1.5 rounded-md hover:bg-muted transition-colors">
                <Bell className="w-4 h-4 text-muted-foreground" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Notifications</TooltipContent>
          </Tooltip>

          <Avatar className="w-7 h-7 cursor-pointer shrink-0" onClick={() => navigate(ROUTE_PATHS.SETTINGS)}>
            <AvatarFallback className="text-xs bg-primary text-primary-foreground flex items-center justify-center w-full h-full">
              {getInitials(activeAccount?.name ?? 'WM')}
            </AvatarFallback>
          </Avatar>
        </header>

        {/* Page content */}
        <main className="flex-1 min-h-0 overflow-hidden">
          {children}
        </main>
      </div>

      {/* Compose Modal */}
      <ComposeModal open={composeOpen} onClose={closeCompose} initialData={composeDraft} />
    </div>
  );
}
