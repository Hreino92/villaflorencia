import type { ReactNode } from 'react';
import type { ChargeStatus } from '../lib/billing';

/** Marca: flor de veranera (buganvilia), tres brácteas alrededor del centro. */
export function Veranera({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      {[0, 120, 240].map((r) => (
        <path key={r} d="M16 16 C9 13 9 4 16 3 C23 4 23 13 16 16Z" fill="#b3246b" transform={`rotate(${r} 16 16)`} />
      ))}
      <circle cx="16" cy="16" r="2.6" fill="#f3e9a6" />
    </svg>
  );
}

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[28px] leading-tight font-extrabold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

// Estados de pago: color + punto + texto (nunca solo color). También los usa el mapa de casas.
export const STATUS_STYLE: Record<ChargeStatus, { badge: string; dot: string; tile: string; label: string }> = {
  pagado: { badge: 'bg-emerald-100 text-emerald-900', dot: 'bg-emerald-600', tile: 'bg-emerald-600 text-white', label: 'Pagado' },
  parcial: { badge: 'bg-sky-100 text-sky-900', dot: 'bg-sky-600', tile: 'bg-sky-200 text-sky-950', label: 'Parcial' },
  pendiente: { badge: 'bg-amber-100 text-amber-900', dot: 'bg-amber-500', tile: 'bg-white text-slate-700 border border-slate-300', label: 'Pendiente' },
  vencido: { badge: 'bg-red-100 text-red-800', dot: 'bg-red-600', tile: 'bg-red-700 text-white', label: 'En mora' },
};

export function StatusBadge({ status }: { status: ChargeStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`badge ${s.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function Stat({ label, value, hint, tone = 'slate' }: { label: string; value: string; hint?: string; tone?: 'slate' | 'green' | 'red' | 'amber' }) {
  const color = { slate: 'text-slate-900', green: 'text-emerald-700', red: 'text-red-700', amber: 'text-amber-700' }[tone];
  return (
    <div className="card">
      <div className="text-sm font-semibold text-slate-500">{label}</div>
      <div className={`mt-1 text-[26px] leading-tight font-extrabold tracking-tight ${color}`}>{value}</div>
      {hint && <div className="mt-1 text-[13px] text-slate-500">{hint}</div>}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onMouseDown={onClose}>
      <div className={`card my-8 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="text-2xl leading-none text-slate-400 hover:text-slate-700" onClick={onClose} aria-label="Cerrar">
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
  return <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{children}</div>;
}
