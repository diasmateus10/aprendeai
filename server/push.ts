// Daily study reminders: devices subscribe to Web Push, the app reports each study day, and a daily
// cron (vercel.json) notifies everyone who hasn't studied yet that day, mentioning their streak.

import type { IncomingMessage, ServerResponse } from "node:http";
import webpush from "web-push";
import type { Plugin } from "vite";
import { VAPID_PUBLIC_KEY } from "../src/data/push.js";
import { db } from "./db.js";
import { readBody } from "./chat.js";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** People who stopped for longer than this aren't reminded every day anymore. */
const INACTIVE_DAYS = 14;

type PushBody =
  | { action: "subscribe"; subscription: { endpoint: string; keys: { p256dh: string; auth: string } }; day: string | null; streak: number }
  | { action: "studied"; endpoint: string; day: string; streak: number }
  | { action: "unsubscribe"; endpoint: string };

const isEndpoint = (e: unknown): e is string => typeof e === "string" && e.startsWith("https://") && e.length <= 1000;
const isKey = (k: unknown): k is string => typeof k === "string" && k.length > 0 && k.length <= 200;
const isDay = (d: unknown): d is string => typeof d === "string" && DAY.test(d);
const isStreak = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 100_000;

function parse(raw: string): PushBody | null {
  try {
    const b = JSON.parse(raw);
    if (b.action === "subscribe") {
      const s = b.subscription;
      if (!isEndpoint(s?.endpoint) || !isKey(s?.keys?.p256dh) || !isKey(s?.keys?.auth)) return null;
      if (b.day !== null && !isDay(b.day)) return null;
      if (!isStreak(b.streak)) return null;
      return { action: "subscribe", subscription: s, day: b.day, streak: b.streak };
    }
    if (b.action === "studied" && isEndpoint(b.endpoint) && isDay(b.day) && isStreak(b.streak)) return b;
    if (b.action === "unsubscribe" && isEndpoint(b.endpoint)) return b;
    return null;
  } catch {
    return null;
  }
}

export async function handlePush(rawBody: string, res: ServerResponse) {
  const supabase = db();
  if (!supabase) {
    res.statusCode = 503;
    res.end();
    return;
  }
  const body = parse(rawBody);
  if (!body) {
    res.statusCode = 400;
    res.end();
    return;
  }
  const now = new Date().toISOString();
  const { error } =
    body.action === "subscribe"
      ? await supabase.from("push_subscriptions").upsert({
          endpoint: body.subscription.endpoint,
          p256dh: body.subscription.keys.p256dh,
          auth: body.subscription.keys.auth,
          last_study_day: body.day,
          streak: body.streak,
          updated_at: now,
        })
      : body.action === "studied"
        ? await supabase
            .from("push_subscriptions")
            .update({ last_study_day: body.day, streak: body.streak, updated_at: now })
            .eq("endpoint", body.endpoint)
        : await supabase.from("push_subscriptions").delete().eq("endpoint", body.endpoint);
  if (error) {
    console.error("[push]", body.action, error.message);
    res.statusCode = 502;
    res.end();
    return;
  }
  res.statusCode = 204;
  res.end();
}

/** YYYY-MM-DD in Brasília, `offset` days from today: the learners' calendar, not the server's. */
function brDay(offset = 0): string {
  return new Date(Date.now() + offset * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function message(lastStudy: string | null, streak: number): { title: string; body: string } {
  if (lastStudy === brDay(-1) && streak > 0) {
    return {
      title: `🔥 Sua ofensiva de ${streak} ${streak === 1 ? "dia" : "dias"} está em risco!`,
      body: "Faça uma lição rapidinha hoje para não perder a sequência.",
    };
  }
  return { title: "🦜 Hora do inglês!", body: "Que tal 5 minutinhos de prática hoje? Ouvir e falar todo dia faz diferença." };
}

/** Sends today's reminders; returns how many went out. */
export async function sendReminders(): Promise<{ sent: number; removed: number }> {
  const supabase = db();
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!supabase || !privateKey) throw new Error("SUPABASE_SECRET_KEY and VAPID_PRIVATE_KEY are required");
  // The contact push services see; the site's address keeps personal emails out of it.
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://aprendeai-ruby.vercel.app", VAPID_PUBLIC_KEY, privateKey);

  const today = brDay();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth, last_study_day, streak")
    .or(`last_study_day.is.null,last_study_day.lt.${today}`)
    .or(`last_notified_day.is.null,last_notified_day.lt.${today}`)
    .or(`last_study_day.is.null,last_study_day.gte.${brDay(-INACTIVE_DAYS)}`);
  if (error) throw new Error(error.message);

  let sent = 0;
  let removed = 0;
  for (const s of data ?? []) {
    const { title, body } = message(s.last_study_day, s.streak);
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title, body, url: "/" }),
        { TTL: 4 * 3600 },
      );
      sent++;
      await supabase.from("push_subscriptions").update({ last_notified_day: today }).eq("endpoint", s.endpoint);
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      // The device unsubscribed or the browser dropped it: stop trying.
      if (status === 404 || status === 410) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        removed++;
      } else console.error("[push] send failed", status, (e as Error).message);
    }
  }
  // Usage counters older than a week aren't needed anymore.
  await supabase.from("api_usage").delete().lt("day", brDay(-7));
  return { sent, removed };
}

/** Vercel calls the cron with "Authorization: Bearer <CRON_SECRET>". */
export function cronAuthorized(req: IncomingMessage): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.authorization === `Bearer ${secret}`;
}

export async function handleCron(req: IncomingMessage, res: ServerResponse) {
  if (!cronAuthorized(req)) {
    res.statusCode = 401;
    res.end();
    return;
  }
  try {
    const result = await sendReminders();
    console.log("[push] reminders", result);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(result));
  } catch (e) {
    console.error("[push] cron failed", e);
    res.statusCode = 500;
    res.end();
  }
}

export function pushApi(): Plugin {
  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url === "/api/push" && req.method === "POST") {
      readBody(req).then((raw) => handlePush(raw, res));
      return;
    }
    if (req.url === "/api/cron/reminders" && req.method === "GET") {
      handleCron(req, res);
      return;
    }
    next();
  };
  return {
    name: "aprendeai-push-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
