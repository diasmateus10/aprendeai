// Adult home: "continue" first, then today's numbers and goal, the activities and the course as chapters.
// Rare actions (placement test, Kids mode, reminder, sign-out) live in the account menu.

import { useState } from "react";
import {
  BookOpenText,
  CaretRight,
  Cards,
  Check,
  Flame,
  Lightning,
  Lock,
  Microphone,
  Star,
  Target,
  Baby,
  SignOut,
  X,
  PencilSimple,
  Crown,
  Brain,
} from "@phosphor-icons/react";
import { learnedCount, NEW_PER_DAY, newWordsToday } from "./Flashcards";
import { openPortal, type Subscription } from "../lib/account";
import { PREMIUM_STATUSES } from "../data/plans";
import { lessons, units, type Lesson, type Unit } from "../data/course";
import { levelInfo } from "../data/levels";
import { dayKey, displayStreak, GOALS, todayXp, type Progress } from "../lib/progress";
import { sttSupported } from "../lib/speech";
import { Logo } from "./Brand";
import { ReminderCard } from "./Reminder";
import { ConfirmButton, FocusIcon, IconButton } from "./ui";

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

export interface HomeProps {
  progress: Progress;
  email: string;
  /** Index in `lessons` of the next lesson to do, or -1 when the course is done. */
  currentIndex: number;
  isUnlocked(lessonIndex: number): boolean;
  /** Reachable in the course but outside the free plan. */
  planLocked(lessonIndex: number): boolean;
  subscription: Subscription | null;
  /** Opens the plans screen, saying why. */
  onUpgrade(reason: string): void;
  /** null when the learner's level has no flashcards. */
  dueCards: number | null;
  onLesson(l: Lesson): void;
  onFlashcards(): void;
  onChat(): void;
  onGuide(u: Unit): void;
  onGoal(xp: number): void;
  onPlacement(): void;
  onKids(): void;
  onSignOut(): void;
}

export function Home(props: HomeProps) {
  const { progress, email } = props;
  const [menu, setMenu] = useState(false);
  const initial = (email[0] ?? "?").toUpperCase();
  return (
    <div className="home">
      <header className="topbar">
        <Logo size={30} />
        <button className="avatar-btn" onClick={() => setMenu(true)} aria-label="Abrir menu da conta" title="Conta">
          {initial}
        </button>
      </header>

      <div className="home-body">
        <ContinueCard {...props} />
        <Numbers progress={progress} />
        <GoalCard progress={progress} onGoal={props.onGoal} />
        <ReminderCard lastDay={progress.lastDay} streak={progress.streak} hideWhenOn />
        <Activities {...props} />
        {!sttSupported && (
          <div className="banner">
            Para treinar a fala, abra no <strong>Chrome</strong> ou no <strong>Edge</strong>. Os exercícios de escuta funcionam em qualquer
            navegador.
          </div>
        )}
        <Course {...props} />
      </div>

      {menu && <AccountMenu {...props} onClose={() => setMenu(false)} />}
    </div>
  );
}

function ContinueCard(props: HomeProps) {
  const { progress, dueCards, onFlashcards } = props;
  const [skipped, setSkipped] = useState(false);
  const done = newWordsToday(progress.cards);
  // Daily habit: the new words first, then the course. Only while there are cards to study today.
  if (!skipped && dueCards && done < NEW_PER_DAY) {
    return (
      <section className="card continue-card" style={{ "--unit": "var(--gold)" } as React.CSSProperties}>
        <span className="eyebrow">Primeiro passo de hoje</span>
        <div className="continue-row">
          <span className="continue-icon">
            <Cards size={30} weight="duotone" />
          </span>
          <div>
            <h1>{done ? `Faltam ${NEW_PER_DAY - done} palavras novas` : `${NEW_PER_DAY} palavras novas de hoje`}</h1>
            <p className="hint">Veja a foto e diga a palavra em inglês. Depois, siga para a lição da trilha.</p>
          </div>
        </div>
        <div className="unit-progress" aria-label={`${done} de ${NEW_PER_DAY} palavras novas hoje`}>
          {Array.from({ length: NEW_PER_DAY }, (_, i) => (
            <span key={i} className={i < done ? "on" : ""} />
          ))}
        </div>
        <button className="btn primary block lg" onClick={onFlashcards}>
          {done ? "Continuar flashcards" : "Começar flashcards"}
        </button>
        <button className="link" onClick={() => setSkipped(true)}>
          Ir direto para a lição
        </button>
      </section>
    );
  }
  return <LessonCard {...props} />;
}

