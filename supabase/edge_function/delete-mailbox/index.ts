import { adminClient, jsonResponse, preflight, requireUser, UnauthorizedError } from '../_shared/http.ts';

interface DeletePayload {
  mailboxId: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const admin = adminClient();

  try {
    const adminUser = await requireUser(req, admin);
    const { mailboxId } = (await req.json()) as DeletePayload;
    if (!mailboxId) return jsonResponse({ error: 'mailboxId is required' }, 400);

    const mbRes = await admin
      .from('email_accounts')
      .select('id, owner_user_id, created_by_user_id, email')
      .eq('id', mailboxId)
      .maybeSingle();
    if (mbRes.error) throw mbRes.error;
    const mb = mbRes.data;
    if (!mb) return jsonResponse({ error: 'Mailbox not found' }, 404);
    if (mb.created_by_user_id !== adminUser.id) {
      return jsonResponse({ error: 'You do not manage this mailbox' }, 403);
    }

    // 1. Delete attachment objects from Storage (best effort).
    const { data: atts } = await admin
      .from('attachments')
      .select('storage_path')
      .eq('user_id', mb.owner_user_id);
    const paths = (atts ?? [])
      .map((a) => a.storage_path as string | null)
      .filter((p): p is string => !!p && p.startsWith(`${mb.owner_user_id}/`));
    if (paths.length > 0) {
      await admin.storage.from('attachments').remove(paths).catch((err) => {
        console.error('attachment storage cleanup failed:', err);
      });
    }

    // 2. Delete the mailbox row. CASCADE removes its emails and attachment rows.
    const del = await admin.from('email_accounts').delete().eq('id', mb.id);
    if (del.error) throw del.error;

    // 3. If the mailbox owner is a separate auth user (not the admin), delete
    //    that user too so they lose login access. Skip for admin-owned mailboxes.
    if (mb.owner_user_id !== adminUser.id) {
      // Only delete if this owner has no other mailboxes in the system.
      const remaining = await admin
        .from('email_accounts')
        .select('id', { count: 'exact', head: true })
        .eq('owner_user_id', mb.owner_user_id);
      if ((remaining.count ?? 0) === 0) {
        await admin.auth.admin.deleteUser(mb.owner_user_id).catch((err) => {
          console.error('auth user cleanup failed:', err);
        });
      }
    }

    return jsonResponse({ ok: true, mailboxId: mb.id });
  } catch (err) {
    if (err instanceof UnauthorizedError) return jsonResponse({ error: err.message }, 401);
    console.error('delete-mailbox error:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
