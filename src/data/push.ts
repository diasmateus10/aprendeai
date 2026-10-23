// Web Push settings shared by the app (to subscribe) and the server (to send).

/** VAPID public key; the matching private key is VAPID_PRIVATE_KEY on the server. */
export const VAPID_PUBLIC_KEY = "BAvH9XmgLxFiS6jWvqKBgVc5csp3evhbkvf8OkMw8AP9VwCTPuDcl7A-O8kFukkaTqac-eizjMH-pzGta8EOqP0";

/** Reminders go out around this hour (Brasília time); the Vercel cron in vercel.json matches it. */
export const REMINDER_HOUR = 19;
