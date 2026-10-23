import { useState, type FormEvent } from "react";
import { sendPasswordReset, signIn, signUp, updatePassword } from "../lib/account";

type Tab = "signin" | "signup";

/** Sign in or create an account (e-mail and password). Progress already on this device goes to the account. */
export function AuthScreen() {
  const [tab, setTab] = useState<Tab>("signin");
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
    <div className="result">
      <div className="result-card auth-card">
        <div className="mascot big">🦜</div>
        <h1>AprendeAI</h1>
        <p className="hint">Entre para salvar seu progresso e continuar em qualquer aparelho.</p>

        <div className="auth-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "signin"} className={tab === "signin" ? "on" : ""} onClick={() => setTab("signin")}>
            Entrar
          </button>
          <button role="tab" aria-selected={tab === "signup"} className={tab === "signup" ? "on" : ""} onClick={() => setTab("signup")}>
            Criar conta
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <input type="email" autoComplete="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input
            type="password"
            autoComplete={tab === "signin" ? "current-password" : "new-password"}
            placeholder={tab === "signin" ? "Senha" : "Crie uma senha (mínimo 6 caracteres)"}
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="warn">{error}</p>}
          {info && <p className="auth-info">{info}</p>}
          <button className="btn primary block" disabled={busy}>
            {busy ? "Aguarde…" : tab === "signin" ? "Entrar" : "Criar conta"}
          </button>
        </form>

        {tab === "signin" ? (
          <button className="link" onClick={forgot} disabled={busy}>
            Esqueci minha senha
          </button>
        ) : (
          <p className="hint small">O progresso que já está neste aparelho vai junto para a sua conta nova.</p>
        )}
      </div>
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
    <div className="result">
      <div className="result-card auth-card">
        <div className="mascot big">🔑</div>
        <h1>Nova senha</h1>
        <form className="auth-form" onSubmit={submit}>
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Nova senha (mínimo 6 caracteres)"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="warn">{error}</p>}
          <button className="btn primary block" disabled={busy}>
            {busy ? "Aguarde…" : "Salvar senha"}
          </button>
        </form>
      </div>
    </div>
  );
}
