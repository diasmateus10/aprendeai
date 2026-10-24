// Picks the themes of the personalized path (data/themes.ts).

import { useState } from "react";
import {
  AirplaneTilt,
  ArrowLeft,
  Briefcase,
  Check,
  CurrencyDollar,
  FilmSlate,
  ForkKnife,
  GameController,
  GraduationCap,
  Heartbeat,
  House,
  Laptop,
  MusicNotes,
  ShoppingBag,
  SoccerBall,
  Tree,
  UsersThree,
  type Icon,
} from "@phosphor-icons/react";
import { THEME_COUNT, THEMES } from "../data/themes";

const ICONS: Record<string, Icon> = {
  comida: ForkKnife,
  viagem: AirplaneTilt,
  trabalho: Briefcase,
  tecnologia: Laptop,
  esportes: SoccerBall,
  filmes: FilmSlate,
  musica: MusicNotes,
  compras: ShoppingBag,
  saude: Heartbeat,
  familia: House,
  social: UsersThree,
  negocios: CurrencyDollar,
  games: GameController,
  natureza: Tree,
  estudos: GraduationCap,
};

export function ThemePicker({ initial, onDone, onExit }: { initial: string[] | null; onDone(themes: string[]): void; onExit?(): void }) {
  const [picked, setPicked] = useState<string[]>(initial ?? []);
  const full = picked.length === THEME_COUNT;
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((t) => t !== id) : p.length < THEME_COUNT ? [...p, id] : p));
  return (
    <div className="page theme-page">
      <header className="page-top">
        {onExit && (
          <button className="close" onClick={onExit} aria-label="Voltar">
            <ArrowLeft size={22} weight="bold" />
          </button>
        )}
        <h1>Monte sua trilha</h1>
      </header>
      <p className="hint">
        Escolha {THEME_COUNT} assuntos que você gosta. As lições vão usar frases desses temas, intercaladas com as unidades de pronúncia.
      </p>
      <div className="topic-grid">
        {THEMES.map((t) => {
          const Glyph = ICONS[t.id];
          const on = picked.includes(t.id);
          return (
            <button
              key={t.id}
              className={`topic theme-choice ${on ? "on" : ""}`}
              aria-pressed={on}
              disabled={!on && full}
              onClick={() => toggle(t.id)}
            >
              <span className="theme-icon">{on ? <Check size={22} weight="bold" /> : <Glyph size={24} weight="duotone" />}</span>
              <strong>{t.title}</strong>
              <span>{t.description}</span>
            </button>
          );
        })}
      </div>
      <div className="theme-actions">
        <button className="btn primary block lg" disabled={!full} onClick={() => onDone(picked)}>
          {full ? "Montar minha trilha" : `Escolha mais ${THEME_COUNT - picked.length}`}
        </button>
      </div>
    </div>
  );
}
