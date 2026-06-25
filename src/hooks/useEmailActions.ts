import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useEmailStore } from '@/hooks/useEmailStore';
import { useAuth } from '@/hooks/useAuth';
import { useAccounts } from '@/hooks/useAccounts';
import { mailApi, emailsApi, aliasesApi } from '@/api/index';
import { formatDateTime } from '@/lib/index';
import type { Email, ComposeData } from '@/lib/index';

interface SendEmailResult {
  success: boolean;
  error?: string;
  messageId?: string;
  emailId?: string;
}

export function useEmailActions() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { activeAccountId, openCompose } = useEmailStore();
  const { accounts } = useAccounts();
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['emails'] });
    qc.invalidateQueries({ queryKey: ['all-inbox'] });
    qc.invalidateQueries({ queryKey: ['unread-counts'] });
  }, [qc]);

  const sendEmail = useCallback(async (data: ComposeData): Promise<SendEmailResult> => {
    if (!user) return { success: false, error: 'Not signed in' };
    if (!activeAccountId) return { success: false, error: 'No active mailbox. Create one on the Accounts page.' };
    setSending(true);
    try {
      const result = await mailApi.send({
        userId: user.id,
        accountId: activeAccountId,
        fromAliasId: data.fromAliasId ?? undefined,
        to: data.to,
        cc: data.cc,
        bcc: data.bcc,
        subject: data.subject,
        body: data.body,
        attachments: data.attachments,
        existingAttachments: data.existingAttachments,
        inReplyTo: data.inReplyTo ?? undefined,
        references: data.references ?? undefined,
      });
      if (result.success) invalidate();
      return result;
    } finally {
      setSending(false);
    }
  }, [user, activeAccountId, invalidate]);

  const saveDraft = useCallback(async (data: ComposeData): Promise<SendEmailResult> => {
    if (!user) return { success: false, error: 'Not signed in' };
    if (!activeAccountId) return { success: false, error: 'No active mailbox' };
    setSavingDraft(true);
    try {
      const toList = data.to.split(',').map((s) => s.trim()).filter(Boolean);
      const ccList = data.cc.split(',').map((s) => s.trim()).filter(Boolean);
      const bccList = data.bcc.split(',').map((s) => s.trim()).filter(Boolean);
      const email = await emailsApi.saveDraft({
        userId: user.id,
        accountId: activeAccountId,
        to: toList,
        cc: ccList,
        bcc: bccList,
        subject: data.subject,
        bodyText: data.body,
      });
      invalidate();
      return { success: true, emailId: email.id };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Save failed' };
    } finally {
      setSavingDraft(false);
    }
  }, [user, activeAccountId, invalidate]);

  /**
   * Build the set of addresses that represent "me" for a given mailbox —
   * primary email + every alias. Used to filter Reply-All CC list so we don't
   * end up sending to ourselves.
   */
  const collectMyAddresses = useCallback(async (mailboxId: string, primaryEmail: string): Promise<Set<string>> => {
    const set = new Set<string>([primaryEmail.toLowerCase()]);
    try {
      const aliases = await aliasesApi.list(mailboxId);
      for (const al of aliases) set.add(al.aliasEmail.toLowerCase());
    } catch {
      // non-fatal — at worst Reply-All CCs an alias of ours, recipient sees it
      // as duplicate, no functional break.
    }
    return set;
  }, []);

  /**
   * Resolve the right `fromAliasId` for a reply: if the original mail arrived
   * at one of our aliases (not the primary mailbox address), send the reply
   * from that same alias to keep the identity consistent.
   */
  const resolveReplyAlias = useCallback(async (email: Email): Promise<string | null> => {
    const myMailbox = accounts.find((a) => a.id === email.accountId);
    if (!myMailbox || email.to.length === 0) return null;
    const recipientAddrs = email.to.concat(email.cc ?? []).map((a) => a.toLowerCase());
    if (recipientAddrs.includes(myMailbox.email.toLowerCase())) return null;
    try {
      const aliases = await aliasesApi.list(myMailbox.id);
      const matched = aliases.find((al) => recipientAddrs.includes(al.aliasEmail.toLowerCase()));
      return matched?.id ?? null;
    } catch {
      return null;
    }
  }, [accounts]);

  /**
   * Build RFC 5322 threading headers for an outgoing reply.
   * - In-Reply-To = parent message's Message-ID
   * - References  = parent's References (root → … → grandparent) + parent's Message-ID
   *
   * Result preserves the chain so receiving mail clients can render the full
   * conversation thread.
   */
  const buildThreadingHeaders = (parent: Email): { inReplyTo: string | null; references: string[] | null } => {
    const parentId = parent.messageId?.trim() || null;
    const parentRefs = (parent.references ?? []).filter(Boolean);
    if (!parentId) return { inReplyTo: null, references: parentRefs.length ? parentRefs : null };
    const refs = [...parentRefs, parentId];
    // De-duplicate while preserving order (in case parentId already appears).
    const seen = new Set<string>();
    const chain: string[] = [];
    for (const r of refs) { if (!seen.has(r)) { seen.add(r); chain.push(r); } }
    return { inReplyTo: parentId, references: chain };
  };

  // Subject prefix detector — case-insensitive so "RE: foo" or "re: Re: foo"
  // don't get a fresh "Re:" stacked on top.
  const hasPrefix = (subject: string, prefix: 'Re' | 'Fwd'): boolean => {
    const re = prefix === 'Re' ? /^re\s*:/i : /^(fwd?|fw)\s*:/i;
    return re.test(subject.trim());
  };

  const buildQuotedBody = (label: 'Original' | 'Forwarded', email: Email): string => {
    // Build header lines conditionally so we don't render blank "To:" / "Cc:"
    // rows when the original message had none.
    const lines: string[] = [
      '',
      '',
      `--- ${label} message ---`,
      `From: ${email.fromName ? `${email.fromName} <${email.from}>` : email.from}`,
      `Date: ${formatDateTime(email.date)}`,
    ];
    if (email.to.length) lines.push(`To: ${email.to.join(', ')}`);
    if (email.cc?.length) lines.push(`Cc: ${email.cc.join(', ')}`);
    lines.push(`Subject: ${email.subject}`);
    lines.push('');
    lines.push(email.bodyText);
    return lines.join('\n');
  };

  const replyTo = useCallback(async (email: Email) => {
    const fromAliasId = await resolveReplyAlias(email);
    const { inReplyTo, references } = buildThreadingHeaders(email);
    openCompose({
      to: email.from,
      subject: hasPrefix(email.subject, 'Re') ? email.subject : `Re: ${email.subject}`,
      body: buildQuotedBody('Original', email),
      fromAliasId,
      inReplyTo,
      references,
    });
  }, [openCompose, resolveReplyAlias]);

  /**
   * Reply All: To = original sender, CC = (original To + original CC) minus
   * any address that's "us" (primary mailbox email or any of our aliases) and
   * minus the sender (who's already in To). De-duplicates case-insensitively.
   */
  const replyAll = useCallback(async (email: Email) => {
    const fromAliasId = await resolveReplyAlias(email);
    const { inReplyTo, references } = buildThreadingHeaders(email);
    const myMailbox = accounts.find((a) => a.id === email.accountId);
    const myAddresses = myMailbox ? await collectMyAddresses(myMailbox.id, myMailbox.email) : new Set<string>();
    const senderLower = email.from.toLowerCase();
    // Combine original to + cc, drop self + sender + duplicates.
    const ccCandidates = [...(email.to ?? []), ...(email.cc ?? [])];
    const seen = new Set<string>();
    const ccFinal: string[] = [];
    for (const addr of ccCandidates) {
      const lower = addr.toLowerCase();
      if (lower === senderLower) continue;       // sender is in To already
      if (myAddresses.has(lower)) continue;       // don't reply to ourselves
      if (seen.has(lower)) continue;              // dedupe
      seen.add(lower);
      ccFinal.push(addr);
    }
    openCompose({
      to: email.from,
      cc: ccFinal.join(', '),
      subject: hasPrefix(email.subject, 'Re') ? email.subject : `Re: ${email.subject}`,
      body: buildQuotedBody('Original', email),
      fromAliasId,
      inReplyTo,
      references,
    });
  }, [openCompose, accounts, resolveReplyAlias, collectMyAddresses]);

  const forwardEmail = useCallback((email: Email) => {
    // Carry over attachments from the original mail. They already live in
    // Supabase Storage at `storagePath`; we hand the path to send-email so it
    // streams the bytes back into the outgoing message without a round-trip
    // through the browser.
    const existingAttachments = email.attachments
      .filter((a) => !!a.storagePath)
      .map((a) => ({
        storagePath: a.storagePath as string,
        filename: a.filename,
        mimeType: a.mimeType || undefined,
        sizeBytes: a.size,
      }));
    openCompose({
      subject: hasPrefix(email.subject, 'Fwd') ? email.subject : `Fwd: ${email.subject}`,
      body: buildQuotedBody('Forwarded', email),
      existingAttachments: existingAttachments.length ? existingAttachments : undefined,
    });
  }, [openCompose]);

  return {
    sendEmail, saveDraft, replyTo, replyAll, forwardEmail,
    sending, savingDraft,
  };
}
