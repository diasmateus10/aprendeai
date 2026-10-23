import { useEffect, useMemo, useRef, useState } from "react";
import {
  KIDS_SESSION_SECONDS,
  KIDS_TOPICS,
  KIDS_VOCAB,
  MASCOT,
  RHYMES,
  STARS_PER_STICKER,
  STICKERS,
  type KidsTopic,
  type Rhyme,
} from "../data/kids";
import { imageFor, type VocabItem } from "../data/vocab";
import { DEFAULT_STYLE } from "../data/aiStyle";
import { addStars, dayKey, type KidsProgress, type Progress } from "../lib/progress";
import { listen, speak, sttSupported, type ListenHandle } from "../lib/speech";
import { scoreSpeech, type Score } from "../lib/score";
import { Flashcards, sessionCards, type Card } from "./Flashcards";
import { Conversation } from "./Conversation";

type Screen =
  | { name: "home" }
  | { name: "flashcards"; cards: Card[] }
  | { name: "listen" }
  | { name: "rhymes" }
  | { name: "rhyme"; rhyme: Rhyme }
  | { name: "topics" }
  | { name: "chat"; topic: KidsTopic }
  | { name: "stickers" }
  /** Parent check before the parents' area, or before leaving the Kids mode. */
  | { name: "gate"; then: "parents" | "adult" }
  | { name: "parents" }
  | { name: "done"; title: string; stars: number; again?: Screen };

/** Every kids picture card, categories interleaved so a session mixes topics. */
function kidsDeck(): Card[] {
  const perCategory = KIDS_VOCAB.map((c) =>
    c.items.map((it) => ({
      id: `kids:${c.id}:${it.en}`,
      emoji: it.emoji,
      en: it.en,
      answers: [it.en, ...(it.alt ?? [])],
      pt: it.pt,
      category: c.title,
      verb: false,
      question: c.question,
    })),
  );
  const deck: Card[] = [];
  for (let i = 0; perCategory.some((c) => i < c.length); i++) {
    for (const c of perCategory) if (i < c.length) deck.push(c[i]);
  }
  return deck;
}

const KIDS_DECK = kidsDeck();
const CARDS_PER_SESSION = 8;

/** A 3D illustration for an emoji, with the emoji itself as the fallback. */
function Pic({ emoji, size = 64, className = "" }: { emoji: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className={`kids-pic ${className}`} style={{ fontSize: size * 0.8, width: size, height: size }} aria-hidden="true">
        {emoji}
      </span>
    );
  }
  return <img className={`kids-pic ${className}`} src={imageFor(emoji)} alt="" width={size} height={size} onError={() => setFailed(true)} />;
}

function Stars({ n, of = 3 }: { n: number; of?: number }) {
  return (
    <span className="kids-stars" aria-label={`${n} de ${of} estrelas`}>
      {Array.from({ length: of }, (_, i) => (
        <span key={i} className={i < n ? "on" : ""}>
          ★
        </span>
      ))}
    </span>
  );
}

