import { useEffect, useState } from "react";
import { englishVoices, isNaturalVoice, onVoicesChanged, speak, ttsSupported } from "../lib/speech";

const SAMPLE = "Hi! This is how I sound. Let's practice English together.";
const MAX_SHOWN = 10;

/** Lists the device's English voices, most natural first, and plays a sample when one is picked. */
export function VoicePicker({ value, onChange }: { value: string | null; onChange(name: string | null): void }) {
  const [voices, setVoices] = useState(englishVoices);

  useEffect(() => onVoicesChanged(() => setVoices(englishVoices())), []);

  if (!ttsSupported) return null;

  const pick = (name: string | null) => {
    onChange(name);
    // The parent applies the choice before the next render; wait a tick so the sample uses it.
    setTimeout(() => speak(SAMPLE), 50);
  };

  const shown = voices.slice(0, MAX_SHOWN);
  const hasNatural = voices.some(isNaturalVoice);

  return (
    <div className="style-row">
      <div className="card-label">Voz</div>
      <div className="style-options">
        <button className={`style-chip ${value === null ? "on" : ""}`} onClick={() => pick(null)}>
          ✨ Automática
        </button>
        {shown.map((v) => (
          <button
            key={v.name}
            className={`style-chip ${value === v.name ? "on" : ""}`}
            onClick={() => pick(v.name)}
            title={`${v.name} (${v.lang})`}
          >
            {isNaturalVoice(v) ? "🌟 " : ""}
            {shortName(v.name)} <span className="voice-lang">{v.lang.replace("_", "-").slice(3)}</span>
          </button>
        ))}
      </div>
      <p className="hint small">
        Toque numa voz para ouvir. 🌟 = soa mais natural. A voz vale para o app todo.
        {!hasNatural && voices.length > 0 && <> {voiceTip()}</>}
        {voices.length === 0 && " Nenhuma voz em inglês encontrada neste aparelho."}
      </p>
    </div>
  );
}

/** "Microsoft Aria Online (Natural) - English (United States)" → "Aria (Natural)". */
function shortName(name: string): string {
  return name
    .replace(/^(Microsoft|Google|Apple)\s+/i, "")
    .replace(/\s+-\s+English.*$/i, "")
    .replace(/\s*Online\s*/i, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Where to get natural voices on this device, since only robotic ones were found. */
function voiceTip(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|Mac/i.test(ua)) {
    return "Para vozes mais naturais no iPhone: Ajustes → Acessibilidade → Conteúdo Falado → Vozes → Inglês, e baixe uma voz “Melhorada” ou “Premium”.";
  }
  if (/Android/i.test(ua)) {
    return "Para vozes mais naturais no Android: Configurações → Acessibilidade → Saída de conversão de texto em voz → Google, e instale os dados de voz em inglês.";
  }
  return "Para vozes bem mais naturais no computador, abra o app no Microsoft Edge (vozes “Natural”) ou no Google Chrome.";
}
