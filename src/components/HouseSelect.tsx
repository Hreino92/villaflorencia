import { useEffect, useId, useState } from 'react';
import { houseCode, houseLabel, houseMatches } from '../lib/billing';
import type { House } from '../lib/types';

const optionText = (h: House) => `${houseCode(h)} · ${houseLabel(h)} · ${h.owner.name}`;
const compact = (s: string) => s.trim().replace(/[\s\-_.]/g, '').toLowerCase();

/**
 * Selector de casa en el que se escribe para buscar ("C14", "Polígono C", un nombre).
 * Usa la lista de sugerencias del navegador (datalist), que funciona en computadora y en celular.
 */
export default function HouseSelect({
  houses,
  value,
  onChange,
  required,
  className = 'input',
}: {
  houses: House[];
  value: string;
  onChange: (id: string) => void;
  required?: boolean;
  className?: string;
}) {
  const listId = useId();
  const current = houses.find((h) => h.id === value);
  const [text, setText] = useState(current ? optionText(current) : '');

  // Si la casa cambia desde afuera (o se carga después), se muestra su texto completo; pero si lo escrito
  // ya es el código de esa casa ("C1" mientras se escribe "C14"), no se le borra a la persona lo que escribe.
  useEffect(() => {
    if (current && text !== optionText(current) && compact(text) !== houseCode(current).toLowerCase()) setText(optionText(current));
  }, [value]);

  function type(v: string) {
    setText(v);
    // Se elige al tocar una sugerencia, o al escribir el código exacto de una casa ("C14").
    const found = houses.find((h) => optionText(h) === v) ?? houses.find((h) => houseCode(h).toLowerCase() === compact(v));
    onChange(found?.id ?? '');
  }

  return (
    <>
      <input
        className={className}
        list={listId}
        value={text}
        onChange={(e) => type(e.target.value)}
        onFocus={(e) => e.target.select()}
        placeholder="Escribe el código (C14), el polígono o un nombre"
        autoComplete="off"
        required={required}
        // Un texto que no es una casa de la lista no se acepta al enviar el formulario.
        ref={(el) => el?.setCustomValidity(text && !houses.some((h) => h.id === value) ? 'Elige una casa de la lista.' : '')}
      />
      <datalist id={listId}>
        {houses.filter((h) => houseMatches(h, text) || optionText(h) === text).map((h) => (
          <option key={h.id} value={optionText(h)} />
        ))}
      </datalist>
    </>
  );
}
