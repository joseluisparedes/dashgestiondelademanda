/**
 * @fileoverview Parser de archivos Excel para el dashboard de Gestión de la Demanda TI.
 *
 * Responsabilidades:
 * - Leer cada hoja operativa del workbook y mapearla a una EtapaPipeline.
 * - Normalizar todos los valores: nunca produce el literal "null" como string.
 * - Deduplicar iniciativas por ID, conservando la de etapa más avanzada.
 */

import * as XLSX from 'xlsx';
import { Iniciativa, DashboardData, EtapaPipeline } from '../types';
import { HOJAS_OPERATIVAS } from '../constants';
import { buildSearchCorpus } from './utils';

// ---------------------------------------------------------------------------
// Helpers de parseo
// ---------------------------------------------------------------------------

export interface ParserProgress {
  percent: number;
  stage: string;
  detail?: string;
}

/** Normaliza las claves de una fila en un Map para búsquedas O(1) ultrarrápidas. */
export function normalizeRow(row: Record<string, unknown>): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) {
    if (v !== undefined && v !== null && v !== '') {
      map.set(k.toLowerCase().replace(/[\r\n\s]+/g, ' ').trim(), v);
    }
  }
  return map;
}

/** Busca claves normalizadas en el Map en O(1) */
export function getValFromMap(rowMap: Map<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    const norm = key.toLowerCase().replace(/[\r\n\s]+/g, ' ').trim();
    const v = rowMap.get(norm);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
}

/** Busca una clave en la fila usando comparación exacta (case-insensitive), normalizando espacios/saltos de línea. */
export function getVal(row: Record<string, unknown> | Map<string, unknown>, ...keys: string[]): unknown {
  if (row instanceof Map) {
    return getValFromMap(row, ...keys);
  }
  for (const key of keys) {
    const normSearch = key.toLowerCase().replace(/[\r\n\s]+/g, ' ').trim();
    const found = Object.keys(row).find(k => {
      const normK = k.toLowerCase().replace(/[\r\n\s]+/g, ' ').trim();
      return normK === normSearch;
    });
    if (found !== undefined && row[found] !== undefined && row[found] !== '') {
      return row[found];
    }
  }
  return null;
}

/** Convierte un valor a ISO string o retorna null si no es parseable. */
function formatDt(val: unknown): string | null {
  if (!val) return null;
  try {
    if (typeof val === 'number' && val > 25000 && val < 70000) {
      const dt = new Date(Math.round((val - 25569) * 86400 * 1000));
      if (!isNaN(dt.getTime())) return dt.toISOString();
    }
    const dt = val instanceof Date ? val : new Date(String(val));
    if (isNaN(dt.getTime())) return null;
    return dt.toISOString();
  } catch {
    return null;
  }
}

/** Extrae todos los campos presentes en la fila de Excel de forma limpia. */
function extractRawFields(row: Record<string, unknown>): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(row)) {
    if (key.startsWith('__EMPTY')) continue;
    const cleanKey = key.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (val !== undefined && val !== null && val !== '') {
      if (val instanceof Date) {
        raw[cleanKey] = val.toISOString();
      } else {
        raw[cleanKey] = val;
      }
    }
  }
  return raw;
}

/**
 * Convierte un token numérico string a float, detectando automáticamente
 * si el separador de miles/decimales es coma o punto.
 */
function parseNumToken(s: string): number | null {
  if (!s) return null;
  s = s.trim();
  const cIdx = s.lastIndexOf(',');
  const dIdx = s.lastIndexOf('.');
  let clean = s;
  if (cIdx > -1 && dIdx > -1) {
    // Ambos presentes: el último es el decimal
    if (cIdx > dIdx) {
      clean = s.replace(/\./g, '').replace(',', '.'); // "1.234,56" → "1234.56"
    } else {
      clean = s.replace(/,/g, '');                    // "1,234.56" → "1234.56"
    }
  } else if (cIdx > -1) {
    // Solo coma: ¿miles o decimal?
    const afterComma = s.substring(cIdx + 1);
    if (afterComma.length === 3 && /^\d{3}$/.test(afterComma)) {
      clean = s.replace(',', ''); // "1,234" → "1234"
    } else {
      clean = s.replace(',', '.'); // "1,5" → "1.5"
    }
  }
  clean = clean.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(clean);
  return !isNaN(parsed) ? parsed : null;
}

/**
 * Extrae el número que sigue a "Total:" en un texto descriptivo,
 * ignorando símbolos de moneda ($, S/, S/.) entre "Total:" y el número.
 */
function extractTotalFromText(text: string): number | null {
  const m = text.match(/total\s*:?\s*[^\n0-9]*([0-9][0-9.,]*)/i);
  if (!m) return null;
  return parseNumToken(m[1]);
}

