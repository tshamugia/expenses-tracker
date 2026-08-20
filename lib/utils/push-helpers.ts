/**
 * Client-side helpers for the Web Push subscription flow.
 */

/**
 * Convert a base64url-encoded VAPID public key into the Uint8Array that
 * `PushManager.subscribe({ applicationServerKey })` expects.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')

  const rawData = atob(base64)
  // Allocate over an explicit ArrayBuffer so the type satisfies BufferSource
  // (avoids the Uint8Array<ArrayBufferLike> vs ArrayBuffer mismatch in TS 5.7+).
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length))
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/**
 * Serialize a browser PushSubscription into the keys our server stores.
 */
export function serializeSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON()
  return {
    endpoint: subscription.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
  }
}
