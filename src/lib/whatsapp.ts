// Envío semiautomático: se abre WhatsApp con el mensaje listo y el usuario solo presiona Enviar. Costo $0.

export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);
}

export function waLink(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, '');
  const full = digits.length === 8 ? `503${digits}` : digits;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

/** WhatsApp sin número fijo: el usuario elige el contacto (para compartir códigos de visita). */
export function waShareLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function openWhatsApp(url: string) {
  window.open(url, '_blank', 'noopener');
}

/**
 * En el celular, comparte el PDF directamente (WhatsApp aparece en el menú de compartir).
 * Devuelve false si el navegador no permite compartir archivos (PC).
 */
export async function shareFile(file: File, text: string): Promise<boolean> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (!nav.share || !nav.canShare?.({ files: [file] })) return false;
  try {
    await nav.share({ files: [file], text });
    return true;
  } catch {
    return true; // el usuario canceló el menú de compartir
  }
}
