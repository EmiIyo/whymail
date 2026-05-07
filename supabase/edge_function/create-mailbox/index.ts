import { adminClient, jsonResponse, preflight, requireUser, UnauthorizedError } from '../_shared/http.ts';

interface CreateMailboxPayload {
  domainId: string;
  localPart: string;
  displayName?: string | null;
  forSelf: boolean;
  recoveryEmail?: string | null;
}

const LOCAL_PART_RE = /^[a-zA-Z0-9._+-]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function randomTempPassword(): string {
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const admin = adminClient();

  try {
    const adminUser = await requireUser(req, admin);
    const payload = (await req.json()) as CreateMailboxPayload;

    if (!payload?.domainId) return jsonResponse({ error: 'domainId is required' }, 400);
    if (!payload?.localPart?.trim()) return jsonResponse({ error: 'localPart is required' }, 400);

    const localPart = payload.localPart.trim().toLowerCase();
    if (!LOCAL_PART_RE.test(localPart)) {
      return jsonResponse({ error: 'localPart can only contain letters, digits and . _ + -' }, 400);
    }

    const domainRes = await admin
      .from('domains')
      .select('id, name, user_id')
      .eq('id', payload.domainId)
      .maybeSingle();
    if (domainRes.error) throw domainRes.error;
    const domain = domainRes.data;
    if (!domain) return jsonResponse({ error: 'Domain not found' }, 404);
    if (domain.user_id !== adminUser.id) return jsonResponse({ error: 'You do not own this domain' }, 403);

    const fullEmail = `${localPart}@${(domain.name as string).toLowerCase()}`;

    const dup = await admin
      .from('email_accounts')
      .select('id')
      .eq('email', fullEmail)
      .maybeSingle();
    if (dup.error) throw dup.error;
    if (dup.data) return jsonResponse({ error: `Mailbox ${fullEmail} already exists` }, 409);

    let ownerUserId: string;
    let mustChangePassword: boolean;

    if (payload.forSelf) {
      ownerUserId = adminUser.id;
      mustChangePassword = false;
    } else {
      // "For someone else" — admin no longer sets a password. The recovery_email
      // becomes the user's login email. They activate via /signup with the
      // shared invite code and pick their own password.
      const recoveryEmail = (payload.recoveryEmail ?? '').trim().toLowerCase();
      if (!recoveryEmail) {
        return jsonResponse({ error: 'Recovery email is required when creating a mailbox for someone else' }, 400);
      }
      if (!EMAIL_RE.test(recoveryEmail)) {
        return jsonResponse({ error: 'Invalid recovery email format' }, 400);
      }

      // Is there already an auth.users row with email = recovery_email?
      // listUsers() doesn't filter server-side by email, so we paginate. With
      // the user count small for now this is fine; revisit if it grows.
      let existing: { id: string; email: string | null } | null = null;
      let page = 1;
      // Hard cap to avoid runaway loops if pagination misbehaves.
      while (page <= 50) {
        const list = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (list.error) throw list.error;
        const users = list.data?.users ?? [];
        const match = users.find((u) => (u.email ?? '').toLowerCase() === recoveryEmail);
        if (match) {
          existing = { id: match.id, email: match.email ?? null };
          break;
        }
        if (users.length < 200) break;
        page += 1;
      }

      if (existing) {
        // Auto-attach to existing user. Use the user's pending state from any
        // existing mailbox they own — if they haven't activated yet (any
        // mailbox has must_change_password=true), this new one is also pending.
        ownerUserId = existing.id;
        const ownerMailboxes = await admin
          .from('email_accounts')
          .select('must_change_password')
          .eq('owner_user_id', ownerUserId);
        if (ownerMailboxes.error) throw ownerMailboxes.error;
        const someActivated = (ownerMailboxes.data ?? []).some((r) => r.must_change_password === false);
        mustChangePassword = !someActivated;
      } else {
        // Create a placeholder auth user with a random temp password. The user
        // will set their real password via /signup with the invite code.
        const created = await admin.auth.admin.createUser({
          email: recoveryEmail,
          password: randomTempPassword(),
          email_confirm: true,
          user_metadata: {
            mailbox_admin_id: adminUser.id,
            mailbox_domain_id: domain.id,
            pending_invite_redeem: true,
          },
        });
        if (created.error || !created.data?.user) {
          const msg = created.error?.message ?? 'Failed to create auth user';
          return jsonResponse({ error: msg }, 400);
        }
        ownerUserId = created.data.user.id;
        mustChangePassword = true;
      }
    }

    const recoveryEmailToStore = payload.forSelf
      ? (payload.recoveryEmail?.trim().toLowerCase() || null)
      : (payload.recoveryEmail!.trim().toLowerCase());

    const insertRes = await admin
      .from('email_accounts')
      .insert({
        owner_user_id: ownerUserId,
        created_by_user_id: adminUser.id,
        domain_id: domain.id,
        email: fullEmail,
        display_name: payload.displayName?.trim() || null,
        recovery_email: recoveryEmailToStore,
        must_change_password: mustChangePassword,
      })
      .select('id, owner_user_id, created_by_user_id, domain_id, email, display_name, enabled, must_change_password, recovery_email, storage_used_mb, storage_quota_mb, last_activity_at, created_at')
      .single();

    if (insertRes.error) {
      // Roll back the placeholder auth user only if WE just created it. Existing
      // users (auto-attach case) must not be touched on insert failure.
      if (!payload.forSelf && mustChangePassword === true) {
        const ownerMailboxCount = await admin
          .from('email_accounts')
          .select('id', { count: 'exact', head: true })
          .eq('owner_user_id', ownerUserId);
        if ((ownerMailboxCount.count ?? 0) === 0) {
          await admin.auth.admin.deleteUser(ownerUserId).catch(() => {});
        }
      }
      throw insertRes.error;
    }

    return jsonResponse({ mailbox: insertRes.data });
  } catch (err) {
    if (err instanceof UnauthorizedError) return jsonResponse({ error: err.message }, 401);
    console.error('create-mailbox error:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
