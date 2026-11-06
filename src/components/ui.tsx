import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ChargeStatus } from '../lib/billing';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Marca: flor de veranera (buganvilia), tres brácteas alrededor del centro, en terracota. */
export function Veranera({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      {[0, 120, 240].map((r) => (
        <path key={r} d="M16 16 C9 13 9 4 16 3 C23 4 23 13 16 16Z" fill="#b26b55" transform={`rotate(${r} 16 16)`} />
      ))}
      <circle cx="16" cy="16" r="2.6" fill="#f5e6df" />
    </svg>
  );
}

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-slate-900 md:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

// Estados de pago: punto de color + texto (nunca solo color). El mapa usa tonos suaves; solo la mora se marca más.
export const STATUS_STYLE: Record<ChargeStatus, { badge: string; dot: string; tile: string; label: string }> = {
  pagado: { badge: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500', tile: 'bg-emerald-100 text-emerald-900', label: 'Pagado' },
  parcial: { badge: 'bg-sky-100 text-sky-800', dot: 'bg-sky-500', tile: 'bg-sky-100 text-sky-900', label: 'Parcial' },
  pendiente: { badge: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500', tile: 'bg-amber-100 text-amber-900', label: 'Pendiente' },
  vencido: { badge: 'bg-red-100 text-red-800', dot: 'bg-red-600', tile: 'bg-red-200 text-red-900', label: 'En mora' },
};

export function StatusBadge({ status }: { status: ChargeStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`badge ${s.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      {s.label}
    </span>
  );
}

// El conteo del panel de inicio corre una sola vez por visita a la app, no en cada regreso a la pantalla.
let counted = false;

/** "$1,234.50" → cuenta de 0 a 1,234.50 conservando prefijo, sufijo y decimales. */
function useCountUp(value: string, enabled: boolean) {
  const run = useRef(enabled && !counted && !reducedMotion());
  const [shown, setShown] = useState(() => (run.current ? value.replace(/\d/g, '0') : value));
  useEffect(() => {
    const m = value.match(/^(\D*)([\d,]+(?:\.(\d+))?)(.*)$/);
    if (!run.current || !m) return setShown(value);
    counted = true;
    const target = Number(m[2].replace(/,/g, ''));
    const decimals = m[3]?.length ?? 0;
    const fmt = (n: number) => m[1] + n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + m[4];
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / 600);
      setShown(fmt(target * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return shown;
}

export function Stat({ label, value, hint, tone = 'slate', countUp = false }: { label: string; value: string; hint?: string; tone?: 'slate' | 'green' | 'red' | 'amber'; countUp?: boolean }) {
  const color = { slate: 'text-slate-900', green: 'text-emerald-700', red: 'text-red-700', amber: 'text-amber-700' }[tone];
  const shown = useCountUp(value, countUp);
  return (
    <div className="card">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-2 text-[26px] leading-tight font-semibold tracking-tight tabular-nums ${color}`}>
        <span aria-hidden="true">{shown}</span>
        <span className="sr-only">{value}</span>
      </div>
      {hint && <div className="mt-1 text-[13px] text-slate-500">{hint}</div>}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  // Al cerrar desde la X o el fondo, la salida se anima (más corta que la entrada) y luego se desmonta.
  const [closing, setClosing] = useState(false);
  const close = () => {
    if (closing) return;
    if (reducedMotion()) return onClose();
    setClosing(true);
    setTimeout(onClose, 140);
  };
  return (
    <div
      className={`fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/30 p-4 ${closing ? 'animate-fade-out' : 'animate-fade'}`}
      onMouseDown={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`card my-8 w-full ${closing ? 'animate-pop-out' : 'animate-pop'} ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="-m-2 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-2xl leading-none text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" onClick={close} aria-label="Cerrar">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{children}</div>;
}
