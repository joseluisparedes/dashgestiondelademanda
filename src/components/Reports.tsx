/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect, startTransition } from 'react';
import { Iniciativa, EtapaPipeline, FilterState } from '../types';
import { ETAPAS_CONFIG, ETAPAS_MAP, ETAPAS_PLANIFICADAS_CONFIG, ETAPAS_PLANIFICADAS_MAP, EMPTY_SENTINEL, EMPTY_LABEL } from '../constants';
import { format, parseISO, differenceInCalendarDays, startOfDay, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
  Cell,
  Legend,
} from 'recharts';
import {
  BarChart2,
  Users,
  Layers,
  Filter,
  X,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Building2,
  ExternalLink,
  UserCheck,
  GitBranch,
  UserCog,
  AlertTriangle,
  Clock,
  CalendarX,
  RotateCcw,
  LayoutGrid,
  Eye,
  ArrowLeft,
  Columns3,
  ArrowUpDown,
  Search,
  GripVertical,
  Calendar,
  Flag,
  CheckCircle2,
  Download,
  Check,
} from 'lucide-react';
import { IniciativaDetailModal } from './DataTable';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type NavigateFn = (partialFilters: Partial<FilterState>) => void;

export type OutOfDateCategory = 'consolidado' | 'estimacion' | 'reestimacion' | 'planificacion';

export interface OutOfDateItem {
  iniciativa: Iniciativa;
  category: 'estimacion' | 'reestimacion' | 'planificacion';
  reason: string;
  delayDays: number;
}

export interface PopupCustomData {
  title: string;
  subtitle: string;
  category: 'standard' | 'estimacion' | 'reestimacion' | 'planificacion' | 'consolidado';
  items: OutOfDateItem[];
}

interface ReportsProps {
  iniciativas: Iniciativa[];
  onNavigate: NavigateFn;
  mode?: 'demanda' | 'planificadas';
}

interface MacroFilters {
  instituciones: string[];
  proyecto_spo: string[];
  it_bps: string[];
  vp_solicitantes: string[];
  etapas: string[];
  lideres_dominio: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function optLabel(v: string, labelFn?: (v: string) => string): string {
  if (v === EMPTY_SENTINEL) return EMPTY_LABEL;
  return labelFn ? labelFn(v) : v;
}

function buildMacroOptions(
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

function fmtDatePopup(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return format(parseISO(d), 'dd MMM yyyy', { locale: es });
  } catch {
    return '—';
  }
}

function fmtDateShort(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return format(parseISO(d), 'dd/MM/yyyy');
  } catch {
    return '—';
  }
}

// ---------------------------------------------------------------------------
// Evaluadores de Fuera de Fechas
// ---------------------------------------------------------------------------

function checkFueraFechaEstimacion(
  i: Iniciativa,
  refDate: Date = new Date()
): { isOutOfDate: boolean; reason: string; delayDays: number } {
  // REGLA: Solo considerar iniciativas estrictamente en etapa "Por Estimar"
  if (i.etapa_actual !== 'por_estimar') {
    return { isOutOfDate: false, reason: '', delayDays: 0 };
  }

  const hasAsig = Boolean(i.fecha_asignacion);
  const hasFin = Boolean(i.fecha_fin_estimacion);

  // Caso 1: Sin fecha de asignación al LD ni fecha fin de estimación
  if (!hasAsig && !hasFin) {
    return {
      isOutOfDate: true,
      reason: 'Pendiente de estimar: Sin fecha de asignación al LD ni fecha fin',
      delayDays: 0,
    };
  }

  // Caso 2: Sin fecha de asignación de Líder de Dominio (pero con fecha fin)
  if (!hasAsig && hasFin) {
    try {
      const finDate = parseISO(i.fecha_fin_estimacion!);
      if (finDate < refDate) {
        return {
          isOutOfDate: true,
          reason: 'Fecha Fin de Estimación vencida respecto a hoy (sin asignación LD)',
          delayDays: Math.max(1, differenceInCalendarDays(refDate, finDate)),
        };
      }
    } catch {
      // ignore
    }
    return {
      isOutOfDate: true,
      reason: 'Pendiente de estimar: Sin fecha de asignación al Líder de Dominio',
      delayDays: 0,
    };
  }

  // Caso 3: Tiene fecha de asignación de Líder de Dominio pero NO tiene fecha fin de estimación
  if (hasAsig && !hasFin) {
    try {
      const asigDate = parseISO(i.fecha_asignacion!);
      const daysSinceAsig = differenceInCalendarDays(refDate, asigDate);
      if (daysSinceAsig <= 5) {
        return {
          isOutOfDate: true,
          reason: `Pendiente de estimar: En plazo SLA (asignado hace ${Math.max(0, daysSinceAsig)} d, sin fecha fin)`,
          delayDays: 0,
        };
      } else {
        return {
          isOutOfDate: true,
          reason: `Pendiente de estimar: Fuera de SLA (> 5 días de asignado al LD, sin fecha fin)`,
          delayDays: Math.max(1, daysSinceAsig - 5),
        };
      }
    } catch {
      return {
        isOutOfDate: true,
        reason: 'Pendiente de estimar: Sin fecha fin de estimación programada',
        delayDays: 0,
      };
    }
  }

  // Caso 4: Tiene ambas fechas (asignación y fecha fin)
  if (hasAsig && hasFin) {
    try {
      const finDate = parseISO(i.fecha_fin_estimacion!);
      if (finDate < refDate) {
        return {
          isOutOfDate: true,
          reason: 'Fecha Fin de Estimación vencida respecto a hoy',
          delayDays: Math.max(1, differenceInCalendarDays(refDate, finDate)),
        };
      }

      // Si la fecha fin no ha vencido, pero se asignó recientemente dentro de los 5 días de SLA
      const asigDate = parseISO(i.fecha_asignacion!);
      const daysSinceAsig = differenceInCalendarDays(refDate, asigDate);
      if (daysSinceAsig <= 5 && daysSinceAsig >= 0) {
        return {
          isOutOfDate: true,
          reason: `Pendiente de estimar: En plazo SLA (asignado hace ${daysSinceAsig} d)`,
          delayDays: 0,
        };
      }
    } catch {
      // ignore
    }
  }

  return { isOutOfDate: false, reason: '', delayDays: 0 };
}

function checkFueraFechaReestimacion(
  i: Iniciativa,
  refDate: Date = new Date()
): { isOutOfDate: boolean; reason: string; delayDays: number } {
  // REGLA: Solo considerar iniciativas en estado "Por Reestimar"
  if (i.etapa_actual !== 'por_reestimar') {
    return { isOutOfDate: false, reason: '', delayDays: 0 };
  }

  // Comparar ÚNICAMENTE Fecha Fin de Re-estimación vs HOY
  if (i.fecha_fin_reestimacion) {
    try {
      const finDate = parseISO(i.fecha_fin_reestimacion);
      if (finDate < refDate) {
        return {
          isOutOfDate: true,
          reason: 'Fecha Fin de Re-estimación vencida respecto a hoy',
          delayDays: Math.max(1, differenceInCalendarDays(refDate, finDate)),
        };
      }
    } catch {
      // ignore
    }
  }

  // Si está en estado Por Reestimar sin fecha fin programada
  return {
    isOutOfDate: true,
    reason: 'En etapa Por Reestimar (sin fecha fin programada)',
    delayDays: i.fecha_asignacion ? Math.max(1, differenceInCalendarDays(refDate, parseISO(i.fecha_asignacion))) : 0,
  };
}

function checkFueraFechaPlanificacion(
  i: Iniciativa,
  refDate: Date = new Date()
): { isOutOfDate: boolean; reason: string; delayDays: number } {
  // REGLA: Solo considerar iniciativas en estado "Por Planificar" que tienen fechas de inicio y/o fin vacías
  if (i.etapa_actual !== 'por_planificar') {
    return { isOutOfDate: false, reason: '', delayDays: 0 };
  }

  const sinInicio = !i.fecha_inicio_planificada;
  const sinFin = !i.fecha_fin_planificada;

  // Si tiene ambas fechas de inicio y fin de planificación vacías
  if (sinInicio && sinFin) {
    let delay = 0;
    if (i.fecha_asignacion) {
      try {
        delay = Math.max(0, differenceInCalendarDays(refDate, parseISO(i.fecha_asignacion)));
      } catch {
        delay = 0;
      }
    }
    return {
      isOutOfDate: true,
      reason: 'Por Planificar: Sin fecha de inicio ni fin de planificación',
      delayDays: delay,
    };
  }

  // Si tiene fecha fin de planificación vacía
  if (sinFin) {
    return {
      isOutOfDate: true,
      reason: 'Por Planificar: Sin fecha fin de planificación',
      delayDays: 0,
    };
  }

  // Si tiene fecha inicio de planificación vacía
  if (sinInicio) {
    return {
      isOutOfDate: true,
      reason: 'Por Planificar: Sin fecha inicio de planificación',
      delayDays: 0,
    };
  }

  return { isOutOfDate: false, reason: '', delayDays: 0 };
}

// ---------------------------------------------------------------------------
// Configuración Centralizada de Colores y Estilos para Motivos / Diagnósticos
// ---------------------------------------------------------------------------
export interface MotivoStyleConfig {
  bg: string;
  border: string;
  color: string;
  dotColor: string;
  badgeLabel?: string;
}

export function getMotivoStyle(reason: string = '', category?: OutOfDateCategory): MotivoStyleConfig {
  const r = (reason || '').toLowerCase();

  // 1. En plazo SLA (<= 5 días de asignación al LD)
  if (r.includes('en plazo sla')) {
    return {
      bg: '#dcfce7',
      border: '#86efac',
      color: '#166534',
      dotColor: '#10b981',
      badgeLabel: 'En plazo SLA',
    };
  }

  // 2. Fuera de SLA (> 5 días de asignación al LD)
  if (r.includes('fuera de sla')) {
    return {
      bg: '#ffedd5',
      border: '#fed7aa',
      color: '#9a3412',
      dotColor: '#f97316',
      badgeLabel: 'Fuera de SLA',
    };
  }

  // 3. Planificación (Sin fechas, sin fin, sin inicio)
  if (category === 'planificacion' || r.includes('planificar')) {
    return {
      bg: '#ffe4e6',
      border: '#fda4af',
      color: '#9f1239',
      dotColor: '#f43f5e',
      badgeLabel: 'Planificación sin fechas',
    };
  }

  // 4. Re-estimación
  if (category === 'reestimacion' || r.includes('reestimación') || r.includes('re-estimación')) {
    if (r.includes('vencida')) {
      return {
        bg: '#fee2e2',
        border: '#fca5a5',
        color: '#991b1b',
        dotColor: '#ef4444',
        badgeLabel: 'Re-estimación vencida',
      };
    }
    return {
      bg: '#ede9fe',
      border: '#c4b5fd',
      color: '#5b21b6',
      dotColor: '#8b5cf6',
      badgeLabel: 'Re-estimación sin fin',
    };
  }

  // 5. Fecha Fin Vencida respecto a hoy
  if (r.includes('vencida')) {
    return {
      bg: '#fee2e2',
      border: '#fca5a5',
      color: '#991b1b',
      dotColor: '#ef4444',
      badgeLabel: 'Fecha fin vencida',
    };
  }

  // 6. Sin fechas de asignación o fin
  if (r.includes('sin fecha') || r.includes('sin asignación')) {
    return {
      bg: '#fef9c3',
      border: '#fde047',
      color: '#854d0e',
      dotColor: '#eab308',
      badgeLabel: 'Sin fechas',
    };
  }

  // Fallback por defecto
  return {
    bg: '#f1f5f9',
    border: '#cbd5e1',
    color: '#334155',
    dotColor: '#64748b',
    badgeLabel: 'Pendiente',
  };
}

export function MotivoBadgeChip({
  reason,
  category,
  fullText = true,
  style,
}: {
  reason: string;
  category?: OutOfDateCategory;
  fullText?: boolean;
  style?: React.CSSProperties;
}) {
  const conf = getMotivoStyle(reason, category);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 10.5,
        fontWeight: 700,
        padding: '2.5px 8px',
        borderRadius: 6,
        backgroundColor: conf.bg,
        border: `1px solid ${conf.border}`,
        color: conf.color,
        lineHeight: 1.3,
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
        whiteSpace: fullText ? 'normal' : 'nowrap',
        textAlign: 'left',
        ...style,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: conf.dotColor,
          flexShrink: 0,
        }}
      />
      <span>{fullText ? reason : conf.badgeLabel || reason}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// MacroMultiSelect — dropdown multi-selección compacto
// ---------------------------------------------------------------------------
interface MacroMultiSelectProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  icon?: React.ReactNode;
  labelFn?: (v: string) => string;
  isMotivoSelect?: boolean;
  placeholder?: string;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function MacroMultiSelect({
  label,
  options,
  selected,
  onChange,
  icon,
  labelFn,
  isMotivoSelect = false,
  placeholder,
  isOpen,
  onOpenChange,
}: MacroMultiSelectProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isOpen !== undefined ? isOpen : internalOpen;
  const setOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    const val = typeof next === 'function' ? next(open) : next;
    if (onOpenChange) onOpenChange(val);
    else setInternalOpen(val);
  };

  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', onOut);
    return () => document.removeEventListener('mousedown', onOut);
  }, []);

  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);

  const hasSelection = selected.length > 0;
  const displayLabel = (v: string) => optLabel(v, labelFn);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase().trim();
    return options.filter(opt => displayLabel(opt).toLowerCase().includes(q));
  }, [options, search, labelFn]);

  return (
    <div ref={ref} style={{ position: 'relative', zIndex: open ? 9000 : 1 }}>
      {/* Label */}
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: '#475569',
          marginBottom: 5,
        }}
      >
        <span style={{ color: '#3b82f6' }}>{icon}</span>
        <span>{label}</span>
        {options.length > 0 && (
          <span style={{ color: '#94a3b8', fontWeight: 500, fontSize: 9 }}>({options.length})</span>
        )}
      </label>

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={options.length === 0}
        style={{
          width: '100%',
          textAlign: 'left',
          fontSize: 11,
          borderRadius: 8,
          border: hasSelection ? '1.5px solid #3b82f6' : '1.5px solid #cbd5e1',
          background: hasSelection ? '#eff6ff' : '#ffffff',
          color: hasSelection ? '#1d4ed8' : '#334155',
          fontWeight: hasSelection ? 700 : 500,
          padding: '6px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 4,
          cursor: options.length === 0 ? 'not-allowed' : 'pointer',
          boxShadow: hasSelection ? '0 1px 3px rgba(59, 130, 246, 0.15)' : '0 1px 2px rgba(0,0,0,0.03)',
          transition: 'all 0.15s',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
          {options.length === 0
            ? 'Sin opciones'
            : hasSelection
            ? selected.length === 1
              ? displayLabel(selected[0]).slice(0, 22) + (displayLabel(selected[0]).length > 22 ? '…' : '')
              : `${selected.length} seleccionados`
            : placeholder || 'Todos'}
        </span>
        <ChevronDown
          size={12}
          style={{
            flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'none',
            color: hasSelection ? '#2563eb' : '#64748b',
            transition: 'transform 0.15s',
          }}
        />
      </button>

      {/* Chips de selección */}
      {hasSelection && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
          {selected.map(v => {
            if (isMotivoSelect) {
              const conf = getMotivoStyle(v);
              return (
                <span
                  key={v}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 9.5,
                    padding: '2px 7px',
                    borderRadius: 6,
                    background: conf.bg,
                    color: conf.color,
                    fontWeight: 700,
                    border: `1px solid ${conf.border}`,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      backgroundColor: conf.dotColor,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {displayLabel(v)}
                  </span>
                  <button
                    onClick={e => { e.stopPropagation(); toggle(v); }}
                    style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: conf.color }}
                  >
                    <X size={10} />
                  </button>
                </span>
              );
            }
            return (
              <span
                key={v}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 9,
                  padding: '2px 7px',
                  borderRadius: 20,
                  background: '#eff6ff',
                  color: '#1d4ed8',
                  fontWeight: 700,
                  border: '1px solid #bfdbfe',
                }}
              >
                <span style={{ maxWidth: 95, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {displayLabel(v)}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); toggle(v); }}
                  style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#3b82f6' }}
                >
                  <X size={9} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Dropdown */}
      {open && options.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            boxShadow: '0 12px 28px -4px rgba(0,0,0,0.12), 0 4px 10px rgba(0,0,0,0.04)',
            minWidth: isMotivoSelect ? 280 : 230,
            maxWidth: isMotivoSelect ? 360 : 300,
            maxHeight: 320,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 99999,
          }}
        >
          {/* Cabecera de acciones rápidas */}
          <div
            style={{
              display: 'flex',
              borderBottom: '1px solid #f1f5f9',
              background: '#f8fafc',
            }}
          >
            <button
              type="button"
              onClick={() => onChange([...options])}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: '6px 8px',
                fontSize: 10.5,
                color: '#2563eb',
                background: 'transparent',
                border: 'none',
                borderRight: hasSelection ? '1px solid #e2e8f0' : 'none',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              Seleccionar todas
            </button>
            {hasSelection && (
              <button
                type="button"
                onClick={() => onChange([])}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  padding: '6px 8px',
                  fontSize: 10.5,
                  color: '#ef4444',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Limpiar selección
              </button>
            )}
          </div>

          {/* Buscador interno si hay más de 6 opciones */}
          {options.length > 6 && (
            <div style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: '#f8fafc',
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: '1px solid #e2e8f0',
                }}
              >
                <Search size={11} style={{ color: '#94a3b8' }} />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar..."
                  style={{ border: 'none', background: 'transparent', fontSize: 11, outline: 'none', width: '100%', color: '#1e293b' }}
                  onClick={e => e.stopPropagation()}
                />
                {search && (
                  <button type="button" onClick={() => setSearch('')} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: '#94a3b8' }}>
                    <X size={10} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Lista de opciones scrolleable */}
          <div style={{ overflowY: 'auto', maxHeight: 230 }}>
            {filteredOptions.length === 0 ? (
              <div style={{ padding: '12px 14px', fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
                No hay coincidencias
              </div>
            ) : (
              filteredOptions.map(opt => {
                const isSelected = selected.includes(opt);
                if (isMotivoSelect) {
                  const conf = getMotivoStyle(opt);
                  return (
                    <label
                      key={opt}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 10px',
                        cursor: 'pointer',
                        background: isSelected ? '#f8fafc' : 'transparent',
                        borderBottom: '1px solid #f8fafc',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = '#f8fafc'; }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = isSelected ? '#f8fafc' : 'transparent'; }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggle(opt)}
                        style={{ width: 13, height: 13, accentColor: conf.dotColor, flexShrink: 0 }}
                      />
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          fontSize: 10.5,
                          fontWeight: isSelected ? 800 : 600,
                          padding: '3px 8px',
                          borderRadius: 6,
                          backgroundColor: conf.bg,
                          border: `1px solid ${conf.border}`,
                          color: conf.color,
                          lineHeight: 1.25,
                          textAlign: 'left',
                        }}
                      >
                        <span
                          style={{
                            width: 5.5,
                            height: 5.5,
                            borderRadius: '50%',
                            backgroundColor: conf.dotColor,
                            flexShrink: 0,
                          }}
                        />
                        {displayLabel(opt)}
                      </span>
                    </label>
                  );
                }
                return (
                  <label
                    key={opt}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '7px 12px',
                      fontSize: 11,
                      color: opt === EMPTY_SENTINEL ? '#b45309' : isSelected ? '#1d4ed8' : '#334155',
                      cursor: 'pointer',
                      fontWeight: isSelected ? 700 : 400,
                      fontStyle: opt === EMPTY_SENTINEL ? 'italic' : 'normal',
                      background: isSelected ? '#eff6ff' : 'transparent',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = '#f8fafc'; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(opt)}
                      style={{ width: 13, height: 13, accentColor: '#3b82f6', flexShrink: 0 }}
                    />
                    <span>{displayLabel(opt)}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toggle SPO
// ---------------------------------------------------------------------------
function SpoToggle({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const OPTIONS = [
    { val: 'SI', label: 'SI', activeBg: '#ecfdf5', activeBorder: '#10b981', activeColor: '#047857' },
    { val: 'NO', label: 'NO', activeBg: '#f1f5f9', activeBorder: '#64748b', activeColor: '#334155' },
    { val: EMPTY_SENTINEL, label: '—', activeBg: '#fffbeb', activeBorder: '#f59e0b', activeColor: '#b45309' },
  ];
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);

  return (
    <div>
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: '#475569',
          marginBottom: 5,
        }}
      >
        <span>Proyecto SPO</span>
      </label>
      <div style={{ display: 'flex', gap: 5 }}>
        {OPTIONS.map(o => {
          const active = selected.includes(o.val);
          return (
            <button
              key={o.val}
              type="button"
              onClick={() => toggle(o.val)}
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '6px 12px',
                borderRadius: 8,
                border: `1.5px solid ${active ? o.activeBorder : '#cbd5e1'}`,
                background: active ? o.activeBg : '#ffffff',
                color: active ? o.activeColor : '#64748b',
                cursor: 'pointer',
                boxShadow: active ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tooltip recharts
// ---------------------------------------------------------------------------
function ReportTooltip({
  active, payload, label,
}: {
  active?: boolean;
  payload?: { value: number; name: string; fill?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12 }}>
      {label && <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: p.fill || '#94a3b8', flexShrink: 0 }} />
          {p.name}: <span style={{ fontWeight: 700, color: '#0f172a' }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReportCard
// ---------------------------------------------------------------------------
function ReportCard({
  title,
  icon,
  badge,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#3b82f6', display: 'flex' }}>{icon}</span>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', letterSpacing: '-0.01em', margin: 0 }}>{title}</h3>
          {badge}
        </div>
        <span style={{ fontSize: 10, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 3 }}>
          <ExternalLink size={10} /> Haz clic en filas o gráficos para ver detalle
        </span>
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Leyenda etapas
// ---------------------------------------------------------------------------
function EtapasLegend({ etapas }: { etapas: any[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
      {etapas.map(e => (
        <span key={e.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#475569', padding: '2px 8px', borderRadius: 20, background: e.bgColor, border: `1px solid ${e.color}22` }}>
          <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 2, background: e.color }} />
          {e.label}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EtapaBadge clickeable
// ---------------------------------------------------------------------------
function EtapaBadge({
  etapaId, count, navFilters, onNavigate,
}: {
  key?: React.Key;
  etapaId: EtapaPipeline;
  count: number;
  navFilters: Partial<FilterState>;
  onNavigate: NavigateFn;
}) {
  const cfg = ETAPAS_CONFIG.find(e => e.id === etapaId) || ETAPAS_PLANIFICADAS_CONFIG.find(e => e.id === etapaId);
  const [hov, setHov] = useState(false);
  if (!cfg || count === 0) return null;
  return (
    <span
      onClick={() => onNavigate({ ...navFilters, etapas: [etapaId] })}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={`Ver: ${cfg.label}`}
      style={{
        fontSize: 10, padding: '2px 8px', borderRadius: 20,
        background: cfg.bgColor, color: cfg.textColor, fontWeight: 600,
        border: `1.5px solid ${hov ? cfg.color : cfg.color + '44'}`,
        boxShadow: hov ? `0 0 0 3px ${cfg.color}22` : 'none',
        cursor: 'pointer', whiteSpace: 'nowrap',
        transition: 'all 0.12s', display: 'inline-flex', alignItems: 'center', gap: 3,
      }}
    >
      {cfg.label}: {count}
    </span>
  );
}

// ---------------------------------------------------------------------------
// ClickableCell
// ---------------------------------------------------------------------------
function ClickableCell({ label, onClick, title }: { label: string; onClick: () => void; title?: string }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      type="button" onClick={onClick} title={title}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 5,
        color: hov ? '#1d4ed8' : '#2563eb', fontWeight: 600, fontSize: 12,
        textDecoration: hov ? 'underline' : 'none', transition: 'color 0.12s',
      }}
    >
      {label}
      <ExternalLink size={11} style={{ flexShrink: 0, opacity: hov ? 1 : 0.35, transition: 'opacity 0.12s' }} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// ClickableCard (Estado)
// ---------------------------------------------------------------------------
function ClickableCard({
  children, onClick, title, borderColor, bg,
}: {
  key?: React.Key;
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  borderColor: string;
  bg: string;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={onClick} title={title}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        borderRadius: 12, border: `1.5px solid ${hov ? borderColor : borderColor + '44'}`,
        background: bg, padding: '14px 16px',
        display: 'flex', flexDirection: 'column', gap: 6,
        cursor: 'pointer',
        boxShadow: hov ? `0 4px 16px ${borderColor}22` : 'none',
        transform: hov ? 'translateY(-1px)' : 'none',
        transition: 'all 0.15s ease',
      }}
    >
      {children}
    </div>
  );
}

// Interfaz y Helpers para insignias estructuradas y coloridas de motivos
interface MotivoBadgeItem {
  key: string;
  count: number;
  label: string;
  bg: string;
  border: string;
  color: string;
  dotColor?: string;
}

function getEstimacionBadgeItems(items: OutOfDateItem[]): MotivoBadgeItem[] {
  let vencidas = 0;
  let enSLA = 0;
  let fueraSLA = 0;
  let sinAsignacion = 0;
  let sinFin = 0;

  items.forEach(it => {
    const r = (it.reason || '').toLowerCase();
    if (r.includes('en plazo sla')) {
      enSLA++;
    } else if (r.includes('fuera de sla')) {
      fueraSLA++;
    } else if (r.includes('vencida')) {
      vencidas++;
    } else if (r.includes('sin fecha de asignación') && r.includes('ni fecha fin')) {
      sinAsignacion++;
      sinFin++;
    } else if (r.includes('sin fecha de asignación') || r.includes('sin asignación')) {
      sinAsignacion++;
    } else if (r.includes('sin fecha fin')) {
      sinFin++;
    } else {
      vencidas++;
    }
  });

  const badges: MotivoBadgeItem[] = [];

  if (vencidas > 0) {
    badges.push({
      key: 'vencidas',
      count: vencidas,
      label: `${vencidas} vencida${vencidas > 1 ? 's' : ''}`,
      bg: '#fee2e2',
      border: '#fca5a5',
      color: '#991b1b',
      dotColor: '#ef4444',
    });
  }

  if (enSLA > 0) {
    badges.push({
      key: 'enSLA',
      count: enSLA,
      label: `${enSLA} en SLA`,
      bg: '#dcfce7',
      border: '#86efac',
      color: '#166534',
      dotColor: '#10b981',
    });
  }

  if (fueraSLA > 0) {
    badges.push({
      key: 'fueraSLA',
      count: fueraSLA,
      label: `${fueraSLA} fuera SLA`,
      bg: '#ffedd5',
      border: '#fed7aa',
      color: '#9a3412',
      dotColor: '#f97316',
    });
  }

  if (sinAsignacion > 0 && sinFin > 0 && vencidas === 0 && enSLA === 0 && fueraSLA === 0) {
    badges.push({
      key: 'sinFechas',
      count: items.length,
      label: `${items.length} sin fechas`,
      bg: '#fef9c3',
      border: '#fde047',
      color: '#854d0e',
      dotColor: '#eab308',
    });
  } else {
    if (sinAsignacion > 0 && !badges.some(b => b.key === 'sinFechas')) {
      badges.push({
        key: 'sinAsig',
        count: sinAsignacion,
        label: `${sinAsignacion} sin asig.`,
        bg: '#fef9c3',
        border: '#fde047',
        color: '#854d0e',
        dotColor: '#eab308',
      });
    }
    if (sinFin > 0 && !badges.some(b => b.key === 'sinFechas')) {
      badges.push({
        key: 'sinFin',
        count: sinFin,
        label: `${sinFin} sin fin`,
        bg: '#fef9c3',
        border: '#fde047',
        color: '#854d0e',
        dotColor: '#eab308',
      });
    }
  }

  return badges;
}

function getReestimacionBadgeItems(items: OutOfDateItem[]): MotivoBadgeItem[] {
  let vencidas = 0;
  let sinFin = 0;

  items.forEach(it => {
    if ((it.reason || '').toLowerCase().includes('vencida')) vencidas++;
    else sinFin++;
  });

  const badges: MotivoBadgeItem[] = [];
  if (vencidas > 0) {
    badges.push({
      key: 'reestVencidas',
      count: vencidas,
      label: `${vencidas} vencida${vencidas > 1 ? 's' : ''}`,
      bg: '#ede9fe',
      border: '#c4b5fd',
      color: '#5b21b6',
      dotColor: '#8b5cf6',
    });
  }
  if (sinFin > 0) {
    badges.push({
      key: 'reestSinFin',
      count: sinFin,
      label: `${sinFin} sin fin`,
      bg: '#f5f3ff',
      border: '#ddd6fe',
      color: '#6d28d9',
      dotColor: '#a78bfa',
    });
  }
  return badges;
}

function getPlanificacionBadgeItems(items: OutOfDateItem[]): MotivoBadgeItem[] {
  let sinAmbas = 0;
  let sinFin = 0;
  let sinInicio = 0;

  items.forEach(it => {
    const r = (it.reason || '').toLowerCase();
    if (r.includes('ni fin')) sinAmbas++;
    else if (r.includes('fin')) sinFin++;
    else if (r.includes('inicio')) sinInicio++;
    else sinAmbas++;
  });

  const badges: MotivoBadgeItem[] = [];
  if (sinAmbas > 0) {
    badges.push({
      key: 'planSinFechas',
      count: sinAmbas,
      label: `${sinAmbas} sin fechas`,
      bg: '#ffe4e6',
      border: '#fda4af',
      color: '#9f1239',
      dotColor: '#f43f5e',
    });
  }
  if (sinFin > 0) {
    badges.push({
      key: 'planSinFin',
      count: sinFin,
      label: `${sinFin} sin fin`,
      bg: '#fff1f2',
      border: '#fecdd3',
      color: '#be123c',
      dotColor: '#fb7185',
    });
  }
  if (sinInicio > 0) {
    badges.push({
      key: 'planSinInicio',
      count: sinInicio,
      label: `${sinInicio} sin inicio`,
      bg: '#fff1f2',
      border: '#fecdd3',
      color: '#be123c',
      dotColor: '#fb7185',
    });
  }
  return badges;
}

function MotivosBadgesList({ badges }: { badges: MotivoBadgeItem[] }) {
  if (badges.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center', marginTop: 4 }}>
      {badges.map(b => (
        <span
          key={b.key}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 7px',
            borderRadius: 6,
            backgroundColor: b.bg,
            border: `1px solid ${b.border}`,
            color: b.color,
            whiteSpace: 'nowrap',
            lineHeight: 1.2,
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
          }}
        >
          {b.dotColor && (
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                backgroundColor: b.dotColor,
                flexShrink: 0,
              }}
            />
          )}
          {b.label}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NUEVO COMPONENTE: Control y Seguimiento de Tiempos por Líder de Dominio
// ---------------------------------------------------------------------------

interface ReporteLideresFueraFechaProps {
  iniciativas: Iniciativa[];
  onOpenCustomPopup: (data: PopupCustomData) => void;
}

export function ReporteLideresFueraFecha({ iniciativas, onOpenCustomPopup }: ReporteLideresFueraFechaProps) {
  const [activeTab, setActiveTab] = useState<OutOfDateCategory>('consolidado');
  const [sortField, setSortField] = useState<'total' | 'lider' | 'delay'>('total');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [hiddenConsolidatedCols, setHiddenConsolidatedCols] = useState<Set<string>>(new Set());
  const [showConsolidatedColPicker, setShowConsolidatedColPicker] = useState(false);

  const CONSOLIDATED_COLUMNS = [
    { id: 'lider', label: 'Líder de Dominio' },
    { id: 'estimacion', label: 'Estimaciones' },
    { id: 'reestimacion', label: 'Re-estimaciones' },
    { id: 'planificacion', label: 'Planificación' },
    { id: 'total', label: 'Total Desfases' },
    { id: 'accion', label: 'Acción' },
  ];

  const toggleConsolidatedCol = (id: string) => {
    setHiddenConsolidatedCols(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (CONSOLIDATED_COLUMNS.length - next.size > 1) {
          next.add(id);
        }
      }
      return next;
    });
  };

  const showAllConsolidatedCols = () => {
    setHiddenConsolidatedCols(new Set());
  };

  const refDate = useMemo(() => new Date(), []);

  // Calcular ítems fuera de fecha para cada etapa (alimentado por las iniciativas ya filtradas)
  const {
    itemsEstimacion,
    itemsReestimacion,
    itemsPlanificacion,
    allOutOfDateItems,
  } = useMemo(() => {
    const est: OutOfDateItem[] = [];
    const reest: OutOfDateItem[] = [];
    const plan: OutOfDateItem[] = [];

    iniciativas.forEach(i => {
      const resEst = checkFueraFechaEstimacion(i, refDate);
      if (resEst.isOutOfDate) {
        est.push({ iniciativa: i, category: 'estimacion', reason: resEst.reason, delayDays: resEst.delayDays });
      }

      const resReest = checkFueraFechaReestimacion(i, refDate);
      if (resReest.isOutOfDate) {
        reest.push({ iniciativa: i, category: 'reestimacion', reason: resReest.reason, delayDays: resReest.delayDays });
      }

      const resPlan = checkFueraFechaPlanificacion(i, refDate);
      if (resPlan.isOutOfDate) {
        plan.push({ iniciativa: i, category: 'planificacion', reason: resPlan.reason, delayDays: resPlan.delayDays });
      }
    });

    return {
      itemsEstimacion: est,
      itemsReestimacion: reest,
      itemsPlanificacion: plan,
      allOutOfDateItems: [...est, ...reest, ...plan],
    };
  }, [iniciativas, refDate]);

  // Agrupación por Líder de Dominio
  const summaryByLider = useMemo(() => {
    const map: Record<
      string,
      {
        lider: string;
        estimacionCount: number;
        reestimacionCount: number;
        planificacionCount: number;
        totalCount: number;
        maxDelay: number;
        avgDelay: number;
        itemsEst: OutOfDateItem[];
        itemsReest: OutOfDateItem[];
        itemsPlan: OutOfDateItem[];
        itemsAll: OutOfDateItem[];
      }
    > = {};

    const add = (item: OutOfDateItem) => {
      const lid = normalize(item.iniciativa.lider_dominio);
      if (!map[lid]) {
        map[lid] = {
          lider: lid,
          estimacionCount: 0,
          reestimacionCount: 0,
          planificacionCount: 0,
          totalCount: 0,
          maxDelay: 0,
          avgDelay: 0,
          itemsEst: [],
          itemsReest: [],
          itemsPlan: [],
          itemsAll: [],
        };
      }
      const entry = map[lid];
      entry.itemsAll.push(item);
      entry.totalCount++;
      if (item.delayDays > entry.maxDelay) entry.maxDelay = item.delayDays;

      if (item.category === 'estimacion') {
        entry.estimacionCount++;
        entry.itemsEst.push(item);
      } else if (item.category === 'reestimacion') {
        entry.reestimacionCount++;
        entry.itemsReest.push(item);
      } else if (item.category === 'planificacion') {
        entry.planificacionCount++;
        entry.itemsPlan.push(item);
      }
    };

    allOutOfDateItems.forEach(add);

    // Calcular promedios
    Object.values(map).forEach(e => {
      const sum = e.itemsAll.reduce((acc, x) => acc + x.delayDays, 0);
      e.avgDelay = e.itemsAll.length > 0 ? Math.round(sum / e.itemsAll.length) : 0;
    });

    return Object.values(map);
  }, [allOutOfDateItems]);

  // Helper para calcular métricas visibles de una fila según columnas no ocultadas
  const getRowVisibleMetrics = (row: {
    estimacionCount: number;
    reestimacionCount: number;
    planificacionCount: number;
    totalCount: number;
  }) => {
    const est = !hiddenConsolidatedCols.has('estimacion') ? row.estimacionCount : 0;
    const reest = !hiddenConsolidatedCols.has('reestimacion') ? row.reestimacionCount : 0;
    const plan = !hiddenConsolidatedCols.has('planificacion') ? row.planificacionCount : 0;
    const hasAnyMetricVisible =
      !hiddenConsolidatedCols.has('estimacion') ||
      !hiddenConsolidatedCols.has('reestimacion') ||
      !hiddenConsolidatedCols.has('planificacion');

    const visibleTotal = hasAnyMetricVisible ? (est + reest + plan) : row.totalCount;
    return { est, reest, plan, visibleTotal, hasAnyMetricVisible };
  };

  // Ordenamiento
  const sortedSummary = useMemo(() => {
    return [...summaryByLider].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'total') {
        if (activeTab === 'estimacion') cmp = a.estimacionCount - b.estimacionCount;
        else if (activeTab === 'reestimacion') cmp = a.reestimacionCount - b.reestimacionCount;
        else if (activeTab === 'planificacion') cmp = a.planificacionCount - b.planificacionCount;
        else {
          const visA = getRowVisibleMetrics(a).visibleTotal;
          const visB = getRowVisibleMetrics(b).visibleTotal;
          cmp = visA - visB;
        }
      } else if (sortField === 'delay') {
        cmp = a.avgDelay - b.avgDelay;
      } else {
        cmp = optLabel(a.lider).localeCompare(optLabel(b.lider), 'es');
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [summaryByLider, sortField, sortDir, activeTab, hiddenConsolidatedCols]);

  // Filas visibles en la tabla consolidada (oculta automáticamente filas con 0 en las métricas visibles)
  const consolidatedRows = useMemo(() => {
    return sortedSummary.filter(row => {
      const { visibleTotal, hasAnyMetricVisible } = getRowVisibleMetrics(row);
      if (!hasAnyMetricVisible) {
        return row.totalCount > 0;
      }
      return visibleTotal > 0;
    });
  }, [sortedSummary, hiddenConsolidatedCols]);

  // Gran total dinámico para la fila TOTAL de la tabla consolidada
  const consolidatedGrandTotal = useMemo(() => {
    let count = 0;
    if (!hiddenConsolidatedCols.has('estimacion')) count += itemsEstimacion.length;
    if (!hiddenConsolidatedCols.has('reestimacion')) count += itemsReestimacion.length;
    if (!hiddenConsolidatedCols.has('planificacion')) count += itemsPlanificacion.length;
    return count;
  }, [itemsEstimacion, itemsReestimacion, itemsPlanificacion, hiddenConsolidatedCols]);

  // Datos para gráficos de Recharts
  const chartDataConsolidado = useMemo(() => {
    return consolidatedRows
      .slice(0, 15)
      .map(s => {
        const { visibleTotal } = getRowVisibleMetrics(s);
        return {
          name: optLabel(s.lider).length > 24 ? optLabel(s.lider).slice(0, 22) + '…' : optLabel(s.lider),
          fullName: optLabel(s.lider),
          Estimación: !hiddenConsolidatedCols.has('estimacion') ? s.estimacionCount : 0,
          'Re-estimación': !hiddenConsolidatedCols.has('reestimacion') ? s.reestimacionCount : 0,
          Planificación: !hiddenConsolidatedCols.has('planificacion') ? s.planificacionCount : 0,
          total: visibleTotal,
          itemsAll: s.itemsAll,
        };
      });
  }, [consolidatedRows, hiddenConsolidatedCols]);

  const chartDataEstimacion = useMemo(() => {
    return sortedSummary
      .filter(s => s.estimacionCount > 0)
      .slice(0, 15)
      .map(s => ({
        name: optLabel(s.lider).length > 24 ? optLabel(s.lider).slice(0, 22) + '…' : optLabel(s.lider),
        fullName: optLabel(s.lider),
        value: s.estimacionCount,
        avgDelay: s.itemsEst.length > 0 ? Math.round(s.itemsEst.reduce((a, b) => a + b.delayDays, 0) / s.itemsEst.length) : 0,
        items: s.itemsEst,
      }));
  }, [sortedSummary]);

  const chartDataReestimacion = useMemo(() => {
    return sortedSummary
      .filter(s => s.reestimacionCount > 0)
      .slice(0, 15)
      .map(s => ({
        name: optLabel(s.lider).length > 24 ? optLabel(s.lider).slice(0, 22) + '…' : optLabel(s.lider),
        fullName: optLabel(s.lider),
        value: s.reestimacionCount,
        items: s.itemsReest,
      }));
  }, [sortedSummary]);

  const chartDataPlanificacion = useMemo(() => {
    return sortedSummary
      .filter(s => s.planificacionCount > 0)
      .slice(0, 15)
      .map(s => ({
        name: optLabel(s.lider).length > 24 ? optLabel(s.lider).slice(0, 22) + '…' : optLabel(s.lider),
        fullName: optLabel(s.lider),
        value: s.planificacionCount,
        avgDelay: s.itemsPlan.length > 0 ? Math.round(s.itemsPlan.reduce((a, b) => a + b.delayDays, 0) / s.itemsPlan.length) : 0,
        items: s.itemsPlan,
      }));
  }, [sortedSummary]);

  const toggleSort = (f: typeof sortField) => {
    if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(f); setSortDir('desc'); }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) =>
    sortField !== field
      ? <ChevronRight size={12} style={{ opacity: 0.3, transform: 'rotate(90deg)' }} />
      : sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;

  // Handlers para abrir el popup con las iniciativas
  const handleOpenCategory = (cat: 'estimacion' | 'reestimacion' | 'planificacion' | 'consolidado', liderName?: string) => {
    let title = '';
    let subtitle = '';
    let items: OutOfDateItem[] = [];

    if (cat === 'consolidado') {
      title = liderName ? `Iniciativas Fuera de Fecha: ${optLabel(liderName)}` : 'Todas las Iniciativas Fuera de Fecha';
      subtitle = 'Consolidado de desfases en Estimación, Re-estimación y Planificación comparadas contra hoy';
      items = liderName
        ? summaryByLider.find(s => s.lider === liderName)?.itemsAll || []
        : allOutOfDateItems;
    } else if (cat === 'estimacion') {
      title = liderName ? `Auditoría de Estimación: ${optLabel(liderName)}` : 'Iniciativas en Estimación (Pendientes, SLA y Vencidas)';
      subtitle = 'Iniciativas en etapa Por Estimar sin fecha de asignación/fin, en plazo SLA (≤ 5 días) o con fecha fin vencida';
      items = liderName
        ? summaryByLider.find(s => s.lider === liderName)?.itemsEst || []
        : itemsEstimacion;
    } else if (cat === 'reestimacion') {
      title = liderName ? `Fuera de Fecha de Re-estimación: ${optLabel(liderName)}` : 'Iniciativas Fuera de Fecha de Re-estimación (Fecha Fin Re-estimación)';
      subtitle = 'Iniciativas en estado Por Reestimar con fecha fin de re-estimación vencida respecto a la fecha de hoy';
      items = liderName
        ? summaryByLider.find(s => s.lider === liderName)?.itemsReest || []
        : itemsReestimacion;
    } else if (cat === 'planificacion') {
      title = liderName ? `Iniciativas Por Planificar Sin Fechas: ${optLabel(liderName)}` : 'Iniciativas Por Planificar (Sin Fechas de Planificación)';
      subtitle = 'Iniciativas en estado "Por Planificar" que tienen fechas de inicio y/o fin de planificación vacías';
      items = liderName
        ? summaryByLider.find(s => s.lider === liderName)?.itemsPlan || []
        : itemsPlanificacion;
    }

    onOpenCustomPopup({
      title,
      subtitle,
      category: cat,
      items,
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* -------------------------------------------------------------
          1. HEADER Y BARRA DE PESTAÑAS (SEGMENTED CONTROL)
      ------------------------------------------------------------- */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 16px',
          background: '#f8fafc',
          borderRadius: 12,
          border: '1px solid #e2e8f0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              boxShadow: '0 2px 8px rgba(239, 68, 68, 0.25)',
            }}
          >
            <AlertTriangle size={16} />
          </div>
          <div>
            <h4 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Control de Fechas por Líder de Dominio
            </h4>
            <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>
              Detección de desfases en etapas de Estimación, Re-estimación y Planificación comparadas contra la fecha de hoy
            </p>
          </div>
        </div>

        {/* Botones de navegación por pestaña */}
        <div
          style={{
            display: 'inline-flex',
            background: '#e2e8f0',
            padding: 3,
            borderRadius: 10,
            gap: 2,
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('consolidado')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontWeight: activeTab === 'consolidado' ? 700 : 500,
              padding: '6px 12px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'consolidado' ? '#ffffff' : 'transparent',
              color: activeTab === 'consolidado' ? '#0f172a' : '#64748b',
              boxShadow: activeTab === 'consolidado' ? '0 2px 4px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <LayoutGrid size={13} />
            <span>Consolidado</span>
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: 12,
                background: activeTab === 'consolidado' ? '#0f172a' : '#cbd5e1',
                color: activeTab === 'consolidado' ? '#ffffff' : '#475569',
              }}
            >
              {allOutOfDateItems.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('estimacion')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontWeight: activeTab === 'estimacion' ? 700 : 500,
              padding: '6px 12px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'estimacion' ? '#ffffff' : 'transparent',
              color: activeTab === 'estimacion' ? '#d97706' : '#64748b',
              boxShadow: activeTab === 'estimacion' ? '0 2px 4px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <Clock size={13} style={{ color: '#d97706' }} />
            <span>Estimaciones</span>
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: 12,
                background: '#fef3c7',
                color: '#b45309',
                border: '1px solid #fde68a',
              }}
            >
              {itemsEstimacion.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('reestimacion')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontWeight: activeTab === 'reestimacion' ? 700 : 500,
              padding: '6px 12px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'reestimacion' ? '#ffffff' : 'transparent',
              color: activeTab === 'reestimacion' ? '#7c3aed' : '#64748b',
              boxShadow: activeTab === 'reestimacion' ? '0 2px 4px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <RotateCcw size={13} style={{ color: '#7c3aed' }} />
            <span>Re-estimaciones</span>
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: 12,
                background: '#f5f3ff',
                color: '#6d28d9',
                border: '1px solid #ddd6fe',
              }}
            >
              {itemsReestimacion.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('planificacion')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontWeight: activeTab === 'planificacion' ? 700 : 500,
              padding: '6px 12px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'planificacion' ? '#ffffff' : 'transparent',
              color: activeTab === 'planificacion' ? '#e11d48' : '#64748b',
              boxShadow: activeTab === 'planificacion' ? '0 2px 4px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <CalendarX size={13} style={{ color: '#e11d48' }} />
            <span>Planificación</span>
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: 12,
                background: '#ffe4e6',
                color: '#be123c',
                border: '1px solid #fecdd3',
              }}
            >
              {itemsPlanificacion.length}
            </span>
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------------
          2. KPI SUMMARY CARDS
      ------------------------------------------------------------- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
        <div
          onClick={() => handleOpenCategory('consolidado')}
          style={{
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = '#94a3b8')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Total Desfases Detectados</span>
            <AlertTriangle size={15} style={{ color: '#f97316' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{allOutOfDateItems.length}</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>iniciativas vs hoy</span>
          </div>
          <span style={{ fontSize: 10, color: '#3b82f6', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
            <ExternalLink size={9} /> Ver todas
          </span>
        </div>

        <div
          onClick={() => handleOpenCategory('estimacion')}
          style={{
            background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
            border: '1px solid #fde68a',
            borderRadius: 12,
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(245, 158, 11, 0.15)')}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#92400e' }}>Estimación (SLA y Desfases)</span>
            <Clock size={15} style={{ color: '#d97706' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#b45309' }}>{itemsEstimacion.length}</span>
            <span style={{ fontSize: 11, color: '#92400e', opacity: 0.8 }}>en Por Estimar</span>
          </div>
          <span style={{ fontSize: 10, color: '#b45309', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
            <ExternalLink size={9} /> Ver detalle de Estimaciones
          </span>
        </div>

        <div
          onClick={() => handleOpenCategory('reestimacion')}
          style={{
            background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
            border: '1px solid #ddd6fe',
            borderRadius: 12,
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.15)')}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#5b21b6' }}>Fecha Fin Re-estimación</span>
            <RotateCcw size={15} style={{ color: '#7c3aed' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#6d28d9' }}>{itemsReestimacion.length}</span>
            <span style={{ fontSize: 11, color: '#5b21b6', opacity: 0.8 }}>en Por Reestimar vs hoy</span>
          </div>
          <span style={{ fontSize: 10, color: '#6d28d9', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
            <ExternalLink size={9} /> Ver detalle de Re-estimaciones
          </span>
        </div>

        <div
          onClick={() => handleOpenCategory('planificacion')}
          style={{
            background: 'linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)',
            border: '1px solid #fecdd3',
            borderRadius: 12,
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(244, 63, 94, 0.15)')}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#9f1239' }}>Planificación (Sin Fechas)</span>
            <CalendarX size={15} style={{ color: '#e11d48' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#be123c' }}>{itemsPlanificacion.length}</span>
            <span style={{ fontSize: 11, color: '#9f1239', opacity: 0.8 }}>en Por Planificar</span>
          </div>
          <span style={{ fontSize: 10, color: '#be123c', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
            <ExternalLink size={9} /> Ver detalle de Planificaciones
          </span>
        </div>
      </div>

      {/* -------------------------------------------------------------
          3. CONTENIDO DINÁMICO SEGÚN LA PESTAÑA SELECCIONADA
      ------------------------------------------------------------- */}

      {/* VISTA 1: CONSOLIDADO */}
      {activeTab === 'consolidado' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
                Distribución Comparativa por Líder de Dominio (Top 15 con más retrasos vs Hoy)
              </p>
            </div>
            {chartDataConsolidado.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#94a3b8', fontSize: 12 }}>
                🎉 Excelente: No se registran líderes con iniciativas fuera de fecha con los filtros actuales.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(240, chartDataConsolidado.length * 36 + 40)}>
                <BarChart data={chartDataConsolidado} layout="vertical" margin={{ top: 0, right: 65, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f4f8" />
                  <XAxis type="number" style={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis dataKey="name" type="category" width={175} style={{ fontSize: 11 }} tick={{ fill: '#475569' }} />
                  <Tooltip content={<ReportTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                  <Bar dataKey="Estimación" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]}>
                    <LabelList
                      content={(props: any) => {
                        const { index, x, y, width, height } = props;
                        const row = chartDataConsolidado[index];
                        if (!row || !row.total || row.total <= 0) return null;
                        if ((row.Estimación || 0) > 0 && !(row['Re-estimación'] > 0) && !(row.Planificación > 0)) {
                          return (
                            <text
                              x={x + width + 8}
                              y={y + height / 2}
                              fill="#0f172a"
                              textAnchor="start"
                              dominantBaseline="central"
                              style={{ fontSize: 11, fontWeight: 700 }}
                            >
                              {row.total}
                            </text>
                          );
                        }
                        return null;
                      }}
                    />
                  </Bar>
                  <Bar dataKey="Re-estimación" stackId="a" fill="#8b5cf6" radius={[0, 0, 0, 0]}>
                    <LabelList
                      content={(props: any) => {
                        const { index, x, y, width, height } = props;
                        const row = chartDataConsolidado[index];
                        if (!row || !row.total || row.total <= 0) return null;
                        if ((row['Re-estimación'] || 0) > 0 && !(row.Planificación > 0)) {
                          return (
                            <text
                              x={x + width + 8}
                              y={y + height / 2}
                              fill="#0f172a"
                              textAnchor="start"
                              dominantBaseline="central"
                              style={{ fontSize: 11, fontWeight: 700 }}
                            >
                              {row.total}
                            </text>
                          );
                        }
                        return null;
                      }}
                    />
                  </Bar>
                  <Bar dataKey="Planificación" stackId="a" fill="#f43f5e" radius={[0, 3, 3, 0]}>
                    <LabelList
                      content={(props: any) => {
                        const { index, x, y, width, height } = props;
                        const row = chartDataConsolidado[index];
                        if (!row || !row.total || row.total <= 0) return null;
                        if ((row.Planificación || 0) > 0) {
                          return (
                            <text
                              x={x + width + 8}
                              y={y + height / 2}
                              fill="#0f172a"
                              textAnchor="start"
                              dominantBaseline="central"
                              style={{ fontSize: 11, fontWeight: 700 }}
                            >
                              {row.total}
                            </text>
                          );
                        }
                        return null;
                      }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Barra superior de la tabla con selector de columnas */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#334155', margin: 0 }}>
              Tabla Detallada por Líder de Dominio
            </p>
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowConsolidatedColPicker(prev => !prev)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  color: hiddenConsolidatedCols.size > 0 ? '#2563eb' : '#475569',
                  background: hiddenConsolidatedCols.size > 0 ? '#eff6ff' : '#fff',
                  border: hiddenConsolidatedCols.size > 0 ? '1px solid #bfdbfe' : '1px solid #cbd5e1',
                  borderRadius: 6,
                  padding: '4px 10px',
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                }}
                title="Ocultar / Mostrar columnas de la tabla"
              >
                <Columns3 size={13} style={{ color: hiddenConsolidatedCols.size > 0 ? '#2563eb' : '#64748b' }} />
                <span>Columnas ({CONSOLIDATED_COLUMNS.length - hiddenConsolidatedCols.size}/{CONSOLIDATED_COLUMNS.length})</span>
                <ChevronDown size={11} />
              </button>

              {showConsolidatedColPicker && (
                <>
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                    onClick={() => setShowConsolidatedColPicker(false)}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      marginTop: 4,
                      width: 240,
                      background: '#fff',
                      border: '1px solid #e2e8f0',
                      borderRadius: 10,
                      boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
                      zIndex: 50,
                      padding: 10,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 6, marginBottom: 6, borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#1e293b' }}>Columnas Visibles</span>
                      {hiddenConsolidatedCols.size > 0 && (
                        <button
                          type="button"
                          onClick={showAllConsolidatedCols}
                          style={{ fontSize: 10, color: '#2563eb', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          Mostrar todas
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {CONSOLIDATED_COLUMNS.map(col => {
                        const isVis = !hiddenConsolidatedCols.has(col.id);
                        return (
                          <label
                            key={col.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '5px 8px',
                              borderRadius: 6,
                              fontSize: 11,
                              cursor: 'pointer',
                              background: isVis ? 'transparent' : '#f8fafc',
                              userSelect: 'none',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <input
                                type="checkbox"
                                checked={isVis}
                                onChange={() => toggleConsolidatedCol(col.id)}
                                style={{ cursor: 'pointer', accentColor: '#2563eb' }}
                              />
                              <span style={{ color: isVis ? '#1e293b' : '#94a3b8', textDecoration: isVis ? 'none' : 'line-through', fontWeight: isVis ? 500 : 400 }}>
                                {col.label}
                              </span>
                            </div>
                            {!isVis && (
                              <span style={{ fontSize: 9, fontWeight: 700, color: '#d97706', background: '#fef3c7', padding: '1px 4px', borderRadius: 4 }}>
                                Oculta
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                    <div style={{ paddingTop: 6, marginTop: 6, borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: '#94a3b8' }}>
                      <span>{hiddenConsolidatedCols.size} columna(s) oculta(s)</span>
                      <button
                        type="button"
                        onClick={() => setShowConsolidatedColPicker(false)}
                        style={{ fontSize: 10, background: '#f1f5f9', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', color: '#475569', fontWeight: 600 }}
                      >
                        Cerrar
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Tabla Consolidada */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {!hiddenConsolidatedCols.has('lider') && (
                    <th onClick={() => toggleSort('lider')} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Líder de Dominio <SortIcon field="lider" /></span>
                    </th>
                  )}
                  {!hiddenConsolidatedCols.has('estimacion') && (
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: '#b45309', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                      Estimaciones
                    </th>
                  )}
                  {!hiddenConsolidatedCols.has('reestimacion') && (
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: '#6d28d9', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                      Re-estimaciones
                    </th>
                  )}
                  {!hiddenConsolidatedCols.has('planificacion') && (
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: '#be123c', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                      Planificación
                    </th>
                  )}
                  {!hiddenConsolidatedCols.has('total') && (
                    <th onClick={() => toggleSort('total')} style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>Total Desfases <SortIcon field="total" /></span>
                    </th>
                  )}
                  {!hiddenConsolidatedCols.has('accion') && (
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                      Acción
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {consolidatedRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={CONSOLIDATED_COLUMNS.length - hiddenConsolidatedCols.size}
                      style={{ padding: '24px 12px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}
                    >
                      No hay líderes de dominio con desfases en las columnas visibles.
                    </td>
                  </tr>
                ) : (
                  consolidatedRows.map((row, idx) => {
                    const { visibleTotal } = getRowVisibleMetrics(row);
                    const estBadges = getEstimacionBadgeItems(row.itemsEst);
                    const reestBadges = getReestimacionBadgeItems(row.itemsReest);
                    const planBadges = getPlanificacionBadgeItems(row.itemsPlan);

                    return (
                      <tr key={row.lider} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                        {!hiddenConsolidatedCols.has('lider') && (
                          <td style={{ padding: '10px 12px' }}>
                            <ClickableCell label={optLabel(row.lider)} onClick={() => handleOpenCategory('consolidado', row.lider)} title={`Ver detalle de iniciativas de: ${optLabel(row.lider)}`} />
                          </td>
                        )}
                        {!hiddenConsolidatedCols.has('estimacion') && (
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            {row.estimacionCount > 0 ? (
                              <div
                                onClick={() => handleOpenCategory('estimacion', row.lider)}
                                style={{
                                  display: 'inline-flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  gap: 4,
                                  cursor: 'pointer',
                                  padding: '3px 8px',
                                  borderRadius: 8,
                                  transition: 'background 0.12s',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#fef3c744')}
                                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                                title={`Ver estimaciones de ${optLabel(row.lider)}`}
                              >
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3,
                                    fontSize: 12,
                                    fontWeight: 800,
                                    padding: '2px 9px',
                                    borderRadius: 20,
                                    background: '#fef3c7',
                                    color: '#b45309',
                                    border: '1px solid #fde68a',
                                  }}
                                >
                                  {row.estimacionCount}
                                </span>
                                <MotivosBadgesList badges={estBadges} />
                              </div>
                            ) : (
                              <span style={{ color: '#cbd5e1' }}>—</span>
                            )}
                          </td>
                        )}
                        {!hiddenConsolidatedCols.has('reestimacion') && (
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            {row.reestimacionCount > 0 ? (
                              <div
                                onClick={() => handleOpenCategory('reestimacion', row.lider)}
                                style={{
                                  display: 'inline-flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  gap: 4,
                                  cursor: 'pointer',
                                  padding: '3px 8px',
                                  borderRadius: 8,
                                  transition: 'background 0.12s',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f5f3ff44')}
                                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                                title={`Ver re-estimaciones de ${optLabel(row.lider)}`}
                              >
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3,
                                    fontSize: 12,
                                    fontWeight: 800,
                                    padding: '2px 9px',
                                    borderRadius: 20,
                                    background: '#f5f3ff',
                                    color: '#6d28d9',
                                    border: '1px solid #ddd6fe',
                                  }}
                                >
                                  {row.reestimacionCount}
                                </span>
                                <MotivosBadgesList badges={reestBadges} />
                              </div>
                            ) : (
                              <span style={{ color: '#cbd5e1' }}>—</span>
                            )}
                          </td>
                        )}
                        {!hiddenConsolidatedCols.has('planificacion') && (
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            {row.planificacionCount > 0 ? (
                              <div
                                onClick={() => handleOpenCategory('planificacion', row.lider)}
                                style={{
                                  display: 'inline-flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  gap: 4,
                                  cursor: 'pointer',
                                  padding: '3px 8px',
                                  borderRadius: 8,
                                  transition: 'background 0.12s',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#fff1f244')}
                                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                                title={`Ver planificaciones de ${optLabel(row.lider)}`}
                              >
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3,
                                    fontSize: 12,
                                    fontWeight: 800,
                                    padding: '2px 9px',
                                    borderRadius: 20,
                                    background: '#ffe4e6',
                                    color: '#be123c',
                                    border: '1px solid #fecdd3',
                                  }}
                                >
                                  {row.planificacionCount}
                                </span>
                                <MotivosBadgesList badges={planBadges} />
                              </div>
                            ) : (
                              <span style={{ color: '#cbd5e1' }}>—</span>
                            )}
                          </td>
                        )}
                        {!hiddenConsolidatedCols.has('total') && (
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                              <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>
                                {visibleTotal}
                              </span>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  color: '#475569',
                                  backgroundColor: '#f1f5f9',
                                  border: '1px solid #e2e8f0',
                                  padding: '2px 7px',
                                  borderRadius: 6,
                                }}
                              >
                                {visibleTotal === 1 ? '1 iniciativa' : `${visibleTotal} iniciativas`}
                              </span>
                            </div>
                          </td>
                        )}
                        {!hiddenConsolidatedCols.has('accion') && (
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <button
                              onClick={() => handleOpenCategory('consolidado', row.lider)}
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: '#2563eb',
                                background: '#eff6ff',
                                border: '1px solid #bfdbfe',
                                borderRadius: 6,
                                padding: '4px 12px',
                                cursor: 'pointer',
                              }}
                            >
                              Ver Detalle
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f1f5f9', borderTop: '2px solid #e2e8f0' }}>
                  {!hiddenConsolidatedCols.has('lider') && (
                    <td style={{ padding: '10px 12px', fontWeight: 700, fontSize: 12, color: '#334155' }}>TOTAL</td>
                  )}
                  {!hiddenConsolidatedCols.has('estimacion') && (
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                        <span style={{ fontWeight: 800, color: '#b45309', fontSize: 13 }}>{itemsEstimacion.length}</span>
                        {itemsEstimacion.length > 0 && (
                          <MotivosBadgesList badges={getEstimacionBadgeItems(itemsEstimacion)} />
                        )}
                      </div>
                    </td>
                  )}
                  {!hiddenConsolidatedCols.has('reestimacion') && (
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                        <span style={{ fontWeight: 800, color: '#6d28d9', fontSize: 13 }}>{itemsReestimacion.length}</span>
                        {itemsReestimacion.length > 0 && (
                          <MotivosBadgesList badges={getReestimacionBadgeItems(itemsReestimacion)} />
                        )}
                      </div>
                    </td>
                  )}
                  {!hiddenConsolidatedCols.has('planificacion') && (
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                        <span style={{ fontWeight: 800, color: '#be123c', fontSize: 13 }}>{itemsPlanificacion.length}</span>
                        {itemsPlanificacion.length > 0 && (
                          <MotivosBadgesList badges={getPlanificacionBadgeItems(itemsPlanificacion)} />
                        )}
                      </div>
                    </td>
                  )}
                  {!hiddenConsolidatedCols.has('total') && (
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                        <span style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>{consolidatedGrandTotal}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#475569', backgroundColor: '#e2e8f0', padding: '2px 7px', borderRadius: 6 }}>
                          Total general
                        </span>
                      </div>
                    </td>
                  )}
                  {!hiddenConsolidatedCols.has('accion') && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* VISTA 2: ESTIMACIONES */}
      {activeTab === 'estimacion' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 8, padding: '8px 14px', fontSize: 11, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={15} style={{ flexShrink: 0, color: '#d97706' }} />
            <span>
              <strong>Campos auditados:</strong> <code>Fecha de Asignación LD</code> y <code>Fecha Fin Estimación</code>.
              Evalúa iniciativas en etapa "Por Estimar" sin fecha de asignación/fin, dentro de plazo SLA (≤ 5 días de asignación) o con fecha fin de estimación vencida vs hoy.
            </span>
          </div>

          <div>
            <p style={{ fontSize: 10, color: '#94a3b8', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Iniciativas Por Estimar (Sin Fechas, en SLA o Vencidas) por Líder de Dominio
            </p>
            {chartDataEstimacion.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#94a3b8', fontSize: 12 }}>
                🎉 No hay iniciativas con estimaciones fuera de fecha o pendientes.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(220, chartDataEstimacion.length * 36 + 30)}>
                <BarChart data={chartDataEstimacion} layout="vertical" margin={{ top: 0, right: 65, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f4f8" />
                  <XAxis type="number" style={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis dataKey="name" type="category" width={175} style={{ fontSize: 11 }} tick={{ fill: '#475569' }} />
                  <Tooltip content={<ReportTooltip />} />
                  <Bar dataKey="value" name="Por Estimar" fill="#f59e0b" radius={[0, 4, 4, 0]}>
                    <LabelList
                      content={(props: any) => {
                        const { x, y, width, height, value } = props;
                        if (value === undefined || value === null || value === 0) return null;
                        return (
                          <text
                            x={x + width + 8}
                            y={y + height / 2}
                            fill="#b45309"
                            textAnchor="start"
                            dominantBaseline="central"
                            style={{ fontSize: 11, fontWeight: 700 }}
                          >
                            {value}
                          </text>
                        );
                      }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th onClick={() => toggleSort('lider')} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0', cursor: 'pointer', userSelect: 'none' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Líder de Dominio <SortIcon field="lider" /></span>
                  </th>
                  <th onClick={() => toggleSort('total')} style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0', cursor: 'pointer', userSelect: 'none' }}>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>Iniciativas Por Estimar <SortIcon field="total" /></span>
                  </th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>% del Total</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {sortedSummary.filter(s => s.estimacionCount > 0).map((row, idx) => (
                  <tr key={row.lider} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <ClickableCell label={optLabel(row.lider)} onClick={() => handleOpenCategory('estimacion', row.lider)} title={`Ver iniciativas de: ${optLabel(row.lider)}`} />
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                        <span style={{ fontWeight: 800, color: '#b45309', fontSize: 13 }}>
                          {row.estimacionCount}
                        </span>
                        <MotivosBadgesList badges={getEstimacionBadgeItems(row.itemsEst)} />
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: '#b45309', background: '#fef3c7', padding: '2px 8px', borderRadius: 20 }}>
                        {Math.round((row.estimacionCount / (itemsEstimacion.length || 1)) * 100)}%
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <button
                        onClick={() => handleOpenCategory('estimacion', row.lider)}
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: '#b45309',
                          background: '#fef3c7',
                          border: '1px solid #fde68a',
                          borderRadius: 6,
                          padding: '4px 12px',
                          cursor: 'pointer',
                        }}
                      >
                        Ver Iniciativas
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f1f5f9', borderTop: '2px solid #e2e8f0' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, fontSize: 12, color: '#334155' }}>TOTAL</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                      <span style={{ fontWeight: 800, fontSize: 13, color: '#b45309' }}>{itemsEstimacion.length}</span>
                      {itemsEstimacion.length > 0 && (
                        <MotivosBadgesList badges={getEstimacionBadgeItems(itemsEstimacion)} />
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#b45309' }}>100%</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* VISTA 3: RE-ESTIMACIONES */}
      {activeTab === 'reestimacion' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ background: '#f5f3ff', border: '1px solid #ede9fe', borderRadius: 8, padding: '8px 14px', fontSize: 11, color: '#5b21b6', display: 'flex', alignItems: 'center', gap: 8 }}>
            <RotateCcw size={15} style={{ flexShrink: 0, color: '#7c3aed' }} />
            <span>
              <strong>Campos auditados:</strong> <code>Fecha Inicio Re-estimación</code> y <code>Fecha Fin Re-estimación</code>.
              Audita únicamente iniciativas en estado "Por Reestimar" con fechas vencidas respecto a la fecha de hoy.
            </span>
          </div>

          <div>
            <p style={{ fontSize: 10, color: '#94a3b8', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Iniciativas con Fecha Fin de Re-estimación Vencida por Líder de Dominio (Estado Por Reestimar)
            </p>
            {chartDataReestimacion.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#64748b', fontSize: 12, background: '#faf5ff', borderRadius: 8, border: '1px dashed #ddd6fe' }}>
                ✨ No se registran iniciativas con re-estimación fuera de fecha en este corte de datos.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(200, chartDataReestimacion.length * 36 + 30)}>
                <BarChart data={chartDataReestimacion} layout="vertical" margin={{ top: 0, right: 65, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f4f8" />
                  <XAxis type="number" style={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis dataKey="name" type="category" width={175} style={{ fontSize: 11 }} tick={{ fill: '#475569' }} />
                  <Tooltip content={<ReportTooltip />} />
                  <Bar dataKey="value" name="Re-estimaciones Vencidas" fill="#8b5cf6" radius={[0, 4, 4, 0]}>
                    <LabelList
                      content={(props: any) => {
                        const { x, y, width, height, value } = props;
                        if (value === undefined || value === null || value === 0) return null;
                        return (
                          <text
                            x={x + width + 8}
                            y={y + height / 2}
                            fill="#6d28d9"
                            textAnchor="start"
                            dominantBaseline="central"
                            style={{ fontSize: 11, fontWeight: 700 }}
                          >
                            {value}
                          </text>
                        );
                      }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>Líder de Dominio</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>Re-estimaciones Vencidas</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>% del Total</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {sortedSummary.filter(s => s.reestimacionCount > 0).length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: '20px 12px', textAlign: 'center', color: '#94a3b8' }}>
                      Sin re-estimaciones atrasadas.
                    </td>
                  </tr>
                ) : (
                  sortedSummary.filter(s => s.reestimacionCount > 0).map((row, idx) => (
                    <tr key={row.lider} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 12px' }}>
                        <ClickableCell label={optLabel(row.lider)} onClick={() => handleOpenCategory('reestimacion', row.lider)} title={`Ver re-estimaciones atrasadas de: ${optLabel(row.lider)}`} />
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                          <span style={{ fontWeight: 800, color: '#6d28d9', fontSize: 13 }}>
                            {row.reestimacionCount}
                          </span>
                          <MotivosBadgesList badges={getReestimacionBadgeItems(row.itemsReest)} />
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: '#6d28d9', background: '#f5f3ff', padding: '2px 8px', borderRadius: 20 }}>
                          {Math.round((row.reestimacionCount / (itemsReestimacion.length || 1)) * 100)}%
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <button
                          onClick={() => handleOpenCategory('reestimacion', row.lider)}
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: '#6d28d9',
                            background: '#f5f3ff',
                            border: '1px solid #ddd6fe',
                            borderRadius: 6,
                            padding: '4px 12px',
                            cursor: 'pointer',
                          }}
                        >
                          Ver Iniciativas
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f1f5f9', borderTop: '2px solid #e2e8f0' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, fontSize: 12, color: '#334155' }}>TOTAL</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                      <span style={{ fontWeight: 800, fontSize: 13, color: '#6d28d9' }}>{itemsReestimacion.length}</span>
                      {itemsReestimacion.length > 0 && (
                        <MotivosBadgesList badges={getReestimacionBadgeItems(itemsReestimacion)} />
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#6d28d9' }}>100%</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* VISTA 4: PLANIFICACIÓN */}
      {activeTab === 'planificacion' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ background: '#fff1f2', border: '1px solid #ffe4e6', borderRadius: 8, padding: '8px 14px', fontSize: 11, color: '#9f1239', display: 'flex', alignItems: 'center', gap: 8 }}>
            <CalendarX size={15} style={{ flexShrink: 0, color: '#e11d48' }} />
            <span>
              <strong>Campos auditados:</strong> <code>Fecha Inicio Planificada</code> y <code>Fecha Fin Planificada</code>.
              Evalúa iniciativas en estado "Por Planificar" que tienen fechas de inicio y/o fin de planificación vacías.
            </span>
          </div>

          <div>
            <p style={{ fontSize: 10, color: '#94a3b8', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Iniciativas en estado Por Planificar sin Fechas por Líder de Dominio
            </p>
            {chartDataPlanificacion.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#94a3b8', fontSize: 12 }}>
                🎉 No hay iniciativas en Por Planificar sin fechas.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(220, chartDataPlanificacion.length * 36 + 30)}>
                <BarChart data={chartDataPlanificacion} layout="vertical" margin={{ top: 0, right: 65, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f4f8" />
                  <XAxis type="number" style={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis dataKey="name" type="category" width={175} style={{ fontSize: 11 }} tick={{ fill: '#475569' }} />
                  <Tooltip content={<ReportTooltip />} />
                  <Bar dataKey="value" name="Por Planificar sin Fechas" fill="#f43f5e" radius={[0, 4, 4, 0]}>
                    <LabelList
                      content={(props: any) => {
                        const { x, y, width, height, value } = props;
                        if (value === undefined || value === null || value === 0) return null;
                        return (
                          <text
                            x={x + width + 8}
                            y={y + height / 2}
                            fill="#be123c"
                            textAnchor="start"
                            dominantBaseline="central"
                            style={{ fontSize: 11, fontWeight: 700 }}
                          >
                            {value}
                          </text>
                        );
                      }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th onClick={() => toggleSort('lider')} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0', cursor: 'pointer', userSelect: 'none' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Líder de Dominio <SortIcon field="lider" /></span>
                  </th>
                  <th onClick={() => toggleSort('total')} style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0', cursor: 'pointer', userSelect: 'none' }}>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>Por Planificar sin Fechas <SortIcon field="total" /></span>
                  </th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>% del Total</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {sortedSummary.filter(s => s.planificacionCount > 0).map((row, idx) => (
                  <tr key={row.lider} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <ClickableCell label={optLabel(row.lider)} onClick={() => handleOpenCategory('planificacion', row.lider)} title={`Ver iniciativas de: ${optLabel(row.lider)}`} />
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                        <span style={{ fontWeight: 800, color: '#be123c', fontSize: 13 }}>
                          {row.planificacionCount}
                        </span>
                        <MotivosBadgesList badges={getPlanificacionBadgeItems(row.itemsPlan)} />
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: '#be123c', background: '#ffe4e6', padding: '2px 8px', borderRadius: 20 }}>
                        {Math.round((row.planificacionCount / (itemsPlanificacion.length || 1)) * 100)}%
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <button
                        onClick={() => handleOpenCategory('planificacion', row.lider)}
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: '#be123c',
                          background: '#ffe4e6',
                          border: '1px solid #fecdd3',
                          borderRadius: 6,
                          padding: '4px 12px',
                          cursor: 'pointer',
                        }}
                      >
                        Ver Iniciativas
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f1f5f9', borderTop: '2px solid #e2e8f0' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, fontSize: 12, color: '#334155' }}>TOTAL</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                      <span style={{ fontWeight: 800, fontSize: 13, color: '#be123c' }}>{itemsPlanificacion.length}</span>
                      {itemsPlanificacion.length > 0 && (
                        <MotivosBadgesList badges={getPlanificacionBadgeItems(itemsPlanificacion)} />
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#be123c' }}>100%</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers de navegación: construye el objeto de filtros para FilterState
// ---------------------------------------------------------------------------
function buildNavFilters(
  macro: MacroFilters,
  overrides: Partial<FilterState>
): Partial<FilterState> {
  return {
    instituciones:   macro.instituciones,
    proyecto_spo:    macro.proyecto_spo,
    it_bps:          macro.it_bps,
    vp_solicitantes: macro.vp_solicitantes,
    etapas:          macro.etapas as EtapaPipeline[],
    lideres_dominio: macro.lideres_dominio,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helpers y Componente: Timeline de Iniciativas por Etapas Clave (con línea de HOY)
// ---------------------------------------------------------------------------

const timelineDateCache = new Map<string, Date | null>();

function parseTimelineDate(d: string | null | undefined): Date | null {
  if (!d || typeof d !== 'string') return null;
  const s = d.trim();
  if (!s || s === 'null' || s === 'undefined' || s === EMPTY_SENTINEL) return null;

  const cached = timelineDateCache.get(s);
  if (cached !== undefined) return cached;

  // 1. Fast path: Date.parse native C++ parser in V8 engine
  const ts = Date.parse(s);
  if (!isNaN(ts)) {
    const res = new Date(ts);
    timelineDateCache.set(s, res);
    return res;
  }

  // 2. Fallback para parseISO de date-fns
  try {
    const parsed = parseISO(s);
    if (!isNaN(parsed.getTime())) {
      timelineDateCache.set(s, parsed);
      return parsed;
    }
  } catch {}

  timelineDateCache.set(s, null);
  return null;
}

type TimelineStageKey = 'estimacion' | 'reestimacion' | 'planificada' | 'implementada' | 'eliminada';

interface TimelineSegment {
  id: string;
  stageKey: TimelineStageKey;
  stageName: string;
  start: Date;
  end: Date;
  isSingleDay: boolean;
  color: string;
  gradient: string;
  borderColor: string;
  textColor: string;
  details?: string;
  lane?: number;
}

type GrupoAMKey = 'requerimiento' | 'proyecto' | 'vacio';

interface GrupoAMConfig {
  key: GrupoAMKey;
  title: string;
  tag: string;
  headerBg: string;
  headerBorder: string;
  headerText: string;
  badgeBg: string;
  badgeText: string;
  barColor: string;
  barGradient: string;
  barBorder: string;
}

const GRUPOS_AM_CONFIG: Record<GrupoAMKey, GrupoAMConfig> = {
  requerimiento: {
    key: 'requerimiento',
    title: 'Requerimientos (No BAU)',
    tag: 'Requerimiento',
    headerBg: '#ecfeff',
    headerBorder: '#a5f3fc',
    headerText: '#0e7490',
    badgeBg: '#cffafe',
    badgeText: '#0891b2',
    barColor: '#0891b2',
    barGradient: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
    barBorder: '#0e7490',
  },
  proyecto: {
    key: 'proyecto',
    title: 'Proyectos',
    tag: 'Proyecto',
    headerBg: '#eff6ff',
    headerBorder: '#bfdbfe',
    headerText: '#1d4ed8',
    badgeBg: '#dbeafe',
    badgeText: '#2563eb',
    barColor: '#2563eb',
    barGradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    barBorder: '#1d4ed8',
  },
  vacio: {
    key: 'vacio',
    title: 'Sin Regularizar / Vacíos (Columna AM pendiente)',
    tag: '⚠️ Por regularizar',
    headerBg: '#fffbeb',
    headerBorder: '#fde68a',
    headerText: '#b45309',
    badgeBg: '#fef3c7',
    badgeText: '#d97706',
    barColor: '#f59e0b',
    barGradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    barBorder: '#b45309',
  },
};

function classifyAM(i: Iniciativa): GrupoAMKey {
  const rawVal = i.proyecto_o_req || (i.raw_fields && (
    i.raw_fields['Indicar si es Proyecto o Requerimiento No BAU'] ||
    i.raw_fields['Proyecto o Requerimiento No BAU'] ||
    i.raw_fields['Proyecto o Requerimiento'] ||
    i.raw_fields['No BAU']
  )) as string | undefined;

  if (!rawVal) return 'vacio';
  const s = String(rawVal).trim().toLowerCase();
  if (
    !s ||
    s === 'null' ||
    s === 'undefined' ||
    s === EMPTY_SENTINEL.toLowerCase() ||
    s === '(sin asignar)' ||
    s.startsWith('http://') ||
    s.startsWith('https://')
  ) {
    return 'vacio';
  }

  if (s.includes('requerimiento') || s.includes('no bau') || s.includes('req')) {
    return 'requerimiento';
  }

  if (s.includes('proyecto')) {
    return 'proyecto';
  }

  return 'vacio';
}

// ---------------------------------------------------------------------------
// Clasificación Ejecutiva de 4 Fases y Etiquetas Humanas (Reporte VP)
// ---------------------------------------------------------------------------
export type VpPipelinePhase = 1 | 2 | 3 | 'observaciones';

export function getVpPipelinePhase(etapa: string): VpPipelinePhase {
  const norm = (etapa || '').trim().toLowerCase();
  // Fase 1: Por estimar, Por aprobar estimación, Por reestimar
  if (
    norm === 'por_estimar' ||
    norm === 'por_aprobar_estimacion' ||
    norm === 'por_reestimar'
  ) {
    return 1;
  }
  // Fase 2: Por planificar, Por aprobar planificación, Habilitar presupuesto
  if (
    norm === 'por_planificar' ||
    norm === 'aprobar_planificacion' ||
    norm === 'por_aprobar_planificacion' ||
    norm === 'por_habilitar_presupuesto'
  ) {
    return 2;
  }
  // Con observaciones: Registro incompleto y Eliminadas
  if (
    norm === 'registro_incompleto' ||
    norm === 'eliminadas' ||
    norm === 'eliminada'
  ) {
    return 'observaciones';
  }
  // Fase 3: Planificadas, Implementadas y etapas de ejecución activa
  return 3;
}

export function getEtapaHumanLabel(etapa: string): string {
  const norm = (etapa || '').trim().toLowerCase();
  switch (norm) {
    case 'por_estimar':
      return 'Por estimar';
    case 'por_aprobar_estimacion':
      return 'Por aprobar estimación';
    case 'por_reestimar':
      return 'Por reestimar';
    case 'por_planificar':
      return 'Por planificar';
    case 'aprobar_planificacion':
    case 'por_aprobar_planificacion':
      return 'Por aprobar planificación';
    case 'por_habilitar_presupuesto':
      return 'Habilitar presupuesto';
    case 'planificadas':
    case 'planificada':
      return 'Planificadas';
    case 'implementadas':
    case 'implementada':
      return 'Implementadas';
    case 'por_iniciar':
      return 'Por iniciar';
    case 'en_ejecucion':
      return 'En ejecución';
    case 'terminado':
      return 'Terminado';
    case 'detenido':
      return 'Detenido';
    case 'registro_incompleto':
      return 'Registro incompleto';
    case 'eliminadas':
    case 'eliminada':
      return 'Eliminadas';
    default: {
      const fromMap =
        ETAPAS_MAP.get(norm as EtapaPipeline)?.label ||
        ETAPAS_PLANIFICADAS_MAP.get(norm as EtapaPipeline)?.label;
      if (fromMap) return fromMap;
      return norm.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  }
}

export function normalizeEcosistemaName(rawName: string): string {
  const trimmed = (rawName || '').trim();
  if (!trimmed) return 'General / Otros';
  return trimmed
    .toLowerCase()
    .split(/\s+/)
    .map(word => {
      if (word.length <= 2 && !['ti', 'am', 'vp', 'sn'].includes(word)) return word;
      if (word === 'ti' || word === 'am' || word === 'vp' || word === 'sn') return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

interface TimelineRowItem {
  iniciativa: Iniciativa;
  segments: TimelineSegment[];
  hasDates: boolean;
  startDate: Date | null;
  endDate: Date | null;
  earliestDate: Date | null;
  latestDate: Date | null;
  grupoAM: GrupoAMKey;
  maxLane: number;
}

function buildTimelineSegments(i: Iniciativa): TimelineSegment[] {
  const segs: TimelineSegment[] = [];

  // Regla para eliminadas: Si está eliminada, SOLO mostrar su hito/segmento de eliminación
  const isEliminada = (i.etapa_actual as string) === 'eliminadas' || (i.etapa_actual as string) === 'eliminada';
  if (isEliminada) {
    const fechaElim = parseTimelineDate(i.fecha_eliminacion);
    if (fechaElim) {
      const parts: string[] = [];
      parts.push(`Eliminada: ${fmtDateShort(i.fecha_eliminacion)}`);
      if (i.solicitado_por) parts.push(`Solicitado por: ${i.solicitado_por}`);
      if (i.motivo_eliminacion) parts.push(`Motivo: ${i.motivo_eliminacion}`);
      segs.push({
        id: `${i.id}-elim`,
        stageKey: 'eliminada',
        stageName: 'Eliminada',
        start: fechaElim,
        end: fechaElim,
        isSingleDay: true,
        color: '#ef4444',
        gradient: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
        borderColor: '#991b1b',
        textColor: '#ffffff',
        details: parts.join(' | '),
      });
    }
    return segs;
  }

  // Regla 1: Si la iniciativa ya está planificada, NO mostrar su línea de estimación
  const isPlanificada =
    ['planificadas', 'implementadas', 'en_ejecucion', 'terminado'].includes(i.etapa_actual) ||
    Boolean(i.fecha_inicio_planificada || i.fecha_fin_planificada || i.fecha_inicio_real || i.fecha_fin_real);

  // 1. En Estimación (SOLO si la iniciativa NO está planificada)
  if (!isPlanificada) {
    const iniEst = parseTimelineDate(i.fecha_inicio_estimacion);
    const finEst = parseTimelineDate(i.fecha_fin_estimacion);
    if (iniEst || finEst) {
      const s = iniEst || finEst!;
      const e = finEst || iniEst!;
      const start = s <= e ? s : e;
      const end = s <= e ? e : s;
      segs.push({
        id: `${i.id}-est`,
        stageKey: 'estimacion',
        stageName: 'En Estimación',
        start,
        end,
        isSingleDay: start.getTime() === end.getTime(),
        color: '#f59e0b',
        gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
        borderColor: '#b45309',
        textColor: '#ffffff',
        details: i.estatus_estimacion ? `Estatus: ${i.estatus_estimacion}` : undefined,
      });
    }
  }

  // 2. Re-estimación
  const iniReest = parseTimelineDate(i.fecha_inicio_reestimacion);
  const finReest = parseTimelineDate(i.fecha_fin_reestimacion);
  if (iniReest || finReest) {
    const s = iniReest || finReest!;
    const e = finReest || iniReest!;
    const start = s <= e ? s : e;
    const end = s <= e ? e : s;
    const parts: string[] = [];
    if (i.motivo_reestimacion) parts.push(`Motivo: ${i.motivo_reestimacion}`);
    if (i.estatus_reestimacion) parts.push(`Estatus: ${i.estatus_reestimacion}`);
    segs.push({
      id: `${i.id}-reest`,
      stageKey: 'reestimacion',
      stageName: 'Re-estimación',
      start,
      end,
      isSingleDay: start.getTime() === end.getTime(),
      color: '#ea580c',
      gradient: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
      borderColor: '#c2410c',
      textColor: '#ffffff',
      details: parts.length > 0 ? parts.join(' | ') : undefined,
    });
  }

  // 3. Planificadas
  const iniPlan = parseTimelineDate(i.fecha_inicio_planificada || i.fecha_inicio_real);
  const finPlan = parseTimelineDate(i.fecha_fin_planificada || i.fecha_fin_real);
  if (iniPlan || finPlan) {
    const s = iniPlan || finPlan!;
    const e = finPlan || iniPlan!;
    const start = s <= e ? s : e;
    const end = s <= e ? e : s;
    segs.push({
      id: `${i.id}-plan`,
      stageKey: 'planificada',
      stageName: 'Planificada',
      start,
      end,
      isSingleDay: start.getTime() === end.getTime(),
      color: '#10b981',
      gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      borderColor: '#047857',
      textColor: '#ffffff',
      details: i.planificacion_aprobada ? `Planificación aprobada: ${i.planificacion_aprobada}` : undefined,
    });
  }

  // 4. Implementadas
  const fechaPase = parseTimelineDate(i.fecha_pase_produccion);
  const fechaConf = parseTimelineDate(i.fecha_conformidad);
  if (fechaPase || fechaConf) {
    const s = fechaPase || fechaConf!;
    const e = fechaConf || fechaPase!;
    const start = s <= e ? s : e;
    const end = s <= e ? e : s;
    const parts: string[] = [];
    if (fechaPase) parts.push(`Pase a producción: ${fmtDateShort(i.fecha_pase_produccion)}`);
    if (fechaConf) parts.push(`Conformidad: ${fmtDateShort(i.fecha_conformidad)}`);
    if (i.persona_conformidad) parts.push(`Por: ${i.persona_conformidad}`);
    segs.push({
      id: `${i.id}-imp`,
      stageKey: 'implementada',
      stageName: 'Implementada',
      start,
      end,
      isSingleDay: start.getTime() === end.getTime(),
      color: '#0284c7',
      gradient: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
      borderColor: '#075985',
      textColor: '#ffffff',
      details: parts.length > 0 ? parts.join(' | ') : undefined,
    });
  }

  // 5. Eliminadas (v86 - Muestra la fecha de eliminación en el Timeline)
  const fechaElim = parseTimelineDate(i.fecha_eliminacion);
  if (fechaElim) {
    const parts: string[] = [];
    parts.push(`Eliminada: ${fmtDateShort(i.fecha_eliminacion)}`);
    if (i.solicitado_por) parts.push(`Solicitado por: ${i.solicitado_por}`);
    if (i.motivo_eliminacion) parts.push(`Motivo: ${i.motivo_eliminacion}`);
    segs.push({
      id: `${i.id}-elim`,
      stageKey: 'eliminada',
      stageName: 'Eliminada',
      start: fechaElim,
      end: fechaElim,
      isSingleDay: true,
      color: '#ef4444',
      gradient: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
      borderColor: '#991b1b',
      textColor: '#ffffff',
      details: parts.join(' | '),
    });
  }

  return segs;
}

const DEFAULT_TIMELINE_PAGE_SIZE = 40;

function TimelineIniciativasVP({
  iniciativas,
  onOpenDetailModal,
  phaseFilter,
  onClearPhaseFilter,
}: {
  iniciativas: Iniciativa[];
  onOpenDetailModal?: (iniciativa: Iniciativa) => void;
  phaseFilter?: VpPipelinePhase | null;
  onClearPhaseFilter?: () => void;
}) {
  const [isReady, setIsReady] = useState<boolean>(false);
  const [selectedVP, setSelectedVP] = useState<string>('TODAS');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterAM, setFilterAM] = useState<'TODOS' | GrupoAMKey>('TODOS');
  const [onlyWithDates, setOnlyWithDates] = useState<boolean>(true);
  const [sortOrder, setSortOrder] = useState<'recent' | 'oldest' | 'id' | 'title'>('recent');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [displayLimits, setDisplayLimits] = useState<Record<string, number>>({
    requerimiento: DEFAULT_TIMELINE_PAGE_SIZE,
    proyecto: DEFAULT_TIMELINE_PAGE_SIZE,
    vacio: DEFAULT_TIMELINE_PAGE_SIZE,
  });
  const [showAllRows, setShowAllRows] = useState<boolean>(false);

  // Tooltip flotante
  const [tooltipData, setTooltipData] = useState<{
    seg: TimelineSegment;
    iniciativa: Iniciativa;
    x: number;
    y: number;
  } | null>(null);

  // Inicialización diferida (1 frame) para permitir que el clic en "Abrir Reporte" sea 100% instantáneo
  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      setIsReady(true);
    });
    return () => cancelAnimationFrame(frameId);
  }, []);

  const today = useMemo(() => new Date(), []);
  const todayMs = today.getTime();

  // Opciones de VP para el filtro
  const vpOptions = useMemo(() => {
    const set = new Set<string>();
    iniciativas.forEach(i => {
      const vp = normalize(i.vp_solicitante);
      if (vp) set.add(vp);
    });
    return Array.from(set).sort((a, b) => optLabel(a).localeCompare(optLabel(b), 'es'));
  }, [iniciativas]);

  // Procesar todas las iniciativas con sus fechas, clasificación AM y segmentos
  const allRows = useMemo<TimelineRowItem[]>(() => {
    return iniciativas.map(i => {
      const segments = buildTimelineSegments(i);
      const hasDates = segments.length > 0;
      let earliestDate: Date | null = null;
      let latestDate: Date | null = null;
      if (hasDates) {
        earliestDate = new Date(Math.min(...segments.map(s => s.start.getTime())));
        latestDate = new Date(Math.max(...segments.map(s => s.end.getTime())));
      }

      const isPlan =
        ['planificadas', 'implementadas', 'en_ejecucion', 'terminado'].includes(i.etapa_actual) ||
        Boolean(i.fecha_inicio_planificada || i.fecha_fin_planificada || i.fecha_inicio_real || i.fecha_fin_real);

      const isElim = (i.etapa_actual as string) === 'eliminadas' || (i.etapa_actual as string) === 'eliminada';
      const fechaElim = parseTimelineDate(i.fecha_eliminacion);

      let startDate: Date | null = null;
      let endDate: Date | null = null;

      if (isElim && fechaElim) {
        startDate = fechaElim;
        endDate = fechaElim;
      } else if (isPlan) {
        startDate = parseTimelineDate(i.fecha_inicio_planificada || i.fecha_inicio_real) || earliestDate;
        endDate = parseTimelineDate(i.fecha_fin_planificada || i.fecha_fin_real) || latestDate;
      } else {
        startDate = parseTimelineDate(i.fecha_inicio_estimacion) || earliestDate;
        endDate = parseTimelineDate(i.fecha_fin_estimacion) || latestDate;
      }

      const grupoAM = classifyAM(i);

      return {
        iniciativa: i,
        segments,
        hasDates,
        startDate,
        endDate,
        earliestDate,
        latestDate,
        grupoAM,
        maxLane: 0,
      };
    });
  }, [iniciativas]);

  // Filtrar iniciativas
  const filteredRows = useMemo(() => {
    return allRows.filter(row => {
      // Filtro dinámico por Fase seleccionada desde el Dashboard Estadístico
      if (phaseFilter) {
        if (getVpPipelinePhase(row.iniciativa.etapa_actual) !== phaseFilter) {
          return false;
        }
      }

      if (selectedVP !== 'TODAS') {
        const vp = normalize(row.iniciativa.vp_solicitante);
        if (vp !== selectedVP) return false;
      }
      if (filterAM !== 'TODOS' && row.grupoAM !== filterAM) {
        return false;
      }
      if (onlyWithDates && !row.hasDates) return false;

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const idMatch = String(row.iniciativa.id).includes(term);
        const titleMatch = (row.iniciativa.titulo || '').toLowerCase().includes(term);
        const vpMatch = (row.iniciativa.vp_solicitante || '').toLowerCase().includes(term);
        const liderMatch = (row.iniciativa.lider_dominio || '').toLowerCase().includes(term);
        if (!idMatch && !titleMatch && !vpMatch && !liderMatch) return false;
      }

      return true;
    });
  }, [allRows, phaseFilter, selectedVP, filterAM, onlyWithDates, searchTerm]);

  // Ordenar iniciativas
  const sortedRows = useMemo(() => {
    const list = [...filteredRows];
    list.sort((a, b) => {
      if (sortOrder === 'recent') {
        const timeA = a.latestDate ? a.latestDate.getTime() : 0;
        const timeB = b.latestDate ? b.latestDate.getTime() : 0;
        if (timeA !== timeB) return timeB - timeA;
        return b.iniciativa.id - a.iniciativa.id;
      }
      if (sortOrder === 'oldest') {
        const timeA = a.earliestDate ? a.earliestDate.getTime() : Infinity;
        const timeB = b.earliestDate ? b.earliestDate.getTime() : Infinity;
        if (timeA !== timeB) return timeA - timeB;
        return a.iniciativa.id - b.iniciativa.id;
      }
      if (sortOrder === 'id') {
        return a.iniciativa.id - b.iniciativa.id;
      }
      if (sortOrder === 'title') {
        return (a.iniciativa.titulo || '').localeCompare(b.iniciativa.titulo || '', 'es');
      }
      return 0;
    });
    return list;
  }, [filteredRows, sortOrder]);

  // Agrupación por Columna AM (omitiendo grupos con 0 iniciativas)
  const groupedData = useMemo(() => {
    const order: GrupoAMKey[] = ['requerimiento', 'proyecto', 'vacio'];
    return order
      .filter(k => filterAM === 'TODOS' || filterAM === k)
      .map(key => {
        const cfg = GRUPOS_AM_CONFIG[key];
        const rows = sortedRows.filter(r => r.grupoAM === key);
        return {
          ...cfg,
          rows,
        };
      })
      .filter(grp => grp.rows.length > 0);
  }, [sortedRows, filterAM]);

  // Contadores por grupo para badges
  const reqTotalCount = useMemo(() => allRows.filter(r => r.grupoAM === 'requerimiento').length, [allRows]);
  const proyTotalCount = useMemo(() => allRows.filter(r => r.grupoAM === 'proyecto').length, [allRows]);
  const vacioTotalCount = useMemo(() => allRows.filter(r => r.grupoAM === 'vacio').length, [allRows]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const expandAll = () => setCollapsedGroups({});
  const collapseAll = () => setCollapsedGroups({ requerimiento: true, proyecto: true, vacio: true });

  // Dominio temporal global (incorporando siempre HOY)
  const { minDate, maxDate, totalDuration, todayPct } = useMemo(() => {
    const timestamps: number[] = [todayMs];
    filteredRows.forEach(row => {
      row.segments.forEach(seg => {
        timestamps.push(seg.start.getTime(), seg.end.getTime());
      });
    });

    const minTs = Math.min(...timestamps);
    const maxTs = Math.max(...timestamps);

    const padStart = new Date(minTs);
    padStart.setDate(padStart.getDate() - 15);
    const minD = new Date(padStart.getFullYear(), padStart.getMonth(), 1);

    const padEnd = new Date(maxTs);
    padEnd.setDate(padEnd.getDate() + 20);
    const maxD = new Date(padEnd.getFullYear(), padEnd.getMonth() + 1, 0, 23, 59, 59);

    const dur = Math.max(1, maxD.getTime() - minD.getTime());
    const tPct = Math.min(100, Math.max(0, ((todayMs - minD.getTime()) / dur) * 100));

    return { minDate: minD, maxDate: maxD, totalDuration: dur, todayPct: tPct };
  }, [filteredRows, todayMs]);

  // Columnas mensuales
  const monthColumns = useMemo(() => {
    const cols: { date: Date; label: string; leftPct: number; widthPct: number }[] = [];
    let curr = new Date(minDate.getFullYear(), minDate.getMonth(), 1);

    while (curr <= maxDate) {
      const nextMonth = new Date(curr.getFullYear(), curr.getMonth() + 1, 1);
      const startMs = curr.getTime();
      const endMs = Math.min(nextMonth.getTime(), maxDate.getTime());
      const leftPct = ((startMs - minDate.getTime()) / totalDuration) * 100;
      const widthPct = ((endMs - startMs) / totalDuration) * 100;

      cols.push({
        date: new Date(curr),
        label: format(curr, 'MMM yyyy', { locale: es }),
        leftPct,
        widthPct,
      });

      curr = nextMonth;
    }
    return cols;
  }, [minDate, maxDate, totalDuration]);

  if (!isReady) {
    return (
      <div
        style={{
          marginTop: 24,
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 14,
          padding: '36px 20px',
          textAlign: 'center',
          color: '#64748b',
          boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <Calendar size={28} style={{ color: '#2563eb', opacity: 0.7 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
          Cargando cronograma interactivo...
        </span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>
          Preparando visualización por Columna AM y línea de HOY
        </span>
      </div>
    );
  }

  return (
    <div
      id="cronograma-timeline-section"
      style={{
        marginTop: 24,
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
      }}
    >
      {/* Encabezado de la Sección Timeline */}
      <div
        style={{
          padding: '14px 20px',
          background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
              border: '1px solid #bfdbfe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#2563eb',
            }}
          >
            <Calendar size={18} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
              Cronograma de Iniciativas por Columna AM (Requerimientos / Proyectos / Vacíos)
            </h4>
            <p style={{ margin: '2px 0 0 0', fontSize: 11, color: '#64748b' }}>
              Agrupadas por tipo en columna AM con orientación hacia la fecha de HOY
            </p>
          </div>
        </div>

        {/* Badges de Grupos y HOY (solo mostrar si > 0) */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 11 }}>
          {reqTotalCount > 0 && (
            <span
              style={{
                padding: '3px 8px',
                borderRadius: 16,
                background: '#ecfeff',
                color: '#0e7490',
                fontWeight: 600,
                border: '1px solid #a5f3fc',
              }}
            >
              Requerimientos: {reqTotalCount}
            </span>
          )}
          {proyTotalCount > 0 && (
            <span
              style={{
                padding: '3px 8px',
                borderRadius: 16,
                background: '#eff6ff',
                color: '#1d4ed8',
                fontWeight: 600,
                border: '1px solid #bfdbfe',
              }}
            >
              Proyectos: {proyTotalCount}
            </span>
          )}
          {vacioTotalCount > 0 && (
            <span
              style={{
                padding: '3px 8px',
                borderRadius: 16,
                background: '#fffbeb',
                color: '#b45309',
                fontWeight: 700,
                border: '1px solid #fde68a',
              }}
              title="Iniciativas con la columna AM en blanco o pendiente de clasificación"
            >
              ⚠️ Vacíos: {vacioTotalCount}
            </span>
          )}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 8px',
              borderRadius: 16,
              background: '#fef2f2',
              color: '#b91c1c',
              fontWeight: 700,
              border: '1px solid #fecaca',
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#ef4444' }} />
            HOY: {format(today, 'dd/MM/yyyy')}
          </span>
        </div>
      </div>

      {/* Banner de Filtro Dinámico por Fase (sincronizado con Dashboard Estadístico) */}
      {phaseFilter && (
        <div
          style={{
            padding: '9px 20px',
            background: 'linear-gradient(90deg, #eff6ff 0%, #f0fdf4 100%)',
            borderBottom: '1px solid #bfdbfe',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                padding: '3px 8px',
                borderRadius: 4,
                background:
                  phaseFilter === 1
                    ? '#fef3c7'
                    : phaseFilter === 2
                    ? '#dbeafe'
                    : phaseFilter === 3
                    ? '#d1fae5'
                    : '#fee2e2',
                color:
                  phaseFilter === 1
                    ? '#b45309'
                    : phaseFilter === 2
                    ? '#1d4ed8'
                    : phaseFilter === 3
                    ? '#047857'
                    : '#991b1b',
              }}
            >
              Filtro Activo
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>
              Mostrando iniciativas de:{' '}
              <strong style={{ color: '#0284c7' }}>
                {phaseFilter === 1 && 'Fase 1 (Estimación y Aprobación)'}
                {phaseFilter === 2 && 'Fase 2 (Planificación y Presupuesto)'}
                {phaseFilter === 3 && 'Fase 3 (Planificadas e Implementadas)'}
                {phaseFilter === 'observaciones' && 'Con Observaciones (Registro Incompleto y Eliminadas)'}
              </strong>
            </span>
            <span style={{ fontSize: 11, color: '#64748b' }}>
              ({filteredRows.length} iniciativas en el cronograma)
            </span>
          </div>

          {onClearPhaseFilter && (
            <button
              onClick={onClearPhaseFilter}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 11px',
                borderRadius: 6,
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                color: '#334155',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = '#94a3b8';
                (e.currentTarget as HTMLElement).style.color = '#0f172a';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = '#cbd5e1';
                (e.currentTarget as HTMLElement).style.color = '#334155';
              }}
            >
              <X size={12} />
              <span>Ver todas las fases</span>
            </button>
          )}
        </div>
      )}

      {/* Barra de Filtros y Controles del Timeline */}
      <div
        style={{
          padding: '10px 20px',
          background: '#ffffff',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, flex: 1 }}>
          {/* Buscador */}
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              minWidth: 180,
              maxWidth: 240,
              flex: 1,
            }}
          >
            <Search
              size={13}
              style={{ position: 'absolute', left: 10, color: '#94a3b8', pointerEvents: 'none' }}
            />
            <input
              type="text"
              placeholder="Buscar por ID, título..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '5px 26px 5px 28px',
                fontSize: 11,
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                outline: 'none',
                backgroundColor: '#f8fafc',
              }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{
                  position: 'absolute',
                  right: 8,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  padding: 2,
                  display: 'flex',
                }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Filtro por Columna AM */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Columna AM:</span>
            <select
              value={filterAM}
              onChange={e => setFilterAM(e.target.value as any)}
              style={{
                padding: '4px 8px',
                fontSize: 11,
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#1e293b',
              }}
            >
              <option value="TODOS">Todos los grupos ({allRows.length})</option>
              {reqTotalCount > 0 && (
                <option value="requerimiento">Requerimientos ({reqTotalCount})</option>
              )}
              {proyTotalCount > 0 && (
                <option value="proyecto">Proyectos ({proyTotalCount})</option>
              )}
              {vacioTotalCount > 0 && (
                <option value="vacio">⚠️ Vacíos / Por regularizar ({vacioTotalCount})</option>
              )}
            </select>
          </div>

          {/* Selector de VP */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>VP:</span>
            <select
              value={selectedVP}
              onChange={e => setSelectedVP(e.target.value)}
              style={{
                padding: '4px 8px',
                fontSize: 11,
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#1e293b',
                maxWidth: 190,
              }}
            >
              <option value="TODAS">Todas las VPs ({iniciativas.length})</option>
              {vpOptions.map(vp => (
                <option key={vp} value={vp}>
                  {optLabel(vp)}
                </option>
              ))}
            </select>
          </div>

          {/* Selector de Orden */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Orden:</span>
            <select
              value={sortOrder}
              onChange={e => setSortOrder(e.target.value as any)}
              style={{
                padding: '4px 8px',
                fontSize: 11,
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#1e293b',
              }}
            >
              <option value="recent">Fecha más reciente</option>
              <option value="oldest">Fecha más antigua</option>
              <option value="id">Por ID</option>
              <option value="title">Por Título</option>
            </select>
          </div>

          {/* Toggle Solo con fechas */}
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11,
              color: '#475569',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={onlyWithDates}
              onChange={e => setOnlyWithDates(e.target.checked)}
              style={{ cursor: 'pointer', accentColor: '#2563eb' }}
            />
            Solo con fechas
          </label>
        </div>

        {/* Acciones de Acordeón y Modo Paginado */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            onClick={() => setShowAllRows(v => !v)}
            style={{
              padding: '4px 8px',
              fontSize: 10,
              fontWeight: 600,
              borderRadius: 6,
              border: showAllRows ? '1px solid #93c5fd' : '1px solid #cbd5e1',
              backgroundColor: showAllRows ? '#eff6ff' : '#ffffff',
              color: showAllRows ? '#1d4ed8' : '#475569',
              cursor: 'pointer',
            }}
            title="Alternar entre ver las primeras 40 filas o todas las filas de cada grupo"
          >
            {showAllRows ? 'Modo paginado (40/grupo)' : `Ver todas (${filteredRows.length})`}
          </button>
          <button
            type="button"
            onClick={expandAll}
            style={{
              padding: '4px 8px',
              fontSize: 10,
              fontWeight: 600,
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              color: '#475569',
              cursor: 'pointer',
            }}
            title="Expandir todos los grupos"
          >
            Expandir todos
          </button>
          <button
            type="button"
            onClick={collapseAll}
            style={{
              padding: '4px 8px',
              fontSize: 10,
              fontWeight: 600,
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              color: '#475569',
              cursor: 'pointer',
            }}
            title="Colapsar todos los grupos"
          >
            Colapsar todos
          </button>
        </div>
      </div>

      {/* Área del Timeline Gantt */}
      {sortedRows.length === 0 ? (
        <div style={{ padding: '48px 20px', textAlign: 'center', color: '#94a3b8' }}>
          <Calendar size={32} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#475569' }}>
            No se encontraron iniciativas con los filtros seleccionados
          </p>
          <p style={{ margin: '4px 0 0 0', fontSize: 11, color: '#94a3b8' }}>
            Prueba ajustando el filtro de Columna AM, término de búsqueda, VP o desmarcando "Solo con fechas".
          </p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', position: 'relative' }}>
          <div style={{ minWidth: 1240, display: 'flex', flexDirection: 'column' }}>
            {/* Header del Gantt: Columnas a la izquierda (530px) | Meses y HOY a la derecha */}
            <div
              style={{
                display: 'flex',
                background: '#f8fafc',
                borderBottom: '2px solid #e2e8f0',
                position: 'relative',
              }}
            >
              {/* Columnas Izquierdas Header (530px en total: 360px + 85px + 85px) */}
              <div
                style={{
                  width: 530,
                  minWidth: 530,
                  maxWidth: 530,
                  display: 'flex',
                  alignItems: 'center',
                  borderRight: '1px solid #e2e8f0',
                  boxSizing: 'border-box',
                }}
              >
                <div
                  style={{
                    width: 360,
                    minWidth: 360,
                    maxWidth: 360,
                    padding: '8px 12px',
                    fontWeight: 700,
                    fontSize: 11,
                    color: '#475569',
                    borderRight: '1px solid #f1f5f9',
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>Iniciativa (Nombre completo)</span>
                  <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>
                    ({sortedRows.length} en total)
                  </span>
                </div>
                <div
                  style={{
                    width: 85,
                    minWidth: 85,
                    maxWidth: 85,
                    padding: '8px 4px',
                    fontWeight: 700,
                    fontSize: 11,
                    color: '#475569',
                    textAlign: 'center',
                    borderRight: '1px solid #f1f5f9',
                    boxSizing: 'border-box',
                  }}
                >
                  F. Inicio
                </div>
                <div
                  style={{
                    width: 85,
                    minWidth: 85,
                    maxWidth: 85,
                    padding: '8px 4px',
                    fontWeight: 700,
                    fontSize: 11,
                    color: '#475569',
                    textAlign: 'center',
                    boxSizing: 'border-box',
                  }}
                >
                  F. Fin
                </div>
              </div>

              {/* Pista Temporal Header */}
              <div
                style={{
                  flex: 1,
                  position: 'relative',
                  height: 36,
                  display: 'flex',
                  boxSizing: 'border-box',
                }}
              >
                {/* Meses */}
                {monthColumns.map((col, idx) => (
                  <div
                    key={idx}
                    style={{
                      position: 'absolute',
                      left: `${col.leftPct}%`,
                      width: `${col.widthPct}%`,
                      height: '100%',
                      borderRight: '1px solid #e2e8f0',
                      padding: '8px 6px',
                      boxSizing: 'border-box',
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#475569',
                      textTransform: 'capitalize',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {col.label}
                  </div>
                ))}

                {/* Badge flotante de HOY en la cabecera */}
                <div
                  style={{
                    position: 'absolute',
                    left: `${todayPct}%`,
                    top: 5,
                    transform: 'translateX(-50%)',
                    zIndex: 30,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    padding: '2px 7px',
                    borderRadius: 12,
                    backgroundColor: '#ef4444',
                    color: '#ffffff',
                    fontSize: 9,
                    fontWeight: 800,
                    boxShadow: '0 2px 6px rgba(239, 68, 68, 0.45)',
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                  }}
                >
                  <span>📍 HOY</span>
                  <span style={{ fontWeight: 600, opacity: 0.9 }}>
                    ({format(today, 'dd/MM/yy')})
                  </span>
                </div>
              </div>
            </div>

            {/* GRUPOS POR COLUMNA AM */}
            <div style={{ position: 'relative' }}>
              {/* CUADRÍCULA GLOBAL DE MESES DE FONDO (una sola vez para toda la tabla, en vez de repetirla en cada fila) */}
              <div
                style={{
                  position: 'absolute',
                  left: 530,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  pointerEvents: 'none',
                  zIndex: 0,
                }}
              >
                {monthColumns.map((col, idx) => (
                  <div
                    key={idx}
                    style={{
                      position: 'absolute',
                      left: `${col.leftPct}%`,
                      width: `${col.widthPct}%`,
                      top: 0,
                      bottom: 0,
                      borderRight: '1px solid #f1f5f9',
                      boxSizing: 'border-box',
                    }}
                  />
                ))}
              </div>

              {/* LÍNEA VERTICAL DE HOY QUE ATRAVIESA TODAS LAS FILAS */}
              <div
                style={{
                  position: 'absolute',
                  left: `calc(530px + (100% - 530px) * ${todayPct / 100})`,
                  top: 0,
                  bottom: 0,
                  width: 2,
                  borderLeft: '2px dashed #ef4444',
                  boxShadow: '0 0 8px rgba(239, 68, 68, 0.4)',
                  zIndex: 20,
                  pointerEvents: 'none',
                }}
              />

              {groupedData.map(grp => {
                const isCollapsed = Boolean(collapsedGroups[grp.key]);

                return (
                  <div key={grp.key} style={{ borderBottom: '1px solid #e2e8f0', position: 'relative', zIndex: 1 }}>
                    {/* ENCABEZADO DE GRUPO (ACCORDION) */}
                    <div
                      onClick={() => toggleGroup(grp.key)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '7px 14px',
                        background: grp.headerBg,
                        borderBottom: isCollapsed ? 'none' : '1px solid ' + grp.headerBorder,
                        cursor: 'pointer',
                        userSelect: 'none',
                        transition: 'background-color 0.15s ease',
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.filter = 'brightness(0.97)';
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.filter = 'none';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {isCollapsed ? (
                          <ChevronRight size={14} style={{ color: grp.headerText }} />
                        ) : (
                          <ChevronDown size={14} style={{ color: grp.headerText }} />
                        )}
                        <span style={{ fontSize: 12, fontWeight: 700, color: grp.headerText }}>
                          {grp.title} · {grp.rows.length} iniciativas
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {grp.key === 'vacio' && grp.rows.length > 0 && (
                          <span style={{ fontSize: 10, color: '#b45309', fontWeight: 600 }}>
                            (Registros con columna AM pendiente de regularizar)
                          </span>
                        )}
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 12,
                            background: grp.badgeBg,
                            color: grp.badgeText,
                            border: `1px solid ${grp.headerBorder}`,
                          }}
                        >
                          {grp.tag} ({grp.rows.length})
                        </span>
                      </div>
                    </div>

                    {/* FILAS DE INICIATIVAS DEL GRUPO */}
                    {!isCollapsed && (
                      grp.rows.length === 0 ? (
                        <div
                          style={{
                            padding: '10px 16px',
                            color: '#94a3b8',
                            fontSize: 11,
                            fontStyle: 'italic',
                            background: '#fafafa',
                          }}
                        >
                          No hay iniciativas en este grupo con los filtros seleccionados.
                        </div>
                      ) : (
                        (() => {
                          const isSearchActive = Boolean(searchTerm.trim());
                          const limit = showAllRows || isSearchActive
                            ? grp.rows.length
                            : (displayLimits[grp.key] || DEFAULT_TIMELINE_PAGE_SIZE);
                          const visibleRows = grp.rows.slice(0, limit);
                          const hasMore = grp.rows.length > limit;

                          return (
                            <>
                              {visibleRows.map((row, rowIdx) => {
                                const etapaCfg =
                                  ETAPAS_MAP.get(row.iniciativa.etapa_actual) ||
                                  ETAPAS_PLANIFICADAS_MAP.get(row.iniciativa.etapa_actual);

                                return (
                                  <div
                                    key={row.iniciativa.id}
                                    style={{
                                      display: 'flex',
                                      minHeight: 34,
                                      background: rowIdx % 2 === 0 ? 'rgba(255,255,255,0.85)' : 'rgba(252,252,253,0.85)',
                                      borderBottom: '1px solid #f1f5f9',
                                      transition: 'background-color 0.15s ease',
                                    }}
                                    onMouseEnter={e => {
                                      (e.currentTarget as HTMLElement).style.backgroundColor = '#f1f5f9';
                                    }}
                                    onMouseLeave={e => {
                                      (e.currentTarget as HTMLElement).style.backgroundColor =
                                        rowIdx % 2 === 0 ? 'rgba(255,255,255,0.85)' : 'rgba(252,252,253,0.85)';
                                    }}
                                  >
                                    {/* Columna 1: ID · Título (360px) - Nombre Completo */}
                                    <div
                                      style={{
                                        width: 360,
                                        minWidth: 360,
                                        maxWidth: 360,
                                        padding: '6px 12px',
                                        borderRight: '1px solid #f1f5f9',
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: 6,
                                        boxSizing: 'border-box',
                                      }}
                                    >
                                      <span
                                        onClick={() => onOpenDetailModal && onOpenDetailModal(row.iniciativa)}
                                        title={`Ver detalle de #${row.iniciativa.id}`}
                                        style={{
                                          fontSize: 10.5,
                                          fontWeight: 700,
                                          color: '#2563eb',
                                          cursor: 'pointer',
                                          flexShrink: 0,
                                          paddingTop: 1.5,
                                        }}
                                      >
                                        {row.iniciativa.id} ·
                                      </span>

                                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                                        <span
                                          onClick={() => onOpenDetailModal && onOpenDetailModal(row.iniciativa)}
                                          title={`${row.iniciativa.titulo}\nVP: ${row.iniciativa.vp_solicitante || '—'}\nEtapa: ${getEtapaHumanLabel(row.iniciativa.etapa_actual)}\nColumna AM: ${row.iniciativa.proyecto_o_req || '(Vacío)'}`}
                                          style={{
                                            fontSize: 11,
                                            fontWeight: 600,
                                            color: '#1e293b',
                                            cursor: 'pointer',
                                            whiteSpace: 'normal',
                                            wordBreak: 'break-word',
                                            lineHeight: 1.35,
                                          }}
                                        >
                                          {row.iniciativa.titulo}
                                        </span>

                                        {/* Badge para iniciativas eliminadas: Muestra fecha de eliminación y motivo */}
                                        {(row.iniciativa.etapa_actual === 'eliminadas' || row.iniciativa.etapa_actual === 'eliminada') && (
                                          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                            <span
                                              style={{
                                                fontSize: 9.5,
                                                fontWeight: 700,
                                                padding: '1px 6px',
                                                borderRadius: 4,
                                                background: '#fee2e2',
                                                color: '#991b1b',
                                                border: '1px solid #fca5a5',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: 3,
                                              }}
                                              title={row.iniciativa.motivo_eliminacion || undefined}
                                            >
                                              ✕ Eliminada: {row.iniciativa.fecha_eliminacion ? fmtDateShort(row.iniciativa.fecha_eliminacion) : 'Sin fecha'}
                                            </span>
                                            {row.iniciativa.solicitado_por && (
                                              <span style={{ fontSize: 9, color: '#7f1d1d', fontWeight: 600 }}>
                                                Sol: {row.iniciativa.solicitado_por}
                                              </span>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Columna 2: F. Inicio (85px) */}
                                    <div
                                      style={{
                                        width: 85,
                                        minWidth: 85,
                                        maxWidth: 85,
                                        padding: '6px 4px',
                                        borderRight: '1px solid #f1f5f9',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 11,
                                        color: '#475569',
                                        fontVariantNumeric: 'tabular-nums',
                                        boxSizing: 'border-box',
                                      }}
                                    >
                                      {fmtDateShort(row.startDate)}
                                    </div>

                                    {/* Columna 3: F. Fin (85px) */}
                                    <div
                                      style={{
                                        width: 85,
                                        minWidth: 85,
                                        maxWidth: 85,
                                        padding: '6px 4px',
                                        borderRight: '1px solid #e2e8f0',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 11,
                                        color: '#475569',
                                        fontVariantNumeric: 'tabular-nums',
                                        boxSizing: 'border-box',
                                      }}
                                    >
                                      {fmtDateShort(row.endDate)}
                                    </div>

                                    {/* Columna 4: Pista Temporal (Gantt Track) */}
                                    <div
                                      style={{
                                        flex: 1,
                                        position: 'relative',
                                        boxSizing: 'border-box',
                                        minHeight: 34,
                                      }}
                                    >
                                      {/* Si no tiene fechas */}
                                      {!row.hasDates ? (
                                        <div
                                          style={{
                                            position: 'absolute',
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            left: 16,
                                            color: '#94a3b8',
                                            fontSize: 10,
                                            fontStyle: 'italic',
                                          }}
                                        >
                                          Sin fechas registradas
                                        </div>
                                      ) : (
                                        /* Segmentos de Tiempo con ID impreso dentro de la barra */
                                        row.segments.map((seg, sIdx) => {
                                          const isElimSeg = seg.stageKey === 'eliminada';
                                          const leftPct = Math.max(
                                            0,
                                            ((seg.start.getTime() - minDate.getTime()) / totalDuration) * 100
                                          );
                                          const rightPct = Math.min(
                                            100,
                                            ((seg.end.getTime() - minDate.getTime()) / totalDuration) * 100
                                          );
                                          const rawWidthPct = Math.max(0, rightPct - leftPct);
                                          const widthPct = seg.isSingleDay
                                            ? Math.max(1.0, rawWidthPct)
                                            : Math.max(1.5, rawWidthPct);

                                          return (
                                            <div
                                              key={seg.id}
                                              style={{
                                                position: 'absolute',
                                                left: `${leftPct}%`,
                                                width: `${widthPct}%`,
                                                top: '50%',
                                                transform: 'translateY(-50%)',
                                                height: 18,
                                                borderRadius: 4,
                                                background: seg.gradient || grp.barGradient,
                                                border: `1px solid ${seg.borderColor || grp.barBorder}`,
                                                boxShadow: isElimSeg ? '0 1px 3px rgba(239, 68, 68, 0.45)' : '0 1px 2px rgba(0,0,0,0.12)',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                padding: '0 4px',
                                                boxSizing: 'border-box',
                                                zIndex: isElimSeg ? 9 : seg.isSingleDay ? 8 : 4 + sIdx,
                                                transition: 'transform 0.1s ease, filter 0.1s ease, z-index 0.1s ease',
                                              }}
                                              onMouseEnter={e => {
                                                const target = e.currentTarget as HTMLElement;
                                                target.style.transform = 'translateY(-50%) scaleY(1.2)';
                                                target.style.filter = 'brightness(1.15)';
                                                target.style.zIndex = '30';
                                                const rect = target.getBoundingClientRect();
                                                setTooltipData({
                                                  seg,
                                                  iniciativa: row.iniciativa,
                                                  x: rect.left + rect.width / 2,
                                                  y: rect.top,
                                                });
                                              }}
                                              onMouseLeave={e => {
                                                const target = e.currentTarget as HTMLElement;
                                                target.style.transform = 'translateY(-50%)';
                                                target.style.filter = 'none';
                                                target.style.zIndex = String(isElimSeg ? 9 : seg.isSingleDay ? 8 : 4 + sIdx);
                                                setTooltipData(null);
                                              }}
                                              onClick={() =>
                                                onOpenDetailModal && onOpenDetailModal(row.iniciativa)
                                              }
                                            >
                                              <span
                                                style={{
                                                  fontSize: 9,
                                                  fontWeight: 800,
                                                  color: '#ffffff',
                                                  whiteSpace: 'nowrap',
                                                  overflow: 'hidden',
                                                  textOverflow: 'ellipsis',
                                                  textShadow: '0 1px 2px rgba(0,0,0,0.4)',
                                                  display: 'inline-flex',
                                                  alignItems: 'center',
                                                  gap: 2,
                                                }}
                                              >
                                                {isElimSeg && '✕ '}
                                                {row.iniciativa.id}
                                              </span>
                                            </div>
                                          );
                                        })
                                      )}
                                    </div>
                                  </div>
                                );
                              })}

                              {/* Footer de "Mostrar más" si el grupo tiene más registros */}
                              {hasMore && (
                                <div
                                  style={{
                                    padding: '8px 16px',
                                    background: '#f8fafc',
                                    borderBottom: '1px solid #e2e8f0',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 12,
                                  }}
                                >
                                  <span style={{ fontSize: 11, color: '#64748b' }}>
                                    Mostrando <strong>{visibleRows.length}</strong> de <strong>{grp.rows.length}</strong> {grp.tag.toLowerCase()}s
                                  </span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <button
                                      type="button"
                                      onClick={() => setDisplayLimits(prev => ({
                                        ...prev,
                                        [grp.key]: (prev[grp.key] || DEFAULT_TIMELINE_PAGE_SIZE) + 40,
                                      }))}
                                      style={{
                                        padding: '4px 10px',
                                        fontSize: 11,
                                        fontWeight: 700,
                                        borderRadius: 6,
                                        border: '1px solid #cbd5e1',
                                        background: '#ffffff',
                                        color: '#2563eb',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      Mostrar 40 más
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDisplayLimits(prev => ({
                                        ...prev,
                                        [grp.key]: grp.rows.length,
                                      }))}
                                      style={{
                                        padding: '4px 10px',
                                        fontSize: 11,
                                        fontWeight: 700,
                                        borderRadius: 6,
                                        border: '1px solid #bfdbfe',
                                        background: '#eff6ff',
                                        color: '#1d4ed8',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      Mostrar todas ({grp.rows.length})
                                    </button>
                                  </div>
                                </div>
                              )}
                            </>
                          );
                        })()
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Footer del Timeline */}
      <div
        style={{
          padding: '10px 20px',
          background: '#f8fafc',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          fontSize: 11,
          color: '#64748b',
        }}
      >
        <div>
          Total iniciativas visibles: <strong style={{ color: '#0f172a' }}>{sortedRows.length}</strong>
          {sortedRows.filter(r => r.grupoAM === 'requerimiento').length > 0 && (
            <>
              {' • '}
              Requerimientos: <strong style={{ color: '#0891b2' }}>{sortedRows.filter(r => r.grupoAM === 'requerimiento').length}</strong>
            </>
          )}
          {sortedRows.filter(r => r.grupoAM === 'proyecto').length > 0 && (
            <>
              {' • '}
              Proyectos: <strong style={{ color: '#2563eb' }}>{sortedRows.filter(r => r.grupoAM === 'proyecto').length}</strong>
            </>
          )}
          {sortedRows.filter(r => r.grupoAM === 'vacio').length > 0 && (
            <>
              {' • '}
              Por regularizar: <strong style={{ color: '#b45309' }}>{sortedRows.filter(r => r.grupoAM === 'vacio').length}</strong>
            </>
          )}
          {selectedVP !== 'TODAS' && ` (filtradas por VP: ${optLabel(selectedVP)})`}
        </div>

        <div style={{ fontSize: 10, color: '#94a3b8' }}>
          * Haz clic en los encabezados de grupo para expandir o colapsar. Clic en cualquier iniciativa para ver su detalle completo.
        </div>
      </div>

      {/* Tooltip Flotante */}
      {tooltipData && (
        <div
          style={{
            position: 'fixed',
            left: tooltipData.x,
            top: tooltipData.y - 8,
            transform: 'translate(-50%, -100%)',
            background: '#0f172a',
            color: '#f8fafc',
            padding: '10px 14px',
            borderRadius: 8,
            fontSize: 11,
            lineHeight: 1.4,
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)',
            zIndex: 99999,
            pointerEvents: 'none',
            maxWidth: 320,
            whiteSpace: 'normal',
          }}
        >
          {/* Cabecera del tooltip */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                backgroundColor: tooltipData.seg.color,
                display: 'inline-block',
              }}
            />
            <span style={{ fontWeight: 700, color: '#ffffff' }}>
              {tooltipData.seg.stageName}
            </span>
            <span style={{ color: '#94a3b8', fontSize: 10 }}>
              (#{tooltipData.iniciativa.id})
            </span>
          </div>

          <div style={{ color: '#cbd5e1', fontWeight: 600, marginBottom: 6, fontSize: 11 }}>
            {tooltipData.iniciativa.titulo}
          </div>

          {/* Fechas */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10 }}>
            {tooltipData.seg.stageKey === 'eliminada' ? (
              <div style={{ padding: '6px 8px', background: 'rgba(239, 68, 68, 0.25)', border: '1px solid #ef4444', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ color: '#fca5a5', fontWeight: 800 }}>
                  ✕ Iniciativa Eliminada el {format(tooltipData.seg.start, 'dd/MM/yyyy')}
                </div>
                {tooltipData.iniciativa.solicitado_por && (
                  <div style={{ color: '#ffffff' }}>
                    Solicitado por: <strong>{tooltipData.iniciativa.solicitado_por}</strong>
                  </div>
                )}
                {tooltipData.iniciativa.motivo_eliminacion && (
                  <div style={{ color: '#fecdd3', fontStyle: 'italic' }}>
                    Motivo: {tooltipData.iniciativa.motivo_eliminacion}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div>
                  <span style={{ color: '#94a3b8' }}>Inicio:</span>{' '}
                  <strong style={{ color: '#ffffff' }}>
                    {format(tooltipData.seg.start, 'dd/MM/yyyy')}
                  </strong>{' '}
                  <span style={{ color: '#94a3b8' }}>➔ Fin:</span>{' '}
                  <strong style={{ color: '#ffffff' }}>
                    {format(tooltipData.seg.end, 'dd/MM/yyyy')}
                  </strong>
                </div>

                <div>
                  <span style={{ color: '#94a3b8' }}>Duración:</span>{' '}
                  <span style={{ color: '#38bdf8', fontWeight: 600 }}>
                    {Math.max(1, differenceInCalendarDays(tooltipData.seg.end, tooltipData.seg.start) + 1)} días calendario
                  </span>
                </div>

                {/* Relación con HOY */}
                <div style={{ marginTop: 2, paddingTop: 4, borderTop: '1px solid #334155' }}>
                  {tooltipData.seg.end < today ? (
                    <span style={{ color: '#94a3b8' }}>
                      ✓ Concluida ({differenceInCalendarDays(today, tooltipData.seg.end)} días atrás vs HOY)
                    </span>
                  ) : tooltipData.seg.start <= today && tooltipData.seg.end >= today ? (
                    <span style={{ color: '#facc15', fontWeight: 700 }}>
                      ⚡ En curso respecto a HOY (quedan {differenceInCalendarDays(tooltipData.seg.end, today)} días)
                    </span>
                  ) : (
                    <span style={{ color: '#60a5fa' }}>
                      ⏳ Futura (inicia en {differenceInCalendarDays(tooltipData.seg.start, today)} días vs HOY)
                    </span>
                  )}
                </div>
              </>
            )}

            {tooltipData.seg.details && (
              <div style={{ color: '#e2e8f0', marginTop: 4, fontStyle: 'italic' }}>
                {tooltipData.seg.details}
              </div>
            )}

            <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid #334155', color: '#94a3b8', fontSize: 10 }}>
              <div>Columna AM: <span style={{ color: '#ffffff', fontWeight: 600 }}>{tooltipData.iniciativa.proyecto_o_req || '(Vacío / Por regularizar)'}</span></div>
              <div>VP: <span style={{ color: '#ffffff', fontWeight: 500 }}>{optLabel(tooltipData.iniciativa.vp_solicitante)}</span></div>
              {tooltipData.iniciativa.lider_dominio && (
                <div>Líder: <span style={{ color: '#ffffff', fontWeight: 500 }}>{optLabel(tooltipData.iniciativa.lider_dominio)}</span></div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers para Dashboard Estadístico y Pipeline de 4 Fases
// ---------------------------------------------------------------------------
function getInitiativePhase(etapa: EtapaPipeline | string): 1 | 2 | 3 | 4 {
  const p = getVpPipelinePhase(etapa);
  if (p === 1) return 1;
  if (p === 2) return 2;
  if (p === 3) return 3;
  return 4; // 'observaciones'
}

function getInitiativeActionOwner(i: Iniciativa): 'IT' | 'Negocio' | 'None' {
  const norm = (i.etapa_actual || '').toLowerCase();
  if (
    norm === 'implementadas' ||
    norm === 'implementada' ||
    norm === 'terminado' ||
    norm === 'eliminadas' ||
    norm === 'eliminada'
  ) {
    return 'None';
  }
  if (
    norm === 'registro_incompleto' ||
    norm === 'por_aprobar_estimacion' ||
    norm === 'por_habilitar_presupuesto' ||
    norm === 'aprobar_planificacion' ||
    norm === 'por_aprobar_planificacion' ||
    norm === 'detenido'
  ) {
    return 'Negocio';
  }
  // por_estimar, por_reestimar, por_planificar, planificadas, por_iniciar, en_ejecucion
  return 'IT';
}

function getEcosistema(i: Iniciativa): string {
  let rawName = '';
  if (i.frente && i.frente.trim()) rawName = i.frente.trim();
  else if (i.raw_fields) {
    const rawEco = (i.raw_fields['Ecosistema'] || i.raw_fields['ecosistema'] || i.raw_fields['Dominio'] || i.raw_fields['dominio']) as string | undefined;
    if (rawEco && typeof rawEco === 'string' && rawEco.trim()) rawName = rawEco.trim();
  }
  if (!rawName && i.pilar_estrategico && i.pilar_estrategico.trim()) rawName = i.pilar_estrategico.trim();
  if (!rawName && i.lider_dominio && i.lider_dominio.trim()) rawName = i.lider_dominio.trim();
  if (!rawName && i.institucion && i.institucion.trim()) rawName = i.institucion.trim();
  return normalizeEcosistemaName(rawName || 'General / Otros');
}

function getInitiativeMilestoneDate(i: Iniciativa): string | null {
  const phase = getVpPipelinePhase(i.etapa_actual);
  if (phase === 3) {
    return i.fecha_fin_planificada || i.fecha_fin_real || i.fecha_inicio_planificada || i.fecha_entrega_requerida || null;
  }
  if (phase === 2) {
    return i.fecha_fin_planificada || i.fecha_inicio_planificada || i.fecha_entrega_requerida || null;
  }
  if (phase === 1) {
    return i.fecha_fin_estimacion || i.fecha_fin_reestimacion || i.fecha_inicio_estimacion || i.fecha_entrega_requerida || null;
  }
  if (phase === 'observaciones') {
    return i.fecha_eliminacion || i.fecha_entrega_requerida || null;
  }
  return i.fecha_fin_planificada || i.fecha_pase_produccion || i.fecha_entrega_requerida || null;
}

function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function exportReportToHTML(
  iniciativas: Iniciativa[],
  selectedVPs: string[],
  macro: MacroFilters,
  reportTitle: string = 'Reporte de Gestión de la Demanda TI'
) {
  const now = new Date();
  const fechaGeneracion = format(now, 'dd/MM/yyyy HH:mm:ss');
  const fileDate = format(now, 'yyyyMMdd_HHmm');

  // Solo incluir iniciativas correspondientes a la VP seleccionada (o las VPs seleccionadas)
  const dataFiltered = iniciativas;

  const vpFiltrosTexto = selectedVPs.length > 0
    ? selectedVPs.map(v => optLabel(v)).join(', ')
    : 'Todas las Vicepresidencias';

  // Serializar datos limpios para el runtime JS interactivo del HTML exportado
  const serializedIniciativas = JSON.stringify(dataFiltered).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(reportTitle)} - ${escapeHtml(vpFiltrosTexto)}</title>
  <style>
    :root {
      --primary: #0284c7;
      --primary-dark: #0369a1;
      --bg: #f8fafc;
      --border: #e2e8f0;
      --border-dark: #cbd5e1;
      --text: #0f172a;
      --text-muted: #64748b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 20px;
    }

    /* Barra Superior de Filtros idéntica a la app */
    .top-filter-bar {
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px 18px;
      margin-bottom: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.03);
    }
    .top-filter-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      flex-wrap: wrap;
      gap: 10px;
    }
    .top-filter-title {
      font-size: 13px;
      font-weight: 800;
      color: #0f172a;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .filter-inputs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 10px;
    }
    .filter-box {
      background: #f8fafc;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 6px 10px;
    }
    .filter-box-label {
      font-size: 9.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
      margin-bottom: 2px;
    }
    .filter-box-val {
      font-size: 11.5px;
      font-weight: 700;
      color: #0284c7;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Card principal del reporte */
    .report-card {
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.03);
    }
    .report-card-title {
      font-size: 15px;
      font-weight: 800;
      color: #0f172a;
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
    }

    /* Sección Colapsible de Pipeline */
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px;
      background: #f8fafc;
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-bottom: 16px;
      font-size: 12px;
      font-weight: 800;
      color: #0f172a;
    }

    /* 4 Phase Cards (Filtros dinámicos interactivos) */
    .phase-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 14px;
      margin-bottom: 20px;
    }
    .phase-card {
      background: #ffffff;
      border-radius: 12px;
      padding: 16px 18px;
      cursor: pointer;
      transition: all 0.15s ease;
      position: relative;
      user-select: none;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .phase-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(0,0,0,0.06);
    }
    .phase-card-1 {
      border: 1px solid #fed7aa;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    .phase-card-1.active {
      border-color: #f59e0b;
      box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.35), 0 8px 18px rgba(0,0,0,0.06);
    }
    .phase-card-2 {
      border: 1px solid #bfdbfe;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    .phase-card-2.active {
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.35), 0 8px 18px rgba(0,0,0,0.06);
    }
    .phase-card-3 {
      border: 1px solid #a7f3d0;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    .phase-card-3.active {
      border-color: #059669;
      box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.35), 0 8px 18px rgba(0,0,0,0.06);
    }
    .phase-card-obs {
      border: 1px solid #fecdd3;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    .phase-card-obs.active {
      border-color: #e11d48;
      box-shadow: 0 0 0 3px rgba(225, 29, 72, 0.35), 0 8px 18px rgba(0,0,0,0.06);
    }

    .phase-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .phase-pill {
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 2px 8px;
      border-radius: 4px;
    }
    .phase-title {
      font-size: 13.5px;
      font-weight: 800;
      color: #1e293b;
      margin: 0 0 2px 0;
    }
    .phase-desc {
      font-size: 10.5px;
      color: #64748b;
      margin: 0 0 8px 0;
    }
    .phase-count {
      font-size: 28px;
      font-weight: 900;
      color: #0f172a;
      margin-bottom: 10px;
      line-height: 1;
    }
    .subetapa-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-height: 48px;
      margin-bottom: 12px;
    }
    .subetapa-item {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #475569;
    }
    .phase-footer {
      padding-top: 10px;
      border-top: 1px solid #f1f5f9;
    }
    .action-row {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      font-weight: 700;
      color: #64748b;
      margin-bottom: 5px;
    }
    .progress-bar-container {
      height: 6px;
      width: 100%;
      background: #f1f5f9;
      border-radius: 4px;
      overflow: hidden;
      display: flex;
      margin-bottom: 8px;
    }
    .filter-btn-pill {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 12px;
      display: inline-block;
      transition: all 0.15s ease;
    }

    /* 3 Strategic Cards */
    .strat-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
      gap: 14px;
      margin-bottom: 24px;
    }
    .strat-card {
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px 18px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .strat-card-title {
      font-size: 13.5px;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 3px 0;
    }
    .strat-card-sub {
      font-size: 11px;
      color: #64748b;
      margin: 0 0 12px 0;
    }

    /* Timeline Section */
    .timeline-container {
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.02);
    }
    .timeline-header {
      padding: 12px 18px;
      background: #f8fafc;
      border-bottom: 1px solid var(--border);
      font-size: 13px;
      font-weight: 800;
      color: #0f172a;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }
    .filter-banner {
      background: linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%);
      border-bottom: 1px solid #bfdbfe;
      padding: 8px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
    }
    .timeline-body {
      overflow-x: auto;
      min-width: 100%;
    }
    .timeline-table {
      width: 100%;
      min-width: 950px;
      border-collapse: collapse;
      font-size: 11px;
    }
    .timeline-table th {
      background: #f8fafc;
      color: #475569;
      font-weight: 700;
      padding: 8px 10px;
      border-bottom: 1px solid var(--border);
      text-align: left;
      font-size: 11px;
    }
    .timeline-table td {
      padding: 8px 10px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
    }
    .timeline-table tr:hover td {
      background: #f8fafc;
    }
    .gantt-cell {
      position: relative;
      height: 36px;
      min-width: 480px;
      background: #fafafa;
    }
    .gantt-bar {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      height: 18px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      font-size: 9px;
      font-weight: 800;
      padding: 0 4px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.12);
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: transform 0.1s ease;
    }
    .gantt-bar:hover {
      transform: translateY(-50%) scaleY(1.2);
      filter: brightness(1.15);
      z-index: 20;
    }

    /* Tooltip */
    #tooltip {
      position: fixed;
      display: none;
      background: #0f172a;
      color: #ffffff;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 11px;
      pointer-events: none;
      z-index: 1000;
      box-shadow: 0 4px 14px rgba(0,0,0,0.25);
      max-width: 320px;
    }

    @media print {
      body { background: white; padding: 0; }
      .no-print { display: none !important; }
      .phase-card, .strat-card, .timeline-container, .top-filter-bar, .report-card { box-shadow: none; border-color: #cbd5e1; }
      .timeline-table th, .timeline-table td { font-size: 9.5px; padding: 4px 6px; }
    }
  </style>
</head>
<body>
  <div id="tooltip"></div>

  <!-- Barra Superior de Filtros (Fija al estilo de la app) -->
  <div class="top-filter-bar">
    <div class="top-filter-header">
      <div class="top-filter-title">
        <span>🔍 Filtros del Reporte</span>
        <span style="font-size: 11px; font-weight: 700; color: #0284c7; background: #e0f2fe; padding: 2px 8px; border-radius: 12px;">
          ${dataFiltered.length} iniciativas
        </span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 11px; color: #64748b;">Generado: <strong>${escapeHtml(fechaGeneracion)}</strong></span>
        <button class="no-print" onclick="window.print()" style="padding: 5px 12px; background: #0284c7; color: white; border: none; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer;">
          🖨️ Imprimir / Guardar PDF
        </button>
      </div>
    </div>
    <div class="filter-inputs-grid">
      <div class="filter-box">
        <div class="filter-box-label">VP Solicitante</div>
        <div class="filter-box-val" title="${escapeHtml(vpFiltrosTexto)}">${escapeHtml(vpFiltrosTexto)}</div>
      </div>
      <div class="filter-box">
        <div class="filter-box-label">Institución</div>
        <div class="filter-box-val">Todos</div>
      </div>
      <div class="filter-box">
        <div class="filter-box-label">IT BP</div>
        <div class="filter-box-val">Todos</div>
      </div>
      <div class="filter-box">
        <div class="filter-box-label">Estado</div>
        <div class="filter-box-val">Todos</div>
      </div>
      <div class="filter-box">
        <div class="filter-box-label">Líder de Dominio</div>
        <div class="filter-box-val">Todos</div>
      </div>
    </div>
  </div>

  <!-- Card Principal: Reporte por VP del Área Solicitante -->
  <div class="report-card">
    <div class="report-card-title">
      <span>👥 Reporte por VP del Área Solicitante</span>
    </div>

    <!-- Toggle Header: Pipeline Estadístico -->
    <div class="section-header">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span>📊 PIPELINE ESTADÍSTICO DE INICIATIVAS</span>
        <span style="font-size: 10.5px; font-weight: 700; color: #0284c7; background: #e0f2fe; padding: 2px 8px; border-radius: 12px;">
          ${dataFiltered.length} iniciativas
        </span>
      </div>
    </div>

    <!-- 4 Tarjetas de Fases -->
    <div class="phase-grid" id="phase-cards-container"></div>

    <!-- 3 Tarjetas Estratégicas -->
    <div class="strat-grid" id="strategic-cards-container"></div>

    <!-- Cronograma Timeline Gantt -->
    <div class="timeline-container" id="timeline-section">
      <div class="timeline-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span>Cronograma de Iniciativas (Timeline Gantt)</span>
          <span id="timeline-count-badge" style="font-size: 11px; font-weight: 700; color: #0284c7; background: #e0f2fe; padding: 2px 8px; border-radius: 12px;">
            ${dataFiltered.length} iniciativas
          </span>
        </div>
        <div class="no-print" style="display: flex; align-items: center; gap: 8px;">
          <input type="text" id="filter-search" placeholder="🔍 Buscar ID, título..." style="font-size: 11px; padding: 4px 8px; border: 1px solid var(--border); border-radius: 6px; width: 180px;">
          <button id="btn-clear-filters" style="display: none; background: #f1f5f9; border: 1px solid var(--border); color: #475569; font-size: 11px; font-weight: 700; padding: 4px 8px; border-radius: 6px; cursor: pointer;" onclick="clearAllFilters()">✕ Restablecer</button>
        </div>
      </div>

      <div class="filter-banner" id="active-filter-banner" style="display: none;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; padding: 2px 8px; border-radius: 4px; background: #0284c7; color: white;">Filtro Activo</span>
          <span style="font-size: 12px; font-weight: 700; color: #1e293b;" id="filter-banner-text"></span>
        </div>
        <button style="background: white; border: 1px solid #cbd5e1; color: #475569; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px; cursor: pointer;" onclick="clearAllFilters()">✕ Ver todas las fases</button>
      </div>

      <div class="timeline-body">
        <table class="timeline-table">
          <thead>
            <tr>
              <th style="width: 55px;">ID</th>
              <th style="width: 280px;">Iniciativa</th>
              <th style="width: 140px;">Fase / Etapa</th>
              <th style="width: 80px;">Inicio</th>
              <th style="width: 80px;">Fin</th>
              <th>Cronograma Temporal</th>
            </tr>
          </thead>
          <tbody id="timeline-tbody"></tbody>
        </table>
      </div>
    </div>
  </div>

  <div style="text-align: right; font-size: 11px; color: #94a3b8; margin-top: 14px;">
    Documento interactivo generado automáticamente por Dashboard de Gestión de la Demanda TI.
  </div>

  <!-- Runtime JS Interactivo -->
  <script>
    const RAW_DATA = ${serializedIniciativas};
    let activePhaseFilter = null;
    let searchQuery = '';

    function getPhase(etapa) {
      if (!etapa) return 1;
      const e = String(etapa).toLowerCase().trim();
      if (['por_estimar', 'por_aprobar_estimacion', 'por_reestimar'].includes(e)) return 1;
      if (['por_planificar', 'aprobar_planificacion', 'por_aprobar_planificacion', 'por_habilitar_presupuesto'].includes(e)) return 2;
      if (['planificadas', 'planificada', 'implementadas', 'implementada', 'por_iniciar', 'en_ejecucion', 'terminado', 'detenido'].includes(e)) return 3;
      if (['eliminadas', 'eliminada', 'registro_incompleto'].includes(e)) return 'observaciones';
      return 1;
    }

    function getEtapaLabel(etapa) {
      if (!etapa) return 'Sin etapa';
      const map = {
        'registro_incompleto': 'Registro incompleto',
        'por_estimar': 'Por estimar',
        'por_aprobar_estimacion': 'Por aprobar estimación',
        'por_reestimar': 'Por reestimar',
        'por_habilitar_presupuesto': 'Habilitar presupuesto',
        'por_planificar': 'Por planificar',
        'aprobar_planificacion': 'Por aprobar planificación',
        'por_aprobar_planificacion': 'Por aprobar planificación',
        'planificadas': 'Planificadas',
        'planificada': 'Planificadas',
        'por_iniciar': 'Por iniciar',
        'en_ejecucion': 'En ejecución',
        'terminado': 'Terminado',
        'detenido': 'Detenido',
        'implementadas': 'Implementadas',
        'implementada': 'Implementadas',
        'eliminadas': 'Eliminadas',
        'eliminada': 'Eliminadas'
      };
      return map[etapa] || etapa.replace(/_/g, ' ');
    }

    function parseDate(val) {
      if (!val) return null;
      try {
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
      } catch { return null; }
    }

    function fmtDate(d) {
      if (!d) return '—';
      const dt = typeof d === 'string' ? parseDate(d) : d;
      if (!dt) return '—';
      const dd = String(dt.getDate()).padStart(2, '0');
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const yyyy = dt.getFullYear();
      return \`\${dd}/\${mm}/\${yyyy}\`;
    }

    function getResponsable(i) {
      const e = (i.etapa_actual || '').toLowerCase();
      if (['por_aprobar_estimacion', 'por_habilitar_presupuesto', 'aprobar_planificacion', 'por_aprobar_planificacion'].includes(e)) {
        return 'Negocio';
      }
      if (['por_estimar', 'por_reestimar', 'por_planificar', 'planificadas', 'planificada', 'en_ejecucion', 'por_iniciar'].includes(e)) {
        return 'IT';
      }
      return 'None';
    }

    function getFrenteName(i) {
      let raw = '';
      if (i.frente && i.frente.trim()) raw = i.frente.trim();
      else if (i.raw_fields) {
        const rf = i.raw_fields['Ecosistema'] || i.raw_fields['ecosistema'] || i.raw_fields['Dominio'] || i.raw_fields['dominio'];
        if (rf && typeof rf === 'string' && rf.trim()) raw = rf.trim();
      }
      if (!raw && i.pilar_estrategico && i.pilar_estrategico.trim()) raw = i.pilar_estrategico.trim();
      if (!raw && i.lider_dominio && i.lider_dominio.trim()) raw = i.lider_dominio.trim();
      if (!raw && i.institucion && i.institucion.trim()) raw = i.institucion.trim();
      if (!raw) return 'General / Otros';
      return raw.charAt(0).toUpperCase() + raw.slice(1);
    }

    function getMilestoneDate(i) {
      const phase = getPhase(i.etapa_actual);
      if (phase === 3) return i.fecha_fin_planificada || i.fecha_fin_real || i.fecha_inicio_planificada || i.fecha_entrega_requerida || null;
      if (phase === 2) return i.fecha_fin_planificada || i.fecha_inicio_planificada || i.fecha_entrega_requerida || null;
      if (phase === 1) return i.fecha_fin_estimacion || i.fecha_inicio_estimacion || i.fecha_entrega_requerida || null;
      return i.fecha_eliminacion || null;
    }

    // Render Cards de Fase con estilos idénticos a la app
    function renderPhaseCards() {
      const total = RAW_DATA.length || 1;
      const f1 = RAW_DATA.filter(i => getPhase(i.etapa_actual) === 1);
      const f2 = RAW_DATA.filter(i => getPhase(i.etapa_actual) === 2);
      const f3 = RAW_DATA.filter(i => getPhase(i.etapa_actual) === 3);
      const fObs = RAW_DATA.filter(i => getPhase(i.etapa_actual) === 'observaciones');

      const calcAction = list => {
        const it = list.filter(i => getResponsable(i) === 'IT').length;
        const neg = list.filter(i => getResponsable(i) === 'Negocio').length;
        const tot = it + neg || 1;
        return { it, neg, itPct: Math.round((it / tot) * 100), negPct: Math.round((neg / tot) * 100) };
      };

      const a1 = calcAction(f1);
      const a2 = calcAction(f2);
      const a3 = calcAction(f3);

      const container = document.getElementById('phase-cards-container');
      container.innerHTML = \`
        <!-- FASE 1 -->
        <div class="phase-card phase-card-1 \${activePhaseFilter === 1 ? 'active' : ''}" onclick="togglePhase(1)">
          <div>
            <div class="phase-top">
              <span class="phase-pill" style="color: #b45309; background: #fef3c7;">FASE 1</span>
              <span style="font-size: 11px; font-weight: 700; color: #b45309;">\${Math.round((f1.length / total) * 100)}%</span>
            </div>
            <h4 class="phase-title">Estimación y Aprobación</h4>
            <p class="phase-desc">Por estimar, aprobar estimación y reestimar</p>
            <div class="phase-count">\${f1.length}</div>
            <div class="subetapa-list">
              <div class="subetapa-item">
                <span style="display: flex; align-items: center; gap: 5px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #f59e0b;"></span>Por estimar</span>
                <strong>\${f1.filter(i => i.etapa_actual === 'por_estimar').length}</strong>
              </div>
              <div class="subetapa-item">
                <span style="display: flex; align-items: center; gap: 5px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #f59e0b;"></span>Por aprobar estimación</span>
                <strong>\${f1.filter(i => i.etapa_actual === 'por_aprobar_estimacion').length}</strong>
              </div>
              <div class="subetapa-item">
                <span style="display: flex; align-items: center; gap: 5px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #f59e0b;"></span>Por reestimar</span>
                <strong>\${f1.filter(i => i.etapa_actual === 'por_reestimar').length}</strong>
              </div>
            </div>
          </div>
          <div class="phase-footer" style="border-top: 1px solid #fed7aa;">
            <div class="action-row">
              <span>Siguiente acción</span>
              <span>IT: \${a1.it} · Neg: \${a1.neg}</span>
            </div>
            <div class="progress-bar-container">
              <div style="width: \${a1.itPct}%; background: #2563eb;"></div>
              <div style="width: \${a1.negPct}%; background: #f59e0b;"></div>
            </div>
            <div style="text-align: center;">
              <span class="filter-btn-pill" style="background: \${activePhaseFilter === 1 ? '#b45309' : '#fffbeb'}; color: \${activePhaseFilter === 1 ? '#ffffff' : '#b45309'};">
                \${activePhaseFilter === 1 ? '✓ Filtrando en cronograma' : '🔍 Clic para filtrar cronograma'}
              </span>
            </div>
          </div>
        </div>

        <!-- FASE 2 -->
        <div class="phase-card phase-card-2 \${activePhaseFilter === 2 ? 'active' : ''}" onclick="togglePhase(2)">
          <div>
            <div class="phase-top">
              <span class="phase-pill" style="color: #1d4ed8; background: #dbeafe;">FASE 2</span>
              <span style="font-size: 11px; font-weight: 700; color: #1d4ed8;">\${Math.round((f2.length / total) * 100)}%</span>
            </div>
            <h4 class="phase-title">Planificación y Presupuesto</h4>
            <p class="phase-desc">Por planificar, aprobar planif. y habilitar presupuesto</p>
            <div class="phase-count">\${f2.length}</div>
            <div class="subetapa-list">
              <div class="subetapa-item">
                <span style="display: flex; align-items: center; gap: 5px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #2563eb;"></span>Por planificar</span>
                <strong>\${f2.filter(i => i.etapa_actual === 'por_planificar').length}</strong>
              </div>
              <div class="subetapa-item">
                <span style="display: flex; align-items: center; gap: 5px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #2563eb;"></span>Por aprobar planificación</span>
                <strong>\${f2.filter(i => ['aprobar_planificacion', 'por_aprobar_planificacion'].includes(i.etapa_actual)).length}</strong>
              </div>
              <div class="subetapa-item">
                <span style="display: flex; align-items: center; gap: 5px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #2563eb;"></span>Habilitar presupuesto</span>
                <strong>\${f2.filter(i => i.etapa_actual === 'por_habilitar_presupuesto').length}</strong>
              </div>
            </div>
          </div>
          <div class="phase-footer" style="border-top: 1px solid #bfdbfe;">
            <div class="action-row">
              <span>Siguiente acción</span>
              <span>IT: \${a2.it} · Neg: \${a2.neg}</span>
            </div>
            <div class="progress-bar-container">
              <div style="width: \${a2.itPct}%; background: #2563eb;"></div>
              <div style="width: \${a2.negPct}%; background: #f59e0b;"></div>
            </div>
            <div style="text-align: center;">
              <span class="filter-btn-pill" style="background: \${activePhaseFilter === 2 ? '#1d4ed8' : '#eff6ff'}; color: \${activePhaseFilter === 2 ? '#ffffff' : '#1d4ed8'};">
                \${activePhaseFilter === 2 ? '✓ Filtrando en cronograma' : '🔍 Clic para filtrar cronograma'}
              </span>
            </div>
          </div>
        </div>

        <!-- FASE 3 -->
        <div class="phase-card phase-card-3 \${activePhaseFilter === 3 ? 'active' : ''}" onclick="togglePhase(3)">
          <div>
            <div class="phase-top">
              <span class="phase-pill" style="color: #047857; background: #d1fae5;">FASE 3</span>
              <span style="font-size: 11px; font-weight: 700; color: #059669;">\${Math.round((f3.length / total) * 100)}%</span>
            </div>
            <h4 class="phase-title">Planificadas e Implementadas</h4>
            <p class="phase-desc">Iniciativas en ejecución, planificadas e implementadas</p>
            <div class="phase-count">\${f3.length}</div>
            <div class="subetapa-list">
              <div class="subetapa-item">
                <span style="display: flex; align-items: center; gap: 5px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #059669;"></span>Planificadas</span>
                <strong>\${f3.filter(i => ['planificadas', 'planificada', 'en_ejecucion', 'por_iniciar'].includes(i.etapa_actual)).length}</strong>
              </div>
              <div class="subetapa-item">
                <span style="display: flex; align-items: center; gap: 5px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #059669;"></span>Implementadas</span>
                <strong>\${f3.filter(i => ['implementadas', 'implementada', 'terminado'].includes(i.etapa_actual)).length}</strong>
              </div>
            </div>
          </div>
          <div class="phase-footer" style="border-top: 1px solid #d1fae5;">
            <div class="action-row">
              <span>Siguiente acción</span>
              <span>IT: \${a3.it} · Neg: \${a3.neg}</span>
            </div>
            <div class="progress-bar-container">
              <div style="width: \${a3.itPct}%; background: #10b981;"></div>
              <div style="width: \${a3.negPct}%; background: #f59e0b;"></div>
            </div>
            <div style="text-align: center;">
              <span class="filter-btn-pill" style="background: \${activePhaseFilter === 3 ? '#059669' : '#ecfdf5'}; color: \${activePhaseFilter === 3 ? '#ffffff' : '#047857'};">
                \${activePhaseFilter === 3 ? '✓ Filtrando en cronograma' : '🔍 Clic para filtrar cronograma'}
              </span>
            </div>
          </div>
        </div>

        <!-- CON OBSERVACIONES -->
        <div class="phase-card phase-card-obs \${activePhaseFilter === 'observaciones' ? 'active' : ''}" onclick="togglePhase('observaciones')">
          <div>
            <div class="phase-top">
              <span class="phase-pill" style="color: #9f1239; background: #ffe4e6;">CON OBSERVACIONES</span>
              <span style="font-size: 11px; font-weight: 700; color: #e11d48;">\${Math.round((fObs.length / total) * 100)}%</span>
            </div>
            <h4 class="phase-title">Con Observaciones</h4>
            <p class="phase-desc">Registros incompletos y registros eliminados</p>
            <div class="phase-count">\${fObs.length}</div>
            <div class="subetapa-list">
              <div class="subetapa-item">
                <span style="display: flex; align-items: center; gap: 5px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #e11d48;"></span>Eliminadas</span>
                <strong>\${fObs.filter(i => ['eliminadas', 'eliminada'].includes(i.etapa_actual)).length}</strong>
              </div>
              <div class="subetapa-item">
                <span style="display: flex; align-items: center; gap: 5px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #e11d48;"></span>Registro incompleto</span>
                <strong>\${fObs.filter(i => i.etapa_actual === 'registro_incompleto').length}</strong>
              </div>
            </div>
          </div>
          <div class="phase-footer" style="border-top: 1px solid #ffe4e6;">
            <div class="action-row">
              <span>Siguiente acción</span>
              <span>Revisión</span>
            </div>
            <div class="progress-bar-container">
              <div style="width: 100%; background: #e11d48;"></div>
            </div>
            <div style="text-align: center;">
              <span class="filter-btn-pill" style="background: \${activePhaseFilter === 'observaciones' ? '#e11d48' : '#fff1f2'}; color: \${activePhaseFilter === 'observaciones' ? '#ffffff' : '#be123c'};">
                \${activePhaseFilter === 'observaciones' ? '✓ Filtrando en cronograma' : '🔍 Clic para filtrar cronograma'}
              </span>
            </div>
          </div>
        </div>
      \`;
    }

    // Render 3 Cards Estratégicos con layout idéntico a la app
    function renderStrategicCards() {
      const active = RAW_DATA.filter(i => !['eliminadas', 'eliminada', 'registro_incompleto'].includes(i.etapa_actual));
      const itItems = active.filter(i => getResponsable(i) === 'IT');
      const negItems = active.filter(i => getResponsable(i) === 'Negocio');
      const totActive = itItems.length + negItems.length || 1;
      const itPct = Math.round((itItems.length / totActive) * 100);
      const negPct = Math.round((negItems.length / totActive) * 100);

      const itEst = itItems.filter(i => ['por_estimar', 'por_reestimar'].includes(i.etapa_actual)).length;
      const itPlan = itItems.filter(i => i.etapa_actual === 'por_planificar').length;
      const itEjec = itItems.filter(i => ['planificadas', 'planificada', 'en_ejecucion', 'por_iniciar'].includes(i.etapa_actual)).length;

      const negEst = negItems.filter(i => i.etapa_actual === 'por_aprobar_estimacion').length;
      const negPpto = negItems.filter(i => i.etapa_actual === 'por_habilitar_presupuesto').length;
      const negPlan = negItems.filter(i => ['aprobar_planificacion', 'por_aprobar_planificacion'].includes(i.etapa_actual)).length;

      // Top Ecosistemas / Frente con desglose de fases
      const ecoMap = {};
      RAW_DATA.forEach(i => {
        const name = getFrenteName(i);
        if (!ecoMap[name]) ecoMap[name] = { name, total: 0, f1: 0, f2: 0, f3: 0, fObs: 0 };
        ecoMap[name].total++;
        const p = getPhase(i.etapa_actual);
        if (p === 1) ecoMap[name].f1++;
        else if (p === 2) ecoMap[name].f2++;
        else if (p === 3) ecoMap[name].f3++;
        else ecoMap[name].fObs++;
      });
      const topEcos = Object.values(ecoMap).sort((a,b) => b.total - a.total).slice(0, 5);

      // Fechas
      const now = new Date();
      let vencidas = 0;
      let vencePronto = 0;
      let proximas = 0;
      let sinFecha = 0;
      const upcoming = [];

      RAW_DATA.filter(i => !['eliminadas', 'eliminada'].includes(i.etapa_actual)).forEach(i => {
        const rawDate = getMilestoneDate(i);
        if (!rawDate) { sinFecha++; return; }
        const dt = parseDate(rawDate);
        if (!dt) { sinFecha++; return; }
        const diff = Math.ceil((dt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (diff < 0) {
          vencidas++;
          upcoming.push({ i, dt, dateStr: fmtDate(dt), status: 'overdue' });
        } else if (diff <= 15) {
          vencePronto++;
          upcoming.push({ i, dt, dateStr: fmtDate(dt), status: 'soon' });
        } else {
          proximas++;
          upcoming.push({ i, dt, dateStr: fmtDate(dt), status: 'future' });
        }
      });
      upcoming.sort((a,b) => a.dt.getTime() - b.dt.getTime());
      const showUpcoming = upcoming.slice(0, 2);

      const container = document.getElementById('strategic-cards-container');
      container.innerHTML = \`
        <!-- CARD 1 -->
        <div class="strat-card">
          <div>
            <h4 class="strat-card-title">Responsabilidad: ¿Quién tiene la siguiente acción?</h4>
            <p class="strat-card-sub">Balance operativo entre Sistemas (IT) y Áreas Solicitantes (Negocio)</p>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
              <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px 12px;">
                <div style="font-size: 10px; fontWeight: 800; color: #1d4ed8; text-transform: uppercase;">IT / SISTEMAS</div>
                <div style="font-size: 24px; font-weight: 900; color: #1e40af; margin: 3px 0 2px 0;">\${itItems.length}</div>
                <div style="font-size: 10px; color: #3b82f6; font-weight: 700; margin-bottom: 6px;">\${itPct}% del trabajo activo</div>
                <div style="display: flex; flex-direction: column; gap: 2px; font-size: 10px; color: #1e3a8a; border-top: 1px solid #dbeafe; padding-top: 6px;">
                  <div>• Estimación técnica: <strong>\${itEst}</strong></div>
                  <div>• Planificación técnica: <strong>\${itPlan}</strong></div>
                  <div>• En ejecución técnica: <strong>\${itEjec}</strong></div>
                </div>
              </div>
              <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 10px 12px;">
                <div style="font-size: 10px; font-weight: 800; color: #b45309; text-transform: uppercase;">NEGOCIO / SOLICITANTE</div>
                <div style="font-size: 24px; font-weight: 900; color: #d97706; margin: 3px 0 2px 0;">\${negItems.length}</div>
                <div style="font-size: 10px; color: #d97706; font-weight: 700; margin-bottom: 6px;">\${negPct}% del trabajo activo</div>
                <div style="display: flex; flex-direction: column; gap: 2px; font-size: 10px; color: #78350f; border-top: 1px solid #fef3c7; padding-top: 6px;">
                  <div>• Por aprobar estimación: <strong>\${negEst}</strong></div>
                  <div>• Por habilitar presupuesto: <strong>\${negPpto}</strong></div>
                  <div>• Por aprobar planificación: <strong>\${negPlan}</strong></div>
                </div>
              </div>
            </div>
            <div style="height: 8px; width: 100%; background: #f1f5f9; border-radius: 4px; overflow: hidden; display: flex; margin-bottom: 8px;">
              <div style="width: \${itPct}%; background: #2563eb;"></div>
              <div style="width: \${negPct}%; background: #f59e0b;"></div>
            </div>
          </div>
          <div style="font-size: 10.5px; color: #64748b; border-top: 1px solid #f1f5f9; padding-top: 8px; display: flex; justify-content: space-between;">
            <span>Total en cartera activa: <strong>\${active.length} ini.</strong></span>
            \${negItems.length > 0 ? \`<span style="color: #b45309; font-weight: 700;">⚠️ Negocio tiene \${negItems.length} aprobaciones pendientes</span>\` : '<span style="color: #059669; font-weight: 700;">✓ Negocio al día</span>'}
          </div>
        </div>

        <!-- CARD 2 -->
        <div class="strat-card">
          <div>
            <h4 class="strat-card-title">Distribución Estratégica por Frente / Ecosistema</h4>
            <p class="strat-card-sub">Avance del pipeline por dominio tecnológico (textos completos)</p>
            <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">
              \${topEcos.map(eco => {
                const tot = eco.total || 1;
                const f1Pct = (eco.f1 / tot) * 100;
                const f2Pct = (eco.f2 / tot) * 100;
                const f3Pct = (eco.f3 / tot) * 100;
                const fObsPct = (eco.fObs / tot) * 100;
                const pctGlobal = Math.round((eco.total / RAW_DATA.length) * 100);
                return \`
                  <div style="display: flex; flex-direction: column; gap: 3px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                      <span style="font-size: 11.5px; font-weight: 700; color: #1e293b; word-break: break-word;">\${eco.name}</span>
                      <span style="font-size: 10.5px; font-weight: 800; color: #0f172a; background: #f1f5f9; padding: 1px 7px; border-radius: 10px; flex-shrink: 0;">\${eco.total} ini. (\${pctGlobal}%)</span>
                    </div>
                    <div style="height: 8px; width: 100%; background: #f1f5f9; border-radius: 4px; overflow: hidden; display: flex;">
                      \${f1Pct > 0 ? \`<div style="width: \${f1Pct}%; background: #f59e0b;"></div>\` : ''}
                      \${f2Pct > 0 ? \`<div style="width: \${f2Pct}%; background: #2563eb;"></div>\` : ''}
                      \${f3Pct > 0 ? \`<div style="width: \${f3Pct}%; background: #059669;"></div>\` : ''}
                      \${fObsPct > 0 ? \`<div style="width: \${fObsPct}%; background: #e11d48;"></div>\` : ''}
                    </div>
                  </div>
                \`;
              }).join('')}
            </div>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 10px; color: #64748b; border-top: 1px solid #f1f5f9; padding-top: 8px; flex-wrap: wrap; gap: 4px;">
            <span style="display: flex; align-items: center; gap: 3px;"><span style="width: 7px; height: 7px; border-radius: 50%; background: #f59e0b;"></span> F1: Estimación</span>
            <span style="display: flex; align-items: center; gap: 3px;"><span style="width: 7px; height: 7px; border-radius: 50%; background: #2563eb;"></span> F2: Planificación</span>
            <span style="display: flex; align-items: center; gap: 3px;"><span style="width: 7px; height: 7px; border-radius: 50%; background: #059669;"></span> F3: Impl.</span>
            <span style="display: flex; align-items: center; gap: 3px;"><span style="width: 7px; height: 7px; border-radius: 50%; background: #e11d48;"></span> Observadas</span>
          </div>
        </div>

        <!-- CARD 3 -->
        <div class="strat-card">
          <div>
            <h4 class="strat-card-title">Salud de Fechas y Próximos Hitos Críticos</h4>
            <p class="strat-card-sub">Hitos comprometidos vs fecha de hoy (títulos completos legibles)</p>
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 10px;">
              <div style="background: #fff1f2; border: 1px solid #fecdd3; border-radius: 6px; padding: 6px 4px; text-align: center;">
                <div style="font-size: 16px; font-weight: 900; color: #be123c;">\${vencidas}</div>
                <div style="font-size: 9px; font-weight: 700; color: #9f1239; margin-top: 3px;">Superada</div>
              </div>
              <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 6px 4px; text-align: center;">
                <div style="font-size: 16px; font-weight: 900; color: #b45309;">\${vencePronto}</div>
                <div style="font-size: 9px; font-weight: 700; color: #78350f; margin-top: 3px;">≤ 15 días</div>
              </div>
              <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 6px 4px; text-align: center;">
                <div style="font-size: 16px; font-weight: 900; color: #1d4ed8;">\${proximas}</div>
                <div style="font-size: 9px; font-weight: 700; color: #1e3a8a; margin-top: 3px;">En fecha</div>
              </div>
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 4px; text-align: center;">
                <div style="font-size: 16px; font-weight: 900; color: #64748b;">\${sinFecha}</div>
                <div style="font-size: 9px; font-weight: 700; color: #475569; margin-top: 3px;">Sin fecha</div>
              </div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              \${showUpcoming.map(({ i, dateStr, status }) => {
                const bg = status === 'overdue' ? '#fee2e2' : status === 'soon' ? '#fef3c7' : '#dbeafe';
                const col = status === 'overdue' ? '#b91c1c' : status === 'soon' ? '#b45309' : '#1d4ed8';
                const lbl = status === 'overdue' ? 'Superada' : status === 'soon' ? 'Vence pronto' : 'En fecha';
                return \`
                  <div style="padding: 7px 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; border-left: 3px solid \${col};">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 2px;">
                      <span style="font-size: 9.5px; font-weight: 800; color: \${col};">#\${i.id} · \${lbl} (\${dateStr})</span>
                      <span style="font-size: 9px; color: #64748b;">\${getEtapaLabel(i.etapa_actual)}</span>
                    </div>
                    <div style="font-size: 11px; font-weight: 600; color: #0f172a; line-height: 1.35; word-break: break-word;">
                      \${i.titulo || 'Sin título'}
                    </div>
                  </div>
                \`;
              }).join('')}
            </div>
          </div>
          <div style="font-size: 10px; color: #94a3b8; font-style: italic; border-top: 1px solid #f1f5f9; padding-top: 8px;">
            Hitos monitoreados según fase activa
          </div>
        </div>
      \`;
    }

    // Toggle interactivo de fase
    function togglePhase(phase) {
      if (activePhaseFilter === phase) {
        activePhaseFilter = null;
      } else {
        activePhaseFilter = phase;
      }
      renderPhaseCards();
      renderTimeline();
      const el = document.getElementById('timeline-section');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }

    function clearAllFilters() {
      activePhaseFilter = null;
      searchQuery = '';
      const input = document.getElementById('filter-search');
      if (input) input.value = '';
      renderPhaseCards();
      renderTimeline();
    }

    // Render Timeline Gantt
    function renderTimeline() {
      let filtered = [...RAW_DATA];

      if (activePhaseFilter !== null) {
        filtered = filtered.filter(i => getPhase(i.etapa_actual) === activePhaseFilter);
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        filtered = filtered.filter(i =>
          String(i.id).includes(q) ||
          (i.titulo || '').toLowerCase().includes(q) ||
          (i.lider_dominio || '').toLowerCase().includes(q)
        );
      }

      const banner = document.getElementById('active-filter-banner');
      const clearBtn = document.getElementById('btn-clear-filters');
      const bannerText = document.getElementById('filter-banner-text');
      const countBadge = document.getElementById('timeline-count-badge');
      countBadge.innerText = \`\${filtered.length} iniciativa\${filtered.length === 1 ? '' : 's'}\`;

      if (activePhaseFilter !== null || searchQuery.trim()) {
        banner.style.display = 'flex';
        clearBtn.style.display = 'inline-block';
        let txt = '';
        if (activePhaseFilter === 1) txt = 'Fase 1 (Estimación y Aprobación)';
        else if (activePhaseFilter === 2) txt = 'Fase 2 (Planificación y Presupuesto)';
        else if (activePhaseFilter === 3) txt = 'Fase 3 (Planificadas e Implementadas)';
        else if (activePhaseFilter === 'observaciones') txt = 'Con Observaciones (Registro Incompleto y Eliminadas)';
        if (searchQuery.trim()) txt += (txt ? ' • ' : '') + \`Búsqueda: "\${searchQuery}"\`;
        bannerText.innerText = \`Mostrando \${filtered.length} iniciativas: \${txt}\`;
      } else {
        banner.style.display = 'none';
        clearBtn.style.display = 'none';
      }

      let minTime = Infinity;
      let maxTime = -Infinity;

      filtered.forEach(i => {
        const isElim = ['eliminadas', 'eliminada'].includes(i.etapa_actual);
        if (isElim) {
          const d = parseDate(i.fecha_eliminacion);
          if (d) {
            const t = d.getTime();
            if (t < minTime) minTime = t;
            if (t > maxTime) maxTime = t;
          }
        } else {
          [i.fecha_inicio_estimacion, i.fecha_fin_estimacion, i.fecha_inicio_planificada, i.fecha_fin_planificada, i.fecha_inicio_real, i.fecha_fin_real, i.fecha_pase_produccion, i.fecha_conformidad].forEach(ds => {
            const d = parseDate(ds);
            if (d) {
              const t = d.getTime();
              if (t < minTime) minTime = t;
              if (t > maxTime) maxTime = t;
            }
          });
        }
      });

      if (minTime === Infinity || maxTime === -Infinity || minTime === maxTime) {
        const now = new Date();
        minTime = new Date(now.getFullYear(), now.getMonth() - 2, 1).getTime();
        maxTime = new Date(now.getFullYear(), now.getMonth() + 4, 1).getTime();
      }

      const totalDuration = maxTime - minTime || 1;
      const tbody = document.getElementById('timeline-tbody');

      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 24px; color: #94a3b8;">No hay iniciativas que coincidan con los filtros seleccionados.</td></tr>';
        return;
      }

      tbody.innerHTML = filtered.map(i => {
        const isElim = ['eliminadas', 'eliminada'].includes(i.etapa_actual);
        const phase = getPhase(i.etapa_actual);
        const phaseClass = phase === 1 ? 'badge-fase1' : phase === 2 ? 'badge-fase2' : phase === 3 ? 'badge-fase3' : 'badge-faseobs';

        const segments = [];
        let startDisplay = '—';
        let endDisplay = '—';

        if (isElim) {
          const dElim = parseDate(i.fecha_eliminacion);
          if (dElim) {
            startDisplay = fmtDate(dElim);
            endDisplay = fmtDate(dElim);
            segments.push({
              start: dElim,
              end: dElim,
              label: '✕ ' + i.id,
              bg: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
              border: '#991b1b',
              tooltip: \`<b>[Eliminada]</b> \${i.id}<br>Fecha: \${fmtDate(dElim)}<br>\${i.solicitado_por ? 'Sol: ' + i.solicitado_por + '<br>' : ''}\${i.motivo_eliminacion ? 'Motivo: ' + i.motivo_eliminacion : ''}\`
            });
          }
        } else {
          const isPlan = ['planificadas', 'planificada', 'en_ejecucion', 'terminado'].includes(i.etapa_actual) || Boolean(i.fecha_inicio_planificada || i.fecha_fin_planificada || i.fecha_inicio_real || i.fecha_fin_real);
          if (!isPlan) {
            const s = parseDate(i.fecha_inicio_estimacion);
            const e = parseDate(i.fecha_fin_estimacion);
            if (s || e) {
              const st = (s && e) ? (s <= e ? s : e) : (s || e);
              const en = (s && e) ? (s <= e ? e : s) : (e || s);
              startDisplay = fmtDate(st);
              endDisplay = fmtDate(en);
              segments.push({
                start: st,
                end: en,
                label: String(i.id),
                bg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                border: '#b45309',
                tooltip: \`<b>[Estimación]</b> \${i.id}<br>\${fmtDate(st)} - \${fmtDate(en)}<br>\${i.estatus_estimacion || ''}\`
              });
            }
          }

          const sp = parseDate(i.fecha_inicio_planificada || i.fecha_inicio_real);
          const ep = parseDate(i.fecha_fin_planificada || i.fecha_fin_real);
          if (sp || ep) {
            const st = (sp && ep) ? (sp <= ep ? sp : ep) : (sp || ep);
            const en = (sp && ep) ? (sp <= ep ? ep : sp) : (ep || sp);
            startDisplay = fmtDate(st);
            endDisplay = fmtDate(en);
            segments.push({
              start: st,
              end: en,
              label: String(i.id),
              bg: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              border: '#047857',
              tooltip: \`<b>[Planificada]</b> \${i.id}<br>\${fmtDate(st)} - \${fmtDate(en)}<br>\${i.planificacion_aprobada ? 'Aprobada: ' + i.planificacion_aprobada : ''}\`
            });
          }
        }

        return \`
          <tr>
            <td style="font-weight: 800; color: #475569;">#\${i.id}</td>
            <td>
              <div style="font-weight: 700; color: #0f172a; max-width: 280px; word-break: break-word;">\${i.titulo || 'Sin Título'}</div>
              \${isElim ? \`
                <div style="margin-top: 2px;">
                  <span style="font-size: 9.5px; font-weight: 700; color: #991b1b; background: #fee2e2; border: 1px solid #fca5a5; padding: 1px 5px; border-radius: 4px;">
                    ✕ Eliminada: \${fmtDate(i.fecha_eliminacion)}
                  </span>
                </div>
              \` : ''}
            </td>
            <td>
              <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10.5px; font-weight: 700; background: #f1f5f9; color: #334155;">
                \${getEtapaLabel(i.etapa_actual)}
              </span>
            </td>
            <td style="font-family: monospace; color: #64748b;">\${startDisplay}</td>
            <td style="font-family: monospace; color: #64748b;">\${endDisplay}</td>
            <td class="gantt-cell">
              \${segments.length === 0 ? '<span style="font-size: 10px; color: #94a3b8; font-style: italic;">Sin fechas</span>' : ''}
              \${segments.map(seg => {
                const left = Math.max(0, ((seg.start.getTime() - minTime) / totalDuration) * 100);
                const right = Math.min(100, ((seg.end.getTime() - minTime) / totalDuration) * 100);
                const width = Math.max(2.0, right - left);
                return \`
                  <div class="gantt-bar"
                       style="left: \${left}%; width: \${width}%; background: \${seg.bg}; border: 1px solid \${seg.border};"
                       onmouseenter="showTooltip(event, '\${escapeJs(seg.tooltip)}')"
                       onmouseleave="hideTooltip()">
                    \${seg.label}
                  </div>
                \`;
              }).join('')}
            </td>
          </tr>
        \`;
      }).join('');
    }

    function escapeJs(str) {
      if (!str) return '';
      return str.replace(/'/g, "\\\\'").replace(/"/g, '&quot;');
    }

    const tip = document.getElementById('tooltip');
    function showTooltip(e, html) {
      tip.innerHTML = html;
      tip.style.display = 'block';
      tip.style.left = (e.clientX + 14) + 'px';
      tip.style.top = (e.clientY + 14) + 'px';
    }
    function hideTooltip() {
      tip.style.display = 'none';
    }

    document.getElementById('filter-search').addEventListener('input', e => {
      searchQuery = e.target.value;
      renderTimeline();
    });

    renderPhaseCards();
    renderStrategicCards();
    renderTimeline();
  </script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Reporte_Demanda_TI_${fileDate}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Componente: DashboardEstadisticoVP (Reemplazo visual de barras de colores)
// ---------------------------------------------------------------------------
interface DashboardEstadisticoVPProps {
  iniciativas: Iniciativa[];
  onOpenDetailModal?: (iniciativa: Iniciativa) => void;
  selectedPhase?: VpPipelinePhase | null;
  onSelectPhase?: (phase: VpPipelinePhase) => void;
}

function DashboardEstadisticoVP({
  iniciativas,
  onOpenDetailModal,
  selectedPhase,
  onSelectPhase,
}: DashboardEstadisticoVPProps) {
  const total = iniciativas.length || 1;

  // 1. Clasificación por las 4 Fases Ejecutivas solicitadas
  const { fase1, fase2, fase3, faseObs } = useMemo(() => {
    const f1: Iniciativa[] = [];
    const f2: Iniciativa[] = [];
    const f3: Iniciativa[] = [];
    const fObs: Iniciativa[] = [];

    iniciativas.forEach(i => {
      const p = getVpPipelinePhase(i.etapa_actual);
      if (p === 1) f1.push(i);
      else if (p === 2) f2.push(i);
      else if (p === 3) f3.push(i);
      else if (p === 'observaciones') fObs.push(i);
    });

    return { fase1: f1, fase2: f2, fase3: f3, faseObs: fObs };
  }, [iniciativas]);

  // Card 1: Responsabilidad IT vs Negocio (Iniciativas en curso)
  const actionStats = useMemo(() => {
    const active = iniciativas.filter(i => getVpPipelinePhase(i.etapa_actual) !== 'observaciones');
    const itIniciativas = active.filter(i => getInitiativeActionOwner(i) === 'IT');
    const negocioIniciativas = active.filter(i => getInitiativeActionOwner(i) === 'Negocio');
    const actTotal = active.length || 1;
    const itPct = Math.round((itIniciativas.length / actTotal) * 100);
    const negPct = 100 - itPct;

    // Breakdown IT
    const itEstimando = itIniciativas.filter(i => i.etapa_actual === 'por_estimar' || i.etapa_actual === 'por_reestimar').length;
    const itPlanificando = itIniciativas.filter(i => i.etapa_actual === 'por_planificar').length;
    const itEjecutando = itIniciativas.filter(i => ['planificadas', 'planificada', 'en_ejecucion', 'por_iniciar'].includes(i.etapa_actual)).length;

    // Breakdown Negocio
    const negAprobarEstim = negocioIniciativas.filter(i => i.etapa_actual === 'por_aprobar_estimacion').length;
    const negPresupuesto = negocioIniciativas.filter(i => i.etapa_actual === 'por_habilitar_presupuesto').length;
    const negAprobarPlan = negocioIniciativas.filter(i => (i.etapa_actual as string) === 'aprobar_planificacion' || (i.etapa_actual as string) === 'por_aprobar_planificacion').length;

    return {
      activeCount: active.length,
      itCount: itIniciativas.length,
      negocioCount: negocioIniciativas.length,
      itPct,
      negPct,
      itEstimando,
      itPlanificando,
      itEjecutando,
      negAprobarEstim,
      negPresupuesto,
      negAprobarPlan,
    };
  }, [iniciativas]);

  // Card 2: Distribución por Frente / Ecosistema (Sin textos cortados, normalizado)
  const ecosistemas = useMemo(() => {
    const map: Record<string, { total: number; f1: number; f2: number; f3: number; fObs: number }> = {};
    iniciativas.forEach(i => {
      const eco = getEcosistema(i);
      if (!map[eco]) map[eco] = { total: 0, f1: 0, f2: 0, f3: 0, fObs: 0 };
      map[eco].total++;
      const p = getVpPipelinePhase(i.etapa_actual);
      if (p === 1) map[eco].f1++;
      else if (p === 2) map[eco].f2++;
      else if (p === 3) map[eco].f3++;
      else if (p === 'observaciones') map[eco].fObs++;
    });

    return Object.entries(map)
      .map(([name, s]) => ({ name, ...s }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [iniciativas]);

  // Card 3: Salud de Fechas y Próximos Hitos Críticos (Sin textos cortados)
  const dateMilestones = useMemo(() => {
    const now = startOfDay(new Date());
    let vencidas = 0;
    let vencePronto = 0;
    let proximas = 0;
    let sinFecha = 0;

    const listWithDates: { iniciativa: Iniciativa; date: Date; dateStr: string; status: 'overdue' | 'soon' | 'future' }[] = [];

    iniciativas
      .filter(i => (i.etapa_actual as string) !== 'eliminadas' && (i.etapa_actual as string) !== 'eliminada')
      .forEach(i => {
        const rawDate = getInitiativeMilestoneDate(i);
        if (!rawDate) {
          sinFecha++;
          return;
        }
        try {
          const parsed = startOfDay(parseISO(rawDate));
          if (isNaN(parsed.getTime())) {
            sinFecha++;
            return;
          }
          const diffDays = differenceInCalendarDays(parsed, now);
          if (diffDays < 0) {
            vencidas++;
            listWithDates.push({ iniciativa: i, date: parsed, dateStr: rawDate, status: 'overdue' });
          } else if (diffDays <= 15) {
            vencePronto++;
            listWithDates.push({ iniciativa: i, date: parsed, dateStr: rawDate, status: 'soon' });
          } else {
            proximas++;
            listWithDates.push({ iniciativa: i, date: parsed, dateStr: rawDate, status: 'future' });
          }
        } catch {
          sinFecha++;
        }
      });

    listWithDates.sort((a, b) => a.date.getTime() - b.date.getTime());

    return {
      vencidas,
      vencePronto,
      proximas,
      sinFecha,
      upcoming: listWithDates.slice(0, 5),
    };
  }, [iniciativas]);

  // Sub-etapas helper con nombres legibles en español (sin variables snake_case)
  const getSubEtapas = (list: Iniciativa[]) => {
    const counts: Record<string, number> = {};
    list.forEach(i => {
      const key = (i.etapa_actual || '').toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts)
      .filter(([, c]) => c > 0)
      .map(([etapa, count]) => ({
        etapa,
        label: getEtapaHumanLabel(etapa),
        count,
      }))
      .sort((a, b) => b.count - a.count);
  };

  const getActionBreakdown = (list: Iniciativa[]) => {
    const it = list.filter(i => getInitiativeActionOwner(i) === 'IT').length;
    const neg = list.filter(i => getInitiativeActionOwner(i) === 'Negocio').length;
    const actTot = it + neg || 1;
    const itPct = Math.round((it / actTot) * 100);
    const negPct = 100 - itPct;
    return { it, neg, itPct, negPct };
  };

  const f1Action = getActionBreakdown(fase1);
  const f2Action = getActionBreakdown(fase2);
  const f3Action = getActionBreakdown(fase3);
  const fObsAction = getActionBreakdown(faseObs);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ------------------------------------------------------------- */}
      {/* SECCIÓN SUPERIOR: 4 TARJETAS DINÁMICAS DEL PIPELINE */}
      {/* ------------------------------------------------------------- */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 14,
        }}
      >
        {/* FASE 1: Estimación y Aprobación */}
        {(() => {
          const isSelected = selectedPhase === 1;
          return (
            <div
              onClick={() => onSelectPhase && onSelectPhase(1)}
              style={{
                background: '#ffffff',
                border: isSelected ? '2px solid #f59e0b' : '1px solid #fde68a',
                borderTop: '4px solid #f59e0b',
                borderRadius: 12,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: isSelected
                  ? '0 0 0 3px rgba(245, 158, 11, 0.35), 0 8px 18px rgba(0,0,0,0.06)'
                  : '0 1px 3px rgba(0,0,0,0.04)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                position: 'relative',
              }}
              title="Haz clic para filtrar el cronograma inferior por Fase 1"
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: '#b45309',
                      background: '#fef3c7',
                      padding: '2px 8px',
                      borderRadius: 4,
                    }}
                  >
                    FASE 1
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#d97706' }}>
                    {Math.round((fase1.length / total) * 100)}%
                  </span>
                </div>

                <h4 style={{ fontSize: 13.5, fontWeight: 800, color: '#1e293b', margin: '0 0 2px 0' }}>
                  Estimación y Aprobación
                </h4>
                <p style={{ fontSize: 10.5, color: '#64748b', margin: '0 0 8px 0' }}>
                  Por estimar, aprobar estimación y reestimar
                </p>

                <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', marginBottom: 10, lineHeight: 1 }}>
                  {fase1.length}
                </div>

                {/* Sub-etapas con nombres de campos legibles */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minHeight: 48, marginBottom: 12 }}>
                  {getSubEtapas(fase1).length > 0 ? (
                    getSubEtapas(fase1).map(s => (
                      <div key={s.etapa} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#475569' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
                          {s.label}
                        </span>
                        <strong style={{ color: '#0f172a' }}>{s.count}</strong>
                      </div>
                    ))
                  ) : (
                    <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>Sin iniciativas en esta fase</span>
                  )}
                </div>
              </div>

              {/* Siguiente acción footer + indicador interactivo */}
              <div style={{ paddingTop: 10, borderTop: '1px solid #fef3c7' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 5 }}>
                  <span>Siguiente acción</span>
                  <span>IT: {f1Action.it} · Neg: {f1Action.neg}</span>
                </div>
                <div style={{ height: 6, width: '100%', background: '#f1f5f9', borderRadius: 4, overflow: 'hidden', display: 'flex', marginBottom: 8 }}>
                  <div style={{ width: `${f1Action.itPct}%`, background: '#3b82f6' }} title={`IT: ${f1Action.it}`} />
                  <div style={{ width: `${f1Action.negPct}%`, background: '#f59e0b' }} title={`Negocio: ${f1Action.neg}`} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 12,
                      background: isSelected ? '#f59e0b' : '#fffbeb',
                      color: isSelected ? '#ffffff' : '#b45309',
                      display: 'inline-block',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {isSelected ? '✓ Filtrando en cronograma' : '🔍 Clic para filtrar cronograma'}
                  </span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* FASE 2: Planificación y Presupuesto */}
        {(() => {
          const isSelected = selectedPhase === 2;
          return (
            <div
              onClick={() => onSelectPhase && onSelectPhase(2)}
              style={{
                background: '#ffffff',
                border: isSelected ? '2px solid #2563eb' : '1px solid #bfdbfe',
                borderTop: '4px solid #2563eb',
                borderRadius: 12,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: isSelected
                  ? '0 0 0 3px rgba(37, 99, 235, 0.35), 0 8px 18px rgba(0,0,0,0.06)'
                  : '0 1px 3px rgba(0,0,0,0.04)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                position: 'relative',
              }}
              title="Haz clic para filtrar el cronograma inferior por Fase 2"
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: '#1d4ed8',
                      background: '#dbeafe',
                      padding: '2px 8px',
                      borderRadius: 4,
                    }}
                  >
                    FASE 2
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#2563eb' }}>
                    {Math.round((fase2.length / total) * 100)}%
                  </span>
                </div>

                <h4 style={{ fontSize: 13.5, fontWeight: 800, color: '#1e293b', margin: '0 0 2px 0' }}>
                  Planificación y Presupuesto
                </h4>
                <p style={{ fontSize: 10.5, color: '#64748b', margin: '0 0 8px 0' }}>
                  Por planificar, aprobar plan y habilitar presupuesto
                </p>

                <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', marginBottom: 10, lineHeight: 1 }}>
                  {fase2.length}
                </div>

                {/* Sub-etapas con nombres de campos legibles */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minHeight: 48, marginBottom: 12 }}>
                  {getSubEtapas(fase2).length > 0 ? (
                    getSubEtapas(fase2).map(s => (
                      <div key={s.etapa} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#475569' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2563eb', flexShrink: 0 }} />
                          {s.label}
                        </span>
                        <strong style={{ color: '#0f172a' }}>{s.count}</strong>
                      </div>
                    ))
                  ) : (
                    <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>Sin iniciativas en esta fase</span>
                  )}
                </div>
              </div>

              {/* Siguiente acción footer + indicador interactivo */}
              <div style={{ paddingTop: 10, borderTop: '1px solid #dbeafe' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 5 }}>
                  <span>Siguiente acción</span>
                  <span>IT: {f2Action.it} · Neg: {f2Action.neg}</span>
                </div>
                <div style={{ height: 6, width: '100%', background: '#f1f5f9', borderRadius: 4, overflow: 'hidden', display: 'flex', marginBottom: 8 }}>
                  <div style={{ width: `${f2Action.itPct}%`, background: '#3b82f6' }} title={`IT: ${f2Action.it}`} />
                  <div style={{ width: `${f2Action.negPct}%`, background: '#f59e0b' }} title={`Negocio: ${f2Action.neg}`} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 12,
                      background: isSelected ? '#2563eb' : '#eff6ff',
                      color: isSelected ? '#ffffff' : '#1d4ed8',
                      display: 'inline-block',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {isSelected ? '✓ Filtrando en cronograma' : '🔍 Clic para filtrar cronograma'}
                  </span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* FASE 3: Planificadas e Implementadas */}
        {(() => {
          const isSelected = selectedPhase === 3;
          return (
            <div
              onClick={() => onSelectPhase && onSelectPhase(3)}
              style={{
                background: '#ffffff',
                border: isSelected ? '2px solid #059669' : '1px solid #a7f3d0',
                borderTop: '4px solid #059669',
                borderRadius: 12,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: isSelected
                  ? '0 0 0 3px rgba(5, 150, 105, 0.35), 0 8px 18px rgba(0,0,0,0.06)'
                  : '0 1px 3px rgba(0,0,0,0.04)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                position: 'relative',
              }}
              title="Haz clic para filtrar el cronograma inferior por Fase 3"
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: '#047857',
                      background: '#d1fae5',
                      padding: '2px 8px',
                      borderRadius: 4,
                    }}
                  >
                    FASE 3
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#059669' }}>
                    {Math.round((fase3.length / total) * 100)}%
                  </span>
                </div>

                <h4 style={{ fontSize: 13.5, fontWeight: 800, color: '#1e293b', margin: '0 0 2px 0' }}>
                  Planificadas e Implementadas
                </h4>
                <p style={{ fontSize: 10.5, color: '#64748b', margin: '0 0 8px 0' }}>
                  Iniciativas en ejecución, planificadas e implementadas
                </p>

                <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', marginBottom: 10, lineHeight: 1 }}>
                  {fase3.length}
                </div>

                {/* Sub-etapas con nombres de campos legibles */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minHeight: 48, marginBottom: 12 }}>
                  {getSubEtapas(fase3).length > 0 ? (
                    getSubEtapas(fase3).map(s => (
                      <div key={s.etapa} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#475569' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#059669', flexShrink: 0 }} />
                          {s.label}
                        </span>
                        <strong style={{ color: '#0f172a' }}>{s.count}</strong>
                      </div>
                    ))
                  ) : (
                    <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>Sin iniciativas en esta fase</span>
                  )}
                </div>
              </div>

              {/* Siguiente acción footer + indicador interactivo */}
              <div style={{ paddingTop: 10, borderTop: '1px solid #d1fae5' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 5 }}>
                  <span>Siguiente acción</span>
                  <span>IT: {f3Action.it} · Neg: {f3Action.neg}</span>
                </div>
                <div style={{ height: 6, width: '100%', background: '#f1f5f9', borderRadius: 4, overflow: 'hidden', display: 'flex', marginBottom: 8 }}>
                  <div style={{ width: `${f3Action.itPct}%`, background: '#10b981' }} title={`IT: ${f3Action.it}`} />
                  <div style={{ width: `${f3Action.negPct}%`, background: '#f59e0b' }} title={`Negocio: ${f3Action.neg}`} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 12,
                      background: isSelected ? '#059669' : '#ecfdf5',
                      color: isSelected ? '#ffffff' : '#047857',
                      display: 'inline-block',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {isSelected ? '✓ Filtrando en cronograma' : '🔍 Clic para filtrar cronograma'}
                  </span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* CON OBSERVACIONES: Registro Incompleto y Eliminadas */}
        {(() => {
          const isSelected = selectedPhase === 'observaciones';
          return (
            <div
              onClick={() => onSelectPhase && onSelectPhase('observaciones')}
              style={{
                background: '#ffffff',
                border: isSelected ? '2px solid #e11d48' : '1px solid #fecdd3',
                borderTop: '4px solid #e11d48',
                borderRadius: 12,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: isSelected
                  ? '0 0 0 3px rgba(225, 29, 72, 0.35), 0 8px 18px rgba(0,0,0,0.06)'
                  : '0 1px 3px rgba(0,0,0,0.04)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                position: 'relative',
              }}
              title="Haz clic para filtrar el cronograma inferior por iniciativas Con Observaciones"
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: '#9f1239',
                      background: '#ffe4e6',
                      padding: '2px 8px',
                      borderRadius: 4,
                    }}
                  >
                    CON OBSERVACIONES
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#e11d48' }}>
                    {Math.round((faseObs.length / total) * 100)}%
                  </span>
                </div>

                <h4 style={{ fontSize: 13.5, fontWeight: 800, color: '#1e293b', margin: '0 0 2px 0' }}>
                  Con Observaciones
                </h4>
                <p style={{ fontSize: 10.5, color: '#64748b', margin: '0 0 8px 0' }}>
                  Registros incompletos y registros eliminados
                </p>

                <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', marginBottom: 10, lineHeight: 1 }}>
                  {faseObs.length}
                </div>

                {/* Sub-etapas con nombres de campos legibles */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minHeight: 48, marginBottom: 12 }}>
                  {getSubEtapas(faseObs).length > 0 ? (
                    getSubEtapas(faseObs).map(s => (
                      <div key={s.etapa} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#475569' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#e11d48', flexShrink: 0 }} />
                          {s.label}
                        </span>
                        <strong style={{ color: '#0f172a' }}>{s.count}</strong>
                      </div>
                    ))
                  ) : (
                    <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>Sin iniciativas observadas</span>
                  )}
                </div>
              </div>

              {/* Siguiente acción footer + indicador interactivo */}
              <div style={{ paddingTop: 10, borderTop: '1px solid #ffe4e6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 5 }}>
                  <span>Siguiente acción</span>
                  <span>{fObsAction.neg > 0 ? `Por regularizar (${fObsAction.neg})` : 'Revisión'}</span>
                </div>
                <div style={{ height: 6, width: '100%', background: '#f1f5f9', borderRadius: 4, overflow: 'hidden', display: 'flex', marginBottom: 8 }}>
                  <div style={{ width: '100%', background: '#e11d48' }} title={`Observadas: ${faseObs.length}`} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 12,
                      background: isSelected ? '#e11d48' : '#fff1f2',
                      color: isSelected ? '#ffffff' : '#be123c',
                      display: 'inline-block',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {isSelected ? '✓ Filtrando en cronograma' : '🔍 Clic para filtrar cronograma'}
                  </span>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECCIÓN INFERIOR: 3 TARJETAS ESTRATÉGICAS (REFORMULADAS, SIN CORTAR TEXTOS) */}
      {/* ------------------------------------------------------------- */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
          gap: 14,
        }}
      >
        {/* CARD 1: Responsabilidad: ¿Quién tiene la siguiente acción? */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: '16px 18px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h4 style={{ fontSize: 13.5, fontWeight: 800, color: '#0f172a', margin: '0 0 3px 0' }}>
              Responsabilidad: ¿Quién tiene la siguiente acción?
            </h4>
            <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 12px 0' }}>
              Balance operativo entre Sistemas (IT) y Áreas Solicitantes (Negocio)
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              {/* IT Box */}
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  IT / Sistemas
                </div>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#1e40af', margin: '3px 0 2px 0' }}>
                  {actionStats.itCount}
                </div>
                <div style={{ fontSize: 10, color: '#3b82f6', fontWeight: 700, marginBottom: 6 }}>
                  {actionStats.itPct}% del trabajo activo
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, color: '#1e3a8a', borderTop: '1px solid #dbeafe', paddingTop: 6 }}>
                  <div>• Estimación técnica: <strong>{actionStats.itEstimando}</strong></div>
                  <div>• Planificación técnica: <strong>{actionStats.itPlanificando}</strong></div>
                  <div>• En ejecución técnica: <strong>{actionStats.itEjecutando}</strong></div>
                </div>
              </div>

              {/* Negocio Box */}
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Negocio / Solicitante
                </div>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#d97706', margin: '3px 0 2px 0' }}>
                  {actionStats.negocioCount}
                </div>
                <div style={{ fontSize: 10, color: '#d97706', fontWeight: 700, marginBottom: 6 }}>
                  {actionStats.negPct}% del trabajo activo
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, color: '#78350f', borderTop: '1px solid #fef3c7', paddingTop: 6 }}>
                  <div>• Por aprobar estimación: <strong>{actionStats.negAprobarEstim}</strong></div>
                  <div>• Por habilitar presupuesto: <strong>{actionStats.negPresupuesto}</strong></div>
                  <div>• Por aprobar planificación: <strong>{actionStats.negAprobarPlan}</strong></div>
                </div>
              </div>
            </div>

            {/* Barra acumulada */}
            <div style={{ height: 8, width: '100%', background: '#f1f5f9', borderRadius: 4, overflow: 'hidden', display: 'flex', marginBottom: 8 }}>
              <div style={{ width: `${actionStats.itPct}%`, background: '#2563eb' }} title={`IT: ${actionStats.itPct}%`} />
              <div style={{ width: `${actionStats.negPct}%`, background: '#f59e0b' }} title={`Negocio: ${actionStats.negPct}%`} />
            </div>
          </div>

          <div style={{ fontSize: 10.5, color: '#64748b', borderTop: '1px solid #f1f5f9', paddingTop: 8, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
            <span>Total en cartera activa: <strong>{actionStats.activeCount} iniciativas</strong></span>
            {actionStats.negocioCount > 0 ? (
              <span style={{ color: '#b45309', fontWeight: 700 }}>
                ⚠️ Negocio tiene {actionStats.negocioCount} aprobaciones pendientes
              </span>
            ) : (
              <span style={{ color: '#059669', fontWeight: 700 }}>✓ Negocio al día con aprobaciones</span>
            )}
          </div>
        </div>

        {/* CARD 2: Distribución Estratégica por Frente / Ecosistema */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: '16px 18px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h4 style={{ fontSize: 13.5, fontWeight: 800, color: '#0f172a', margin: '0 0 3px 0' }}>
              Distribución Estratégica por Frente / Ecosistema
            </h4>
            <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 12px 0' }}>
              Avance del pipeline por dominio tecnológico (textos completos)
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {ecosistemas.length > 0 ? (
                ecosistemas.map(eco => {
                  const ecoTotal = eco.total || 1;
                  const f1Pct = (eco.f1 / ecoTotal) * 100;
                  const f2Pct = (eco.f2 / ecoTotal) * 100;
                  const f3Pct = (eco.f3 / ecoTotal) * 100;
                  const fObsPct = (eco.fObs / ecoTotal) * 100;

                  return (
                    <div key={eco.name} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span
                          style={{
                            fontSize: 11.5,
                            fontWeight: 700,
                            color: '#1e293b',
                            whiteSpace: 'normal',
                            wordBreak: 'break-word',
                            lineHeight: 1.3,
                          }}
                        >
                          {eco.name}
                        </span>
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 800,
                            color: '#0f172a',
                            background: '#f1f5f9',
                            padding: '1px 7px',
                            borderRadius: 10,
                            flexShrink: 0,
                          }}
                        >
                          {eco.total} ini. ({Math.round((eco.total / total) * 100)}%)
                        </span>
                      </div>
                      <div style={{ height: 8, width: '100%', background: '#f1f5f9', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
                        {f1Pct > 0 && <div style={{ width: `${f1Pct}%`, background: '#f59e0b' }} title={`Fase 1: ${eco.f1}`} />}
                        {f2Pct > 0 && <div style={{ width: `${f2Pct}%`, background: '#2563eb' }} title={`Fase 2: ${eco.f2}`} />}
                        {f3Pct > 0 && <div style={{ width: `${f3Pct}%`, background: '#059669' }} title={`Fase 3: ${eco.f3}`} />}
                        {fObsPct > 0 && <div style={{ width: `${fObsPct}%`, background: '#e11d48' }} title={`Con Observaciones: ${eco.fObs}`} />}
                      </div>
                    </div>
                  );
                })
              ) : (
                <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>Sin datos de frente disponibles</span>
              )}
            </div>
          </div>

          {/* Leyenda completa con nombres claros */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10, color: '#64748b', borderTop: '1px solid #f1f5f9', paddingTop: 8, flexWrap: 'wrap', gap: 6 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b' }} /> F1: Estimación
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#2563eb' }} /> F2: Planificación
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#059669' }} /> F3: Implementadas
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#e11d48' }} /> Observadas
            </span>
          </div>
        </div>

        {/* CARD 3: Salud de Fechas y Próximos Hitos Críticos */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: '16px 18px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h4 style={{ fontSize: 13.5, fontWeight: 800, color: '#0f172a', margin: '0 0 3px 0' }}>
              Salud de Fechas y Próximos Hitos Críticos
            </h4>
            <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 10px 0' }}>
              Hitos comprometidos vs fecha de hoy (títulos completos legibles)
            </p>

            {/* 4 métricas de salud */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 10 }}>
              <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 6, padding: '6px 4px', textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#be123c', lineHeight: 1 }}>{dateMilestones.vencidas}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#9f1239', marginTop: 3 }}>Superada</div>
              </div>
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '6px 4px', textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#b45309', lineHeight: 1 }}>{dateMilestones.vencePronto}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#78350f', marginTop: 3 }}>≤ 15 días</div>
              </div>
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '6px 4px', textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#1d4ed8', lineHeight: 1 }}>{dateMilestones.proximas}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#1e3a8a', marginTop: 3 }}>En fecha</div>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 4px', textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#64748b', lineHeight: 1 }}>{dateMilestones.sinFecha}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#475569', marginTop: 3 }}>Sin fecha</div>
              </div>
            </div>

            {/* Lista de próximos hitos con títulos COMPLETOS sin cortar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {dateMilestones.upcoming.length > 0 ? (
                dateMilestones.upcoming.map(({ iniciativa: i, dateStr, status }) => {
                  const badgeBg = status === 'overdue' ? '#fee2e2' : status === 'soon' ? '#fef3c7' : '#dbeafe';
                  const badgeColor = status === 'overdue' ? '#b91c1c' : status === 'soon' ? '#b45309' : '#1d4ed8';
                  const statusLabel = status === 'overdue' ? 'Superada' : status === 'soon' ? 'Vence pronto' : 'En fecha';

                  return (
                    <div
                      key={i.id}
                      onClick={() => onOpenDetailModal && onOpenDetailModal(i)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 3,
                        padding: '6px 8px',
                        borderRadius: 7,
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        cursor: onOpenDetailModal ? 'pointer' : 'default',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.background = '#f1f5f9';
                        (e.currentTarget as HTMLElement).style.borderColor = '#cbd5e1';
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.background = '#f8fafc';
                        (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0';
                      }}
                      title="Haz clic para ver el detalle completo de la iniciativa"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 10, fontWeight: 800, color: '#2563eb' }}>
                            #{i.id}
                          </span>
                          <span
                            style={{
                              fontSize: 9.5,
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: 4,
                              background: badgeBg,
                              color: badgeColor,
                              fontFamily: 'monospace',
                            }}
                          >
                            {statusLabel} ({fmtDateShort(dateStr)})
                          </span>
                        </div>
                        <span style={{ fontSize: 9.5, color: '#64748b', fontWeight: 600 }}>
                          {getEtapaHumanLabel(i.etapa_actual)}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: '#1e293b',
                          lineHeight: 1.35,
                          whiteSpace: 'normal',
                          wordBreak: 'break-word',
                        }}
                      >
                        {i.titulo || 'Sin título'}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', padding: '6px 0' }}>
                  Sin fechas de hitos comprometidos registradas
                </div>
              )}
            </div>
          </div>

          <div style={{ fontSize: 10, color: '#64748b', borderTop: '1px solid #f1f5f9', paddingTop: 8, textAlign: 'right' }}>
            Hitos evaluados según fechas de estimación y planificación
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente de Cabecera Plegable (Toggle) para Secciones
// ---------------------------------------------------------------------------
interface SectionHeaderToggleProps {
  title: string;
  badge?: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  actions?: React.ReactNode;
}

function SectionHeaderToggle({ title, badge, isOpen, onToggle, actions }: SectionHeaderToggleProps) {
  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '11px 16px',
        background: '#f8fafc',
        borderBottom: isOpen ? '1px solid #f1f5f9' : 'none',
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
      onMouseLeave={e => (e.currentTarget.style.background = '#f8fafc')}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            color: '#0284c7',
            transition: 'transform 0.15s ease',
          }}
        >
          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {title}
        </span>
        {badge}
      </div>

      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        onClick={e => e.stopPropagation()}
      >
        {actions}
        <button
          type="button"
          onClick={onToggle}
          style={{
            background: 'none',
            border: 'none',
            fontSize: 11,
            color: '#64748b',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 6px',
            borderRadius: 4,
            fontWeight: 600,
          }}
        >
          <span>{isOpen ? 'Plegar' : 'Desplegar'}</span>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// REPORTE 1 — Por VP del Área Solicitante
// ---------------------------------------------------------------------------
function ReporteVP({
  iniciativas, onNavigate, macro, onOpenDetailModal, onOpenVPSelector,
}: {
  iniciativas: Iniciativa[];
  onNavigate: NavigateFn;
  macro: MacroFilters;
  onOpenDetailModal?: (iniciativa: Iniciativa) => void;
  onOpenVPSelector?: () => void;
}) {
  // Estados plegables (toggles) para cada sección
  const [isPipelineStatsOpen, setIsPipelineStatsOpen] = useState(true);
  const [isTimelineOpen, setIsTimelineOpen] = useState(true);

  // Filtro interactivo de Fase (sincroniza Dashboard Estadístico con el Cronograma Timeline)
  const [selectedPhaseFilter, setSelectedPhaseFilter] = useState<VpPipelinePhase | null>(null);

  const handleSelectPhase = (phase: VpPipelinePhase) => {
    if (selectedPhaseFilter === phase) {
      setSelectedPhaseFilter(null);
    } else {
      setSelectedPhaseFilter(phase);
      setIsTimelineOpen(true);
      setTimeout(() => {
        const el = document.getElementById('cronograma-timeline-section');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 60);
    }
  };

  if (iniciativas.length === 0) {
    const isNoVpSelected = macro.vp_solicitantes.length === 0;
    return (
      <div style={{ textAlign: 'center', padding: '56px 24px', background: '#ffffff', borderRadius: 14, border: '1.5px dashed #cbd5e1', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        {isNoVpSelected ? (
          <>
            <Users size={42} style={{ color: '#3b82f6', margin: '0 auto 14px' }} />
            <h4 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
              Ninguna Vicepresidencia seleccionada
            </h4>
            <p style={{ fontSize: 13, color: '#64748b', maxWidth: 480, margin: '0 auto 16px', lineHeight: 1.5 }}>
              Para una mejor experiencia y evitar abrumar la pantalla, selecciona una o más Vicepresidencias en el combo selector superior <strong>"VP Solicitante"</strong> (puedes marcar varias a la vez).
            </p>
            {onOpenVPSelector && (
              <button
                type="button"
                onMouseDown={e => e.stopPropagation()}
                onClick={e => {
                  e.stopPropagation();
                  onOpenVPSelector();
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '9px 20px',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  borderRadius: 8,
                  border: 'none',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(37, 99, 235, 0.3)',
                  marginTop: 6,
                  transition: 'all 0.15s ease',
                }}
                onMouseOver={e => (e.currentTarget.style.backgroundColor = '#1d4ed8')}
                onMouseOut={e => (e.currentTarget.style.backgroundColor = '#2563eb')}
              >
                <ChevronDown size={14} />
                <span>selecciona alguna VP</span>
              </button>
            )}
          </>
        ) : (
          <>
            <Building2 size={36} style={{ color: '#94a3b8', margin: '0 auto 12px' }} />
            <h4 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>
              No se encontraron iniciativas
            </h4>
            <p style={{ fontSize: 13, color: '#64748b', maxWidth: 450, margin: '0 auto' }}>
              No hay iniciativas que coincidan con los filtros seleccionados en la cabecera. Intenta ajustar o limpiar los filtros.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ------------------------------------------------------------- */}
      {/* SECCIÓN 1: PIPELINE ESTADÍSTICO DINÁMICO (PLEGABLE) */}
      {/* ------------------------------------------------------------- */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }}
      >
        <SectionHeaderToggle
          title="Pipeline Estadístico de Iniciativas"
          badge={
            <span style={{ fontSize: 11, fontWeight: 700, color: '#0284c7', background: '#e0f2fe', padding: '2px 8px', borderRadius: 12 }}>
              {iniciativas.length} iniciativa{iniciativas.length === 1 ? '' : 's'}
            </span>
          }
          isOpen={isPipelineStatsOpen}
          onToggle={() => setIsPipelineStatsOpen(prev => !prev)}
        />
        {isPipelineStatsOpen && (
          <div style={{ padding: 16 }}>
            <DashboardEstadisticoVP
              iniciativas={iniciativas}
              onOpenDetailModal={onOpenDetailModal}
              selectedPhase={selectedPhaseFilter}
              onSelectPhase={handleSelectPhase}
            />
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECCIÓN 2: CRONOGRAMA DE INICIATIVAS (TIMELINE GANTT PLEGABLE) */}
      {/* ------------------------------------------------------------- */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }}
      >
        <SectionHeaderToggle
          title="Cronograma de Iniciativas (Timeline Gantt)"
          badge={
            <span style={{ fontSize: 11, fontWeight: 700, color: '#0284c7', background: '#e0f2fe', padding: '2px 8px', borderRadius: 12 }}>
              {iniciativas.length} iniciativa{iniciativas.length === 1 ? '' : 's'}
            </span>
          }
          isOpen={isTimelineOpen}
          onToggle={() => setIsTimelineOpen(prev => !prev)}
        />
        {isTimelineOpen && (
          <TimelineIniciativasVP
            iniciativas={iniciativas}
            onOpenDetailModal={onOpenDetailModal}
            phaseFilter={selectedPhaseFilter}
            onClearPhaseFilter={() => setSelectedPhaseFilter(null)}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// REPORTE 2 — Por Estado (Etapa)
// ---------------------------------------------------------------------------
function ReporteEstados({
  iniciativas, onNavigate, macro,
}: {
  iniciativas: Iniciativa[];
  onNavigate: NavigateFn;
  macro: MacroFilters;
}) {
  const data = useMemo(() => {
    const counts: Record<string, number> = {};
    iniciativas.forEach(i => { counts[i.etapa_actual] = (counts[i.etapa_actual] || 0) + 1; });
    const total = iniciativas.length || 1;
    const configList = [...ETAPAS_CONFIG, ...ETAPAS_PLANIFICADAS_CONFIG];
    return configList.filter(e => counts[e.id]).map(e => ({
      ...e,
      total: counts[e.id] || 0,
      pct: Math.round(((counts[e.id] || 0) / total) * 100),
    }));
  }, [iniciativas]);

  if (data.length === 0)
    return <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: '40px 0' }}>Sin datos disponibles.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <ResponsiveContainer width="100%" height={Math.max(180, data.length * 42 + 30)}>
        <BarChart data={data.map(d => ({ name: d.label, value: d.total, color: d.color }))} layout="vertical" margin={{ top: 0, right: 65, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f4f8" />
          <XAxis type="number" style={{ fontSize: 10 }} allowDecimals={false} />
          <YAxis dataKey="name" type="category" width={170} style={{ fontSize: 11 }} tick={{ fill: '#475569' }} />
          <Tooltip content={<ReportTooltip />} />
          <Bar dataKey="value" name="Iniciativas" radius={[0, 6, 6, 0]}>
            {data.map((e, i) => <Cell key={i} fill={e.color} />)}
            <LabelList
              content={(props: any) => {
                const { x, y, width, height, value } = props;
                if (value === undefined || value === null || value === 0) return null;
                return (
                  <text
                    x={x + width + 8}
                    y={y + height / 2}
                    fill="#0f172a"
                    textAnchor="start"
                    dominantBaseline="central"
                    style={{ fontSize: 11, fontWeight: 700 }}
                  >
                    {value}
                  </text>
                );
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
        {data.map(e => {
          const nav = buildNavFilters(macro, { etapas: [e.id] });
          return (
            <ClickableCard key={e.id} onClick={() => onNavigate(nav)} title={`Ver: ${e.label}`} borderColor={e.color} bg={e.bgColor}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: e.textColor, lineHeight: 1.3, maxWidth: '70%' }}>{e.label}</span>
                <span style={{ fontSize: 22, fontWeight: 800, color: e.color, lineHeight: 1 }}>{e.total}</span>
              </div>
              <div style={{ height: 4, borderRadius: 4, background: `${e.color}22`, overflow: 'hidden', marginTop: 6 }}>
                <div style={{ height: '100%', borderRadius: 4, background: e.color, width: `${e.pct}%`, transition: 'width 0.4s' }} />
              </div>
              <div style={{ fontSize: 10, color: e.textColor, opacity: 0.7, display: 'flex', justifyContent: 'space-between' }}>
                <span>{e.pct}% del total</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 3, opacity: 0.6 }}><ExternalLink size={9} /> Ver detalle</span>
              </div>
            </ClickableCard>
          );
        })}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>Estado / Etapa</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>Iniciativas</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>% del Total</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>Tipo</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => {
              const nav = buildNavFilters(macro, { etapas: [row.id] });
              return (
                <tr key={row.id} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 12px' }}>
                    <span
                      onClick={() => onNavigate(nav)}
                      title={`Ver iniciativas: ${row.label}`}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700,
                        padding: '3px 10px', borderRadius: 20, background: row.bgColor, color: row.textColor,
                        border: `1.5px solid ${row.color}55`, cursor: 'pointer', transition: 'all 0.12s',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = `0 0 0 3px ${row.color}33`; (e.currentTarget as HTMLElement).style.borderColor = row.color; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; (e.currentTarget as HTMLElement).style.borderColor = `${row.color}55`; }}
                    >
                      <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: row.color }} />
                      {row.label}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, fontSize: 13, color: '#0f172a' }}>{row.total}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: '#3b82f6', background: '#eff6ff', padding: '1px 8px', borderRadius: 20 }}>{row.pct}%</span>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    {row.isTerminal
                      ? <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 600, background: '#fef2f2', padding: '2px 8px', borderRadius: 20, border: '1px solid #fecaca' }}>Terminal</span>
                      : <span style={{ fontSize: 10, color: '#0284c7', fontWeight: 600, background: '#f0f9ff', padding: '2px 8px', borderRadius: 20, border: '1px solid #bae6fd' }}>Operativa</span>
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: '#f1f5f9', borderTop: '2px solid #e2e8f0' }}>
              <td style={{ padding: '8px 12px', fontWeight: 700, fontSize: 12, color: '#334155' }}>TOTAL</td>
              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, fontSize: 13, color: '#0f172a' }}>{iniciativas.length}</td>
              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#3b82f6' }}>100%</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// REPORTE 3 — Por IT BP
// ---------------------------------------------------------------------------
function ReporteITBP({
  iniciativas, onNavigate, macro,
}: {
  iniciativas: Iniciativa[];
  onNavigate: NavigateFn;
  macro: MacroFilters;
}) {
  const [sortField, setSortField] = useState<'total' | 'bp'>('total');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const data = useMemo(() => {
    const byBP: Record<string, { total: number; byEtapa: Record<EtapaPipeline, number> }> = {};
    iniciativas.forEach(i => {
      const bp = normalize(i.it_bp);
      if (!byBP[bp]) byBP[bp] = { total: 0, byEtapa: {} as Record<EtapaPipeline, number> };
      byBP[bp].total++;
      byBP[bp].byEtapa[i.etapa_actual] = (byBP[bp].byEtapa[i.etapa_actual] || 0) + 1;
    });
    const total = iniciativas.length || 1;
    return Object.entries(byBP).map(([bp, s]) => ({
      bp, total: s.total, pct: Math.round((s.total / total) * 100), byEtapa: s.byEtapa,
    }));
  }, [iniciativas]);

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const cmp = sortField === 'total'
        ? a.total - b.total
        : optLabel(a.bp).localeCompare(optLabel(b.bp), 'es');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortField, sortDir]);

  const topEtapas = useMemo(() => {
    const counts: Record<string, number> = {};
    iniciativas.forEach(i => { counts[i.etapa_actual] = (counts[i.etapa_actual] || 0) + 1; });
    const configList = [...ETAPAS_CONFIG, ...ETAPAS_PLANIFICADAS_CONFIG];
    return configList.filter(e => counts[e.id] > 0)
      .sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0)).slice(0, 6);
  }, [iniciativas]);

  const stackedData = useMemo(() =>
    sorted.slice(0, 20).map(d => {
      const row: Record<string, string | number> = {
        name: optLabel(d.bp).length > 28 ? optLabel(d.bp).slice(0, 26) + '…' : optLabel(d.bp),
        total: d.total,
      };
      topEtapas.forEach(e => { row[e.label] = d.byEtapa[e.id] || 0; });
      return row;
    }), [sorted, topEtapas]);

  const toggleSort = (f: typeof sortField) => {
    if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(f); setSortDir('desc'); }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) =>
    sortField !== field
      ? <ChevronRight size={12} style={{ opacity: 0.3, transform: 'rotate(90deg)' }} />
      : sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;

  if (data.length === 0)
    return <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: '40px 0' }}>Sin datos disponibles.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <p style={{ fontSize: 10, color: '#94a3b8', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Iniciativas por IT BP (top 20)</p>
        <ResponsiveContainer width="100%" height={Math.max(220, sorted.slice(0, 20).length * 36 + 40)}>
          <BarChart data={stackedData} layout="vertical" margin={{ top: 0, right: 65, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f4f8" />
            <XAxis type="number" style={{ fontSize: 10 }} allowDecimals={false} />
            <YAxis dataKey="name" type="category" width={160} style={{ fontSize: 11 }} tick={{ fill: '#475569' }} />
            <Tooltip content={<ReportTooltip />} />
            {topEtapas.map((e, etapaIdx) => (
              <Bar key={e.id} dataKey={e.label} stackId="a" fill={e.color} radius={[0, 2, 2, 0]}>
                <LabelList
                  content={(props: any) => {
                    const { index, x, y, width, height } = props;
                    const row = stackedData[index];
                    if (!row || !row.total) return null;
                    const currentVal = Number(row[topEtapas[etapaIdx]?.label]) || 0;
                    if (currentVal <= 0) return null;
                    for (let i = etapaIdx + 1; i < topEtapas.length; i++) {
                      if ((Number(row[topEtapas[i]?.label]) || 0) > 0) return null;
                    }
                    return (
                      <text
                        x={x + width + 8}
                        y={y + height / 2}
                        fill="#0f172a"
                        textAnchor="start"
                        dominantBaseline="central"
                        style={{ fontSize: 11, fontWeight: 700 }}
                      >
                        {row.total}
                      </text>
                    );
                  }}
                />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
        <EtapasLegend etapas={topEtapas} />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th onClick={() => toggleSort('bp')} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>IT BP <SortIcon field="bp" /></span>
              </th>
              <th onClick={() => toggleSort('total')} style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>Total <SortIcon field="total" /></span>
              </th>
              <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' }}>% del Total</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' }}>Distribución por Etapa</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, idx) => {
              const base = buildNavFilters(macro, { it_bps: [row.bp] });
              return (
                <tr key={row.bp} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 12px' }}>
                    <ClickableCell label={optLabel(row.bp)} onClick={() => onNavigate(base)} title={`Ver iniciativas de: ${optLabel(row.bp)}`} />
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{row.total}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: '#3b82f6', background: '#eff6ff', padding: '1px 8px', borderRadius: 20 }}>{row.pct}%</span>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {[...ETAPAS_CONFIG, ...ETAPAS_PLANIFICADAS_CONFIG].filter(e => (row.byEtapa[e.id] || 0) > 0).map(e => (
                        <EtapaBadge key={e.id} etapaId={e.id} count={row.byEtapa[e.id] || 0} navFilters={base} onNavigate={onNavigate} />
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: '#f1f5f9', borderTop: '2px solid #e2e8f0' }}>
              <td style={{ padding: '8px 12px', fontWeight: 700, fontSize: 12, color: '#334155' }}>TOTAL</td>
              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, fontSize: 13, color: '#0f172a' }}>{iniciativas.length}</td>
              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#3b82f6' }}>100%</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// REPORTE: Control de Pendientes por IT BP
// ---------------------------------------------------------------------------

function isAffirmative(v: string | null | undefined): boolean {
  if (!v) return false;
  const s = String(v).toUpperCase().trim();
  return ['SI', 'SÍ', 'YES', 'S', '1', 'TRUE'].includes(s);
}

type PendingBPTab = 'consolidado' | 'por_aprobar_estimacion' | 'por_habilitar_presupuesto' | 'aprobar_planificacion';

interface ReportePendientesBPProps {
  iniciativas: Iniciativa[];
  onNavigate: NavigateFn;
  macro: MacroFilters;
  onOpenDetailModal: (ini: Iniciativa) => void;
}

export function ReportePendientesBP({
  iniciativas,
  onNavigate,
  macro,
  onOpenDetailModal,
}: ReportePendientesBPProps) {
  const [activeTab, setActiveTab] = useState<PendingBPTab>('consolidado');
  const [sortField, setSortField] = useState<'total' | 'bp' | 'est' | 'presup' | 'plan'>('total');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedModalData, setSelectedModalData] = useState<{
    bp: string;
    title: string;
    items: Iniciativa[];
  } | null>(null);
  const [modalSearch, setModalSearch] = useState('');
  const [modalStageFilter, setModalStageFilter] = useState<'all' | 'por_aprobar_estimacion' | 'por_habilitar_presupuesto' | 'aprobar_planificacion'>('all');

  // Clasificar iniciativas según aprobaciones pendientes por BP
  const {
    itemsEstimacion,
    itemsPresupuesto,
    itemsPlanificacion,
    allPendingItems,
  } = useMemo(() => {
    const est: Iniciativa[] = [];
    const presup: Iniciativa[] = [];
    const plan: Iniciativa[] = [];

    iniciativas.forEach(i => {
      // 1. Por Aprobar Estimación
      if (i.etapa_actual === 'por_aprobar_estimacion' && !isAffirmative(i.aprobar_estimacion)) {
        est.push(i);
      }
      // 2. Por Habilitar Presupuesto
      if (i.etapa_actual === 'por_habilitar_presupuesto' && !isAffirmative(i.presupuesto_habilitado)) {
        presup.push(i);
      }
      // 3. Aprobar Planificación
      if (i.etapa_actual === 'aprobar_planificacion' && !isAffirmative(i.planificacion_aprobada)) {
        plan.push(i);
      }
    });

    const all = Array.from(new Set([...est, ...presup, ...plan]));

    return {
      itemsEstimacion: est,
      itemsPresupuesto: presup,
      itemsPlanificacion: plan,
      allPendingItems: all,
    };
  }, [iniciativas]);

  // Agrupación por IT BP
  const summaryByBP = useMemo(() => {
    const map: Record<
      string,
      {
        bp: string;
        estCount: number;
        presupCount: number;
        planCount: number;
        totalCount: number;
        itemsEst: Iniciativa[];
        itemsPresup: Iniciativa[];
        itemsPlan: Iniciativa[];
        itemsAll: Iniciativa[];
      }
    > = {};

    const getEntry = (bp: string | null | undefined) => {
      const normalized = normalize(bp);
      if (!map[normalized]) {
        map[normalized] = {
          bp: normalized,
          estCount: 0,
          presupCount: 0,
          planCount: 0,
          totalCount: 0,
          itemsEst: [],
          itemsPresup: [],
          itemsPlan: [],
          itemsAll: [],
        };
      }
      return map[normalized];
    };

    itemsEstimacion.forEach(i => {
      const entry = getEntry(i.it_bp);
      entry.estCount++;
      entry.itemsEst.push(i);
    });

    itemsPresupuesto.forEach(i => {
      const entry = getEntry(i.it_bp);
      entry.presupCount++;
      entry.itemsPresup.push(i);
    });

    itemsPlanificacion.forEach(i => {
      const entry = getEntry(i.it_bp);
      entry.planCount++;
      entry.itemsPlan.push(i);
    });

    Object.values(map).forEach(entry => {
      const combined = Array.from(new Set([...entry.itemsEst, ...entry.itemsPresup, ...entry.itemsPlan]));
      entry.itemsAll = combined;
      entry.totalCount = combined.length;
    });

    return Object.values(map);
  }, [itemsEstimacion, itemsPresupuesto, itemsPlanificacion]);

  // Ordenamiento
  const sortedSummary = useMemo(() => {
    return [...summaryByBP].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'total') cmp = a.totalCount - b.totalCount;
      else if (sortField === 'bp') cmp = optLabel(a.bp).localeCompare(optLabel(b.bp), 'es');
      else if (sortField === 'est') cmp = a.estCount - b.estCount;
      else if (sortField === 'presup') cmp = a.presupCount - b.presupCount;
      else if (sortField === 'plan') cmp = a.planCount - b.planCount;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [summaryByBP, sortField, sortDir]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) =>
    sortField !== field
      ? <ChevronRight size={12} style={{ opacity: 0.3, transform: 'rotate(90deg)' }} />
      : sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;

  // Chart data consolidado
  const chartDataConsolidado = useMemo(() => {
    return sortedSummary
      .filter(s => s.totalCount > 0)
      .slice(0, 15)
      .map(s => ({
        name: optLabel(s.bp).length > 24 ? optLabel(s.bp).slice(0, 22) + '…' : optLabel(s.bp),
        'Por Aprobar Est.': s.estCount,
        'Hab. Presupuesto': s.presupCount,
        'Aprobar Planif.': s.planCount,
        total: s.totalCount,
      }));
  }, [sortedSummary]);

  // Chart data específico para etapa
  const chartDataEstimacion = useMemo(() => {
    return sortedSummary
      .filter(s => s.estCount > 0)
      .map(s => ({
        name: optLabel(s.bp).length > 24 ? optLabel(s.bp).slice(0, 22) + '…' : optLabel(s.bp),
        value: s.estCount,
      }));
  }, [sortedSummary]);

  const chartDataPresupuesto = useMemo(() => {
    return sortedSummary
      .filter(s => s.presupCount > 0)
      .map(s => ({
        name: optLabel(s.bp).length > 24 ? optLabel(s.bp).slice(0, 22) + '…' : optLabel(s.bp),
        value: s.presupCount,
      }));
  }, [sortedSummary]);

  const chartDataPlanificacion = useMemo(() => {
    return sortedSummary
      .filter(s => s.planCount > 0)
      .map(s => ({
        name: optLabel(s.bp).length > 24 ? optLabel(s.bp).slice(0, 22) + '…' : optLabel(s.bp),
        value: s.planCount,
      }));
  }, [sortedSummary]);

  const openBPModal = (bp: string, items: Iniciativa[], title?: string, stageFilter: 'all' | 'por_aprobar_estimacion' | 'por_habilitar_presupuesto' | 'aprobar_planificacion' = 'all') => {
    setModalSearch('');
    setModalStageFilter(stageFilter);
    setSelectedModalData({
      bp,
      title: title || `Iniciativas Pendientes de BP TI: ${optLabel(bp)}`,
      items,
    });
  };

  const filteredModalItems = useMemo(() => {
    if (!selectedModalData) return [];
    let list = selectedModalData.items;

    if (modalStageFilter !== 'all') {
      list = list.filter(i => i.etapa_actual === modalStageFilter);
    }

    if (modalSearch.trim()) {
      const q = modalSearch.toLowerCase().trim();
      list = list.filter(i => {
        const idStr = String(i.id).padStart(4, '0');
        const tit = (i.titulo || '').toLowerCase();
        const bp = (i.it_bp || '').toLowerCase();
        const vp = (i.vp_solicitante || '').toLowerCase();
        const sol = (i.usuario_negocio || '').toLowerCase();
        return idStr.includes(q) || tit.includes(q) || bp.includes(q) || vp.includes(q) || sol.includes(q);
      });
    }

    return list;
  }, [selectedModalData, modalSearch, modalStageFilter]);

  const TABS_CONFIG = [
    { id: 'consolidado' as PendingBPTab, label: 'Consolidado General', count: allPendingItems.length, color: '#8b5cf6', bg: '#f5f3ff' },
    { id: 'por_aprobar_estimacion' as PendingBPTab, label: 'Por Aprobar Estimación', count: itemsEstimacion.length, color: '#8b5cf6', bg: '#f5f3ff' },
    { id: 'por_habilitar_presupuesto' as PendingBPTab, label: 'Por Habilitar Presupuesto', count: itemsPresupuesto.length, color: '#06b6d4', bg: '#ecfeff' },
    { id: 'aprobar_planificacion' as PendingBPTab, label: 'Aprobar Planificación', count: itemsPlanificacion.length, color: '#10b981', bg: '#ecfdf5' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Sub-navegación por pestañas */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, borderBottom: '1px solid #e2e8f0', paddingBottom: 12 }}>
        {TABS_CONFIG.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 16px',
                borderRadius: 10,
                border: isActive ? `1.5px solid ${tab.color}` : '1.5px solid #e2e8f0',
                background: isActive ? tab.bg : '#ffffff',
                color: isActive ? tab.color : '#64748b',
                fontWeight: isActive ? 800 : 600,
                fontSize: 12,
                cursor: 'pointer',
                boxShadow: isActive ? `0 2px 8px ${tab.color}20` : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{tab.label}</span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '2px 7px',
                  borderRadius: 20,
                  background: isActive ? tab.color : '#f1f5f9',
                  color: isActive ? '#ffffff' : '#64748b',
                }}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tarjetas de Resumen KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div
          onClick={() => setActiveTab('consolidado')}
          style={{
            background: '#ffffff',
            border: activeTab === 'consolidado' ? '1.5px solid #8b5cf6' : '1px solid #e2e8f0',
            borderRadius: 14,
            padding: '14px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Total Pendientes BPs
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 24, fontWeight: 900, color: '#8b5cf6' }}>{allPendingItems.length}</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>iniciativas</span>
          </div>
          <span style={{ fontSize: 10, color: '#8b5cf6', fontWeight: 600 }}>En fases de aprobación</span>
        </div>

        <div
          onClick={() => setActiveTab('por_aprobar_estimacion')}
          style={{
            background: '#ffffff',
            border: activeTab === 'por_aprobar_estimacion' ? '1.5px solid #8b5cf6' : '1px solid #e2e8f0',
            borderRadius: 14,
            padding: '14px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Por Aprobar Estimación
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 24, fontWeight: 900, color: '#7c3aed' }}>{itemsEstimacion.length}</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>iniciativas</span>
          </div>
          <span style={{ fontSize: 10, color: '#7c3aed', fontWeight: 600 }}>Esperando aprobación técnica</span>
        </div>

        <div
          onClick={() => setActiveTab('por_habilitar_presupuesto')}
          style={{
            background: '#ffffff',
            border: activeTab === 'por_habilitar_presupuesto' ? '1.5px solid #06b6d4' : '1px solid #e2e8f0',
            borderRadius: 14,
            padding: '14px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Por Habilitar Presupuesto
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 24, fontWeight: 900, color: '#0891b2' }}>{itemsPresupuesto.length}</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>iniciativas</span>
          </div>
          <span style={{ fontSize: 10, color: '#0891b2', fontWeight: 600 }}>Esperando asignación fondos</span>
        </div>

        <div
          onClick={() => setActiveTab('aprobar_planificacion')}
          style={{
            background: '#ffffff',
            border: activeTab === 'aprobar_planificacion' ? '1.5px solid #10b981' : '1px solid #e2e8f0',
            borderRadius: 14,
            padding: '14px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Aprobar Planificación
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 24, fontWeight: 900, color: '#059669' }}>{itemsPlanificacion.length}</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>iniciativas</span>
          </div>
          <span style={{ fontSize: 10, color: '#059669', fontWeight: 600 }}>Esperando visto bueno plan</span>
        </div>
      </div>

      {/* VISTA 1: CONSOLIDADO GENERAL */}
      {activeTab === 'consolidado' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Gráfico de Barras Apiladas */}
          <div>
            <p style={{ fontSize: 10, color: '#94a3b8', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Distribución de Iniciativas Pendientes por IT BP (Top 15)
            </p>
            {chartDataConsolidado.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#94a3b8', fontSize: 12 }}>
                🎉 No hay iniciativas pendientes de BPs en los datos filtrados.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(220, chartDataConsolidado.length * 38 + 40)}>
                <BarChart data={chartDataConsolidado} layout="vertical" margin={{ top: 0, right: 65, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f4f8" />
                  <XAxis type="number" style={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis dataKey="name" type="category" width={175} style={{ fontSize: 11 }} tick={{ fill: '#475569' }} />
                  <Tooltip content={<ReportTooltip />} />
                  <Bar dataKey="Por Aprobar Est." stackId="a" fill="#8b5cf6" />
                  <Bar dataKey="Hab. Presupuesto" stackId="a" fill="#06b6d4" />
                  <Bar dataKey="Aprobar Planif." stackId="a" fill="#10b981" radius={[0, 4, 4, 0]}>
                    <LabelList
                      content={(props: any) => {
                        const { index, x, y, width, height } = props;
                        const row = chartDataConsolidado[index];
                        if (!row || !row.total) return null;
                        return (
                          <text
                            x={x + width + 8}
                            y={y + height / 2}
                            fill="#5b21b6"
                            textAnchor="start"
                            dominantBaseline="central"
                            style={{ fontSize: 11, fontWeight: 700 }}
                          >
                            {row.total}
                          </text>
                        );
                      }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            {/* Legend */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#475569' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#8b5cf6' }} />
                Por Aprobar Estimación
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#475569' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#06b6d4' }} />
                Por Habilitar Presupuesto
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#475569' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#10b981' }} />
                Aprobar Planificación
              </span>
            </div>
          </div>

          {/* Tabla Consolidada */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th onClick={() => toggleSort('bp')} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0', cursor: 'pointer', userSelect: 'none' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>IT BP <SortIcon field="bp" /></span>
                  </th>
                  <th onClick={() => toggleSort('est')} style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0', cursor: 'pointer', userSelect: 'none' }}>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>Por Aprobar Est. <SortIcon field="est" /></span>
                  </th>
                  <th onClick={() => toggleSort('presup')} style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0', cursor: 'pointer', userSelect: 'none' }}>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>Hab. Presupuesto <SortIcon field="presup" /></span>
                  </th>
                  <th onClick={() => toggleSort('plan')} style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0', cursor: 'pointer', userSelect: 'none' }}>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>Aprobar Planif. <SortIcon field="plan" /></span>
                  </th>
                  <th onClick={() => toggleSort('total')} style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0', cursor: 'pointer', userSelect: 'none' }}>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>Total Pendientes <SortIcon field="total" /></span>
                  </th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>% del Total</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {sortedSummary.filter(s => s.totalCount > 0).length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '30px 12px', textAlign: 'center', color: '#94a3b8' }}>
                      Sin pendientes por parte de los IT BPs.
                    </td>
                  </tr>
                ) : (
                  sortedSummary.filter(s => s.totalCount > 0).map((row, idx) => (
                    <tr key={row.bp} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 12px' }}>
                        <ClickableCell
                          label={optLabel(row.bp)}
                          onClick={() => openBPModal(row.bp, row.itemsAll)}
                          title={`Ver iniciativas pendientes de: ${optLabel(row.bp)}`}
                        />
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        {row.estCount > 0 ? (
                          <span
                            onClick={() => openBPModal(row.bp, row.itemsEst, `Iniciativas Por Aprobar Estimación: ${optLabel(row.bp)}`, 'por_aprobar_estimacion')}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '2px 8px',
                              borderRadius: 20,
                              background: '#f5f3ff',
                              color: '#7c3aed',
                              border: '1px solid #ddd6fe',
                              fontWeight: 700,
                              fontSize: 11,
                              cursor: 'pointer',
                            }}
                            title="Ver iniciativas por aprobar estimación"
                          >
                            {row.estCount}
                          </span>
                        ) : (
                          <span style={{ color: '#cbd5e1' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        {row.presupCount > 0 ? (
                          <span
                            onClick={() => openBPModal(row.bp, row.itemsPresup, `Iniciativas Por Habilitar Presupuesto: ${optLabel(row.bp)}`, 'por_habilitar_presupuesto')}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '2px 8px',
                              borderRadius: 20,
                              background: '#ecfeff',
                              color: '#0891b2',
                              border: '1px solid #a5f3fc',
                              fontWeight: 700,
                              fontSize: 11,
                              cursor: 'pointer',
                            }}
                            title="Ver iniciativas por habilitar presupuesto"
                          >
                            {row.presupCount}
                          </span>
                        ) : (
                          <span style={{ color: '#cbd5e1' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        {row.planCount > 0 ? (
                          <span
                            onClick={() => openBPModal(row.bp, row.itemsPlan, `Iniciativas Por Aprobar Planificación: ${optLabel(row.bp)}`, 'aprobar_planificacion')}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '2px 8px',
                              borderRadius: 20,
                              background: '#ecfdf5',
                              color: '#059669',
                              border: '1px solid #a7f3d0',
                              fontWeight: 700,
                              fontSize: 11,
                              cursor: 'pointer',
                            }}
                            title="Ver iniciativas por aprobar planificación"
                          >
                            {row.planCount}
                          </span>
                        ) : (
                          <span style={{ color: '#cbd5e1' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <span style={{ fontWeight: 800, color: '#5b21b6', fontSize: 13 }}>
                          {row.totalCount}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: '#6d28d9', background: '#f5f3ff', padding: '2px 8px', borderRadius: 20 }}>
                          {Math.round((row.totalCount / (allPendingItems.length || 1)) * 100)}%
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <button
                          onClick={() => openBPModal(row.bp, row.itemsAll)}
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: '#6d28d9',
                            background: '#f5f3ff',
                            border: '1px solid #ddd6fe',
                            borderRadius: 6,
                            padding: '4px 12px',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}
                        >
                          Ver Iniciativas
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f1f5f9', borderTop: '2px solid #e2e8f0' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, fontSize: 12, color: '#334155' }}>TOTAL</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: '#7c3aed' }}>{itemsEstimacion.length}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: '#0891b2' }}>{itemsPresupuesto.length}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: '#059669' }}>{itemsPlanificacion.length}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 900, fontSize: 14, color: '#5b21b6' }}>{allPendingItems.length}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#6d28d9' }}>100%</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* VISTA 2: POR APROBAR ESTIMACIÓN */}
      {activeTab === 'por_aprobar_estimacion' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 10, padding: '10px 16px', fontSize: 11.5, color: '#5b21b6', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={16} style={{ flexShrink: 0, color: '#7c3aed' }} />
            <span>
              <strong>Fase Auditada:</strong> Iniciativas en etapa <code>Por aprobar estimacion</code> donde el campo <code>Aprobar Estimación</code> está pendiente (distinto de "SÍ").
            </span>
          </div>

          <div>
            <p style={{ fontSize: 10, color: '#94a3b8', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Iniciativas Por Aprobar Estimación por IT BP
            </p>
            {chartDataEstimacion.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#94a3b8', fontSize: 12 }}>
                🎉 No hay estimaciones pendientes de aprobación.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(200, chartDataEstimacion.length * 36 + 30)}>
                <BarChart data={chartDataEstimacion} layout="vertical" margin={{ top: 0, right: 65, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f4f8" />
                  <XAxis type="number" style={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis dataKey="name" type="category" width={175} style={{ fontSize: 11 }} tick={{ fill: '#475569' }} />
                  <Tooltip content={<ReportTooltip />} />
                  <Bar dataKey="value" name="Por Aprobar Estimación" fill="#8b5cf6" radius={[0, 4, 4, 0]}>
                    <LabelList
                      content={(props: any) => {
                        const { x, y, width, height, value } = props;
                        if (!value) return null;
                        return (
                          <text
                            x={x + width + 8}
                            y={y + height / 2}
                            fill="#6d28d9"
                            textAnchor="start"
                            dominantBaseline="central"
                            style={{ fontSize: 11, fontWeight: 700 }}
                          >
                            {value}
                          </text>
                        );
                      }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>IT BP</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>Pendientes Estimación</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>% del Total</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {sortedSummary.filter(s => s.estCount > 0).map((row, idx) => (
                  <tr key={row.bp} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <ClickableCell label={optLabel(row.bp)} onClick={() => openBPModal(row.bp, row.itemsEst, `Por Aprobar Estimación: ${optLabel(row.bp)}`, 'por_aprobar_estimacion')} />
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#6d28d9', fontSize: 13 }}>{row.estCount}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: '#6d28d9', background: '#f5f3ff', padding: '2px 8px', borderRadius: 20 }}>
                        {Math.round((row.estCount / (itemsEstimacion.length || 1)) * 100)}%
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <button
                        onClick={() => openBPModal(row.bp, row.itemsEst, `Por Aprobar Estimación: ${optLabel(row.bp)}`, 'por_aprobar_estimacion')}
                        style={{ fontSize: 11, fontWeight: 600, color: '#6d28d9', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 6, padding: '4px 12px', cursor: 'pointer' }}
                      >
                        Ver Iniciativas
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f1f5f9', borderTop: '2px solid #e2e8f0' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, fontSize: 12, color: '#334155' }}>TOTAL</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, fontSize: 13, color: '#6d28d9' }}>{itemsEstimacion.length}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#6d28d9' }}>100%</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* VISTA 3: POR HABILITAR PRESUPUESTO */}
      {activeTab === 'por_habilitar_presupuesto' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ background: '#ecfeff', border: '1px solid #a5f3fc', borderRadius: 10, padding: '10px 16px', fontSize: 11.5, color: '#0e7490', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={16} style={{ flexShrink: 0, color: '#0891b2' }} />
            <span>
              <strong>Fase Auditada:</strong> Iniciativas en etapa <code>Por habilitar presup.</code> donde el campo <code>Presupuesto Habilitado</code> está pendiente (distinto de "SÍ").
            </span>
          </div>

          <div>
            <p style={{ fontSize: 10, color: '#94a3b8', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Iniciativas Por Habilitar Presupuesto por IT BP
            </p>
            {chartDataPresupuesto.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#94a3b8', fontSize: 12 }}>
                🎉 No hay iniciativas pendientes de habilitación de presupuesto.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(200, chartDataPresupuesto.length * 36 + 30)}>
                <BarChart data={chartDataPresupuesto} layout="vertical" margin={{ top: 0, right: 65, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f4f8" />
                  <XAxis type="number" style={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis dataKey="name" type="category" width={175} style={{ fontSize: 11 }} tick={{ fill: '#475569' }} />
                  <Tooltip content={<ReportTooltip />} />
                  <Bar dataKey="value" name="Por Habilitar Presupuesto" fill="#06b6d4" radius={[0, 4, 4, 0]}>
                    <LabelList
                      content={(props: any) => {
                        const { x, y, width, height, value } = props;
                        if (!value) return null;
                        return (
                          <text
                            x={x + width + 8}
                            y={y + height / 2}
                            fill="#0e7490"
                            textAnchor="start"
                            dominantBaseline="central"
                            style={{ fontSize: 11, fontWeight: 700 }}
                          >
                            {value}
                          </text>
                        );
                      }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>IT BP</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>Pendientes Presupuesto</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>% del Total</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {sortedSummary.filter(s => s.presupCount > 0).map((row, idx) => (
                  <tr key={row.bp} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <ClickableCell label={optLabel(row.bp)} onClick={() => openBPModal(row.bp, row.itemsPresup, `Por Habilitar Presupuesto: ${optLabel(row.bp)}`, 'por_habilitar_presupuesto')} />
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#0891b2', fontSize: 13 }}>{row.presupCount}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: '#0891b2', background: '#ecfeff', padding: '2px 8px', borderRadius: 20 }}>
                        {Math.round((row.presupCount / (itemsPresupuesto.length || 1)) * 100)}%
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <button
                        onClick={() => openBPModal(row.bp, row.itemsPresup, `Por Habilitar Presupuesto: ${optLabel(row.bp)}`, 'por_habilitar_presupuesto')}
                        style={{ fontSize: 11, fontWeight: 600, color: '#0891b2', background: '#ecfeff', border: '1px solid #a5f3fc', borderRadius: 6, padding: '4px 12px', cursor: 'pointer' }}
                      >
                        Ver Iniciativas
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f1f5f9', borderTop: '2px solid #e2e8f0' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, fontSize: 12, color: '#334155' }}>TOTAL</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, fontSize: 13, color: '#0891b2' }}>{itemsPresupuesto.length}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#0891b2' }}>100%</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* VISTA 4: APROBAR PLANIFICACIÓN */}
      {activeTab === 'aprobar_planificacion' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: '10px 16px', fontSize: 11.5, color: '#065f46', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={16} style={{ flexShrink: 0, color: '#059669' }} />
            <span>
              <strong>Fase Auditada:</strong> Iniciativas en etapa <code>Aprobar Planificación</code> donde el campo <code>Planificación Aprobada</code> está pendiente (distinto de "SÍ").
            </span>
          </div>

          <div>
            <p style={{ fontSize: 10, color: '#94a3b8', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Iniciativas Por Aprobar Planificación por IT BP
            </p>
            {chartDataPlanificacion.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#94a3b8', fontSize: 12 }}>
                🎉 No hay iniciativas pendientes de aprobación de planificación.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(200, chartDataPlanificacion.length * 36 + 30)}>
                <BarChart data={chartDataPlanificacion} layout="vertical" margin={{ top: 0, right: 65, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f4f8" />
                  <XAxis type="number" style={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis dataKey="name" type="category" width={175} style={{ fontSize: 11 }} tick={{ fill: '#475569' }} />
                  <Tooltip content={<ReportTooltip />} />
                  <Bar dataKey="value" name="Aprobar Planificación" fill="#10b981" radius={[0, 4, 4, 0]}>
                    <LabelList
                      content={(props: any) => {
                        const { x, y, width, height, value } = props;
                        if (!value) return null;
                        return (
                          <text
                            x={x + width + 8}
                            y={y + height / 2}
                            fill="#047857"
                            textAnchor="start"
                            dominantBaseline="central"
                            style={{ fontSize: 11, fontWeight: 700 }}
                          >
                            {value}
                          </text>
                        );
                      }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>IT BP</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>Pendientes Planificación</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>% del Total</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {sortedSummary.filter(s => s.planCount > 0).map((row, idx) => (
                  <tr key={row.bp} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <ClickableCell label={optLabel(row.bp)} onClick={() => openBPModal(row.bp, row.itemsPlan, `Aprobar Planificación: ${optLabel(row.bp)}`, 'aprobar_planificacion')} />
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#059669', fontSize: 13 }}>{row.planCount}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: '#059669', background: '#ecfdf5', padding: '2px 8px', borderRadius: 20 }}>
                        {Math.round((row.planCount / (itemsPlanificacion.length || 1)) * 100)}%
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <button
                        onClick={() => openBPModal(row.bp, row.itemsPlan, `Aprobar Planificación: ${optLabel(row.bp)}`, 'aprobar_planificacion')}
                        style={{ fontSize: 11, fontWeight: 600, color: '#059669', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6, padding: '4px 12px', cursor: 'pointer' }}
                      >
                        Ver Iniciativas
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f1f5f9', borderTop: '2px solid #e2e8f0' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, fontSize: 12, color: '#334155' }}>TOTAL</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, fontSize: 13, color: '#059669' }}>{itemsPlanificacion.length}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>100%</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ================================================================
          MODAL DE DETALLE DE INICIATIVAS PENDIENTES DEL BP TI
      ================================================================ */}
      {selectedModalData && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(8px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setSelectedModalData(null)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 16,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              width: '96vw',
              maxWidth: 1500,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              border: '1px solid #e2e8f0',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header del modal */}
            <div
              style={{
                padding: '16px 22px',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'linear-gradient(to right, #f8fafc, #ffffff)',
              }}
            >
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  {selectedModalData.title}
                </h3>
                <p style={{ fontSize: 12, color: '#64748b', margin: '3px 0 0 0' }}>
                  Mostrando {filteredModalItems.length} de {selectedModalData.items.length} iniciativas pendientes
                </p>
              </div>
              <button
                onClick={() => setSelectedModalData(null)}
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: '50%',
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#64748b',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Barra de filtros del modal */}
            <div
              style={{
                padding: '10px 22px',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                backgroundColor: '#fafafa',
              }}
            >
              {/* Buscador */}
              <div style={{ position: 'relative', minWidth: 260, flex: 1, maxWidth: 420 }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Buscar por ID, título, solicitante, VP..."
                  value={modalSearch}
                  onChange={e => setModalSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px 6px 30px',
                    fontSize: 12,
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    outline: 'none',
                    backgroundColor: '#ffffff',
                  }}
                />
              </div>

              {/* Filtro de etapa */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Fase:</span>
                <select
                  value={modalStageFilter}
                  onChange={e => setModalStageFilter(e.target.value as any)}
                  style={{
                    fontSize: 11.5,
                    padding: '5px 10px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#334155',
                    cursor: 'pointer',
                  }}
                >
                  <option value="all">Todas las fases pendientes</option>
                  <option value="por_aprobar_estimacion">Por Aprobar Estimación</option>
                  <option value="por_habilitar_presupuesto">Por Habilitar Presupuesto</option>
                  <option value="aprobar_planificacion">Aprobar Planificación</option>
                </select>
              </div>
            </div>

            {/* Tabla de iniciativas */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 22px' }}>
              {filteredModalItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 13 }}>
                  No se encontraron iniciativas con los filtros aplicados.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', color: '#475569', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                      <th style={{ padding: '8px 8px', width: 36, textAlign: 'center' }}>
                        <Eye size={13} style={{ color: '#94a3b8', margin: '0 auto' }} />
                      </th>
                      <th style={{ padding: '8px 10px', fontWeight: 700, whiteSpace: 'nowrap' }}>ID</th>
                      <th style={{ padding: '8px 10px', fontWeight: 700, minWidth: 260 }}>Título de la Iniciativa</th>
                      <th style={{ padding: '8px 10px', fontWeight: 700 }}>IT BP</th>
                      <th style={{ padding: '8px 10px', fontWeight: 700 }}>VP Solicitante</th>
                      <th style={{ padding: '8px 10px', fontWeight: 700 }}>Solicitante</th>
                      <th style={{ padding: '8px 10px', fontWeight: 700 }}>Líder Dominio</th>
                      <th style={{ padding: '8px 10px', fontWeight: 700 }}>Etapa Pipeline</th>
                      <th style={{ padding: '8px 10px', fontWeight: 700 }}>Acción Pendiente BP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredModalItems.map((t, idx) => {
                      const idStr = String(t.id).padStart(4, '0');
                      const cfg = ETAPAS_MAP.get(t.etapa_actual);

                      let pendingBadge = null;
                      if (t.etapa_actual === 'por_aprobar_estimacion') {
                        pendingBadge = (
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe', fontWeight: 700 }}>
                            Aprobar Estimación: {t.aprobar_estimacion || 'Pendiente'}
                          </span>
                        );
                      } else if (t.etapa_actual === 'por_habilitar_presupuesto') {
                        pendingBadge = (
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: '#ecfeff', color: '#0891b2', border: '1px solid #a5f3fc', fontWeight: 700 }}>
                            Habilitar Presupuesto: {t.presupuesto_habilitado || 'Pendiente'}
                          </span>
                        );
                      } else if (t.etapa_actual === 'aprobar_planificacion') {
                        pendingBadge = (
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', fontWeight: 700 }}>
                            Aprobar Planificación: {t.planificacion_aprobada || 'Pendiente'}
                          </span>
                        );
                      }

                      return (
                        <tr
                          key={t.id}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                          }}
                        >
                          <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => onOpenDetailModal(t)}
                              style={{
                                background: '#eff6ff',
                                border: '1px solid #bfdbfe',
                                borderRadius: 6,
                                width: 26,
                                height: 26,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                color: '#2563eb',
                              }}
                              title="Abrir detalle completo de la iniciativa"
                            >
                              <Eye size={13} />
                            </button>
                          </td>
                          <td style={{ padding: '8px 10px', fontWeight: 700, color: '#3b82f6', whiteSpace: 'nowrap' }}>
                            {idStr}
                          </td>
                          <td style={{ padding: '8px 10px', fontWeight: 600, color: '#1e293b', minWidth: 260, lineHeight: 1.4 }}>
                            {t.titulo}
                          </td>
                          <td style={{ padding: '8px 10px', color: '#475569' }}>
                            {t.it_bp || '—'}
                          </td>
                          <td style={{ padding: '8px 10px', color: '#475569' }}>
                            {t.vp_solicitante || '—'}
                          </td>
                          <td style={{ padding: '8px 10px', color: '#475569' }}>
                            {t.usuario_negocio || '—'}
                          </td>
                          <td style={{ padding: '8px 10px', color: '#475569' }}>
                            {t.lider_dominio || '—'}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            {cfg ? (
                              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, backgroundColor: cfg.bgColor, color: cfg.textColor, fontWeight: 700, whiteSpace: 'nowrap' }}>
                                {cfg.label}
                              </span>
                            ) : (
                              <span>{t.etapa_actual}</span>
                            )}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            {pendingBadge}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer modal */}
            <div
              style={{
                padding: '12px 22px',
                borderTop: '1px solid #f1f5f9',
                display: 'flex',
                justifyContent: 'flex-end',
                backgroundColor: '#f8fafc',
              }}
            >
              <button
                onClick={() => setSelectedModalData(null)}
                style={{
                  backgroundColor: '#8b5cf6',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '7px 16px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal: Reports
// ---------------------------------------------------------------------------
export function Reports({ iniciativas, onNavigate, mode = 'demanda' }: ReportsProps) {
  // ---- Estado de filtros macro ----
  const [macroInstituciones, setMacroInstituciones] = useState<string[]>([]);
  const [macroSPO,           setMacroSPO]           = useState<string[]>([]);
  const [macroITBPs,         setMacroITBPs]         = useState<string[]>([]);
  const [macroVPs,           setMacroVPs]           = useState<string[]>([]);
  const [macroEtapas,        setMacroEtapas]        = useState<string[]>([]);
  const [macroLideres,       setMacroLideres]       = useState<string[]>([]);
  const [macroMotivos,       setMacroMotivos]       = useState<string[]>([]);
  const [isFilterPanelOpen,  setIsFilterPanelOpen]  = useState<boolean>(true);
  const [isVpDropdownOpen,   setIsVpDropdownOpen]   = useState<boolean>(false);

  // ---- Estado del popup de iniciativas standard ----
  const [popupFilters, setPopupFilters] = useState<Partial<FilterState> | null>(null);

  // ---- Estado del popup de iniciativas custom (fechas) ----
  const [popupCustomData, setPopupCustomData] = useState<PopupCustomData | null>(null);
  const [hiddenModalCols, setHiddenModalCols] = useState<Set<string>>(new Set());
  const [showModalColPicker, setShowModalColPicker] = useState(false);

  // ---- Filtros y búsqueda interactiva del Modal de Auditoría ----
  const [modalSearchQuery, setModalSearchQuery] = useState('');
  const [modalFilterAsigMonth, setModalFilterAsigMonth] = useState<string>('all');
  const [modalFilterInicioMonth, setModalFilterInicioMonth] = useState<string>('all');
  const [modalFilterFinMonth, setModalFilterFinMonth] = useState<string>('all');
  const [modalFilterMotivo, setModalFilterMotivo] = useState<string>('all');

  const DEFAULT_MODAL_COLS = [
    { id: 'id', label: 'ID' },
    { id: 'titulo', label: 'Título de la Iniciativa' },
    { id: 'it_bp', label: 'IT BP' },
    { id: 'vp_solicitante', label: 'VP Área Solicitante' },
    { id: 'solicitante', label: 'Solicitante' },
    { id: 'lider_dominio', label: 'Líder de Dominio' },
    { id: 'etapa_actual', label: 'Etapa Pipeline' },
    { id: 'fecha_asignacion', label: 'F. Asignación LD' },
    { id: 'fecha_inicio', label: 'F. Inicio' },
    { id: 'fecha_fin', label: 'F. Fin' },
    { id: 'motivo', label: 'Diagnóstico / Motivo' },
    { id: 'desfase', label: 'Desfase vs HOY' },
  ];

  const [modalColOrder, setModalColOrder] = useState<string[]>(() => DEFAULT_MODAL_COLS.map(c => c.id));
  const [draggingColId, setDraggingColId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);

  const reorderModalCols = (sourceId: string, targetId: string) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setModalColOrder(prev => {
      const next = [...prev];
      const sourceIdx = next.indexOf(sourceId);
      const targetIdx = next.indexOf(targetId);
      if (sourceIdx === -1 || targetIdx === -1) return prev;
      next.splice(sourceIdx, 1);
      next.splice(targetIdx, 0, sourceId);
      return next;
    });
  };

  const moveModalCol = (id: string, direction: 'up' | 'down') => {
    setModalColOrder(prev => {
      const next = [...prev];
      const idx = next.indexOf(id);
      if (idx === -1) return prev;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= next.length) return prev;
      const [removed] = next.splice(idx, 1);
      next.splice(targetIdx, 0, removed);
      return next;
    });
  };

  const resetModalColOrder = () => {
    setModalColOrder(DEFAULT_MODAL_COLS.map(c => c.id));
  };

  const toggleModalCol = (id: string) => {
    setHiddenModalCols(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (DEFAULT_MODAL_COLS.length - next.size > 1) {
          next.add(id);
        }
      }
      return next;
    });
  };

  const showAllModalCols = () => {
    setHiddenModalCols(new Set());
  };

  // Helper para extraer fechas de cualquier item del modal
  const getModalItemDates = (item: OutOfDateItem) => {
    const t = item.iniciativa;
    const asig = t.fecha_asignacion || null;
    let inicio: string | null = null;
    let fin: string | null = null;

    if (item.category === 'estimacion') {
      inicio = t.fecha_inicio_estimacion || null;
      fin = t.fecha_fin_estimacion || null;
    } else if (item.category === 'reestimacion') {
      inicio = t.fecha_inicio_reestimacion || null;
      fin = t.fecha_fin_reestimacion || null;
    } else if (item.category === 'planificacion') {
      inicio = t.fecha_inicio_planificada || null;
      fin = t.fecha_fin_planificada || null;
    } else {
      inicio = t.fecha_inicio_planificada || t.fecha_inicio_estimacion || null;
      fin = t.fecha_fin_planificada || t.fecha_fin_estimacion || null;
    }

    return { asig, inicio, fin };
  };

  // Helper para formatear etiqueta de mes
  const fmtMonthLabel = (yyyyMM: string): string => {
    try {
      const [y, m] = yyyyMM.split('-');
      const d = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
      const mName = format(d, 'MMM yyyy', { locale: es });
      return mName.charAt(0).toUpperCase() + mName.slice(1);
    } catch {
      return yyyyMM;
    }
  };

  // Opciones dinámicas de meses y motivos presentes en los datos del modal abierto
  const modalFilterOptions = useMemo(() => {
    if (!popupCustomData) {
      return { asigMonths: [], inicioMonths: [], finMonths: [], hasEmptyAsig: false, hasEmptyIni: false, hasEmptyFin: false, motivos: [] };
    }
    const asigSet = new Set<string>();
    const iniSet = new Set<string>();
    const finSet = new Set<string>();
    const motivoSet = new Set<string>();

    let hasEmptyAsig = false;
    let hasEmptyIni = false;
    let hasEmptyFin = false;

    popupCustomData.items.forEach(it => {
      const { asig, inicio, fin } = getModalItemDates(it);
      if (asig) {
        try { asigSet.add(format(parseISO(asig), 'yyyy-MM')); } catch {}
      } else {
        hasEmptyAsig = true;
      }
      if (inicio) {
        try { iniSet.add(format(parseISO(inicio), 'yyyy-MM')); } catch {}
      } else {
        hasEmptyIni = true;
      }
      if (fin) {
        try { finSet.add(format(parseISO(fin), 'yyyy-MM')); } catch {}
      } else {
        hasEmptyFin = true;
      }
      if (it.reason) motivoSet.add(it.reason);
    });

    return {
      asigMonths: Array.from(asigSet).sort(),
      inicioMonths: Array.from(iniSet).sort(),
      finMonths: Array.from(finSet).sort(),
      hasEmptyAsig,
      hasEmptyIni,
      hasEmptyFin,
      motivos: Array.from(motivoSet),
    };
  }, [popupCustomData]);

  // Filtro de items dentro del modal
  const filteredModalCustomItems = useMemo(() => {
    if (!popupCustomData) return [];
    let items = popupCustomData.items;

    // 1. Buscador global
    if (modalSearchQuery.trim()) {
      const q = modalSearchQuery.toLowerCase().trim();
      items = items.filter(it => {
        const t = it.iniciativa;
        const { asig, inicio, fin } = getModalItemDates(it);
        const asigStr = fmtDateShort(asig);
        const iniStr = fmtDateShort(inicio);
        const finStr = fmtDateShort(fin);
        return (
          String(t.id).includes(q) ||
          (t.titulo || '').toLowerCase().includes(q) ||
          (t.it_bp || '').toLowerCase().includes(q) ||
          (t.vp_solicitante || '').toLowerCase().includes(q) ||
          (t.usuario_negocio || '').toLowerCase().includes(q) ||
          (t.lider_dominio || '').toLowerCase().includes(q) ||
          (t.etapa_actual || '').toLowerCase().includes(q) ||
          (it.reason || '').toLowerCase().includes(q) ||
          asigStr.toLowerCase().includes(q) ||
          iniStr.toLowerCase().includes(q) ||
          finStr.toLowerCase().includes(q)
        );
      });
    }

    // 2. Filtro mes Asignación
    if (modalFilterAsigMonth !== 'all') {
      items = items.filter(it => {
        const { asig } = getModalItemDates(it);
        if (modalFilterAsigMonth === 'empty') return !asig;
        if (!asig) return false;
        try {
          return format(parseISO(asig), 'yyyy-MM') === modalFilterAsigMonth;
        } catch {
          return false;
        }
      });
    }

    // 3. Filtro mes Inicio
    if (modalFilterInicioMonth !== 'all') {
      items = items.filter(it => {
        const { inicio } = getModalItemDates(it);
        if (modalFilterInicioMonth === 'empty') return !inicio;
        if (!inicio) return false;
        try {
          return format(parseISO(inicio), 'yyyy-MM') === modalFilterInicioMonth;
        } catch {
          return false;
        }
      });
    }

    // 4. Filtro mes Fin
    if (modalFilterFinMonth !== 'all') {
      items = items.filter(it => {
        const { fin } = getModalItemDates(it);
        if (modalFilterFinMonth === 'empty') return !fin;
        if (!fin) return false;
        try {
          return format(parseISO(fin), 'yyyy-MM') === modalFilterFinMonth;
        } catch {
          return false;
        }
      });
    }

    // 5. Filtro Motivo
    if (modalFilterMotivo !== 'all') {
      items = items.filter(it => it.reason === modalFilterMotivo);
    }

    return items;
  }, [
    popupCustomData,
    modalSearchQuery,
    modalFilterAsigMonth,
    modalFilterInicioMonth,
    modalFilterFinMonth,
    modalFilterMotivo,
  ]);

  // ---- Estado de ordenamiento del modal popup custom (fechas) ----
  type ModalSortField =
    | 'id'
    | 'titulo'
    | 'it_bp'
    | 'vp_solicitante'
    | 'solicitante'
    | 'lider_dominio'
    | 'etapa_actual'
    | 'fecha_asignacion'
    | 'fecha_inicio'
    | 'fecha_fin'
    | 'motivo'
    | 'desfase';

  const [modalSortField, setModalSortField] = useState<ModalSortField>('desfase');
  const [modalSortDir, setModalSortDir] = useState<'asc' | 'desc'>('desc');

  const toggleModalSort = (field: ModalSortField) => {
    if (modalSortField === field) {
      setModalSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setModalSortField(field);
      setModalSortDir(field === 'desfase' ? 'desc' : 'asc');
    }
  };

  const sortedModalCustomItems = useMemo(() => {
    return [...filteredModalCustomItems].sort((a, b) => {
      const tA = a.iniciativa;
      const tB = b.iniciativa;
      const datesA = getModalItemDates(a);
      const datesB = getModalItemDates(b);

      let cmp = 0;
      switch (modalSortField) {
        case 'id':
          cmp = tA.id - tB.id;
          break;
        case 'titulo':
          cmp = (tA.titulo || '').localeCompare(tB.titulo || '', 'es');
          break;
        case 'it_bp':
          cmp = (tA.it_bp || '').localeCompare(tB.it_bp || '', 'es');
          break;
        case 'vp_solicitante':
          cmp = (tA.vp_solicitante || '').localeCompare(tB.vp_solicitante || '', 'es');
          break;
        case 'solicitante':
          cmp = (tA.usuario_negocio || '').localeCompare(tB.usuario_negocio || '', 'es');
          break;
        case 'lider_dominio':
          cmp = (tA.lider_dominio || '').localeCompare(tB.lider_dominio || '', 'es');
          break;
        case 'etapa_actual':
          cmp = (tA.etapa_actual || '').localeCompare(tB.etapa_actual || '', 'es');
          break;
        case 'fecha_asignacion':
          if (!datesA.asig && !datesB.asig) cmp = 0;
          else if (!datesA.asig) return 1;
          else if (!datesB.asig) return -1;
          else cmp = datesA.asig.localeCompare(datesB.asig);
          break;
        case 'fecha_inicio':
          if (!datesA.inicio && !datesB.inicio) cmp = 0;
          else if (!datesA.inicio) return 1;
          else if (!datesB.inicio) return -1;
          else cmp = datesA.inicio.localeCompare(datesB.inicio);
          break;
        case 'fecha_fin':
          if (!datesA.fin && !datesB.fin) cmp = 0;
          else if (!datesA.fin) return 1;
          else if (!datesB.fin) return -1;
          else cmp = datesA.fin.localeCompare(datesB.fin);
          break;
        case 'motivo':
          cmp = (a.reason || '').localeCompare(b.reason || '', 'es');
          break;
        case 'desfase':
          cmp = a.delayDays - b.delayDays;
          break;
        default:
          cmp = 0;
      }
      return modalSortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredModalCustomItems, modalSortField, modalSortDir]);

  // ---- Estado para ver detalle completo de la iniciativa (modal) ----
  const [detailModalIniciativa, setDetailModalIniciativa] = useState<Iniciativa | null>(null);

  // ---- Estado del reporte activo (null = Catálogo inicial de opciones) ----
  type ReportId = 'fuera_fecha' | 'pendientes_bp' | 'vp' | 'estados' | 'it_bp';
  const [selectedReport, setSelectedReport] = useState<ReportId | null>(null);

  // ---- Motivos únicos de auditoría de fechas ----
  const allMotivosOptions = useMemo(() => {
    const ref = new Date();
    const map = new Map<string, number>();
    iniciativas.forEach(i => {
      const resEst = checkFueraFechaEstimacion(i, ref);
      if (resEst.isOutOfDate && resEst.reason) map.set(resEst.reason, (map.get(resEst.reason) || 0) + 1);

      const resReest = checkFueraFechaReestimacion(i, ref);
      if (resReest.isOutOfDate && resReest.reason) map.set(resReest.reason, (map.get(resReest.reason) || 0) + 1);

      const resPlan = checkFueraFechaPlanificacion(i, ref);
      if (resPlan.isOutOfDate && resPlan.reason) map.set(resPlan.reason, (map.get(resPlan.reason) || 0) + 1);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([r]) => r);
  }, [iniciativas]);

  // ---- Opciones (de todo el dataset) ----
  const opts = useMemo(() => ({
    instituciones: buildMacroOptions(iniciativas, i => i.institucion),
    itBPs:         buildMacroOptions(iniciativas, i => i.it_bp),
    vps:           buildMacroOptions(iniciativas, i => i.vp_solicitante),
    etapas:        Array.from(new Set(iniciativas.map(i => i.etapa_actual))),
    lideres:       buildMacroOptions(iniciativas, i => i.lider_dominio),
    motivos:       allMotivosOptions,
  }), [iniciativas, allMotivosOptions]);

  // VP principal (con mayor volumen de iniciativas registradas)
  const primaryVp = useMemo(() => {
    if (opts.vps.length === 0) return null;
    const counts: Record<string, number> = {};
    iniciativas.forEach(i => {
      const v = i.vp_solicitante ? String(i.vp_solicitante).trim() : null;
      if (v && isMeaningfulValue(v)) counts[v] = (counts[v] || 0) + 1;
    });
    const validVps = opts.vps.filter(v => v !== EMPTY_SENTINEL);
    if (validVps.length === 0) return opts.vps[0] || null;
    return validVps.reduce(
      (prev, curr) => ((counts[curr] || 0) > (counts[prev] || 0) ? curr : prev),
      validVps[0]
    );
  }, [opts.vps, iniciativas]);

  // ---- Label para etapas en el dropdown ----
  const etapaLabel = (v: string) => ETAPAS_MAP.get(v as EtapaPipeline)?.label || ETAPAS_PLANIFICADAS_MAP.get(v as EtapaPipeline)?.label || v;

  // ---- Aplicar filtros macro ----
  const filtered = useMemo(() => {
    const ref = new Date();
    // En el reporte de VP, si macroVPs está vacío, no mostrar todo para evitar abrumar la vista
    if (selectedReport === 'vp' && macroVPs.length === 0) {
      return [];
    }
    return iniciativas.filter(i => {
      if (macroInstituciones.length && !macroInstituciones.includes(normalize(i.institucion))) return false;
      if (macroSPO.length           && !macroSPO.includes(normalize(i.proyecto_spo)))          return false;
      if (macroITBPs.length         && !macroITBPs.includes(normalize(i.it_bp)))               return false;
      if (macroVPs.length           && !macroVPs.includes(normalize(i.vp_solicitante)))         return false;
      if (macroEtapas.length        && !macroEtapas.includes(i.etapa_actual))                  return false;
      if (macroLideres.length       && !macroLideres.includes(normalize(i.lider_dominio)))      return false;
      if (macroMotivos.length) {
        const resEst = checkFueraFechaEstimacion(i, ref);
        const resReest = checkFueraFechaReestimacion(i, ref);
        const resPlan = checkFueraFechaPlanificacion(i, ref);
        const reasons = [
          resEst.isOutOfDate ? resEst.reason : null,
          resReest.isOutOfDate ? resReest.reason : null,
          resPlan.isOutOfDate ? resPlan.reason : null,
        ].filter(Boolean) as string[];
        const hasMatch = reasons.some(r => macroMotivos.includes(r));
        if (!hasMatch) return false;
      }
      return true;
    });
  }, [iniciativas, selectedReport, macroInstituciones, macroSPO, macroITBPs, macroVPs, macroEtapas, macroLideres, macroMotivos]);

  // ---- Métricas para las tarjetas del catálogo ----
  const fueraFechaMetrics = useMemo(() => {
    const refDate = new Date();
    let count = 0;
    for (const i of filtered) {
      if (
        checkFueraFechaEstimacion(i, refDate).isOutOfDate ||
        checkFueraFechaReestimacion(i, refDate).isOutOfDate ||
        checkFueraFechaPlanificacion(i, refDate).isOutOfDate
      ) {
        count++;
      }
    }
    return count;
  }, [filtered]);

  const vpsCount = useMemo(() => new Set(filtered.map(i => normalize(i.vp_solicitante)).filter(Boolean)).size, [filtered]);
  const etapasCount = useMemo(() => new Set(filtered.map(i => i.etapa_actual)).size, [filtered]);
  const itbpsCount = useMemo(() => new Set(filtered.map(i => normalize(i.it_bp)).filter(Boolean)).size, [filtered]);

  const pendientesBPMetrics = useMemo(() => {
    let count = 0;
    for (const i of filtered) {
      if (
        (i.etapa_actual === 'por_aprobar_estimacion' && !isAffirmative(i.aprobar_estimacion)) ||
        (i.etapa_actual === 'por_habilitar_presupuesto' && !isAffirmative(i.presupuesto_habilitado)) ||
        (i.etapa_actual === 'aprobar_planificacion' && !isAffirmative(i.planificacion_aprobada))
      ) {
        count++;
      }
    }
    return count;
  }, [filtered]);

  // ---- Catálogo de opciones de reportes ----
  const reportCatalog = useMemo(() => [
    ...(mode === 'demanda' ? [{
      id: 'fuera_fecha' as ReportId,
      title: 'Control de Fechas por Líder de Dominio',
      subtitle: 'Estimaciones, Re-estimaciones y Planificaciones fuera de fecha vs HOY',
      category: 'Auditoría de Plazos TI',
      icon: <AlertTriangle size={24} style={{ color: '#ef4444' }} />,
      iconBg: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
      borderColor: '#fecaca',
      hoverBorder: '#ef4444',
      badgeBg: '#fef2f2',
      badgeText: '#ef4444',
      badgeBorder: '#fecaca',
      badgeLabel: 'Auditoría de Fechas',
      metricValue: `${fueraFechaMetrics} iniciativas`,
      metricLabel: 'con desfase a fecha de hoy',
      metricHighlight: fueraFechaMetrics > 0,
      accentColor: '#ef4444',
      description: 'Detecta y audita plazos vencidos en iniciativas por líder de dominio en etapas de Estimación, Re-estimación y Planificación comparadas directamente contra HOY.',
    },
    {
      id: 'pendientes_bp' as ReportId,
      title: 'Control de Pendientes por IT BP',
      subtitle: 'Aprobaciones de estimación, habilitación de presupuesto y aprobación de planificación',
      category: 'Aprobaciones y Gestión BP',
      icon: <UserCheck size={24} style={{ color: '#8b5cf6' }} />,
      iconBg: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
      borderColor: '#ddd6fe',
      hoverBorder: '#8b5cf6',
      badgeBg: '#f5f3ff',
      badgeText: '#8b5cf6',
      badgeBorder: '#ddd6fe',
      badgeLabel: 'Pendientes BP TI',
      metricValue: `${pendientesBPMetrics} pendientes`,
      metricLabel: 'esperando acción de IT BPs',
      metricHighlight: pendientesBPMetrics > 0,
      accentColor: '#8b5cf6',
      description: 'Monitorea las iniciativas que requieren aprobación de estimación, habilitación de presupuesto o aprobación final de planificación por parte de los Business Partners TI.',
    }] : []),
    {
      id: 'vp' as ReportId,
      title: 'Reporte por VP del Área Solicitante',
      subtitle: 'Distribución y volumen por Vicepresidencias y etapas',
      category: 'Estructura Organizacional',
      icon: <Building2 size={24} style={{ color: '#2563eb' }} />,
      iconBg: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
      borderColor: '#bfdbfe',
      hoverBorder: '#2563eb',
      badgeBg: '#eff6ff',
      badgeText: '#2563eb',
      badgeBorder: '#bfdbfe',
      badgeLabel: 'Vicepresidencias',
      metricValue: `${vpsCount} VPs`,
      metricLabel: 'solicitantes con iniciativas',
      metricHighlight: false,
      accentColor: '#2563eb',
      description: 'Visualiza la demanda agrupada por Vicepresidencia, permitiendo explorar iniciativas por estado, líderes responsables y áreas solicitantes.',
    },
    {
      id: 'estados' as ReportId,
      title: 'Reporte por Estado (Etapa Pipeline)',
      subtitle: 'Conteo y porcentaje en cada fase del flujo de demanda',
      category: 'Flujo de Demanda',
      icon: <Layers size={24} style={{ color: '#7c3aed' }} />,
      iconBg: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
      borderColor: '#ddd6fe',
      hoverBorder: '#7c3aed',
      badgeBg: '#f5f3ff',
      badgeText: '#7c3aed',
      badgeBorder: '#ddd6fe',
      badgeLabel: 'Pipeline TI',
      metricValue: `${etapasCount} etapas`,
      metricLabel: 'con iniciativas en curso',
      metricHighlight: false,
      accentColor: '#7c3aed',
      description: 'Gráfico y tabla analítica con el estado actual de todas las iniciativas, porcentajes de avance y distribución a lo largo del pipeline.',
    },
    {
      id: 'it_bp' as ReportId,
      title: 'Reporte por IT BP (Business Partner)',
      subtitle: 'Carga de trabajo y balance de iniciativas por IT BP',
      category: 'Gestión TI',
      icon: <BarChart2 size={24} style={{ color: '#059669' }} />,
      iconBg: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
      borderColor: '#a7f3d0',
      hoverBorder: '#059669',
      badgeBg: '#ecfdf5',
      badgeText: '#059669',
      badgeBorder: '#a7f3d0',
      badgeLabel: 'Business Partners',
      metricValue: `${itbpsCount} IT BPs`,
      metricLabel: 'con asignaciones activas',
      metricHighlight: false,
      accentColor: '#059669',
      description: 'Analiza la carga de trabajo por IT Business Partner, seguimiento de proyectos SPO y detalle de iniciativas gestionadas.',
    },
  ], [mode, fueraFechaMetrics, pendientesBPMetrics, vpsCount, etapasCount, itbpsCount]);

  // ---- Filtrar iniciativas del popup estándar ----
  const popupIniciativas = useMemo(() => {
    if (!popupFilters) return [];
    return iniciativas.filter(i => {
      if (popupFilters.instituciones?.length && !popupFilters.instituciones.includes(normalize(i.institucion))) return false;
      if (popupFilters.proyecto_spo?.length && !popupFilters.proyecto_spo.includes(normalize(i.proyecto_spo))) return false;
      if (popupFilters.it_bps?.length && !popupFilters.it_bps.includes(normalize(i.it_bp))) return false;
      if (popupFilters.vp_solicitantes?.length && !popupFilters.vp_solicitantes.includes(normalize(i.vp_solicitante))) return false;
      if (popupFilters.etapas?.length && !popupFilters.etapas.includes(i.etapa_actual)) return false;
      if (popupFilters.lideres_dominio?.length && !popupFilters.lideres_dominio.includes(normalize(i.lider_dominio))) return false;
      return true;
    });
  }, [iniciativas, popupFilters]);

  const macro: MacroFilters = {
    instituciones:   macroInstituciones,
    proyecto_spo:    macroSPO,
    it_bps:          macroITBPs,
    vp_solicitantes: macroVPs,
    etapas:          macroEtapas,
    lideres_dominio: macroLideres,
  };

  const totalActive =
    macroInstituciones.length + macroSPO.length +
    macroITBPs.length + macroVPs.length +
    macroEtapas.length + macroLideres.length +
    macroMotivos.length;

  const clearAll = () => {
    setMacroInstituciones([]);
    setMacroSPO([]);
    setMacroITBPs([]);
    setMacroVPs([]);
    setMacroEtapas([]);
    setMacroLideres([]);
    setMacroMotivos([]);
  };

  const isExportDisabled = filtered.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ================================================================
          BARRA DE NAVEGACIÓN Y SELECCIÓN DE REPORTE (SOLO CON REPORTE ACTIVO)
      ================================================================ */}
      {selectedReport !== null ? (
        <>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '12px 18px',
              backgroundColor: '#ffffff',
              borderRadius: 14,
              border: '1px solid #e2e8f0',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
            }}
          >
            {/* Botón Volver al catálogo */}
            <button
              type="button"
              onClick={() => startTransition(() => setSelectedReport(null))}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                backgroundColor: '#f8fafc',
                color: '#334155',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                transition: 'all 0.15s ease',
              }}
              onMouseOver={e => {
                e.currentTarget.style.backgroundColor = '#f1f5f9';
                e.currentTarget.style.borderColor = '#94a3b8';
              }}
              onMouseOut={e => {
                e.currentTarget.style.backgroundColor = '#f8fafc';
                e.currentTarget.style.borderColor = '#cbd5e1';
              }}
            >
              <ArrowLeft size={15} style={{ color: '#64748b' }} />
              <span>Volver a opciones de reportes</span>
            </button>

            {/* Selector rápido entre reportes */}
            <div
              style={{
                display: 'inline-flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 6,
                background: '#f1f5f9',
                padding: 4,
                borderRadius: 10,
              }}
            >
              {reportCatalog.map(opt => {
                const isSelected = selectedReport === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      if (opt.id === 'vp') {
                        setMacroVPs([]);
                      }
                      startTransition(() => setSelectedReport(opt.id));
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      borderRadius: 7,
                      border: 'none',
                      fontSize: 11,
                      fontWeight: isSelected ? 700 : 500,
                      cursor: 'pointer',
                      backgroundColor: isSelected ? '#ffffff' : 'transparent',
                      color: isSelected ? '#0f172a' : '#64748b',
                      boxShadow: isSelected ? '0 2px 4px rgba(0,0,0,0.06)' : 'none',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center' }}>
                      {React.cloneElement(opt.icon as React.ReactElement<{ size?: number }>, { size: 14 })}
                    </span>
                    <span>{opt.badgeLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ================================================================
              PANEL FIJO (STICKY TOP 0) DE FILTROS DEL REPORTE
          ================================================================ */}
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 45,
              borderRadius: isFilterPanelOpen ? 12 : 10,
              background: '#ffffff',
              boxShadow: '0 6px 22px rgba(0, 0, 0, 0.10)',
              border: '1px solid #cbd5e1',
              overflow: 'visible',
              marginBottom: 12,
            }}
          >
                {/* Cabecera del panel */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '9px 18px',
                    borderBottom: isFilterPanelOpen ? '1px solid #f1f5f9' : 'none',
                    background: 'linear-gradient(to right, #f8fafc, #ffffff)',
                    borderRadius: isFilterPanelOpen ? '12px 12px 0 0' : '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Filter size={14} style={{ color: '#2563eb' }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>Filtros del Reporte</span>
                    {totalActive > 0 && (
                      <span style={{
                        background: '#eff6ff', color: '#1d4ed8',
                        fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                        border: '1px solid #bfdbfe',
                      }}>
                        {totalActive} activo{totalActive !== 1 ? 's' : ''}
                      </span>
                    )}

                    {/* Botón Plegar / Desplegar panel de filtros */}
                    <button
                      type="button"
                      onClick={() => setIsFilterPanelOpen(prev => !prev)}
                      title={isFilterPanelOpen ? 'Plegar filtros para ganar espacio vertical' : 'Desplegar filtros'}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 8px',
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                        background: '#f8fafc',
                        fontSize: 10,
                        fontWeight: 600,
                        color: '#475569',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseOver={e => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                      onMouseOut={e => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                    >
                      <span>{isFilterPanelOpen ? 'Plegar' : 'Desplegar'}</span>
                      <ChevronDown
                        size={11}
                        style={{
                          transform: isFilterPanelOpen ? 'rotate(180deg)' : 'none',
                          transition: 'transform 0.15s ease',
                        }}
                      />
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Resumen de iniciativas */}
                    <span style={{ fontSize: 11, color: '#64748b' }}>
                      <strong style={{ color: '#0f172a' }}>{filtered.length}</strong>
                      <span style={{ opacity: 0.8 }}> / {iniciativas.length}</span>
                      <span style={{ marginLeft: 4 }}>iniciativas</span>
                    </span>

                    {/* BOTÓN ÚNICO DE EXPORTACIÓN HTML */}
                    <button
                      type="button"
                      onClick={() => exportReportToHTML(
                        filtered,
                        macroVPs,
                        macro,
                        `Reporte_Demanda_TI_${selectedReport || 'General'}`
                      )}
                      disabled={isExportDisabled}
                      title={isExportDisabled ? 'Selecciona al menos una vicepresidencia para exportar' : 'Exportar resultado filtrado actual en un archivo HTML independiente'}
                      style={{
                        fontSize: 11,
                        color: isExportDisabled ? '#94a3b8' : '#ffffff',
                        fontWeight: 700,
                        background: isExportDisabled ? '#f1f5f9' : '#0284c7',
                        border: isExportDisabled ? '1px solid #cbd5e1' : 'none',
                        borderRadius: 7,
                        padding: '5px 12px',
                        cursor: isExportDisabled ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        boxShadow: isExportDisabled ? 'none' : '0 1px 3px rgba(2, 132, 199, 0.3)',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseOver={e => {
                        if (!isExportDisabled) e.currentTarget.style.backgroundColor = '#0369a1';
                      }}
                      onMouseOut={e => {
                        if (!isExportDisabled) e.currentTarget.style.backgroundColor = '#0284c7';
                      }}
                    >
                      <Download size={13} />
                      <span>Exportar en HTML</span>
                    </button>

                    {totalActive > 0 && (
                      <button
                        onClick={clearAll}
                        style={{
                          fontSize: 10, color: '#ef4444', fontWeight: 700,
                          background: '#fff1f2',
                          border: '1px solid #fecaca',
                          borderRadius: 7, padding: '4px 10px', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s',
                        }}
                        onMouseOver={e => (e.currentTarget.style.backgroundColor = '#fee2e2')}
                        onMouseOut={e => (e.currentTarget.style.backgroundColor = '#fff1f2')}
                      >
                        <X size={10} /> Limpiar filtros
                      </button>
                    )}
                  </div>
                </div>

            {/* Grid de filtros (plegable) */}
            {isFilterPanelOpen && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))',
                  gap: '10px 14px',
                  padding: '12px 18px 14px',
                }}
              >
                {/* Institución */}
                <MacroMultiSelect
                  label="Institución"
                  options={opts.instituciones}
                  selected={macroInstituciones}
                  onChange={setMacroInstituciones}
                  icon={<Building2 size={10} />}
                />

                {/* IT BP */}
                <MacroMultiSelect
                  label="IT BP"
                  options={opts.itBPs}
                  selected={macroITBPs}
                  onChange={setMacroITBPs}
                  icon={<UserCog size={10} />}
                />

                {/* VP Solicitante */}
                <MacroMultiSelect
                  label="VP Solicitante"
                  options={opts.vps}
                  selected={macroVPs}
                  onChange={setMacroVPs}
                  icon={<UserCheck size={10} />}
                  placeholder={selectedReport === 'vp' ? 'Selecciona VP...' : 'Todos'}
                  isOpen={isVpDropdownOpen}
                  onOpenChange={setIsVpDropdownOpen}
                />

                {/* Estado (Etapa) */}
                <MacroMultiSelect
                  label="Estado"
                  options={opts.etapas}
                  selected={macroEtapas}
                  onChange={setMacroEtapas}
                  labelFn={etapaLabel}
                  icon={<GitBranch size={10} />}
                />

                {/* Líder de Dominio */}
                <MacroMultiSelect
                  label="Líder de Dominio"
                  options={opts.lideres}
                  selected={macroLideres}
                  onChange={setMacroLideres}
                  icon={<Users size={10} />}
                />

                {/* Motivo / Diagnóstico */}
                {selectedReport === 'fuera_fecha' && (
                  <MacroMultiSelect
                    label="Motivo / Diagnóstico"
                    options={opts.motivos}
                    selected={macroMotivos}
                    onChange={setMacroMotivos}
                    icon={<AlertTriangle size={10} />}
                    isMotivoSelect={true}
                  />
                )}

                {/* Proyecto SPO */}
                <SpoToggle selected={macroSPO} onChange={setMacroSPO} />
              </div>
            )}
          </div>
        </>
      ) : (
        /* ================================================================
            CATÁLOGO INICIAL DE OPCIONES DE REPORTES
        ================================================================ */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>
                Catálogo de Reportes y Analítica
              </h3>
              <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0 0' }}>
                Selecciona una de las opciones a continuación para abrir el reporte completo e interactivo con gráficos, tablas y auditorías.
              </p>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '4px 10px', borderRadius: 20 }}>
              {reportCatalog.length} reportes disponibles
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {reportCatalog.map(opt => (
              <div
                key={opt.id}
                onClick={() => {
                  if (opt.id === 'vp') {
                    setMacroVPs([]);
                  }
                  startTransition(() => setSelectedReport(opt.id));
                }}
                style={{
                  backgroundColor: '#ffffff',
                  border: `1px solid ${opt.borderColor}`,
                  borderRadius: 16,
                  padding: '20px 22px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 16,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  position: 'relative',
                  overflow: 'hidden',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-3px)';
                  e.currentTarget.style.boxShadow = '0 12px 24px -4px rgba(0, 0, 0, 0.08)';
                  e.currentTarget.style.borderColor = opt.hoverBorder;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.03)';
                  e.currentTarget.style.borderColor = opt.borderColor;
                }}
              >
                <div>
                  {/* Top Category & Icon */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div
                      style={{
                        width: 46,
                        height: 46,
                        borderRadius: 12,
                        background: opt.iconBg,
                        border: `1px solid ${opt.borderColor}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {opt.icon}
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '3px 10px',
                        borderRadius: 20,
                        backgroundColor: opt.badgeBg,
                        color: opt.badgeText,
                        border: `1px solid ${opt.badgeBorder}`,
                      }}
                    >
                      {opt.badgeLabel}
                    </span>
                  </div>

                  {/* Title & Subtitle */}
                  <h4 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>
                    {opt.title}
                  </h4>
                  <p style={{ fontSize: 12, color: '#64748b', margin: 0, lineHeight: 1.45 }}>
                    {opt.description}
                  </p>
                </div>

                {/* Bottom Metric & Action Button */}
                <div
                  style={{
                    paddingTop: 14,
                    borderTop: '1px solid #f1f5f9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: opt.accentColor }}>
                      {opt.metricValue}
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>
                      {opt.metricLabel}
                    </div>
                  </div>

                  <button
                    type="button"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#ffffff',
                      backgroundColor: opt.accentColor,
                      border: 'none',
                      borderRadius: 8,
                      padding: '7px 14px',
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                      transition: 'opacity 0.15s',
                    }}
                    onMouseOver={e => (e.currentTarget.style.opacity = '0.9')}
                    onMouseOut={e => (e.currentTarget.style.opacity = '1')}
                  >
                    Abrir Reporte →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================================================================
          RENDERIZADO CONDICIONAL DEL REPORTE SELECCIONADO
      ================================================================ */}

      {/* REPORTE 1: CONTROL DE FECHAS POR LÍDER DE DOMINIO */}
      {selectedReport === 'fuera_fecha' && mode === 'demanda' && (
        <ReportCard
          title="Líderes de Dominio Fuera de Fechas (Planificación, Estimación y Re-estimación)"
          icon={<AlertTriangle size={18} style={{ color: '#f97316' }} />}
          badge={
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 20,
                background: '#fef2f2',
                color: '#ef4444',
                border: '1px solid #fecaca',
              }}
            >
              Auditoría de Fechas
            </span>
          }
        >
          <ReporteLideresFueraFecha
            iniciativas={filtered}
            onOpenCustomPopup={setPopupCustomData}
          />
        </ReportCard>
      )}

      {/* REPORTE: CONTROL DE PENDIENTES POR IT BP */}
      {selectedReport === 'pendientes_bp' && mode === 'demanda' && (
        <ReportCard
          title="Control de Pendientes por IT BP (Aprobaciones y Habilitación de Presupuesto)"
          icon={<UserCheck size={18} style={{ color: '#8b5cf6' }} />}
          badge={
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 20,
                background: '#f5f3ff',
                color: '#8b5cf6',
                border: '1px solid #ddd6fe',
              }}
            >
              Aprobaciones Pendientes
            </span>
          }
        >
          <ReportePendientesBP
            iniciativas={filtered}
            onNavigate={setPopupFilters}
            macro={macro}
            onOpenDetailModal={setDetailModalIniciativa}
          />
        </ReportCard>
      )}

      {/* REPORTE 2: POR VP DEL ÁREA SOLICITANTE */}
      {selectedReport === 'vp' && (
        <ReportCard title="Reporte por VP del Área Solicitante" icon={<Users size={18} />}>
          <ReporteVP
            iniciativas={filtered}
            onNavigate={setPopupFilters}
            macro={macro}
            onOpenDetailModal={setDetailModalIniciativa}
            onOpenVPSelector={() => {
              setIsFilterPanelOpen(true);
              setIsVpDropdownOpen(true);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </ReportCard>
      )}

      {/* REPORTE 3: POR ESTADO (ETAPA DEL PIPELINE) */}
      {selectedReport === 'estados' && (
        <ReportCard title="Reporte por Estado (Etapa del Pipeline)" icon={<Layers size={18} />}>
          <ReporteEstados iniciativas={filtered} onNavigate={setPopupFilters} macro={macro} />
        </ReportCard>
      )}

      {/* REPORTE 4: POR IT BP */}
      {selectedReport === 'it_bp' && (
        <ReportCard title="Reporte por IT BP" icon={<BarChart2 size={18} />}>
          <ReporteITBP iniciativas={filtered} onNavigate={setPopupFilters} macro={macro} />
        </ReportCard>
      )}

      {/* ================================================================
          MODAL POPUP: DETALLE DE INICIATIVAS FUERA DE FECHAS (CUSTOM)
      ================================================================ */}
      {popupCustomData && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(8px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setPopupCustomData(null)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 16,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.05)',
              width: '96vw',
              maxWidth: 1650,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              border: '1px solid #e2e8f0',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                padding: '16px 24px',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'linear-gradient(to right, #f8fafc, #ffffff)',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={18} style={{ color: '#f97316' }} />
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>
                    {popupCustomData.title}
                  </h3>
                </div>
                <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0 0' }}>
                  {popupCustomData.subtitle} ({sortedModalCustomItems.length === popupCustomData.items.length ? `${popupCustomData.items.length} iniciativas` : `mostrando ${sortedModalCustomItems.length} de ${popupCustomData.items.length} iniciativas`})
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {/* Search box */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Search size={12} style={{ position: 'absolute', left: 8, color: '#94a3b8', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    placeholder="Buscar en resultados..."
                    value={modalSearchQuery}
                    onChange={e => setModalSearchQuery(e.target.value)}
                    style={{
                      padding: '5px 24px 5px 26px',
                      fontSize: 11,
                      borderRadius: 6,
                      border: '1px solid #cbd5e1',
                      outline: 'none',
                      width: 160,
                      color: '#1e293b',
                      background: '#fff',
                    }}
                  />
                  {modalSearchQuery && (
                    <button
                      onClick={() => setModalSearchQuery('')}
                      style={{
                        position: 'absolute',
                        right: 6,
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        color: '#94a3b8',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      title="Limpiar búsqueda"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>

                {/* Reset filters button */}
                {(Boolean(modalSearchQuery.trim()) || modalFilterAsigMonth !== 'all' || modalFilterInicioMonth !== 'all' || modalFilterFinMonth !== 'all' || modalFilterMotivo !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setModalSearchQuery('');
                      setModalFilterAsigMonth('all');
                      setModalFilterInicioMonth('all');
                      setModalFilterFinMonth('all');
                      setModalFilterMotivo('all');
                    }}
                    style={{
                      fontSize: 10,
                      color: '#ef4444',
                      fontWeight: 700,
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: 6,
                      padding: '4px 8px',
                      cursor: 'pointer',
                    }}
                    title="Restablecer todos los filtros del modal"
                  >
                    Limpiar filtros
                  </button>
                )}

                {/* Sort selector toolbar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f8fafc', padding: '3px 8px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Ordenar por:</span>
                  <select
                    value={modalSortField}
                    onChange={e => setModalSortField(e.target.value as ModalSortField)}
                    style={{
                      fontSize: 11,
                      padding: '3px 8px',
                      borderRadius: 6,
                      border: '1px solid #cbd5e1',
                      background: '#fff',
                      color: '#1e293b',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="desfase">Desfase (días)</option>
                    <option value="id">ID</option>
                    <option value="titulo">Título de la Iniciativa</option>
                    <option value="it_bp">IT BP</option>
                    <option value="vp_solicitante">VP Área Solicitante</option>
                    <option value="solicitante">Solicitante</option>
                    <option value="lider_dominio">Líder de Dominio</option>
                    <option value="etapa_actual">Etapa Pipeline</option>
                    <option value="fecha_asignacion">F. Asignación LD</option>
                    <option value="fecha_inicio">Fecha de Inicio</option>
                    <option value="fecha_fin">Fecha de Fin</option>
                    <option value="motivo">Diagnóstico / Motivo</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setModalSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: 6,
                      border: '1px solid #cbd5e1',
                      background: '#fff',
                      color: '#2563eb',
                      cursor: 'pointer',
                    }}
                    title={modalSortDir === 'asc' ? 'Orden Ascendente (clic para cambiar a Descendente)' : 'Orden Descendente (clic para cambiar a Ascendente)'}
                  >
                    {modalSortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
                  </button>
                </div>

                {/* Columnas selector */}
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => setShowModalColPicker(prev => !prev)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      color: hiddenModalCols.size > 0 ? '#2563eb' : '#475569',
                      background: hiddenModalCols.size > 0 ? '#eff6ff' : '#fff',
                      border: hiddenModalCols.size > 0 ? '1px solid #bfdbfe' : '1px solid #cbd5e1',
                      borderRadius: 6,
                      padding: '4px 10px',
                      cursor: 'pointer',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                    }}
                    title="Ocultar / Mostrar y reordenar columnas del modal"
                  >
                    <Columns3 size={13} style={{ color: hiddenModalCols.size > 0 ? '#2563eb' : '#64748b' }} />
                    <span>Columnas ({DEFAULT_MODAL_COLS.length - hiddenModalCols.size}/{DEFAULT_MODAL_COLS.length})</span>
                    <ChevronDown size={11} />
                  </button>

                  {showModalColPicker && (
                    <>
                      <div
                        style={{ position: 'fixed', inset: 0, zIndex: 10000 }}
                        onClick={() => setShowModalColPicker(false)}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          right: 0,
                          marginTop: 4,
                          width: 260,
                          background: '#fff',
                          border: '1px solid #e2e8f0',
                          borderRadius: 10,
                          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.1)',
                          zIndex: 10001,
                          padding: 10,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 6, marginBottom: 6, borderBottom: '1px solid #f1f5f9' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#1e293b' }}>Columnas & Orden</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <button
                              type="button"
                              onClick={resetModalColOrder}
                              style={{ fontSize: 10, color: '#64748b', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                              title="Restablecer orden predeterminado"
                            >
                              Restablecer
                            </button>
                            {hiddenModalCols.size > 0 && (
                              <button
                                type="button"
                                onClick={showAllModalCols}
                                style={{ fontSize: 10, color: '#2563eb', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                              >
                                Ver todas
                              </button>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 250, overflowY: 'auto' }}>
                          {modalColOrder.map((colId, idx) => {
                            const col = DEFAULT_MODAL_COLS.find(c => c.id === colId);
                            if (!col) return null;
                            const isVis = !hiddenModalCols.has(col.id);
                            return (
                              <div
                                key={col.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '4px 6px',
                                  borderRadius: 6,
                                  fontSize: 11,
                                  background: isVis ? '#ffffff' : '#f8fafc',
                                  border: '1px solid #f1f5f9',
                                }}
                              >
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', flex: 1, minWidth: 0 }}>
                                  <input
                                    type="checkbox"
                                    checked={isVis}
                                    onChange={() => toggleModalCol(col.id)}
                                    style={{ cursor: 'pointer', accentColor: '#2563eb' }}
                                  />
                                  <span style={{ color: isVis ? '#1e293b' : '#94a3b8', textDecoration: isVis ? 'none' : 'line-through', fontWeight: isVis ? 500 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {col.label}
                                  </span>
                                </label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                  <button
                                    type="button"
                                    disabled={idx === 0}
                                    onClick={() => moveModalCol(col.id, 'up')}
                                    style={{
                                      border: '1px solid #e2e8f0',
                                      background: idx === 0 ? '#f8fafc' : '#ffffff',
                                      borderRadius: 4,
                                      cursor: idx === 0 ? 'not-allowed' : 'pointer',
                                      opacity: idx === 0 ? 0.3 : 0.85,
                                      padding: '1px 5px',
                                      fontSize: 9,
                                      color: '#475569',
                                    }}
                                    title="Mover columna a la izquierda"
                                  >
                                    ▲
                                  </button>
                                  <button
                                    type="button"
                                    disabled={idx === modalColOrder.length - 1}
                                    onClick={() => moveModalCol(col.id, 'down')}
                                    style={{
                                      border: '1px solid #e2e8f0',
                                      background: idx === modalColOrder.length - 1 ? '#f8fafc' : '#ffffff',
                                      borderRadius: 4,
                                      cursor: idx === modalColOrder.length - 1 ? 'not-allowed' : 'pointer',
                                      opacity: idx === modalColOrder.length - 1 ? 0.3 : 0.85,
                                      padding: '1px 5px',
                                      fontSize: 9,
                                      color: '#475569',
                                    }}
                                    title="Mover columna a la derecha"
                                  >
                                    ▼
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ paddingTop: 6, marginTop: 6, borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: '#94a3b8' }}>
                          <span>Tip: También puedes arrastrar encabezados</span>
                          <button
                            type="button"
                            onClick={() => setShowModalColPicker(false)}
                            style={{ fontSize: 10, background: '#f1f5f9', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', color: '#475569', fontWeight: 600 }}
                          >
                            Cerrar
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <button
                  onClick={() => setPopupCustomData(null)}
                  style={{
                    background: '#f1f5f9',
                    border: 'none',
                    borderRadius: '50%',
                    width: 32,
                    height: 32,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: '#64748b',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseOver={e => (e.currentTarget.style.backgroundColor = '#e2e8f0')}
                  onMouseOut={e => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Content List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px' }}>
              {sortedModalCustomItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                  No se encontraron iniciativas con los filtros aplicados en esta selección.
                </div>
              ) : (
                <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: '#475569', background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ padding: '8px 6px', width: 34, textAlign: 'center', verticalAlign: 'middle', borderRight: '1px solid #e2e8f0' }} title="Ver detalle">
                          <Eye size={13} style={{ color: '#94a3b8', margin: '0 auto' }} />
                        </th>
                        {modalColOrder.map(colId => {
                          if (hiddenModalCols.has(colId)) return null;
                          const isDragging = draggingColId === colId;
                          const isDragOver = dragOverColId === colId;

                          const baseThStyle: React.CSSProperties = {
                            padding: '6px 8px',
                            whiteSpace: 'nowrap',
                            userSelect: 'none',
                            verticalAlign: 'top',
                            fontSize: 11,
                            fontWeight: 600,
                            color: '#475569',
                            backgroundColor: isDragOver ? '#dbeafe' : isDragging ? '#f1f5f9' : '#f8fafc',
                            borderRight: isDragOver ? '2px solid #2563eb' : '1px solid #e2e8f0',
                            cursor: 'grab',
                            transition: 'background-color 0.15s',
                            opacity: isDragging ? 0.4 : 1,
                          };

                          const dragHandlers = {
                            draggable: true,
                            onDragStart: (e: React.DragEvent) => {
                              e.dataTransfer.setData('text/plain', colId);
                              e.dataTransfer.effectAllowed = 'move';
                              setDraggingColId(colId);
                            },
                            onDragOver: (e: React.DragEvent) => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'move';
                              if (dragOverColId !== colId) setDragOverColId(colId);
                            },
                            onDragLeave: () => {
                              if (dragOverColId === colId) setDragOverColId(null);
                            },
                            onDrop: (e: React.DragEvent) => {
                              e.preventDefault();
                              const srcId = e.dataTransfer.getData('text/plain') || draggingColId;
                              if (srcId && srcId !== colId) {
                                reorderModalCols(srcId, colId);
                              }
                              setDraggingColId(null);
                              setDragOverColId(null);
                            },
                            onDragEnd: () => {
                              setDraggingColId(null);
                              setDragOverColId(null);
                            },
                          };

                          const dragHandle = (
                            <span style={{ display: 'inline-flex', alignItems: 'center', opacity: 0.35, cursor: 'grab', marginRight: 2 }} title="Arrastrar para mover columna">
                              <GripVertical size={11} />
                            </span>
                          );

                          switch (colId) {
                            case 'id':
                              return (
                                <th key="id" {...dragHandlers} style={{ ...baseThStyle, minWidth: 60, textAlign: 'center' }} title="Arrastra para mover / Clic para ordenar">
                                  <div onClick={() => toggleModalSort('id')} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3, cursor: 'pointer', color: modalSortField === 'id' ? '#2563eb' : '#475569' }}>
                                    {dragHandle}
                                    <span>ID</span>
                                    {modalSortField === 'id' ? (
                                      modalSortDir === 'asc' ? <ChevronUp size={12} style={{ color: '#2563eb' }} /> : <ChevronDown size={12} style={{ color: '#2563eb' }} />
                                    ) : (
                                      <ChevronRight size={11} style={{ opacity: 0.3, transform: 'rotate(90deg)' }} />
                                    )}
                                  </div>
                                </th>
                              );
                            case 'titulo':
                              return (
                                <th key="titulo" {...dragHandlers} style={{ ...baseThStyle, minWidth: 200, maxWidth: 300, textAlign: 'left' }} title="Arrastra para mover / Clic para ordenar">
                                  <div onClick={() => toggleModalSort('titulo')} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'pointer', color: modalSortField === 'titulo' ? '#2563eb' : '#475569' }}>
                                    {dragHandle}
                                    <span>Título de la Iniciativa</span>
                                    {modalSortField === 'titulo' ? (
                                      modalSortDir === 'asc' ? <ChevronUp size={12} style={{ color: '#2563eb' }} /> : <ChevronDown size={12} style={{ color: '#2563eb' }} />
                                    ) : (
                                      <ChevronRight size={11} style={{ opacity: 0.3, transform: 'rotate(90deg)' }} />
                                    )}
                                  </div>
                                </th>
                              );
                            case 'it_bp':
                              return (
                                <th key="it_bp" {...dragHandlers} style={{ ...baseThStyle, minWidth: 90, textAlign: 'left' }} title="Arrastra para mover / Clic para ordenar">
                                  <div onClick={() => toggleModalSort('it_bp')} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'pointer', color: modalSortField === 'it_bp' ? '#2563eb' : '#475569' }}>
                                    {dragHandle}
                                    <span>IT BP</span>
                                    {modalSortField === 'it_bp' ? (
                                      modalSortDir === 'asc' ? <ChevronUp size={12} style={{ color: '#2563eb' }} /> : <ChevronDown size={12} style={{ color: '#2563eb' }} />
                                    ) : (
                                      <ChevronRight size={11} style={{ opacity: 0.3, transform: 'rotate(90deg)' }} />
                                    )}
                                  </div>
                                </th>
                              );
                            case 'vp_solicitante':
                              return (
                                <th key="vp_solicitante" {...dragHandlers} style={{ ...baseThStyle, minWidth: 120, textAlign: 'left' }} title="Arrastra para mover / Clic para ordenar">
                                  <div onClick={() => toggleModalSort('vp_solicitante')} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'pointer', color: modalSortField === 'vp_solicitante' ? '#2563eb' : '#475569' }}>
                                    {dragHandle}
                                    <span>VP Área Solicitante</span>
                                    {modalSortField === 'vp_solicitante' ? (
                                      modalSortDir === 'asc' ? <ChevronUp size={12} style={{ color: '#2563eb' }} /> : <ChevronDown size={12} style={{ color: '#2563eb' }} />
                                    ) : (
                                      <ChevronRight size={11} style={{ opacity: 0.3, transform: 'rotate(90deg)' }} />
                                    )}
                                  </div>
                                </th>
                              );
                            case 'solicitante':
                              return (
                                <th key="solicitante" {...dragHandlers} style={{ ...baseThStyle, minWidth: 90, textAlign: 'left' }} title="Arrastra para mover / Clic para ordenar">
                                  <div onClick={() => toggleModalSort('solicitante')} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'pointer', color: modalSortField === 'solicitante' ? '#2563eb' : '#475569' }}>
                                    {dragHandle}
                                    <span>Solicitante</span>
                                    {modalSortField === 'solicitante' ? (
                                      modalSortDir === 'asc' ? <ChevronUp size={12} style={{ color: '#2563eb' }} /> : <ChevronDown size={12} style={{ color: '#2563eb' }} />
                                    ) : (
                                      <ChevronRight size={11} style={{ opacity: 0.3, transform: 'rotate(90deg)' }} />
                                    )}
                                  </div>
                                </th>
                              );
                            case 'lider_dominio':
                              return (
                                <th key="lider_dominio" {...dragHandlers} style={{ ...baseThStyle, minWidth: 100, textAlign: 'left' }} title="Arrastra para mover / Clic para ordenar">
                                  <div onClick={() => toggleModalSort('lider_dominio')} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'pointer', color: modalSortField === 'lider_dominio' ? '#2563eb' : '#475569' }}>
                                    {dragHandle}
                                    <span>Líder de Dominio</span>
                                    {modalSortField === 'lider_dominio' ? (
                                      modalSortDir === 'asc' ? <ChevronUp size={12} style={{ color: '#2563eb' }} /> : <ChevronDown size={12} style={{ color: '#2563eb' }} />
                                    ) : (
                                      <ChevronRight size={11} style={{ opacity: 0.3, transform: 'rotate(90deg)' }} />
                                    )}
                                  </div>
                                </th>
                              );
                            case 'etapa_actual':
                              return (
                                <th key="etapa_actual" {...dragHandlers} style={{ ...baseThStyle, minWidth: 90, textAlign: 'center' }} title="Arrastra para mover / Clic para ordenar">
                                  <div onClick={() => toggleModalSort('etapa_actual')} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3, cursor: 'pointer', color: modalSortField === 'etapa_actual' ? '#2563eb' : '#475569' }}>
                                    {dragHandle}
                                    <span>Etapa</span>
                                    {modalSortField === 'etapa_actual' ? (
                                      modalSortDir === 'asc' ? <ChevronUp size={12} style={{ color: '#2563eb' }} /> : <ChevronDown size={12} style={{ color: '#2563eb' }} />
                                    ) : (
                                      <ChevronRight size={11} style={{ opacity: 0.3, transform: 'rotate(90deg)' }} />
                                    )}
                                  </div>
                                </th>
                              );
                            case 'fecha_asignacion':
                              return (
                                <th key="fecha_asignacion" {...dragHandlers} style={{ ...baseThStyle, minWidth: 90, textAlign: 'center' }} title="Arrastra para mover / Clic para ordenar">
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                    <div onClick={() => toggleModalSort('fecha_asignacion')} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, cursor: 'pointer', color: modalSortField === 'fecha_asignacion' ? '#2563eb' : '#475569' }}>
                                      {dragHandle}
                                      <span>F. Asig. LD</span>
                                      {modalSortField === 'fecha_asignacion' ? (
                                        modalSortDir === 'asc' ? <ChevronUp size={12} style={{ color: '#2563eb' }} /> : <ChevronDown size={12} style={{ color: '#2563eb' }} />
                                      ) : (
                                        <ChevronRight size={11} style={{ opacity: 0.3, transform: 'rotate(90deg)' }} />
                                      )}
                                    </div>
                                    {modalFilterOptions.asigMonths.length > 0 && (
                                      <select
                                        value={modalFilterAsigMonth}
                                        onChange={e => setModalFilterAsigMonth(e.target.value)}
                                        onClick={e => e.stopPropagation()}
                                        style={{
                                          fontSize: 9.5,
                                          padding: '1px 3px',
                                          borderRadius: 4,
                                          border: modalFilterAsigMonth !== 'all' ? '1px solid #3b82f6' : '1px solid #cbd5e1',
                                          background: modalFilterAsigMonth !== 'all' ? '#eff6ff' : '#fff',
                                          color: modalFilterAsigMonth !== 'all' ? '#1d4ed8' : '#64748b',
                                          fontWeight: modalFilterAsigMonth !== 'all' ? 700 : 400,
                                          cursor: 'pointer',
                                          maxWidth: 88,
                                        }}
                                      >
                                        <option value="all">Mes: Todos</option>
                                        {modalFilterOptions.hasEmptyAsig && <option value="empty">(Sin fecha)</option>}
                                        {modalFilterOptions.asigMonths.map(m => (
                                          <option key={m} value={m}>{fmtMonthLabel(m)}</option>
                                        ))}
                                      </select>
                                    )}
                                  </div>
                                </th>
                              );
                            case 'fecha_inicio':
                              return (
                                <th key="fecha_inicio" {...dragHandlers} style={{ ...baseThStyle, minWidth: 90, textAlign: 'center' }} title="Arrastra para mover / Clic para ordenar">
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                    <div onClick={() => toggleModalSort('fecha_inicio')} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, cursor: 'pointer', color: modalSortField === 'fecha_inicio' ? '#2563eb' : '#475569' }}>
                                      {dragHandle}
                                      <span>
                                        {popupCustomData.category === 'estimacion'
                                          ? 'F. Inicio Est.'
                                          : popupCustomData.category === 'reestimacion'
                                          ? 'F. Inicio Reest.'
                                          : popupCustomData.category === 'planificacion'
                                          ? 'F. Inicio Plan.'
                                          : 'F. Inicio'}
                                      </span>
                                      {modalSortField === 'fecha_inicio' ? (
                                        modalSortDir === 'asc' ? <ChevronUp size={12} style={{ color: '#2563eb' }} /> : <ChevronDown size={12} style={{ color: '#2563eb' }} />
                                      ) : (
                                        <ChevronRight size={11} style={{ opacity: 0.3, transform: 'rotate(90deg)' }} />
                                      )}
                                    </div>
                                    {modalFilterOptions.inicioMonths.length > 0 && (
                                      <select
                                        value={modalFilterInicioMonth}
                                        onChange={e => setModalFilterInicioMonth(e.target.value)}
                                        onClick={e => e.stopPropagation()}
                                        style={{
                                          fontSize: 9.5,
                                          padding: '1px 3px',
                                          borderRadius: 4,
                                          border: modalFilterInicioMonth !== 'all' ? '1px solid #3b82f6' : '1px solid #cbd5e1',
                                          background: modalFilterInicioMonth !== 'all' ? '#eff6ff' : '#fff',
                                          color: modalFilterInicioMonth !== 'all' ? '#1d4ed8' : '#64748b',
                                          fontWeight: modalFilterInicioMonth !== 'all' ? 700 : 400,
                                          cursor: 'pointer',
                                          maxWidth: 88,
                                        }}
                                      >
                                        <option value="all">Mes: Todos</option>
                                        {modalFilterOptions.hasEmptyIni && <option value="empty">(Sin fecha)</option>}
                                        {modalFilterOptions.inicioMonths.map(m => (
                                          <option key={m} value={m}>{fmtMonthLabel(m)}</option>
                                        ))}
                                      </select>
                                    )}
                                  </div>
                                </th>
                              );
                            case 'fecha_fin':
                              return (
                                <th key="fecha_fin" {...dragHandlers} style={{ ...baseThStyle, minWidth: 90, textAlign: 'center' }} title="Arrastra para mover / Clic para ordenar">
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                    <div onClick={() => toggleModalSort('fecha_fin')} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, cursor: 'pointer', color: modalSortField === 'fecha_fin' ? '#2563eb' : '#475569' }}>
                                      {dragHandle}
                                      <span>
                                        {popupCustomData.category === 'estimacion'
                                          ? 'F. Fin Est.'
                                          : popupCustomData.category === 'reestimacion'
                                          ? 'F. Fin Reest.'
                                          : popupCustomData.category === 'planificacion'
                                          ? 'F. Fin Plan.'
                                          : 'F. Fin'}
                                      </span>
                                      {modalSortField === 'fecha_fin' ? (
                                        modalSortDir === 'asc' ? <ChevronUp size={12} style={{ color: '#2563eb' }} /> : <ChevronDown size={12} style={{ color: '#2563eb' }} />
                                      ) : (
                                        <ChevronRight size={11} style={{ opacity: 0.3, transform: 'rotate(90deg)' }} />
                                      )}
                                    </div>
                                    {modalFilterOptions.finMonths.length > 0 && (
                                      <select
                                        value={modalFilterFinMonth}
                                        onChange={e => setModalFilterFinMonth(e.target.value)}
                                        onClick={e => e.stopPropagation()}
                                        style={{
                                          fontSize: 9.5,
                                          padding: '1px 3px',
                                          borderRadius: 4,
                                          border: modalFilterFinMonth !== 'all' ? '1px solid #3b82f6' : '1px solid #cbd5e1',
                                          background: modalFilterFinMonth !== 'all' ? '#eff6ff' : '#fff',
                                          color: modalFilterFinMonth !== 'all' ? '#1d4ed8' : '#64748b',
                                          fontWeight: modalFilterFinMonth !== 'all' ? 700 : 400,
                                          cursor: 'pointer',
                                          maxWidth: 88,
                                        }}
                                      >
                                        <option value="all">Mes: Todos</option>
                                        {modalFilterOptions.hasEmptyFin && <option value="empty">(Sin fecha)</option>}
                                        {modalFilterOptions.finMonths.map(m => (
                                          <option key={m} value={m}>{fmtMonthLabel(m)}</option>
                                        ))}
                                      </select>
                                    )}
                                  </div>
                                </th>
                              );
                            case 'motivo':
                              return (
                                <th key="motivo" {...dragHandlers} style={{ ...baseThStyle, minWidth: 150, textAlign: 'left' }} title="Arrastra para mover / Clic para ordenar">
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <div onClick={() => toggleModalSort('motivo')} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, cursor: 'pointer', color: modalSortField === 'motivo' ? '#2563eb' : '#475569' }}>
                                      {dragHandle}
                                      <span>Diagnóstico / Motivo</span>
                                      {modalSortField === 'motivo' ? (
                                        modalSortDir === 'asc' ? <ChevronUp size={12} style={{ color: '#2563eb' }} /> : <ChevronDown size={12} style={{ color: '#2563eb' }} />
                                      ) : (
                                        <ChevronRight size={11} style={{ opacity: 0.3, transform: 'rotate(90deg)' }} />
                                      )}
                                    </div>
                                    {modalFilterOptions.motivos.length > 1 && (
                                      <select
                                        value={modalFilterMotivo}
                                        onChange={e => setModalFilterMotivo(e.target.value)}
                                        onClick={e => e.stopPropagation()}
                                        style={{
                                          fontSize: 9.5,
                                          padding: '1px 3px',
                                          borderRadius: 4,
                                          border: modalFilterMotivo !== 'all' ? '1px solid #3b82f6' : '1px solid #cbd5e1',
                                          background: modalFilterMotivo !== 'all' ? '#eff6ff' : '#fff',
                                          color: modalFilterMotivo !== 'all' ? '#1d4ed8' : '#64748b',
                                          fontWeight: modalFilterMotivo !== 'all' ? 700 : 400,
                                          cursor: 'pointer',
                                          maxWidth: 125,
                                        }}
                                      >
                                        <option value="all">Motivo: Todos</option>
                                        {modalFilterOptions.motivos.map(mot => (
                                          <option key={mot} value={mot}>{mot.slice(0, 30)}...</option>
                                        ))}
                                      </select>
                                    )}
                                  </div>
                                </th>
                              );
                            case 'desfase':
                              return (
                                <th key="desfase" {...dragHandlers} style={{ ...baseThStyle, minWidth: 80, textAlign: 'center' }} title="Arrastra para mover / Clic para ordenar">
                                  <div onClick={() => toggleModalSort('desfase')} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3, cursor: 'pointer', color: modalSortField === 'desfase' ? '#2563eb' : '#475569' }}>
                                    {dragHandle}
                                    <span>Desfase</span>
                                    {modalSortField === 'desfase' ? (
                                      modalSortDir === 'asc' ? <ChevronUp size={12} style={{ color: '#2563eb' }} /> : <ChevronDown size={12} style={{ color: '#2563eb' }} />
                                    ) : (
                                      <ChevronRight size={11} style={{ opacity: 0.3, transform: 'rotate(90deg)' }} />
                                    )}
                                  </div>
                                </th>
                              );
                            default:
                              return null;
                          }
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedModalCustomItems.map((item, idx) => {
                        const t = item.iniciativa;
                        const idStr = String(t.id).padStart(4, '0');
                        const cfg = ETAPAS_MAP.get(t.etapa_actual);
                        const { asig, inicio, fin } = getModalItemDates(item);
                        const isSLA = item.reason.includes('En plazo SLA');

                        const cellBaseStyle: React.CSSProperties = {
                          padding: '6px 8px',
                          fontSize: 11,
                          verticalAlign: 'middle',
                          borderRight: '1px solid #f1f5f9',
                        };

                        return (
                          <tr
                            key={`${t.id}-${item.category}-${idx}`}
                            style={{
                              borderBottom: '1px solid #f1f5f9',
                              backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                              transition: 'background-color 0.15s',
                            }}
                            onMouseOver={e => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                            onMouseOut={e => (e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#ffffff' : '#f8fafc')}
                          >
                            <td style={{ padding: '6px', textAlign: 'center', verticalAlign: 'middle', borderRight: '1px solid #f1f5f9' }}>
                              <button
                                type="button"
                                onClick={() => setDetailModalIniciativa(t)}
                                style={{
                                  background: '#eff6ff',
                                  border: '1px solid #bfdbfe',
                                  borderRadius: 6,
                                  width: 26,
                                  height: 26,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  color: '#2563eb',
                                  transition: 'all 0.15s',
                                }}
                                onMouseOver={e => {
                                  e.currentTarget.style.backgroundColor = '#dbeafe';
                                  e.currentTarget.style.borderColor = '#93c5fd';
                                }}
                                onMouseOut={e => {
                                  e.currentTarget.style.backgroundColor = '#eff6ff';
                                  e.currentTarget.style.borderColor = '#bfdbfe';
                                }}
                                title="Abrir detalle completo de la iniciativa"
                              >
                                <Eye size={13} />
                              </button>
                            </td>

                            {modalColOrder.map(colId => {
                              if (hiddenModalCols.has(colId)) return null;
                              switch (colId) {
                                case 'id':
                                  return (
                                    <td key="id" style={{ ...cellBaseStyle, fontWeight: 700, color: '#3b82f6', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                      {idStr}
                                    </td>
                                  );
                                case 'titulo':
                                  return (
                                    <td key="titulo" style={{ ...cellBaseStyle, fontWeight: 600, color: '#1e293b', minWidth: 200, maxWidth: 300, lineHeight: 1.35, wordBreak: 'break-word' }}>
                                      {t.titulo}
                                    </td>
                                  );
                                case 'it_bp':
                                  return (
                                    <td key="it_bp" style={{ ...cellBaseStyle, color: '#475569', whiteSpace: 'nowrap' }}>
                                      {t.it_bp || '—'}
                                    </td>
                                  );
                                case 'vp_solicitante':
                                  return (
                                    <td key="vp_solicitante" style={{ ...cellBaseStyle, color: '#475569', minWidth: 120, lineHeight: 1.3 }}>
                                      {t.vp_solicitante || '—'}
                                    </td>
                                  );
                                case 'solicitante':
                                  return (
                                    <td key="solicitante" style={{ ...cellBaseStyle, color: '#475569', whiteSpace: 'nowrap' }}>
                                      {t.usuario_negocio || '—'}
                                    </td>
                                  );
                                case 'lider_dominio':
                                  return (
                                    <td key="lider_dominio" style={{ ...cellBaseStyle, color: '#0f172a', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                      {t.lider_dominio || '(Sin asignar)'}
                                    </td>
                                  );
                                case 'etapa_actual':
                                  return (
                                    <td key="etapa_actual" style={{ ...cellBaseStyle, textAlign: 'center' }}>
                                      {cfg ? (
                                        <span
                                          style={{
                                            fontSize: 9.5,
                                            padding: '2px 7px',
                                            borderRadius: 20,
                                            backgroundColor: cfg.bgColor,
                                            color: cfg.textColor,
                                            fontWeight: 600,
                                            whiteSpace: 'nowrap',
                                          }}
                                        >
                                          {cfg.label}
                                        </span>
                                      ) : (
                                        <span style={{ fontSize: 9.5, color: '#64748b' }}>{t.etapa_actual}</span>
                                      )}
                                    </td>
                                  );
                                case 'fecha_asignacion':
                                  return (
                                    <td key="fecha_asignacion" style={{ ...cellBaseStyle, color: asig ? '#334155' : '#94a3b8', fontSize: 11, whiteSpace: 'nowrap', fontWeight: asig ? 500 : 400, textAlign: 'center' }}>
                                      {asig ? fmtDateShort(asig) : '—'}
                                    </td>
                                  );
                                case 'fecha_inicio':
                                  return (
                                    <td key="fecha_inicio" style={{ ...cellBaseStyle, color: inicio ? '#334155' : '#94a3b8', fontSize: 11, whiteSpace: 'nowrap', fontWeight: inicio ? 500 : 400, textAlign: 'center' }}>
                                      {inicio ? fmtDateShort(inicio) : '—'}
                                    </td>
                                  );
                                case 'fecha_fin':
                                  return (
                                    <td key="fecha_fin" style={{ ...cellBaseStyle, color: fin ? '#0f172a' : '#94a3b8', fontSize: 11, whiteSpace: 'nowrap', fontWeight: fin ? 600 : 400, textAlign: 'center' }}>
                                      {fin ? fmtDateShort(fin) : '—'}
                                    </td>
                                  );
                                case 'motivo':
                                  return (
                                    <td key="motivo" style={{ ...cellBaseStyle }}>
                                      <MotivoBadgeChip reason={item.reason} category={item.category} fullText={true} />
                                    </td>
                                  );
                                case 'desfase':
                                  return (
                                    <td key="desfase" style={{ ...cellBaseStyle, textAlign: 'center' }}>
                                      {item.delayDays > 0 ? (
                                        <span
                                          style={{
                                            display: 'inline-block',
                                            fontSize: 9.5,
                                            fontWeight: 700,
                                            padding: '2px 7px',
                                            borderRadius: 20,
                                            background: '#fef2f2',
                                            color: '#ef4444',
                                            border: '1px solid #fecaca',
                                            whiteSpace: 'nowrap',
                                          }}
                                        >
                                          +{item.delayDays} días
                                        </span>
                                      ) : isSLA ? (
                                        <span
                                          style={{
                                            display: 'inline-block',
                                            fontSize: 9.5,
                                            fontWeight: 700,
                                            padding: '2px 7px',
                                            borderRadius: 20,
                                            background: '#ecfdf5',
                                            color: '#059669',
                                            border: '1px solid #a7f3d0',
                                            whiteSpace: 'nowrap',
                                          }}
                                        >
                                          En SLA
                                        </span>
                                      ) : (
                                        <span style={{ color: '#94a3b8', fontSize: 11 }}>—</span>
                                      )}
                                    </td>
                                  );
                                default:
                                  return null;
                              }
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '14px 24px',
                borderTop: '1px solid #f1f5f9',
                display: 'flex',
                justifyContent: 'flex-end',
                backgroundColor: '#f8fafc',
              }}
            >
              <button
                onClick={() => setPopupCustomData(null)}
                style={{
                  backgroundColor: '#3b82f6',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 18px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(59, 130, 246, 0.2)',
                  transition: 'background-color 0.15s',
                }}
                onMouseOver={e => (e.currentTarget.style.backgroundColor = '#2563eb')}
                onMouseOut={e => (e.currentTarget.style.backgroundColor = '#3b82f6')}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================
          MODAL POPUP ESTÁNDAR (POR VP / ESTADO / IT BP)
      ================================================================ */}
      {popupFilters && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(8px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setPopupFilters(null)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 16,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              width: '96vw',
              maxWidth: 1650,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              border: '1px solid #e2e8f0',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                padding: '18px 24px',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'linear-gradient(to right, #f8fafc, #ffffff)',
              }}
            >
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>
                  Detalle de Iniciativas
                </h3>
                <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0 0' }}>
                  Mostrando {popupIniciativas.length} iniciativas que coinciden con la selección
                </p>
              </div>
              <button
                onClick={() => setPopupFilters(null)}
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: '50%',
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#64748b',
                  transition: 'background-color 0.15s',
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#e2e8f0')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
              >
                <X size={16} />
              </button>
            </div>

            {/* Content list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px' }}>
              {popupIniciativas.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                  No se encontraron iniciativas.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #f1f5f9', textAlign: 'left', color: '#475569', background: '#f8fafc' }}>
                        <th style={{ padding: '10px 8px', width: 36, textAlign: 'center' }} title="Ver detalle completo en modal">
                          <Eye size={13} style={{ color: '#94a3b8', margin: '0 auto' }} />
                        </th>
                        <th style={{ padding: '10px 12px', fontWeight: 600, whiteSpace: 'nowrap' }}>ID</th>
                        <th style={{ padding: '10px 12px', fontWeight: 600, minWidth: 260 }}>Título</th>
                        <th style={{ padding: '10px 12px', fontWeight: 600 }}>VP Área Solicitante</th>
                        <th style={{ padding: '10px 12px', fontWeight: 600 }}>IT BP</th>
                        <th style={{ padding: '10px 12px', fontWeight: 600 }}>Solicitante</th>
                        <th style={{ padding: '10px 12px', fontWeight: 600 }}>Estado</th>
                        <th style={{ padding: '10px 12px', fontWeight: 600 }}>
                          {mode === 'planificadas' ? 'F. Inicio Planif.' : 'F. Entrega Req.'}
                        </th>
                        <th style={{ padding: '10px 12px', fontWeight: 600 }}>
                          {mode === 'planificadas' ? 'F. Fin Planif.' : 'F. Registro'}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {popupIniciativas.map((t, idx) => {
                        const idStr = String(t.id).padStart(4, '0');
                        const isPlan = mode === 'planificadas';
                        const config = isPlan
                          ? ETAPAS_PLANIFICADAS_MAP.get(t.etapa_actual)
                          : ETAPAS_MAP.get(t.etapa_actual);

                        return (
                          <tr
                            key={t.id}
                            style={{
                              borderBottom: '1px solid #f1f5f9',
                              backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                              transition: 'background-color 0.15s',
                            }}
                            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#ffffff' : '#f8fafc')}
                          >
                            <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => setDetailModalIniciativa(t)}
                                style={{
                                  background: '#eff6ff',
                                  border: '1px solid #bfdbfe',
                                  borderRadius: 6,
                                  width: 28,
                                  height: 28,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  color: '#2563eb',
                                  transition: 'all 0.15s',
                                }}
                                onMouseOver={e => {
                                  e.currentTarget.style.backgroundColor = '#dbeafe';
                                  e.currentTarget.style.borderColor = '#93c5fd';
                                }}
                                onMouseOut={e => {
                                  e.currentTarget.style.backgroundColor = '#eff6ff';
                                  e.currentTarget.style.borderColor = '#bfdbfe';
                                }}
                                title="Abrir detalle completo de la iniciativa"
                              >
                                <Eye size={14} />
                              </button>
                            </td>
                            <td style={{ padding: '12px 12px', fontWeight: 700, color: '#3b82f6', whiteSpace: 'nowrap' }}>
                              {idStr}
                            </td>
                            <td style={{ padding: '12px 12px', fontWeight: 600, color: '#1e293b', minWidth: 260, lineHeight: 1.45, wordBreak: 'break-word' }}>
                              {t.titulo}
                            </td>
                            <td style={{ padding: '12px 12px', color: '#475569' }}>
                              {t.vp_solicitante || '—'}
                            </td>
                            <td style={{ padding: '12px 12px', color: '#475569' }}>
                              {t.it_bp || '—'}
                            </td>
                            <td style={{ padding: '12px 12px', color: '#475569' }}>
                              {t.usuario_negocio || '—'}
                            </td>
                            <td style={{ padding: '12px 12px' }}>
                              {config ? (
                                <span
                                  style={{
                                    fontSize: 10,
                                    padding: '2px 8px',
                                    borderRadius: 20,
                                    backgroundColor: config.bgColor,
                                    color: config.textColor,
                                    fontWeight: 600,
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {config.label}
                                </span>
                              ) : (
                                <span
                                  style={{
                                    fontSize: 10,
                                    padding: '2px 8px',
                                    borderRadius: 20,
                                    backgroundColor: '#f1f5f9',
                                    color: '#475569',
                                    fontWeight: 600,
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {t.etapa_actual.replace(/_/g, ' ')}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '12px 12px', color: '#64748b' }}>
                              {isPlan ? fmtDatePopup(t.fecha_inicio_planificada) : fmtDatePopup(t.fecha_entrega_requerida)}
                            </td>
                            <td style={{ padding: '12px 12px', color: '#64748b' }}>
                              {isPlan ? fmtDatePopup(t.fecha_fin_planificada) : fmtDatePopup(t.fecha_registro)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '16px 24px',
                borderTop: '1px solid #f1f5f9',
                display: 'flex',
                justifyContent: 'flex-end',
                backgroundColor: '#f8fafc',
              }}
            >
              <button
                onClick={() => setPopupFilters(null)}
                style={{
                  backgroundColor: '#3b82f6',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 18px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(59, 130, 246, 0.2)',
                  transition: 'background-color 0.15s',
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#3b82f6')}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================
          MODAL DE DETALLE COMPLETO DE LA INICIATIVA
      ================================================================ */}
      <IniciativaDetailModal
        iniciativa={detailModalIniciativa}
        onClose={() => setDetailModalIniciativa(null)}
        mode={mode}
      />
    </div>
  );
}
