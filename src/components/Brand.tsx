// Brand assets drawn as inline SVG: the logo (a speech bubble with a voice wave, since the app is
// about speaking) and Kiko, the parrot mascot, in a few moods. Colors come from the CSS tokens.

/** The symbol alone: speech bubble + voice wave. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="logo-mark">
      <path
        d="M12 4h24a10 10 0 0 1 10 10v14a10 10 0 0 1-10 10H22l-8.6 6.9A1.5 1.5 0 0 1 11 43.7V38A10 10 0 0 1 2 28V14A10 10 0 0 1 12 4z"
        fill="var(--primary)"
      />
      <rect x="14" y="16" width="4.5" height="10" rx="2.25" fill="var(--on-primary-soft, #fff4ec)" />
      <rect x="21.75" y="11" width="4.5" height="20" rx="2.25" fill="var(--on-primary-soft, #fff4ec)" />
      <rect x="29.5" y="14" width="4.5" height="14" rx="2.25" fill="var(--on-primary-soft, #fff4ec)" />
    </svg>
  );
}

/** Symbol + wordmark, for headers and the sign-in screen. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="logo" style={{ fontSize: size * 0.78 }}>
      <LogoMark size={size} />
      <span className="logo-word">
        Aprende<span>AI</span>
      </span>
    </span>
  );
}

export type Mood = "neutral" | "happy" | "sad" | "thinking";

/** Kiko, the parrot. Used on welcome, results, empty states and the Kids mode. */
export function Mascot({ mood = "neutral", size = 120, className = "" }: { mood?: Mood; size?: number; className?: string }) {
  const coral = "#FF6B4A";
  const coralDark = "#E2502F";
  const gold = "#FFC24B";
  const ink = "#2A1A14";
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Kiko, o papagaio" className={`mascot-svg ${className}`}>
      {/* tail feathers behind the body */}
      <path d="M50 96c-6 10-8 17-6 21 5-2 10-9 13-19z" fill="#5B8CFF" />
      <path d="M60 98c-2 10-1 17 2 20 4-4 5-11 4-20z" fill="#4ADE9A" />
      <path d="M70 96c6 10 8 17 6 21-5-2-10-9-13-19z" fill={gold} />
      {/* body and head */}
      <ellipse cx="60" cy="76" rx="29" ry="31" fill={coral} />
      <circle cx="60" cy="44" r="27" fill={coral} />
      {/* crest */}
      <path d="M52 20c-2-8 1-14 6-16-1 6 1 11 4 15z" fill={gold} />
      <path d="M60 18c2-8 7-12 12-12-3 5-4 10-5 15z" fill={coralDark} />
      {/* belly */}
      <ellipse cx="60" cy="84" rx="17" ry="19" fill="#FFD3C2" />
      {/* wings */}
      <path d="M33 66c-8 8-9 24-2 33 7-3 10-14 9-27z" fill={coralDark} />
      <path d="M87 66c8 8 9 24 2 33-7-3-10-14-9-27z" fill={coralDark} />
      {/* feet */}
      <ellipse cx="51" cy="107" rx="6" ry="3.5" fill={gold} />
      <ellipse cx="69" cy="107" rx="6" ry="3.5" fill={gold} />
      {/* cheeks */}
      <circle cx="40" cy="52" r="5" fill="#FF8FB1" opacity="0.7" />
      <circle cx="80" cy="52" r="5" fill="#FF8FB1" opacity="0.7" />
      {/* eyes */}
      {mood === "happy" ? (
        <g fill="none" stroke={ink} strokeWidth="3.5" strokeLinecap="round">
          <path d="M42 41q6-7 12 0" />
          <path d="M66 41q6-7 12 0" />
        </g>
      ) : (
        <g>
          <circle cx="48" cy="40" r="8.5" fill="#fff" />
          <circle cx="72" cy="40" r="8.5" fill="#fff" />
          <circle cx={mood === "thinking" ? 50.5 : 48.5} cy={mood === "thinking" ? 37 : 41} r="4.6" fill={ink} />
          <circle cx={mood === "thinking" ? 74.5 : 72.5} cy={mood === "thinking" ? 37 : 41} r="4.6" fill={ink} />
          <circle cx={mood === "thinking" ? 52 : 50} cy={mood === "thinking" ? 35.5 : 39.5} r="1.5" fill="#fff" />
          <circle cx={mood === "thinking" ? 76 : 74} cy={mood === "thinking" ? 35.5 : 39.5} r="1.5" fill="#fff" />
          {mood === "sad" && (
            <g fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round">
              {/* inner ends raised: a worried, not angry, look */}
              <path d="M40 31l12-4" />
              <path d="M80 31l-12-4" />
            </g>
          )}
        </g>
      )}
      {/* beak: a hooked upper beak, open in a smile when happy */}
      <path d="M52 50c0-4 4-6 8-6s8 2 8 6c0 6-4 11-8 14-4-3-8-8-8-14z" fill={gold} />
      <path d="M55 51c2 2 8 2 10 0" fill="none" stroke="#E0A030" strokeWidth="1.6" strokeLinecap="round" />
      {mood === "happy" && <path d="M55 58q5 6 10 0" fill="#B5432A" />}
    </svg>
  );
}
