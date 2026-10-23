import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Gift, Microphone, MusicNotes, Star, Stop, Users, X } from "@phosphor-icons/react";
import { Mascot } from "./Brand";
import { SoundButtons } from "./ui";
import {
  ageBand,
  AGES,
  KIDS_VOCAB,
  MASCOT,
  RHYMES,
  STARS_PER_STICKER,
  STICKERS,
  topicsFor,
  type AgeBand,
  type KidsAge,
  type KidsTopic,
  type Rhyme,
} from "../data/kids";
import { categoriesFor, imageFor, type VocabItem } from "../data/vocab";
import { DEFAULT_STYLE } from "../data/aiStyle";
import { addStars, dayKey, type KidsProgress, type Progress } from "../lib/progress";
import { isIOS, listen, usingServerVoice, speak, stopSpeaking, sttSupported, type ListenHandle } from "../lib/speech";
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
  /** Parent check before the parents' area. */
  | { name: "gate" }
  | { name: "parents" }
  | { name: "book"; cards: Card[] }
  | { name: "age" }
  | { name: "done"; title: string; stars: number; again?: Screen };

/** Every picture card for an age, categories interleaved so a session mixes topics. */
function kidsDeck(band: AgeBand): Card[] {
  // Older children also get the adult course's beginner words (food, home, actions, clothes...).
  const extra = band.moreWords
    ? categoriesFor("basico").map((c) => ({ id: c.id, title: c.title, question: c.verbs ? "Que ação é essa?" : "O que é isso?", items: c.items }))
    : [];
  const seen = new Set<string>();
  const perCategory = [...KIDS_VOCAB, ...extra].map((c) =>
    c.items.filter((it) => !seen.has(it.en) && seen.add(it.en)).map((it) => ({
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
        <Star key={i} weight="fill" className={i < n ? "on" : ""} />
      ))}
    </span>
  );
}