export function KidsApp({
  progress,
  onProgress,
  onAdultMode,
}: {
  progress: Progress;
  /** Receives an updater so callbacks from finished activities never use a stale progress. */
  onProgress(update: (p: Progress) => Progress): void;
  onAdultMode(): void;
}) {
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const kids = progress.kids;
  // Stars when the current activity started, to announce stickers unlocked during it.
  const startStars = useRef(kids.stars);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (screen.name !== "done") startStars.current = kids.stars;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen.name]);

  const star = (n: number, extra: (k: KidsProgress) => Partial<KidsProgress> = () => ({})) =>
    onProgress((p) => addStars(p, n, extra(p.kids)));

  const home = () => setScreen({ name: "home" });

  let page: JSX.Element;
  switch (screen.name) {
    case "flashcards":
      page = (
        <Flashcards
          cards={screen.cards}
          states={kids.cards}
          onRate={(id, state) =>
            onProgress((p) => {
              // Box 0 means missed; any other box is a card named right: one star.
              const next = state.box > 0 ? addStars(p, 1) : p;
              return { ...next, kids: { ...next.kids, cards: { ...next.kids.cards, [id]: state } } };
            })
          }
          onExit={home}
        />
      );
      break;
    case "listen":
      page = (
        <ListenTap
          onStar={() => star(1)}
          onExit={home}
          onDone={(right) => {
            star(0, (k) => ({ games: k.games + 1 }));
            setScreen({ name: "done", title: `Você acertou ${right} de ${LISTEN_ROUNDS}!`, stars: right >= 7 ? 3 : right >= 4 ? 2 : 1, again: { name: "listen" } });
          }}
        />
      );
      break;
    case "rhymes":
      page = <RhymeList best={kids.rhymes} onPick={(rhyme) => setScreen({ name: "rhyme", rhyme })} onExit={home} />;
      break;
    case "rhyme": {
      const rhyme = screen.rhyme;
      page = (
        <RhymePlay
          rhyme={rhyme}
          onLine={(seconds) => star(1, (k) => ({ speakingSeconds: k.speakingSeconds + seconds }))}
          onSeconds={(seconds) => star(0, (k) => ({ speakingSeconds: k.speakingSeconds + seconds }))}
          onExit={() => setScreen({ name: "rhymes" })}
          onDone={(stars) => {
            star(0, (k) => ({ rhymes: { ...k.rhymes, [rhyme.id]: Math.max(stars, k.rhymes[rhyme.id] ?? 0) } }));
            setScreen({ name: "done", title: `Você cantou “${rhyme.title}”!`, stars, again: { name: "rhyme", rhyme } });
          }}
        />
      );
      break;
    }
    case "topics":
      page = <KidsTopics onPick={(topic) => setScreen({ name: "chat", topic })} onExit={home} />;
      break;
    case "chat":
      page = (
        <Conversation
          topic={screen.topic}
          level="iniciante"
          style={{ ...DEFAULT_STYLE, accent: progress.aiStyle.accent }}
          seconds={KIDS_SESSION_SECONDS}
          onExit={home}
          // 1 star per sentence spoken, up to 10 per conversation.
          onFinish={(seconds, turns) =>
            star(Math.min(turns, 10), (k) => ({ speakingSeconds: k.speakingSeconds + seconds, chats: k.chats + 1 }))
          }
        />
      );
      break;
    case "stickers":
      page = <StickerBook stars={kids.stars} onExit={home} />;
      break;
    case "gate":
      page = (
        <ParentGate
          title={screen.then === "adult" ? "Sair do Modo Kids" : "Área dos pais"}
          onPass={screen.then === "adult" ? onAdultMode : () => setScreen({ name: "parents" })}
          onExit={home}
        />
      );
      break;
    case "parents":
      page = <ParentPanel kids={kids} onAdultMode={onAdultMode} onExit={home} />;
      break;
    case "done": {
      const unlocked = Math.floor(kids.stars / STARS_PER_STICKER) - Math.floor(startStars.current / STARS_PER_STICKER);
      const newest = STICKERS[Math.min(Math.floor(kids.stars / STARS_PER_STICKER), STICKERS.length) - 1];
      page = (
        <div className="result">
          <div className="result-card kids-done">
            <Pic emoji={MASCOT} size={120} className="kids-bounce" />
            <h1>{screen.title}</h1>
            {screen.stars > 0 && <Stars n={screen.stars} />}
            <p className="kids-total">⭐ {kids.stars - startStars.current > 0 ? `+${kids.stars - startStars.current} estrelas` : "Continue praticando!"}</p>
            {unlocked > 0 && newest && (
              <div className="kids-new-sticker">
                <Pic emoji={newest} size={88} className="kids-pop" />
                <strong>Novo adesivo!</strong>
              </div>
            )}
            <div className="result-actions">
              {screen.again && (
                <button className="btn secondary" onClick={() => setScreen(screen.again!)}>
                  De novo
                </button>
              )}
              <button className="btn primary" onClick={home}>
                Início
              </button>
            </div>
          </div>
        </div>
      );
      break;
    }
    default:
      page = (
        <KidsHome
          kids={kids}
          onFlashcards={() => setScreen({ name: "flashcards", cards: sessionCards(KIDS_DECK, kids.cards).slice(0, CARDS_PER_SESSION) })}
          onListen={() => setScreen({ name: "listen" })}
          onRhymes={() => setScreen({ name: "rhymes" })}
          onChat={() => setScreen({ name: "topics" })}
          onStickers={() => setScreen({ name: "stickers" })}
          onParents={() => setScreen({ name: "gate", then: "parents" })}
          onLeave={() => setScreen({ name: "gate", then: "adult" })}
        />
      );
  }
  return <div className="kids">{page}</div>;
}