/**
 * Parsea un valor numérico de forma robusta soportando:
 * - Números simples (enteros, decimales con punto o coma)
 * - Celdas con texto descriptivo y desglose de costos, ej:
 *     "Datalake: $32,445\nAplicación Genesys: $7,646.40\nTotal: $40,091.4"
 *   → Si hay una línea "Total:", se usa ese valor.
 *   → Si no hay Total, se suman los valores monetarios encontrados.
 * Retorna null si el valor es 0, NaN o no contiene números.
 */
function parseNum(val: unknown): number | null {
  if (typeof val === 'number') return val !== 0 ? val : null;
  if (typeof val === 'string') {
    const raw = val.trim();
    if (!raw) return null;

    // Detectar si la celda es texto descriptivo (multilinea o con texto y ":")
    const isDescriptive = raw.includes('\n') || (raw.includes(':') && /[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(raw));

    if (isDescriptive) {
      // Estrategia 1: buscar "Total:" y extraer su valor
      const total = extractTotalFromText(raw);
      if (total !== null && total !== 0) return total;

      // Estrategia 2: sumar los valores monetarios individuales del desglose
      const lineNums = [...raw.matchAll(/[S\/\$\.]+\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]+)?)/g)];
      if (lineNums.length > 0) {
        const sum = lineNums.reduce((acc, m) => {
          const n = parseNumToken(m[1]);
          return n !== null ? acc + n : acc;
        }, 0);
        if (sum !== 0) return sum;
      }
    }

    // Estrategia 3: número simple (comportamiento original)
    const s = raw.replace(/[^0-9.,-]/g, '');
    if (!s) return null;
    const n = parseNumToken(s);
    return n !== null && n !== 0 ? n : null;
  }
  return null;
}


/**
 * Convierte un valor a string limpio o null.
 * Nunca retorna el literal "null", "undefined", "0", ".", "-" o strings vacíos.
 */
function parseStr(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (
    s === '' ||
    s === '0' ||
    s === '0.0' ||
    s === '.' ||
    s === '-' ||
    s === '--' ||
    s === '—' ||
    s.toLowerCase() === 'null' ||
    s.toLowerCase() === 'undefined' ||
    s.toLowerCase() === 'n/a'
  ) {
    return null;
  }
  return s;
}

/** Normaliza valores afirmativos/negativos a 'SI' | 'NO' | null. */
function parseSiNo(val: unknown): 'SI' | 'NO' | null {
  const s = parseStr(val)?.toUpperCase();
  if (!s) return null;
  if (['SI', 'SÍ', 'YES', 'S', '1', 'TRUE'].includes(s)) return 'SI';
  if (['NO', 'N', '0', 'FALSE'].includes(s)) return 'NO';
  return null;
}

// ---------------------------------------------------------------------------
// Parser principal
// ---------------------------------------------------------------------------

/**
 * Parsea un archivo Excel y retorna un DashboardData completo.
 *
 * @param file - Archivo .xlsx o .xls seleccionado por el usuario.
 * @returns Promise que resuelve con los datos del dashboard.
 */
