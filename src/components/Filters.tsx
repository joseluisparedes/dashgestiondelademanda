import React, { useState, useRef, useEffect } from 'react';
import { FilterState, EtapaPipeline } from '../types';
import { INITIAL_FILTERS, EMPTY_SENTINEL, EMPTY_LABEL, ETAPAS_MAP, ETAPAS_PLANIFICADAS_MAP } from '../constants';
import {
  X,
  ChevronDown,
  SlidersHorizontal,
  Search,
  Building2,
  GitBranch,
  Calendar,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';

interface FilterOptions {
  instituciones: string[];
  pilares: string[];
  complejidades: string[];
  it_bps: string[];
  vp_solicitantes: string[];
  lideres: string[];
  recursos: string[];
  prioridades: string[];
  aprobar_estimacion: string[];
  presupuesto_habilitado: string[];
  planificacion_aprobada: string[];
  etapas: string[];
}

interface FiltersProps {
  filters: FilterState;
  setFilters: (f: React.SetStateAction<FilterState>) => void;
  options: FilterOptions;
  onPendientesBPs: () => void;
  mode?: 'demanda' | 'planificadas';
}

/** Retorna el texto visible de una opción, traduciendo el sentinel. */
function optionLabel(opt: string): string {
  return opt === EMPTY_SENTINEL ? EMPTY_LABEL : opt;
}

/** Retorna el estilo de chip para una opción. */
function chipStyle(opt: string): string {
  return opt === EMPTY_SENTINEL
    ? 'bg-amber-50 text-amber-700 border border-amber-200'
    : 'bg-blue-50 text-blue-700 border border-blue-200';
}

// ---------------------------------------------------------------------------
// Dropdown multi-select con checkboxes y chips removibles
// ---------------------------------------------------------------------------
interface MultiSelectProps {
  label: string;
  field: keyof FilterState;
  options: string[];
  filters: FilterState;
  setFilters: (f: React.SetStateAction<FilterState>) => void;
  mode?: 'demanda' | 'planificadas';
}

function MultiSelect({ label, field, options, filters, setFilters, mode = 'demanda' }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = (filters[field] as string[]) || [];

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const toggleOption = (val: string) => {
    setFilters(prev => {
      const current = (prev[field] as string[]) || [];
      const next = current.includes(val)
        ? current.filter(v => v !== val)
        : [...current, val];
      return { ...prev, [field]: next };
    });
  };

  const removeChip = (val: string) => {
    setFilters(prev => ({
      ...prev,
      [field]: ((prev[field] as string[]) || []).filter(v => v !== val),
    }));
  };

  const getLabel = (opt: string) => {
    if (field === 'etapas') {
      if (opt === EMPTY_SENTINEL) return EMPTY_LABEL;
      const config = mode === 'planificadas'
        ? ETAPAS_PLANIFICADAS_MAP.get(opt as any)
        : ETAPAS_MAP.get(opt as any);
      return config ? config.label : opt;
    }
    return optionLabel(opt);
  };

  const hasSelection = selected.length > 0;
  const availableCount = options.length;

  return (
    <div className={`relative flex-1 min-w-[140px] ${open ? 'z-50' : 'z-10'}`} ref={ref}>
      <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1">
        {label}
        {availableCount > 0 && (
          <span className="ml-1 text-slate-400 normal-case font-normal">({availableCount})</span>
        )}
      </label>

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          disabled={availableCount === 0}
          className={`w-full text-xs text-left rounded-lg border px-2.5 py-1.5 flex items-center justify-between gap-1 transition-all ${
            availableCount === 0
              ? 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed'
              : hasSelection
              ? 'border-blue-400 bg-blue-50 text-blue-700 font-semibold shadow-xs'
              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
          }`}
        >
          <span className="truncate">
            {availableCount === 0
              ? 'Sin opciones'
              : hasSelection
              ? selected.length === 1
                ? getLabel(selected[0])
                : `${selected.length} seleccionados`
              : 'Todos'}
          </span>
          {availableCount > 0 && (
            <ChevronDown
              size={12}
              className={`flex-shrink-0 text-slate-400 transition-transform duration-150 ${open ? 'rotate-180 text-blue-500' : ''}`}
            />
          )}
        </button>

        {/* Dropdown */}
        {open && availableCount > 0 && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-xl min-w-[200px] max-h-60 overflow-y-auto">
            {selected.length > 0 && (
              <button
                onClick={() => setFilters(prev => ({ ...prev, [field]: [] }))}
                className="w-full text-left px-3 py-1.5 text-[11px] text-red-600 hover:bg-red-50 border-b border-slate-100 font-bold"
              >
                Limpiar selección
              </button>
            )}
            {options.map(opt => (
              <label
                key={opt}
                className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs transition-colors ${
                  opt === EMPTY_SENTINEL
                    ? 'text-amber-700 italic border-t border-slate-100 bg-amber-50/40'
                    : selected.includes(opt)
                    ? 'text-blue-700 bg-blue-50/50 font-semibold'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggleOption(opt)}
                  className={`w-3 h-3 flex-shrink-0 rounded ${opt === EMPTY_SENTINEL ? 'accent-amber-500' : 'accent-blue-600'}`}
                />
                <span className="leading-tight truncate">{getLabel(opt)}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Chips de selección activa */}
      {hasSelection && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selected.map(val => (
            <span
              key={val}
              className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${chipStyle(val)}`}
            >
              <span className="max-w-[100px] truncate">{getLabel(val)}</span>
              <button
                onClick={() => removeChip(val)}
                className="hover:opacity-70 flex-shrink-0"
                aria-label={`Quitar ${getLabel(val)}`}
              >
                <X size={9} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Selector de rango de fechas por etapa (Card agrupado Inicio / Fin)
// ---------------------------------------------------------------------------
interface StageDateCardProps {
  title: string;
  stepNum: string;
  accent: 'blue' | 'purple' | 'amber';
  inicioDesdeField: keyof FilterState;
  inicioHastaField: keyof FilterState;
  finDesdeField: keyof FilterState;
  finHastaField: keyof FilterState;
  filters: FilterState;
  setFilters: (f: React.SetStateAction<FilterState>) => void;
}

function StageDateCard({
  title,
  stepNum,
  accent,
  inicioDesdeField,
  inicioHastaField,
  finDesdeField,
  finHastaField,
  filters,
  setFilters,
}: StageDateCardProps) {
  const iniDesde = (filters[inicioDesdeField] as string) || '';
  const iniHasta = (filters[inicioHastaField] as string) || '';
  const finDesde = (filters[finDesdeField] as string) || '';
  const finHasta = (filters[finHastaField] as string) || '';

  const hasIni = Boolean(iniDesde || iniHasta);
  const hasFin = Boolean(finDesde || finHasta);
  const activeCount = (hasIni ? 1 : 0) + (hasFin ? 1 : 0);

  const clearAll = () => {
    setFilters(prev => ({
      ...prev,
      [inicioDesdeField]: '',
      [inicioHastaField]: '',
      [finDesdeField]: '',
      [finHastaField]: '',
    }));
  };

  const accentStyles = {
    blue: {
      card: 'border-blue-200/80 bg-blue-50/15 hover:border-blue-300',
      badge: 'bg-blue-100 text-blue-800 border-blue-200',
      dot: 'bg-blue-500',
      title: 'text-blue-900',
      focus: 'focus:border-blue-400 focus:ring-blue-400/20',
    },
    purple: {
      card: 'border-purple-200/80 bg-purple-50/15 hover:border-purple-300',
      badge: 'bg-purple-100 text-purple-800 border-purple-200',
      dot: 'bg-purple-500',
      title: 'text-purple-900',
      focus: 'focus:border-purple-400 focus:ring-purple-400/20',
    },
    amber: {
      card: 'border-amber-200/80 bg-amber-50/15 hover:border-amber-300',
      badge: 'bg-amber-100 text-amber-800 border-amber-200',
      dot: 'bg-amber-500',
      title: 'text-amber-900',
      focus: 'focus:border-amber-400 focus:ring-amber-400/20',
    },
  }[accent];

  return (
    <div className={`rounded-xl border p-3 bg-white shadow-2xs transition-all flex flex-col justify-between ${accentStyles.card}`}>
      {/* Header del Card de Etapa */}
      <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-100">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`w-2 h-2 rounded-full ${accentStyles.dot} shrink-0`} />
          <span className={`text-xs font-extrabold uppercase tracking-wide truncate ${accentStyles.title}`}>
            {stepNum}. {title}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {activeCount > 0 && (
            <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full border ${accentStyles.badge}`}>
              {activeCount} filtro{activeCount > 1 ? 's' : ''}
            </span>
          )}
          {activeCount > 0 && (
            <button
              onClick={clearAll}
              className="text-[9px] font-bold text-red-500 hover:text-red-700 flex items-center gap-0.5 px-1 py-0.5 rounded hover:bg-red-50"
              title="Limpiar fechas de esta etapa"
            >
              <X size={10} /> Borrar
            </button>
          )}
        </div>
      </div>

      {/* Grid de 2 columnas: Fecha Inicio & Fecha Fin */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {/* Sub-bloque Fecha Inicio */}
        <div className={`p-2 rounded-lg border transition-all ${
          hasIni ? 'border-blue-300 bg-blue-50/50 shadow-2xs' : 'border-slate-200/80 bg-slate-50/60'
        }`}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
              Fecha Inicio
            </span>
            {hasIni && (
              <button
                onClick={() => setFilters(prev => ({ ...prev, [inicioDesdeField]: '', [inicioHastaField]: '' }))}
                className="text-[8px] font-bold text-red-500 hover:underline"
              >
                Borrar
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <span className="text-[9px] font-semibold text-slate-400 w-8 shrink-0">Desde</span>
              <input
                type="date"
                value={iniDesde}
                onChange={e => setFilters(prev => ({ ...prev, [inicioDesdeField]: e.target.value }))}
                className={`w-full text-[11px] font-mono border border-slate-200 rounded px-1.5 py-0.5 bg-white text-slate-700 focus:outline-none focus:ring-2 ${accentStyles.focus}`}
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[9px] font-semibold text-slate-400 w-8 shrink-0">Hasta</span>
              <input
                type="date"
                value={iniHasta}
                onChange={e => setFilters(prev => ({ ...prev, [inicioHastaField]: e.target.value }))}
                className={`w-full text-[11px] font-mono border border-slate-200 rounded px-1.5 py-0.5 bg-white text-slate-700 focus:outline-none focus:ring-2 ${accentStyles.focus}`}
              />
            </div>
          </div>
        </div>

        {/* Sub-bloque Fecha Fin */}
        <div className={`p-2 rounded-lg border transition-all ${
          hasFin ? 'border-amber-300 bg-amber-50/50 shadow-2xs' : 'border-slate-200/80 bg-slate-50/60'
        }`}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">
              Fecha Fin
            </span>
            {hasFin && (
              <button
                onClick={() => setFilters(prev => ({ ...prev, [finDesdeField]: '', [finHastaField]: '' }))}
                className="text-[8px] font-bold text-red-500 hover:underline"
              >
                Borrar
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <span className="text-[9px] font-semibold text-slate-400 w-8 shrink-0">Desde</span>
              <input
                type="date"
                value={finDesde}
                onChange={e => setFilters(prev => ({ ...prev, [finDesdeField]: e.target.value }))}
                className={`w-full text-[11px] font-mono border border-slate-200 rounded px-1.5 py-0.5 bg-white text-slate-700 focus:outline-none focus:ring-2 ${accentStyles.focus}`}
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[9px] font-semibold text-slate-400 w-8 shrink-0">Hasta</span>
              <input
                type="date"
                value={finHasta}
                onChange={e => setFilters(prev => ({ ...prev, [finHastaField]: e.target.value }))}
                className={`w-full text-[11px] font-mono border border-slate-200 rounded px-1.5 py-0.5 bg-white text-slate-700 focus:outline-none focus:ring-2 ${accentStyles.focus}`}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toggle buttons para campos booleanos: SI / NO / (Vacío)
// ---------------------------------------------------------------------------
interface ToggleFilterProps {
  label: string;
  field: keyof FilterState;
  filters: FilterState;
  setFilters: (f: React.SetStateAction<FilterState>) => void;
  siColor?: 'red' | 'green';
  availableValues?: string[];
}

function ToggleFilter({
  label,
  field,
  filters,
  setFilters,
  siColor = 'green',
  availableValues = ['SI', 'NO', EMPTY_SENTINEL],
}: ToggleFilterProps) {
  const selected = (filters[field] as string[]) || [];

  const toggle = (val: string) => {
    setFilters(prev => {
      const current = (prev[field] as string[]) || [];
      const next = current.includes(val)
        ? current.filter(v => v !== val)
        : [...current, val];
      return { ...prev, [field]: next };
    });
  };

  const siStyle = siColor === 'red'
    ? 'bg-rose-100 border-rose-400 text-rose-800'
    : 'bg-emerald-100 border-emerald-400 text-emerald-800';

  const buttons: Array<{ val: string; label: string; activeStyle: string; baseStyle: string }> = [
    {
      val: 'SI',
      label: 'SI',
      activeStyle: siStyle,
      baseStyle: 'bg-white border-slate-200 text-slate-500',
    },
    {
      val: 'NO',
      label: 'NO',
      activeStyle: 'bg-slate-200 border-slate-400 text-slate-800',
      baseStyle: 'bg-white border-slate-200 text-slate-500',
    },
    {
      val: EMPTY_SENTINEL,
      label: '—',
      activeStyle: 'bg-amber-100 border-amber-400 text-amber-800',
      baseStyle: 'bg-white border-slate-200 text-slate-400',
    },
  ];

  return (
    <div className="flex-[0_0_auto]">
      <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1">
        {label}
      </label>
      <div className="flex gap-1">
        {buttons.map(btn => {
          const isAvailable = availableValues.includes(btn.val);
          const isActive = selected.includes(btn.val);
          return (
            <button
              key={btn.val}
              type="button"
              onClick={() => isAvailable && toggle(btn.val)}
              disabled={!isAvailable}
              title={btn.val === EMPTY_SENTINEL ? 'Sin valor asignado' : btn.val}
              className={`text-xs px-2.5 py-1.5 rounded-lg border font-bold transition-all ${
                !isAvailable
                  ? 'opacity-30 cursor-not-allowed bg-slate-50 border-slate-100 text-slate-300'
                  : isActive
                  ? btn.activeStyle
                  : `${btn.baseStyle} hover:border-slate-300 hover:text-slate-700`
              }`}
            >
              {btn.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal de filtros reorganizado
// ---------------------------------------------------------------------------
export function Filters({ filters, setFilters, options, onPendientesBPs, mode = 'demanda' }: FiltersProps) {
  const isPlanificadas = mode === 'planificadas';
  
  // Conteo de filtros activos por categoría
  const countOrg = 
    (filters.instituciones?.length || 0) +
    (filters.vp_solicitantes?.length || 0) +
    (filters.it_bps?.length || 0) +
    (filters.lideres_dominio?.length || 0);

  const countFlujo =
    (filters.etapas?.length || 0) +
    (filters.complejidades?.length || 0) +
    (filters.pilares?.length || 0) +
    (filters.tipos_recurso?.length || 0) +
    (filters.prioridades_brm?.length || 0);

  const countFechas =
    (filters.fecha_inicio_estimacion_desde ? 1 : 0) +
    (filters.fecha_inicio_estimacion_hasta ? 1 : 0) +
    (filters.fecha_fin_estimacion_desde ? 1 : 0) +
    (filters.fecha_fin_estimacion_hasta ? 1 : 0) +
    (filters.fecha_inicio_reestimacion_desde ? 1 : 0) +
    (filters.fecha_inicio_reestimacion_hasta ? 1 : 0) +
    (filters.fecha_fin_reestimacion_desde ? 1 : 0) +
    (filters.fecha_fin_reestimacion_hasta ? 1 : 0) +
    (filters.fecha_inicio_planificada_desde ? 1 : 0) +
    (filters.fecha_inicio_planificada_hasta ? 1 : 0) +
    (filters.fecha_fin_planificada_desde ? 1 : 0) +
    (filters.fecha_fin_planificada_hasta ? 1 : 0);

  const countAprob =
    (filters.aprobar_estimacion?.length || 0) +
    (filters.presupuesto_habilitado?.length || 0) +
    (filters.planificacion_aprobada?.length || 0) +
    (filters.impacto_sox?.length || 0) +
    (filters.proyecto_spo?.length || 0) +
    (filters.estabilizacion_sis?.length || 0);

  const totalActive = countOrg + countFlujo + countFechas + countAprob + (filters.busqueda ? 1 : 0);

  return (
    <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200/80 flex flex-col gap-5">
      {/* Cabecera Principal */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
            <SlidersHorizontal size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-800">Filtros de Búsqueda y Análisis</span>
              {totalActive > 0 && (
                <span className="bg-blue-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full leading-none shadow-xs">
                  {totalActive} activo{totalActive !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 m-0">Filtra por organización, etapas del pipeline, fechas de inicio y fin, y aprobaciones</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!isPlanificadas && (
            <button
              onClick={onPendientesBPs}
              className="text-xs px-3.5 py-1.5 rounded-full border font-bold transition-all shadow-xs bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100 flex items-center gap-1.5 cursor-pointer"
            >
              <span>🌟 Ver Pendientes de BPs</span>
            </button>
          )}
          
          {totalActive > 0 && (
            <button
              onClick={() => setFilters(INITIAL_FILTERS)}
              className="text-xs px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 font-bold transition-colors flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw size={12} /> Limpiar todo
            </button>
          )}
        </div>
      </div>

      {/* Barra de Búsqueda Global */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
          <Search size={16} className="text-slate-400" />
        </div>
        <input
          type="text"
          placeholder="Buscar texto en todos los campos (ID, título, solicitante, BP, descripción, enlaces, etc.)..."
          value={filters.busqueda?.startsWith('ids:') ? '📍 Alertas vigentes del BP TI' : (filters.busqueda || '')}
          onChange={e => setFilters(prev => ({ ...prev, busqueda: e.target.value }))}
          className={`w-full pl-10 pr-10 py-2.5 border rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all placeholder-slate-400 text-slate-800 ${
            filters.busqueda?.startsWith('ids:')
              ? 'bg-rose-50/80 border-rose-300 text-rose-800 font-semibold cursor-default'
              : 'bg-slate-50/60 border-slate-200 hover:border-slate-300 focus:bg-white'
          }`}
          readOnly={filters.busqueda?.startsWith('ids:')}
        />
        {filters.busqueda && (
          <button
            onClick={() => setFilters(prev => ({ ...prev, busqueda: '' }))}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            title="Borrar búsqueda"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* ================================================================
          SECCIÓN 1: ORGANIZACIÓN Y RESPONSABLES
      ================================================================ */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Building2 size={14} className="text-blue-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              1. Organización y Responsables
            </span>
          </div>
          {countOrg > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
              {countOrg} activo{countOrg !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <MultiSelect
            label="Institución"
            field="instituciones"
            options={options.instituciones}
            filters={filters}
            setFilters={setFilters}
            mode={mode}
          />
          <MultiSelect
            label="VP Área Solicitante"
            field="vp_solicitantes"
            options={options.vp_solicitantes}
            filters={filters}
            setFilters={setFilters}
            mode={mode}
          />
          <MultiSelect
            label="IT BP"
            field="it_bps"
            options={options.it_bps}
            filters={filters}
            setFilters={setFilters}
            mode={mode}
          />
          <MultiSelect
            label="Líder de Dominio"
            field="lideres_dominio"
            options={options.lideres}
            filters={filters}
            setFilters={setFilters}
            mode={mode}
          />
        </div>
      </div>

      {/* ================================================================
          SECCIÓN 2: FLUJO, ESTADO Y CLASIFICACIÓN TÉCNICA
      ================================================================ */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <GitBranch size={14} className="text-purple-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              2. Flujo, Estado y Clasificación
            </span>
          </div>
          {countFlujo > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
              {countFlujo} activo{countFlujo !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <MultiSelect
            label={isPlanificadas ? 'Estado' : 'Etapa Pipeline'}
            field="etapas"
            options={options.etapas}
            filters={filters}
            setFilters={setFilters}
            mode={mode}
          />
          <MultiSelect
            label="Complejidad"
            field="complejidades"
            options={options.complejidades}
            filters={filters}
            setFilters={setFilters}
            mode={mode}
          />
          {!isPlanificadas && (
            <MultiSelect
              label="Pilar Estratégico"
              field="pilares"
              options={options.pilares}
              filters={filters}
              setFilters={setFilters}
              mode={mode}
            />
          )}
          {!isPlanificadas && (
            <MultiSelect
              label="Tipo de Recurso"
              field="tipos_recurso"
              options={options.recursos}
              filters={filters}
              setFilters={setFilters}
              mode={mode}
            />
          )}
          {!isPlanificadas && (
            <MultiSelect
              label="Prioridad BRM"
              field="prioridades_brm"
              options={options.prioridades}
              filters={filters}
              setFilters={setFilters}
              mode={mode}
            />
          )}
        </div>
      </div>

      {/* ================================================================
          SECCIÓN 3: FECHAS DE INICIO Y FIN POR ETAPA
      ================================================================ */}
      {!isPlanificadas && (
        <div className="rounded-xl border border-amber-200/90 bg-amber-50/20 p-3.5 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-amber-600" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                3. Fechas de Inicio y Fin por Etapa
              </span>
            </div>
            {countFechas > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                {countFechas} rango{countFechas !== 1 ? 's' : ''} activo{countFechas !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <StageDateCard
              title="Estimación"
              stepNum="A"
              accent="blue"
              inicioDesdeField="fecha_inicio_estimacion_desde"
              inicioHastaField="fecha_inicio_estimacion_hasta"
              finDesdeField="fecha_fin_estimacion_desde"
              finHastaField="fecha_fin_estimacion_hasta"
              filters={filters}
              setFilters={setFilters}
            />
            <StageDateCard
              title="Re-estimación"
              stepNum="B"
              accent="purple"
              inicioDesdeField="fecha_inicio_reestimacion_desde"
              inicioHastaField="fecha_inicio_reestimacion_hasta"
              finDesdeField="fecha_fin_reestimacion_desde"
              finHastaField="fecha_fin_reestimacion_hasta"
              filters={filters}
              setFilters={setFilters}
            />
            <StageDateCard
              title="Planificación"
              stepNum="C"
              accent="amber"
              inicioDesdeField="fecha_inicio_planificada_desde"
              inicioHastaField="fecha_inicio_planificada_hasta"
              finDesdeField="fecha_fin_planificada_desde"
              finHastaField="fecha_fin_planificada_hasta"
              filters={filters}
              setFilters={setFilters}
            />
          </div>
        </div>
      )}

      {/* ================================================================
          SECCIÓN 4: APROBACIONES E INDICADORES CLAVE
      ================================================================ */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-emerald-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              {isPlanificadas ? '3. Indicadores Clave' : '4. Aprobaciones e Indicadores'}
            </span>
          </div>
          {countAprob > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              {countAprob} activo{countAprob !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-4 items-start">
          {!isPlanificadas && (
            <>
              <MultiSelect
                label="Aprobar Estimación"
                field="aprobar_estimacion"
                options={options.aprobar_estimacion}
                filters={filters}
                setFilters={setFilters}
                mode={mode}
              />
              <MultiSelect
                label="Presupuesto Habilitado"
                field="presupuesto_habilitado"
                options={options.presupuesto_habilitado}
                filters={filters}
                setFilters={setFilters}
                mode={mode}
              />
              <MultiSelect
                label="Planificación Aprobada"
                field="planificacion_aprobada"
                options={options.planificacion_aprobada}
                filters={filters}
                setFilters={setFilters}
                mode={mode}
              />
            </>
          )}

          <div className="flex flex-wrap gap-4 items-center pl-2 border-l border-slate-200">
            {!isPlanificadas && (
              <ToggleFilter
                label="Impacto SOX"
                field="impacto_sox"
                filters={filters}
                setFilters={setFilters}
                siColor="red"
              />
            )}
            <ToggleFilter
              label="Proyecto SPO"
              field="proyecto_spo"
              filters={filters}
              setFilters={setFilters}
            />
            {!isPlanificadas && (
              <ToggleFilter
                label="Estab. SIS"
                field="estabilizacion_sis"
                filters={filters}
                setFilters={setFilters}
              />
            )}
          </div>
        </div>
      </div>

      {/* Leyenda y estado */}
      {totalActive > 0 ? (
        <div className="text-xs text-slate-500 border-t border-slate-100 pt-3 flex items-center gap-3 flex-wrap">
          <span className="font-bold text-slate-700">
            {totalActive} filtro{totalActive !== 1 ? 's' : ''} activo{totalActive !== 1 ? 's' : ''}
          </span>
          <span className="text-slate-300">·</span>
          <span>OR dentro del mismo campo · AND entre campos</span>
          <span className="text-slate-300">·</span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
            <span className="italic text-amber-700">(Sin asignar)</span>
            {' '}= campo vacío o nulo
          </span>
        </div>
      ) : (
        <div className="text-[11px] text-slate-400 border-t border-slate-100 pt-2.5">
          Las opciones se actualizan automáticamente según el contexto de los filtros activos.
          El número entre paréntesis indica cuántas opciones están disponibles.
        </div>
      )}
    </div>
  );
}

export type { FilterState };
export type { EtapaPipeline };

