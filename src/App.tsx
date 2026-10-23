import { useEffect, useState } from "react";
import { ArrowLeft, Baby, SpeakerHigh, User } from "@phosphor-icons/react";
import { lessons, units, type Lesson as LessonT, type Unit } from "./data/course";
import { levelInfo, levels } from "./data/levels";
import { Lesson, type LessonResult } from "./components/Lesson";
import { Placement } from "./components/Placement";
import { deckFor, Flashcards, sessionCards, type Card } from "./components/Flashcards";
import { Conversation, TopicPicker } from "./components/Conversation";
import { KidsApp } from "./components/Kids";
import { Home } from "./components/Home";
import { CenterScreen, IconButton, SoundButtons } from "./components/ui";
import { reportStudy } from "./lib/push";
import { AuthScreen, NewPasswordScreen } from "./components/Auth";
import { loadRemote, saveRemote, signOut, supabase, type Session } from "./lib/account";
import type { Topic } from "./data/topics";
import {
  addXp,
  clearLocalProgress,
  fromSaved,
  loadProgress,
  onProgressSaved,
  recordLesson,
  saveProgress,
  type Level,
  type Progress,
} from "./lib/progress";
import { setAccent, setVoiceKind, setVoiceName, speak } from "./lib/speech";

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

  // undefined while the saved session is being checked; null when signed out.
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  /** The account whose progress is loaded here; until it matches the session, a loading screen shows. */
  const [syncedUser, setSyncedUser] = useState<string | null>(null);
  /** Opened the "new password" link from the e-mail. */
  const [recovery, setRecovery] = useState(false);

  const update = (p: Progress) => {
    setProgress(p);
    saveProgress(p);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // On sign-in, the account's progress replaces this device's copy; a brand-new account starts from
  // what the device already had. From then on every save also goes to the account.
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!userId) {
      onProgressSaved(null);
      setSyncedUser(null);
      return;
    }
    let cancelled = false;
    const start = (p: Progress) => {
      if (cancelled) return;
      onProgressSaved((next) => saveRemote(userId, next));
      saveProgress(p);
      setProgress(p);
      setScreen(p.level ? { name: "path" } : { name: "welcome" });
      setSyncedUser(userId);
    };
    loadRemote(userId)
      .then((remote) => start(remote ? fromSaved(remote) : loadProgress()))
      // Offline: keep going with this device's copy (it belongs to this account); it uploads on the next change.
      .catch(() => start(loadProgress()));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const logout = async () => {
    await signOut();
    onProgressSaved(null);
    setProgress(clearLocalProgress());
    setScreen({ name: "welcome" });
  };

  // The chosen accent drives every English voice in the app, not just the AI chat.
  setAccent(progress.aiStyle.accent);
  setVoiceName(progress.voiceName);
  setVoiceKind(progress.mode === "kids" ? "kids" : "adult");

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
  }, [screen.name, progress.mode]);

  // Tells the reminder server about each study day, so nobody is reminded after studying.
  useEffect(() => {
    if (progress.mode === "adult" && progress.lastDay) reportStudy(progress.lastDay, progress.streak);
  }, [progress.mode, progress.lastDay, progress.streak]);

  if (recovery) return <NewPasswordScreen onDone={() => setRecovery(false)} />;
  if (session === undefined || (session && syncedUser !== session.user.id)) {
    return (
      <CenterScreen mood="thinking">
        <p className="hint">Aquecendo a voz…</p>
      </CenterScreen>
    );
  }
  if (!session) return <AuthScreen />;

  if (progress.mode === "kids") {
    return (
      <KidsApp
        account={{ email: session.user.email ?? "", onSignOut: logout }}
        progress={progress}
        onProgress={(change) =>
          setProgress((p) => {
            const next = change(p);
            saveProgress(next);
            return next;
          })
        }
        onAdultMode={() => {
          update({ ...progress, mode: "adult" });
          setScreen(progress.level ? { name: "path" } : { name: "welcome" });
        }}
      />
    );
  }

  if (screen.name === "welcome" && progress.mode === null) {
    return (
      <CenterScreen mood="happy">
        <h1>Vamos fazer você falar inglês.</h1>
        <p className="hint">Para quem é o AprendeAI?</p>
        <div className="mode-choices">
          <button className="mode-choice" onClick={() => update({ ...progress, mode: "adult" })}>
            <User size={32} weight="duotone" />
            <strong>Para mim</strong>
            <span className="hint">Curso com nivelamento, lições e conversa com IA</span>
          </button>
          <button className="mode-choice" onClick={() => update({ ...progress, mode: "kids" })}>
            <Baby size={32} weight="duotone" />
            <strong>Para meu filho ou filha</strong>
            <span className="hint">Modo Kids, de 0 a 12 anos, com o Kiko</span>
          </button>
        </div>
      </CenterScreen>
    );
  }

  if (screen.name === "welcome") {
    return (
      <CenterScreen>
        <h1>Por onde começar?</h1>
        <p className="hint">Um teste rápido de escuta mostra o seu nível. Se preferir, comece do básico.</p>
        <div className="welcome-actions">
          <button className="btn primary lg" onClick={() => setScreen({ name: "placement" })}>
            Fazer o teste (2 a 5 min)
          </button>
          <button className="btn ghost" onClick={() => setScreen({ name: "placed", level: "iniciante" })}>
            Começar do zero
          </button>
        </div>
        <p className="hint small">O teste usa áudio: ligue o som.</p>
      </CenterScreen>
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
      <CenterScreen mood="happy">
        <span className="eyebrow">Seu nível</span>
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
          Você começa em <strong>“{unit.title}”</strong>.{info.startUnit > 0 ? " As unidades anteriores ficam abertas para revisão." : ""}
        </p>
        <div className="result-actions">
          <button
            className="btn primary lg"
            onClick={() => {
              update({ ...progress, level: screen.level });
              setScreen({ name: "path" });
            }}
          >
            Começar
          </button>
        </div>
      </CenterScreen>
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
    const spoke = Math.round(result.speakingSeconds);
    return (
      <CenterScreen mood={result.failed ? "sad" : "happy"}>
        <h1>{result.failed ? "Quase lá." : spoke > 0 ? `Boa! Você falou ${spoke}s de inglês.` : "Lição feita!"}</h1>
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
              <strong>{spoke}s</strong>
              <span>falando</span>
            </div>
          </div>
        )}
        <p className="hint">
          {result.failed
            ? "Errar é como se aprende a falar. Tente de novo e use o “Devagar” para ouvir com calma."
            : "Volte amanhã para manter a sequência."}
        </p>
        <div className="result-actions">
          <button className="btn ghost" onClick={() => setScreen({ name: "lesson", lesson })}>
            Repetir
          </button>
          <button className="btn primary" onClick={() => setScreen({ name: "path" })}>
            Continuar
          </button>
        </div>
      </CenterScreen>
    );
  }

  if (screen.name === "guide") {
    const u = screen.unit;
    return (
      <div className="guide" style={{ "--unit": u.color } as React.CSSProperties}>
        <IconButton label="Voltar" onClick={() => setScreen({ name: "path" })}>
          <ArrowLeft size={22} weight="bold" />
        </IconButton>
        <div className="guide-card">
          <span className="eyebrow">Guia de pronúncia</span>
          <h1>{u.title}</h1>
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
                    <button onClick={() => speak(p.a)}>
                      <SpeakerHigh size={16} weight="fill" /> {p.a}
                    </button>
                    <span>×</span>
                    <button onClick={() => speak(p.b)}>
                      <SpeakerHigh size={16} weight="fill" /> {p.b}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
          <h3>Frases da unidade</h3>
          <ul className="guide-phrases">
            {u.phrases.map((p) => (
              <li key={p.en}>
                <SoundButtons text={p.en} size="sm" />
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
    <Home
      progress={progress}
      email={session.user.email ?? ""}
      currentIndex={currentIndex}
      isUnlocked={isUnlocked}
      dueCards={level.flashcards ? dueCards.length : null}
      onLesson={(l) => setScreen({ name: "lesson", lesson: l })}
      onFlashcards={() => setScreen({ name: "flashcards", cards: dueCards })}
      onChat={() => setScreen({ name: "topics" })}
      onGuide={(u) => setScreen({ name: "guide", unit: u })}
      onGoal={(xp) => update({ ...progress, dailyGoal: xp })}
      onPlacement={() => setScreen({ name: "placement" })}
      onKids={() => update({ ...progress, mode: "kids" })}
      onSignOut={logout}
    />
  );
}