export async function parseExcelFile(
  file: File,
  onProgress?: (progress: ParserProgress) => void
): Promise<DashboardData> {
  const notify = (percent: number, stage: string, detail?: string) => {
    onProgress?.({ percent, stage, detail });
  };

  notify(10, 'Leyendo archivo...', `Cargando ${file.name} en memoria...`);
  const buffer = await file.arrayBuffer();

  notify(25, 'Analizando libro Excel...', 'Extrayendo hojas y celdas...');
  await new Promise(r => setTimeout(r, 40));

  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });

  notify(40, 'Validando estructura...', 'Comprobando hojas operativas y columnas...');
  await new Promise(r => setTimeout(r, 40));

        // ---------------------------------------------------------------------------
        // VALIDACIÓN DE ESTRUCTURA (Alertas para el usuario)
        // ---------------------------------------------------------------------------
        const errors: string[] = [];
        
        const expectedTabs = Object.keys(HOJAS_OPERATIVAS);
        const ALLOWED_EXTRA_TABS = [
          'Data maestra', 'BD', 'BD New', 'BD 2', 'Priorización BRM', 'Backup 1902 1025', 
          'Por confirmar', 'Forms', 'Criterios Prioriz', 'Criterios de priorización', 'Hoja1', 
          'Tipo de cambio', 'Sheet1', 'Resumen', 'Consolidado'
        ];
        const actualTabs = workbook.SheetNames;
        
        const missingTabs = expectedTabs.filter(t => !actualTabs.includes(t));
        const extraTabs = actualTabs.filter(t => {
          const norm = t.trim().toLowerCase();
          return (
            !expectedTabs.includes(t) && 
            !ALLOWED_EXTRA_TABS.some(allowed => allowed.trim().toLowerCase() === norm) &&
            !norm.startsWith('bd') &&
            !norm.startsWith('criterios') &&
            !norm.startsWith('resumen')
          );
        });
        
        if (missingTabs.length > 0) {
          errors.push(`• Faltan pestañas esperadas: ${missingTabs.join(', ')}`);
        }
        if (extraTabs.length > 0) {
          errors.push(`• Se detectaron pestañas nuevas no mapeadas: ${extraTabs.join(', ')}`);
        }

        const KNOWN_KEYWORDS = [
          'Id', 'N° Ticket', 'Costo dolares', 'Costo total dolares', 'USD', 'Costo Soles', 'Costo total Soles',
          'Hora de inicio', 'Fecha Registro', 'Título de la INICIATIVA', 'Titulo', 'Objetivo',
          'Institución', 'Institucion', 'Universidad', 'VP del área solicitante', 'VP',
          'Usuario solicitante del negocio', 'Usuario', 'IT BP', 'BP', 'Fecha de entrega requerida', 'Para cuando se necesita',
          'Proyecto SPO', 'SPO', 'Tipo de iniciativa', 'Tipo', 'Pilar estratégico', 'Pilar',
          'estabilización de procesos SIS', 'SIS', 'Usuarios beneficiados', 'afectados',
          'Beneficio cuantitativo', 'Beneficio', 'Complejidad', 'Líder de Dominio', 'Lider',
          'Asignado por', 'Fecha de asignación esperada', 'Fecha de asignación del LD', 'Tiempo estimado', 'meses',
          'Recursos internos o externos', 'Recurso', 'Proyecto o Requerimiento', 'No BAU', 'No catalogado', 'Proyecto o Req',
          'Funcionalidad nueva', 'Estatus Estimación', 'Acción', 'Atender',
          'Priorización de atención', 'Prioridad', 'Fecha inicio', 'Fecha fin', 'Planificada',
          'Impacto SOX', 'SOX', 'Estado', 'Subestado', 'Fase', 'Etapa',
          'Aprobar estimación', 'Presupuesto Habilitado', 'Planificación aprobada',
          'Hora de finalización', 'Correo electrónico', 'Nombre', 'Descripción del problema',
          'Situación deseada', 'Procesos y áreas impactadas', 'Adjuntar', 'Adjuntos',
          'Fecha máxima de estimación', 'Asunciones', 'Supuestos', 'Comentarios', 'Completar información', 'STRING',
          // --- Columnas nuevas / renombradas en v20 ---
          'Puntaje Sugerido', 'Puntaje sugerido', 'Puntaje',
          'Beneficios cualitativos',
          'Evidencia de la aprobación', 'Aprobación de la iniciativa',
          'Workstream del proyecto SPO', 'Workstream', 'ID SPO',
          'Forma parte de la estabilización', 'estabilización de procesos',
          'Indicar si es Proyecto', 'Indicar si',
          'Usuario - Gerencia', 'Gerencia', 'Área solicitante',
          'Motivo de Reestimación', 'Reestimación', 'Reestimacion',
          'Fecha de inicio reestimación', 'Fecha fin reestimación',
          'Estatus Reestimación', 'Estatus Reestimacion',
          'Costo total dolares', 'Costo total Soles',
          'Aprobar Estimación', 'Aprobar Estimacion',
          'Usuarios beneficiados1',
          // --- Columnas v79 (Eliminados) ---
          'Fecha de eliminación', 'Fecha eliminacion',
          'Solicitado por:', 'Solicitado por', 'Eliminado por',
          'Motivo',
          // --- Columnas v85 (Planificadas e Implementadas: Cols BJ, BK, BL) ---
          'Fecha de pase a producción', 'Fecha pase a produccion', 'Pase a producción', 'Pase a produccion',
          'Persona que da conformidad', 'Persona conformidad', 'Conformidad',
          'Fecha de conformidad', 'Fecha conformidad',
        ];

        const REQUIRED_KEYWORDS = [
          ['Id', 'N° Ticket'],
          ['Título de la INICIATIVA', 'Titulo'],
          ['IT BP', 'BP'],
          ['Líder de Dominio', 'Lider']
        ];

        expectedTabs.forEach(sheetName => {
          const sheet = workbook.Sheets[sheetName];
          if (!sheet) return;
          const headerRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
          if (!headerRows || headerRows.length === 0) return;
          
          const headers = (headerRows[0] || []).map(h => String(h || '').trim()).filter(h => h && !h.startsWith('__EMPTY'));
          if (headers.length === 0) return;
          
          const newCols = headers.filter(h => !KNOWN_KEYWORDS.some(kw => h.toLowerCase().includes(kw.toLowerCase())));
          if (newCols.length > 0) {
            errors.push(`• Pestaña "${sheetName}" tiene columnas nuevas o desconocidas: ${newCols.join(', ')}`);
          }

          const missingRequired = REQUIRED_KEYWORDS.filter(kws => !kws.some(kw => headers.some(h => h.toLowerCase().includes(kw.toLowerCase()))));
          if (missingRequired.length > 0) {
            const missingNames = missingRequired.map(kws => kws[0]).join(' o ');
            errors.push(`• Pestaña "${sheetName}" le faltan columnas críticas: ${missingNames}`);
          }
        });

        if (errors.length > 0) {
          throw new Error("⚠️ ATENCIÓN: Se detectaron cambios en la estructura del archivo que requieren actualización en la lectura de datos.\n\n" + errors.join('\n'));
        }
        // ---------------------------------------------------------------------------

        const etapaOrder: EtapaPipeline[] = Object.values(HOJAS_OPERATIVAS);

        // Mapa de deduplicación: id → { iniciativa, índice de etapa }
        // En caso de duplicado, se conserva la iniciativa con etapa más avanzada.
        const seenIds = new Map<number, { iniciativa: Iniciativa; etapaIndex: number }>();

        const etapaEntries = Object.entries(HOJAS_OPERATIVAS);
        const totalTabs = etapaEntries.length;
        let tabIdx = 0;

        for (const [sheetName, etapa] of etapaEntries) {
          tabIdx++;
          const sheetPct = Math.round(40 + (tabIdx / totalTabs) * 45);
          notify(sheetPct, `Extrayendo etapa "${etapa}"...`, `Procesando pestaña "${sheetName}"`);
          // Ceder ejecución para que el usuario vea el avance fluido
          await new Promise(r => setTimeout(r, 60));

          const sheet = workbook.Sheets[sheetName];
          if (!sheet) continue; // Hoja no encontrada en este workbook

          const allRows = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[];

          // Descartar filas vacías de forma rápida con Map
          const rows = allRows.filter(row => {
            const rowMap = normalizeRow(row);
            const hasId    = getValFromMap(rowMap, 'Id', 'N° Ticket') !== null;
            const hasTitle = getValFromMap(rowMap, 'Título de la INICIATIVA', 'Titulo') !== null;
            return hasId || hasTitle;
          });
          const etapaIndex = etapaOrder.indexOf(etapa);

          rows.forEach((row, rowIdx) => {
            const rowMap = normalizeRow(row);
            const g = (...keys: string[]) => getValFromMap(rowMap, ...keys);

            // ID: intentar leer del campo, o generar uno sintético único
            const rawId = parseNum(g('Id', 'N° Ticket'));
            const id = rawId ?? Number(`${rowIdx + 1}${Math.floor(Math.random() * 1000)}`);

            const costo_usd = parseNum(g('Costo dolares', 'Costo total dolares', 'USD'));
            const costo_soles = parseNum(g('Costo Soles', 'Costo total Soles'));

            const iniciativa: Iniciativa = {
              id,
              etapa_actual: etapa,
              fecha_registro:
                formatDt(g('Hora de inicio', 'Fecha Registro')) ?? new Date().toISOString(),
              titulo:
                parseStr(g('Título de la INICIATIVA', 'Titulo')) ?? 'Sin Título',
              objetivo:
                parseStr(g('Objetivo')) ?? '',
              institucion:
                parseStr(g('Institución', 'Institucion', 'Universidad')) ?? '',
              vp_solicitante:
                parseStr(g('VP del área solicitante', 'VP')) ?? '',
              usuario_negocio:
                parseStr(g('Usuario solicitante del negocio', 'Usuario - Gerencia, Área solicitante', 'Usuario')) ?? '',
              it_bp:
                parseStr(g('IT BP', 'BP')) ?? '',
              fecha_entrega_requerida:
                formatDt(g('Fecha de entrega requerida', 'Para cuando se necesita')),
              proyecto_spo:
                parseSiNo(g('Proyecto SPO', 'SPO')) ?? 'NO',
              tipo_iniciativa:
                parseStr(g('Tipo de iniciativa', 'Tipo')) ?? '',
              pilar_estrategico:
                parseStr(g('Pilar estratégico', 'Pilar')) ?? '',
              estabilizacion_sis:
                parseSiNo(g(
                  'Forma parte de la estabilización de procesos  SIS',
                  'estabilización de procesos SIS',
                  'SIS'
                )) ?? 'NO',
              usuarios_beneficiados:
                parseStr(g('Usuarios beneficiados1', 'Usuarios beneficiados', 'afectados')) ?? '',
              beneficio_cuantitativo:
                parseStr(g('Beneficio cuantitativo', 'Beneficio')) ?? '',
              complejidad:
                parseStr(g('Complejidad')) ?? '',
              lider_dominio:
                parseStr(g('Líder de Dominio', 'Lider')) ?? '',
              asignado_por:
                parseStr(g('Asignado por')),
              fecha_asignacion:
                formatDt(g('Fecha de asignación esperada', 'Fecha de asignación del LD')),
              duracion_meses:
                parseNum(g('Tiempo estimado (meses)', 'Tiempo estimado\r\n(meses)', 'Tiempo estimado\n(meses)', 'Tiempo estimado', 'Tiempo Estimado (meses)', 'Tiempo Estimado', 'meses')),
              tiempo_estimado:
                parseNum(g('Tiempo estimado (meses)', 'Tiempo estimado\r\n(meses)', 'Tiempo estimado\n(meses)', 'Tiempo estimado', 'Tiempo Estimado (meses)', 'Tiempo Estimado', 'meses')),
              costo_usd,
              costo_soles,
              tipo_recurso:
                parseStr(g('Recursos internos o externos', 'Recurso')),
              proyecto_o_req:
                parseStr(g(
                  'Indicar si es Proyecto o Requerimiento No BAU',
                  'Proyecto o Requerimiento No BAU',
                  'Proyecto o Requerimiento',
                  'Indicar si es Proyecto o Requerimiento no catalogado',
                  'Proyecto o Requerimiento no catalogado',
                  'Proyecto o Req. No catalogado',
                  'Proyecto o Req. no catalogado',
                  'Proyecto o Req',
                  'No BAU',
                  'No catalogado'
                )),
              funcionalidad_nueva:
                parseStr(g('Funcionalidad nueva')),
              estatus_estimacion:
                parseStr(g('Estatus Estimación')),
              fecha_inicio_estimacion:
                formatDt(g('Fecha inicio  (estimación)', 'Fecha inicio (estimación)', 'Fecha inicio (estimacion)', 'Fecha inicio')),
              fecha_fin_estimacion:
                formatDt(g('Fecha fin (estimación)', 'Fecha fin (estimacion)', 'Fecha fin')),
              fecha_inicio_reestimacion:
                formatDt(g('Fecha de inicio reestimación', 'Fecha de inicio reestimacion', 'Fecha inicio reestimación', 'Fecha inicio reestimacion')),
              fecha_fin_reestimacion:
                formatDt(g('Fecha fin reestimación', 'Fecha fin reestimacion')),
              estatus_reestimacion:
                parseStr(g('Estatus Reestimación', 'Estatus Reestimacion')),
              motivo_reestimacion:
                parseStr(g('Motivo de Reestimación', 'Motivo de Reestimacion', 'Reestimación', 'Reestimacion')),
              accion_brm:
                parseStr(g('Acción (Atender, desestimar o backlog)', 'Acción (Atender', 'Accion (Atender', 'Accion')),
              prioridad_brm:
                parseStr(g('Priorización de atención (A, B, C)', 'Priorización de atención', 'Priorizacion de atencion', 'Prioridad', 'Priorización', 'Priorizacion')),
              fecha_inicio_planificada:
                formatDt(g('Fecha inicio [Planificada]', 'Fecha inicio\r\n[Planificada]', 'Fecha inicio\n[Planificada]', 'Fecha inicio planificada')),
              fecha_fin_planificada:
                formatDt(g('Fecha fin [Planificada]', 'Fecha fin\r\n[Planificada]', 'Fecha fin\n[Planificada]', 'Fecha fin planificada')),
              impacto_sox:
                parseSiNo(g('Impacto SOX', 'SOX')),
              aprobar_estimacion:
                parseStr(g('Aprobar Estimación (SI/NO)', 'Aprobar Estimacion (SI/NO)', 'Aprobar Estimación/Reestimación (SI/NO)', 'Aprobar Estimacion/Reestimacion (SI/NO)', 'Aprobar estimación', 'Aprobar estimacion')),
              presupuesto_habilitado:
                parseStr(g('Presupuesto habilitado (SI/NO)', 'Presupuesto habilitado\r\n(SI/NO)', 'Presupuesto habilitado\n(SI/NO)', 'Presupuesto Habilitado', 'Presupuesto habilitado')),
              planificacion_aprobada:
                parseStr(g('Planificación aprobada (SI/NO)', 'Planificacion aprobada (SI/NO)', 'Planificación aprobada', 'Planificacion aprobada')),
              fecha_eliminacion:
                formatDt(g('Fecha de eliminación', 'Fecha eliminacion', 'Fecha de eliminacion')),
              solicitado_por:
                parseStr(g('Solicitado por:', 'Solicitado por', 'Eliminado por')),
              motivo_eliminacion:
                parseStr(g('Motivo', 'Motivo de eliminación', 'Motivo eliminacion')),
              fecha_pase_produccion:
                formatDt(g('Fecha de pase a producción', 'Fecha pase a produccion', 'Pase a producción', 'Pase a produccion')),
              persona_conformidad:
                parseStr(g('Persona que da conformidad', 'Persona conformidad', 'Conformidad')),
              fecha_conformidad:
                formatDt(g('Fecha de conformidad', 'Fecha conformidad')),
              raw_fields: extractRawFields(row),
            };

            // Deduplicación: conservar la etapa más avanzada para el mismo ID y fusionar campos originales y fechas
            const existing = seenIds.get(id);
            const mergedRaw = existing
              ? { ...existing.iniciativa.raw_fields, ...iniciativa.raw_fields }
              : iniciativa.raw_fields;
            iniciativa.raw_fields = mergedRaw;

            if (!existing || etapaIndex > existing.etapaIndex) {
              if (existing) {
                if (!iniciativa.fecha_inicio_estimacion) iniciativa.fecha_inicio_estimacion = existing.iniciativa.fecha_inicio_estimacion;
                if (!iniciativa.fecha_fin_estimacion) iniciativa.fecha_fin_estimacion = existing.iniciativa.fecha_fin_estimacion;
                if (!iniciativa.fecha_inicio_reestimacion) iniciativa.fecha_inicio_reestimacion = existing.iniciativa.fecha_inicio_reestimacion;
                if (!iniciativa.fecha_fin_reestimacion) iniciativa.fecha_fin_reestimacion = existing.iniciativa.fecha_fin_reestimacion;
                if (!iniciativa.fecha_inicio_planificada) iniciativa.fecha_inicio_planificada = existing.iniciativa.fecha_inicio_planificada;
                if (!iniciativa.fecha_fin_planificada) iniciativa.fecha_fin_planificada = existing.iniciativa.fecha_fin_planificada;
                if (!iniciativa.fecha_asignacion) iniciativa.fecha_asignacion = existing.iniciativa.fecha_asignacion;
                if (!iniciativa.estatus_estimacion) iniciativa.estatus_estimacion = existing.iniciativa.estatus_estimacion;
                if (!iniciativa.estatus_reestimacion) iniciativa.estatus_reestimacion = existing.iniciativa.estatus_reestimacion;
                if (!iniciativa.motivo_reestimacion) iniciativa.motivo_reestimacion = existing.iniciativa.motivo_reestimacion;
                if (!iniciativa.fecha_eliminacion) iniciativa.fecha_eliminacion = existing.iniciativa.fecha_eliminacion;
                if (!iniciativa.solicitado_por) iniciativa.solicitado_por = existing.iniciativa.solicitado_por;
                if (!iniciativa.motivo_eliminacion) iniciativa.motivo_eliminacion = existing.iniciativa.motivo_eliminacion;
                if (!iniciativa.fecha_pase_produccion) iniciativa.fecha_pase_produccion = existing.iniciativa.fecha_pase_produccion;
                if (!iniciativa.persona_conformidad) iniciativa.persona_conformidad = existing.iniciativa.persona_conformidad;
                if (!iniciativa.fecha_conformidad) iniciativa.fecha_conformidad = existing.iniciativa.fecha_conformidad;
                if (iniciativa.duracion_meses == null && existing.iniciativa.duracion_meses != null) iniciativa.duracion_meses = existing.iniciativa.duracion_meses;
                if (iniciativa.tiempo_estimado == null && existing.iniciativa.tiempo_estimado != null) iniciativa.tiempo_estimado = existing.iniciativa.tiempo_estimado;
              }
              seenIds.set(id, { iniciativa, etapaIndex });
            } else {
              if (!existing.iniciativa.fecha_inicio_estimacion && iniciativa.fecha_inicio_estimacion) existing.iniciativa.fecha_inicio_estimacion = iniciativa.fecha_inicio_estimacion;
              if (!existing.iniciativa.fecha_fin_estimacion && iniciativa.fecha_fin_estimacion) existing.iniciativa.fecha_fin_estimacion = iniciativa.fecha_fin_estimacion;
              if (!existing.iniciativa.fecha_inicio_reestimacion && iniciativa.fecha_inicio_reestimacion) existing.iniciativa.fecha_inicio_reestimacion = iniciativa.fecha_inicio_reestimacion;
              if (!existing.iniciativa.fecha_fin_reestimacion && iniciativa.fecha_fin_reestimacion) existing.iniciativa.fecha_fin_reestimacion = iniciativa.fecha_fin_reestimacion;
              if (!existing.iniciativa.fecha_inicio_planificada && iniciativa.fecha_inicio_planificada) existing.iniciativa.fecha_inicio_planificada = iniciativa.fecha_inicio_planificada;
              if (!existing.iniciativa.fecha_fin_planificada && iniciativa.fecha_fin_planificada) existing.iniciativa.fecha_fin_planificada = iniciativa.fecha_fin_planificada;
              if (!existing.iniciativa.estatus_reestimacion && iniciativa.estatus_reestimacion) existing.iniciativa.estatus_reestimacion = iniciativa.estatus_reestimacion;
              if (!existing.iniciativa.motivo_reestimacion && iniciativa.motivo_reestimacion) existing.iniciativa.motivo_reestimacion = iniciativa.motivo_reestimacion;
              if (!existing.iniciativa.fecha_eliminacion && iniciativa.fecha_eliminacion) existing.iniciativa.fecha_eliminacion = iniciativa.fecha_eliminacion;
              if (!existing.iniciativa.solicitado_por && iniciativa.solicitado_por) existing.iniciativa.solicitado_por = iniciativa.solicitado_por;
              if (!existing.iniciativa.motivo_eliminacion && iniciativa.motivo_eliminacion) existing.iniciativa.motivo_eliminacion = iniciativa.motivo_eliminacion;
              if (!existing.iniciativa.fecha_pase_produccion && iniciativa.fecha_pase_produccion) existing.iniciativa.fecha_pase_produccion = iniciativa.fecha_pase_produccion;
              if (!existing.iniciativa.persona_conformidad && iniciativa.persona_conformidad) existing.iniciativa.persona_conformidad = iniciativa.persona_conformidad;
              if (!existing.iniciativa.fecha_conformidad && iniciativa.fecha_conformidad) existing.iniciativa.fecha_conformidad = iniciativa.fecha_conformidad;
              if (existing.iniciativa.duracion_meses == null && iniciativa.duracion_meses != null) existing.iniciativa.duracion_meses = iniciativa.duracion_meses;
              if (existing.iniciativa.tiempo_estimado == null && iniciativa.tiempo_estimado != null) existing.iniciativa.tiempo_estimado = iniciativa.tiempo_estimado;
              existing.iniciativa.raw_fields = mergedRaw;
            }
          });
        }

        notify(92, 'Consolidando iniciativas...', 'Deduplicando registros y calculando índices...');
        await new Promise(r => setTimeout(r, 80));

        const allIniciativas = Array.from(seenIds.values())
          .map(v => v.iniciativa)
          .sort(
            (a, b) =>
              new Date(b.fecha_registro).getTime() - new Date(a.fecha_registro).getTime()
          );

        // Precomputar corpus de búsqueda para todas las iniciativas (búsqueda ultrarrápida O(1))
        allIniciativas.forEach(ini => {
          ini._searchCorpus = buildSearchCorpus(ini);
        });

        // Calcular resumen por etapa
        const resumenPorEtapa: Record<string, number> = {};
        etapaOrder.forEach(e => (resumenPorEtapa[e] = 0));
        allIniciativas.forEach(i => {
          if (resumenPorEtapa[i.etapa_actual] !== undefined) {
            resumenPorEtapa[i.etapa_actual]++;
          }
        });

        // Mostrar 100% y dar un momento para apreciarlo claramente
        notify(100, '¡Listo!', `${allIniciativas.length} iniciativas preparadas`);
        await new Promise(r => setTimeout(r, 400));

        return {
          ultima_actualizacion: new Date().toISOString(),
          tipo_de_cambio: 3.75,
          resumen: {
            total_iniciativas: allIniciativas.length,
            por_etapa: resumenPorEtapa,
          },
          iniciativas: allIniciativas,
          mode: 'demanda',
        };
}

