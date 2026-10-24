// Weekly progress report (Premium): an agent compares the week's conversations with the learner's
// profile from before (learner_insights) and writes, in Portuguese, what improved, what still needs
// work and a goal for next week. Run by trigger/reports.ts every Sunday.

import type Anthropic from "@anthropic-ai/sdk";
import { db } from "./db.js";

type Turn = { role: "user" | "assistant"; content: string };

const REPORT_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
/** Fewer user lines than this in the week: too little to judge, no report. */
const MIN_USER_TURNS = 4;
/** Conversations read per report (the most recent of the week). */
const MAX_SESSIONS = 10;

export interface ProgressReport {
  headline: string;
  improved: { point: string; before: string; now: string }[];
  focus: { point: string; tip: string; example: string }[];
  next_goal: string;
  stats: { conversations: number; minutes: number; lines: number };
}

const PROMPT = `You write a weekly progress report for a native Brazilian Portuguese speaker practicing spoken English with an AI partner.
The learner's lines come from speech recognition: ignore punctuation and capitalization, and ignore odd words that are clearly recognition glitches.
You receive the learner's profile from before this week (weak points with examples, if any) and this week's conversations, oldest first.
Compare: what got better this week (a weak point they now get right, longer or more complex sentences, new vocabulary), and what still needs work.
Be honest and specific, quote what they really said, and be encouraging without inventing progress. Write everything in Brazilian Portuguese except the English quotes.
Answer with only a JSON object, no markdown, in this exact shape:
{"headline": "one short sentence summing up the week",
 "improved": [{"point": "short name", "before": "what they used to say (or empty)", "now": "what they say now"}],
 "focus": [{"point": "short name", "tip": "one short tip", "example": "what they said → correct sentence"}],
 "next_goal": "one concrete goal for next week"}
Use 0 to 3 items in "improved" (none if nothing really improved) and 1 to 3 in "focus".`;

/** The Monday that starts the week (Brasília) of `date`, as YYYY-MM-DD. */
export function weekStart(date = new Date()): string {
  const br = new Date(date.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  br.setDate(br.getDate() - ((br.getDay() + 6) % 7));
  return br.toLocaleDateString("en-CA");
}

/** Learners with conversations in the last 7 days. */
export async function activeLearners(): Promise<string[]> {
  const supabase = db();
  if (!supabase) throw new Error("SUPABASE_SECRET_KEY is required");
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data, error } = await supabase.from("chat_sessions").select("user_id").gte("started_at", since).gt("user_turns", 0);
  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).map((r) => r.user_id as string))];
}

/** Writes and saves this week's report; returns it, or null when the week had too little speech. */
export async function writeWeeklyReport(client: Anthropic, userId: string): Promise<ProgressReport | null> {
  const supabase = db();
  if (!supabase) throw new Error("SUPABASE_SECRET_KEY is required");
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [{ data: sessions, error }, { data: profile }] = await Promise.all([
    supabase
      .from("chat_sessions")
      .select("topic, messages, user_turns, started_at, updated_at")
      .eq("user_id", userId)
      .gte("started_at", since)
      .gt("user_turns", 0)
      .order("started_at", { ascending: true }),
    supabase.from("learner_insights").select("weak_points").eq("user_id", userId).maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  const week = sessions ?? [];
  const lines = week.reduce((n, s) => n + (s.user_turns as number), 0);
  if (lines < MIN_USER_TURNS) return null;
  const minutes = Math.round(
    week.reduce((n, s) => n + Math.min(30, (Date.parse(s.updated_at as string) - Date.parse(s.started_at as string)) / 60_000), 0),
  );

  const transcripts = week
    .slice(-MAX_SESSIONS)
    .map((s, i) => {
      const text = (s.messages as Turn[]).map((m) => `${m.role === "user" ? "Learner" : "Partner"}: ${m.content}`).join("\n");
      return `## Conversation ${i + 1} (topic: ${s.topic}, ${String(s.started_at).slice(0, 10)})\n${text}`;
    })
    .join("\n\n");
  const before = profile ? JSON.stringify(profile.weak_points) : "none yet";
  const response = await client.messages.create({
    model: REPORT_MODEL,
    max_tokens: 2048,
    system: PROMPT,
    messages: [{ role: "user", content: `Profile before this week: ${before}\n\nThis week's conversations:\n\n${transcripts}` }],
  });
  const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  if (typeof parsed.headline !== "string" || !Array.isArray(parsed.improved) || !Array.isArray(parsed.focus) || typeof parsed.next_goal !== "string") {
    throw new Error("unexpected shape");
  }
  const report: ProgressReport = {
    headline: parsed.headline,
    improved: parsed.improved.slice(0, 3),
    focus: parsed.focus.slice(0, 3),
    next_goal: parsed.next_goal,
    stats: { conversations: week.length, minutes: Math.max(1, minutes), lines },
  };
  const { error: saveError } = await supabase
    .from("progress_reports")
    .upsert({ user_id: userId, week_start: weekStart(), report, seen_at: null }, { onConflict: "user_id,week_start" });
  if (saveError) throw new Error(saveError.message);
  return report;
}
