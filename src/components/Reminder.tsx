import { useState } from "react";
import { BellRinging } from "@phosphor-icons/react";
import { REMINDER_HOUR } from "../data/push";
import { disableReminders, enableReminders, pushState, type PushState } from "../lib/push";

/** Home card to turn the daily streak reminder on or off, with install steps on iPhone. */
export function ReminderCard({
  lastDay,
  streak,
  hideWhenOn = false,
}: {
  lastDay: string | null;
  streak: number;
  /** On the home screen the card only invites; once on, it is managed from the account menu. */
  hideWhenOn?: boolean;
}) {
  const [state, setState] = useState<PushState>(pushState);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (state === "unsupported" || (hideWhenOn && state === "on")) return null;

  const toggle = async () => {
    setBusy(true);
    setFailed(false);
    try {
      setState(state === "on" ? await disableReminders() : await enableReminders(lastDay, streak));
    } catch {
      setFailed(true);
    }
    setBusy(false);
  };

  const text: Record<Exclude<PushState, "unsupported">, string> = {
    install:
      "No iPhone, o lembrete só funciona com o app na Tela de Início: toque em Compartilhar (□↑), depois em “Adicionar à Tela de Início”. Abra pelo ícone novo e ative aqui.",
    denied: "As notificações estão bloqueadas para este app. Libere nos ajustes do navegador ou do iPhone para receber o lembrete.",
    off: `Receba um aviso às ${REMINDER_HOUR}h nos dias em que ainda não estudou, para não perder a ofensiva.`,
    on: `Ativo: você recebe um aviso às ${REMINDER_HOUR}h se ainda não tiver estudado no dia.`,
  };

  return (
    <div className="card reminder-card">
      <div>
        <span className="eyebrow with-icon">
          <BellRinging size={16} weight="fill" /> Lembrete diário
        </span>
        <p className="hint small">{text[state]}</p>
        {failed && <p className="warn small">Não consegui ativar agora. Tente de novo em instantes.</p>}
      </div>
      {(state === "off" || state === "on") && (
        <button className={`btn ${state === "on" ? "secondary" : "primary"}`} onClick={toggle} disabled={busy}>
          {busy ? "…" : state === "on" ? "Desativar" : "Ativar"}
        </button>
      )}
    </div>
  );
}
