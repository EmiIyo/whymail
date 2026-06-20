import { adminClient, jsonResponse, preflight, requireUser, UnauthorizedError } from '../_shared/http.ts';

// Stores or removes a Web Push subscription for the authenticated user.
// Called from the browser after the user grants notification permission.
//
// Body:
//   { action: 'subscribe', subscription: { endpoint, keys: { p256dh, auth } }, userAgent? }
//   { action: 'unsubscribe', endpoint }

interface SubscribeBody {
  action: 'subscribe';
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  userAgent?: string;
}
interface UnsubscribeBody {
  action: 'unsubscribe';
  endpoint: string;
}
type Body = SubscribeBody | UnsubscribeBody;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const admin = adminClient();

  let user;
  try {
    user = await requireUser(req, admin);
  } catch (err) {
    if (err instanceof UnauthorizedError) return jsonResponse({ error: err.message }, 401);
    throw err;
  }

  try {
    const body = (await req.json()) as Body;

    if (body.action === 'subscribe') {
      const sub = body.subscription;
      if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
        return jsonResponse({ error: 'invalid subscription' }, 400);
      }
      const { error } = await admin.from('push_subscriptions').upsert(
        {
          user_id: user.id,
          endpoint: sub.endpoint,
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
          user_agent: body.userAgent ?? null,
        },
        { onConflict: 'endpoint' },
      );
      if (error) throw error;
      return jsonResponse({ ok: true });
    }

    if (body.action === 'unsubscribe') {
      if (!body.endpoint) return jsonResponse({ error: 'missing endpoint' }, 400);
      // Scope the delete to this user so one user can't remove another's row.
      const { error } = await admin
        .from('push_subscriptions')
        .delete()
        .eq('endpoint', body.endpoint)
        .eq('user_id', user.id);
      if (error) throw error;
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: 'unknown action' }, 400);
  } catch (err) {
    console.error('push-subscribe error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
