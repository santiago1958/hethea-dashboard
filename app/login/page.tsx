import { signIn } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="hethea-login">
      <div className="login-wrap">
        <div className="login-image" aria-hidden="true" />
        <form action={signIn} className="login-box">
          <div className="login-brand">
            <h1 className="login-title">HETHEA</h1>
            <div className="login-sub">Portal Financiero Privado</div>
          </div>

          <div className="login-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="login-input"
              placeholder="usuario@hethea.com"
            />
          </div>

          <div className="login-field">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="login-input"
              placeholder="••••••••"
            />
          </div>

          <button type="submit" className="login-btn">
            Acceder
          </button>

          {error && <div className="login-error">{error}</div>}
        </form>
      </div>
    </div>
  );
}
