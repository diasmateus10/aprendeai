// Personalized path: the learner picks THEME_COUNT themes and the path alternates the pronunciation
// units with the units of those themes. Theme units were written once with AI (scripts/theme-units.mjs)
// and reviewed; "comida" and "viagem" start with the course's café and travel units.

import { units, type Lesson, type Unit } from "./course";
import generated from "./theme-units.json";

export interface Theme {
  id: string;
  title: string;
  description: string;
}

export const THEMES: Theme[] = [
  { id: "comida", title: "Comida", description: "Café, restaurante, pedir e pagar" },
  { id: "viagem", title: "Viagem", description: "Aeroporto, hotel e passeios" },
  { id: "trabalho", title: "Trabalho", description: "Escritório, reuniões e entrevista" },
  { id: "tecnologia", title: "Tecnologia", description: "Celular, apps e projetos" },
  { id: "esportes", title: "Esportes", description: "Futebol, academia e jogos" },
  { id: "filmes", title: "Filmes e séries", description: "Opinar, recomendar e streaming" },
  { id: "musica", title: "Música", description: "Artistas, shows e festivais" },
  { id: "compras", title: "Compras", description: "Lojas, mercado e compras online" },
  { id: "saude", title: "Saúde", description: "Médico, farmácia e bem-estar" },
  { id: "familia", title: "Família e casa", description: "Parentes, casa e rotina" },
  { id: "social", title: "Amizades", description: "Convites, festas e small talk" },
  { id: "negocios", title: "Dinheiro e negócios", description: "Banco, negociação e clientes" },
  { id: "games", title: "Games", description: "Jogar online e comunidade gamer" },
  { id: "natureza", title: "Natureza", description: "Animais, clima e ao ar livre" },
  { id: "estudos", title: "Estudos", description: "Faculdade, provas e intercâmbio" },
];

export const THEME_COUNT = 5;
/** Path for learners who haven't picked themes yet (it keeps the café and travel units they may have done). */
export const DEFAULT_THEMES = ["comida", "viagem", "trabalho", "social", "filmes"];

const unit = (id: string) => units.find((u) => u.id === id)!;
const gen = generated as Record<string, Unit[]>;

/** Two units per theme. */
export const themeUnits: Record<string, Unit[]> = Object.fromEntries(
  THEMES.map((t) => [t.id, t.id === "comida" ? [unit("cafe"), ...gen.comida] : t.id === "viagem" ? [unit("travel"), ...gen.viagem] : gen[t.id]]),
);

/** Pronunciation units, in course order. */
const SOUND_UNITS = ["hello", "th", "vowels", "endings", "r-l", "linking"];

/** Every unit that can appear in a path. */
export const allUnits: Unit[] = [...SOUND_UNITS.map(unit), ...Object.values(themeUnits).flat()];

/** Sound unit, first unit of a theme, next sound unit, ...; then the themes' second units. */
export function pathUnits(themes: string[] | null): Unit[] {
  const picked = (themes?.length ? themes : DEFAULT_THEMES).filter((t) => themeUnits[t]);
  const out: Unit[] = [];
  SOUND_UNITS.forEach((id, i) => {
    out.push(unit(id));
    if (picked[i]) out.push(themeUnits[picked[i]][0]);
  });
  picked.slice(SOUND_UNITS.length).forEach((t) => out.push(themeUnits[t][0]));
  picked.forEach((t) => out.push(...themeUnits[t].slice(1)));
  return out;
}

// Each unit has the same three steps; the screen pairs each with an icon.
const focuses: { focus: Lesson["focus"]; title: string }[] = [
  { focus: "escuta", title: "Ouvir" },
  { focus: "fala", title: "Falar" },
  { focus: "conversa", title: "Conversar" },
];

export function lessonsFor(path: Unit[]): Lesson[] {
  return path.flatMap((u) => focuses.map((f) => ({ id: `${u.id}-${f.focus}`, unitId: u.id, title: f.title, focus: f.focus })));
}
