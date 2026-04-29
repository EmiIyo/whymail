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

  const replyTo = useCallback(async (email: Email) => {
    // If the original mail arrived to one of our aliases, default the reply
    // to send AS that alias (so the user keeps the same identity).
    let fromAliasId: string | null = null;
    const myMailbox = accounts.find((a) => a.id === email.accountId);
    if (myMailbox && email.to.length > 0) {
      const recipientAddrs = email.to.map((a) => a.toLowerCase());
      // Mailbox's primary email is in recipientAddrs? Then no alias needed.
      const primaryHit = recipientAddrs.includes(myMailbox.email.toLowerCase());
      if (!primaryHit) {
        try {
          const aliases = await aliasesApi.list(myMailbox.id);
          const matched = aliases.find((al) => recipientAddrs.includes(al.aliasEmail.toLowerCase()));
          if (matched) fromAliasId = matched.id;
        } catch {
          // non-fatal; fall back to primary
        }
      }
    }
    openCompose({
      to: email.from,
      subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
      body: `\n\n--- Original message ---\nFrom: ${email.fromName} <${email.from}>\nDate: ${formatDateTime(email.date)}\n\n${email.bodyText}`,
      fromAliasId,
    });
  }, [openCompose, accounts]);

  const forwardEmail = useCallback((email: Email) => {
    openCompose({
      subject: email.subject.startsWith('Fwd:') ? email.subject : `Fwd: ${email.subject}`,
      body: `\n\n--- Forwarded message ---\nFrom: ${email.fromName} <${email.from}>\nDate: ${formatDateTime(email.date)}\n\n${email.bodyText}`,
    });
  }, [openCompose]);

  return {
    sendEmail, saveDraft, replyTo, forwardEmail,
    sending, savingDraft,
  };
}
