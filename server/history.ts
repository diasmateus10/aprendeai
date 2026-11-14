// Conversation history and the learner-insights agent (adult mode only; Kids conversations aren't stored).
// Every reply saves the whole conversation; when it ends, an agent rereads the learner's recent
// conversations and rewrites what they find hardest, which the AI partner then uses to steer the next one.

import type Anthropic from "@anthropic-ai/sdk";
import { db } from "./db.js";

type Turn = { role: "user" | "assistant"; content: string };

/** Conversations the agent rereads to update the learner's profile. */
const RECENT_SESSIONS = 6;
const INSIGHTS_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";

export const isSessionId = (id: unknown): id is string =>
  typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/** Saves the conversation so far (with the reply just sent). A session id belongs to one account only. */
export async function saveConversation(userId: string, sessionId: string, topic: string, level: string, history: Turn[], reply: string) {
  const supabase = db();
  if (!supabase) return;
  const { data: existing } = await supabase.from("chat_sessions").select("user_id").eq("id", sessionId).maybeSingle();
  if (existing && existing.user_id !== userId) return;
  const messages = [...history, { role: "assistant", content: reply }];
  const { error } = await supabase.from("chat_sessions").upsert({
    id: sessionId,
    user_id: userId,
    topic,
    level,
    messages,
    user_turns: history.filter((m) => m.role === "user").length,
    updated_at: new Date().toISOString(),
  });
  if (error) console.error("[history] save failed:", error.message);
}

