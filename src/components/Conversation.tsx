import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Keyboard, NotePencil, PersonSimpleWalk, SpeakerHigh, Timer, X } from "@phosphor-icons/react";
import { SESSION_SECONDS, TOPICS, type Topic } from "../data/topics";
import { ACCENTS, CORRECTIONS, LENGTHS, PERSONAS, type AiStyle, type Option } from "../data/aiStyle";
import { VoicePicker } from "./VoicePicker";
import { imageFor } from "../data/vocab";
import { authHeaders } from "../lib/account";
import { PAYWALL_MARK } from "../data/plans";
import type { Level } from "../lib/progress";
import { isIOS, listen, usingServerVoice, speak, speechLog, stopSpeaking, sttSupported, type ListenHandle } from "../lib/speech";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

/** Splits the partner's reply into the spoken part and the optional Portuguese correction line, wherever it sits. */
function splitTip(text: string): { said: string; tip: string | null } {
  const clean = text.replace(/\*/g, "");
  const i = clean.indexOf("💡");
  if (i === -1) return { said: clean.trim(), tip: null };
  const end = clean.indexOf("\n", i);
  const tip = (end === -1 ? clean.slice(i) : clean.slice(i, end)).trim();
  const said = (clean.slice(0, i) + (end === -1 ? "" : clean.slice(end))).replace(/\n{2,}/g, "\n").trim();
  return { said, tip };
}

async function streamChat(
  body: { topic: string; level: string; mode: "chat" | "feedback"; messages: Turn[]; style: AiStyle; age?: string; sessionId: string },
  onText: (soFar: string) => void,
  signal: AbortSignal,
): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.body) throw new Error(await res.text());
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onText(text);
  }
  return text;
}

function OptionRow<T extends string>({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: Option<T>[];
  value: T;
  onChange(v: T): void;
}) {
  return (
    <div className="style-row">
      <div className="card-label">{title}</div>
      <div className="style-options">
        {options.map((o) => (
          <button key={o.id} className={`style-chip ${o.id === value ? "on" : ""}`} onClick={() => onChange(o.id)} title={o.description}>
            {o.label}
          </button>
        ))}
      </div>
      <p className="hint small">{options.find((o) => o.id === value)?.description}</p>
    </div>
  );
}

