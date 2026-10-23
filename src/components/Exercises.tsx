import { useEffect, useRef, useState } from "react";
import { ChatCircleDots, Lightbulb, Microphone, Stop } from "@phosphor-icons/react";
import { Mascot } from "./Brand";
import { SoundButtons } from "./ui";
import type { Exchange, Exercise, Phrase } from "../data/course";
import { listen, speak, stopSpeaking, sttSupported, type ListenHandle } from "../lib/speech";
import { scoreSpeech, scoreTyped, SPEAK_PASS, TYPE_PASS, type Score } from "../lib/score";

export interface Outcome {
  correct: boolean;
  /** Shown in the feedback bar. */
  message: string;
  solution?: string;
  /** Skipped speaking exercises cost no heart. */
  skipped?: boolean;
}

interface Props {
  exercise: Exercise;
  onAnswer(o: Outcome): void;
  onSpeakingTime(seconds: number): void;
  locked: boolean;
}

export function ExerciseView(props: Props) {
  const { exercise } = props;
  switch (exercise.kind) {
    case "listen_choose":
      return <ListenChoose {...props} ex={exercise} />;
    case "minimal_pair":
      return <MinimalPairView {...props} ex={exercise} />;
    case "dictation":
      return <Dictation {...props} phrase={exercise.phrase} />;
    case "repeat":
      return <SpeakView {...props} phrase={exercise.phrase} mode="repeat" />;
    case "speak_translate":
      return <SpeakView {...props} phrase={exercise.phrase} mode="translate" />;
    case "respond":
      return <Respond {...props} exchange={exercise.exchange} />;
  }
}

function AudioButtons({ text, autoplay = true }: { text: string; autoplay?: boolean }) {
  useEffect(() => {
    if (autoplay) {
      const t = setTimeout(() => speak(text), 300);
      return () => clearTimeout(t);
    }
  }, [text, autoplay]);
  return (
    <div className="audio-buttons">
      <SoundButtons text={text} size="lg" />
    </div>
  );
}

function ListenChoose({ ex, onAnswer, locked }: Props & { ex: Extract<Exercise, { kind: "listen_choose" }> }) {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div className="exercise">
      <h2>O que você ouviu?</h2>
      <AudioButtons text={ex.audio} />
      <div className="options">
        {ex.options.map((o) => (
          <button
            key={o}
            className={`option ${picked === o ? "selected" : ""} ${locked && o === ex.answer ? "right" : ""} ${locked && picked === o && o !== ex.answer ? "wrong" : ""}`}
            disabled={locked}
            onClick={() => setPicked(o)}
          >
            {o}
          </button>
        ))}
      </div>
      <CheckBar
        disabled={!picked || locked}
        onCheck={() =>
          onAnswer({
            correct: picked === ex.answer,
            message: picked === ex.answer ? "Isso aí!" : "Resposta correta:",
            solution: picked === ex.answer ? ex.audio : `${ex.audio} — ${ex.answer}`,
          })
        }
      />
    </div>
  );
}

function MinimalPairView({ ex, onAnswer, locked }: Props & { ex: Extract<Exercise, { kind: "minimal_pair" }> }) {
  const target = ex.play === "a" ? ex.pair.a : ex.pair.b;
  const [picked, setPicked] = useState<string | null>(null);
  const choices = [
    { word: ex.pair.a, pt: ex.pair.ptA },
    { word: ex.pair.b, pt: ex.pair.ptB },
  ];
  return (
    <div className="exercise">
      <h2>Qual palavra você ouviu?</h2>
      <p className="hint">Pares mínimos: só um som muda. Ouça quantas vezes precisar.</p>
      <AudioButtons text={target} />
      <div className="options two">
        {choices.map((c) => (
          <button
            key={c.word}
            className={`option pair ${picked === c.word ? "selected" : ""} ${locked && c.word === target ? "right" : ""} ${locked && picked === c.word && c.word !== target ? "wrong" : ""}`}
            disabled={locked}
            onClick={() => {
              setPicked(c.word);
              speak(c.word);
            }}
          >
            <strong>{c.word}</strong>
            <span>{c.pt}</span>
          </button>
        ))}
      </div>
      <CheckBar
        disabled={!picked || locked}
        onCheck={() =>
          onAnswer({
            correct: picked === target,
            message: picked === target ? "Ouvido afiado!" : "Era a outra:",
            solution: `${target} (${target === ex.pair.a ? ex.pair.ptA : ex.pair.ptB})`,
          })
        }
      />
    </div>
  );
}

