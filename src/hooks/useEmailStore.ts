import { create } from 'zustand';
import type { Folder, ComposeData, EmailAccount } from '@/lib/index';

interface EmailStore {
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
  setAccounts: (accounts: EmailAccount[]) => void;
  openCompose: (draft?: Partial<ComposeData>) => void;
  closeCompose: () => void;
  setSearchQuery: (q: string) => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useEmailStore = create<EmailStore>((set) => ({
  activeFolder: 'inbox',
  selectedEmailId: null,
  activeAccountId: '',
  accounts: [],
  composeOpen: false,
  composeDraft: null,
  searchQuery: '',
  sidebarOpen: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,

  setActiveFolder: (folder) => set({ activeFolder: folder, selectedEmailId: null }),
  setSelectedEmail: (id) => set({ selectedEmailId: id }),
  setActiveAccount: (id) => set({ activeAccountId: id }),
  setAccounts: (accounts) => set({ accounts }),
  openCompose: (draft) => set({ composeOpen: true, composeDraft: draft ?? null }),
  closeCompose: () => set({ composeOpen: false, composeDraft: null }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));
