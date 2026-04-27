import { supabase } from '@/lib/supabase';
import type { Email, Domain, DomainAdmin, EmailAccount, MailboxAlias, Folder } from '@/lib/index';

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
    return Promise.all((data ?? []).map(rowToEmail));
  },

  async listAll(userId: string): Promise<Email[]> {
    const { data, error } = await supabase
      .from('emails')
      .select('*, attachments(*)')
      .eq('user_id', userId)
      .eq('folder', 'inbox')
      .order('sent_at', { ascending: false });
    if (error) throw error;
    return Promise.all((data ?? []).map(rowToEmail));
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
    return Promise.all((data ?? []).map(rowToEmail));
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

  async saveDraft(draft: {
    userId: string;
    accountId: string;
    from?: string;
    fromName?: string;
    to?: string[];
    cc?: string[];
    bcc?: string[];
    subject?: string;
    bodyText?: string;
    bodyHtml?: string;
  }): Promise<Email> {
    const { data, error } = await supabase.from('emails').insert({
      user_id: draft.userId,
      account_id: draft.accountId,
      from_address: draft.from ?? '',
      from_name: draft.fromName ?? null,
      to_addresses: draft.to ?? [],
      cc_addresses: draft.cc && draft.cc.length ? draft.cc : null,
      bcc_addresses: draft.bcc && draft.bcc.length ? draft.bcc : null,
      subject: draft.subject ?? '',
      body_text: draft.bodyText ?? '',
      body_html: draft.bodyHtml ?? null,
      folder: 'drafts',
      is_read: true,
    }).select('*, attachments(*)').single();
    if (error) throw error;
    return await rowToEmail(data);
  },

  subscribeToInbox(userId: string, onNew: (email: Email) => void) {
    return supabase
      .channel('inbox-changes')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'emails',
        filter: `user_id=eq.${userId}`,
      }, async (payload) => {
        const email = await rowToEmail(payload.new as Record<string, unknown>);
        onNew(email);
      })
      .subscribe();
  },
};

// ─── Domains ─────────────────────────────────────────────────
export interface DomainCheckResult {
  name: 'mx' | 'spf' | 'dkim' | 'dmarc';
  pass: boolean;
  observed: string | null;
  expected: string;
  message?: string;
}

export interface DomainVerifyResponse {
  verified: boolean;
  verification_status: 'pending' | 'verified' | 'failed';
  checks: DomainCheckResult[];
}

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
    const dnsBase: {
      mx_record: string;
      spf_record: string;
      dkim_record: string | null;
      dmarc_record: string;
    } = {
      mx_record: `10 mail.${domainName}`,
      spf_record: `v=spf1 include:mail.${domainName} ~all`,
      dkim_record: null,
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

  async verify(id: string): Promise<DomainVerifyResponse> {
    const { data, error } = await supabase.functions.invoke('verify-domain', { body: { domainId: id } });
    if (error) throw error;
    return data as DomainVerifyResponse;
  },
};

