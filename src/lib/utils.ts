import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Cuenta ocurrencias de valores únicos de una propiedad en un array de objetos.
 * Descarta valores vacíos, null, undefined y los literales "null"/"undefined".
 * Retorna los resultados ordenados de mayor a menor.
 */
export function countBy<T>(
  items: T[],
  key: keyof T
): { name: string; value: number }[] {
  const counts = items.reduce((acc, item) => {
    const val = String(item[key] ?? '').trim();
    if (!val || val === 'null' || val === 'undefined') return acc;
    acc[val] = (acc[val] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

/** Formatea un número como soles peruanos. */
export function formatSoles(value: number): string {
  return `S/ ${value.toLocaleString('es-PE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

/**
 * Escapa un valor para exportación CSV según RFC 4180.
 * Encierra en comillas si contiene comas, comillas o saltos de línea.
 */
export function escapeCsvField(value: unknown): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
