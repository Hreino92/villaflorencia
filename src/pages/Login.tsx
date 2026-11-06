import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { login, resetPassword, useAuthStatus, useDB, useSession, useSetupNeeded } from '../lib/store';
import { HOME, Loading } from '../components/RequireRole';
import { Field, Veranera } from '../components/ui';
import { splitName } from '../components/Layout';

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

  const [kind, name] = splitName(db.config.name);

  return (
    <div className="min-h-screen md:grid md:grid-cols-[1.1fr_1fr]">
      <section className="relative overflow-hidden border-b border-slate-200 bg-slate-100 px-6 py-10 md:flex md:flex-col md:justify-between md:border-r md:border-b-0 md:px-14 md:py-14">
        <Veranera size={40} />
        <div className="relative mt-8 animate-rise md:mt-0">
          {kind && <p className="text-[15px] tracking-[0.2em] text-slate-500 uppercase">{kind}</p>}
          <h1 className="mt-2 text-[34px] leading-[1.05] font-semibold uppercase tracking-[0.08em] text-terracota-700 md:text-[38px] lg:text-[52px]">{name}</h1>
          <div className="mt-5 h-1.5 w-28 origin-left rounded-full bg-terracota-500 animate-[grow-x_500ms_var(--ease-out)_120ms_both]" aria-hidden="true" />
          <p className="mt-5 max-w-sm text-[16px] text-slate-600">Cuotas, recibos y visitas de la residencial, en un solo lugar.</p>
        </div>
      </section>

      <div className="flex items-center justify-center bg-slate-50 px-5 py-10">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 animate-rise">
        <h2 className="text-[22px] font-semibold tracking-tight">Entrar</h2>
        <Field label="Correo electrónico">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus required />
        </Field>
        <Field label="Contraseña">
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </Field>
        {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {info && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{info}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
        <button type="button" className="min-h-11 w-full cursor-pointer text-center text-sm font-medium text-terracota-700 hover:underline" onClick={forgot}>
          Olvidé mi contraseña
        </button>
      </form>
      </div>
    </div>
  );
}