// ─── Domain Admins (co-admin team) ────────────────────────────
export const domainAdminsApi = {
  async list(domainId: string): Promise<DomainAdmin[]> {
    // owner_email and user_email are denormalized snapshots populated by
    // database triggers, so we don't need a privileged auth.users lookup.
    const { data: domain } = await supabase
      .from('domains')
      .select('id, user_id, owner_email')
      .eq('id', domainId)
      .maybeSingle();
    if (!domain) return [];

    const { data: adminsRows } = await supabase
      .from('domain_admins')
      .select('domain_id, user_id, user_email, added_at')
      .eq('domain_id', domainId);

    const result: DomainAdmin[] = [];
    result.push({
      domainId: domainId,
      userId: domain.user_id as string,
      email: (domain.owner_email as string | null) ?? '',
      isOwner: true,
      addedAt: null,
    });
    for (const a of adminsRows ?? []) {
      result.push({
        domainId: a.domain_id as string,
        userId: a.user_id as string,
        email: (a.user_email as string | null) ?? '',
        isOwner: false,
        addedAt: a.added_at as string,
      });
    }
    return result;
  },

  async add(domainId: string, email: string): Promise<DomainAdmin> {
    const { data, error } = await supabase.functions.invoke('add-domain-admin', {
      body: { domainId, email },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    const a = data?.admin;
    if (!a) throw new Error('Failed to add admin');
    return {
      domainId: a.domainId,
      userId: a.userId,
      email: a.email,
      isOwner: false,
      addedAt: a.addedAt ?? null,
    };
  },

  async remove(domainId: string, userId: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke('remove-domain-admin', {
      body: { domainId, userId },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
  },
};

// ─── Email Accounts (self-hosted mailboxes) ───────────────────
// All writes go through edge functions because they need service-role to
// touch auth.users (create / delete / reset password).
export const accountsApi = {
  async list(): Promise<EmailAccount[]> {
    const { data, error } = await supabase
      .from('email_accounts')
      .select('*, domains(name)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToAccount);
  },

  async create(payload: {
    domainId: string;
    localPart: string;
    displayName?: string;
    forSelf: boolean;
    password?: string;
    recoveryEmail?: string;
  }): Promise<EmailAccount> {
    const { data, error } = await supabase.functions.invoke('create-mailbox', {
      body: {
        domainId: payload.domainId,
        localPart: payload.localPart,
        displayName: payload.displayName,
        forSelf: payload.forSelf,
        password: payload.password,
        recoveryEmail: payload.recoveryEmail,
      },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    if (!data?.mailbox) throw new Error('Mailbox creation returned no row');
    return rowToAccount(data.mailbox);
  },

  async resetPassword(mailboxId: string, newPassword: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke('reset-mailbox-password', {
      body: { mailboxId, newPassword },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
  },

  async update(id: string, patch: {
    displayName?: string | null;
    enabled?: boolean;
    recoveryEmail?: string | null;
  }): Promise<EmailAccount> {
    const { data, error } = await supabase.functions.invoke('update-mailbox', {
      body: {
        mailboxId: id,
        displayName: patch.displayName,
        enabled: patch.enabled,
        recoveryEmail: patch.recoveryEmail,
      },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    if (!data?.mailbox) throw new Error('Mailbox update returned no row');
    return rowToAccount(data.mailbox);
  },

  async toggle(id: string, enabled: boolean): Promise<void> {
    const { data, error } = await supabase.functions.invoke('update-mailbox', {
      body: { mailboxId: id, enabled },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
  },

  async delete(id: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke('delete-mailbox', {
      body: { mailboxId: id },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
  },
};

// ─── Auth (custom flows) ─────────────────────────────────────
export const authApi = {
  async requestPasswordReset(email: string, redirectUrl: string): Promise<void> {
    // Always succeeds (server returns ok regardless) so we can't enumerate
    // mailboxes. UI just shows a generic confirmation.
    await supabase.functions.invoke('request-password-reset', {
      body: { email, redirectUrl },
    });
  },

  async confirmPasswordReset(token: string, newPassword: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke('confirm-password-reset', {
      body: { token, newPassword },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
  },
};

// ─── Mailbox Aliases ──────────────────────────────────────────
function rowToAlias(row: Record<string, unknown>): MailboxAlias {
  return {
    id: row.id as string,
    mailboxId: row.mailbox_id as string,
    aliasEmail: row.alias_email as string,
    displayName: (row.display_name as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

export const aliasesApi = {
  async list(mailboxId: string): Promise<MailboxAlias[]> {
    const { data, error } = await supabase
      .from('mailbox_aliases')
      .select('id, mailbox_id, alias_email, display_name, created_at')
      .eq('mailbox_id', mailboxId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToAlias);
  },

  async listAllForOwner(): Promise<MailboxAlias[]> {
    // RLS already filters to mailboxes the user owns or admins.
    const { data, error } = await supabase
      .from('mailbox_aliases')
      .select('id, mailbox_id, alias_email, display_name, created_at');
    if (error) throw error;
    return (data ?? []).map(rowToAlias);
  },

  async add(payload: { mailboxId: string; localPart: string; displayName?: string }): Promise<MailboxAlias> {
    const { data, error } = await supabase.functions.invoke('add-alias', {
      body: {
        mailboxId: payload.mailboxId,
        localPart: payload.localPart,
        displayName: payload.displayName,
      },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    if (!data?.alias) throw new Error('Failed to add alias');
    return rowToAlias(data.alias);
  },

  async update(aliasId: string, patch: { displayName?: string | null }): Promise<MailboxAlias> {
    const { data, error } = await supabase.functions.invoke('update-alias', {
      body: { aliasId, displayName: patch.displayName },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    if (!data?.alias) throw new Error('Failed to update alias');
    return rowToAlias(data.alias);
  },

  async remove(aliasId: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke('remove-alias', {
      body: { aliasId },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
  },
};

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

// ─── Send ────────────────────────────────────────────────────
interface AttachmentRef {
  path: string;
  filename: string;
  mimeType?: string;
  size?: number;
}

async function uploadAttachments(userId: string, files: File[]): Promise<AttachmentRef[]> {
  const refs: AttachmentRef[] = [];
  for (const file of files) {
    const draftId = crypto.randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
    const path = `${userId}/outgoing/${draftId}/${safeName}`;
    const { error } = await supabase.storage.from('attachments').upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });
    if (error) throw new Error(`Upload failed: ${file.name} (${error.message})`);
    refs.push({ path, filename: file.name, mimeType: file.type || undefined, size: file.size });
  }
  return refs;
}

export const mailApi = {
  async send(payload: {
    userId: string;
    accountId: string;
    fromAliasId?: string;
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    body: string;
    attachments?: File[];
    inReplyTo?: string;
    references?: string[];
  }): Promise<{ success: boolean; messageId?: string; emailId?: string; error?: string }> {
    let attachmentRefs: AttachmentRef[] = [];
    try {
      if (payload.attachments && payload.attachments.length > 0) {
        attachmentRefs = await uploadAttachments(payload.userId, payload.attachments);
      }
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          accountId: payload.accountId,
          fromAliasId: payload.fromAliasId,
          to: payload.to,
          cc: payload.cc,
          bcc: payload.bcc,
          subject: payload.subject,
          body: payload.body,
          attachments: attachmentRefs,
          inReplyTo: payload.inReplyTo,
          references: payload.references,
        },
      });
      if (error) return { success: false, error: error.message };
      if (!data?.success) return { success: false, error: data?.error ?? 'Send failed' };
      return { success: true, messageId: data.messageId, emailId: data.emailId };
    } catch (err) {
      // Best-effort cleanup of uploaded attachments if send failed before persistence.
      if (attachmentRefs.length > 0) {
        const paths = attachmentRefs.map((a) => a.path);
        await supabase.storage.from('attachments').remove(paths).catch(() => {});
      }
      return { success: false, error: err instanceof Error ? err.message : 'Send failed' };
    }
  },

};

// ─── Row Mappers ─────────────────────────────────────────────
async function rowToEmail(row: Record<string, unknown>): Promise<Email> {
  const atts = Array.isArray(row.attachments) ? row.attachments : [];
  const attachmentsResolved = await Promise.all(
    atts.map(async (a: Record<string, unknown>) => {
      let url = '#';
      if (a.storage_path) {
        const { data } = await supabase.storage
          .from('attachments')
          .createSignedUrl(a.storage_path as string, 60 * 60);
        url = data?.signedUrl ?? '#';
      }
      return {
        id: a.id as string,
        filename: a.filename as string,
        size: Number(a.size_bytes ?? 0),
        mimeType: (a.mime_type as string) ?? '',
        url,
      };
    }),
  );
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
    attachments: attachmentsResolved,
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
    ownerUserId: row.user_id as string,
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
    ownerUserId: row.owner_user_id as string,
    createdByUserId: row.created_by_user_id as string,
    mustChangePassword: Boolean(row.must_change_password),
    recoveryEmail: (row.recovery_email as string | null) ?? null,
    enabled: row.enabled as boolean,
    storageUsedMb: (row.storage_used_mb as number) ?? 0,
    storageQuotaMb: (row.storage_quota_mb as number) ?? 5000,
    lastActivityAt: (row.last_activity_at as string) ?? undefined,
    createdAt: row.created_at as string,
  };
}
