import { create } from 'zustand';
import type { Email, Folder, ComposeData, EmailAccount } from '@/lib/index';
import { mockEmails, mockAccounts } from '@/data/index';

interface EmailStore {
  emails: Email[];
  activeFolder: Folder;
  selectedEmailId: string | null;
  activeAccountId: string;
  accounts: EmailAccount[];
  composeOpen: boolean;
  composeDraft: Partial<ComposeData> | null;
  searchQuery: string;
  sidebarOpen: boolean;

  setActiveFolder: (folder: Folder) => void;
  setSelectedEmail: (id: string | null) => void;
  setActiveAccount: (id: string) => void;
  openCompose: (draft?: Partial<ComposeData>) => void;
  closeCompose: () => void;
  markRead: (id: string) => void;
  markUnread: (id: string) => void;
  toggleStar: (id: string) => void;
  deleteEmail: (id: string) => void;
  moveToFolder: (id: string, folder: Folder) => void;
  addEmail: (email: Email) => void;
  setSearchQuery: (q: string) => void;
  setSidebarOpen: (open: boolean) => void;
  getEmailsByFolder: (folder: Folder) => Email[];
  getUnreadCount: (folder: Folder) => number;
}

export const useEmailStore = create<EmailStore>((set, get) => ({
  emails: mockEmails,
  activeFolder: 'inbox',
  selectedEmailId: null,
  activeAccountId: 'acc1',
  accounts: mockAccounts,
  composeOpen: false,
  composeDraft: null,
  searchQuery: '',
  sidebarOpen: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,

  setActiveFolder: (folder) => set({ activeFolder: folder, selectedEmailId: null }),
  setSelectedEmail: (id) => set({ selectedEmailId: id }),
  setActiveAccount: (id) => set({ activeAccountId: id }),
  openCompose: (draft) => set({ composeOpen: true, composeDraft: draft ?? null }),
  closeCompose: () => set({ composeOpen: false, composeDraft: null }),

  markRead: (id) =>
    set((s) => ({ emails: s.emails.map((e) => (e.id === id ? { ...e, read: true } : e)) })),

  markUnread: (id) =>
    set((s) => ({ emails: s.emails.map((e) => (e.id === id ? { ...e, read: false } : e)) })),

  toggleStar: (id) =>
    set((s) => ({ emails: s.emails.map((e) => (e.id === id ? { ...e, starred: !e.starred } : e)) })),

  deleteEmail: (id) =>
    set((s) => {
      const email = s.emails.find((e) => e.id === id);
      if (!email) return s;
      if (email.folder === 'trash') {
        return { emails: s.emails.filter((e) => e.id !== id) };
      }
      return { emails: s.emails.map((e) => (e.id === id ? { ...e, folder: 'trash' } : e)) };
    }),

  moveToFolder: (id, folder) =>
    set((s) => ({ emails: s.emails.map((e) => (e.id === id ? { ...e, folder } : e)) })),

  addEmail: (email) => set((s) => ({ emails: [email, ...s.emails] })),

  setSearchQuery: (q) => set({ searchQuery: q }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  getEmailsByFolder: (folder) => {
    const s = get();
    return s.emails.filter((e) => e.folder === folder && e.accountId === s.activeAccountId);
  },

  getUnreadCount: (folder) => {
    const s = get();
    return s.emails.filter(
      (e) => e.folder === folder && e.accountId === s.activeAccountId && !e.read
    ).length;
  },
}));
