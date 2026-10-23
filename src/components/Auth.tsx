import { useState, type FormEvent } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import { sendPasswordReset, signIn, signInWithGoogle, signUp, updatePassword } from "../lib/account";
import { Logo, Mascot } from "./Brand";

type Tab = "signin" | "signup";

/** Google's "G", in its brand colors (required by Google's sign-in branding rules). */
function GoogleG() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** Password field with a visible label and a show/hide toggle. */
function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange(v: string): void;
  autoComplete: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <label className="field">
      <span>{label}</span>
      <span className="field-row">
        <input type={shown ? "text" : "password"} autoComplete={autoComplete} minLength={6} value={value} onChange={(e) => onChange(e.target.value)} required />
        <button type="button" className="field-toggle" onClick={() => setShown(!shown)} aria-label={shown ? "Esconder senha" : "Mostrar senha"}>
          {shown ? <EyeSlash size={20} /> : <Eye size={20} />}
        </button>
      </span>
    </label>
  );
}

/** Sign in or create an account (e-mail and password). Progress already on this device goes to the account. */
export function AuthScreen() {
  const [tab, setTab] = useState<Tab>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const result = tab === "signin" ? await signIn(email.trim(), password) : await signUp(email.trim(), password);
    setBusy(false);
    if (!result.ok) setError(result.error);
    else if (result.needsConfirmation) {
      setInfo(`Enviamos um link de confirmação para ${email.trim()}. Abra o e-mail, toque no link e depois entre aqui.`);
      setTab("signin");
    }
    // On success the session listener in App takes over.
  };

  const forgot = async () => {
    if (!email.trim()) return setError("Digite seu e-mail acima e toque de novo em “Esqueci minha senha”.");
    setBusy(true);
    setError(null);
    const result = await sendPasswordReset(email.trim());
    setBusy(false);
    if (result.ok) setInfo(`Se existir uma conta com ${email.trim()}, enviamos um link para criar uma nova senha.`);
    else setError(result.error);
  };

  return (
    <div className="auth">
      <section className="auth-hero">
        <Logo size={30} />
        <Mascot mood="happy" size={132} className="auth-mascot" />
        <h1>Fale inglês de verdade, com quem nunca cansa de ouvir.</h1>
        <p>Converse em voz alta com uma IA, receba correção na hora e treine a pronúncia que mais trava brasileiros.</p>
      </section>

      <section className="auth-panel">
        <button
          className="btn google block"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const result = await signInWithGoogle();
            // On success the browser is already on its way to Google.
            if (!result.ok) {
              setError(result.error);
              setBusy(false);
            }
          }}
        >
          <GoogleG /> Continuar com Google
        </button>
        <div className="auth-or">
          <span>ou com e-mail</span>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Entrar ou criar conta">
          <button role="tab" aria-selected={tab === "signup"} className={tab === "signup" ? "on" : ""} onClick={() => setTab("signup")}>
            Criar conta
          </button>
          <button role="tab" aria-selected={tab === "signin"} className={tab === "signin" ? "on" : ""} onClick={() => setTab("signin")}>
            Já tenho conta
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label className="field">
            <span>E-mail</span>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <PasswordField
            label={tab === "signin" ? "Senha" : "Crie uma senha (6 ou mais caracteres)"}
            value={password}
            onChange={setPassword}
            autoComplete={tab === "signin" ? "current-password" : "new-password"}
          />
          {error && (
            <p className="warn" role="alert">
              {error}
            </p>
          )}
          {info && (
            <p className="auth-info" role="status">
              {info}
            </p>
          )}
          <button className="btn primary block lg" disabled={busy}>
            {busy ? "Um instante…" : tab === "signin" ? "Entrar" : "Criar conta grátis"}
          </button>
        </form>

        {tab === "signin" ? (
          <button className="link" onClick={forgot} disabled={busy}>
            Esqueci minha senha
          </button>
        ) : (
          <p className="hint small">Se você já usava o app neste aparelho, seu progresso vai junto para a conta.</p>
        )}
      </section>
    </div>
  );
}

/** Shown after opening the "new password" link from the e-mail. */
export function NewPasswordScreen({ onDone }: { onDone(): void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const result = await updatePassword(password);
    setBusy(false);
    if (result.ok) onDone();
    else setError(result.error);
  };

  return (
    <div className="auth">
      <section className="auth-hero">
        <Logo size={30} />
        <Mascot mood="thinking" size={120} className="auth-mascot" />
        <h1>Crie uma senha nova.</h1>
      </section>
      <section className="auth-panel">
        <form className="auth-form" onSubmit={submit}>
          <PasswordField label="Nova senha (6 ou mais caracteres)" value={password} onChange={setPassword} autoComplete="new-password" />
          {error && (
            <p className="warn" role="alert">
              {error}
            </p>
          )}
          <button className="btn primary block lg" disabled={busy}>
            {busy ? "Um instante…" : "Salvar senha"}
          </button>
        </form>
      </section>
    </div>
  );
}
