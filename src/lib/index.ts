// ─── Route Paths ────────────────────────────────────────────────────────────
export const ROUTE_PATHS = {
  LOGIN: '/login',
  ALL_INBOX: '/all-inbox',
  INBOX: '/',
  SENT: '/sent',
  DRAFTS: '/drafts',
  SPAM: '/spam',
  TRASH: '/trash',
  SEARCH: '/search',
  EMAIL_VIEW: '/email/:id',
  DOMAINS: '/domains',
  ACCOUNTS: '/accounts',
  SETTINGS: '/settings',
} as const;

// ─── Types ───────────────────────────────────────────────────────────────────
export type Folder = 'inbox' | 'sent' | 'drafts' | 'spam' | 'trash';

export interface Attachment {
  id: string;
  filename: string;
  size: number; // bytes
  mimeType: string;
  url: string;
}

export interface Email {
  id: string;
  accountId: string;
  folder: Folder;
  from: string;
  fromName: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  read: boolean;
  starred: boolean;
  date: string; // ISO
  attachments: Attachment[];
  labels?: string[];
}

export interface EmailAccount {
  id: string;
  email: string;
  name: string;
  domainId: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  username: string;
  enabled: boolean;
  storageUsedMb: number;
  storageQuotaMb: number;
  lastSyncedAt?: string;
  createdAt: string;
}

export interface Domain {
  id: string;
  name: string;
  verified: boolean;
  verificationStatus: 'pending' | 'verified' | 'failed';
  mxRecord: string;
  spfRecord: string;
  dkimRecord: string;
  dmarcRecord: string;
  createdAt: string;
  accountCount: number;
}

export interface ComposeData {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  attachments: File[];
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatEmailDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff < 7 * 24 * 3600 * 1000) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}
