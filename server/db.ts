// Supabase (Postgres) access for the server: reminders and daily usage limits.
// Uses the secret key, which bypasses RLS; it stays on the server like the other API keys.

import { createHmac } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PREMIUM_STATUSES } from "../src/data/plans.js";

const URL = process.env.SUPABASE_URL || "https://akctjmradduksgxnpian.supabase.co";

let client: SupabaseClient | null = null;

/** null when SUPABASE_SECRET_KEY isn't set: limits then live in memory and reminders are off. */
export function db(): SupabaseClient | null {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return null;
  client ??= createClient(URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

/** The signed-in account behind a request ("Authorization: Bearer <Supabase access token>"), or null. */
export async function userFromRequest(req: { headers: Record<string, string | string[] | undefined> }) {
  const supabase = db();
  const header = req.headers.authorization;
  const token = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!supabase || !token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  return error ? null : data.user;
}

/** True while the account's subscription is trialing or paid (see PREMIUM_STATUSES). */
export async function isPremium(userId: string): Promise<boolean> {
  const supabase = db();
  if (!supabase) return false;
  const { data } = await supabase.from("subscriptions").select("status").eq("user_id", userId).maybeSingle();
  return PREMIUM_STATUSES.includes(data?.status ?? "");
}

// In-memory fallback: good enough for one dev server, best effort on serverless.
const memory = new Map<string, number>();

/**
 * Counts one use of `kind` for this person today and says whether it is within `limit`.
 * The IP address is stored only as a keyed hash.
 */
export async function allow(ip: string, kind: string, limit: number): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10);
  const supabase = db();
  if (supabase) {
    const who = createHmac("sha256", process.env.SUPABASE_SECRET_KEY!).update(ip).digest("base64url").slice(0, 22);
    const { data, error } = await supabase.rpc("use_quota", { p_client: who, p_day: day, p_kind: kind, p_limit: limit });
    if (!error) return data as boolean;
    console.error("[db] use_quota failed; counting in memory:", error.message);
  }
  const key = `${day}|${kind}|${ip}`;
  if (memory.size > 30_000) memory.clear();
  const n = (memory.get(key) ?? 0) + 1;
  memory.set(key, n);
  return n <= limit;
}

/**
 * Marks the current minute as used for `kind` and returns how many distinct minutes were used today:
 * talk time measured by activity, so a conversation ended early doesn't waste the rest of the day's time.
 */
export async function activeMinutes(id: string, kind: string): Promise<number> {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const minute = `${kind}:${now.toISOString().slice(11, 16)}`;
  const supabase = db();
  if (supabase) {
    const who = createHmac("sha256", process.env.SUPABASE_SECRET_KEY!).update(id).digest("base64url").slice(0, 22);
    const mark = await supabase.rpc("use_quota", { p_client: who, p_day: day, p_kind: minute, p_limit: 1_000_000 });
    const { count, error } = await supabase
      .from("api_usage")
      .select("kind", { count: "exact", head: true })
      .eq("client", who)
      .eq("day", day)
      .like("kind", `${kind}:%`);
    if (!mark.error && !error) return count ?? 0;
    console.error("[db] activeMinutes failed; counting in memory:", (mark.error ?? error)!.message);
  }
  memory.set(`${day}|${minute}|${id}`, 1);
  return [...memory.keys()].filter((k) => k.startsWith(`${day}|${kind}:`) && k.endsWith(`|${id}`)).length;
}
