/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { DashboardData, FilterState, Iniciativa, EtapaPipeline } from './types';
import { INITIAL_FILTERS, EMPTY_SENTINEL } from './constants';
import { parseExcelFile, parsePlanificadasExcelFile } from './lib/excelParser';
import { KPICards } from './components/KPICards';
import { DataTable } from './components/DataTable';
import { Filters } from './components/Filters';
import { Pipeline } from './components/Pipeline';
import { Reports } from './components/Reports';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  Loader2, 
  Upload, 
  AlertCircle, 
  LayoutDashboard, 
  BarChart2, 
  Bell, 
  FileSpreadsheet, 
  Layers, 
  Zap, 
  Filter, 
  Clock, 
  Sparkles, 
  CheckCircle2, 
  HelpCircle, 
  ChevronDown, 
  ArrowRight 
} from 'lucide-react';

type ActiveTab = 'resumen' | 'reportes';

// ---------------------------------------------------------------------------
// Helpers de filtrado
// ---------------------------------------------------------------------------

/**
 * Elimina tildes y diacríticos de un string para comparaciones insensibles a acentos.
 * Ej: "gestión" → "gestion", "Título" → "Titulo"
 */
function stripAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isMeaningfulValue(v: string | null | undefined): boolean {
  if (v === null || v === undefined) return false;
  const s = String(v).trim();
  if (
    s === '' ||
    s === EMPTY_SENTINEL ||
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
    return false;
  }
  return true;
}

function normalize(v: string | null | undefined): string {
  if (!isMeaningfulValue(v)) return EMPTY_SENTINEL;
  return String(v).trim();
}

/**
 * Evalúa si un valor de campo coincide con los filtros seleccionados.
 * - Array vacío = sin filtro (acepta todo).
 * - EMPTY_SENTINEL en el array acepta valores nulos/vacíos.
 */
function matchFilter(selectedValues: string[], fieldValue: string | null | undefined): boolean {
  if (selectedValues.length === 0) return true;
  return selectedValues.includes(normalize(fieldValue));
}

/**
 * Aplica todos los filtros activos a una iniciativa, opcionalmente excluyendo un campo.
 * Usado para el filtrado facetado: las opciones de un campo se calculan
 * desde los datos ya filtrados por los demás campos.
 */
