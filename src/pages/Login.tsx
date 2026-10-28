import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { login, resetPassword, useAuthStatus, useDB, useSession, useSetupNeeded } from '../lib/store';
import { HOME, Loading } from '../components/RequireRole';
import { Field } from '../components/ui';

export default function Login() {
  const db = useDB();
  const status = useAuthStatus();
  const session = useSession();
  const setupNeeded = useSetupNeeded();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  if (setupNeeded) return <Navigate to="/setup" replace />;
  if (session) return <Navigate to={HOME[session.role]} replace />;
  if (status === 'loading' && !busy) return <Loading />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    const result = await login(email, password);
    setBusy(false);
    if (typeof result === 'string') {
      setError(result);
      return;
    }
    // Vuelve a la página que pedía, solo si pertenece a su rol.
    const from = (location.state as { from?: string } | null)?.from;
    navigate(from && from.startsWith(HOME[result.role]) ? from : HOME[result.role], { replace: true });
  }

  async function forgot() {
    setError('');
    setInfo('');
    if (!email) {
      setError('Escribe tu correo y vuelve a presionar "Olvidé mi contraseña".');
      return;
    }
    const err = await resetPassword(email);
    if (err) setError(err);
    else setInfo('Si el correo está registrado, te llegará un enlace para crear una nueva contraseña.');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-800 to-emerald-950 p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-emerald-800">{db.config.name}</h1>
          <p className="text-sm text-slate-500">Cobros, recibos y control de visitas</p>
        </div>
        <Field label="Correo electrónico">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus required />
        </Field>
        <Field label="Contraseña">
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </Field>
        {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        {info && <p className="rounded-md bg-emerald-50 p-2 text-sm text-emerald-800">{info}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
        <button type="button" className="w-full text-center text-xs text-emerald-700 hover:underline" onClick={forgot}>
          Olvidé mi contraseña
        </button>
      </form>
    </div>
  );
}
