// Small shared UI pieces: icon buttons, the listen/slow pair, confirmations and centered screens.

import { useState, type ReactNode } from "react";
import { ChatCircleDots, Headphones, Microphone, PersonSimpleWalk, SpeakerHigh } from "@phosphor-icons/react";
import type { Lesson } from "../data/course";
import { speak } from "../lib/speech";
import { Mascot, type Mood } from "./Brand";

/** A button that is only an icon; `label` is what screen readers say and the tooltip shows. */
export function IconButton({
  label,
  onClick,
  children,
  className = "",
  disabled,
}: {
  label: string;
  onClick(): void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button type="button" className={`icon-btn ${className}`} onClick={onClick} aria-label={label} title={label} disabled={disabled}>
      {children}
    </button>
  );
}

/** "Listen" and "slowly" for an English line: the pair every exercise uses. */
export function SoundButtons({ text, size = "md", onListen }: { text: string; size?: "sm" | "md" | "lg"; onListen?(): void }) {
  const icon = size === "lg" ? 34 : size === "md" ? 24 : 18;
  return (
    <div className={`sound-buttons ${size}`}>
      <button
        type="button"
        className="sound-play"
        onClick={() => {
          onListen?.();
          speak(text);
        }}
        aria-label="Ouvir"
        title="Ouvir"
      >
        <SpeakerHigh size={icon} weight="fill" />
      </button>
      <button type="button" className="sound-slow" onClick={() => speak(text, true)} aria-label="Ouvir devagar" title="Ouvir devagar">
        <PersonSimpleWalk size={Math.round(icon * 0.75)} weight="bold" />
        <span>Devagar</span>
      </button>
    </div>
  );
}

/** Each unit's three steps share one icon each, so the course reads at a glance. */
export function FocusIcon({ focus, size = 22 }: { focus: Lesson["focus"]; size?: number }) {
  if (focus === "escuta") return <Headphones size={size} weight="bold" />;
  if (focus === "fala") return <Microphone size={size} weight="bold" />;
  return <ChatCircleDots size={size} weight="bold" />;
}

/** A button that asks "are you sure?" in place before doing something hard to undo. */
export function ConfirmButton({
  children,
  question,
  confirmLabel,
  onConfirm,
  className = "",
}: {
  children: ReactNode;
  question: string;
  confirmLabel: string;
  onConfirm(): void;
  className?: string;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" className={className} onClick={() => setAsking(true)}>
        {children}
      </button>
    );
  }
  return (
    <div className="confirm" role="group" aria-label={question}>
      <span>{question}</span>
      <button type="button" className="btn small danger" onClick={onConfirm}>
        {confirmLabel}
      </button>
      <button type="button" className="btn small ghost" onClick={() => setAsking(false)}>
        Cancelar
      </button>
    </div>
  );
}

/** Full-screen centered message with the mascot: loading, results, empty states. */
export function CenterScreen({ mood = "neutral", children }: { mood?: Mood; children: ReactNode }) {
  return (
    <div className="result">
      <div className="result-card">
        <Mascot mood={mood} size={112} className="result-mascot" />
        {children}
      </div>
    </div>
  );
}
