import { useMemo, useState } from "react";
import { playComplete, playCorrect, playWrong } from "../lib/sounds";
import { Heart, SpeakerHigh, X } from "@phosphor-icons/react";
import { buildLesson, type Lesson as LessonT } from "../data/course";
import { allUnits } from "../data/themes";
import { ExerciseView, type Outcome } from "./Exercises";
import { speak, stopSpeaking } from "../lib/speech";

const HEARTS = 5;

export interface LessonResult {
  correct: number;
  total: number;
  speakingSeconds: number;
  failed: boolean;
}

export function Lesson({ lesson, onExit, onDone }: { lesson: LessonT; onExit(): void; onDone(r: LessonResult): void }) {
  const initial = useMemo(() => buildLesson(lesson, allUnits), [lesson]);
  const [queue, setQueue] = useState(initial);
  const [index, setIndex] = useState(0);
  const [hearts, setHearts] = useState(HEARTS);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [correct, setCorrect] = useState(0);
  const [speakingSeconds, setSpeakingSeconds] = useState(0);

  const exercise = queue[index];
  const progress = index / queue.length;

  const answer = (o: Outcome) => {
    setOutcome(o);
    if (!o.skipped) (o.correct ? playCorrect : playWrong)();
    if (o.correct && !o.skipped) setCorrect((c) => c + 1);
    if (!o.correct) {
      setHearts((h) => h - 1);
      // Missed items come back at the end of the lesson, like spaced review.
      setQueue((q) => [...q, q[index]]);
    }
  };

  const next = () => {
    stopSpeaking();
    if (hearts <= 0) {
      onDone({ correct, total: initial.length, speakingSeconds, failed: true });
      return;
    }
    if (index + 1 >= queue.length) {
      playComplete();
      onDone({ correct, total: initial.length, speakingSeconds, failed: false });
      return;
    }
    setOutcome(null);
    setIndex((i) => i + 1);
  };

  return (
    <div className="lesson">
      <header className="lesson-top">
        <button className="close" onClick={onExit} aria-label="Sair">
          <X size={22} weight="bold" />
        </button>
        <div className="bar">
          <div style={{ width: `${Math.max(progress * 100, 3)}%` }} />
        </div>
        <span className="hearts" aria-label={`${hearts} vidas`}>
          <Heart size={20} weight="fill" /> {hearts}
        </span>
      </header>

      <main className="lesson-body">
        <ExerciseView
          key={index}
          exercise={exercise}
          locked={outcome !== null}
          onAnswer={answer}
          onSpeakingTime={(s) => setSpeakingSeconds((t) => t + s)}
        />
      </main>

      {outcome && (
        <footer className={`feedback ${outcome.correct ? "good" : "bad"}`}>
          <div className="feedback-inner">
            <div>
              <strong>{outcome.message}</strong>
              {outcome.solution && (
                <p>
                  {outcome.solution}{" "}
                  <button
                    className="mini"
                    onClick={() => speak(outcome.solution!.split(" — ")[0].replace(/ \(.*\)$/, ""))}
                    aria-label="Ouvir a resposta"
                  >
                    <SpeakerHigh size={18} weight="fill" />
                  </button>
                </p>
              )}
            </div>
            <button className={`btn ${outcome.correct ? "primary" : "danger"}`} onClick={next} autoFocus>
              Continuar
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
