import { useEffect, useRef, useState } from "react";
import { categoriesFor, imageFor } from "../data/vocab";
import type { CardState, Level } from "../lib/progress";
import { listen, speak, sttSupported, type ListenHandle } from "../lib/speech";

/** A picture card: the learner sees the image and says the English word. */
export interface Card {
  id: string;
  emoji: string;
  en: string;
  answers: string[];
  pt: string;
  category: string;
  verb: boolean;
  /** Overrides the default "O que é isso?" (the Kids mode asks "Que cor é essa?", etc.). */
  question?: string;
}

/** The card's 3D illustration; falls back to the plain emoji if the image fails to load. */
function CardPicture({ emoji }: { emoji: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="picture-emoji" aria-label="imagem">
        {emoji}
      </div>
    );
  }
  return <img className="picture-img" src={imageFor(emoji)} alt="imagem" width={180} height={180} onError={() => setFailed(true)} />;
}

/** Days until a card in each Leitner box comes back. */
const INTERVALS = [0, 1, 3, 7, 14];
const SESSION_SIZE = 12;
const MAX_TRIES = 2;

function addDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/** Every picture card for the learner's level, categories interleaved so a session mixes topics. */
export function deckFor(level: Level | null): Card[] {
  const perCategory = categoriesFor(level).map((c) =>
    c.items.map((it) => ({
      id: `${c.id}:${it.en}`,
      emoji: it.emoji,
      en: it.en,
      answers: [it.en, ...(it.alt ?? [])],
      pt: it.pt,
      category: c.title,
      verb: !!c.verbs,
    })),
  );
  const deck: Card[] = [];
  for (let i = 0; perCategory.some((c) => i < c.length); i++) {
    for (const c of perCategory) if (i < c.length) deck.push(c[i]);
  }
  return deck;
}

/** Due cards first, then unseen ones, capped at one session's worth. */
export function sessionCards(deck: Card[], states: Record<string, CardState>): Card[] {
  const today = addDays(0);
  const due = deck.filter((c) => states[c.id] && states[c.id].due <= today);
  const fresh = deck.filter((c) => !states[c.id]);
  return [...due, ...fresh].slice(0, SESSION_SIZE);
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^a-z0-9' -]+/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
}

const SUFFIXES = ["", "s", "es", "ing", "ed", "d"];

/** True when `heard` is `base` or a plural / verb form of it (cats, dancing, running, studied). */
function sameWord(heard: string, base: string, inflect: boolean): boolean {
  if (heard === base) return true;
  if (!inflect || base.length < 3) return false;
  const stems = [base, base.replace(/e$/, ""), base + base.slice(-1), base.replace(/y$/, "i")];
  return stems.some((s) => SUFFIXES.some((suf) => heard === s + suf));
}

/** Does any recognition alternative contain one of the accepted answers? "It's a dog" counts for "dog". */
export function matches(card: Card, alternatives: string[]): boolean {
  return alternatives.some((alt) => {
    const heard = words(alt);
    return card.answers.some((answer) => {
      const target = words(answer);
      for (let i = 0; i + target.length <= heard.length; i++) {
        const ok = target.every((t, k) => {
          const last = k === target.length - 1;
          // Plurals for every noun's last word; -ing/-ed/-s for verbs.
          return sameWord(heard[i + k], t, last);
        });
        if (ok) return true;
      }
      return false;
    });
  });
}

/** First letter and blanks, e.g. "b _ _ _ _ _ _ _" for "backpack". */
function letterHint(word: string): string {
  return word
    .split(" ")
    .map((w) => w[0] + " _".repeat(w.length - 1))
    .join("   ");
}

type Phase = "ask" | "right" | "reveal";
/** easy: right on the first try with no hint; hard: right after help; miss: didn't get it. */
type Grade = "easy" | "hard" | "miss";

