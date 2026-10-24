// Daily study reminders through Web Push (adult mode). The server keeps only the push address and
// the last study day, and notifies around 19h when the learner hasn't studied yet that day.

import { VAPID_PUBLIC_KEY } from "../data/push";
import { authHeaders } from "./account";

const ENDPOINT_KEY = "aprendeai.push.endpoint";
const REPORTED_KEY = "aprendeai.push.reported";

export type PushState =
  /** This browser can't receive push notifications. */
  | "unsupported"
  /** iPhone/iPad in a Safari tab: push only works once the app is on the Home Screen. */
  | "install"
  /** The person blocked notifications for this site. */
  | "denied"
  | "off"
  | "on";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode): reminders still work, they just can't be turned off from here
  }
}

const isAppleMobile = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1);

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

export function pushState(): PushState {
  if (typeof window === "undefined") return "unsupported";
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (isAppleMobile() && !isStandalone()) return "install";
  if (!supported) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return Notification.permission === "granted" && read(ENDPOINT_KEY) ? "on" : "off";
}

function base64UrlToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const raw = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// Signed in, the device is linked to the account, so it can also get notices about the account (trial ending).
const post = async (body: unknown) =>
  fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify(body) });

/** Asks for permission (call it from a tap) and registers this device; `lastDay`/`streak` seed the first reminder. */
export async function enableReminders(lastDay: string | null, streak: number): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return pushState();
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY) }));
  const res = await post({ action: "subscribe", subscription: subscription.toJSON(), day: lastDay, streak });
  if (!res.ok) throw new Error(`subscribe failed: ${res.status}`);
  write(ENDPOINT_KEY, subscription.endpoint);
  write(REPORTED_KEY, lastDay);
  return "on";
}

export async function disableReminders(): Promise<PushState> {
  const endpoint = read(ENDPOINT_KEY);
  write(ENDPOINT_KEY, null);
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  await (await registration?.pushManager.getSubscription())?.unsubscribe();
  if (endpoint) await post({ action: "unsubscribe", endpoint }).catch(() => {});
  return pushState();
}

/** Tells the server the learner studied today (once per day), so tonight's reminder is skipped. */
export function reportStudy(day: string, streak: number) {
  const endpoint = read(ENDPOINT_KEY);
  if (!endpoint || read(REPORTED_KEY) === day) return;
  post({ action: "studied", endpoint, day, streak })
    .then((res) => res.ok && write(REPORTED_KEY, day))
    .catch(() => {});
}
