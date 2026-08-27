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

const SHORT_MONTHS = [
  { val: '01', name: 'Ene' },
  { val: '02', name: 'Feb' },
  { val: '03', name: 'Mar' },
  { val: '04', name: 'Abr' },
  { val: '05', name: 'May' },
  { val: '06', name: 'Jun' },
  { val: '07', name: 'Jul' },
  { val: '08', name: 'Ago' },
  { val: '09', name: 'Sep' },
  { val: '10', name: 'Oct' },
  { val: '11', name: 'Nov' },
  { val: '12', name: 'Dic' },
];

const MONTH_NAMES_FULL: Record<string, string> = {
  '01': 'Enero',
  '02': 'Febrero',
  '03': 'Marzo',
  '04': 'Abril',
  '05': 'Mayo',
  '06': 'Junio',
  '07': 'Julio',
  '08': 'Agosto',
  '09': 'Septiembre',
  '10': 'Octubre',
  '11': 'Noviembre',
  '12': 'Diciembre',
};

interface MonthMultiSelectProps {
  mesesField: keyof FilterState;
  filters: FilterState;
  setFilters: (f: React.SetStateAction<FilterState>) => void;
  alignRight?: boolean;
}

function MonthMultiSelect({
  mesesField,
  filters,
  setFilters,
  alignRight = false,
}: MonthMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeYear, setActiveYear] = useState('2026');
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = (filters[mesesField] as string[]) || [];

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  const toggleMonth = (ym: string) => {
    setFilters(prev => {
      const cur = (prev[mesesField] as string[]) || [];
      const next = cur.includes(ym) ? cur.filter(x => x !== ym) : [...cur, ym];
      return { ...prev, [mesesField]: next };
    });
  };

  const clearMonths = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setFilters(prev => ({ ...prev, [mesesField]: [] }));
  };

  // Label formatting
  let displayLabel = 'Elegir mes';
  if (selected.length === 1) {
    const [y, m] = selected[0].split('-');
    const mName = MONTH_NAMES_FULL[m] || m;
    displayLabel = `Mes: ${mName} ${y}`;
  } else if (selected.length > 1) {
    displayLabel = `Meses: ${selected.length} seleccionados`;
  }

  return (
    <div className={`relative ${open ? 'z-50' : 'z-10'}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className={`w-full flex items-center justify-between gap-1 px-2 py-1 rounded-md border text-left transition-all cursor-pointer select-none text-[11px] font-semibold ${
          selected.length > 0
            ? 'bg-blue-50/95 border-blue-400 text-blue-800 shadow-2xs'
            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
        }`}
        title={selected.length > 0 ? selected.join(', ') : 'Filtrar por uno o varios meses'}
      >
        <div className="flex items-center gap-1.5 min-w-0 truncate">
          <Calendar size={12} className={selected.length > 0 ? 'text-blue-600' : 'text-slate-400'} />
          <span className="truncate">{displayLabel}</span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {selected.length > 0 && (
            <span
              onClick={clearMonths}
              className="p-0.5 rounded hover:bg-blue-200 text-blue-700 hover:text-blue-900 cursor-pointer inline-flex items-center"
              title="Limpiar meses"
            >
              <X size={11} />
            </span>
          )}
          <ChevronDown
            size={12}
            className={`text-slate-400 transition-transform duration-150 ${open ? 'rotate-180 text-blue-600' : ''}`}
          />
        </div>
      </button>

      {open && (
        <div
          className={`absolute top-full mt-1.5 w-60 bg-white border border-slate-200/90 rounded-xl shadow-2xl z-50 p-2.5 text-slate-800 animate-in fade-in-50 zoom-in-95 duration-100 ${
            alignRight ? 'right-0' : 'left-0'
          }`}
        >
          {/* Header con pestañas de Año */}
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-100">
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
              {['2025', '2026', '2027'].map(yr => (
                <button
                  key={yr}
                  type="button"
                  onClick={() => setActiveYear(yr)}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                    activeYear === yr
                      ? 'bg-white text-blue-700 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {yr}
                </button>
              ))}
            </div>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => clearMonths()}
                className="text-[10px] font-bold text-red-500 hover:text-red-700 hover:underline cursor-pointer"
              >
                Limpiar ({selected.length})
              </button>
            )}
          </div>

          {/* Grilla 4x3 de Meses */}
          <div className="grid grid-cols-4 gap-1.5 py-1">
            {SHORT_MONTHS.map(m => {
              const ym = `${activeYear}-${m.val}`;
              const isSelected = selected.includes(ym);
              return (
                <button
                  key={m.val}
                  type="button"
                  onClick={() => toggleMonth(ym)}
                  className={`py-1.5 rounded-lg text-[10px] font-bold text-center transition-all cursor-pointer select-none ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-xs scale-102 font-extrabold'
                      : 'bg-slate-50 text-slate-700 hover:bg-blue-50 hover:text-blue-700 border border-slate-200/60'
                  }`}
                  title={`${MONTH_NAMES_FULL[m.val]} ${activeYear}`}
                >
                  {m.name}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="pt-2 mt-1 border-t border-slate-100 flex justify-between items-center px-0.5">
            <span className="text-[10px] text-slate-500 font-medium truncate">
              {selected.length === 0 ? '0 seleccionados' : `${selected.length} mes(es) act.`}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[10px] px-3 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-bold transition-colors cursor-pointer shadow-xs"
            >
              Listo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface DateRangeBlockProps {
  label: string;
  mesesField: keyof FilterState;
  desdeField: keyof FilterState;
  hastaField: keyof FilterState;
  filters: FilterState;
  setFilters: (f: React.SetStateAction<FilterState>) => void;
  accentStyles: { focus: string };
  borderColor: string;
  bgColor: string;
  alignRight?: boolean;
}

function DateRangeBlock({
  label,
  mesesField,
  desdeField,
  hastaField,
  filters,
  setFilters,
  accentStyles,
  borderColor,
  bgColor,
  alignRight = false,
}: DateRangeBlockProps) {
  const selectedMonths = (filters[mesesField] as string[]) || [];
  const desdeVal = (filters[desdeField] as string) || '';
  const hastaVal = (filters[hastaField] as string) || '';
  const hasValue = Boolean(selectedMonths.length > 0 || desdeVal || hastaVal);

  const handleClear = () => {
    setFilters(prev => ({
      ...prev,
      [mesesField]: [],
      [desdeField]: '',
      [hastaField]: '',
    }));
  };

  return (
    <div
      className={`p-2.5 rounded-lg border transition-all flex flex-col gap-2 ${
        hasValue ? `${borderColor} ${bgColor} shadow-2xs` : 'border-slate-200/80 bg-slate-50/60'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">
          {label}
        </span>
        {hasValue && (
          <button
            type="button"
            onClick={handleClear}
            className="text-[8px] font-bold text-red-500 hover:text-red-700 hover:underline cursor-pointer"
          >
            Borrar
          </button>
        )}
      </div>

      {/* Selector Multi-Mes desplegable */}
      <MonthMultiSelect
        mesesField={mesesField}
        filters={filters}
        setFilters={setFilters}
        alignRight={alignRight}
      />

      {/* Días específicos (Desde / Hasta) */}
      <div className="flex flex-col gap-1 pt-1.5 border-t border-slate-200/60">
        <div className="flex items-center gap-1">
          <span className="text-[9px] font-semibold text-slate-400 w-9 shrink-0">Desde</span>
          <input
            type="date"
            value={desdeVal}
            onChange={e => setFilters(prev => ({ ...prev, [desdeField]: e.target.value }))}
            className={`w-full text-[11px] font-mono border border-slate-200 rounded px-1.5 py-0.5 bg-white text-slate-700 focus:outline-none focus:ring-2 ${accentStyles.focus}`}
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] font-semibold text-slate-400 w-9 shrink-0">Hasta</span>
          <input
            type="date"
            value={hastaVal}
            onChange={e => setFilters(prev => ({ ...prev, [hastaField]: e.target.value }))}
            className={`w-full text-[11px] font-mono border border-slate-200 rounded px-1.5 py-0.5 bg-white text-slate-700 focus:outline-none focus:ring-2 ${accentStyles.focus}`}
          />
        </div>
      </div>
    </div>
  );
}