export function KidsApp({
  progress,
  onProgress,
  onAdultMode,
  account,
}: {
  progress: Progress;
  /** Receives an updater so callbacks from finished activities never use a stale progress. */
  onProgress(update: (p: Progress) => Progress): void;
  onAdultMode(): void;
  /** Signed-in account, shown (with sign-out) in the parents' area. */
  account: { email: string; onSignOut(): void };
}) {
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const kids = progress.kids;
  const band = ageBand(kids.age);
  const deck = useMemo(() => kidsDeck(band), [band]);
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

  const setAge = (age: KidsAge) => onProgress((p) => ({ ...p, kids: { ...p.kids, age } }));

  // The adult who opened the Kids mode picks the child's age once; it shapes every activity.
  if (kids.age === null || screen.name === "age") {
    return (
      <div className="kids">
        <AgePicker
          value={kids.age}
          onPick={(age) => {
            setAge(age);
            home();
          }}
          onBack={kids.age === null ? onAdultMode : home}
        />
      </div>
    );
  }

  let page: JSX.Element;
  switch (screen.name) {
    case "book":
      page = (
        <PictureBook
          cards={screen.cards}
          onSeen={(id) =>
            onProgress((p) => {
              const next = addStars(p, 1);
              return { ...next, kids: { ...next.kids, cards: { ...next.kids.cards, [id]: { box: 1, due: dayKey(1) } } } };
            })
          }
          onDone={() => setScreen({ name: "done", title: "Você viu todas as figuras!", stars: 3, again: { name: "book", cards: screen.cards } })}
          onExit={home}
        />
      );
      break;
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
          options={band.options}
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
          listenOnly={!band.speak}
          pass={band.pass}
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
      page = <KidsTopics band={band} onPick={(topic) => setScreen({ name: "chat", topic })} onExit={home} />;
      break;
    case "chat":
      page = (
        <Conversation
          topic={screen.topic}
          level="iniciante"
          style={{ ...DEFAULT_STYLE, accent: progress.aiStyle.accent }}
          seconds={band.chatSeconds}
          age={band.id}
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
          title="Área dos pais"
          onPass={() => setScreen({ name: "parents" })}
          onExit={home}
        />
      );
      break;
    case "parents":
      page = (
        <ParentPanel kids={kids} band={band} account={account} onAge={() => setScreen({ name: "age" })} onAdultMode={onAdultMode} onExit={home} />
      );
      break;
    case "done": {
      const unlocked = Math.floor(kids.stars / STARS_PER_STICKER) - Math.floor(startStars.current / STARS_PER_STICKER);
      const newest = STICKERS[Math.min(Math.floor(kids.stars / STARS_PER_STICKER), STICKERS.length) - 1];
      page = (
        <div className="result">
          <div className="result-card kids-done">
            <Mascot mood="happy" size={120} className="kids-bounce" />
            <h1>{screen.title}</h1>
            {screen.stars > 0 && <Stars n={screen.stars} />}
            <p className="kids-total">
              <Star size={20} weight="fill" /> {kids.stars - startStars.current > 0 ? `+${kids.stars - startStars.current} estrelas` : "Continue praticando!"}</p>
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
          band={band}
          onFlashcards={() => {
            const cards = sessionCards(deck, kids.cards).slice(0, CARDS_PER_SESSION);
            setScreen(band.speak ? { name: "flashcards", cards } : { name: "book", cards });
          }}
          onListen={() => setScreen({ name: "listen" })}
          onRhymes={() => setScreen({ name: "rhymes" })}
          onChat={() => setScreen({ name: "topics" })}
          onStickers={() => setScreen({ name: "stickers" })}
          onParents={() => setScreen({ name: "gate" })}
          // Going back to the adult app is a plain tap; only the parents' area asks for the sum.
          onLeave={onAdultMode}
        />
      );
  }
  return <div className="kids">{page}</div>;
}

function KidsHome({
  kids,
  band,
  onFlashcards,
  onListen,
  onRhymes,
  onChat,
  onStickers,
  onParents,
  onLeave,
}: {
  kids: KidsProgress;
  band: AgeBand;
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
    band.speak
      ? { emoji: "🃏", title: "Cartões", sub: "Veja e fale", color: "#ff6b4a", onClick: onFlashcards }
      : { emoji: "📖", title: "Livro de figuras", sub: "Veja e ouça", color: "#ff6b4a", onClick: onFlashcards },
    { emoji: "👂", title: "Ouça e toque", sub: "Ache a figura", color: "#5b8cff", onClick: onListen },
    { emoji: "🎵", title: band.speak ? "Rimas" : "Músicas", sub: band.speak ? "Ouça e repita" : "Ouça e cante junto", color: "#9d6bff", onClick: onRhymes },
    // Babies do not talk yet: no conversation for 0-3.
    ...(band.chatSeconds ? [{ emoji: MASCOT, title: "Conversar", sub: "Fale com o Kiko", color: "#22b07a", onClick: onChat }] : []),
  ];
  return (
    <div className="kids-home">
      <header className="kids-top">
        <button className="kids-mascot" onClick={() => speak(hello)} aria-label="Ouvir o Kiko">
          <Mascot mood="happy" size={84} className="kids-bounce" />
          <span className="kids-bubble">
            Oi! Eu sou o <strong>Kiko</strong>. Vamos brincar em inglês?
          </span>
        </button>
        <div className="kids-counters">
          <button className="kids-chip kids-leave" onClick={onLeave} aria-label="Sair do Modo Kids">
            <ArrowLeft size={16} weight="bold" /> Sair
          </button>
          <span className="kids-chip" aria-label={`${kids.stars} estrelas`}>
            <Star size={18} weight="fill" className="gold" /> {kids.stars}
          </span>
          <button className="kids-chip" onClick={onStickers}>
            <Gift size={18} weight="fill" className="coral" /> {stickers}/{STICKERS.length}
          </button>
        </div>
      </header>

      <div className="kids-progress" title={`Faltam ${toNext} estrelas para o próximo adesivo`}>
        <div style={{ width: `${((STARS_PER_STICKER - toNext) / STARS_PER_STICKER) * 100}%` }} />
        <span>
          {stickers < STICKERS.length ? `Faltam ${toNext} estrelas para o próximo adesivo` : "Você ganhou todos os adesivos!"}
        </span>
      </div>

      {isIOS && !usingServerVoice() && <div className="banner">No iPhone, tire do modo silencioso (chave na lateral) para ouvir o Kiko.</div>}
      {!sttSupported && <div className="banner">Para falar com o Kiko, abra no Chrome ou no Edge. Os jogos de ouvir funcionam em qualquer navegador.</div>}

      <main className="kids-tiles">
        {tiles.map((t, i) => (
          <button
            key={t.title}
            // With an odd number of activities (no chat for 0-3), the last one spans the row.
            className={`kids-tile ${tiles.length % 2 && i === tiles.length - 1 ? "full" : ""}`}
            style={{ background: t.color }}
            onClick={t.onClick}
          >
            {t.emoji === MASCOT ? <Mascot size={72} /> : <Pic emoji={t.emoji} size={72} />}
            <strong>{t.title}</strong>
            <span>{t.sub}</span>
          </button>
        ))}
        <button className="kids-tile wide" style={{ background: "#ffc24b" }} onClick={onStickers}>
          <Pic emoji="🦄" size={56} />
          <div>
            <strong>Meus adesivos</strong>
            <span>Junte estrelas e ganhe adesivos</span>
          </div>
        </button>
      </main>

      <button className="link kids-parents-link" onClick={onParents}>
        <Users size={18} weight="bold" /> Área dos pais
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

/** Each round: one word spoken, 2 to 4 pictures (by age) from the same category: colors with colors, animals with animals. */
function buildRounds(options: number): Round[] {
  return Array.from({ length: LISTEN_ROUNDS }, () => {
    const cat = KIDS_VOCAB[Math.floor(Math.random() * KIDS_VOCAB.length)];
    const [answer, ...rest] = shuffle(cat.items);
    return { answer, options: shuffle([answer, ...rest.slice(0, options - 1)]) };
  });
}

function ListenTap({
  options,
  onStar,
  onDone,
  onExit,
}: {
  options: number;
  onStar(): void;
  onDone(right: number): void;
  onExit(): void;
}) {
  const rounds = useMemo(() => buildRounds(options), [options]);
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
          <X size={22} weight="bold" />
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
          <SoundButtons text={round.answer.en} size="lg" />
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
        <p className="kids-feedback">{solved ? (wrong.length === 0 ? praise(i) : "Isso! Achou!") : wrong.length ? "Quase! Ouça de novo e tente outra." : " "}</p>
      </main>
    </div>
  );
}

function RhymeList({ best, onPick, onExit }: { best: Record<string, number>; onPick(r: Rhyme): void; onExit(): void }) {
  return (
    <div className="page">
      <header className="page-top">
        <button className="close" onClick={onExit} aria-label="Voltar">
          <ArrowLeft size={22} weight="bold" />
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

const LINE_TRIES = 2;

const PRAISE = ["Isso aí!", "Acertou em cheio!", "Que ouvido bom!", "Mandou bem!", "Perfeito!"];
/** A different cheer per round, so success doesn't sound canned. */
const praise = (n: number) => PRAISE[n % PRAISE.length];

function RhymePlay({
  rhyme,
  listenOnly,
  pass,
  onLine,
  onSeconds,
  onDone,
  onExit,
}: {
  rhyme: Rhyme;
  /** The youngest just listen and sing along: no microphone, one star per line. */
  listenOnly: boolean;
  /** Share of the line that must be heard right; lower for younger children. */
  pass: number;
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
  const ok = score !== null && score.accuracy >= pass;
  const canGoOn = listenOnly || ok || tries >= LINE_TRIES || !sttSupported;

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
    stopSpeaking();
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
        if (s.accuracy >= pass) {
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
    if (listenOnly) {
      passed.current++;
      onLine(0);
    }
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
          <X size={22} weight="bold" />
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
          <SoundButtons text={line.en} size="lg" />
        </div>

        {listenOnly && (
          <p className="kids-feedback">
            <MusicNotes size={20} weight="fill" /> Ouça e cante junto!
          </p>
        )}
        {sttSupported && !listenOnly && !ok && (
          <div className="mic-panel">
            <button className={`mic ${recording ? "on" : ""}`} onClick={record} aria-label={recording ? "Parar" : "Falar"}>
              {recording ? <Stop size={34} weight="fill" /> : <Microphone size={40} weight="fill" />}
            </button>
            <span className="mic-label">
              {recording ? interim || "Pode falar…" : score ? "Quase! Tente de novo" : "Toque e repita a frase"}
            </span>
          </div>
        )}
        {micError && <p className="warn">{micError}</p>}
        {ok && (
          <p className="kids-feedback">
            <Star size={20} weight="fill" /> {praise(i)}
          </p>
        )}

        {canGoOn && (
          <button className="btn primary kids-next" onClick={next}>
            {i + 1 >= rhyme.lines.length ? "Terminar" : "Próxima frase"}
          </button>
        )}
      </main>
    </div>
  );
}

function KidsTopics({ band, onPick, onExit }: { band: AgeBand; onPick(t: KidsTopic): void; onExit(): void }) {
  return (
    <div className="page">
      <header className="page-top">
        <button className="close" onClick={onExit} aria-label="Voltar">
          <ArrowLeft size={22} weight="bold" />
        </button>
        <h1>Conversar com o Kiko</h1>
      </header>
      <p className="hint">Escolha um assunto. Toque na bolinha e fale em inglês: o Kiko responde! A conversa dura {band.chatSeconds / 60} minutos.</p>
      {isIOS && !usingServerVoice() && <p className="hint small">No iPhone, tire do modo silencioso para ouvir o Kiko.</p>}
      <div className="topic-grid">
        {topicsFor(band.id).map((t) => (
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

/** Asked to the adult on the first visit and from the parents' area. */
function AgePicker({ value, onPick, onBack }: { value: KidsAge | null; onPick(age: KidsAge): void; onBack(): void }) {
  return (
    <div className="page">
      <header className="page-top">
        <button className="close" onClick={onBack} aria-label="Voltar">
          <ArrowLeft size={22} weight="bold" />
        </button>
        <h1>Qual a idade da criança?</h1>
      </header>
      <p className="hint">Isso ajusta as atividades e o jeito do Kiko falar. Dá para mudar depois na Área dos pais.</p>
      <div className="kids-ages">
        {AGES.map((a) => (
          <button key={a.id} className={`mode-choice ${a.id === value ? "kids-choice" : ""}`} onClick={() => onPick(a.id)}>
            <span>{a.emoji}</span>
            <strong>{a.label}</strong>
            <span className="hint">{a.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** For the youngest (0-3): one big picture at a time, said aloud, with no answer expected. */
function PictureBook({ cards, onSeen, onDone, onExit }: { cards: Card[]; onSeen(id: string): void; onDone(): void; onExit(): void }) {
  const [i, setI] = useState(0);
  const card = cards[i];

  useEffect(() => {
    if (!card) return;
    const t = setTimeout(() => speak(card.en), 350);
    return () => clearTimeout(t);
  }, [card]);

  if (!card) {
    return (
      <div className="result">
        <div className="result-card">
          <Pic emoji="📖" size={96} />
          <h1>Você já viu todas as figuras de hoje!</h1>
          <div className="result-actions">
            <button className="btn primary" onClick={onExit}>
              Início
            </button>
          </div>
        </div>
      </div>
    );
  }

  const next = () => {
    onSeen(card.id);
    if (i + 1 >= cards.length) onDone();
    else setI(i + 1);
  };

  return (
    <div className="lesson">
      <header className="lesson-top">
        <button className="close" onClick={onExit} aria-label="Sair">
          <X size={22} weight="bold" />
        </button>
        <div className="bar">
          <div style={{ width: `${Math.max((i / cards.length) * 100, 3)}%` }} />
        </div>
        <span className="stage-tag">
          {i + 1}/{cards.length}
        </span>
      </header>
      <main className="lesson-body kids-book">
        <button className="kids-book-pic" onClick={() => speak(card.en)} aria-label={`Ouvir ${card.en}`}>
          <Pic emoji={card.emoji} size={200} className="kids-pop" key={card.id} />
        </button>
        <p className="kids-line-en">{card.en}</p>
        <p className="kids-line-pt">{card.pt}</p>
        <div className="audio-buttons center">
          <SoundButtons text={card.en} size="lg" />
        </div>
        <p className="hint">Toque na figura para ouvir de novo. Repita junto com a criança!</p>
        <button className="btn primary kids-next" onClick={next}>
          {i + 1 >= cards.length ? "Terminar" : "Próxima figura"}
        </button>
      </main>
    </div>
  );
}

function StickerBook({ stars, onExit }: { stars: number; onExit(): void }) {
  const unlocked = Math.min(Math.floor(stars / STARS_PER_STICKER), STICKERS.length);
  return (
    <div className="page">
      <header className="page-top">
        <button className="close" onClick={onExit} aria-label="Voltar">
          <ArrowLeft size={22} weight="bold" />
        </button>
        <h1>Meus adesivos</h1>
      </header>
      <p className="hint">
        A cada {STARS_PER_STICKER} estrelas você ganha um adesivo. Você tem {stars}.
      </p>
      <div className="kids-stickers">
        {STICKERS.map((s, i) => (
          <div key={s} className={`kids-sticker ${i < unlocked ? "on" : ""}`}>
            {i < unlocked ? <Pic emoji={s} size={72} /> : <span className="kids-lock">
                <Star size={14} weight="fill" /> {(i + 1) * STARS_PER_STICKER}
              </span>}
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

function ParentPanel({
  kids,
  band,
  account,
  onAge,
  onAdultMode,
  onExit,
}: {
  kids: KidsProgress;
  band: AgeBand;
  account: { email: string; onSignOut(): void };
  onAge(): void;
  onAdultMode(): void;
  onExit(): void;
}) {
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
          <ArrowLeft size={22} weight="bold" />
        </button>
        <h1>Área dos pais</h1>
      </header>

      <div className="card kids-age-card">
        <div>
          <div className="card-label">Faixa etária</div>
          <strong>
            {band.emoji} {band.label}
          </strong>
          <span className="hint small">{band.description}</span>
        </div>
        <button className="btn secondary" onClick={onAge}>
          Alterar
        </button>
      </div>

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
          <strong>{kids.stars}</strong>
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
          recomendamos acompanhar as conversas.{" "}
          {band.chatSeconds ? `Nesta faixa etária, cada conversa dura ${band.chatSeconds / 60} minutos.` : "Para 0 a 3 anos a conversa fica desligada."}
        </p>
      </div>

      <div className="card">
        <div className="card-label">Privacidade</div>
        <p className="hint small">
          O progresso fica salvo na sua conta ({account.email}). Para entender a fala, o navegador (Chrome ou Edge) envia o áudio ao serviço de
          reconhecimento de voz do Google ou da Microsoft, e o texto da conversa com o Kiko vai para a IA para gerar as respostas.
        </p>
      </div>

      <div className="result-actions">
        <button className="btn secondary" onClick={onAdultMode}>
          Mudar para o modo adulto
        </button>
        <button className="btn secondary" onClick={account.onSignOut}>
          Sair da conta
        </button>
        <button className="btn primary" onClick={onExit}>
          Voltar para as crianças
        </button>
      </div>
    </div>
  );
}
