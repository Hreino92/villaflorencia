import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { setupResidential, useSetupNeeded } from '../lib/store';
import { Loading } from '../components/RequireRole';
import { Field } from '../components/ui';

/** Primera vez: crea la residencial y la cuenta del primer administrador. Después ya no está disponible. */
export default function Setup() {
  const setupNeeded = useSetupNeeded();
  const navigate = useNavigate();
  const [form, setForm] = useState({ residential: 'Residencial Villa Florencia', adminName: '', email: '', password: '', confirm: '', withDemo: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (setupNeeded === null) return <Loading />;
  if (!setupNeeded && !busy) return <Navigate to="/login" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (form.password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.');
    if (form.password !== form.confirm) return setError('Las contraseñas no coinciden.');
    setBusy(true);
    setError('');
    const err = await setupResidential(form);
    if (err) {
      setBusy(false);
      setError(err);
      return;
    }
    navigate('/admin', { replace: true });
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <div className="flex min-h-screen items-center justify-center bg-emerald-900 p-4">
      <form onSubmit={submit} className="card w-full max-w-md space-y-4">
        <div>
          <h1 className="text-xl font-bold text-emerald-800">Configuración inicial</h1>
          <p className="text-sm text-slate-500">Crea la residencial y la cuenta del administrador principal. Este paso solo se hace una vez.</p>
        </div>
        <Field label="Nombre de la residencial"><input className="input" value={form.residential} onChange={set('residential')} required /></Field>
        <Field label="Tu nombre"><input className="input" value={form.adminName} onChange={set('adminName')} required /></Field>
        <Field label="Tu correo (será tu usuario)"><input className="input" type="email" value={form.email} onChange={set('email')} autoComplete="username" required /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Contraseña"><input className="input" type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required /></Field>
          <Field label="Repetir contraseña"><input className="input" type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" required /></Field>
        </div>
        <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm">
          <input type="checkbox" className="mt-1" checked={form.withDemo} onChange={set('withDemo')} />
          <span>
            <b>Cargar datos de ejemplo</b> (24 casas ficticias con pagos y visitas) para probar la app.
            Déjalo sin marcar si vas a registrar las casas reales.
          </span>
        </label>
        {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Creando…' : 'Crear residencial'}</button>
      </form>
    </div>
  );
}
