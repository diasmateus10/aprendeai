// Learner progress persisted in localStorage.

import { DEFAULT_STYLE, type AiStyle } from "../data/aiStyle";

export type Level = "iniciante" | "basico" | "intermediario" | "avancado";

export interface CardState {
  /** Leitner box 0..4; higher boxes come back less often. */
  box: number;
  due: string;
}

/** Progress in the Kids mode, kept apart from the adult course. */
export interface KidsProgress {
  stars: number;
  /** Stars earned per day (YYYY-MM-DD), for the parents' week view. */
  daily: Record<string, number>;
  cards: Record<string, CardState>;
  /** rhymeId -> best stars (1..3). */
  rhymes: Record<string, number>;
  speakingSeconds: number;
  chats: number;
  games: number;
}

export interface Progress {
  /** Who is learning; null until the first screen is answered. */
  mode: "adult" | "kids" | null;
  kids: KidsProgress;
  /** Set by the placement test (or by starting from zero); null until onboarding is done. */
  level: Level | null;
  cards: Record<string, CardState>;
  completed: Record<string, number>; // lessonId -> best stars (1..3)
  xp: number;
  /** XP earned per day (YYYY-MM-DD), used for the daily goal and the week strip. */
  daily: Record<string, number>;
  dailyGoal: number;
  streak: number;
  lastDay: string | null;
  speakingSeconds: number;
  /** How the AI conversation partner talks, chosen by the learner. */
  aiStyle: AiStyle;
  /** English voice picked by name; null means the most natural one available. */
  voiceName: string | null;
}

export const GOALS = [
  { xp: 10, label: "Casual", minutes: 5 },
  { xp: 20, label: "Regular", minutes: 10 },
  { xp: 30, label: "Sério", minutes: 15 },
  { xp: 50, label: "Intenso", minutes: 25 },
];

const KEY = "papagaio.progress.v1";

const emptyKids: KidsProgress = { stars: 0, daily: {}, cards: {}, rhymes: {}, speakingSeconds: 0, chats: 0, games: 0 };

const empty: Progress = {
  mode: null,
  kids: emptyKids,
  level: null,
  cards: {},
  completed: {},
  xp: 0,
  daily: {},
  dailyGoal: 20,
  streak: 0,
  lastDay: null,
  speakingSeconds: 0,
  aiStyle: DEFAULT_STYLE,
  voiceName: null,
};

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...empty };
    const saved = JSON.parse(raw);
    // Learners from before the Kids mode existed are adults.
    const mode = saved.mode ?? (saved.level ? "adult" : null);
    return { ...empty, ...saved, mode, kids: { ...emptyKids, ...saved.kids }, aiStyle: { ...DEFAULT_STYLE, ...saved.aiStyle } };
  } catch {
    return { ...empty };
  }
}

export function saveProgress(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // storage unavailable (private mode); progress lives only in memory
  }
}

export function dayKey(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Adds XP from any activity (lesson, flashcards, conversation) and keeps the streak. */
export function addXp(p: Progress, xp: number): Progress {
  const d = dayKey();
  let streak = p.streak;
  if (p.lastDay !== d) streak = p.lastDay === dayKey(-1) ? streak + 1 : 1;
  return { ...p, xp: p.xp + xp, daily: { ...p.daily, [d]: (p.daily[d] ?? 0) + xp }, streak, lastDay: d };
}

/** Adds stars from any kids activity. */
export function addStars(p: Progress, stars: number, extra: Partial<KidsProgress> = {}): Progress {
  const d = dayKey();
  const k = { ...p.kids, ...extra };
  return { ...p, kids: { ...k, stars: k.stars + stars, daily: { ...k.daily, [d]: (k.daily[d] ?? 0) + stars } } };
}

export function recordLesson(p: Progress, lessonId: string, stars: number, xp: number): Progress {
  const next = addXp(p, xp);
  return { ...next, completed: { ...next.completed, [lessonId]: Math.max(stars, p.completed[lessonId] ?? 0) } };
}

export function todayXp(p: Progress): number {
  return p.daily[dayKey()] ?? 0;
}

export function displayStreak(p: Progress): number {
  if (!p.lastDay) return 0;
  return p.lastDay === dayKey() || p.lastDay === dayKey(-1) ? p.streak : 0;
}