/** Stores the end-of-conversation feedback and closes the session. */
export async function saveFeedback(userId: string, sessionId: string, feedback: string) {
  const supabase = db();
  if (!supabase) return;
  const { error } = await supabase
    .from("chat_sessions")
    .update({ feedback, ended_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", userId);
  if (error) console.error("[history] feedback failed:", error.message);
}

// "Fale sobre qualquer coisa" (topic "free"): the partner rereads the learner's past free conversations and opens
// by offering subjects from them, instead of the same "what do you want to talk about?" every time.

/** Past free conversations the partner rereads, and how much of them goes into its instructions (~1.5k tokens). */
const FREE_MEMORY_SESSIONS = 8;
const FREE_MEMORY_CHARS = 6000;
const FREE_MEMORY_PER_SESSION = 1200;

export interface PastSession {
  messages: Turn[];
  started_at: string;
}

const clip = (text: string, max: number) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/** The learner's past free conversations as a short dialogue per conversation, newest first; "" when there are none. */
export function formatFreeMemory(sessions: PastSession[], now = Date.now()): string {
  const blocks: string[] = [];
  let total = 0;
  for (const s of sessions) {
    if (!s.messages.some((m) => m.role === "user" && m.content.trim())) continue;
    const days = Math.floor((now - Date.parse(s.started_at)) / 86_400_000);
    const when = days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
    let block = `Conversation ${when}:`;
    for (const m of s.messages) {
      // The partner's 💡 correction line is left out: what matters here is what was talked about.
      const line = m.role === "user" ? `Learner: ${clip(m.content, 220)}` : `You: ${clip(m.content.split("💡")[0], 160)}`;
      if (block.length + line.length > FREE_MEMORY_PER_SESSION) {
        block += "\n…";
        break;
      }
      block += `\n${line}`;
    }
    if (blocks.length && total + block.length > FREE_MEMORY_CHARS) break;
    blocks.push(block);
    total += block.length;
  }
  return blocks.join("\n\n");
}

/** Reads the learner's past free conversations (not the current one) for the partner; "" when there are none. */
export async function freeTalkMemory(userId: string, currentSessionId?: string): Promise<string> {
  const supabase = db();
  if (!supabase) return "";
  let query = supabase.from("chat_sessions").select("messages, started_at").eq("user_id", userId).eq("topic", "free").gt("user_turns", 0);
  if (currentSessionId) query = query.neq("id", currentSessionId);
  const { data, error } = await query.order("started_at", { ascending: false }).limit(FREE_MEMORY_SESSIONS);
  if (error) {
    // Without the memory the conversation still opens, just with the generic greeting.
    console.error("[history] free memory failed:", error.message);
    return "";
  }
  return formatFreeMemory((data ?? []) as PastSession[]);
}

interface Insights {
  summary: string;
  weak_points: { area: string; evidence: string[]; tip: string }[];
  next_focus: string;
}

/** The learner's profile as instructions for the AI partner, or "" when there is none yet. */
export async function partnerNotes(userId: string): Promise<string> {
  const supabase = db();
  if (!supabase) return "";
  const { data } = await supabase.from("learner_insights").select("weak_points, next_focus").eq("user_id", userId).maybeSingle();
  if (!data) return "";
  const points = (data.weak_points as Insights["weak_points"]).map((p) => `- ${p.area}: e.g. ${p.evidence.slice(0, 2).join("; ")}`);
  return `
Notes from this learner's past conversations (never mention that you have them):
${points.join("\n")}
Focus for this conversation: ${data.next_focus}
Steer the conversation so they naturally have to use these points: from your first message (or, if the learner picks the subject, from your first reply), ask questions within the scenario that need them, and correct these mistakes when they happen.`;
}

const INSIGHTS_PROMPT = `You analyze spoken English practice conversations of a native Brazilian Portuguese speaker.
The learner's lines come from speech recognition: ignore punctuation and capitalization, and ignore odd words that are clearly recognition glitches.
You receive the learner's current profile (if any) and their most recent conversations, newest first.
Update the profile. Keep weak points that still show up, drop the ones the learner now gets right, add new ones, and order them by how much they hurt communication.
Answer with only a JSON object, no markdown, in this exact shape:
{"summary": "2 or 3 sentences in Brazilian Portuguese about the learner's English and progress",
 "weak_points": [{"area": "short name in Portuguese, e.g. Passado simples", "evidence": ["what they said → correct sentence", "up to 3 real examples"], "tip": "one short tip in Portuguese"}],
 "next_focus": "1 or 2 sentences in English telling a conversation partner what to make the learner practice next, e.g. 'Ask about last weekend so they use simple past irregular verbs (went, ate, saw).'"}
Use at most 4 weak points. If there is too little speech to judge, keep the current profile as it is.`;

/** Runs the insights agent over the learner's recent conversations and saves the new profile; throws on failure. */
export async function updateInsights(client: Anthropic, userId: string) {
  const supabase = db();
  if (!supabase) return;
  const [{ data: sessions }, { data: current }] = await Promise.all([
    supabase
      .from("chat_sessions")
      .select("topic, messages, started_at")
      .eq("user_id", userId)
      .gt("user_turns", 0)
      .order("started_at", { ascending: false })
      .limit(RECENT_SESSIONS),
    supabase.from("learner_insights").select("summary, weak_points, next_focus, sessions_analyzed").eq("user_id", userId).maybeSingle(),
  ]);
  if (!sessions?.length) return;
  const transcripts = sessions
    .map((s, i) => {
      const lines = (s.messages as Turn[]).map((m) => `${m.role === "user" ? "Learner" : "Partner"}: ${m.content}`).join("\n");
      return `## Conversation ${i + 1} (topic: ${s.topic}, ${String(s.started_at).slice(0, 10)})\n${lines}`;
    })
    .join("\n\n");
  const profile = current ? JSON.stringify({ summary: current.summary, weak_points: current.weak_points, next_focus: current.next_focus }) : "none yet";
  const response = await client.messages.create({
    model: INSIGHTS_MODEL,
    max_tokens: 2048,
    system: INSIGHTS_PROMPT,
    messages: [{ role: "user", content: `Current profile: ${profile}\n\nRecent conversations:\n\n${transcripts}` }],
  });
  const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as Insights;
  if (typeof parsed.summary !== "string" || !Array.isArray(parsed.weak_points) || typeof parsed.next_focus !== "string") {
    throw new Error("unexpected shape");
  }
  const { error } = await supabase.from("learner_insights").upsert({
    user_id: userId,
    summary: parsed.summary,
    weak_points: parsed.weak_points.slice(0, 4),
    next_focus: parsed.next_focus,
    sessions_analyzed: (current?.sessions_analyzed ?? 0) + 1,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}