function matchesAllFilters(
  t: Iniciativa,
  filters: FilterState,
  excludeField?: keyof FilterState
): boolean {
  const check = (field: keyof FilterState, value: string | null | undefined) =>
    field === excludeField || matchFilter(filters[field] as string[], value);

  // Evaluamos los 3 campos de aprobación como un bloque OR si alguno tiene selección
  const isExcluded = (f: keyof FilterState) => f === excludeField;
  const hasAprob = !isExcluded('aprobar_estimacion') && filters.aprobar_estimacion.length > 0;
  const hasPresup = !isExcluded('presupuesto_habilitado') && filters.presupuesto_habilitado.length > 0;
  const hasPlan = !isExcluded('planificacion_aprobada') && filters.planificacion_aprobada.length > 0;

  const approvalsSelected = hasAprob || hasPresup || hasPlan;
  
  // Para que los campos OR no se filtren entre sí en los desplegables:
  const isAprobGroup = ['aprobar_estimacion', 'presupuesto_habilitado', 'planificacion_aprobada'].includes(excludeField as string);

  let passesApprovals = true;
  if (!isAprobGroup && approvalsSelected) {
    passesApprovals = 
      (hasAprob && matchFilter(filters.aprobar_estimacion, t.aprobar_estimacion)) ||
      (hasPresup && matchFilter(filters.presupuesto_habilitado, t.presupuesto_habilitado)) ||
      (hasPlan && matchFilter(filters.planificacion_aprobada, t.planificacion_aprobada));
  }

  // Búsqueda exhaustiva por texto insensible a tildes y mayúsculas en ABSOLUTAMENTE TODOS los campos
  let passesSearch = true;
  if (filters.busqueda && excludeField !== 'busqueda') {
    const term = stripAccents(filters.busqueda.toLowerCase().trim());
    if (term) {
      if (term.startsWith('ids:')) {
        const idsList = term.replace('ids:', '').split(',').map(s => s.trim()).filter(Boolean);
        const idStr = String(t.id);
        const paddedIdStr = idStr.padStart(4, '0');
        passesSearch = idsList.includes(idStr) || idsList.includes(paddedIdStr);
      } else {
        const tokens = term.split(/\s+/).filter(Boolean);
        const values: string[] = [];

        // 1. Recorrer todas las propiedades nativas de la iniciativa
        for (const [k, v] of Object.entries(t)) {
          if (k === 'raw_fields') continue;
          if (v !== null && v !== undefined && v !== '') {
            values.push(String(v));
          }
        }

        // 2. ID con ceros a la izquierda (ej: 0042)
        values.push(String(t.id).padStart(4, '0'));

        // 3. Recorrer ABSOLUTAMENTE TODOS los campos originales de Excel en raw_fields
        if (t.raw_fields) {
          for (const [rawKey, rawVal] of Object.entries(t.raw_fields)) {
            if (rawVal !== null && rawVal !== undefined && rawVal !== '') {
              values.push(String(rawVal));
              values.push(rawKey);
            }
          }
        }

        const corpus = stripAccents(values.join(' ').toLowerCase());
        passesSearch = corpus.includes(term) || tokens.every(token => corpus.includes(token));
      }
    }
  }

  return (
    passesSearch &&
    check('etapas', t.etapa_actual) &&
    check('instituciones', t.institucion) &&
    check('pilares', t.pilar_estrategico) &&
    check('complejidades', t.complejidad) &&
    check('it_bps', t.it_bp) &&
    check('vp_solicitantes', t.vp_solicitante) &&
    check('lideres_dominio', t.lider_dominio) &&
    check('tipos_recurso', t.tipo_recurso) &&
    check('prioridades_brm', t.prioridad_brm) &&
    check('impacto_sox', t.impacto_sox) &&
    check('proyecto_spo', t.proyecto_spo) &&
    check('estabilizacion_sis', t.estabilizacion_sis) &&
    passesApprovals &&
    // Fechas de inicio y fin por cada etapa
    ((val, desde, hasta, meses) => {
      const hasMeses = Boolean(meses && meses.length > 0);
      if (!hasMeses && !desde && !hasta) return true;
      if (!val) return false;
      const d = val.slice(0, 10);
      const ym = val.slice(0, 7);
      if (hasMeses && !meses?.includes(ym)) return false;
      if (desde && d < desde) return false;
      if (hasta && d > hasta) return false;
      return true;
    })(t.fecha_inicio_estimacion, filters.fecha_inicio_estimacion_desde, filters.fecha_inicio_estimacion_hasta, filters.fecha_inicio_estimacion_meses) &&
    ((val, desde, hasta, meses) => {
      const hasMeses = Boolean(meses && meses.length > 0);
      if (!hasMeses && !desde && !hasta) return true;
      if (!val) return false;
      const d = val.slice(0, 10);
      const ym = val.slice(0, 7);
      if (hasMeses && !meses?.includes(ym)) return false;
      if (desde && d < desde) return false;
      if (hasta && d > hasta) return false;
      return true;
    })(t.fecha_fin_estimacion, filters.fecha_fin_estimacion_desde, filters.fecha_fin_estimacion_hasta, filters.fecha_fin_estimacion_meses) &&
    ((val, desde, hasta, meses) => {
      const hasMeses = Boolean(meses && meses.length > 0);
      if (!hasMeses && !desde && !hasta) return true;
      if (!val) return false;
      const d = val.slice(0, 10);
      const ym = val.slice(0, 7);
      if (hasMeses && !meses?.includes(ym)) return false;
      if (desde && d < desde) return false;
      if (hasta && d > hasta) return false;
      return true;
    })(t.fecha_inicio_reestimacion, filters.fecha_inicio_reestimacion_desde, filters.fecha_inicio_reestimacion_hasta, filters.fecha_inicio_reestimacion_meses) &&
    ((val, desde, hasta, meses) => {
      const hasMeses = Boolean(meses && meses.length > 0);
      if (!hasMeses && !desde && !hasta) return true;
      if (!val) return false;
      const d = val.slice(0, 10);
      const ym = val.slice(0, 7);
      if (hasMeses && !meses?.includes(ym)) return false;
      if (desde && d < desde) return false;
      if (hasta && d > hasta) return false;
      return true;
    })(t.fecha_fin_reestimacion, filters.fecha_fin_reestimacion_desde, filters.fecha_fin_reestimacion_hasta, filters.fecha_fin_reestimacion_meses) &&
    ((val, desde, hasta, meses) => {
      const hasMeses = Boolean(meses && meses.length > 0);
      if (!hasMeses && !desde && !hasta) return true;
      if (!val) return false;
      const d = val.slice(0, 10);
      const ym = val.slice(0, 7);
      if (hasMeses && !meses?.includes(ym)) return false;
      if (desde && d < desde) return false;
      if (hasta && d > hasta) return false;
      return true;
    })(t.fecha_inicio_planificada, filters.fecha_inicio_planificada_desde, filters.fecha_inicio_planificada_hasta, filters.fecha_inicio_planificada_meses) &&
    ((val, desde, hasta, meses) => {
      const hasMeses = Boolean(meses && meses.length > 0);
      if (!hasMeses && !desde && !hasta) return true;
      if (!val) return false;
      const d = val.slice(0, 10);
      const ym = val.slice(0, 7);
      if (hasMeses && !meses?.includes(ym)) return false;
      if (desde && d < desde) return false;
      if (hasta && d > hasta) return false;
      return true;
    })(t.fecha_fin_planificada, filters.fecha_fin_planificada_desde, filters.fecha_fin_planificada_hasta, filters.fecha_fin_planificada_meses)
  );
}

