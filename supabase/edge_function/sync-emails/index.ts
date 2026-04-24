import { ImapFlow } from 'npm:imapflow@1.0.164';
import { simpleParser } from 'npm:mailparser@3.7.2';
import { adminClient, jsonResponse, preflight, requireUser, UnauthorizedError } from '../_shared/http.ts';
import { decryptSecret } from '../_shared/crypto.ts';

type Folder = 'inbox' | 'sent' | 'drafts' | 'spam' | 'trash';

// Map local folder name to a prioritized list of IMAP SPECIAL-USE flags and
// common fallback mailbox names. The first existing mailbox for each local
// folder is used.
const FOLDER_MAP: Record<Folder, { specialUse: string[]; names: string[] }> = {
  inbox:  { specialUse: [],           names: ['INBOX'] },
  sent:   { specialUse: ['\\Sent'],   names: ['Sent', 'Sent Items', 'Sent Messages', 'INBOX.Sent'] },
  drafts: { specialUse: ['\\Drafts'], names: ['Drafts', 'INBOX.Drafts'] },
  spam:   { specialUse: ['\\Junk'],   names: ['Spam', 'Junk', 'Junk Email', 'INBOX.Spam', 'INBOX.Junk'] },
  trash:  { specialUse: ['\\Trash'],  names: ['Trash', 'Deleted Items', 'INBOX.Trash'] },
};

// Upper bound per folder per sync to keep edge function within its time limit.
const MAX_MESSAGES_PER_FOLDER = 200;

interface SyncCursor {
  uidvalidity: number;
  lastUid: number;
}
type SyncState = Partial<Record<Folder, SyncCursor>>;

interface MailboxInfo {
  path: string;
  specialUse?: string;
}

function resolveMailbox(mailboxes: MailboxInfo[], folder: Folder): string | null {
  const cfg = FOLDER_MAP[folder];
  for (const flag of cfg.specialUse) {
    const m = mailboxes.find((mb) => mb.specialUse === flag);
    if (m) return m.path;
  }
  for (const name of cfg.names) {
    const m = mailboxes.find((mb) => mb.path === name || mb.path.toLowerCase() === name.toLowerCase());
    if (m) return m.path;
  }
  return null;
}

