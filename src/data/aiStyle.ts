// How the AI conversation partner talks. Shared by the settings UI and the server prompt.

export interface Option<T extends string> {
  id: T;
  label: string;
  emoji: string;
  description: string;
  /** Instruction added to the AI prompt. */
  prompt: string;
}

export type PersonaId = "friendly" | "serious" | "direct" | "unfiltered" | "funny" | "teacher" | "challenger";
export type CorrectionsId = "always" | "important" | "none";
export type LengthId = "short" | "medium";
export type AccentId = "en-US" | "en-GB";

export const PERSONAS: Option<PersonaId>[] = [
  {
    id: "friendly",
    label: "Amigável",
    emoji: "😊",
    description: "Simpático e encorajador",
    prompt: "Be warm, friendly and encouraging, like a kind friend.",
  },
  {
    id: "serious",
    label: "Sério",
    emoji: "🧐",
    description: "Formal e profissional, sem brincadeiras",
    prompt: "Be serious, formal and professional. Use polite, formal English. No jokes, no emojis, no small talk.",
  },
  {
    id: "direct",
    label: "Direto",
    emoji: "🎯",
    description: "Respostas curtíssimas, sem rodeios",
    prompt: "Be extremely direct and to the point. No greetings or filler, no compliments. Say only what is needed, then ask the next question.",
  },
  {
    id: "unfiltered",
    label: "Sem filtro",
    emoji: "🔥",
    description: "Gírias, palavrões leves e sinceridade total",
    prompt:
      "Talk like a blunt, casual native speaker with no filter: use slang, informal contractions (gonna, wanna, y'all) and mild swearing when it fits. Be brutally honest and sarcastic in a playful way, and point out mistakes bluntly. Tease the situation, never the learner: never call the learner names (idiot, stupid, etc.), and never use slurs, hate or sexual content.",
  },
  {
    id: "funny",
    label: "Engraçado",
    emoji: "😂",
    description: "Piadas e bom humor",
    prompt: "Be funny and playful: add light jokes, puns and silly comments while keeping the conversation going.",
  },
  {
    id: "teacher",
    label: "Professor paciente",
    emoji: "👩‍🏫",
    description: "Calmo, explica e dá exemplos",
    prompt:
      "Act as a patient English teacher: speak slowly and simply, rephrase when useful, and give a short example sentence the learner can copy.",
  },
  {
    id: "challenger",
    label: "Desafiador",
    emoji: "💪",
    description: "Perguntas difíceis, puxa respostas longas",
    prompt:
      "Be challenging: ask open, thought-provoking follow-up questions, politely disagree sometimes to start a debate, and push the learner to give longer, more detailed answers.",
  },
];

export const CORRECTIONS: Option<CorrectionsId>[] = [
  {
    id: "important",
    label: "Só erros importantes",
    emoji: "⚖️",
    description: "Corrige o que atrapalha o entendimento",
    prompt:
      'Only correct clear mistakes that matter (wrong word, wrong tense, wrong meaning). When you do, add the "💡" correction line with the right sentence and a short explanation. Skip small slips.',
  },
  {
    id: "always",
    label: "Todos os erros",
    emoji: "🔎",
    description: "Corrige tudo, até detalhes",
    prompt:
      'Correct every grammar, word-choice or naturalness mistake in the learner\'s last message. Add the "💡" correction line with the corrected sentence and a short explanation.',
  },
  {
    id: "none",
    label: "Sem correções",
    emoji: "🗣️",
    description: "Conversa livre; correções só no final",
    prompt: 'Never correct the learner during the conversation and never write a "💡" line. Just keep talking naturally.',
  },
];

export const LENGTHS: Option<LengthId>[] = [
  { id: "short", label: "Curtas", emoji: "⚡", description: "1 a 2 frases", prompt: "Reply in 1 or 2 short sentences." },
  { id: "medium", label: "Médias", emoji: "💬", description: "2 a 4 frases", prompt: "Reply in 2 to 4 sentences." },
];

export const ACCENTS: Option<AccentId>[] = [
  { id: "en-US", label: "Americano", emoji: "🇺🇸", description: "Vocabulário e voz dos EUA", prompt: "Use American English vocabulary and spelling." },
  { id: "en-GB", label: "Britânico", emoji: "🇬🇧", description: "Vocabulário e voz do Reino Unido", prompt: "Use British English vocabulary and spelling (flat, lift, queue, etc.)." },
];

export interface AiStyle {
  persona: PersonaId;
  corrections: CorrectionsId;
  length: LengthId;
  accent: AccentId;
}

export const DEFAULT_STYLE: AiStyle = { persona: "friendly", corrections: "important", length: "short", accent: "en-US" };

function pick<T extends string>(options: Option<T>[], id: unknown, fallback: T): Option<T> {
  return options.find((o) => o.id === id) ?? options.find((o) => o.id === fallback)!;
}

/** Validates an untrusted style (from the browser) and returns the prompt lines for it. */
export function stylePrompt(raw: Partial<Record<keyof AiStyle, unknown>> | undefined): string {
  const s = raw ?? {};
  return [
    pick(PERSONAS, s.persona, DEFAULT_STYLE.persona).prompt,
    pick(LENGTHS, s.length, DEFAULT_STYLE.length).prompt,
    pick(CORRECTIONS, s.corrections, DEFAULT_STYLE.corrections).prompt,
    pick(ACCENTS, s.accent, DEFAULT_STYLE.accent).prompt,
  ].join("\n");
}
