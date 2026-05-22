/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { generateMockData } from './mockData';
import { DashboardData, FilterState, Iniciativa } from './types';
import { INITIAL_FILTERS, EMPTY_SENTINEL } from './constants';
import { parseExcelFile } from './lib/excelParser';
import { KPICards } from './components/KPICards';
import { Charts } from './components/Charts';
import { DataTable } from './components/DataTable';
import { Filters } from './components/Filters';
import { Pipeline } from './components/Pipeline';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, Upload, AlertCircle } from 'lucide-react';

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

  return (
    check('etapas', t.etapa_actual) &&
    check('instituciones', t.institucion) &&
    check('pilares', t.pilar_estrategico) &&
    check('complejidades', t.complejidad) &&
    check('it_bps', t.it_bp) &&
    check('lideres_dominio', t.lider_dominio) &&
    check('tipos_recurso', t.tipo_recurso) &&
    check('prioridades_brm', t.prioridad_brm) &&
    check('impacto_sox', t.impacto_sox) &&
    check('proyecto_spo', t.proyecto_spo) &&
    check('estabilizacion_sis', t.estabilizacion_sis)
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

  useEffect(() => {
    setData(generateMockData());
  }, []);

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
      lideres:       buildOptions(from('lideres_dominio'), t => t.lider_dominio),
      recursos:      buildOptions(from('tipos_recurso'), t => t.tipo_recurso),
      prioridades:   buildOptions(from('prioridades_brm'), t => t.prioridad_brm),
    };
  }, [data, filters]);

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-500 w-8 h-8" />
      </div>
    );
  }

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
                Gestión de la Demanda TI{' '}
                <span className="text-gray-400 font-normal">| Laureate Perú</span>
              </h1>
            </div>

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
        {/* Filtros — siempre arriba */}
        <Filters filters={filters} setFilters={setFilters} options={filterOptions} />

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

        {/* Tabla de detalle — inmediatamente después del pipeline para exploración rápida */}
        <DataTable iniciativas={filteredIniciativas} />

        {/* KPIs */}
        <KPICards iniciativas={filteredIniciativas} />

        {/* Gráficos — contexto analítico */}
        <Charts iniciativas={filteredIniciativas} />
      </main>
    </div>
  );
}
