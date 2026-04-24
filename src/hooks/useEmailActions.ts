import { useState, useCallback } from 'react';
import { useEmailStore } from '@/hooks/useEmailStore';
import { mailApi } from '@/api/index';
import type { Email, ComposeData } from '@/lib/index';

interface SendEmailResult { success: boolean; error?: string; }

export function useEmailActions() {
  const { addEmail, activeAccountId, accounts, openCompose } = useEmailStore();
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const sendEmail = useCallback(async (data: ComposeData): Promise<SendEmailResult> => {
    setSending(true);
    try {
      const account = accounts.find(a => a.id === activeAccountId);
      if (!account) throw new Error('No active account');

      // Use real API if connected to Supabase (not mock account)
      if (activeAccountId !== 'acc1') {
        const result = await mailApi.send({
          accountId: activeAccountId,
          to: data.to,
          cc: data.cc,
          bcc: data.bcc,
          subject: data.subject,
          body: data.body,
        });
        return result;
      }

      // Fallback: mock for demo accounts
      await new Promise(r => setTimeout(r, 1200));
      const sentEmail: Email = {
        id: `sent-${Date.now()}`,
        accountId: activeAccountId,
        folder: 'sent',
        from: account.email,
        fromName: account.name,
        to: data.to.split(',').map(s => s.trim()).filter(Boolean),
        cc: data.cc ? data.cc.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        subject: data.subject || '(no subject)',
        bodyText: data.body,
        read: true,
        starred: false,
        date: new Date().toISOString(),
        attachments: [],
      };
      addEmail(sentEmail);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Send failed' };
    } finally {
      setSending(false);
    }
  }, [accounts, activeAccountId, addEmail]);

  const syncEmails = useCallback(async () => {
    setSyncing(true);
    try {
      if (activeAccountId !== 'acc1') {
        await mailApi.sync(activeAccountId);
      } else {
        await new Promise(r => setTimeout(r, 1500));
      }
    } finally {
      setSyncing(false);
    }
  }, [activeAccountId]);

  const replyTo = useCallback((email: Email) => {
    openCompose({
      to: email.from,
      subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
      body: `\n\n--- Original message ---\nFrom: ${email.fromName} <${email.from}>\nDate: ${new Date(email.date).toLocaleString()}\n\n${email.bodyText}`,
    });
  }, [openCompose]);

  const forwardEmail = useCallback((email: Email) => {
    openCompose({
      subject: email.subject.startsWith('Fwd:') ? email.subject : `Fwd: ${email.subject}`,
      body: `\n\n--- Forwarded message ---\nFrom: ${email.fromName} <${email.from}>\nDate: ${new Date(email.date).toLocaleString()}\n\n${email.bodyText}`,
    });
  }, [openCompose]);

  return { sendEmail, syncEmails, replyTo, forwardEmail, sending, syncing };
}

