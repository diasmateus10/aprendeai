// Accounts (Supabase Auth, e-mail and password) and the cloud copy of each learner's progress.
// The browser uses the publishable key: it is meant to be public, and RLS limits every account to its own row.

import { AuthError, createClient, type Session } from "@supabase/supabase-js";
import type { Progress } from "./progress";

const SUPABASE_URL = "https://akctjmradduksgxnpian.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_uVgBAbcTKnL_HbHea7PvHQ_b0nOYnJW";

export const supabase = createClient(SUPABASE_URL, PUBLISHABLE_KEY);

export type { Session };

/** Supabase error codes in plain Portuguese. */
function message(error: AuthError | Error): string {
  const code = (error as AuthError).code;
  switch (code) {
    case "invalid_credentials":
      return "E-mail ou senha incorretos.";
    case "user_already_exists":
    case "email_exists":
      return "Já existe uma conta com esse e-mail. Toque em “Entrar”.";
    case "weak_password":
      return "Senha fraca: use pelo menos 6 caracteres.";
    case "email_not_confirmed":
      return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
    case "validation_failed":
    case "email_address_invalid":
      return "Confira o e-mail digitado.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.";
    default:
      return "Não foi possível agora. Confira sua internet e tente de novo.";
  }
}

export type AuthResult = { ok: true; needsConfirmation?: boolean } | { ok: false; error: string };

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? { ok: false, error: message(error) } : { ok: true };
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } });
  if (error) return { ok: false, error: message(error) };
  // With "Confirm email" on in Supabase, there is no session until the link in the e-mail is opened.
  return { ok: true, needsConfirmation: !data.session };
}

export async function sendPasswordReset(email: string): Promise<AuthResult> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
  return error ? { ok: false, error: message(error) } : { ok: true };
}

export async function updatePassword(password: string): Promise<AuthResult> {
  const { error } = await supabase.auth.updateUser({ password });
  return error ? { ok: false, error: message(error) } : { ok: true };
}

export async function signOut() {
  await flushSave();
  await supabase.auth.signOut();
}

/** Deletes the account and everything saved in it (and cancels the subscription). Returns an error message, or "". */
export async function deleteAccount(): Promise<string> {
  clearTimeout(timer);
  pending = null;
  const res = await fetch("/api/account/delete", { method: "POST", headers: await authHeaders() }).catch(() => null);
  if (!res?.ok) return "Não consegui excluir a conta agora. Tente de novo ou peça pelo e-mail de contato.";
  // The account no longer exists; this only clears the session on this device.
  await supabase.auth.signOut({ scope: "local" });
  return "";
}

/** The account's saved progress, or null for a new account. Throws when the database can't be reached. */
export async function loadRemote(userId: string): Promise<unknown | null> {
  const { data, error } = await supabase.from("user_progress").select("data").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.data ?? null;
}

let pending: { userId: string; progress: Progress } | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

async function flushSave() {
  clearTimeout(timer);
  const job = pending;
  pending = null;
  if (!job) return;
  const { error } = await supabase
    .from("user_progress")
    .upsert({ user_id: job.userId, data: job.progress, updated_at: new Date().toISOString() });
  // Kept locally anyway; the next change retries the upload.
  if (error) console.error("[account] save failed:", error.message);
}

/** Saves to the account a moment after the last change, so a burst of answers is one write. */
export function saveRemote(userId: string, progress: Progress) {
  pending = { userId, progress };
  clearTimeout(timer);
  timer = setTimeout(flushSave, 1500);
}

// Leaving or hiding the app (switching apps on a phone) uploads what is still waiting.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flushSave());
}

/** Proves who is calling our own API (chat, billing): the server checks this token with Supabase. */
export async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

export interface Subscription {
  status: string | null;
  plan: "monthly" | "yearly" | null;
  current_period_end: string | null;
  trial_end: string | null;
  cancel_at_period_end: boolean;
  had_trial: boolean;
}

/** The account's subscription row (RLS: only its own), or null if it never subscribed. */
export async function loadSubscription(userId: string): Promise<Subscription | null> {
  const { data } = await supabase
    .from("subscriptions")
    .select("status, plan, current_period_end, trial_end, cancel_at_period_end, had_trial")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

export interface ProgressReport {
  id: string;
  week_start: string;
  seen_at: string | null;
  report: {
    headline: string;
    improved: { point: string; before: string; now: string }[];
    focus: { point: string; tip: string; example: string }[];
    next_goal: string;
    stats: { conversations: number; minutes: number; lines: number };
  };
}

/** The latest weekly progress report (Premium), if it is from the last two weeks. */
export async function loadLatestReport(userId: string): Promise<ProgressReport | null> {
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data } = await supabase
    .from("progress_reports")
    .select("id, week_start, seen_at, report")
    .eq("user_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function markReportSeen(id: string) {
  await supabase.from("progress_reports").update({ seen_at: new Date().toISOString() }).eq("id", id);
}

/** Premium given without payment (premium_grants), checked alongside the subscription. */
export async function hasPremiumGrant(userId: string): Promise<boolean> {
  const { data } = await supabase.from("premium_grants").select("user_id").eq("user_id", userId).maybeSingle();
  return !!data;
}

async function billing(action: "checkout" | "portal" | "sync", body?: unknown): Promise<Response> {
  return fetch(`/api/billing/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body ?? {}),
  });
}

/** Sends the browser to Stripe Checkout; resolves only if that failed. */
export async function startCheckout(plan: "monthly" | "yearly"): Promise<string> {
  const res = await billing("checkout", { plan });
  if (res.ok) {
    const { url } = await res.json();
    location.href = url;
    return "";
  }
  return res.status === 503 ? "O pagamento ainda não está configurado." : "Não consegui abrir o pagamento. Tente de novo.";
}

/** Opens the Stripe Customer Portal (change card, switch plan, cancel). */
export async function openPortal(): Promise<string> {
  const res = await billing("portal");
  if (res.ok) {
    location.href = (await res.json()).url;
    return "";
  }
  return "Não consegui abrir o portal de assinatura agora.";
}

/** Right after Checkout returns: asks the server to copy the new subscription from Stripe. */
export async function syncBilling() {
  await billing("sync").catch(() => {});
}

/** Google sign-in (Supabase OAuth): leaves for Google and comes back signed in. */
export async function signInWithGoogle(): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin } });
  if (!error) return { ok: true };
  return {
    ok: false,
    error: error.message.includes("not enabled") ? "O login com Google ainda não está ativado." : message(error),
  };
}
