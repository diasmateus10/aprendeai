import { useState, type FormEvent } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import { sendPasswordReset, signIn, signUp, updatePassword } from "../lib/account";
import { Logo, Mascot } from "./Brand";

type Tab = "signin" | "signup";

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
