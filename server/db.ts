// Supabase (Postgres) access for the server: reminders and daily usage limits.
// Uses the secret key, which bypasses RLS; it stays on the server like the other API keys.

import { createHmac } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL || "https://akctjmradduksgxnpian.supabase.co";

let client: SupabaseClient | null = null;

/** null when SUPABASE_SECRET_KEY isn't set: limits then live in memory and reminders are off. */
export function db(): SupabaseClient | null {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return null;
  client ??= createClient(URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
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