/**
 * Parsea el archivo Excel de iniciativas planificadas (formato simplificado).
 * 
 * @param file - Archivo .xlsx o .xls
 * @returns Promise con los datos formateados.
 */
export async function parsePlanificadasExcelFile(
  file: File,
  onProgress?: (progress: ParserProgress) => void
): Promise<DashboardData> {
  const notify = (percent: number, stage: string, detail?: string) => {
    onProgress?.({ percent, stage, detail });
  };

  try {
    notify(10, 'Leyendo archivo...', `Cargando ${file.name} en memoria...`);
  const buffer = await file.arrayBuffer();

  notify(30, 'Analizando libro Excel...', 'Buscando pestaña de planificadas...');
  await new Promise(r => setTimeout(r, 30));

  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });

  const sheetName = 'Req No Catalogados Demanda';
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`⚠️ El archivo Excel no contiene la pestaña requerida "${sheetName}".`);
  }

  notify(50, 'Extrayendo iniciativas...', 'Procesando registros planificados...');
  await new Promise(r => setTimeout(r, 60));

  // Leer saltándose la primera fila descriptiva
  const rows = XLSX.utils.sheet_to_json(sheet, { range: 1 }) as Record<string, unknown>[];
      
      const validRows = rows.filter(row => {
        const rowMap = normalizeRow(row);
        const hasId = getValFromMap(rowMap, 'ID Demanda', 'ID\r\nDemanda', 'ID') !== null;
        const hasTitle = getValFromMap(rowMap, 'Título de la Iniciativa', 'Titulo') !== null;
        return hasId || hasTitle;
      });

      const seenIds = new Map<number, Iniciativa>();

      validRows.forEach((row, rowIdx) => {
        const rowMap = normalizeRow(row);
        const g = (...keys: string[]) => getValFromMap(rowMap, ...keys);

        const rawId = parseNum(g('ID Demanda', 'ID\r\nDemanda', 'ID'));
        const id = rawId ?? Number(`99${rowIdx + 1}${Math.floor(Math.random() * 100)}`);

        const rawEstado = parseStr(g('Estado')) || 'Por iniciar';
        let etapa_actual: EtapaPipeline = 'por_iniciar';
        
        const normEstado = rawEstado.toLowerCase().trim();
        if (normEstado.includes('ejecuc') || normEstado.includes('progreso')) {
          etapa_actual = 'en_ejecucion';
        } else if (normEstado.includes('terminado') || normEstado.includes('finalizado')) {
          etapa_actual = 'terminado';
        } else if (normEstado.includes('detenido') || normEstado.includes('suspendido') || normEstado.includes('pausa')) {
          etapa_actual = 'detenido';
        }

        const costo_soles = parseNum(g('Costo Soles'));

        const ini: Iniciativa = {
          id,
          etapa_actual,
          fecha_registro: formatDt(g('Fecha inicio planificada')) ?? new Date().toISOString(),
          titulo: parseStr(g('Título de la Iniciativa', 'Titulo')) ?? 'Sin Título',
          objetivo: parseStr(g('Objetivo')) ?? '',
          institucion: parseStr(g('Institución', 'Universidad', 'Institucion')) ?? '',
          vp_solicitante: parseStr(g('Nombre VP', 'VP')) ?? '',
          usuario_negocio: parseStr(g('Solicitante', 'Usuario')) ?? '',
          it_bp: parseStr(g('IT BP', 'BP')) ?? '',
          fecha_entrega_requerida: formatDt(g('Fecha fin planificada')),
          proyecto_spo: g('ID SPO') ? 'SI' : 'NO',
          tipo_iniciativa: 'Requerimiento',
          pilar_estrategico: '',
          estabilizacion_sis: 'NO',
          usuarios_beneficiados: '',
          beneficio_cuantitativo: '',
          complejidad: '',
          lider_dominio: parseStr(g('Líder de dominio', 'Lider')) ?? '',
          asignado_por: null,
          fecha_asignacion: null,
          duracion_meses: null,
          costo_usd: null,
          costo_soles,
          tipo_recurso: null,
          proyecto_o_req: 'Requerimiento',
          funcionalidad_nueva: null,
          estatus_estimacion: null,
          accion_brm: null,
          prioridad_brm: null,
          fecha_inicio_planificada: formatDt(g('Fecha inicio planificada')),
          fecha_fin_planificada: formatDt(g('Fecha fin planificada')),
          impacto_sox: 'NO',
          aprobar_estimacion: null,
          presupuesto_habilitado: null,
          planificacion_aprobada: null,
          
          // Campos específicos
          frente: parseStr(g('Frente')),
          nombre_vp: parseStr(g('Nombre VP')),
          sub_estado: parseStr(g('Sub Estado', 'Subestado')),
          desviacion_pct: parseNum(g('% desviación', 'desviación')),
          fecha_inicio_real: formatDt(g('Fecha inicio real')),
          fecha_fin_real: formatDt(g('Fecha fin real')),
          aviso_negocio_cambio_fecha: parseStr(g('Se aviso a Negocio cambio de fecha?')),
          ticket_sn_rit: parseStr(g('Ticket SN (RIT)')),
          id_jira: parseStr(g('ID Jira')),
          motivo_replanificacion: parseStr(g('Motivo de Replanificación')),
          raw_fields: extractRawFields(row),
        };

        const existing = seenIds.get(id);
        const mergedRaw = existing
          ? { ...existing.raw_fields, ...ini.raw_fields }
          : ini.raw_fields;
        ini.raw_fields = mergedRaw;

        seenIds.set(id, ini);
      });

      notify(88, 'Consolidando iniciativas...', 'Generando corpus de búsqueda...');

      const allIniciativas = Array.from(seenIds.values()).sort(
        (a, b) => new Date(b.fecha_registro).getTime() - new Date(a.fecha_registro).getTime()
      );

      allIniciativas.forEach(ini => {
        ini._searchCorpus = buildSearchCorpus(ini);
      });

      const resumenPorEtapa: Record<string, number> = {
        por_iniciar: 0,
        en_ejecucion: 0,
        terminado: 0,
        detenido: 0,
      };

      allIniciativas.forEach(i => {
        if (resumenPorEtapa[i.etapa_actual] !== undefined) {
          resumenPorEtapa[i.etapa_actual]++;
        }
      });

      notify(100, '¡Carga completa!', `${allIniciativas.length} iniciativas listas para visualizar`);

      await new Promise(r => setTimeout(r, 400));

      return {
        ultima_actualizacion: new Date().toISOString(),
        tipo_de_cambio: 3.75,
        resumen: {
          total_iniciativas: allIniciativas.length,
          por_etapa: resumenPorEtapa,
        },
        iniciativas: allIniciativas,
        mode: 'planificadas',
      };
    } catch (err) {
      throw err instanceof Error ? err : new Error('Error al procesar el archivo Excel.');
    }
}
