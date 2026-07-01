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
import { Loader2, Upload, AlertCircle, LayoutDashboard, BarChart2, Bell } from 'lucide-react';

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

/**
 * Normaliza un valor de campo a string, retornando EMPTY_SENTINEL si está vacío.
 */
function normalize(v: string | null | undefined): string {
  const s = (v ?? '').trim();
  return s === '' ? EMPTY_SENTINEL : s;
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

  // Búsqueda por texto insensible a tildes y mayúsculas (Título, Objetivo o ID)
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
        const title = stripAccents((t.titulo || '').toLowerCase());
        const obj   = stripAccents((t.objetivo || '').toLowerCase());
        const idStr = String(t.id);
        const paddedIdStr = idStr.padStart(4, '0');
        passesSearch = title.includes(term) || obj.includes(term) || idStr.includes(term) || paddedIdStr.includes(term);
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
    passesApprovals
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
  items.forEach(i => set.add(normalize(getter(i))));
  return Array.from(set).sort((a, b) => {
    if (a === EMPTY_SENTINEL) return 1;
    if (b === EMPTY_SENTINEL) return -1;
    return a.localeCompare(b, 'es');
  });
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
  const [activeTab, setActiveTab] = useState<ActiveTab>('resumen');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // ---- Modal de Mismatch de archivo ----
  const [mismatchData, setMismatchData] = useState<{
    file: File;
    currentMode: 'demanda' | 'planificadas';
    targetMode: 'demanda' | 'planificadas';
  } | null>(null);

  const executeUpload = async (file: File, targetMode: 'demanda' | 'planificadas') => {
    setIsUploading(true);
    setUploadError(null);
    try {
      const result = targetMode === 'planificadas'
        ? await parsePlanificadasExcelFile(file)
        : await parseExcelFile(file);
      setData(result);
      setFilters(INITIAL_FILTERS);
      setExpandedId(null);
      setNotificationsOpen(false);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Error desconocido al procesar el archivo.'
      );
    } finally {
      setIsUploading(false);
    }
  };

  const renderMismatchModal = () => {
    if (!mismatchData) return null;
    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-left">
          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
                <AlertCircle size={22} className="text-amber-500" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Opción incorrecta detectada
                </h3>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  Te estás equivocando de opción. Has subido un archivo de{' '}
                  <strong>
                    {mismatchData.targetMode === 'demanda'
                      ? 'Gestión de la Demanda'
                      : 'Iniciativas Planificadas'}
                  </strong>{' '}
                  pero seleccionaste la opción de{' '}
                  <strong>
                    {mismatchData.currentMode === 'demanda'
                      ? 'Gestión de la Demanda'
                      : 'Iniciativas Planificadas'}
                  </strong>
                  .
                </p>
                <p className="text-xs font-semibold text-slate-700 mt-3">
                  ¿Deseas cargar este archivo como{' '}
                  {mismatchData.targetMode === 'demanda'
                    ? 'Gestión de la Demanda'
                    : 'Iniciativas Planificadas'}
                  ?
                </p>
              </div>
            </div>
          </div>
          <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
            <button
              onClick={() => setMismatchData(null)}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium bg-white hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                const { file, targetMode } = mismatchData;
                setMismatchData(null);
                executeUpload(file, targetMode);
              }}
              className={`px-4 py-2 text-white rounded-lg text-xs font-medium shadow-sm transition-colors ${
                mismatchData.targetMode === 'planificadas'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              Sí, cargar como {mismatchData.targetMode === 'planificadas' ? 'Planificadas' : 'Demanda'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const handleDemandaUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';

    setIsUploading(true);
    setUploadError(null);
    const detected = await detectExcelMode(file);
    setIsUploading(false);

    if (detected === 'planificadas') {
      setMismatchData({ file, currentMode: 'demanda', targetMode: 'planificadas' });
    } else {
      executeUpload(file, 'demanda');
    }
  };

  const handlePlanificadasUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';

    setIsUploading(true);
    setUploadError(null);
    const detected = await detectExcelMode(file);
    setIsUploading(false);

    if (detected === 'demanda') {
      setMismatchData({ file, currentMode: 'planificadas', targetMode: 'demanda' });
    } else {
      executeUpload(file, 'planificadas');
    }
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
        {/* Simple header */}
        <header className="corp-header sticky top-0 z-20 shadow-[0_2px_12px_rgba(13,67,108,.05)] shrink-0">
          <div className="corp-header-bg" />
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="flex items-center h-16">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white/10 rounded border border-white/20 flex items-center justify-center shadow-sm flex-shrink-0">
                  <span className="text-white font-bold text-sm">TI</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/60 leading-none mb-0.5">Laureate Perú</span>
                  <h2 className="text-sm font-extrabold uppercase tracking-wider text-white">IT Needs Manager</h2>
                </div>
              </div>
            </div>
          </div>
          <div className="h-1 w-full bg-gradient-to-r from-[#EB5F46] via-[#007FB1] to-[#00B8B2]" />
        </header>

        {/* Content */}
        <div className="flex-grow flex items-center justify-center p-6">
          <div className="bg-white max-w-2xl w-full rounded-2xl shadow-md border border-gray-100 p-8 text-center space-y-6">
            <div className="w-16 h-16 bg-[#fff0ed] rounded-full flex items-center justify-center mx-auto text-[#EB5F46]">
              <Upload size={32} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#1a1a2e] mb-2">¡Bienvenido al Panel TI!</h2>
              <p className="text-[#4a5568] text-sm">
                Selecciona una opción para comenzar cargando el archivo Excel correspondiente:
              </p>
            </div>

            {uploadError && (
              <div className="bg-red-50 text-red-700 p-4 rounded-lg text-sm text-left flex items-start gap-3 border border-red-200">
                <AlertCircle size={20} className="mt-0.5 flex-shrink-0 text-red-500" />
                <div className="whitespace-pre-wrap font-medium leading-relaxed flex-1">
                  {uploadError}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              {/* OPCION 1: DEMANDA */}
              <div className="border border-gray-200 rounded-xl p-5 flex flex-col justify-between items-center text-center hover:border-[#EB5F46] hover:shadow-sm transition-all bg-slate-50/50">
                <div className="mb-4">
                  <h3 className="font-bold text-[#1a1a2e] text-sm mb-1">1. Gestión de la Demanda</h3>
                  <p className="text-[#9ca3af] text-xs">Pipeline operativo, estimaciones y presupuestos.</p>
                </div>
                <label
                  className={`cursor-pointer w-full py-2.5 px-4 rounded-lg font-medium text-xs flex items-center justify-center gap-2 transition-all ${
                    isUploading
                      ? 'bg-orange-300 text-white cursor-not-allowed'
                      : 'bg-[#EB5F46] hover:bg-[#c94a32] text-white shadow-sm'
                  }`}
                >
                  {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  <span>Subir Demanda</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={handleDemandaUpload}
                    disabled={isUploading}
                  />
                </label>
              </div>

              {/* OPCION 2: PLANIFICADAS */}
              <div className="border border-gray-200 rounded-xl p-5 flex flex-col justify-between items-center text-center hover:border-emerald-400 hover:shadow-sm transition-all bg-slate-50/50">
                <div className="mb-4">
                  <h3 className="font-bold text-[#1a1a2e] text-sm mb-1">2. Iniciativas Planificadas</h3>
                  <p className="text-[#9ca3af] text-xs">Seguimiento de ejecución, estados y desviaciones.</p>
                </div>
                <label
                  className={`cursor-pointer w-full py-2.5 px-4 rounded-lg font-medium text-xs flex items-center justify-center gap-2 transition-all ${
                    isUploading
                      ? 'bg-emerald-300 text-white cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                  }`}
                >
                  {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  <span>Subir Planificadas</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={handlePlanificadasUpload}
                    disabled={isUploading}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="bg-[#22223C] text-slate-400 text-center py-4 px-8 text-xs font-semibold tracking-wider border-t border-slate-800 shrink-0">
          © {new Date().getFullYear()} <strong>Laureate Perú</strong>. Todos los derechos reservados.
        </footer>
        {renderMismatchModal()}
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
                  {data.mode === 'planificadas' ? 'Iniciativas Planificadas' : 'Gestión de la Demanda'}
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
                  <span>{isUploading ? 'Procesando…' : 'Subir Demanda'}</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={handleDemandaUpload}
                    disabled={isUploading}
                  />
                </label>

                <label
                  className={`cursor-pointer px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all active:scale-95 border ${
                    isUploading
                      ? 'bg-white/10 text-white/40 cursor-not-allowed border-white/10'
                      : 'bg-white hover:bg-white/95 text-emerald-700 border-white/20'
                  }`}
                >
                  {isUploading ? (
                    <Loader2 size={14} className="animate-spin text-white/40" />
                  ) : (
                    <Upload size={14} className="text-emerald-700" />
                  )}
                  <span>{isUploading ? 'Procesando…' : 'Subir Planificadas'}</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={handlePlanificadasUpload}
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

      {/* Modal de confirmación ante error de opción */}
      {renderMismatchModal()}
    </div>
  );
}
