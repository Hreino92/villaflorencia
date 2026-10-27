import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { login, useDB, useSession } from '../lib/store';
import { HOME } from '../components/RequireRole';
import { Field } from '../components/ui';

export default function Login() {
  const db = useDB();
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  if (session) return <Navigate to={HOME[session.role]} replace />;

  function submit(e: FormEvent) {
    e.preventDefault();
    const result = login(email, password);
    if (typeof result === 'string') {
      setError(result);
      return;
    }
    // Vuelve a la página que pedía, solo si pertenece a su rol.
    const from = (location.state as { from?: string } | null)?.from;
    navigate(from && from.startsWith(HOME[result.role]) ? from : HOME[result.role], { replace: true });
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
        <button className="btn btn-primary w-full">Entrar</button>
        <p className="text-center text-xs text-slate-400">¿Olvidaste tu contraseña? Pídele a la administración que la restablezca.</p>
      </form>
    </div>
  );
}