export function Flashcards({
  cards,
  states,
  onRate,
  onExit,
}: {
  cards: Card[];
  states: Record<string, CardState>;
  onRate(id: string, state: CardState): void;
  onExit(): void;
}) {
  const [queue, setQueue] = useState(cards);
  const [known, setKnown] = useState(0);
  const card = queue[0];

  const rate = (grade: Grade) => {
    const prev = states[card.id]?.box ?? 0;
    const box = grade === "easy" ? Math.min(prev + 1, INTERVALS.length - 1) : grade === "hard" ? Math.max(prev, 1) : 0;
    onRate(card.id, { box, due: addDays(grade === "miss" ? 0 : INTERVALS[box]) });
    if (grade !== "miss") setKnown((k) => k + 1);
    // Missed cards go to the back of this session's queue so they're seen again today.
    setQueue((q) => (grade === "miss" ? [...q.slice(1), q[0]] : q.slice(1)));
  };

  if (!card) {
    return (
      <div className="result">
        <div className="result-card">
          <div className="mascot big">🃏</div>
          <h1>{cards.length ? "Revisão concluída!" : "Nada para revisar hoje"}</h1>
          <p className="hint">
            {cards.length
              ? `Você acertou ${known} de ${cards.length} imagens. As que você errou voltam na próxima revisão.`
              : "Você já viu todos os cartões de hoje. Volte amanhã para revisar."}
          </p>
          <div className="result-actions">
            <button className="btn primary" onClick={onExit}>
              Voltar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lesson">
      <header className="lesson-top">
        <button className="close" onClick={onExit} aria-label="Sair">
          ✕
        </button>
        <div className="bar">
          <div style={{ width: `${Math.max((known / cards.length) * 100, 3)}%` }} />
        </div>
        <span className="stage-tag">🃏 {queue.length}</span>
      </header>
      <main className="lesson-body flash-body">
        <PictureCard key={`${card.id}-${queue.length}`} card={card} onDone={rate} />
      </main>
    </div>
  );
}

function PictureCard({ card, onDone }: { card: Card; onDone(grade: Grade): void }) {
  const [phase, setPhase] = useState<Phase>("ask");
  const [tries, setTries] = useState(0);
  const [hint, setHint] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const [typed, setTyped] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  const mic = useRef<ListenHandle | null>(null);

  useEffect(() => () => mic.current?.stop(), []);

  const answer = (alternatives: string[]) => {
    if (!alternatives.length) return;
    setHeard(alternatives[0]);
    if (matches(card, alternatives)) {
      setPhase("right");
      speak(card.en);
      return;
    }
    const n = tries + 1;
    setTries(n);
    if (n >= MAX_TRIES) reveal();
  };

  const reveal = () => {
    setPhase("reveal");
    speak(card.en);
  };

  const toggleMic = () => {
    if (recording) {
      mic.current?.stop();
      return;
    }
    window.speechSynthesis?.cancel();
    setMicError(null);
    setInterim("");
    setRecording(true);
    mic.current = listen({
      onInterim: setInterim,
      onFinal: (alts) => {
        if (alts.length) answer(alts);
        else setMicError("Não ouvi nada. Toque no microfone e fale de novo.");
      },
      onError: (e) => {
        if (e === "not-allowed" || e === "service-not-allowed") setMicError("Permita o uso do microfone, ou digite a resposta.");
      },
      onEnd: () => setRecording(false),
    });
  };

  const submitTyped = () => {
    if (!typed.trim()) return;
    answer([typed]);
    setTyped("");
  };

  return (
    <>
      <div className={`flashcard picture ${phase}`}>
        <span className="card-category">{card.category}</span>
        <CardPicture key={card.id} emoji={card.emoji} />
        {phase === "ask" ? (
          <>
            <p className="picture-question">{card.question ?? (card.verb ? "Que ação é essa?" : "O que é isso?")} Fale em inglês.</p>
            {hint && (
              <p className="picture-hint">
                <span className="letters">{letterHint(card.en)}</span>
                <span>em português: {card.pt}</span>
              </p>
            )}
            {heard !== null && (
              <p className="warn">
                Entendi “{heard}”. Tente de novo{tries === MAX_TRIES - 1 ? " (última tentativa)" : ""}.
              </p>
            )}
          </>
        ) : (
          <div className="flash-back">
            <div className="flash-en">{card.en}</div>
            <div className="flash-pt">{card.pt}</div>
            <div className="audio-buttons center">
              <button className="audio-btn small" onClick={() => speak(card.en)} aria-label="Ouvir">
                🔊
              </button>
              <button className="audio-btn small" onClick={() => speak(card.en, true)} aria-label="Ouvir devagar">
                🐢
              </button>
            </div>
            {phase === "right" ? (
              <p className="picture-ok">✅ {tries === 0 && !hint ? "Isso aí, de primeira!" : "Acertou!"}</p>
            ) : (
              <p className="hint">Ouça e repita em voz alta para fixar.</p>
            )}
          </div>
        )}
      </div>

      {phase === "ask" ? (
        <div className="picture-controls">
          {sttSupported && (
            <div className="card-mic">
              <button className={`mic ${recording ? "on" : ""}`} onClick={toggleMic} aria-label={recording ? "Parar" : "Falar"}>
                {recording ? "■" : "🎤"}
              </button>
              <span>{recording ? interim || "Ouvindo…" : "Toque e diga o nome"}</span>
            </div>
          )}
          {micError && <p className="warn">{micError}</p>}
          <div className="picture-type">
            <input
              value={typed}
              placeholder={sttSupported ? "ou digite em inglês…" : "Digite em inglês…"}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                // Keeps this Enter from also pressing the "Próximo" button that replaces the input.
                e.preventDefault();
                submitTyped();
              }}
            />
            <button className="btn secondary" disabled={!typed.trim()} onClick={submitTyped}>
              OK
            </button>
          </div>
          <div className="flash-actions">
            {!hint && (
              <button className="btn secondary" onClick={() => setHint(true)}>
                💡 Dica
              </button>
            )}
            <button className="btn secondary" onClick={reveal}>
              Não sei
            </button>
          </div>
        </div>
      ) : (
        <div className="flash-actions">
          <button className={`btn ${phase === "right" ? "primary" : "danger"}`} onClick={() => onDone(phase === "reveal" ? "miss" : tries === 0 && !hint ? "easy" : "hard")}>
            Próximo
          </button>
        </div>
      )}
    </>
  );
}
