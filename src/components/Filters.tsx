import React, { useState, useRef, useEffect } from 'react';
import { FilterState, EtapaPipeline } from '../types';
import { INITIAL_FILTERS, EMPTY_SENTINEL, EMPTY_LABEL } from '../constants';
import { X, ChevronDown, SlidersHorizontal, Search } from 'lucide-react';

interface FilterOptions {
  instituciones: string[];
  pilares: string[];
  complejidades: string[];
  it_bps: string[];
  lideres: string[];
  recursos: string[];
  prioridades: string[];
  aprobar_estimacion: string[];
  presupuesto_habilitado: string[];
  planificacion_aprobada: string[];
}

interface FiltersProps {
  filters: FilterState;
  setFilters: (f: React.SetStateAction<FilterState>) => void;
  options: FilterOptions;
  onPendientesBPs: () => void;
}

/** Retorna el texto visible de una opción, traduciendo el sentinel. */
function optionLabel(opt: string): string {
  return opt === EMPTY_SENTINEL ? EMPTY_LABEL : opt;
}

/** Retorna el estilo de chip para una opción. */
function chipStyle(opt: string): string {
  return opt === EMPTY_SENTINEL
    ? 'bg-amber-100 text-amber-700'
    : 'bg-blue-100 text-blue-700';
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
}

