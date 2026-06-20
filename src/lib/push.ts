// Web Push subscription helpers (client side).
//
// Flow: register the service worker → request Notification permission →
// subscribe via PushManager with our VAPID public key → persist the
// subscription server-side through the `push-subscribe` edge function.
//
// The edge function `receive-email` later uses the stored subscription to
// deliver a push when new mail arrives, even when the app is closed.

import { supabase } from '@/lib/supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type EnablePushResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'no-key' | 'denied' | 'error'; message?: string };

/** True when this browser can do Web Push at all. */
export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Current Notification permission, or 'unsupported'. */
export function pushPermission(): NotificationPermission | 'unsupported' {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission;
}

// VAPID public keys are base64url; PushManager wants a Uint8Array.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

/** Register the service worker. Safe to call repeatedly; the browser dedupes. */
export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch {
    return null;
  }
}

/**
 * Request permission and subscribe this device to push. Idempotent: if a
 * subscription already exists it is re-sent to the server (so a freshly wiped
 * server still learns about it).
 */
export async function enablePush(): Promise<EnablePushResult> {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  if (!VAPID_PUBLIC_KEY) return { ok: false, reason: 'no-key' };

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { ok: false, reason: 'denied' };

    const registration = (await registerPushServiceWorker()) ?? (await navigator.serviceWorker.ready);
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const json = subscription.toJSON();
    const { error } = await supabase.functions.invoke('push-subscribe', {
      body: {
        action: 'subscribe',
        subscription: {
          endpoint: subscription.endpoint,
          keys: json.keys, // { p256dh, auth }
        },
        userAgent: navigator.userAgent,
      },
    });
    if (error) return { ok: false, reason: 'error', message: error.message };

    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

/** Remove this device's push subscription, both locally and server-side. */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;

    await supabase.functions.invoke('push-subscribe', {
      body: { action: 'unsubscribe', endpoint: subscription.endpoint },
    });
    await subscription.unsubscribe();
  } catch {
    // Best-effort; ignore.
  }
}
