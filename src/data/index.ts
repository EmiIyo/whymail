import type { Email, Domain, EmailAccount } from '@/lib/index';

// Mock data arrays are intentionally empty. Real data is loaded from Supabase
// via the API layer (`@/api/index`) and React Query. These exports remain so
// any legacy imports resolve to a harmless empty array.
export const mockAccounts: EmailAccount[] = [];
export const mockDomains: Domain[] = [];
export const mockEmails: Email[] = [];
