import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; full_name: string | null; avatar_url: string | null; created_at: string };
        Insert: { id: string; full_name?: string | null; avatar_url?: string | null };
        Update: { full_name?: string | null; avatar_url?: string | null };
      };
      domains: {
        Row: {
          id: string; user_id: string; name: string; verified: boolean;
          verification_status: 'pending' | 'verified' | 'failed';
          mx_record: string | null; spf_record: string | null;
          dkim_record: string | null; dmarc_record: string | null; created_at: string;
        };
        Insert: { user_id: string; name: string; mx_record?: string; spf_record?: string; dkim_record?: string; dmarc_record?: string };
        Update: { verified?: boolean; verification_status?: 'pending' | 'verified' | 'failed' };
      };
      email_accounts: {
        Row: {
          id: string; user_id: string; domain_id: string | null; email: string;
          display_name: string | null; imap_host: string | null; imap_port: number;
          imap_secure: boolean; smtp_host: string | null; smtp_port: number;
          smtp_secure: boolean; username: string | null; password_encrypted: string | null;
          enabled: boolean; storage_used_mb: number; storage_quota_mb: number;
          last_synced_at: string | null; created_at: string;
        };
        Insert: {
          user_id: string; email: string; display_name?: string;
          domain_id?: string; imap_host?: string; imap_port?: number;
          smtp_host?: string; smtp_port?: number; username?: string; password_encrypted?: string;
        };
        Update: { enabled?: boolean; last_synced_at?: string; display_name?: string };
      };
      emails: {
        Row: {
          id: string; user_id: string; account_id: string; message_id: string | null;
          folder: 'inbox' | 'sent' | 'drafts' | 'spam' | 'trash';
          from_address: string; from_name: string | null;
          to_addresses: string[]; cc_addresses: string[] | null; bcc_addresses: string[] | null;
          subject: string | null; body_text: string | null; body_html: string | null;
          is_read: boolean; is_starred: boolean; sent_at: string; created_at: string;
        };
        Insert: {
          user_id: string; account_id: string; from_address: string;
          to_addresses: string[]; folder?: string;
          from_name?: string; subject?: string; body_text?: string; body_html?: string;
          message_id?: string; cc_addresses?: string[]; bcc_addresses?: string[];
          is_read?: boolean; sent_at?: string;
        };
        Update: { is_read?: boolean; is_starred?: boolean; folder?: string };
      };
      attachments: {
        Row: {
          id: string; email_id: string; user_id: string; filename: string;
          mime_type: string | null; size_bytes: number; storage_path: string | null; created_at: string;
        };
        Insert: { email_id: string; user_id: string; filename: string; mime_type?: string; size_bytes?: number; storage_path?: string };
        Update: Record<string, never>;
      };
    };
  };
};