function KidsHome({
  kids,
  onFlashcards,
  onListen,
  onRhymes,
  onChat,
  onStickers,
  onParents,
  onLeave,
}: {
  kids: KidsProgress;
  onFlashcards(): void;
  onListen(): void;
  onRhymes(): void;
  onChat(): void;
  onStickers(): void;
  onParents(): void;
  onLeave(): void;
}) {
  const stickers = Math.min(Math.floor(kids.stars / STARS_PER_STICKER), STICKERS.length);
  const toNext = STARS_PER_STICKER - (kids.stars % STARS_PER_STICKER);
  const hello = "Hi! I am Kiko. Let's play in English!";
  const tiles = [
    { emoji: "🃏", title: "Cartões", sub: "Veja e fale", color: "#ff8a5b", onClick: onFlashcards },
    { emoji: "👂", title: "Ouça e toque", sub: "Ache a figura", color: "#4cb8ff", onClick: onListen },
    { emoji: "🎵", title: "Rimas", sub: "Ouça e repita", color: "#b57bff", onClick: onRhymes },
    { emoji: MASCOT, title: "Conversar", sub: "Fale com o Kiko", color: "#3fcf8e", onClick: onChat },
  ];
  return (
    <div className="kids-home">
      <header className="kids-top">
        <button className="kids-mascot" onClick={() => speak(hello)} aria-label="Ouvir o Kiko">
          <Pic emoji={MASCOT} size={84} className="kids-bounce" />
          <span className="kids-bubble">
            Oi! Eu sou o <strong>Kiko</strong>. Vamos brincar em inglês?
          </span>
        </button>
        <div className="kids-counters">
          <button className="kids-chip kids-leave" onClick={onLeave}>
            ← Sair do Modo Kids
          </button>
          <span className="kids-chip">⭐ {kids.stars}</span>
          <button className="kids-chip" onClick={onStickers}>
            🎁 {stickers}/{STICKERS.length}
          </button>
        </div>
      </header>

      <div className="kids-progress" title={`Faltam ${toNext} estrelas para o próximo adesivo`}>
        <div style={{ width: `${((STARS_PER_STICKER - toNext) / STARS_PER_STICKER) * 100}%` }} />
        <span>
          {stickers < STICKERS.length ? `Faltam ${toNext} ⭐ para o próximo adesivo` : "Você ganhou todos os adesivos! 🎉"}
        </span>
      </div>

      {!sttSupported && <div className="banner">Para falar com o Kiko, abra no Chrome ou no Edge. Os jogos de ouvir funcionam em qualquer navegador.</div>}

      <main className="kids-tiles">
        {tiles.map((t) => (
          <button key={t.title} className="kids-tile" style={{ background: t.color }} onClick={t.onClick}>
            <Pic emoji={t.emoji} size={72} />
            <strong>{t.title}</strong>
            <span>{t.sub}</span>
          </button>
        ))}
        <button className="kids-tile wide" style={{ background: "#ffc93c" }} onClick={onStickers}>
          <Pic emoji="🦄" size={56} />
          <div>
            <strong>Meus adesivos</strong>
            <span>Junte estrelas e ganhe adesivos</span>
          </div>
        </button>
      </main>

      <button className="link kids-parents-link" onClick={onParents}>
        👨‍👩‍👧 Área dos pais
      </button>
    </div>
  );
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const LISTEN_ROUNDS = 8;

interface Round {
  answer: VocabItem;
  options: VocabItem[];
}

/** Each round: one word spoken, four pictures from the same category (colors with colors, animals with animals). */
function buildRounds(): Round[] {
  return Array.from({ length: LISTEN_ROUNDS }, () => {
    const cat = KIDS_VOCAB[Math.floor(Math.random() * KIDS_VOCAB.length)];
    const [answer, ...rest] = shuffle(cat.items);
    return { answer, options: shuffle([answer, ...rest.slice(0, 3)]) };
  });
}

function ListenTap({ onStar, onDone, onExit }: { onStar(): void; onDone(right: number): void; onExit(): void }) {
  const rounds = useMemo(buildRounds, []);
  const [i, setI] = useState(0);
  const [wrong, setWrong] = useState<string[]>([]);
  const [solved, setSolved] = useState(false);
  const right = useRef(0);
  const round = rounds[i];

  useEffect(() => {
    const t = setTimeout(() => speak(round.answer.en), 350);
    return () => clearTimeout(t);
  }, [round]);

  const tap = (item: VocabItem) => {
    if (solved) return;
    if (item.en !== round.answer.en) {
      setWrong((w) => [...w, item.en]);
      speak(round.answer.en);
      return;
    }
    setSolved(true);
    // A star only when found on the first try.
    if (wrong.length === 0) {
      right.current++;
      onStar();
    }
    speak(`Yes! ${round.answer.en}!`);
    setTimeout(() => {
      if (i + 1 >= rounds.length) return onDone(right.current);
      setI(i + 1);
      setWrong([]);
      setSolved(false);
    }, 1400);
  };

  return (
    <div className="lesson">
      <header className="lesson-top">
        <button className="close" onClick={onExit} aria-label="Sair">
          ✕
        </button>
        <div className="bar">
          <div style={{ width: `${Math.max((i / rounds.length) * 100, 3)}%` }} />
        </div>
        <span className="stage-tag">
          {i + 1}/{rounds.length}
        </span>
      </header>
      <main className="lesson-body kids-listen">
        <h2>Toque na figura que você ouvir</h2>
        <div className="audio-buttons center">
          <button className="audio-btn big" onClick={() => speak(round.answer.en)} aria-label="Ouvir">
            🔊
          </button>
          <button className="audio-btn small" onClick={() => speak(round.answer.en, true)} aria-label="Ouvir devagar">
            🐢
          </button>
        </div>
        <div className="kids-options">
          {round.options.map((o) => {
            const isWrong = wrong.includes(o.en);
            const isRight = solved && o.en === round.answer.en;
            return (
              <button
                key={`${i}-${o.en}`}
                className={`kids-option ${isWrong ? "wrong" : ""} ${isRight ? "right" : ""}`}
                onClick={() => tap(o)}
                disabled={isWrong}
                aria-label={isRight ? o.en : "figura"}
              >
                <Pic emoji={o.emoji} size={96} />
                {isRight && <strong>{o.en}</strong>}
              </button>
            );
          })}
        </div>
        <p className="kids-feedback">{solved ? (wrong.length === 0 ? "⭐ Muito bem!" : "Isso! Achou!") : wrong.length ? "Quase! Ouça de novo e tente outra." : " "}</p>
      </main>
    </div>
  );
}

function RhymeList({ best, onPick, onExit }: { best: Record<string, number>; onPick(r: Rhyme): void; onExit(): void }) {
  return (
    <div className="page">
      <header className="page-top">
        <button className="close" onClick={onExit} aria-label="Voltar">
          ←
        </button>
        <h1>Rimas e músicas</h1>
      </header>
      <p className="hint">Ouça cada frase e repita em voz alta. Cada frase certa vale uma estrela!</p>
      <div className="kids-list">
        {RHYMES.map((r) => (
          <button key={r.id} className="kids-row" onClick={() => onPick(r)}>
            <Pic emoji={r.emoji} size={52} />
            <div>
              <strong>{r.title}</strong>
              <span>{r.lines.length} frases</span>
            </div>
            {best[r.id] ? <Stars n={best[r.id]} /> : <span className="kids-new">Nova</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Speech is scored more leniently for children than for adults. */
const KIDS_PASS = 0.6;
const LINE_TRIES = 2;

function RhymePlay({
  rhyme,
  onLine,
  onSeconds,
  onDone,
  onExit,
}: {
  rhyme: Rhyme;
  /** A line repeated well: one star and the seconds spent speaking. */
  onLine(seconds: number): void;
  /** Speaking time on a line that wasn't passed. */
  onSeconds(seconds: number): void;
  onDone(stars: number): void;
  onExit(): void;
}) {
  const [i, setI] = useState(0);
  const [score, setScore] = useState<Score | null>(null);
  const [tries, setTries] = useState(0);
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  const passed = useRef(0);
  const mic = useRef<ListenHandle | null>(null);
  const line = rhyme.lines[i];
  const ok = score !== null && score.accuracy >= KIDS_PASS;
  const canGoOn = ok || tries >= LINE_TRIES || !sttSupported;

  useEffect(() => {
    const t = setTimeout(() => speak(line.en), 400);
    return () => clearTimeout(t);
  }, [line]);

  useEffect(() => () => mic.current?.abort(), []);

  const record = () => {
    if (recording) {
      mic.current?.stop();
      return;
    }
    window.speechSynthesis?.cancel();
    setMicError(null);
    setInterim("");
    setRecording(true);
    const began = Date.now();
    mic.current = listen({
      onInterim: setInterim,
      onFinal: (alts) => {
        if (!alts.length) return;
        const s = scoreSpeech(line.en, alts);
        const seconds = (Date.now() - began) / 1000;
        setScore(s);
        setTries((t) => t + 1);
        if (s.accuracy >= KIDS_PASS) {
          passed.current++;
          onLine(seconds);
          speak("Great job!");
        } else onSeconds(seconds);
      },
      onError: (e) => {
        if (e === "not-allowed" || e === "service-not-allowed") setMicError("Peça para um adulto liberar o microfone no navegador.");
      },
      onEnd: () => {
        setRecording(false);
        setInterim("");
      },
    });
  };

  const next = () => {
    mic.current?.abort();
    if (i + 1 >= rhyme.lines.length) {
      const ratio = passed.current / rhyme.lines.length;
      onDone(ratio >= 0.8 ? 3 : ratio >= 0.5 ? 2 : 1);
      return;
    }
    setI(i + 1);
    setScore(null);
    setTries(0);
  };

  return (
    <div className="lesson">
      <header className="lesson-top">
        <button className="close" onClick={onExit} aria-label="Sair">
          ✕
        </button>
        <div className="bar">
          <div style={{ width: `${Math.max((i / rhyme.lines.length) * 100, 3)}%` }} />
        </div>
        <span className="stage-tag">
          {i + 1}/{rhyme.lines.length}
        </span>
      </header>
      <main className="lesson-body kids-rhyme">
        <Pic emoji={rhyme.emoji} size={96} className="kids-bounce" />
        <div className="kids-line">
          {score ? (
            <div className="word-marks center">
              {score.words.map((w, k) => (
                <span key={k} className={w.ok ? "ok" : "miss"}>
                  {w.word}
                </span>
              ))}
            </div>
          ) : (
            <p className="kids-line-en">{line.en}</p>
          )}
          <p className="kids-line-pt">{line.pt}</p>
        </div>
        <div className="audio-buttons center">
          <button className="audio-btn small" onClick={() => speak(line.en)} aria-label="Ouvir">
            🔊
          </button>
          <button className="audio-btn small" onClick={() => speak(line.en, true)} aria-label="Ouvir devagar">
            🐢
          </button>
        </div>

        {sttSupported && !ok && (
          <div className="mic-panel">
            <button className={`mic ${recording ? "on" : ""}`} onClick={record} aria-label={recording ? "Parar" : "Falar"}>
              {recording ? "■" : "🎤"}
            </button>
            <span className="mic-label">
              {recording ? interim || "Pode falar…" : score ? "Quase! Tente de novo" : "Toque e repita a frase"}
            </span>
          </div>
        )}
        {micError && <p className="warn">{micError}</p>}
        {ok && <p className="kids-feedback">⭐ Muito bem!</p>}

        {canGoOn && (
          <button className="btn primary kids-next" onClick={next}>
            {i + 1 >= rhyme.lines.length ? "Terminar" : "Próxima frase"}
          </button>
        )}
      </main>
    </div>
  );
}

function KidsTopics({ onPick, onExit }: { onPick(t: KidsTopic): void; onExit(): void }) {
  return (
    <div className="page">
      <header className="page-top">
        <button className="close" onClick={onExit} aria-label="Voltar">
          ←
        </button>
        <h1>Conversar com o Kiko</h1>
      </header>
      <p className="hint">Escolha um assunto. Toque na bolinha e fale em inglês: o Kiko responde! A conversa dura 3 minutos.</p>
      <div className="topic-grid">
        {KIDS_TOPICS.map((t) => (
          <button key={t.id} className="topic kids-topic" onClick={() => onPick(t)}>
            <Pic emoji={t.emoji} size={56} />
            <strong>{t.title}</strong>
            <span>{t.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StickerBook({ stars, onExit }: { stars: number; onExit(): void }) {
  const unlocked = Math.min(Math.floor(stars / STARS_PER_STICKER), STICKERS.length);
  return (
    <div className="page">
      <header className="page-top">
        <button className="close" onClick={onExit} aria-label="Voltar">
          ←
        </button>
        <h1>Meus adesivos</h1>
      </header>
      <p className="hint">
        A cada {STARS_PER_STICKER} estrelas você ganha um adesivo. Você tem ⭐ {stars}.
      </p>
      <div className="kids-stickers">
        {STICKERS.map((s, i) => (
          <div key={s} className={`kids-sticker ${i < unlocked ? "on" : ""}`}>
            {i < unlocked ? <Pic emoji={s} size={72} /> : <span className="kids-lock">{(i + 1) * STARS_PER_STICKER}⭐</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Keeps children out of the parents' area: a multiplication a 6-year-old usually can't do yet. */
function ParentGate({ title, onPass, onExit }: { title: string; onPass(): void; onExit(): void }) {
  const [[a, b]] = useState(() => [3 + Math.floor(Math.random() * 7), 3 + Math.floor(Math.random() * 7)]);
  const [value, setValue] = useState("");
  const [wrong, setWrong] = useState(false);
  const check = () => {
    if (Number(value) === a * b) onPass();
    else {
      setWrong(true);
      setValue("");
    }
  };
  return (
    <div className="result">
      <div className="result-card kids-gate">
        <h1>{title}</h1>
        <p className="hint">Pergunta para um adulto responder:</p>
        <p className="kids-gate-q">
          {a} × {b} = ?
        </p>
        <input
          inputMode="numeric"
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && check()}
          aria-label="Resposta"
        />
        {wrong && <p className="warn">Resposta errada. Tente de novo.</p>}
        <div className="result-actions">
          <button className="btn secondary" onClick={onExit}>
            Voltar
          </button>
          <button className="btn primary" disabled={!value} onClick={check}>
            Entrar
          </button>
        </div>
      </div>
    </div>
  );
}

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

function ParentPanel({ kids, onAdultMode, onExit }: { kids: KidsProgress; onAdultMode(): void; onExit(): void }) {
  const words = Object.values(kids.cards).filter((c) => c.box > 0).length;
  const rhymes = Object.keys(kids.rhymes).length;
  const week = Array.from({ length: 7 }, (_, i) => {
    const offset = i - 6;
    const key = dayKey(offset);
    const date = new Date(Date.now() + offset * 86_400_000);
    return { key, label: WEEKDAYS[date.getDay()], stars: kids.daily[key] ?? 0, today: offset === 0 };
  });
  const activeDays = week.filter((d) => d.stars > 0).length;
  return (
    <div className="page kids-parents">
      <header className="page-top">
        <button className="close" onClick={onExit} aria-label="Voltar">
          ←
        </button>
        <h1>Área dos pais</h1>
      </header>

      <div className="card">
        <div className="card-label">Últimos 7 dias</div>
        <strong>
          {activeDays} {activeDays === 1 ? "dia" : "dias"} praticando
        </strong>
        <div className="week">
          {week.map((d) => (
            <div key={d.key} className={`day ${d.stars >= 10 ? "hit" : d.stars > 0 ? "some" : ""} ${d.today ? "today" : ""}`} title={`${d.stars} estrelas`}>
              <span>{d.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="kids-stats">
        <div>
          <strong>⭐ {kids.stars}</strong>
          <span>estrelas</span>
        </div>
        <div>
          <strong>{words}</strong>
          <span>palavras aprendidas</span>
        </div>
        <div>
          <strong>
            {rhymes}/{RHYMES.length}
          </strong>
          <span>rimas cantadas</span>
        </div>
        <div>
          <strong>{Math.round(kids.speakingSeconds / 60)} min</strong>
          <span>falando inglês</span>
        </div>
        <div>
          <strong>{kids.chats}</strong>
          <span>conversas com o Kiko</span>
        </div>
        <div>
          <strong>{kids.games}</strong>
          <span>jogos de ouvir</span>
        </div>
      </div>

      <div className="card">
        <div className="card-label">Sobre a conversa com IA</div>
        <p className="hint small">
          O Kiko usa a IA Claude com regras próprias para crianças: inglês bem simples, só temas infantis, sem pedir dados pessoais
          (nome completo, endereço, escola) e orientação para procurar um adulto se a criança disser algo preocupante. Mesmo assim,
          recomendamos acompanhar as conversas. Cada conversa dura 3 minutos.
        </p>
      </div>

      <div className="card">
        <div className="card-label">Privacidade</div>
        <p className="hint small">
          O progresso fica salvo só neste aparelho. Para entender a fala, o navegador (Chrome ou Edge) envia o áudio ao serviço de
          reconhecimento de voz do Google ou da Microsoft, e o texto da conversa com o Kiko vai para a IA para gerar as respostas.
        </p>
      </div>

      <div className="result-actions">
        <button className="btn secondary" onClick={onAdultMode}>
          Mudar para o modo adulto
        </button>
        <button className="btn primary" onClick={onExit}>
          Voltar para as crianças
        </button>
      </div>
    </div>
  );
}