function MultiSelect({ label, field, options, filters, setFilters }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = filters[field] as string[];

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const toggleOption = (val: string) => {
    setFilters(prev => {
      const current = prev[field] as string[];
      const next = current.includes(val)
        ? current.filter(v => v !== val)
        : [...current, val];
      return { ...prev, [field]: next };
    });
  };

  const removeChip = (val: string) => {
    setFilters(prev => ({
      ...prev,
      [field]: (prev[field] as string[]).filter(v => v !== val),
    }));
  };

  const hasSelection = selected.length > 0;
  const availableCount = options.length;

  return (
    <div className={`relative flex-1 min-w-[130px] ${open ? 'z-50' : 'z-10'}`} ref={ref}>
      <label className="block text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-1">
        {label}
        {availableCount > 0 && (
          <span className="ml-1 text-gray-300 normal-case font-normal">({availableCount})</span>
        )}
      </label>

      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={availableCount === 0}
        className={`w-full text-xs text-left rounded-lg border px-2.5 py-1.5 flex items-center justify-between gap-1 transition-all ${
          availableCount === 0
            ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
            : hasSelection
            ? 'border-blue-400 bg-blue-50 text-blue-700 font-medium'
            : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
        }`}
      >
        <span>
          {availableCount === 0
            ? 'Sin opciones'
            : hasSelection
            ? `${selected.length} sel.`
            : 'Todos'}
        </span>
        {availableCount > 0 && (
          <ChevronDown
            size={12}
            className={`flex-shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          />
        )}
      </button>

      {/* Chips de selección activa */}
      {hasSelection && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selected.map(val => (
            <span
              key={val}
              className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${chipStyle(val)}`}
            >
              <span className="max-w-[100px] truncate">{optionLabel(val)}</span>
              <button
                onClick={() => removeChip(val)}
                className="hover:opacity-70 ml-0.5 flex-shrink-0"
                aria-label={`Quitar ${optionLabel(val)}`}
              >
                <X size={9} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Dropdown */}
      {open && availableCount > 0 && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[190px] max-h-60 overflow-y-auto">
          {selected.length > 0 && (
            <button
              onClick={() => setFilters(prev => ({ ...prev, [field]: [] }))}
              className="w-full text-left px-3 py-1.5 text-[11px] text-red-500 hover:bg-red-50 border-b border-gray-100 font-medium"
            >
              Limpiar selección
            </button>
          )}
          {options.map(opt => (
            <label
              key={opt}
              className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs ${
                opt === EMPTY_SENTINEL
                  ? 'text-amber-600 italic border-t border-gray-100'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggleOption(opt)}
                className={`w-3 h-3 flex-shrink-0 ${opt === EMPTY_SENTINEL ? 'accent-amber-500' : 'accent-blue-500'}`}
              />
              <span className="leading-tight">{optionLabel(opt)}</span>
            </label>
          ))}
        </div>
      )}
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
  /** Si hay opciones disponibles según el filtrado actual */
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
  const selected = filters[field] as string[];

  const toggle = (val: string) => {
    setFilters(prev => {
      const current = prev[field] as string[];
      const next = current.includes(val)
        ? current.filter(v => v !== val)
        : [...current, val];
      return { ...prev, [field]: next };
    });
  };

  const siStyle = siColor === 'red'
    ? 'bg-red-100 border-red-400 text-red-700'
    : 'bg-emerald-100 border-emerald-400 text-emerald-700';

  const buttons: Array<{ val: string; label: string; activeStyle: string; baseStyle: string }> = [
    {
      val: 'SI',
      label: 'SI',
      activeStyle: siStyle,
      baseStyle: 'bg-white border-gray-200 text-gray-400',
    },
    {
      val: 'NO',
      label: 'NO',
      activeStyle: 'bg-slate-200 border-slate-400 text-slate-700',
      baseStyle: 'bg-white border-gray-200 text-gray-400',
    },
    {
      val: EMPTY_SENTINEL,
      label: '—',
      activeStyle: 'bg-amber-100 border-amber-400 text-amber-700',
      baseStyle: 'bg-white border-gray-200 text-gray-300',
    },
  ];

  return (
    <div className="flex-[0_0_auto]">
      <label className="block text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-1">
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
              className={`text-xs px-2.5 py-1.5 rounded-lg border font-semibold transition-all ${
                !isAvailable
                  ? 'opacity-30 cursor-not-allowed bg-gray-50 border-gray-100 text-gray-300'
                  : isActive
                  ? btn.activeStyle
                  : `${btn.baseStyle} hover:border-gray-300 hover:text-gray-600`
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
// Componente principal de filtros
// ---------------------------------------------------------------------------
export function Filters({ filters, setFilters, options, onPendientesBPs }: FiltersProps) {
  const totalActive = (Object.values(filters) as string[][]).reduce(
    (sum, arr) => sum + arr.length,
    0
  );

  return (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col">
      {/* Cabecera */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={15} className="text-gray-400" />
          <span className="text-sm font-semibold text-gray-700">Filtros</span>
          {totalActive > 0 && (
            <span className="bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
              {totalActive}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={onPendientesBPs}
            className="text-[11px] px-3 py-1.5 rounded-full border font-bold transition-all shadow-sm bg-white border-purple-200 text-purple-700 hover:bg-purple-50"
          >
            🌟 Ver Pendientes de BPs
          </button>
          
          {totalActive > 0 && (
            <button
              onClick={() => setFilters(INITIAL_FILTERS)}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors font-medium"
            >
              Limpiar todo
            </button>
          )}
        </div>
      </div>

      {/* Barra de Búsqueda */}
      <div className="relative mb-5">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search size={16} className="text-gray-400" />
        </div>
        <input
          type="text"
          placeholder="Buscar por título u objetivo de la iniciativa..."
          value={filters.busqueda || ''}
          onChange={e => setFilters(prev => ({ ...prev, busqueda: e.target.value }))}
          className="w-full pl-10 pr-10 py-2.5 bg-gray-50/50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all placeholder-gray-400 text-gray-700"
        />
        {filters.busqueda && (
          <button
            onClick={() => setFilters(prev => ({ ...prev, busqueda: '' }))}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Filtros multi-valor */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-5">
        <MultiSelect
          label="Institución"
          field="instituciones"
          options={options.instituciones}
          filters={filters}
          setFilters={setFilters}
        />
        <MultiSelect
          label="Pilar Estratégico"
          field="pilares"
          options={options.pilares}
          filters={filters}
          setFilters={setFilters}
        />
        <MultiSelect
          label="Complejidad"
          field="complejidades"
          options={options.complejidades}
          filters={filters}
          setFilters={setFilters}
        />
        <MultiSelect
          label="IT BP"
          field="it_bps"
          options={options.it_bps}
          filters={filters}
          setFilters={setFilters}
        />
        <MultiSelect
          label="Líder de Dominio"
          field="lideres_dominio"
          options={options.lideres}
          filters={filters}
          setFilters={setFilters}
        />
        <MultiSelect
          label="Tipo de Recurso"
          field="tipos_recurso"
          options={options.recursos}
          filters={filters}
          setFilters={setFilters}
        />
        <MultiSelect
          label="Prioridad BRM"
          field="prioridades_brm"
          options={options.prioridades}
          filters={filters}
          setFilters={setFilters}
        />
        <MultiSelect
          label="Aprobar estimación"
          field="aprobar_estimacion"
          options={options.aprobar_estimacion}
          filters={filters}
          setFilters={setFilters}
        />
        <MultiSelect
          label="Presupuesto Habilitado"
          field="presupuesto_habilitado"
          options={options.presupuesto_habilitado}
          filters={filters}
          setFilters={setFilters}
        />
        <MultiSelect
          label="Planificación aprobada"
          field="planificacion_aprobada"
          options={options.planificacion_aprobada}
          filters={filters}
          setFilters={setFilters}
        />

        {/* Toggles booleanos ocupando las celdas restantes */}
        <div className="col-span-full mt-2 pt-4 border-t border-gray-100 flex flex-wrap gap-4 items-start">
          <ToggleFilter
            label="Impacto SOX"
            field="impacto_sox"
            filters={filters}
            setFilters={setFilters}
            siColor="red"
          />
          <ToggleFilter
            label="Proyecto SPO"
            field="proyecto_spo"
            filters={filters}
            setFilters={setFilters}
          />
          <ToggleFilter
            label="Estab. SIS"
            field="estabilizacion_sis"
            filters={filters}
            setFilters={setFilters}
          />
        </div>
      </div>

      {/* Leyenda y estado */}
      {totalActive > 0 ? (
        <div className="text-xs text-gray-400 border-t border-gray-100 pt-3 flex items-center gap-3 flex-wrap">
          <span>
            {totalActive} filtro{totalActive !== 1 ? 's' : ''} activo{totalActive !== 1 ? 's' : ''}
          </span>
          <span className="text-gray-300">·</span>
          <span>OR dentro del mismo campo · AND entre campos</span>
          <span className="text-gray-300">·</span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
            <span className="italic text-amber-600">(Sin asignar)</span>
            {' '}= campo vacío o nulo
          </span>
        </div>
      ) : (
        <div className="text-[11px] text-gray-300 border-t border-gray-50 pt-3">
          Las opciones se actualizan automáticamente según el contexto de los filtros activos.
          El número entre paréntesis indica cuántas opciones están disponibles.
        </div>
      )}
    </div>
  );
}

export type { FilterState };
export type { EtapaPipeline };
