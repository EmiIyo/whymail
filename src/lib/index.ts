// ─── Route Paths ────────────────────────────────────────────────────────────
export const ROUTE_PATHS = {
  LOGIN: '/login',
  CHANGE_PASSWORD: '/change-password',
  ADMIN: '/admin',
  TERMS: '/terms',
  PRIVACY: '/privacy',
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
  RESET_PASSWORD: '/reset-password',
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
  ownerUserId: string;
  createdByUserId: string;
  mustChangePassword: boolean;
  recoveryEmail: string | null;
  enabled: boolean;
  storageUsedMb: number;
  storageQuotaMb: number;
  lastActivityAt?: string;
  createdAt: string;
}

export type DnsRecordKind = 'mx' | 'spf' | 'dkim' | 'dmarc' | 'routing' | 'verification' | 'return_path';

export interface DnsRecord {
  id: string;
  kind: DnsRecordKind;
  type: string;          // 'MX' | 'TXT' | 'CNAME' | 'EMAIL_ROUTING'
  name: string;          // host (relative to zone) or '@'
  value: string;
  priority?: number;
  note?: string;
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
  ownerUserId: string;
  createdAt: string;
  accountCount: number;
  resendDomainId: string | null;
  dnsRecords: DnsRecord[];
}

export interface DomainAdmin {
  domainId: string;
  userId: string;
  email: string;
  isOwner: boolean;
  addedAt: string | null;
}

export interface MailboxAlias {
  id: string;
  mailboxId: string;
  aliasEmail: string;
  displayName: string | null;
  createdAt: string;
}

export interface AdminStats {
  totalUsers: number;
  totalDomains: number;
  totalMailboxes: number;
  activeLast7Days: number;
}

export interface AdminUserRow {
  id: string;
  email: string;
  createdAt: string | null;
  lastSignInAt: string | null;
  isSuperAdmin: boolean;
  coAdminDomainIds: string[];
  coAdminDomainNames: string[];
  ownsMailbox: boolean;
  domainCount: number;
}

export interface ComposeData {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  attachments: File[];
  /** Optional alias to send AS. null/undefined = primary mailbox. */
  fromAliasId?: string | null;
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

/** Compact date for email lists: "14:32" today, "Wed" this week, "Apr 5" older. */
export function formatEmailDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff < 7 * 24 * 3600 * 1000) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** Full readable date+time for email detail headers, audit fields. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

/** Short date only: "Apr 26, 2026". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return date.toLocaleDateString([], { dateStyle: 'medium' });
}

/** "5 minutes ago", "3 days ago", "Apr 26" beyond a week. */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString([], { dateStyle: 'medium' });
}

export function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}
