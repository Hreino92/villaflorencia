import { useRef, useState } from 'react';
import { update, useDB, useSession, useToday } from '../../lib/store';
import { houseLabel } from '../../lib/billing';
import { fmtDate } from '../../lib/dates';
import type { Visit } from '../../lib/types';

type Result =
  | { kind: 'ok'; visit: Visit }
  | { kind: 'used'; visit: Visit }
  | { kind: 'wrongDate'; visit: Visit }
  | { kind: 'notFound'; code: string };

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function Gate() {
  const db = useDB();
  const today = useToday();
  const session = useSession()!;
  const [code, setCode] = useState('');
  const [search, setSearch] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const todays = db.visits.filter((v) => v.date === today).sort((a, b) => Number(!!a.enteredAt) - Number(!!b.enteredAt) || a.visitorName.localeCompare(b.visitorName));
  const term = normalize(search.trim());
  const found = term ? todays.filter((v) => normalize(v.visitorName).includes(term) || v.dui.replace(/\D/g, '').includes(term.replace(/\D/g, '') || '¬')) : todays;

  function check(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!c) return;
    setResult(evaluate(db.visits.find((v) => v.code === c), c));
  }

  function evaluate(visit: Visit | undefined, c: string): Result {
    if (!visit) return { kind: 'notFound', code: c };
    if (visit.enteredAt) return { kind: 'used', visit };
    if (visit.date !== today) return { kind: 'wrongDate', visit };
    return { kind: 'ok', visit };
  }

  function admit(visit: Visit) {
    const now = new Date();
    const enteredAt = `${today}T${now.toTimeString().slice(0, 8)}`;
    update((d) => ({ ...d, visits: d.visits.map((v) => (v.code === visit.code ? { ...v, enteredAt, guardName: session.name } : v)) }));
    setResult({ kind: 'used', visit: { ...visit, enteredAt, guardName: session.name } });
    setCode('');
    inputRef.current?.focus();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <form onSubmit={check} className="card mb-4">
        <label className="mb-2 block text-sm font-semibold text-slate-600">Código de visitante</label>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            className="input flex-1 py-4 text-center font-mono text-3xl uppercase tracking-[0.3em]"
            value={code}
            maxLength={6}
            autoFocus
            autoComplete="off"
            onChange={(e) => {
              setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
              setResult(null);
            }}
            placeholder="ABC123"
          />
          <button className="btn btn-primary px-6 text-base">Verificar</button>
        </div>
      </form>

      {result && <ResultCard result={result} houses={db.houses} onAdmit={admit} />}

      <div className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">Visitas de hoy ({fmtDate(today)})</h2>
          <span className="text-sm text-slate-500">{todays.filter((v) => v.enteredAt).length} de {todays.length} ingresaron</span>
        </div>
        <input className="input mb-3" placeholder="Buscar por nombre o DUI" value={search} onChange={(e) => setSearch(e.target.value)} />
        <ul className="divide-y divide-slate-100">
          {found.map((v) => {
            const h = db.houses.find((x) => x.id === v.houseId);
            return (
              <li key={v.code} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <div className="font-semibold">{v.visitorName}</div>
                  <div className="text-sm text-slate-500">DUI {v.dui} · {h ? houseLabel(h) : v.houseId}{v.reason && ` · ${v.reason}`}</div>
                  <div className="text-xs text-slate-400">Autorizado por {v.createdBy}</div>
                </div>
                {v.enteredAt ? (
                  <span className="badge bg-emerald-100 text-emerald-800">Ingresó {v.enteredAt.slice(11, 16)}</span>
                ) : (
                  <button className="btn btn-primary btn-sm" onClick={() => admit(v)}>Dar entrada</button>
                )}
              </li>
            );
          })}
          {found.length === 0 && <li className="py-4 text-center text-sm text-slate-500">No hay visitas que coincidan para hoy.</li>}
        </ul>
      </div>
    </div>
  );
}

function ResultCard({ result, houses, onAdmit }: { result: Result; houses: { id: string; poligono: string; lote: number }[]; onAdmit: (v: Visit) => void }) {
  if (result.kind === 'notFound') {
    return (
      <div className="mb-4 rounded-xl border-2 border-red-400 bg-red-50 p-5 text-center">
        <div className="text-2xl font-bold text-red-700">Código no válido</div>
        <p className="text-red-700">No existe ninguna visita con el código {result.code}. Busca por nombre o llama a la casa.</p>
      </div>
    );
  }
  const v = result.visit;
  const h = houses.find((x) => x.id === v.houseId);
  const where = h ? `Polígono ${h.poligono}, Lote ${h.lote}` : v.houseId;
  const style = {
    ok: 'border-emerald-500 bg-emerald-50 text-emerald-800',
    used: 'border-amber-400 bg-amber-50 text-amber-800',
    wrongDate: 'border-red-400 bg-red-50 text-red-700',
  }[result.kind];
  const title = {
    ok: 'Código válido',
    used: `Ya ingresó a las ${v.enteredAt?.slice(11, 16)}`,
    wrongDate: `Código para otra fecha (${fmtDate(v.date)})`,
  }[result.kind];

  return (
    <div className={`mb-4 rounded-xl border-2 p-5 ${style}`}>
      <div className="mb-3 text-2xl font-bold">{title}</div>
      <div className="grid gap-1 text-slate-800 sm:grid-cols-2">
        <div><span className="text-sm text-slate-500">Visitante</span><div className="text-lg font-semibold">{v.visitorName}</div></div>
        <div><span className="text-sm text-slate-500">DUI (verificar documento)</span><div className="font-mono text-lg font-semibold">{v.dui}</div></div>
        <div><span className="text-sm text-slate-500">Casa que visita</span><div className="font-semibold">{where}</div></div>
        <div><span className="text-sm text-slate-500">Autorizado por</span><div>{v.createdBy}</div></div>
        {v.reason && <div className="sm:col-span-2"><span className="text-sm text-slate-500">Motivo</span><div>{v.reason}</div></div>}
        {v.guardName && <div className="sm:col-span-2 text-sm text-slate-500">Registrado por {v.guardName}</div>}
      </div>
      {result.kind === 'ok' && (
        <button className="btn btn-primary mt-4 w-full py-3 text-lg" onClick={() => onAdmit(v)}>Dar entrada</button>
      )}
    </div>
  );
}