function Dictation({ phrase, onAnswer, locked }: Props & { phrase: Phrase }) {
  const [text, setText] = useState("");
  const [score, setScore] = useState<Score | null>(null);
  const check = () => {
    const s = scoreTyped(phrase.en, text);
    setScore(s);
    const ok = s.accuracy >= TYPE_PASS;
    onAnswer({ correct: ok, message: ok ? "Perfeito!" : "Resposta correta:", solution: `${phrase.en} — ${phrase.pt}` });
  };
  return (
    <div className="exercise">
      <h2>Escreva o que você ouviu</h2>
      <AudioButtons text={phrase.en} />
      <textarea
        className="dictation"
        placeholder="Digite em inglês..."
        value={text}
        disabled={locked}
        autoFocus
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && text.trim() && !locked) {
            e.preventDefault();
            check();
          }
        }}
      />
      {score && <WordMarks score={score} />}
      <CheckBar disabled={!text.trim() || locked} onCheck={check} />
    </div>
  );
}

function WordMarks({ score }: { score: Score }) {
  return (
    <div className="word-marks">
      {score.words.map((w, i) => (
        <span key={i} className={w.ok ? "ok" : "miss"}>
          {w.word}
        </span>
      ))}
    </div>
  );
}

const MAX_TRIES = 3;

/** Shared microphone flow: record, score against targets, allow retries, report outcome. */
function useSpeaking(targets: string[], onAnswer: (o: Outcome) => void, onSpeakingTime: (s: number) => void, solution: string) {
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const [score, setScore] = useState<Score | null>(null);
  const [tries, setTries] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const handle = useRef<ListenHandle | null>(null);
  const started = useRef(0);

  useEffect(() => () => handle.current?.stop(), []);

  const start = () => {
    setError(null);
    setInterim("");
    setScore(null);
    setRecording(true);
    started.current = Date.now();
    stopSpeaking();
    handle.current = listen({
      onInterim: setInterim,
      onFinal: (alts) => {
        if (alts.length === 0) {
          setError("Não ouvi nada. Fale perto do microfone e tente de novo.");
          return;
        }
        onSpeakingTime((Date.now() - started.current) / 1000);
        const best = targets
          .map((t) => scoreSpeech(t, alts))
          .reduce((a, b) => (b.accuracy > a.accuracy ? b : a));
        setScore(best);
        const n = tries + 1;
        setTries(n);
        if (best.accuracy >= SPEAK_PASS) {
          onAnswer({ correct: true, message: best.accuracy === 1 ? "Pronúncia perfeita!" : "Muito bem, deu pra entender!", solution });
        } else if (n >= MAX_TRIES) {
          onAnswer({ correct: false, message: "Vamos praticar mais essa:", solution });
        }
      },
      onError: (e) => {
        if (e === "not-allowed" || e === "service-not-allowed") setError("Permita o uso do microfone no navegador para treinar a fala.");
        else if (e !== "no-speech" && e !== "aborted") setError(`Erro no reconhecimento de voz (${e}).`);
      },
      onEnd: () => setRecording(false),
    });
  };

  const stop = () => handle.current?.stop();
  const skip = () => onAnswer({ correct: true, skipped: true, message: "Pulado — sem perder vida.", solution });

  return { recording, interim, score, tries, error, start, stop, skip };
}