/**
 * Extrae valores únicos de un campo en un conjunto de iniciativas.
 * Incluye EMPTY_SENTINEL para registros con campo vacío/nulo.
 * Ordena alfabéticamente, con (Sin asignar) siempre al final.
 */
function buildOptions(
  items: Iniciativa[],
  getter: (i: Iniciativa) => string | null | undefined
): string[] {
  const set = new Set<string>();
  let hasEmpty = false;

  items.forEach(i => {
    const raw = getter(i);
    if (isMeaningfulValue(raw)) {
      set.add(String(raw).trim());
    } else {
      hasEmpty = true;
    }
  });

  const sorted = Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  if (hasEmpty) {
    sorted.push(EMPTY_SENTINEL);
  }
  return sorted;
}

const detectExcelMode = (file: File): Promise<'demanda' | 'planificadas' | 'unknown'> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve('unknown');
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
        const sheetNames = workbook.SheetNames;
        if (sheetNames.includes('Req No Catalogados Demanda')) {
          resolve('planificadas');
        } else if (sheetNames.includes('Registro incompleto') || sheetNames.includes('Por estimar') || sheetNames.includes('Por planificar')) {
          resolve('demanda');
        } else {
          resolve('unknown');
        }
      } catch {
        resolve('unknown');
      }
    };
    reader.readAsArrayBuffer(file);
  });
};

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showFormatGuide, setShowFormatGuide] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('resumen');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const executeUpload = async (file: File) => {
    setIsUploading(true);
    setUploadError(null);
    try {
      const result = await parseExcelFile(file);
      setData(result);
      setFilters(INITIAL_FILTERS);
      setExpandedId(null);
      setNotificationsOpen(false);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Error desconocido al procesar el archivo Excel.'
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      executeUpload(file);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    executeUpload(file);
  };

  // Iniciativas filtradas por todos los filtros activos
  const filteredIniciativas = useMemo(() => {
    if (!data) return [];
    return data.iniciativas.filter(t => matchesAllFilters(t, filters));
  }, [data, filters]);

  /**
   * Opciones de filtro FACETADAS:
   * Cada campo muestra solo los valores que existen en los datos ya filtrados
   * por todos los DEMÁS campos. Así, al filtrar por etapa, los BPs disponibles
   * son solo los que tienen iniciativas en esa etapa.
   */
  const filterOptions = useMemo(() => {
    if (!data) {
      return { instituciones: [], pilares: [], complejidades: [], it_bps: [], lideres: [], recursos: [], prioridades: [] };
    }

    const from = (excludeField: keyof FilterState) =>
      data.iniciativas.filter(t => matchesAllFilters(t, filters, excludeField));

    return {
      instituciones: buildOptions(from('instituciones'), t => t.institucion),
      pilares:       buildOptions(from('pilares'),       t => t.pilar_estrategico),
      complejidades: buildOptions(from('complejidades'), t => t.complejidad),
      it_bps:        buildOptions(from('it_bps'),        t => t.it_bp),
      vp_solicitantes: buildOptions(from('vp_solicitantes'), t => t.vp_solicitante),
      lideres:       buildOptions(from('lideres_dominio'), t => t.lider_dominio),
      recursos:      buildOptions(from('tipos_recurso'), t => t.tipo_recurso),
      prioridades:   buildOptions(from('prioridades_brm'), t => t.prioridad_brm),
      aprobar_estimacion: buildOptions(from('aprobar_estimacion'), t => t.aprobar_estimacion),
      presupuesto_habilitado: buildOptions(from('presupuesto_habilitado'), t => t.presupuesto_habilitado),
      planificacion_aprobada: buildOptions(from('planificacion_aprobada'), t => t.planificacion_aprobada),
      etapas:        buildOptions(from('etapas'),        t => t.etapa_actual),
    };
  }, [data, filters]);

  // Alertas de fechas / hitos próximos (1, 2 o 3 días de diferencia)
  const upcomingAlerts = useMemo(() => {
    if (!data) return [];
    const today = new Date();
    const list: Array<{
      id: string;
      iniciativa: Iniciativa;
      label: string;
      dateField: string;
      diff: number;
    }> = [];

    data.iniciativas.forEach(t => {
      if (t.etapa_actual === 'eliminadas') return;

      const checkField = (fieldValue: string | null | undefined, label: string) => {
        if (!fieldValue) return;
        try {
          const date = parseISO(fieldValue);
          const diff = differenceInCalendarDays(date, today);
          if (diff >= 1 && diff <= 3) {
            list.push({
              id: `${t.id}-${label.toLowerCase().replace(/\s+/g, '-')}`,
              iniciativa: t,
              label,
              dateField: fieldValue,
              diff,
            });
          }
        } catch {
          // ignore
        }
      };

      if (data.mode === 'planificadas') {
        checkField(t.fecha_inicio_planificada, 'Inicio Planificado');
        checkField(t.fecha_fin_planificada, 'Fin Planificado');
        checkField(t.fecha_inicio_real, 'Inicio Real');
        checkField(t.fecha_fin_real, 'Fin Real');
      } else {
        checkField(t.fecha_inicio_planificada, 'Inicio Planificado');
        checkField(t.fecha_fin_planificada, 'Fin Planificado');
      }
    });

    return list.sort((a, b) => a.diff - b.diff);
  }, [data]);

  // Agrupar alertas por BP TI
  const groupedAlerts = useMemo(() => {
    const groups: Record<
      string,
      Array<{
        id: string;
        iniciativa: Iniciativa;
        label: string;
        dateField: string;
        diff: number;
      }>
    > = {};
    upcomingAlerts.forEach(alert => {
      const bp = alert.iniciativa.it_bp?.trim() || '(Sin asignar)';
      if (!groups[bp]) {
        groups[bp] = [];
      }
      groups[bp].push(alert);
    });
    return groups;
  }, [upcomingAlerts]);

  const handleSelectIniciativa = (iniciativa: Iniciativa) => {
    setFilters({
      ...INITIAL_FILTERS,
      busqueda: String(iniciativa.id).padStart(4, '0')
    });
    setExpandedId(iniciativa.id);
    setActiveTab('resumen');
    setNotificationsOpen(false);
  };

  const handleSelectBp = (bpName: string) => {
    // Obtener los IDs de las iniciativas en upcomingAlerts que pertenecen a este BP TI
    const alertsForBp = upcomingAlerts.filter(
      alert => (alert.iniciativa.it_bp?.trim() || '(Sin asignar)') === bpName
    );
    const ids = alertsForBp.map(alert => alert.iniciativa.id);

    setFilters({
      ...INITIAL_FILTERS,
      it_bps: [bpName],
      busqueda: ids.length > 0 ? `ids:${ids.join(',')}` : ''
    });
    setExpandedId(null);
    setActiveTab('resumen');
    setNotificationsOpen(false);
  };

  // Macro: Aplicar filtros de Pendiente de BPs (visualmente a los checkboxes)
  const handlePendientesBPs = () => {
    if (!data) return;
    
    const isAffirmative = (v: string | null | undefined) => {
      const s = (v ?? '').toUpperCase().trim();
      return ['SI', 'SÍ', 'YES', 'S', '1', 'TRUE'].includes(s);
    };

    const getPending = (getter: (t: Iniciativa) => string | null | undefined, stage: EtapaPipeline) => {
      const set = new Set<string>();
      data.iniciativas.forEach(t => {
        if (t.etapa_actual === stage && !isAffirmative(getter(t))) {
          set.add(getter(t) ? getter(t)!.trim() : EMPTY_SENTINEL);
        }
      });
      return Array.from(set);
    };

    setFilters(prev => ({
      ...prev,
      etapas: ['por_aprobar_estimacion', 'por_habilitar_presupuesto', 'aprobar_planificacion'],
      aprobar_estimacion: getPending(t => t.aprobar_estimacion, 'por_aprobar_estimacion'),
      presupuesto_habilitado: getPending(t => t.presupuesto_habilitado, 'por_habilitar_presupuesto'),
      planificacion_aprobada: getPending(t => t.planificacion_aprobada, 'aprobar_planificacion'),
    }));
  };

  if (!data) {
    return (
      <div className="min-h-screen bg-[#f7f8fc] flex flex-col font-sans">
        {/* Header Corporativo */}
        <header className="corp-header sticky top-0 z-20 shadow-[0_2px_12px_rgba(13,67,108,.05)] shrink-0">
          <div className="corp-header-bg" />
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white/10 rounded-lg border border-white/20 flex items-center justify-center shadow-sm flex-shrink-0">
                  <span className="text-white font-black text-xs tracking-wider">TI</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/60 leading-none mb-0.5">Laureate Perú</span>
                  <h2 className="text-sm font-extrabold uppercase tracking-wider text-white">IT Needs Manager</h2>
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-2 bg-white/10 backdrop-blur-xs px-3 py-1.5 rounded-full border border-white/15 text-white/90 text-xs font-semibold">
                <Sparkles size={13} className="text-amber-300" />
                <span>Gestión de la Demanda</span>
              </div>
            </div>
          </div>
          <div className="h-1 w-full bg-gradient-to-r from-[#EB5F46] via-[#007FB1] to-[#00B8B2]" />
        </header>

        {/* Contenido Principal */}
        <div className="flex-grow flex items-center justify-center p-4 sm:p-8">
          <div className="max-w-3xl w-full space-y-6">
            
            {/* Card Principal de Carga */}
            <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-6 sm:p-10 text-center space-y-6 transition-all">
              
              {/* Encabezado */}
              <div className="space-y-2 max-w-xl mx-auto">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#fff0ed] text-[#EB5F46] border border-[#EB5F46]/20 text-[11px] font-bold uppercase tracking-wider">
                  <FileSpreadsheet size={13} />
                  <span>Portal Operativo de Demanda TI</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-[#1a1a2e] tracking-tight">
                  Gestión de la Demanda
                </h1>
                <p className="text-slate-500 text-xs sm:text-sm leading-relaxed">
                  Carga el archivo Excel oficial para visualizar en tiempo real el pipeline operativo, estado de aprobaciones, presupuestos habilitados y alertas de vencimiento.
                </p>
              </div>

              {/* Mensaje de Error si ocurre */}
              {uploadError && (
                <div className="bg-red-50 text-red-700 p-4 rounded-xl text-xs sm:text-sm text-left flex items-start gap-3 border border-red-200 animate-in fade-in duration-200">
                  <AlertCircle size={18} className="mt-0.5 flex-shrink-0 text-red-500" />
                  <div className="whitespace-pre-wrap font-medium leading-relaxed flex-1">
                    {uploadError}
                  </div>
                </div>
              )}

              {/* Área Interactiva Drag and Drop */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative border-2 border-dashed rounded-2xl p-8 sm:p-10 transition-all duration-200 flex flex-col items-center justify-center gap-4 ${
                  isDragging
                    ? 'border-[#EB5F46] bg-[#fff0ed]/40 scale-[1.01] shadow-lg ring-4 ring-[#EB5F46]/10'
                    : 'border-slate-300 hover:border-[#EB5F46]/70 hover:bg-slate-50/50 bg-slate-50/30'
                }`}
              >
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all ${
                  isDragging
                    ? 'bg-[#EB5F46] text-white shadow-md scale-110'
                    : 'bg-[#fff0ed] text-[#EB5F46]'
                }`}>
                  {isUploading ? (
                    <Loader2 size={32} className="animate-spin text-[#EB5F46]" />
                  ) : (
                    <Upload size={30} className={isDragging ? 'animate-bounce' : ''} />
                  )}
                </div>

                <div className="space-y-1">
                  <p className="font-bold text-slate-800 text-sm sm:text-base">
                    {isDragging ? '¡Suelta el archivo Excel aquí!' : 'Arrastra y suelta tu archivo Excel aquí'}
                  </p>
                  <p className="text-slate-400 text-xs font-medium">
                    o haz clic en el botón para seleccionarlo desde tu equipo
                  </p>
                </div>

                <label
                  className={`cursor-pointer inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-xs sm:text-sm text-white shadow-md transition-all active:scale-95 ${
                    isUploading
                      ? 'bg-orange-300 cursor-not-allowed'
                      : 'bg-gradient-to-r from-[#EB5F46] to-[#d8482f] hover:from-[#c94a32] hover:to-[#b83e27] hover:shadow-lg shadow-[#EB5F46]/20'
                  }`}
                >
                  {isUploading ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
                  <span>{isUploading ? 'Procesando archivo…' : 'Seleccionar Archivo Excel'}</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={isUploading}
                  />
                </label>

                <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium">
                  <CheckCircle2 size={12} className="text-emerald-500" />
                  <span>Formatos soportados: <strong>.xlsx</strong>, <strong>.xls</strong></span>
                </div>
              </div>

              {/* Guía Colapsable de Hojas Esperadas */}
              <div className="pt-2 border-t border-slate-100 text-left">
                <button
                  type="button"
                  onClick={() => setShowFormatGuide(!showFormatGuide)}
                  className="w-full flex items-center justify-between text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors py-1.5 px-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <HelpCircle size={14} className="text-[#007FB1]" />
                    <span>Estructura y hojas requeridas del archivo Excel</span>
                  </div>
                  <ChevronDown
                    size={14}
                    className={`transition-transform duration-200 text-slate-400 ${showFormatGuide ? 'rotate-180' : ''}`}
                  />
                </button>

                {showFormatGuide && (
                  <div className="mt-3 p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-3 animate-in fade-in duration-150 text-xs">
                    <p className="text-slate-600 font-medium leading-relaxed">
                      El sistema consolida automáticamente la demanda operativa leyendo las siguientes hojas del libro Excel:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        'Registro incompleto',
                        'Por estimar',
                        'Por aprobar estimacion',
                        'Por Reestimar',
                        'Por habilitar presup.',
                        'Por planificar',
                        'Aprobar Planificación'
                      ].map((sheet) => (
                        <span
                          key={sheet}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-700 font-semibold text-[11px] shadow-2xs"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[#007FB1]" />
                          {sheet}
                        </span>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-500 italic">
                      * Las iniciativas se deduplican por ID conservando su etapa operativa más avanzada.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Grid de 4 Funcionalidades Clave */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex flex-col gap-1.5 text-left">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <Layers size={16} />
                </div>
                <h4 className="font-bold text-xs text-slate-800">Pipeline de Etapas</h4>
                <p className="text-[11px] text-slate-500 leading-snug">Flujo visual completo desde Registro hasta Planificación aprobada.</p>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex flex-col gap-1.5 text-left">
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                  <Zap size={16} />
                </div>
                <h4 className="font-bold text-xs text-slate-800">KPIs & Métricas</h4>
                <p className="text-[11px] text-slate-500 leading-snug">Indicadores en tiempo real de horas estimadas, costos USD y distribución.</p>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex flex-col gap-1.5 text-left">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <Filter size={16} />
                </div>
                <h4 className="font-bold text-xs text-slate-800">Filtros Facetados</h4>
                <p className="text-[11px] text-slate-500 leading-snug">Búsqueda exhaustiva y filtros dinámicos por BP TI, VP, SOX y más.</p>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex flex-col gap-1.5 text-left">
                <div className="w-8 h-8 rounded-lg bg-rose-50 text-[#EB5F46] flex items-center justify-center font-bold">
                  <Bell size={16} />
                </div>
                <h4 className="font-bold text-xs text-slate-800">Alertas de Hitos</h4>
                <p className="text-[11px] text-slate-500 leading-snug">Notificaciones automáticas ante fechas clave próximas a vencer (1-3 días).</p>
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <footer className="bg-[#22223C] text-slate-400 text-center py-4 px-8 text-xs font-semibold tracking-wider border-t border-slate-800 shrink-0">
          © {new Date().getFullYear()} <strong>Laureate Perú</strong>. Todos los derechos reservados.
        </footer>
      </div>
    );
  }

  const TABS: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'resumen',  label: 'Resumen',  icon: <LayoutDashboard size={15} /> },
    { id: 'reportes', label: 'Reportes', icon: <BarChart2 size={15} /> },
  ];

  return (
    <div className="min-h-screen bg-[#f7f8fc] text-[#1a1a2e] font-sans flex flex-col">
      <header className="corp-header sticky top-0 z-20 shadow-[0_2px_12px_rgba(13,67,108,.05)] shrink-0">
        <div className="corp-header-bg" />
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white/10 rounded border border-white/20 flex items-center justify-center shadow-sm flex-shrink-0">
                <span className="text-white font-bold text-sm">TI</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/60 leading-none mb-0.5">Laureate Perú</span>
                <h1 className="text-sm font-extrabold uppercase tracking-wider text-white">
                  Gestión de la Demanda
                </h1>
              </div>
              <button
                onClick={() => setData(null)}
                className="text-xs text-white bg-white/10 border border-white/20 hover:bg-white/20 font-bold flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all ml-2"
                title="Cambiar de archivo Excel"
              >
                Volver
              </button>
            </div>

            {/* Tabs de navegación */}
            <nav className="flex items-center gap-1">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    activeTab === tab.id
                      ? 'bg-white text-[#EB5F46] shadow-sm'
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </nav>

            <div className="flex items-center gap-6">
              {/* Campanita de Notificaciones */}
              <div className="relative">
                <button
                  onClick={() => setNotificationsOpen(!notificationsOpen)}
                  className={`p-2 rounded-full hover:bg-white/10 transition-all relative ${
                    notificationsOpen ? 'bg-white/10 text-white' : 'text-white/80 hover:text-white'
                  }`}
                  aria-label="Notificaciones"
                >
                  <Bell size={20} className={upcomingAlerts.length > 0 ? 'animate-bounce' : ''} style={{ animationDuration: '3s' }} />
                  {upcomingAlerts.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-[#EB5F46] text-white text-[9px] font-bold w-4.5 h-4.5 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                      {upcomingAlerts.length}
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <>
                    <div className="fixed inset-0 z-40 cursor-default" onClick={() => setNotificationsOpen(false)} />
                    <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden text-left">
                      <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-[#f7f8fc]">
                        <span className="font-semibold text-xs text-slate-800 flex items-center gap-1.5">
                          <Bell size={14} className="text-[#EB5F46]" />
                          Próximos Eventos / Hitos
                        </span>
                        <span className="text-[10px] px-2 py-0.5 bg-[#fff0ed] text-[#EB5F46] rounded-full font-semibold">
                          {upcomingAlerts.length} alerta{upcomingAlerts.length !== 1 ? 's' : ''}
                        </span>
                      </div>

                      <div className="max-h-[350px] overflow-y-auto divide-y divide-gray-150">
                        {upcomingAlerts.length > 0 ? (
                          Object.keys(groupedAlerts).map(bpName => {
                            const alerts = groupedAlerts[bpName];
                            return (
                              <div key={bpName} className="flex flex-col">
                                <button
                                  onClick={() => handleSelectBp(bpName)}
                                  className="w-full bg-slate-50 hover:bg-slate-100 transition-colors border-y border-gray-100 text-slate-600 px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-wider flex items-center justify-between sticky top-0 z-10 cursor-pointer text-left"
                                  title={`Filtrar iniciativas de ${bpName}`}
                                >
                                  <span>BP TI: {bpName}</span>
                                  <span className="bg-[#fff0ed] text-[#EB5F46] text-[9px] font-bold px-2 py-0.5 rounded-full">
                                    {alerts.length}
                                  </span>
                                </button>
                                <div className="divide-y divide-gray-50">
                                  {alerts.map(alert => {
                                    const ini = alert.iniciativa;
                                    const dateObj = parseISO(alert.dateField);
                                    const diff = alert.diff;
                                    
                                    const borderClass = 
                                      diff === 1 ? 'border-l-[#EB5F46]' : 
                                      diff === 2 ? 'border-l-amber-500' : 
                                      'border-l-blue-500';
                                    
                                    const badgeBg = 
                                      diff === 1 ? 'bg-[#fff0ed] text-[#EB5F46]' : 
                                      diff === 2 ? 'bg-amber-50 text-amber-700' : 
                                      'bg-blue-50 text-blue-700';

                                    const diffText = 
                                      diff === 1 ? `${alert.label}: mañana` : 
                                      `${alert.label}: en ${diff} días`;

                                    return (
                                      <button
                                        key={alert.id}
                                        onClick={() => handleSelectIniciativa(ini)}
                                        className={`w-full text-left p-3 hover:bg-slate-50 transition-colors flex flex-col gap-1 border-l-4 ${borderClass}`}
                                      >
                                        <div className="flex justify-between items-start gap-2">
                                          <span className="font-mono text-[9px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-semibold whitespace-nowrap">
                                            ID: {String(ini.id).padStart(4, '0')}
                                          </span>
                                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${badgeBg} whitespace-nowrap`}>
                                            {diffText}
                                          </span>
                                        </div>
                                        
                                        <h4 className="font-semibold text-xs text-slate-800 line-clamp-2 leading-tight">
                                          {ini.titulo}
                                        </h4>
                                        
                                        <div className="flex justify-between items-center text-[9px] text-gray-500 mt-1">
                                          <span className="font-medium text-slate-400 truncate max-w-[220px]">
                                            {ini.vp_solicitante || '(Sin VP)'}
                                          </span>
                                          <span className="font-mono">
                                            {format(dateObj, 'dd MMM yyyy', { locale: es })}
                                          </span>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="p-6 text-center text-gray-400 text-xs flex flex-col items-center gap-1.5">
                            <Bell size={20} className="opacity-30" />
                            <span>Sin alertas de fechas para los próximos 3 días.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="text-sm text-white/70 flex flex-col items-end">
                <span className="font-medium text-[9px] text-white/50 uppercase tracking-wider">
                  Última actualización
                </span>
                <span className="text-[11px] font-mono">
                  {format(parseISO(data.ultima_actualizacion), 'dd MMM yyyy HH:mm', { locale: es })}
                </span>
              </div>

              <div className="flex gap-2">
                <label
                  className={`cursor-pointer px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all active:scale-95 border ${
                    isUploading
                      ? 'bg-white/10 text-white/40 cursor-not-allowed border-white/10'
                      : 'bg-white hover:bg-white/95 text-[#0d436c] border-white/20'
                  }`}
                >
                  {isUploading ? (
                    <Loader2 size={14} className="animate-spin text-white/40" />
                  ) : (
                    <Upload size={14} className="text-[#0d436c]" />
                  )}
                  <span>{isUploading ? 'Procesando…' : 'Cargar nuevo Excel'}</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={isUploading}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
        {/* Color Line Divider */}
        <div className="h-1 w-full bg-gradient-to-r from-[#EB5F46] via-[#007FB1] to-[#00B8B2]" />
      </header>

      <main className="flex-1 max-w-screen-2xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {activeTab === 'resumen' && (
          <>
            {/* Filtros — siempre arriba */}
            <Filters 
              filters={filters} 
              setFilters={setFilters} 
              options={filterOptions} 
              onPendientesBPs={handlePendientesBPs}
              mode={data.mode}
            />

            {/* Pipeline — filtro visual de etapa */}
            <Pipeline
              iniciativas={filteredIniciativas}
              activeStages={filters.etapas}
              onStageClick={(stageId) => {
                setFilters(f => {
                  const next = f.etapas.includes(stageId)
                    ? f.etapas.filter(e => e !== stageId)
                    : [...f.etapas, stageId];
                  return { ...f, etapas: next };
                });
              }}
              mode={data.mode}
            />

            {/* KPIs */}
            <KPICards iniciativas={filteredIniciativas} mode={data.mode} />

            {/* Tabla de detalle */}
            <DataTable 
              iniciativas={filteredIniciativas} 
              expandedId={expandedId}
              onExpandedIdChange={setExpandedId}
              mode={data.mode}
            />
          </>
        )}

        {activeTab === 'reportes' && (
          <Reports
            iniciativas={data.iniciativas}
            onNavigate={(partialFilters) => {
              setFilters({ ...INITIAL_FILTERS, ...partialFilters });
              setActiveTab('resumen');
            }}
            mode={data.mode}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-[#22223C] text-slate-400 text-center py-4 px-8 text-xs font-semibold tracking-wider border-t border-slate-800 shrink-0">
        © {new Date().getFullYear()} <strong>Laureate Perú</strong>. Todos los derechos reservados.
      </footer>
    </div>
  );
}
