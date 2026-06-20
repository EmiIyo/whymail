// Server-side Web Push sender, shared by edge functions that need to notify a
// user (currently `receive-email`). Uses the `web-push` npm package which the
// Supabase Edge (Deno) runtime supports via Node compatibility.

import webpush from 'npm:web-push@3.6.7';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

// VAPID details are loaded once per isolate and cached. They live in
// app_secrets (vapid_public_key / vapid_private_key).
let vapidConfigured: boolean | null = null;

async function ensureVapid(admin: SupabaseClient): Promise<boolean> {
  if (vapidConfigured !== null) return vapidConfigured;

  const { data, error } = await admin
    .from('app_secrets')
    .select('name, value')
    .in('name', ['vapid_public_key', 'vapid_private_key']);

  if (error) {
    console.error('push: failed to load VAPID keys', error);
    vapidConfigured = false;
    return false;
  }

  const map = new Map((data ?? []).map((r) => [r.name as string, r.value as string]));
  const pub = map.get('vapid_public_key');
  const priv = map.get('vapid_private_key');
  if (!pub || !priv) {
    console.error('push: VAPID keys missing from app_secrets');
    vapidConfigured = false;
    return false;
  }

  // `mailto:` subject is required by the spec; push services may contact it.
  webpush.setVapidDetails('mailto:support@whymail.app', pub, priv);
  vapidConfigured = true;
  return true;
}

/**
 * Send a push notification to every device the user has registered, honoring
 * their `notify_new_mail` preference. Dead subscriptions (404/410) are pruned.
 * Best-effort: never throws, so callers can fire-and-forget.
 */
export async function sendPushToUser(
  admin: SupabaseClient,
  userId: string,
  payload: PushPayload,
): Promise<void> {
  try {
    // Respect the user's notification preference.
    const prof = await admin
      .from('profiles')
      .select('notify_new_mail')
      .eq('id', userId)
      .maybeSingle();
    if (prof.data && prof.data.notify_new_mail === false) return;

    if (!(await ensureVapid(admin))) return;

    const subs = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', userId);
    if (subs.error || !subs.data?.length) return;

    const body = JSON.stringify(payload);

    await Promise.all(
      subs.data.map(async (s) => {
        const subscription = {
          endpoint: s.endpoint as string,
          keys: { p256dh: s.p256dh as string, auth: s.auth as string },
        };
        try {
          await webpush.sendNotification(subscription, body);
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            // Subscription is gone; remove it so we stop trying.
            await admin.from('push_subscriptions').delete().eq('id', s.id);
          } else {
            console.error('push: send failed', statusCode, err);
          }
        }
      }),
    );
  } catch (err) {
    console.error('push: sendPushToUser error', err);
  }
}
