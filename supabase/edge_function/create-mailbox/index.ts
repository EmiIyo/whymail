import { adminClient, jsonResponse, preflight, requireUser, UnauthorizedError } from '../_shared/http.ts';

interface CreateMailboxPayload {
  domainId: string;
  localPart: string;            // text before '@', e.g. "admin"
  displayName?: string | null;
  forSelf: boolean;             // true => attach to admin's own auth user (no new login)
  password?: string;            // required iff forSelf == false
  recoveryEmail?: string | null;
}

const MIN_PASSWORD_LEN = 8;
const LOCAL_PART_RE = /^[a-zA-Z0-9._+-]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

    // 1. Confirm the admin owns the domain.
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

    // 2. Reject duplicates explicitly so the message is clearer than the unique-constraint error.
    const dup = await admin
      .from('email_accounts')
      .select('id')
      .eq('email', fullEmail)
      .maybeSingle();
    if (dup.error) throw dup.error;
    if (dup.data) return jsonResponse({ error: `Mailbox ${fullEmail} already exists` }, 409);

    let ownerUserId: string;
    let mustChangePassword = false;

    if (payload.forSelf) {
      // Mailbox owned by the admin themselves: no new auth user, no password.
      ownerUserId = adminUser.id;
    } else {
      // Mailbox owned by a third party. Create a Supabase auth user whose
      // login email is the mailbox address, with email pre-confirmed (admin
      // vouches for the user). Initial password is the one the admin set.
      const password = (payload.password ?? '').trim();
      if (password.length < MIN_PASSWORD_LEN) {
        return jsonResponse({ error: `Password must be at least ${MIN_PASSWORD_LEN} characters` }, 400);
      }

      // If an auth user with this email already exists, createUser returns
      // an "already registered" error which we surface to the admin.
      const created = await admin.auth.admin.createUser({
        email: fullEmail,
        password,
        email_confirm: true,
        user_metadata: {
          mailbox_admin_id: adminUser.id,
          mailbox_domain_id: domain.id,
        },
      });
      if (created.error || !created.data?.user) {
        const msg = created.error?.message ?? 'Failed to create auth user';
        // Email-already-registered surfaces here as a 422.
        return jsonResponse({ error: msg }, 400);
      }
      ownerUserId = created.data.user.id;
      mustChangePassword = true;
    }

    // 3. Insert the mailbox row.
    let recoveryEmail: string | null = null;
    if (payload.recoveryEmail) {
      const candidate = payload.recoveryEmail.trim().toLowerCase();
      if (candidate) {
        if (!EMAIL_RE.test(candidate)) {
          if (!payload.forSelf) {
            await admin.auth.admin.deleteUser(ownerUserId).catch(() => {});
          }
          return jsonResponse({ error: 'Invalid recovery email format' }, 400);
        }
        recoveryEmail = candidate;
      }
    }

    const insertRes = await admin
      .from('email_accounts')
      .insert({
        owner_user_id: ownerUserId,
        created_by_user_id: adminUser.id,
        domain_id: domain.id,
        email: fullEmail,
        display_name: payload.displayName?.trim() || null,
        recovery_email: recoveryEmail,
        must_change_password: mustChangePassword,
      })
      .select('id, owner_user_id, created_by_user_id, domain_id, email, display_name, enabled, must_change_password, recovery_email, storage_used_mb, storage_quota_mb, last_activity_at, created_at')
      .single();

    if (insertRes.error) {
      // If we created an auth user above and the row insert failed, roll back
      // the auth user so we don't leave an orphan.
      if (!payload.forSelf) {
        await admin.auth.admin.deleteUser(ownerUserId).catch(() => {});
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