function sanitizeStoragePath(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const admin = adminClient();
  let imap: ImapFlow | null = null;

  try {
    const user = await requireUser(req, admin);
    const { accountId } = (await req.json()) as { accountId?: string };
    if (!accountId) return jsonResponse({ error: 'accountId is required' }, 400);

    const accountRes = await admin
      .from('email_accounts')
      .select('id, email, imap_host, imap_port, imap_secure, username, password_encrypted, sync_state, enabled')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (accountRes.error) throw accountRes.error;
    const account = accountRes.data;
    if (!account) return jsonResponse({ error: 'Account not found' }, 404);
    if (account.enabled === false) return jsonResponse({ error: 'Account is disabled' }, 400);
    if (!account.imap_host || !account.username || !account.password_encrypted) {
      return jsonResponse({ error: 'Account IMAP credentials are incomplete' }, 400);
    }

    const password = await decryptSecret(admin, account.password_encrypted);
    const currentState: SyncState = (account.sync_state as SyncState | null) ?? {};
    const nextState: SyncState = { ...currentState };

    imap = new ImapFlow({
      host: account.imap_host,
      port: account.imap_port ?? 993,
      secure: account.imap_secure ?? true,
      auth: { user: account.username, pass: password },
      logger: false,
    });

    await imap.connect();

    const mailboxes = (await imap.list()) as MailboxInfo[];
    const folders: Folder[] = ['inbox', 'sent', 'drafts', 'spam', 'trash'];
    const perFolder: Record<string, { synced: number; mailbox: string | null }> = {};
    let totalSynced = 0;

    for (const folder of folders) {
      const mailboxPath = resolveMailbox(mailboxes, folder);
      perFolder[folder] = { synced: 0, mailbox: mailboxPath };
      if (!mailboxPath) continue;

      const lock = await imap.getMailboxLock(mailboxPath);
      try {
        const mailbox = imap.mailbox;
        if (!mailbox || typeof mailbox === 'boolean') continue;
        const uidvalidity = Number(mailbox.uidValidity);
        const cursor = currentState[folder];
        const cursorValid = cursor && cursor.uidvalidity === uidvalidity;
        let sinceUid: number;
        if (cursorValid) {
          sinceUid = cursor!.lastUid + 1;
        } else {
          // Cold boot: only pull the most recent window to stay within the
          // edge function time budget. UIDs are monotonically increasing, so
          // starting near uidNext gives us the newest messages.
          const uidNext = Number(mailbox.uidNext ?? 1);
          sinceUid = Math.max(1, uidNext - MAX_MESSAGES_PER_FOLDER);
        }
        const uidRange = `${sinceUid}:*`;

        let maxUidSeen = cursorValid ? cursor!.lastUid : 0;
        let processed = 0;

        for await (const msg of imap.fetch(uidRange, {
          uid: true,
          envelope: true,
          flags: true,
          internalDate: true,
          source: true,
        }, { uid: true })) {
          if (processed >= MAX_MESSAGES_PER_FOLDER) break;
          processed++;

          if (typeof msg.uid === 'number') maxUidSeen = Math.max(maxUidSeen, msg.uid);

          try {
            const parsed = await simpleParser(msg.source as Uint8Array);
            const messageId = parsed.messageId ?? msg.envelope?.messageId ?? `uid-${msg.uid}@${account.imap_host}`;
            const subject = parsed.subject ?? msg.envelope?.subject ?? '(no subject)';
            const fromEntry = parsed.from?.value?.[0];
            const fromAddr = fromEntry?.address ?? msg.envelope?.from?.[0]?.address ?? '';
            const fromName = fromEntry?.name ?? msg.envelope?.from?.[0]?.name ?? null;
            const toArr = (parsed.to ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to]) : []).flatMap((t) => (t.value ?? []).map((v) => v.address).filter((a): a is string => !!a));
            const ccArr = (parsed.cc ? (Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc]) : []).flatMap((t) => (t.value ?? []).map((v) => v.address).filter((a): a is string => !!a));
            const sentAt = parsed.date?.toISOString() ?? (msg.internalDate ? new Date(msg.internalDate).toISOString() : new Date().toISOString());
            const bodyText = parsed.text ?? '';
            const bodyHtml = parsed.html || null;
            const flags = msg.flags as Set<string> | undefined;
            const isRead = flags ? flags.has('\\Seen') : false;
            const isStarred = flags ? flags.has('\\Flagged') : false;

            const insert = await admin
              .from('emails')
              .upsert(
                {
                  user_id: user.id,
                  account_id: accountId,
                  message_id: messageId,
                  folder,
                  from_address: fromAddr,
                  from_name: fromName,
                  to_addresses: toArr,
                  cc_addresses: ccArr.length ? ccArr : null,
                  subject,
                  body_text: bodyText,
                  body_html: bodyHtml,
                  is_read: isRead,
                  is_starred: isStarred,
                  sent_at: sentAt,
                },
                { onConflict: 'account_id,message_id' },
              )
              .select('id')
              .single();
            if (insert.error) throw insert.error;

            // Attachments
            for (const att of parsed.attachments ?? []) {
              if (!att.filename) continue;
              const filename = att.filename;
              const safeName = sanitizeStoragePath(filename);
              const storagePath = `${user.id}/${insert.data.id}/${safeName}`;
              const contentBytes = att.content instanceof Uint8Array
                ? att.content
                : new Uint8Array(att.content as ArrayBuffer);
              const upload = await admin.storage.from('attachments').upload(storagePath, contentBytes, {
                contentType: att.contentType || 'application/octet-stream',
                upsert: true,
              });
              if (upload.error) {
                console.error('Attachment upload failed:', filename, upload.error);
                continue;
              }
              await admin.from('attachments').upsert(
                {
                  email_id: insert.data.id,
                  user_id: user.id,
                  filename,
                  mime_type: att.contentType ?? null,
                  size_bytes: att.size ?? contentBytes.byteLength,
                  storage_path: storagePath,
                },
                { onConflict: 'email_id,filename', ignoreDuplicates: false },
              );
            }

            perFolder[folder].synced++;
            totalSynced++;
          } catch (msgErr) {
            console.error(`Sync error for uid ${msg.uid} in ${mailboxPath}:`, msgErr);
          }
        }

        nextState[folder] = { uidvalidity, lastUid: maxUidSeen };
      } finally {
        lock.release();
      }
    }

    await imap.logout();
    imap = null;

    await admin
      .from('email_accounts')
      .update({
        last_synced_at: new Date().toISOString(),
        sync_state: nextState,
      })
      .eq('id', accountId);

    return jsonResponse({ synced: totalSynced, perFolder });
  } catch (err) {
    if (imap) {
      try { await imap.logout(); } catch { /* ignore */ }
    }
    if (err instanceof UnauthorizedError) return jsonResponse({ error: err.message }, 401);
    console.error('sync-emails error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonResponse({ synced: 0, error: message }, 500);
  }
});
