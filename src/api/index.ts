import { supabase } from '@/lib/supabase';
import type { Email, Domain, EmailAccount, Folder } from '@/lib/index';

// ─── Emails ──────────────────────────────────────────────────
export const emailsApi = {
  async list(accountId: string, folder: Folder): Promise<Email[]> {
    const { data, error } = await supabase
      .from('emails')
      .select('*, attachments(*)')
      .eq('account_id', accountId)
      .eq('folder', folder)
      .order('sent_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToEmail);
  },

  async listAll(userId: string): Promise<Email[]> {
    const { data, error } = await supabase
      .from('emails')
      .select('*, attachments(*)')
      .eq('user_id', userId)
      .eq('folder', 'inbox')
      .order('sent_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToEmail);
  },

  async search(userId: string, query: string): Promise<Email[]> {
    const { data, error } = await supabase
      .from('emails')
      .select('*, attachments(*)')
      .eq('user_id', userId)
      .or(`subject.ilike.%${query}%,from_address.ilike.%${query}%,from_name.ilike.%${query}%,body_text.ilike.%${query}%`)
      .order('sent_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data ?? []).map(rowToEmail);
  },

  async markRead(id: string): Promise<void> {
    await supabase.from('emails').update({ is_read: true }).eq('id', id);
  },

  async markUnread(id: string): Promise<void> {
    await supabase.from('emails').update({ is_read: false }).eq('id', id);
  },

  async toggleStar(id: string, starred: boolean): Promise<void> {
    await supabase.from('emails').update({ is_starred: starred }).eq('id', id);
  },

  async moveToFolder(id: string, folder: Folder): Promise<void> {
    await supabase.from('emails').update({ folder }).eq('id', id);
  },

  async delete(id: string): Promise<void> {
    await supabase.from('emails').delete().eq('id', id);
  },

  async saveDraft(draft: Partial<Email> & { userId: string; accountId: string }): Promise<Email> {
    const { data, error } = await supabase.from('emails').insert({
      user_id: draft.userId,
      account_id: draft.accountId,
      from_address: draft.from ?? '',
      from_name: draft.fromName ?? '',
      to_addresses: draft.to ?? [],
      cc_addresses: draft.cc,
      bcc_addresses: draft.bcc,
      subject: draft.subject ?? '',
      body_text: draft.bodyText ?? '',
      folder: 'drafts',
      is_read: true,
    }).select('*, attachments(*)').single();
    if (error) throw error;
    return rowToEmail(data);
  },

  subscribeToInbox(userId: string, onNew: (email: Email) => void) {
    return supabase
      .channel('inbox-changes')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'emails',
        filter: `user_id=eq.${userId}`,
      }, (payload) => { onNew(rowToEmail(payload.new as Record<string, unknown>)); })
      .subscribe();
  },
};

// ─── Domains ─────────────────────────────────────────────────
export const domainsApi = {
  async list(): Promise<Domain[]> {
    const { data, error } = await supabase
      .from('domains')
      .select('*, email_accounts(count)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToDomain);
  },

  async create(name: string, userId: string): Promise<Domain> {
    const domainName = name.trim().toLowerCase();
    const dnsBase = {
      mx_record: `10 mail.${domainName}`,
      spf_record: `v=spf1 include:mail.${domainName} ~all`,
      dkim_record: 'v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQ...',
      dmarc_record: `v=DMARC1; p=none; rua=mailto:dmarc@${domainName}`,
    };
    const { data, error } = await supabase
      .from('domains')
      .insert({ user_id: userId, name: domainName, ...dnsBase })
      .select()
      .single();
    if (error) throw error;
    return rowToDomain(data);
  },

  async delete(id: string): Promise<void> {
    await supabase.from('domains').delete().eq('id', id);
  },

  async verify(id: string): Promise<{ verified: boolean }> {
    const { data, error } = await supabase.functions.invoke('verify-domain', { body: { domainId: id } });
    if (error) throw error;
    return data;
  },
};

// ─── Email Accounts ───────────────────────────────────────────
export const accountsApi = {
  async list(): Promise<EmailAccount[]> {
    const { data, error } = await supabase
      .from('email_accounts')
      .select('*, domains(name)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToAccount);
  },

  async create(account: {
    userId: string; email: string; displayName?: string;
    domainId?: string; imapHost?: string; imapPort?: number;
    smtpHost?: string; smtpPort?: number; username?: string; password?: string;
  }): Promise<EmailAccount> {
    const { data, error } = await supabase
      .from('email_accounts')
      .insert({
        user_id: account.userId,
        email: account.email,
        display_name: account.displayName,
        domain_id: account.domainId,
        imap_host: account.imapHost,
        imap_port: account.imapPort,
        smtp_host: account.smtpHost,
        smtp_port: account.smtpPort,
        username: account.username,
        password_encrypted: account.password,
      })
      .select()
      .single();
    if (error) throw error;
    return rowToAccount(data);
  },

  async toggle(id: string, enabled: boolean): Promise<void> {
    await supabase.from('email_accounts').update({ enabled }).eq('id', id);
  },

  async delete(id: string): Promise<void> {
    await supabase.from('email_accounts').delete().eq('id', id);
  },
};

// ─── Send & Sync ─────────────────────────────────────────────
// ─── Profiles ────────────────────────────────────────────────
export const profilesApi = {
  async get(userId: string): Promise<{ fullName: string | null; avatarUrl: string | null }> {
    const { data } = await supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', userId)
      .single();
    return { fullName: data?.full_name ?? null, avatarUrl: data?.avatar_url ?? null };
  },

  async update(userId: string, fullName: string): Promise<void> {
    await supabase.from('profiles').update({ full_name: fullName }).eq('id', userId);
  },
};

export const mailApi = {
  async send(payload: {
    accountId: string; to: string; cc?: string; bcc?: string;
    subject: string; body: string; attachments?: File[];
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const formData: Record<string, unknown> = {
      accountId: payload.accountId,
      to: payload.to,
      cc: payload.cc,
      bcc: payload.bcc,
      subject: payload.subject,
      body: payload.body,
    };
    const { data, error } = await supabase.functions.invoke('send-email', { body: formData });
    if (error) return { success: false, error: error.message };
    return data;
  },

  async sync(accountId: string): Promise<{ synced: number }> {
    const { data, error } = await supabase.functions.invoke('sync-emails', { body: { accountId } });
    if (error) throw error;
    return data;
  },
};

// ─── Row Mappers ─────────────────────────────────────────────
function rowToEmail(row: Record<string, unknown>): Email {
  const atts = Array.isArray(row.attachments) ? row.attachments : [];
  return {
    id: row.id as string,
    accountId: row.account_id as string,
    folder: row.folder as Folder,
    from: row.from_address as string,
    fromName: (row.from_name as string) ?? '',
    to: (row.to_addresses as string[]) ?? [],
    cc: row.cc_addresses as string[] | undefined,
    bcc: row.bcc_addresses as string[] | undefined,
    subject: (row.subject as string) ?? '(no subject)',
    bodyText: (row.body_text as string) ?? '',
    bodyHtml: row.body_html as string | undefined,
    read: row.is_read as boolean,
    starred: row.is_starred as boolean,
    date: row.sent_at as string,
    attachments: atts.map((a: Record<string, unknown>) => ({
      id: a.id as string,
      filename: a.filename as string,
      size: a.size_bytes as number,
      mimeType: (a.mime_type as string) ?? '',
      url: a.storage_path
        ? supabase.storage.from('attachments').getPublicUrl(a.storage_path as string).data.publicUrl
        : '#',
    })),
  };
}

function rowToDomain(row: Record<string, unknown>): Domain {
  const counts = row.email_accounts;
  const count = Array.isArray(counts) ? (counts[0] as Record<string, unknown>)?.count ?? 0 : 0;
  return {
    id: row.id as string,
    name: row.name as string,
    verified: row.verified as boolean,
    verificationStatus: row.verification_status as 'pending' | 'verified' | 'failed',
    mxRecord: (row.mx_record as string) ?? '',
    spfRecord: (row.spf_record as string) ?? '',
    dkimRecord: (row.dkim_record as string) ?? '',
    dmarcRecord: (row.dmarc_record as string) ?? '',
    createdAt: row.created_at as string,
    accountCount: Number(count),
  };
}

function rowToAccount(row: Record<string, unknown>): EmailAccount {
  return {
    id: row.id as string,
    email: row.email as string,
    name: (row.display_name as string) ?? (row.email as string),
    domainId: (row.domain_id as string) ?? '',
    imapHost: (row.imap_host as string) ?? '',
    imapPort: (row.imap_port as number) ?? 993,
    smtpHost: (row.smtp_host as string) ?? '',
    smtpPort: (row.smtp_port as number) ?? 587,
    username: (row.username as string) ?? '',
    enabled: row.enabled as boolean,
    storageUsedMb: (row.storage_used_mb as number) ?? 0,
    storageQuotaMb: (row.storage_quota_mb as number) ?? 5000,
    lastSyncedAt: (row.last_synced_at as string) ?? undefined,
    createdAt: row.created_at as string,
  };
}