function StageDateCard({
  title,
  stepNum,
  accent,
  inicioMesesField,
  inicioDesdeField,
  inicioHastaField,
  finMesesField,
  finDesdeField,
  finHastaField,
  filters,
  setFilters,
}: {
  title: string;
  stepNum: string;
  accent: 'blue' | 'purple' | 'amber';
  inicioMesesField: keyof FilterState;
  inicioDesdeField: keyof FilterState;
  inicioHastaField: keyof FilterState;
  finMesesField: keyof FilterState;
  finDesdeField: keyof FilterState;
  finHastaField: keyof FilterState;
  filters: FilterState;
  setFilters: (f: React.SetStateAction<FilterState>) => void;
}) {
  const iniMeses = (filters[inicioMesesField] as string[]) || [];
  const iniDesde = (filters[inicioDesdeField] as string) || '';
  const iniHasta = (filters[inicioHastaField] as string) || '';
  const finMeses = (filters[finMesesField] as string[]) || [];
  const finDesde = (filters[finDesdeField] as string) || '';
  const finHasta = (filters[finHastaField] as string) || '';

  const hasIni = Boolean(iniMeses.length > 0 || iniDesde || iniHasta);
  const hasFin = Boolean(finMeses.length > 0 || finDesde || finHasta);
  const activeCount = (hasIni ? 1 : 0) + (hasFin ? 1 : 0);

  const clearAll = () => {
    setFilters(prev => ({
      ...prev,
      [inicioMesesField]: [],
      [inicioDesdeField]: '',
      [inicioHastaField]: '',
      [finMesesField]: [],
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
              className="text-[9px] font-bold text-red-500 hover:text-red-700 flex items-center gap-0.5 px-1 py-0.5 rounded hover:bg-red-50 cursor-pointer"
              title="Limpiar fechas de esta etapa"
            >
              <X size={10} /> Borrar
            </button>
          )}
        </div>
      </div>

      {/* Grid de 2 columnas: Fecha Inicio & Fecha Fin */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <DateRangeBlock
          label="Fecha Inicio"
          mesesField={inicioMesesField}
          desdeField={inicioDesdeField}
          hastaField={inicioHastaField}
          filters={filters}
          setFilters={setFilters}
          accentStyles={accentStyles}
          borderColor="border-blue-300"
          bgColor="bg-blue-50/50"
        />
        <DateRangeBlock
          label="Fecha Fin"
          mesesField={finMesesField}
          desdeField={finDesdeField}
          hastaField={finHastaField}
          filters={filters}
          setFilters={setFilters}
          accentStyles={accentStyles}
          borderColor="border-amber-300"
          bgColor="bg-amber-50/50"
          alignRight={true}
        />
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
      const cur = (prev[field] as string[]) || [];
      const next = cur.includes(val) ? cur.filter(x => x !== val) : [...cur, val];
      return { ...prev, [field]: next };
    });
  };

  const buttons = [
    {
      val: 'SI',
      label: 'SI',
      activeStyle:
        siColor === 'red'
          ? 'bg-red-500 border-red-600 text-white shadow-xs'
          : 'bg-emerald-600 border-emerald-700 text-white shadow-xs',
      baseStyle: 'bg-white border-slate-200 text-slate-700',
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

  // Estado de secciones colapsables (toggle)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    sec1: true,
    sec2: true,
    sec3: true,
    sec4: true,
  });

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const allOpen = Object.values(openSections).every(Boolean);
  const toggleAllSections = () => {
    const nextVal = !allOpen;
    setOpenSections({
      sec1: nextVal,
      sec2: nextVal,
      sec3: nextVal,
      sec4: nextVal,
    });
  };
  
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
    (filters.tipos_recurso?.length || 0);

  const countFechas =
    ((filters.fecha_inicio_estimacion_meses?.length || 0) > 0 ? 1 : 0) +
    (filters.fecha_inicio_estimacion_desde ? 1 : 0) +
    (filters.fecha_inicio_estimacion_hasta ? 1 : 0) +
    ((filters.fecha_fin_estimacion_meses?.length || 0) > 0 ? 1 : 0) +
    (filters.fecha_fin_estimacion_desde ? 1 : 0) +
    (filters.fecha_fin_estimacion_hasta ? 1 : 0) +
    ((filters.fecha_inicio_reestimacion_meses?.length || 0) > 0 ? 1 : 0) +
    (filters.fecha_inicio_reestimacion_desde ? 1 : 0) +
    (filters.fecha_inicio_reestimacion_hasta ? 1 : 0) +
    ((filters.fecha_fin_reestimacion_meses?.length || 0) > 0 ? 1 : 0) +
    (filters.fecha_fin_reestimacion_desde ? 1 : 0) +
    (filters.fecha_fin_reestimacion_hasta ? 1 : 0) +
    ((filters.fecha_inicio_planificada_meses?.length || 0) > 0 ? 1 : 0) +
    (filters.fecha_inicio_planificada_desde ? 1 : 0) +
    (filters.fecha_inicio_planificada_hasta ? 1 : 0) +
    ((filters.fecha_fin_planificada_meses?.length || 0) > 0 ? 1 : 0) +
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

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Botón colapsar / expandir todas las secciones */}
          <button
            type="button"
            onClick={toggleAllSections}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title={allOpen ? 'Colapsar todas las secciones' : 'Expandir todas las secciones'}
          >
            <ChevronDown size={13} className={`transition-transform duration-200 ${allOpen ? 'rotate-180' : ''}`} />
            <span>{allOpen ? 'Colapsar todo' : 'Expandir todo'}</span>
          </button>

          {!isPlanificadas && (
            <button
              onClick={onPendientesBPs}
              className="text-xs px-3.5 py-1.5 rounded-lg border font-bold transition-all shadow-xs bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100 flex items-center gap-1.5 cursor-pointer"
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
      <div className="rounded-xl border border-slate-200/80 bg-white shadow-2xs transition-all">
        <button
          type="button"
          onClick={() => toggleSection('sec1')}
          className={`w-full flex items-center justify-between p-3.5 hover:bg-slate-50/80 transition-colors text-left cursor-pointer select-none bg-slate-50/40 ${
            openSections.sec1 ? 'rounded-t-xl' : 'rounded-xl'
          }`}
          aria-expanded={openSections.sec1}
        >
          <div className="flex items-center gap-2">
            <Building2 size={15} className="text-blue-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              1. Organización y Responsables
            </span>
          </div>
          <div className="flex items-center gap-2">
            {countOrg > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                {countOrg} activo{countOrg !== 1 ? 's' : ''}
              </span>
            )}
            <div className="w-6 h-6 rounded-md bg-slate-100/80 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors">
              <ChevronDown
                size={14}
                className={`transition-transform duration-200 ${openSections.sec1 ? 'rotate-180' : ''}`}
              />
            </div>
          </div>
        </button>

        {openSections.sec1 && (
          <div className="p-3.5 pt-2 border-t border-slate-100 animate-in fade-in-50 duration-150">
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
        )}
      </div>

      {/* ================================================================
          SECCIÓN 2: FLUJO, ESTADO Y CLASIFICACIÓN TÉCNICA
      ================================================================ */}
      <div className="rounded-xl border border-slate-200/80 bg-white shadow-2xs transition-all">
        <button
          type="button"
          onClick={() => toggleSection('sec2')}
          className={`w-full flex items-center justify-between p-3.5 hover:bg-slate-50/80 transition-colors text-left cursor-pointer select-none bg-slate-50/40 ${
            openSections.sec2 ? 'rounded-t-xl' : 'rounded-xl'
          }`}
          aria-expanded={openSections.sec2}
        >
          <div className="flex items-center gap-2">
            <GitBranch size={15} className="text-purple-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              2. Flujo, Estado y Clasificación
            </span>
          </div>
          <div className="flex items-center gap-2">
            {countFlujo > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                {countFlujo} activo{countFlujo !== 1 ? 's' : ''}
              </span>
            )}
            <div className="w-6 h-6 rounded-md bg-slate-100/80 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors">
              <ChevronDown
                size={14}
                className={`transition-transform duration-200 ${openSections.sec2 ? 'rotate-180' : ''}`}
              />
            </div>
          </div>
        </button>

        {openSections.sec2 && (
          <div className="p-3.5 pt-2 border-t border-slate-100 animate-in fade-in-50 duration-150">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
            </div>
          </div>
        )}
      </div>

      {/* ================================================================
          SECCIÓN 3: FECHAS DE INICIO Y FIN POR ETAPA
      ================================================================ */}
      {!isPlanificadas && (
        <div className="rounded-xl border border-amber-200/90 bg-amber-50/20 shadow-2xs transition-all">
          <button
            type="button"
            onClick={() => toggleSection('sec3')}
            className={`w-full flex items-center justify-between p-3.5 hover:bg-amber-50/60 transition-colors text-left cursor-pointer select-none bg-amber-50/40 ${
              openSections.sec3 ? 'rounded-t-xl' : 'rounded-xl'
            }`}
            aria-expanded={openSections.sec3}
          >
            <div className="flex items-center gap-2">
              <Calendar size={15} className="text-amber-600" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                3. Fechas de Inicio y Fin por Etapa
              </span>
            </div>
            <div className="flex items-center gap-2">
              {countFechas > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                  {countFechas} rango{countFechas !== 1 ? 's' : ''} activo{countFechas !== 1 ? 's' : ''}
                </span>
              )}
              <div className="w-6 h-6 rounded-md bg-amber-100/80 flex items-center justify-center text-amber-700 hover:bg-amber-200 transition-colors">
                <ChevronDown
                  size={14}
                  className={`transition-transform duration-200 ${openSections.sec3 ? 'rotate-180' : ''}`}
                />
              </div>
            </div>
          </button>

          {openSections.sec3 && (
            <div className="p-3.5 pt-2 border-t border-amber-200/60 animate-in fade-in-50 duration-150">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                <StageDateCard
                  title="Estimación"
                  stepNum="A"
                  accent="blue"
                  inicioMesesField="fecha_inicio_estimacion_meses"
                  inicioDesdeField="fecha_inicio_estimacion_desde"
                  inicioHastaField="fecha_inicio_estimacion_hasta"
                  finMesesField="fecha_fin_estimacion_meses"
                  finDesdeField="fecha_fin_estimacion_desde"
                  finHastaField="fecha_fin_estimacion_hasta"
                  filters={filters}
                  setFilters={setFilters}
                />
                <StageDateCard
                  title="Re-estimación"
                  stepNum="B"
                  accent="purple"
                  inicioMesesField="fecha_inicio_reestimacion_meses"
                  inicioDesdeField="fecha_inicio_reestimacion_desde"
                  inicioHastaField="fecha_inicio_reestimacion_hasta"
                  finMesesField="fecha_fin_reestimacion_meses"
                  finDesdeField="fecha_fin_reestimacion_desde"
                  finHastaField="fecha_fin_reestimacion_hasta"
                  filters={filters}
                  setFilters={setFilters}
                />
                <StageDateCard
                  title="Planificación"
                  stepNum="C"
                  accent="amber"
                  inicioMesesField="fecha_inicio_planificada_meses"
                  inicioDesdeField="fecha_inicio_planificada_desde"
                  inicioHastaField="fecha_inicio_planificada_hasta"
                  finMesesField="fecha_fin_planificada_meses"
                  finDesdeField="fecha_fin_planificada_desde"
                  finHastaField="fecha_fin_planificada_hasta"
                  filters={filters}
                  setFilters={setFilters}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================================
          SECCIÓN 4: APROBACIONES E INDICADORES CLAVE
      ================================================================ */}
      <div className="rounded-xl border border-slate-200/80 bg-white shadow-2xs transition-all">
        <button
          type="button"
          onClick={() => toggleSection('sec4')}
          className={`w-full flex items-center justify-between p-3.5 hover:bg-slate-50/80 transition-colors text-left cursor-pointer select-none bg-slate-50/40 ${
            openSections.sec4 ? 'rounded-t-xl' : 'rounded-xl'
          }`}
          aria-expanded={openSections.sec4}
        >
          <div className="flex items-center gap-2">
            <ShieldCheck size={15} className="text-emerald-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              {isPlanificadas ? '3. Indicadores Clave' : '4. Aprobaciones e Indicadores'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {countAprob > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                {countAprob} activo{countAprob !== 1 ? 's' : ''}
              </span>
            )}
            <div className="w-6 h-6 rounded-md bg-slate-100/80 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors">
              <ChevronDown
                size={14}
                className={`transition-transform duration-200 ${openSections.sec4 ? 'rotate-180' : ''}`}
              />
            </div>
          </div>
        </button>

        {openSections.sec4 && (
          <div className="p-3.5 pt-2 border-t border-slate-100 animate-in fade-in-50 duration-150">
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
        )}
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