function MicPanel({ s, locked }: { s: ReturnType<typeof useSpeaking>; locked: boolean }) {
  if (!sttSupported) {
    return (
      <div className="mic-panel">
        <p className="warn">Seu navegador não tem reconhecimento de voz. Use Chrome ou Edge para treinar a fala.</p>
        {!locked && (
          <button className="btn secondary" onClick={s.skip}>
            Pular exercício
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="mic-panel">
      <button
        className={`mic ${s.recording ? "on" : ""}`}
        disabled={locked}
        onClick={s.recording ? s.stop : s.start}
        aria-label={s.recording ? "Parar" : "Falar"}
      >
        {s.recording ? <Stop size={34} weight="fill" /> : <Microphone size={40} weight="fill" />}
      </button>
      <p className="mic-label">{s.recording ? s.interim || "Ouvindo... fale agora" : s.tries ? "Toque para tentar de novo" : "Toque e fale"}</p>
      {s.score && !s.recording && (
        <div className="speech-result">
          <WordMarks score={s.score} />
          <div className="meter">
            <div style={{ width: `${Math.round(s.score.accuracy * 100)}%` }} />
          </div>
          <p className="heard">
            Entendi: <em>“{s.score.heard || "…"}”</em>
          </p>
          {!locked && s.score.accuracy < SPEAK_PASS && (
            <p className="hint">
              Tentativa {s.tries} de {MAX_TRIES}. As palavras em vermelho precisam de atenção.
            </p>
          )}
        </div>
      )}
      {s.error && <p className="warn">{s.error}</p>}
      {!locked && (
        <button className="link" onClick={s.skip}>
          Não posso falar agora
        </button>
      )}
    </div>
  );
}

function SpeakView({ phrase, mode, onAnswer, onSpeakingTime, locked }: Props & { phrase: Phrase; mode: "repeat" | "translate" }) {
  const [reveal, setReveal] = useState(mode === "repeat");
  const s = useSpeaking([phrase.en], onAnswer, onSpeakingTime, `${phrase.en} — ${phrase.pt}`);
  return (
    <div className="exercise">
      <h2>{mode === "repeat" ? "Ouça e repita em voz alta" : "Diga em inglês"}</h2>
      {mode === "repeat" ? (
        <>
          <AudioButtons text={phrase.en} />
          <p className="target-en">{phrase.en}</p>
          <p className="target-pt">{phrase.pt}</p>
        </>
      ) : (
        <>
          <p className="target-en">{phrase.pt}</p>
          {reveal ? (
            <div className="reveal">
              <AudioButtons text={phrase.en} autoplay={false} />
              <p className="target-pt">{phrase.en}</p>
            </div>
          ) : (
            <button className="link" onClick={() => setReveal(true)}>
              Mostrar dica
            </button>
          )}
        </>
      )}
      {phrase.tip && (
        <p className="tip">
          <Lightbulb size={18} weight="fill" /> {phrase.tip}
        </p>
      )}
      <MicPanel s={s} locked={locked} />
    </div>
  );
}

function Respond({ exchange, onAnswer, onSpeakingTime, locked }: Props & { exchange: Exchange }) {
  const [showPt, setShowPt] = useState(false);
  const [showModel, setShowModel] = useState(false);
  const s = useSpeaking(exchange.answers, onAnswer, onSpeakingTime, `${exchange.answers[0]} — ${exchange.answerPt}`);
  return (
    <div className="exercise">
      <h2>Responda em voz alta</h2>
      <div className="chat">
        <div className="bubble them">
          <span className="avatar">
            <Mascot size={48} />
          </span>
          <div>
            <AudioButtons text={exchange.q} />
            <p>{exchange.q}</p>
            {showPt ? (
              <p className="target-pt">{exchange.qPt}</p>
            ) : (
              <button className="link" onClick={() => setShowPt(true)}>
                Traduzir
              </button>
            )}
          </div>
        </div>
      </div>
      {showModel ? (
        <p className="tip">
          <ChatCircleDots size={18} weight="fill" /> Exemplo: <strong>{exchange.answers[0]}</strong> — {exchange.answerPt}
        </p>
      ) : (
        <button className="link" onClick={() => setShowModel(true)}>
          Ver exemplo de resposta
        </button>
      )}
      <MicPanel s={s} locked={locked} />
    </div>
  );
}

function CheckBar({ disabled, onCheck }: { disabled: boolean; onCheck(): void }) {
  return (
    <div className="check-row">
      <button className="btn primary" disabled={disabled} onClick={onCheck}>
        Verificar
      </button>
    </div>
  );
}
