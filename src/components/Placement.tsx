import { useState } from "react";
import { X, ArrowLeft } from "@phosphor-icons/react";
import { buildStage, levelFromStages, STAGE_COUNT, STAGE_PASS } from "../data/levels";
import type { Exercise } from "../data/course";
import type { Level } from "../lib/progress";
import { stopSpeaking } from "../lib/speech";
import { ExerciseView, type Outcome } from "./Exercises";

/**
 * Adaptive placement test: stages get harder and the test stops at the first stage
 * the learner doesn't pass, so beginners answer only 3 questions.
 */
export function Placement({ onExit, onDone }: { onExit(): void; onDone(level: Level): void }) {
  const [stage, setStage] = useState(0);
  const [questions, setQuestions] = useState<Exercise[]>(() => buildStage(0));
  const [q, setQ] = useState(0);
  const [stageCorrect, setStageCorrect] = useState(0);
  const [locked, setLocked] = useState(false);

  const totalAnswered = stage * 3 + q;

  const record = (o: Outcome) => {
    setLocked(true);
    setTimeout(() => advance(o.correct && !o.skipped), 900);
  };

  const advance = (correct: boolean) => {
    stopSpeaking();
    const got = stageCorrect + (correct ? 1 : 0);
    setLocked(false);
    if (q + 1 < questions.length) {
      setStageCorrect(got);
      setQ(q + 1);
      return;
    }
    const passed = got >= STAGE_PASS;
    if (!passed || stage + 1 >= STAGE_COUNT) {
      onDone(levelFromStages(passed ? stage + 1 : stage));
      return;
    }
    setStage(stage + 1);
    setQuestions(buildStage(stage + 1));
    setQ(0);
    setStageCorrect(0);
  };

  return (
    <div className="lesson">
      <header className="lesson-top">
        <button className="close" onClick={onExit} aria-label="Sair">
          <X size={22} weight="bold" />
        </button>
        <div className="bar">
          <div style={{ width: `${Math.max((totalAnswered / (STAGE_COUNT * 3)) * 100, 3)}%` }} />
        </div>
        <span className="stage-tag">
          Etapa {stage + 1}/{STAGE_COUNT}
        </span>
      </header>
      <main className="lesson-body">
        <p className="hint">Teste de nivelamento — responda sem pressa. As perguntas ficam mais difíceis a cada etapa.</p>
        <ExerciseView key={`${stage}-${q}`} exercise={questions[q]} locked={locked} onAnswer={record} onSpeakingTime={() => {}} />
        {!locked && (
          <div className="check-row">
            <button className="link" onClick={() => record({ correct: false, message: "" })}>
              Não sei
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