export function TopicPicker({
  style,
  onStyle,
  voiceName,
  onVoice,
  onPick,
  onExit,
}: {
  style: AiStyle;
  onStyle(s: AiStyle): void;
  voiceName: string | null;
  onVoice(name: string | null): void;
  onPick(t: Topic): void;
  onExit(): void;
}) {
  const persona = PERSONAS.find((p) => p.id === style.persona)!;
  return (
    <div className="page">
      <header className="page-top">
        <button className="close" onClick={onExit} aria-label="Voltar">
          <ArrowLeft size={22} weight="bold" />
        </button>
        <h1>Conversa com IA</h1>
      </header>
      <p className="hint">Escolha como a IA fala com você e um tema. A conversa dura até 5 minutos, com voz.</p>
      {isIOS && !usingServerVoice() && <p className="hint small">No iPhone, tire do modo silencioso (chave na lateral) para ouvir a IA.</p>}

      <details className="card style-card">
        <summary>
          <span className="card-label">Estilo da IA</span>
          <strong>
            {persona.label} · {LENGTHS.find((l) => l.id === style.length)!.label} · {ACCENTS.find((a) => a.id === style.accent)!.label}
          </strong>
          <span className="link">Alterar</span>
        </summary>
        <OptionRow title="Personalidade" options={PERSONAS} value={style.persona} onChange={(persona) => onStyle({ ...style, persona })} />
        <OptionRow title="Correções" options={CORRECTIONS} value={style.corrections} onChange={(corrections) => onStyle({ ...style, corrections })} />
        <OptionRow title="Tamanho das respostas" options={LENGTHS} value={style.length} onChange={(length) => onStyle({ ...style, length })} />
        <OptionRow title="Sotaque" options={ACCENTS} value={style.accent} onChange={(accent) => onStyle({ ...style, accent })} />
        <VoicePicker value={voiceName} onChange={onVoice} />
        {style.persona === "unfiltered" && (
          <p className="hint small">
            “Sem filtro” usa gírias e palavrões leves, como nativos falam no dia a dia. Os filtros de segurança do Google continuam ativos.
          </p>
        )}
      </details>

      <h2 className="section-title">Tema</h2>
      <div className="topic-grid">
        {TOPICS.map((t) => (
          <button key={t.id} className="topic" onClick={() => onPick(t)}>
            <img className="topic-pic" src={imageFor(t.emoji)} alt="" width={44} height={44} />
            <strong>{t.title}</strong>
            <span>{t.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}


type Phase = "idle" | "listening" | "thinking" | "speaking";

/** Recognition errors that listening again won't fix, so the hands-free loop pauses. */
const MIC_FATAL: Record<string, string> = {
  "not-allowed": "Permita o uso do microfone no navegador.",
  "service-not-allowed": "Permita o uso do microfone no navegador.",
  "audio-capture": "Nenhum microfone encontrado.",
  network: "O reconhecimento de voz precisa de internet.",
};

/** Released sooner than this: the learner tapped instead of holding the orb. */
const SHORT_PRESS_MS = 400;

const debug = typeof location !== "undefined" && location.search.includes("debug");

export function Conversation({
  topic,
  level,
  style,
  onExit,
  onFinish,
  seconds = SESSION_SECONDS,
  age,
  onUpgrade,
}: {
  topic: Topic;
  level: Level;
  style: AiStyle;
  onExit(): void;
  onFinish(seconds: number, userTurns: number): void;
  /** Session length; the Kids mode uses a shorter one. */
  seconds?: number;
  /** Kids mode age band, so the mascot talks at the child's level. */
  age?: string;
  /** Opens the plans screen when the free daily conversation is used up. */
  onUpgrade?(): void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [left, setLeft] = useState(seconds);
  const [phase, setPhaseState] = useState<Phase>("thinking");
  // Push-to-talk: the mic listens while the orb is held and the answer goes when it's released. Opened
  // from the press itself, it works on the iPhone, where a mic opened on its own (hands-free) heard nothing.
  const [holding, setHolding] = useState(false);
  const [interim, setInterim] = useState("");
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(!sttSupported);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const ended = left <= 0 || feedback !== null;
  const abort = useRef(new AbortController());
  /** Groups this conversation's messages in the learner's history on the server. */
  const sessionId = useRef(crypto.randomUUID());
  const mic = useRef<ListenHandle | null>(null);
  const started = useRef(Date.now());
  const bottom = useRef<HTMLDivElement>(null);

  // Mic and voice callbacks outlive the render they were created in, so they read refs.
  const phaseRef = useRef<Phase>("thinking");
  const turnsRef = useRef(turns);
  const endedRef = useRef(ended);
  turnsRef.current = turns;
  endedRef.current = ended;
  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  /** When the orb was pressed, to tell a tap from a hold. */
  const pressedAt = useRef(0);
  /** Bumped whenever a line is spoken or interrupted, so a stale say() doesn't reopen the mic. */
  const sayId = useRef(0);

  // Last history sent, so a failed reply (e.g. the API is busy) can be retried as-is.
  const lastSent = useRef<Turn[]>([]);

  /** Closes the mic without sending what it heard; its pending callbacks are ignored. */
  const stopMic = () => {
    const m = mic.current;
    mic.current = null;
    m?.abort();
    setInterim("");
  };

  const startListening = () => {
    if (!sttSupported || endedRef.current || mic.current) return;
    setInterim("");
    setMicError(null);
    setPhase("listening");
    let heard = false;
    const handle: ListenHandle = listen(
      {
        onInterim: (t) => mic.current === handle && setInterim(t),
        onFinal: (alts) => {
          const said = alts.find((a) => a.trim());
          if (mic.current !== handle || !said) return;
          heard = true;
          mic.current = null;
          submit(said);
        },
        onError: (e) => {
          if (mic.current !== handle || !MIC_FATAL[e]) return;
          setMicError(MIC_FATAL[e]);
        },
        onEnd: () => {
          if (mic.current !== handle) return;
          mic.current = null;
          setInterim("");
          setHolding(false);
          setPhase("idle");
          if (heard || endedRef.current) return;
          setMicError(
            Date.now() - pressedAt.current < SHORT_PRESS_MS
              ? "Segure a bolinha enquanto fala e solte quando terminar."
              : "Não ouvi nada. Segure a bolinha, fale e solte.",
          );
        },
      },
      { hold: true },
    );
    mic.current = handle;
  };

  /** Speaks a line; the learner answers by holding the orb. */
  const say = async (text: string, slow = false) => {
    const id = ++sayId.current;
    stopMic();
    setPhase("speaking");
    await speak(text, slow);
    if (id !== sayId.current) return;
    setPhase("idle");
  };

  const send = async (history: Turn[]) => {
    lastSent.current = history;
    setError(null);
    setStreaming("");
    setPhase("thinking");
    try {
      const reply = await streamChat(
        { topic: topic.id, level, mode: "chat", messages: history, style, age, sessionId: sessionId.current },
        (t) => setStreaming(t),
        abort.current.signal,
      );
      setStreaming(null);
      if (reply.includes("⚠️")) {
        setError(reply.slice(reply.indexOf("⚠️")));
        setPhase("idle");
        return;
      }
      const next = [...history, { role: "assistant" as const, content: reply }];
      turnsRef.current = next;
      setTurns(next);
      if (endedRef.current) setPhase("idle");
      else say(splitTip(reply).said);
    } catch (e) {
      setStreaming(null);
      setPhase("idle");
      if ((e as Error).name !== "AbortError") setError("A conversa caiu por um instante. Toque em “Tentar de novo”.");
    }
  };

  // Partner opens the conversation.
  useEffect(() => {
    // Fresh controller per mount: React StrictMode mounts twice in dev and the first one is aborted.
    const ctrl = new AbortController();
    abort.current = ctrl;
    send([]);
    return () => {
      ctrl.abort();
      sayId.current++;
      stopMic();
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ended) return;
    const t = setInterval(() => setLeft(seconds - Math.floor((Date.now() - started.current) / 1000)), 500);
    return () => clearInterval(t);
  }, [ended]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, streaming, feedback, interim]);

  const finish = async () => {
    sayId.current++;
    stopMic();
    stopSpeaking();
    setPhase("idle");
    setLeft(0);
    setFeedback("");
    const spent = Math.min(seconds, Math.round((Date.now() - started.current) / 1000));
    onFinish(spent, turns.filter((t) => t.role === "user").length);
    try {
      await streamChat({ topic: topic.id, level, mode: "feedback", messages: turns, style, age, sessionId: sessionId.current }, (t) => setFeedback(t), abort.current.signal);
    } catch {
      setFeedback("Não foi possível gerar o feedback agora.");
    }
  };

  // Time's up: wrap the session and ask for feedback once.
  useEffect(() => {
    if (left <= 0 && feedback === null) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  const submit = (text: string) => {
    const clean = text.trim();
    if (!clean || endedRef.current || phaseRef.current === "thinking") return;
    sayId.current++;
    stopMic();
    stopSpeaking();
    setDraft("");
    const history = [...turnsRef.current, { role: "user" as const, content: clean }];
    turnsRef.current = history;
    setTurns(history);
    send(history);
  };

  /** Pressing the orb cuts the partner off and opens the mic, inside the press (the iPhone needs that). */
  const pressOrb = () => {
    if (ended || phase === "thinking" || mic.current) return;
    pressedAt.current = Date.now();
    sayId.current++;
    stopSpeaking();
    setHolding(true);
    setPhase("idle");
    startListening();
  };

  /** Letting go sends what was heard. */
  const releaseOrb = () => {
    if (!holding) return;
    setHolding(false);
    mic.current?.stop();
  };

  /** Replays a message; the mic stays closed meanwhile so it doesn't hear the partner's voice. */
  const replay = (text: string, slow = false) => {
    if (phase === "thinking") speak(text, slow);
    else say(text, slow);
  };

  const mm = Math.max(left, 0);
  const clock = `${Math.floor(mm / 60)}:${String(mm % 60).padStart(2, "0")}`;
  const orbLabel = {
    listening: holding ? "Ouvindo… solte para enviar" : "Enviando…",
    thinking: "Pensando…",
    speaking: "Falando… segure a bolinha para responder",
    idle: "Segure a bolinha enquanto fala",
  }[phase];

  return (
    <div className="lesson convo">
      <header className="lesson-top">
        <button className="close" onClick={onExit} aria-label="Sair">
          <X size={22} weight="bold" />
        </button>
        <div className="convo-title">
          <img className="convo-pic" src={imageFor(topic.emoji)} alt="" width={24} height={24} /> {topic.title}
        </div>
        <span className={`timer ${left <= 30 && !ended ? "low" : ""}`}><Timer size={18} weight="bold" /> {clock}</span>
      </header>
      <div className="bar thin">
        <div style={{ width: `${(1 - Math.max(left, 0) / seconds) * 100}%` }} />
      </div>

      <main className="convo-body">
        {turns.map((t, i) => {
          if (t.role === "user") {
            return (
              <div key={i} className="msg me">
                {t.content}
              </div>
            );
          }
          const { said, tip } = splitTip(t.content);
          return (
            <div key={i} className="msg ai">
              <p>{said}</p>
              <div className="msg-tools">
                <button className="mini" onClick={() => replay(said)} aria-label="Ouvir de novo">
                  <SpeakerHigh size={18} weight="fill" />
                </button>
                <button className="mini slow" onClick={() => replay(said, true)} aria-label="Ouvir devagar">
                  <PersonSimpleWalk size={16} weight="bold" /> Devagar
                </button>
              </div>
              {tip && <p className="msg-tip">{tip}</p>}
            </div>
          );
        })}
        {streaming !== null && <div className="msg ai typing">{splitTip(streaming).said || "…"}</div>}
        {phase === "listening" && interim && <div className="msg me interim">{interim}</div>}
        {error && (
          <div className="retry">
            <p className="warn">{error.replace(PAYWALL_MARK, "").replace(/\s+/g, " ")}</p>
            {error.includes(PAYWALL_MARK) ? (
              onUpgrade && (
                <button className="btn primary" onClick={onUpgrade}>
                  Ver o Premium
                </button>
              )
            ) : (
              !ended && (
                <button className="btn secondary" onClick={() => send(lastSent.current)}>
                  Tentar de novo
                </button>
              )
            )}
          </div>
        )}
        {feedback !== null && (
          <div className="feedback-card">
            <h2>
              <NotePencil size={22} weight="duotone" /> Como você foi
            </h2>
            {feedback ? (
              feedback
                .split("\n")
                .filter(Boolean)
                .map((line, i) => {
                  const [label, ...rest] = line.split(":");
                  return rest.length ? (
                    <p key={i}>
                      <strong>{label}:</strong>
                      {rest.join(":")}
                    </p>
                  ) : (
                    <p key={i}>{line}</p>
                  );
                })
            ) : (
              <p className="hint">Analisando sua conversa…</p>
            )}
            <button className="btn primary" onClick={onExit}>
              Concluir
            </button>
          </div>
        )}
        {debug && (
          <pre className="hint small" style={{ whiteSpace: "pre-wrap", userSelect: "text" }}>
            {`${navigator.userAgent}\nphase=${phase} holding=${holding}\n${speechLog.join("\n")}`}
          </pre>
        )}
        <div ref={bottom} />
      </main>

      {!ended && !error?.includes(PAYWALL_MARK) && (
        <footer className="convo-footer">
          {sttSupported && (
            <div className="orb-panel">
              <button
                className={`orb ${phase} ${holding ? "live" : ""}`}
                onPointerDown={(e) => {
                  // Keeps the release on the orb even if the finger slides off it.
                  e.currentTarget.setPointerCapture(e.pointerId);
                  pressOrb();
                }}
                onPointerUp={releaseOrb}
                onPointerCancel={releaseOrb}
                onKeyDown={(e) => (e.key === " " || e.key === "Enter") && !e.repeat && (e.preventDefault(), pressOrb())}
                onKeyUp={(e) => (e.key === " " || e.key === "Enter") && releaseOrb()}
                onContextMenu={(e) => e.preventDefault()}
                disabled={phase === "thinking"}
                aria-label={orbLabel}
              >
                <span className="orb-core" />
              </button>
              <p className={`orb-label ${micError ? "warn" : ""}`}>{micError ?? orbLabel}</p>
            </div>
          )}
          {typing && (
            <div className="convo-input">
              <input
                value={draft}
                placeholder="Digite em inglês…"
                aria-label="Sua resposta em inglês"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit(draft)}
              />
              <button className="btn primary" disabled={!draft.trim() || streaming !== null} onClick={() => submit(draft)}>
                Enviar
              </button>
            </div>
          )}
          <div className="convo-actions">
            {sttSupported && (
              <button className="link" onClick={() => setTyping(!typing)}>
                {typing ? (
                  "Esconder teclado"
                ) : (
                  <>
                    <Keyboard size={18} weight="bold" /> Digitar
                  </>
                )}
              </button>
            )}
            <button className="link" onClick={finish}>
              Encerrar
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
