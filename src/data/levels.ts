// Levels, where each level starts on the learning path, and the adaptive placement test.

import type { Level } from "../lib/progress";
import { units, type Exercise, type Phrase } from "./course";

export interface LevelInfo {
  id: Level;
  label: string;
  description: string;
  /** Index into `units` where the learner is placed; earlier units stay open for review. */
  startUnit: number;
  flashcards: boolean;
}

export const levels: LevelInfo[] = [
  { id: "iniciante", label: "Iniciante", description: "Começando do zero: sons básicos e cumprimentos.", startUnit: 0, flashcards: true },
  { id: "basico", label: "Básico", description: "Você entende frases simples. Hora de afinar vogais e finais de palavra.", startUnit: 2, flashcards: true },
  { id: "intermediario", label: "Intermediário", description: "Você se vira bem. Foco em R/L e situações reais.", startUnit: 4, flashcards: true },
  { id: "avancado", label: "Avançado", description: "Você entende bem. Foco em conversa e inglês falado rápido.", startUnit: 6, flashcards: false },
];

export function levelInfo(level: Level | null): LevelInfo {
  return levels.find((l) => l.id === level) ?? levels[0];
}

/** Each test stage covers two units; passing a stage moves the learner up one level. */
const STAGES: number[][] = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
];

/** Correct answers needed (of 3) to pass a stage. */
export const STAGE_PASS = 2;
export const STAGE_COUNT = STAGES.length;

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

/** Three listening questions per stage: comprehension, minimal pair, dictation. */
export function buildStage(stage: number): Exercise[] {
  const stageUnits = STAGES[stage].map((i) => units[i]);
  const phrases: Phrase[] = stageUnits.flatMap((u) => u.phrases);
  const all = units.flatMap((u) => u.phrases);
  const [p1, p2] = shuffle(phrases);
  const wrong = shuffle(all.filter((x) => x !== p1)).slice(0, 3).map((x) => x.pt);
  return [
    { kind: "listen_choose", audio: p1.en, answer: p1.pt, options: shuffle([p1.pt, ...wrong]) },
    { kind: "minimal_pair", pair: pick(stageUnits.flatMap((u) => u.pairs)), play: Math.random() < 0.5 ? "a" : "b" },
    { kind: "dictation", phrase: p2 },
  ];
}

/** Number of stages passed in a row maps directly to a level. */
export function levelFromStages(passed: number): Level {
  return levels[Math.min(passed, levels.length - 1)].id;
}
