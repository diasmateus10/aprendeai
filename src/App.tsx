import { useEffect, useState } from "react";
import { lessons, units, type Lesson as LessonT, type Unit } from "./data/course";
import { levelInfo, levels } from "./data/levels";
import { Lesson, type LessonResult } from "./components/Lesson";
import { Placement } from "./components/Placement";
import { deckFor, Flashcards, sessionCards, type Card } from "./components/Flashcards";
import { Conversation, TopicPicker } from "./components/Conversation";
import type { Topic } from "./data/topics";
import {
  addXp,
  dayKey,
  displayStreak,
  GOALS,
  loadProgress,
  recordLesson,
  saveProgress,
  todayXp,
  type Level,
  type Progress,
} from "./lib/progress";
import { setAccent, setVoiceName, speak, sttSupported } from "./lib/speech";

type Screen =
  | { name: "welcome" }
  | { name: "placement" }
  | { name: "placed"; level: Level }
  | { name: "flashcards"; cards: Card[] }
  | { name: "topics" }
  | { name: "chat"; topic: Topic }
  | { name: "path" }
  | { name: "guide"; unit: Unit }
  | { name: "lesson"; lesson: LessonT }
  | { name: "result"; lesson: LessonT; result: LessonResult; xp: number };

export default function App() {
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [screen, setScreen] = useState<Screen>(() => (progress.level ? { name: "path" } : { name: "welcome" }));

  const update = (p: Progress) => {
    setProgress(p);
    saveProgress(p);
  };

  // The chosen accent drives every English voice in the app, not just the AI chat.
  setAccent(progress.aiStyle.accent);
  setVoiceName(progress.voiceName);

  const level = levelInfo(progress.level);
  const startLesson = lessons.findIndex((l) => l.unitId === units[level.startUnit].id);
  // Units before the placement start stay open for review; from there on, lessons unlock in order.
  const isUnlocked = (lessonIndex: number) =>
    lessonIndex <= startLesson || progress.completed[lessons[lessonIndex - 1].id] !== undefined;
  const currentIndex = lessons.findIndex((l, i) => i >= startLesson && isUnlocked(i) && progress.completed[l.id] === undefined);
  const deck = deckFor(progress.level);
  const dueCards = sessionCards(deck, progress.cards);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen.name]);

  if (screen.name === "welcome") {
    return (
      <div className="result">
        <div className="result-card">
          <div className="mascot big">🦜</div>
          <h1>Bem-vindo ao AprendeAI</h1>
          <p className="hint">Inglês para brasileiros, com foco em ouvir e falar. Qual é o seu nível?</p>
          <div className="welcome-actions">
            <button className="btn primary" onClick={() => setScreen({ name: "placement" })}>
              Fazer teste de nivelamento
            </button>
            <button className="btn secondary" onClick={() => setScreen({ name: "placed", level: "iniciante" })}>
              Começar do zero
            </button>
          </div>
          <p className="hint small">O teste leva de 2 a 5 minutos e usa áudio: ligue o som.</p>
        </div>
      </div>
    );
  }

  if (screen.name === "placement") {
    return (
      <Placement
        onExit={() => setScreen(progress.level ? { name: "path" } : { name: "welcome" })}
        onDone={(lvl) => setScreen({ name: "placed", level: lvl })}
      />
    );
  }

  if (screen.name === "placed") {
    const info = levelInfo(screen.level);
    const unit = units[info.startUnit];
    return (
      <div className="result">
        <div className="result-card">
          <div className="mascot big">🎯</div>
          <p className="hint">Seu nível</p>
          <h1 className="level-name">{info.label}</h1>
          <div className="level-scale">
            {levels.map((l) => (
              <span key={l.id} className={l.id === info.id ? "on" : ""}>
                {l.label}
              </span>
            ))}
          </div>
          <p>{info.description}</p>
          <p className="hint">
            Você começa na unidade <strong>“{unit.title}”</strong>.
            {info.startUnit > 0 ? " As anteriores ficam liberadas para revisão." : ""}
            {info.flashcards ? " Flashcards de revisão disponíveis." : ""}
          </p>
          <div className="result-actions">
            <button
              className="btn primary"
              onClick={() => {
                update({ ...progress, level: screen.level });
                setScreen({ name: "path" });
              }}
            >
              Começar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen.name === "topics") {
    return (
      <TopicPicker
        style={progress.aiStyle}
        onStyle={(aiStyle) => update({ ...progress, aiStyle })}
        voiceName={progress.voiceName}
        onVoice={(voiceName) => {
          setVoiceName(voiceName);
          update({ ...progress, voiceName });
        }}
        onPick={(topic) => setScreen({ name: "chat", topic })}
        onExit={() => setScreen({ name: "path" })}
      />
    );
  }

  if (screen.name === "chat") {
    return (
      <Conversation
        topic={screen.topic}
        level={progress.level ?? "iniciante"}
        style={progress.aiStyle}
        onExit={() => setScreen({ name: "path" })}
        onFinish={(seconds, userTurns) =>
          setProgress((p) => {
            // 2 XP per sentence spoken, capped so a 5-minute chat is worth about one lesson.
            const next = addXp({ ...p, speakingSeconds: p.speakingSeconds + seconds }, Math.min(userTurns * 2, 30));
            saveProgress(next);
            return next;
          })
        }
      />
    );
  }

  if (screen.name === "flashcards") {
    return (
      <Flashcards
        cards={screen.cards}
        states={progress.cards}
        onRate={(id, state) =>
          setProgress((p) => {
            // A card climbing a box is a correct recall: 1 XP toward the daily goal.
            const earned = state.box > (p.cards[id]?.box ?? 0) ? addXp(p, 1) : p;
            const next = { ...earned, cards: { ...earned.cards, [id]: state } };
            saveProgress(next);
            return next;
          })
        }
        onExit={() => setScreen({ name: "path" })}
      />
    );
  }

  if (screen.name === "lesson") {
    return (
      <Lesson
        lesson={screen.lesson}
        onExit={() => setScreen({ name: "path" })}
        onDone={(result) => {
          let xp = 0;
          if (!result.failed) {
            const ratio = result.correct / result.total;
            const stars = ratio >= 0.9 ? 3 : ratio >= 0.6 ? 2 : 1;
            xp = 10 + result.correct * 2;
            const p = recordLesson(progress, screen.lesson.id, stars, xp);
            update({ ...p, speakingSeconds: p.speakingSeconds + result.speakingSeconds });
          }
          setScreen({ name: "result", lesson: screen.lesson, result, xp });
        }}
      />
    );
  }

  if (screen.name === "result") {
    const { result, xp, lesson } = screen;
    return (
      <div className="result">
        <div className="result-card">
          <div className="mascot big">{result.failed ? "😵" : "🦜"}</div>
          <h1>{result.failed ? "Acabaram as vidas" : "Lição concluída!"}</h1>
          {!result.failed && (
            <div className="stats">
              <div>
                <strong>+{xp}</strong>
                <span>XP</span>
              </div>
              <div>
                <strong>
                  {result.correct}/{result.total}
                </strong>
                <span>acertos</span>
              </div>
              <div>
                <strong>{Math.round(result.speakingSeconds)}s</strong>
                <span>falando</span>
              </div>
            </div>
          )}
          <p className="hint">
            {result.failed ? "Tudo bem: errar faz parte. Tente de novo com o botão 🐢 para ouvir devagar." : "Continue falando todo dia para manter a sequência."}
          </p>
          <div className="result-actions">
            <button className="btn secondary" onClick={() => setScreen({ name: "lesson", lesson })}>
              Repetir
            </button>
            <button className="btn primary" onClick={() => setScreen({ name: "path" })}>
              Continuar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen.name === "guide") {
    const u = screen.unit;
    return (
      <div className="guide">
        <button className="close" onClick={() => setScreen({ name: "path" })} aria-label="Voltar">
          ←
        </button>
        <div className="guide-card" style={{ borderColor: u.color }}>
          <h1 style={{ color: u.color }}>{u.title}</h1>
          <p className="subtitle">{u.subtitle}</p>
          {u.guide.map((g, i) => (
            <p key={i}>{g}</p>
          ))}
          {u.pairs.length > 0 && (
            <>
              <h3>Pares para treinar o ouvido</h3>
              <div className="guide-pairs">
                {u.pairs.map((p) => (
                  <div key={p.a + p.b} className="guide-pair">
                    <button onClick={() => speak(p.a)}>🔊 {p.a}</button>
                    <span>×</span>
                    <button onClick={() => speak(p.b)}>🔊 {p.b}</button>
                  </div>
                ))}
              </div>
            </>
          )}
          <h3>Frases da unidade</h3>
          <ul className="guide-phrases">
            {u.phrases.map((p) => (
              <li key={p.en}>
                <button className="mini" onClick={() => speak(p.en)}>
                  🔊
                </button>
                <button className="mini" onClick={() => speak(p.en, true)}>
                  🐢
                </button>
                <span>
                  <strong>{p.en}</strong> — {p.pt}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="home">
      <header className="topbar">
        <div className="brand">
          <span className="mascot">🦜</span> AprendeAI
        </div>
        <div className="counters">
          <span title="Dias seguidos">🔥 {displayStreak(progress)}</span>
          <span title="Pontos de experiência">⚡ {progress.xp}</span>
          <span title="Tempo total falando inglês">🎤 {Math.round(progress.speakingSeconds / 60)} min</span>
          <button className="level-chip" title="Refazer teste de nivelamento" onClick={() => setScreen({ name: "placement" })}>
            {level.label}
          </button>
        </div>
      </header>

      <Dashboard
        progress={progress}
        next={currentIndex >= 0 ? lessons[currentIndex] : null}
        dueCards={level.flashcards ? dueCards.length : null}
        onGoal={(xp) => update({ ...progress, dailyGoal: xp })}
        onNext={(l) => setScreen({ name: "lesson", lesson: l })}
        onFlashcards={() => setScreen({ name: "flashcards", cards: dueCards })}
        onChat={() => setScreen({ name: "topics" })}
        onGuide={(u) => setScreen({ name: "guide", unit: u })}
        onPlacement={() => setScreen({ name: "placement" })}
      />

      <h2 className="section-title path-title">Seu curso</h2>

      {!sttSupported && (
        <div className="banner">
          Para treinar a fala, abra no <strong>Chrome</strong> ou <strong>Edge</strong>. Os exercícios de escuta funcionam em qualquer navegador.
        </div>
      )}

      <main className="path">
        {units.map((u) => {
          const unitLessons = lessons.filter((l) => l.unitId === u.id);
          return (
            <section key={u.id} className="unit">
              <div className="unit-header" style={{ background: u.color }}>
                <div>
                  <h2>{u.title}</h2>
                  <p>{u.subtitle}</p>
                </div>
                <button className="guide-btn" onClick={() => setScreen({ name: "guide", unit: u })}>
                  📖 Guia
                </button>
              </div>
              <div className="nodes">
                {unitLessons.map((l, k) => {
                  const gi = lessons.indexOf(l);
                  const unlocked = isUnlocked(gi);
                  const stars = progress.completed[l.id];
                  const offset = [0, 60, -60][k % 3];
                  return (
                    <div key={l.id} className="node-wrap" style={{ transform: `translateX(${offset}px)` }}>
                      {gi === currentIndex && <div className="start-tag">COMEÇAR</div>}
                      <button
                        className={`node ${unlocked ? "" : "locked"} ${stars ? "done" : ""}`}
                        style={unlocked ? { background: u.color, boxShadow: `0 6px 0 ${shade(u.color)}` } : undefined}
                        disabled={!unlocked}
                        onClick={() => setScreen({ name: "lesson", lesson: l })}
                        title={l.title}
                      >
                        {unlocked ? l.icon : "🔒"}
                      </button>
                      <span className="node-label">{l.title}</span>
                      {stars !== undefined && <span className="stars">{"★".repeat(stars)}{"☆".repeat(3 - stars)}</span>}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

function Dashboard({
  progress,
  next,
  dueCards,
  onGoal,
  onNext,
  onFlashcards,
  onChat,
  onGuide,
  onPlacement,
}: {
  progress: Progress;
  next: LessonT | null;
  /** null when the learner's level has no flashcards. */
  dueCards: number | null;
  onGoal(xp: number): void;
  onNext(l: LessonT): void;
  onFlashcards(): void;
  onChat(): void;
  onGuide(u: Unit): void;
  onPlacement(): void;
}) {
  const [editingGoal, setEditingGoal] = useState(false);
  const today = todayXp(progress);
  const goal = progress.dailyGoal;
  const pct = Math.min(today / goal, 1);
  const done = today >= goal;
  const nextUnit = next ? units.find((u) => u.id === next.unitId)! : null;
  const week = Array.from({ length: 7 }, (_, i) => {
    const offset = i - 6;
    const key = dayKey(offset);
    const date = new Date(Date.now() + offset * 86_400_000);
    return { key, label: WEEKDAYS[date.getDay()], xp: progress.daily[key] ?? 0, today: offset === 0 };
  });
  const R = 34;
  const C = 2 * Math.PI * R;

  return (
    <section className="dashboard">
      <div className="card goal-card">
        <div className="goal-ring">
          <svg viewBox="0 0 80 80" width="88" height="88" aria-hidden="true">
            <circle cx="40" cy="40" r={R} className="ring-bg" />
            <circle cx="40" cy="40" r={R} className="ring-fg" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />
          </svg>
          <span>{done ? "✓" : `${Math.round(pct * 100)}%`}</span>
        </div>
        <div className="goal-info">
          <div className="card-label">Meta diária</div>
          <strong>
            {today} / {goal} XP
          </strong>
          <span className="hint">{done ? "Meta de hoje concluída! 🎉" : `Faltam ${goal - today} XP para hoje`}</span>
          <div className="week">
            {week.map((d) => (
              <div key={d.key} className={`day ${d.xp >= goal ? "hit" : d.xp > 0 ? "some" : ""} ${d.today ? "today" : ""}`} title={`${d.xp} XP`}>
                <span>{d.label}</span>
              </div>
            ))}
          </div>
        </div>
        <button className="link goal-edit" onClick={() => setEditingGoal(!editingGoal)}>
          Alterar
        </button>
        {editingGoal && (
          <div className="goal-options">
            {GOALS.map((g) => (
              <button
                key={g.xp}
                className={`chip ${g.xp === goal ? "on" : ""}`}
                onClick={() => {
                  onGoal(g.xp);
                  setEditingGoal(false);
                }}
              >
                <strong>{g.label}</strong>
                <span>
                  {g.xp} XP · ~{g.minutes} min
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {next && nextUnit && (
        <div className="card next-card" style={{ borderLeftColor: nextUnit.color }}>
          <div className="card-label">Próximo conteúdo</div>
          <div className="next-row">
            <span className="next-icon" style={{ background: nextUnit.color }}>
              {next.icon}
            </span>
            <div>
              <strong>{next.title}</strong>
              <span className="hint">
                {nextUnit.title} · {nextUnit.subtitle}
              </span>
            </div>
          </div>
          <button className="btn primary block" onClick={() => onNext(next)}>
            Continuar
          </button>
        </div>
      )}

      <h2 className="section-title">Atividades</h2>
      <div className="activities">
        <button className="activity" onClick={onChat}>
          <span className="act-icon">💬</span>
          <strong>Conversa com IA</strong>
          <span>5 min sobre um tema</span>
        </button>
        {dueCards !== null && (
          <button className="activity" onClick={onFlashcards} disabled={dueCards === 0}>
            <span className="act-icon">🃏</span>
            <strong>Flashcards</strong>
            <span>{dueCards ? `${dueCards} para revisar` : "Tudo revisado"}</span>
          </button>
        )}
        {nextUnit && (
          <button className="activity" onClick={() => onGuide(nextUnit)}>
            <span className="act-icon">🗣️</span>
            <strong>Pronúncia</strong>
            <span>Guia: {nextUnit.title}</span>
          </button>
        )}
        <button className="activity" onClick={onPlacement}>
          <span className="act-icon">🎯</span>
          <strong>Teste de nível</strong>
          <span>Refazer nivelamento</span>
        </button>
      </div>
    </section>
  );
}

function shade(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.floor(c * 0.75));
  const r = f(n >> 16);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}
