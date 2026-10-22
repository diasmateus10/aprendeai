import { useEffect, useRef, useState } from "react";
import { SESSION_SECONDS, TOPICS, type Topic } from "../data/topics";
import { ACCENTS, CORRECTIONS, LENGTHS, PERSONAS, type AiStyle, type Option } from "../data/aiStyle";
import { VoicePicker } from "./VoicePicker";
import type { Level } from "../lib/progress";
import { listen, speak, sttSupported, type ListenHandle } from "../lib/speech";

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
  body: { topic: string; level: string; mode: "chat" | "feedback"; messages: Turn[]; style: AiStyle },
  onText: (soFar: string) => void,
  signal: AbortSignal,
): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
            <span>{o.emoji}</span> {o.label}
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
          ←
        </button>
        <h1>Conversa com IA</h1>
      </header>
      <p className="hint">Escolha como a IA fala com você e um tema. A conversa dura até 5 minutos, com voz.</p>

      <details className="card style-card">
        <summary>
          <span className="card-label">Estilo da IA</span>
          <strong>
            {persona.emoji} {persona.label} · {LENGTHS.find((l) => l.id === style.length)!.label} ·{" "}
            {ACCENTS.find((a) => a.id === style.accent)!.emoji}
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
            🔥 “Sem filtro” usa gírias e palavrões leves, como nativos falam no dia a dia. Os filtros de segurança do Google continuam ativos.
          </p>
        )}
      </details>

      <h2 className="section-title">Tema</h2>
      <div className="topic-grid">
        {TOPICS.map((t) => (
          <button key={t.id} className="topic" onClick={() => onPick(t)}>
            <span className="topic-emoji">{t.emoji}</span>
            <strong>{t.title}</strong>
            <span>{t.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function Conversation({
  topic,
  level,
  style,
  onExit,
  onFinish,
}: {
  topic: Topic;
  level: Level;
  style: AiStyle;
  onExit(): void;
  onFinish(seconds: number, userTurns: number): void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [left, setLeft] = useState(SESSION_SECONDS);
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ended = left <= 0 || feedback !== null;
  const abort = useRef(new AbortController());
  const mic = useRef<ListenHandle | null>(null);
  const started = useRef(Date.now());
  const bottom = useRef<HTMLDivElement>(null);

  // Last history sent, so a failed reply (e.g. Gemini's free tier is busy) can be retried as-is.
  const lastSent = useRef<Turn[]>([]);

  const send = async (history: Turn[]) => {
    lastSent.current = history;
    setError(null);
    setStreaming("");
    try {
      const reply = await streamChat(
        { topic: topic.id, level, mode: "chat", messages: history, style },
        (t) => setStreaming(t),
        abort.current.signal,
      );
      setStreaming(null);
      if (reply.includes("⚠️")) {
        setError(reply.slice(reply.indexOf("⚠️")));
        return;
      }
      setTurns([...history, { role: "assistant", content: reply }]);
      speak(splitTip(reply).said);
    } catch (e) {
      setStreaming(null);
      if ((e as Error).name !== "AbortError") setError("Não consegui conectar com a IA. Verifique se o servidor está rodando.");
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
      mic.current?.stop();
      window.speechSynthesis?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ended) return;
    const t = setInterval(() => setLeft(SESSION_SECONDS - Math.floor((Date.now() - started.current) / 1000)), 500);
    return () => clearInterval(t);
  }, [ended]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, streaming, feedback]);

  const finish = async () => {
    mic.current?.stop();
    window.speechSynthesis?.cancel();
    setLeft(0);
    setFeedback("");
    const seconds = Math.min(SESSION_SECONDS, Math.round((Date.now() - started.current) / 1000));
    onFinish(seconds, turns.filter((t) => t.role === "user").length);
    try {
      await streamChat({ topic: topic.id, level, mode: "feedback", messages: turns, style }, (t) => setFeedback(t), abort.current.signal);
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
    if (!clean || streaming !== null || ended) return;
    setDraft("");
    const history = [...turns, { role: "user" as const, content: clean }];
    setTurns(history);
    send(history);
  };

  const toggleMic = () => {
    if (recording) {
      mic.current?.stop();
      return;
    }
    window.speechSynthesis?.cancel();
    setInterim("");
    setRecording(true);
    mic.current = listen({
      onInterim: setInterim,
      onFinal: (alts) => alts[0] && submit(alts[0]),
      onError: (e) => {
        if (e === "not-allowed" || e === "service-not-allowed") setError("Permita o uso do microfone no navegador.");
      },
      onEnd: () => {
        setRecording(false);
        setInterim("");
      },
    });
  };

  const mm = Math.max(left, 0);
  const clock = `${Math.floor(mm / 60)}:${String(mm % 60).padStart(2, "0")}`;

  return (
    <div className="lesson convo">
      <header className="lesson-top">
        <button className="close" onClick={onExit} aria-label="Sair">
          ✕
        </button>
        <div className="convo-title">
          <span>{topic.emoji}</span> {topic.title}
        </div>
        <span className={`timer ${left <= 30 && !ended ? "low" : ""}`}>⏱ {clock}</span>
      </header>
      <div className="bar thin">
        <div style={{ width: `${(1 - Math.max(left, 0) / SESSION_SECONDS) * 100}%` }} />
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
                <button className="mini" onClick={() => speak(said)} aria-label="Ouvir">
                  🔊
                </button>
                <button className="mini" onClick={() => speak(said, true)} aria-label="Ouvir devagar">
                  🐢
                </button>
              </div>
              {tip && <p className="msg-tip">{tip}</p>}
            </div>
          );
        })}
        {streaming !== null && <div className="msg ai typing">{splitTip(streaming).said || "…"}</div>}
        {recording && <div className="msg me interim">{interim || "Ouvindo…"}</div>}
        {error && (
          <div className="retry">
            <p className="warn">{error}</p>
            {!ended && (
              <button className="btn secondary" onClick={() => send(lastSent.current)}>
                Tentar de novo
              </button>
            )}
          </div>
        )}
        {feedback !== null && (
          <div className="feedback-card">
            <h2>📝 Feedback da conversa</h2>
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
        <div ref={bottom} />
      </main>

      {!ended && (
        <footer className="convo-input">
          {sttSupported && (
            <button className={`mic small ${recording ? "on" : ""}`} onClick={toggleMic} disabled={streaming !== null} aria-label="Falar">
              {recording ? "■" : "🎤"}
            </button>
          )}
          <input
            value={draft}
            placeholder={sttSupported ? "Fale ou digite em inglês…" : "Digite em inglês…"}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit(draft)}
          />
          <button className="btn primary" disabled={!draft.trim() || streaming !== null} onClick={() => submit(draft)}>
            Enviar
          </button>
          <button className="link" onClick={finish}>
            Encerrar
          </button>
        </footer>
      )}
    </div>
  );
}
