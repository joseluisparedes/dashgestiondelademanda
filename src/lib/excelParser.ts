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

// ---------------------------------------------------------------------------
// Helpers de parseo
// ---------------------------------------------------------------------------

/** Busca una clave en la fila usando comparación exacta o parcial (case-insensitive), normalizando espacios/saltos de línea. */
function getVal(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    const found = Object.keys(row).find(k => {
      const normK = k.toLowerCase().replace(/\s+/g, ' ').trim();
      const normSearch = key.toLowerCase().replace(/\s+/g, ' ').trim();
      return normK === normSearch || normK.includes(normSearch);
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
    const dt = val instanceof Date ? val : new Date(String(val));
    if (isNaN(dt.getTime())) return null;
    return dt.toISOString();
  } catch {
    return null;
  }
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
 * Nunca retorna el literal "null", "undefined" o strings vacíos.
 */
function parseStr(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (s === '' || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') return null;
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
export function parseExcelFile(file: File): Promise<DashboardData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('Error al leer el archivo Excel.'));

    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });

        // ---------------------------------------------------------------------------
        // VALIDACIÓN DE ESTRUCTURA (Alertas para el usuario)
        // ---------------------------------------------------------------------------
        const errors: string[] = [];
        
        const expectedTabs = Object.keys(HOJAS_OPERATIVAS);
        const ALLOWED_EXTRA_TABS = [
          'Data maestra', 'BD', 'Priorización BRM', 'Backup 1902 1025', 
          'Por confirmar', 'Forms', 'Criterios Prioriz', 'Hoja1', 
          'Tipo de cambio', 'Sheet1'
        ];
        const actualTabs = workbook.SheetNames;
        
        const missingTabs = expectedTabs.filter(t => !actualTabs.includes(t));
        const extraTabs = actualTabs.filter(t => !expectedTabs.includes(t) && !ALLOWED_EXTRA_TABS.includes(t));
        
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
          const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];
          if (rows.length === 0) return;
          
          const headers = Object.keys(rows[0]).filter(h => !h.startsWith('__EMPTY'));
          
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
          reject(new Error("⚠️ ATENCIÓN: Se detectaron cambios en la estructura del archivo que requieren actualización en la lectura de datos.\n\n" + errors.join('\n')));
          return;
        }
        // ---------------------------------------------------------------------------

        const etapaOrder: EtapaPipeline[] = Object.values(HOJAS_OPERATIVAS);

        // Mapa de deduplicación: id → { iniciativa, índice de etapa }
        // En caso de duplicado, se conserva la iniciativa con etapa más avanzada.
        const seenIds = new Map<number, { iniciativa: Iniciativa; etapaIndex: number }>();

        Object.entries(HOJAS_OPERATIVAS).forEach(([sheetName, etapa]) => {
          const sheet = workbook.Sheets[sheetName];
          if (!sheet) return; // Hoja no encontrada en este workbook

          const rows = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[];
          const etapaIndex = etapaOrder.indexOf(etapa);

          rows.forEach((row, rowIdx) => {
            const g = (...keys: string[]) => getVal(row, ...keys);

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
                parseNum(g('Tiempo estimado', 'meses')),
              costo_usd,
              costo_soles,
              tipo_recurso:
                parseStr(g('Recursos internos o externos', 'Recurso')),
              proyecto_o_req:
                parseStr(g(
                  'Indicar si es Proyecto o Requerimiento No BAU',
                  'Proyecto o Requerimiento No BAU',
                  'Proyecto o Requerimiento',
                  'No BAU',
                  'Proyecto o Req. No catalogado',
                  'No catalogado'
                )),
              funcionalidad_nueva:
                parseStr(g('Funcionalidad nueva')),
              estatus_estimacion:
                parseStr(g('Estatus Estimación')),
              accion_brm:
                parseStr(g('Acción (Atender', 'Accion')),
              prioridad_brm:
                parseStr(g('Priorización de atención', 'Prioridad', 'Priorización', 'Priorizacion')),
              fecha_inicio_planificada:
                formatDt(g('Fecha inicio [Planificada]')),
              fecha_fin_planificada:
                formatDt(g('Fecha fin [Planificada]')),
              impacto_sox:
                parseSiNo(g('Impacto SOX', 'SOX')),
              aprobar_estimacion:
                parseStr(g('Aprobar estimación', 'Aprobar estimacion')),
              presupuesto_habilitado:
                parseStr(g('Presupuesto Habilitado', 'Presupuesto habilitado')),
              planificacion_aprobada:
                parseStr(g('Planificación aprobada', 'Planificacion aprobada')),
            };

            // Deduplicación: conservar la etapa más avanzada para el mismo ID
            const existing = seenIds.get(id);
            if (!existing || etapaIndex > existing.etapaIndex) {
              seenIds.set(id, { iniciativa, etapaIndex });
            }
          });
        });

        const allIniciativas = Array.from(seenIds.values())
          .map(v => v.iniciativa)
          .sort(
            (a, b) =>
              new Date(b.fecha_registro).getTime() - new Date(a.fecha_registro).getTime()
          );

        // Calcular resumen por etapa
        const resumenPorEtapa: Record<string, number> = {};
        etapaOrder.forEach(e => (resumenPorEtapa[e] = 0));
        allIniciativas.forEach(i => {
          if (resumenPorEtapa[i.etapa_actual] !== undefined) {
            resumenPorEtapa[i.etapa_actual]++;
          }
        });

        resolve({
          ultima_actualizacion: new Date().toISOString(),
          tipo_de_cambio: 3.75,
          resumen: {
            total_iniciativas: allIniciativas.length,
            por_etapa: resumenPorEtapa,
          },
          iniciativas: allIniciativas,
        });
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Error al procesar el archivo.'));
      }
    };

    reader.readAsArrayBuffer(file);
  });
}
