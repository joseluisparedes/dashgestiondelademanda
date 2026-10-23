import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Iniciativa } from '../types';

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

/**
 * Elimina tildes y diacríticos de un string para comparaciones insensibles a acentos.
 * Ej: "gestión" → "gestion", "Título" → "Titulo"
 */
export function stripAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Pre-genera el corpus completo de búsqueda de una iniciativa, normalizado
 * a minúsculas y sin tildes, incluyendo campos nativos y raw_fields de Excel.
 * Se computa una sola vez al cargar el archivo para que las búsquedas sean instantáneas.
 */
export function buildSearchCorpus(t: Iniciativa | ({ id: number; raw_fields?: Record<string, unknown> } & Record<string, unknown>)): string {
  const parts: string[] = [];

  // 1. Propiedades nativas
  for (const [k, v] of Object.entries(t as Record<string, unknown>)) {
    if (k === 'raw_fields' || k === '_searchCorpus') continue;
    if (v !== null && v !== undefined && v !== '') {
      parts.push(String(v));
    }
  }

  // 2. ID con relleno de ceros
  parts.push(String(t.id).padStart(4, '0'));

  // 3. Todos los campos crudos del Excel
  if (t.raw_fields) {
    for (const [rawKey, rawVal] of Object.entries(t.raw_fields)) {
      if (rawVal !== null && rawVal !== undefined && rawVal !== '') {
        parts.push(String(rawVal));
        parts.push(rawKey);
      }
    }
  }

  return stripAccents(parts.join(' ').toLowerCase());
}
