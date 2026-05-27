/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { DashboardData, FilterState, Iniciativa, EtapaPipeline } from './types';
import { INITIAL_FILTERS, EMPTY_SENTINEL } from './constants';
import { parseExcelFile } from './lib/excelParser';
import { KPICards } from './components/KPICards';
import { DataTable } from './components/DataTable';
import { Filters } from './components/Filters';
import { Pipeline } from './components/Pipeline';
import { Reports } from './components/Reports';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, Upload, AlertCircle, LayoutDashboard, BarChart2 } from 'lucide-react';

type ActiveTab = 'resumen' | 'reportes';

// ---------------------------------------------------------------------------
// Helpers de filtrado
// ---------------------------------------------------------------------------

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

  // Búsqueda por texto (Título u Objetivo)
  let passesSearch = true;
  if (filters.busqueda && excludeField !== 'busqueda') {
    const term = filters.busqueda.toLowerCase().trim();
    if (term) {
      const title = (t.titulo || '').toLowerCase();
      const obj = (t.objetivo || '').toLowerCase();
      passesSearch = title.includes(term) || obj.includes(term);
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

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('resumen');

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const result = await parseExcelFile(file);
      setData(result);
      setFilters(INITIAL_FILTERS);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Error desconocido al procesar el archivo.'
      );
    } finally {
      setIsUploading(false);
      event.target.value = '';
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
    };
  }, [data, filters]);

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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white max-w-md w-full rounded-2xl shadow-sm border border-gray-100 p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto text-blue-500">
            <Upload size={32} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">¡Bienvenido!</h2>
            <p className="text-slate-500 text-sm">
              Para comenzar, por favor sube el archivo Excel con los datos de las iniciativas de Gestión de la Demanda.
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

          <label
            className={`cursor-pointer w-full py-3 px-4 rounded-xl font-medium flex items-center justify-center gap-2 transition-all ${
              isUploading
                ? 'bg-blue-300 text-white cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow'
            }`}
          >
            {isUploading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Procesando archivo...
              </>
            ) : (
              <>
                <Upload size={18} />
                Seleccionar archivo Excel
              </>
            )}
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
    );
  }

  const TABS: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'resumen',  label: 'Resumen',  icon: <LayoutDashboard size={15} /> },
    { id: 'reportes', label: 'Reportes', icon: <BarChart2 size={15} /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center shadow-sm flex-shrink-0">
                <span className="text-white font-bold text-sm">TI</span>
              </div>
              <h1 className="text-lg font-bold text-slate-800">
                Gestión de la Demanda
              </h1>
            </div>

            {/* Tabs de navegación */}
            <nav className="flex items-center gap-1">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    activeTab === tab.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </nav>

            <div className="flex items-center gap-6">
              <div className="text-sm text-gray-500 flex flex-col items-end">
                <span className="font-medium text-[11px] text-gray-400 uppercase tracking-wider">
                  Última actualización
                </span>
                <span>
                  {format(parseISO(data.ultima_actualizacion), 'dd MMM yyyy HH:mm', { locale: es })}
                </span>
              </div>

              <label
                className={`cursor-pointer px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm transition-colors ${
                  isUploading
                    ? 'bg-blue-400 cursor-not-allowed text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {isUploading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Upload size={16} />
                )}
                <span>{isUploading ? 'Procesando…' : 'Subir Excel'}</span>
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

          {uploadError && (
            <div className="flex items-center gap-2 bg-red-50 border-t border-red-200 text-red-700 text-sm px-4 py-2">
              <AlertCircle size={16} className="flex-shrink-0" />
              <span>{uploadError}</span>
              <button
                onClick={() => setUploadError(null)}
                className="ml-auto text-red-400 hover:text-red-600 font-bold"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {activeTab === 'resumen' && (
          <>
            {/* Filtros — siempre arriba */}
            <Filters 
              filters={filters} 
              setFilters={setFilters} 
              options={filterOptions} 
              onPendientesBPs={handlePendientesBPs}
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
            />

            {/* KPIs */}
            <KPICards iniciativas={filteredIniciativas} />

            {/* Tabla de detalle */}
            <DataTable iniciativas={filteredIniciativas} />
          </>
        )}

        {activeTab === 'reportes' && (
          <Reports
            iniciativas={data.iniciativas}
            onNavigate={(partialFilters) => {
              setFilters({ ...INITIAL_FILTERS, ...partialFilters });
              setActiveTab('resumen');
            }}
          />
        )}
      </main>
    </div>
  );
}