function LessonCard({ progress, currentIndex, onLesson, planLocked, onUpgrade }: HomeProps) {
  if (currentIndex < 0) {
    return (
      <section className="card continue-card done">
        <span className="eyebrow">Curso completo</span>
        <h1>Você fez todas as lições.</h1>
        <p className="hint">Continue conversando com a IA e revisando os flashcards para não enferrujar.</p>
      </section>
    );
  }
  const lesson = lessons[currentIndex];
  const unitIndex = units.findIndex((u) => u.id === lesson.unitId);
  const unit = units[unitIndex];
  const unitLessons = lessons.filter((l) => l.unitId === unit.id);
  const done = unitLessons.filter((l) => progress.completed[l.id] !== undefined).length;
  return (
    <section className="card continue-card" style={{ "--unit": unit.color } as React.CSSProperties}>
      <span className="eyebrow">Continue de onde parou</span>
      <div className="continue-row">
        <span className="continue-icon">
          <FocusIcon focus={lesson.focus} size={30} />
        </span>
        <div>
          <h1>
            {lesson.title}: {unit.title.toLowerCase()}
          </h1>
          <p className="hint">
            Unidade {String(unitIndex + 1).padStart(2, "0")} · {unit.subtitle}
          </p>
        </div>
      </div>
      <div className="unit-progress" aria-label={`${done} de ${unitLessons.length} lições da unidade`}>
        {unitLessons.map((l) => (
          <span key={l.id} className={progress.completed[l.id] !== undefined ? "on" : l.id === lesson.id ? "now" : ""} />
        ))}
      </div>
      {planLocked(currentIndex) ? (
        <button className="btn primary block lg" onClick={() => onUpgrade(`A Unidade ${unitIndex + 1} faz parte do Premium.`)}>
          <Crown size={20} weight="fill" /> Liberar no Premium
        </button>
      ) : (
        <button className="btn primary block lg" onClick={() => onLesson(lesson)}>
          Começar lição
        </button>
      )}
    </section>
  );
}

function Numbers({ progress }: { progress: Progress }) {
  const streak = displayStreak(progress);
  const learned = learnedCount(progress.cards);
  return (
    <section className="numbers" aria-label="Seus números">
      <div>
        <Flame size={22} weight="fill" className="gold" />
        <strong>{streak}</strong>
        <span>{streak === 1 ? "dia seguido" : "dias seguidos"}</span>
      </div>
      <div>
        <Lightning size={22} weight="fill" className="gold" />
        <strong>{progress.xp}</strong>
        <span>XP no total</span>
      </div>
      <div>
        <Microphone size={22} weight="fill" className="coral" />
        <strong>{Math.round(progress.speakingSeconds / 60)}</strong>
        <span>min falando</span>
      </div>
      <div>
        <Brain size={22} weight="fill" className="coral" />
        <strong>{learned}</strong>
        <span>{learned === 1 ? "palavra decorada" : "palavras decoradas"}</span>
      </div>
    </section>
  );
}

function GoalCard({ progress, onGoal }: { progress: Progress; onGoal(xp: number): void }) {
  const [editing, setEditing] = useState(false);
  const today = todayXp(progress);
  const goal = progress.dailyGoal;
  const pct = Math.min(today / goal, 1);
  const done = today >= goal;
  const week = Array.from({ length: 7 }, (_, i) => {
    const offset = i - 6;
    const key = dayKey(offset);
    const date = new Date(Date.now() + offset * 86_400_000);
    return { key, label: WEEKDAYS[date.getDay()], xp: progress.daily[key] ?? 0, today: offset === 0 };
  });
  const R = 26;
  const C = 2 * Math.PI * R;
  return (
    <section className="card goal-card">
      <div className="goal-ring" aria-hidden="true">
        <svg viewBox="0 0 64 64" width="64" height="64">
          <circle cx="32" cy="32" r={R} className="ring-bg" />
          <circle cx="32" cy="32" r={R} className="ring-fg" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />
        </svg>
        <span>{done ? <Check size={22} weight="bold" /> : `${Math.round(pct * 100)}%`}</span>
      </div>
      <div className="goal-info">
        <span className="eyebrow">Meta de hoje</span>
        <strong>
          {today} de {goal} XP
        </strong>
        <span className="hint">{done ? "Feito por hoje. Amanhã tem mais." : `Faltam ${goal - today} XP`}</span>
        <div className="week" aria-label="Últimos 7 dias">
          {week.map((d) => (
            <span key={d.key} className={`day ${d.xp >= goal ? "hit" : d.xp > 0 ? "some" : ""} ${d.today ? "today" : ""}`} title={`${d.xp} XP`}>
              {d.label}
            </span>
          ))}
        </div>
      </div>
      <IconButton label="Mudar a meta" onClick={() => setEditing(!editing)} className="goal-edit">
        <PencilSimple size={18} weight="bold" />
      </IconButton>
      {editing && (
        <div className="goal-options">
          {GOALS.map((g) => (
            <button
              key={g.xp}
              className={`chip ${g.xp === goal ? "on" : ""}`}
              onClick={() => {
                onGoal(g.xp);
                setEditing(false);
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
    </section>
  );
}

function Activities({ currentIndex, dueCards, onChat, onFlashcards, onGuide }: HomeProps) {
  const unit = currentIndex >= 0 ? units.find((u) => u.id === lessons[currentIndex].unitId)! : units[units.length - 1];
  return (
    <section className="activities" aria-label="Praticar">
      <button className="activity feature" onClick={onChat}>
        <span className="mini-orb" aria-hidden="true" />
        <span className="activity-text">
          <strong>Conversa com IA</strong>
          <span>Fale em voz alta por 5 minutos. A IA responde e corrige na hora.</span>
        </span>
        <CaretRight size={20} weight="bold" />
      </button>
      {dueCards !== null && (
        <button className="activity" onClick={onFlashcards} disabled={dueCards === 0}>
          <Cards size={26} weight="duotone" className="coral" />
          <strong>Flashcards</strong>
          <span>{dueCards ? `${dueCards} cartões hoje` : "Tudo feito hoje"}</span>
        </button>
      )}
      <button className="activity" onClick={() => onGuide(unit)}>
        <BookOpenText size={26} weight="duotone" className="coral" />
        <strong>Pronúncia</strong>
        <span>{unit.title}</span>
      </button>
    </section>
  );
}

function Course({ progress, currentIndex, isUnlocked, planLocked, onLesson, onGuide, onUpgrade }: HomeProps) {
  return (
    <section className="course" aria-label="Seu curso">
      <h2 className="section-title">Seu curso</h2>
      {units.map((u, ui) => {
        const unitLessons = lessons.filter((l) => l.unitId === u.id);
        // Chapters not reached yet stay compact so the course doesn't become a long wall of locks.
        const locked = !isUnlocked(lessons.indexOf(unitLessons[0]));
        if (locked) {
          return (
            <article key={u.id} className="chapter locked" style={{ "--unit": u.color } as React.CSSProperties}>
              <header className="chapter-head">
                <span className="chapter-num">{String(ui + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{u.title}</h3>
                  <p>{u.subtitle}</p>
                </div>
                <Lock size={18} weight="bold" className="muted" aria-label="Bloqueado" />
              </header>
            </article>
          );
        }
        return (
          <article key={u.id} className="chapter" style={{ "--unit": u.color } as React.CSSProperties}>
            <header className="chapter-head">
              <span className="chapter-num">{String(ui + 1).padStart(2, "0")}</span>
              <div>
                <h3>{u.title}</h3>
                <p>{u.subtitle}</p>
              </div>
              <IconButton label={`Guia de pronúncia: ${u.title}`} onClick={() => onGuide(u)}>
                <BookOpenText size={20} weight="bold" />
              </IconButton>
            </header>
            <ol className="lessons">
              {unitLessons.map((l) => {
                const gi = lessons.indexOf(l);
                const unlocked = isUnlocked(gi);
                const stars = progress.completed[l.id];
                const now = gi === currentIndex;
                if (unlocked && planLocked(gi)) {
                  return (
                    <li key={l.id}>
                      <button className="lesson-row premium" onClick={() => onUpgrade(`A Unidade ${ui + 1} faz parte do Premium.`)}>
                        <span className="lesson-icon">
                          <FocusIcon focus={l.focus} size={20} />
                        </span>
                        <span className="lesson-text">
                          <strong>{l.title}</strong>
                          <span>Disponível no Premium</span>
                        </span>
                        <span className="premium-tag">
                          <Crown size={14} weight="fill" /> Premium
                        </span>
                      </button>
                    </li>
                  );
                }
                return (
                  <li key={l.id}>
                    <button className={`lesson-row ${now ? "now" : ""} ${stars ? "done" : ""}`} disabled={!unlocked} onClick={() => onLesson(l)}>
                      <span className="lesson-icon">{unlocked ? <FocusIcon focus={l.focus} size={20} /> : <Lock size={18} weight="bold" />}</span>
                      <span className="lesson-text">
                        <strong>{l.title}</strong>
                        <span>{now ? "Próxima lição" : stars ? "Feita" : unlocked ? "Disponível" : "Termine a anterior para liberar"}</span>
                      </span>
                      {stars !== undefined ? (
                        <span className="lesson-stars" aria-label={`${stars} de 3 estrelas`}>
                          {[1, 2, 3].map((n) => (
                            <Star key={n} size={16} weight={n <= stars ? "fill" : "regular"} />
                          ))}
                        </span>
                      ) : (
                        unlocked && <CaretRight size={18} weight="bold" className="muted" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          </article>
        );
      })}
    </section>
  );
}

function AccountMenu({ progress, email, subscription, onPlacement, onKids, onSignOut, onUpgrade, onClose }: HomeProps & { onClose(): void }) {
  const level = levelInfo(progress.level);
  const [portalError, setPortalError] = useState<string | null>(null);
  const premium = PREMIUM_STATUSES.includes(subscription?.status ?? "");
  const until = subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString("pt-BR") : null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Sua conta" onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <span className="avatar-btn static">{(email[0] ?? "?").toUpperCase()}</span>
          <div>
            <strong>{email}</strong>
            <span className="hint">Nível {level.label}</span>
          </div>
          <IconButton label="Fechar" onClick={onClose}>
            <X size={20} weight="bold" />
          </IconButton>
        </header>

        {premium ? (
          <button
            className="menu-item"
            onClick={async () => setPortalError((await openPortal()) || null)}
          >
            <Crown size={22} weight="fill" className="gold" />
            <span>
              <strong>Premium {subscription?.status === "trialing" ? "(teste grátis)" : ""}</strong>
              <span className="hint">
                {subscription?.cancel_at_period_end ? `Termina em ${until}` : `Renova em ${until}`} · Gerenciar ou cancelar
              </span>
            </span>
          </button>
        ) : (
          <button className="menu-item premium-cta" onClick={() => onUpgrade("")}>
            <Crown size={22} weight="fill" className="gold" />
            <span>
              <strong>Seja Premium</strong>
              <span className="hint">Curso completo e 30 min de conversa por dia</span>
            </span>
          </button>
        )}
        {portalError && <p className="warn small">{portalError}</p>}

        <ReminderCard lastDay={progress.lastDay} streak={progress.streak} />

        <ConfirmButton
          className="menu-item"
          question="Refazer o teste? Seu progresso continua salvo."
          confirmLabel="Refazer"
          onConfirm={onPlacement}
        >
          <Target size={22} weight="duotone" />
          <span>
            <strong>Refazer teste de nível</strong>
            <span className="hint">Hoje: {level.label}</span>
          </span>
        </ConfirmButton>

        <button className="menu-item" onClick={onKids}>
          <Baby size={22} weight="duotone" />
          <span>
            <strong>Modo Kids</strong>
            <span className="hint">Atividades para crianças de 0 a 12 anos</span>
          </span>
        </button>

        <ConfirmButton className="menu-item danger" question="Sair desta conta neste aparelho?" confirmLabel="Sair" onConfirm={onSignOut}>
          <SignOut size={22} weight="duotone" />
          <span>
            <strong>Sair da conta</strong>
          </span>
        </ConfirmButton>
      </div>
    </div>
  );
}
