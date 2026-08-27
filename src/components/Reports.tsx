/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Iniciativa, EtapaPipeline, FilterState } from '../types';
import { ETAPAS_CONFIG, ETAPAS_MAP, ETAPAS_PLANIFICADAS_CONFIG, ETAPAS_PLANIFICADAS_MAP, EMPTY_SENTINEL, EMPTY_LABEL } from '../constants';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
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
  // Ignorar etapas terminales o posteriores a la estimación
  if (
    i.etapa_actual === 'eliminadas' ||
    i.etapa_actual === 'planificadas' ||
    i.etapa_actual === 'aprobar_planificacion' ||
    i.etapa_actual === 'por_planificar' ||
    i.etapa_actual === 'por_habilitar_presupuesto' ||
    i.etapa_actual === 'por_aprobar_estimacion'
  ) {
    return { isOutOfDate: false, reason: '', delayDays: 0 };
  }

  // En etapa Por Estimar o Registro Incompleto: Comparar ÚNICAMENTE Fecha Fin de Estimación vs HOY
  if (i.etapa_actual === 'por_estimar' || i.etapa_actual === 'registro_incompleto') {
    if (i.fecha_fin_estimacion) {
      try {
        const finDate = parseISO(i.fecha_fin_estimacion);
        if (finDate < refDate) {
          return {
            isOutOfDate: true,
            reason: 'Fecha Fin de Estimación vencida respecto a hoy',
            delayDays: Math.max(1, differenceInCalendarDays(refDate, finDate)),
          };
        }
      } catch {
        // ignore
      }
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
  if (i.etapa_actual === 'eliminadas') {
    return { isOutOfDate: false, reason: '', delayDays: 0 };
  }

  // Evaluar cualquier iniciativa que tenga Fecha Fin Planificada vs HOY
  if (i.fecha_fin_planificada) {
    try {
      const finDate = parseISO(i.fecha_fin_planificada);
      if (finDate < refDate) {
        return {
          isOutOfDate: true,
          reason: 'Fecha Fin Planificada vencida respecto a hoy',
          delayDays: Math.max(1, differenceInCalendarDays(refDate, finDate)),
        };
      }
    } catch {
      // ignore
    }
  }

  return { isOutOfDate: false, reason: '', delayDays: 0 };
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
}

function MacroMultiSelect({
  label,
  options,
  selected,
  onChange,
  icon,
  labelFn,
}: MacroMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onOut);
    return () => document.removeEventListener('mousedown', onOut);
  }, []);

  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);

  const hasSelection = selected.length > 0;
  const displayLabel = (v: string) => optLabel(v, labelFn);

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
            : 'Todos'}
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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 5 }}>
          {selected.map(v => (
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
          ))}
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
            minWidth: 220,
            maxHeight: 270,
            overflowY: 'auto',
            zIndex: 99999,
          }}
        >
          {hasSelection && (
            <button
              onClick={() => onChange([])}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '8px 12px',
                fontSize: 11,
                color: '#ef4444',
                background: '#fff1f2',
                border: 'none',
                borderBottom: '1px solid #fee2e2',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              Limpiar selección
            </button>
          )}
          {options.map(opt => {
            const isSelected = selected.includes(opt);
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
          })}
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

  // Calcular ítems fuera de fecha para cada etapa
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
      title = liderName ? `Fuera de Fecha de Estimación: ${optLabel(liderName)}` : 'Iniciativas Fuera de Fecha de Estimación (Fecha Fin Estimación)';
      subtitle = 'Iniciativas en etapa Por Estimar con fecha fin de estimación vencida respecto a la fecha de hoy';
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
      title = liderName ? `Fuera de Fecha de Planificación: ${optLabel(liderName)}` : 'Iniciativas Fuera de Fecha de Planificación (Fecha Fin Planificada)';
      subtitle = 'Iniciativas en etapas de planificación con fecha fin planificada vencida respecto a la fecha de hoy';
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
            <span style={{ fontSize: 11, fontWeight: 600, color: '#92400e' }}>Fecha Fin Estimación</span>
            <Clock size={15} style={{ color: '#d97706' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#b45309' }}>{itemsEstimacion.length}</span>
            <span style={{ fontSize: 11, color: '#92400e', opacity: 0.8 }}>fuera de fecha vs hoy</span>
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
            <span style={{ fontSize: 11, fontWeight: 600, color: '#9f1239' }}>Fecha Fin Planificada</span>
            <CalendarX size={15} style={{ color: '#e11d48' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#be123c' }}>{itemsPlanificacion.length}</span>
            <span style={{ fontSize: 11, color: '#9f1239', opacity: 0.8 }}>fuera de fecha vs hoy</span>
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
                <BarChart data={chartDataConsolidado} layout="vertical" margin={{ top: 0, right: 60, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f4f8" />
                  <XAxis type="number" style={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis dataKey="name" type="category" width={175} style={{ fontSize: 11 }} tick={{ fill: '#475569' }} />
                  <Tooltip content={<ReportTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                  <Bar dataKey="Estimación" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Re-estimación" stackId="a" fill="#8b5cf6" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Planificación" stackId="a" fill="#f43f5e" radius={[0, 3, 3, 0]}>
                    <LabelList dataKey="total" position="right" style={{ fontSize: 10, fontWeight: 700, fill: '#475569' }} />
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
                    return (
                      <tr key={row.lider} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                        {!hiddenConsolidatedCols.has('lider') && (
                          <td style={{ padding: '8px 12px' }}>
                            <ClickableCell label={optLabel(row.lider)} onClick={() => handleOpenCategory('consolidado', row.lider)} title={`Ver detalle de iniciativas de: ${optLabel(row.lider)}`} />
                          </td>
                        )}
                        {!hiddenConsolidatedCols.has('estimacion') && (
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            {row.estimacionCount > 0 ? (
                              <span
                                onClick={() => handleOpenCategory('estimacion', row.lider)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 3,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  padding: '2px 8px',
                                  borderRadius: 20,
                                  background: '#fef3c7',
                                  color: '#b45309',
                                  cursor: 'pointer',
                                }}
                                title="Ver estimaciones fuera de fecha"
                              >
                                {row.estimacionCount}
                              </span>
                            ) : (
                              <span style={{ color: '#cbd5e1' }}>—</span>
                            )}
                          </td>
                        )}
                        {!hiddenConsolidatedCols.has('reestimacion') && (
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            {row.reestimacionCount > 0 ? (
                              <span
                                onClick={() => handleOpenCategory('reestimacion', row.lider)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 3,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  padding: '2px 8px',
                                  borderRadius: 20,
                                  background: '#f5f3ff',
                                  color: '#6d28d9',
                                  cursor: 'pointer',
                                }}
                                title="Ver re-estimaciones fuera de fecha"
                              >
                                {row.reestimacionCount}
                              </span>
                            ) : (
                              <span style={{ color: '#cbd5e1' }}>—</span>
                            )}
                          </td>
                        )}
                        {!hiddenConsolidatedCols.has('planificacion') && (
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            {row.planificacionCount > 0 ? (
                              <span
                                onClick={() => handleOpenCategory('planificacion', row.lider)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 3,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  padding: '2px 8px',
                                  borderRadius: 20,
                                  background: '#ffe4e6',
                                  color: '#be123c',
                                  cursor: 'pointer',
                                }}
                                title="Ver planificaciones fuera de fecha"
                              >
                                {row.planificacionCount}
                              </span>
                            ) : (
                              <span style={{ color: '#cbd5e1' }}>—</span>
                            )}
                          </td>
                        )}
                        {!hiddenConsolidatedCols.has('total') && (
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>
                            {visibleTotal}
                          </td>
                        )}
                        {!hiddenConsolidatedCols.has('accion') && (
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <button
                              onClick={() => handleOpenCategory('consolidado', row.lider)}
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: '#2563eb',
                                background: '#eff6ff',
                                border: '1px solid #bfdbfe',
                                borderRadius: 6,
                                padding: '3px 10px',
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
                    <td style={{ padding: '8px 12px', fontWeight: 700, fontSize: 12, color: '#334155' }}>TOTAL</td>
                  )}
                  {!hiddenConsolidatedCols.has('estimacion') && (
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 800, color: '#b45309' }}>{itemsEstimacion.length}</td>
                  )}
                  {!hiddenConsolidatedCols.has('reestimacion') && (
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 800, color: '#6d28d9' }}>{itemsReestimacion.length}</td>
                  )}
                  {!hiddenConsolidatedCols.has('planificacion') && (
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 800, color: '#be123c' }}>{itemsPlanificacion.length}</td>
                  )}
                  {!hiddenConsolidatedCols.has('total') && (
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, fontSize: 13, color: '#0f172a' }}>{consolidatedGrandTotal}</td>
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
              <strong>Campos auditados:</strong> <code>Fecha Inicio Estimación</code> y <code>Fecha Fin Estimación</code>.
              Evalúa iniciativas en etapa "Por Estimar" cuya fecha fin de estimación ha vencido respecto a la fecha de hoy.
            </span>
          </div>

          <div>
            <p style={{ fontSize: 10, color: '#94a3b8', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Iniciativas con Fecha Fin de Estimación Vencida por Líder de Dominio
            </p>
            {chartDataEstimacion.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#94a3b8', fontSize: 12 }}>
                🎉 No hay iniciativas con estimaciones fuera de fecha.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(220, chartDataEstimacion.length * 36 + 30)}>
                <BarChart data={chartDataEstimacion} layout="vertical" margin={{ top: 0, right: 60, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f4f8" />
                  <XAxis type="number" style={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis dataKey="name" type="category" width={175} style={{ fontSize: 11 }} tick={{ fill: '#475569' }} />
                  <Tooltip content={<ReportTooltip />} />
                  <Bar dataKey="value" name="Estimaciones Vencidas" fill="#f59e0b" radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="value" position="right" style={{ fontSize: 11, fontWeight: 700, fill: '#b45309' }} />
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
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>Estimaciones Vencidas <SortIcon field="total" /></span>
                  </th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>% del Total</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {sortedSummary.filter(s => s.estimacionCount > 0).map((row, idx) => (
                  <tr key={row.lider} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px' }}>
                      <ClickableCell label={optLabel(row.lider)} onClick={() => handleOpenCategory('estimacion', row.lider)} title={`Ver estimaciones atrasadas de: ${optLabel(row.lider)}`} />
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#b45309' }}>
                      {row.estimacionCount}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                      <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: '#b45309', background: '#fef3c7', padding: '1px 8px', borderRadius: 20 }}>
                        {Math.round((row.estimacionCount / (itemsEstimacion.length || 1)) * 100)}%
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <button
                        onClick={() => handleOpenCategory('estimacion', row.lider)}
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: '#b45309',
                          background: '#fef3c7',
                          border: '1px solid #fde68a',
                          borderRadius: 6,
                          padding: '3px 10px',
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
                  <td style={{ padding: '8px 12px', fontWeight: 700, fontSize: 12, color: '#334155' }}>TOTAL</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, fontSize: 13, color: '#b45309' }}>{itemsEstimacion.length}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#b45309' }}>100%</td>
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
                <BarChart data={chartDataReestimacion} layout="vertical" margin={{ top: 0, right: 60, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f4f8" />
                  <XAxis type="number" style={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis dataKey="name" type="category" width={175} style={{ fontSize: 11 }} tick={{ fill: '#475569' }} />
                  <Tooltip content={<ReportTooltip />} />
                  <Bar dataKey="value" name="Re-estimaciones Vencidas" fill="#8b5cf6" radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="value" position="right" style={{ fontSize: 11, fontWeight: 700, fill: '#6d28d9' }} />
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
                      <td style={{ padding: '8px 12px' }}>
                        <ClickableCell label={optLabel(row.lider)} onClick={() => handleOpenCategory('reestimacion', row.lider)} title={`Ver re-estimaciones atrasadas de: ${optLabel(row.lider)}`} />
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#6d28d9' }}>
                        {row.reestimacionCount}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: '#6d28d9', background: '#f5f3ff', padding: '1px 8px', borderRadius: 20 }}>
                          {Math.round((row.reestimacionCount / (itemsReestimacion.length || 1)) * 100)}%
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <button
                          onClick={() => handleOpenCategory('reestimacion', row.lider)}
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: '#6d28d9',
                            background: '#f5f3ff',
                            border: '1px solid #ddd6fe',
                            borderRadius: 6,
                            padding: '3px 10px',
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
                  <td style={{ padding: '8px 12px', fontWeight: 700, fontSize: 12, color: '#334155' }}>TOTAL</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, fontSize: 13, color: '#6d28d9' }}>{itemsReestimacion.length}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#6d28d9' }}>100%</td>
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
              Audita plazos en etapas de planificación con fecha fin planificada vencida respecto a la fecha de hoy.
            </span>
          </div>

          <div>
            <p style={{ fontSize: 10, color: '#94a3b8', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Iniciativas con Fecha Fin Planificada Vencida por Líder de Dominio
            </p>
            {chartDataPlanificacion.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#94a3b8', fontSize: 12 }}>
                🎉 No hay iniciativas con planificación fuera de fecha.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(220, chartDataPlanificacion.length * 36 + 30)}>
                <BarChart data={chartDataPlanificacion} layout="vertical" margin={{ top: 0, right: 60, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f4f8" />
                  <XAxis type="number" style={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis dataKey="name" type="category" width={175} style={{ fontSize: 11 }} tick={{ fill: '#475569' }} />
                  <Tooltip content={<ReportTooltip />} />
                  <Bar dataKey="value" name="Planificaciones Vencidas" fill="#f43f5e" radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="value" position="right" style={{ fontSize: 11, fontWeight: 700, fill: '#be123c' }} />
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
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>Planificaciones Vencidas <SortIcon field="total" /></span>
                  </th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>% del Total</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {sortedSummary.filter(s => s.planificacionCount > 0).map((row, idx) => (
                  <tr key={row.lider} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px' }}>
                      <ClickableCell label={optLabel(row.lider)} onClick={() => handleOpenCategory('planificacion', row.lider)} title={`Ver planificaciones atrasadas de: ${optLabel(row.lider)}`} />
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#be123c' }}>
                      {row.planificacionCount}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                      <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: '#be123c', background: '#ffe4e6', padding: '1px 8px', borderRadius: 20 }}>
                        {Math.round((row.planificacionCount / (itemsPlanificacion.length || 1)) * 100)}%
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <button
                        onClick={() => handleOpenCategory('planificacion', row.lider)}
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: '#be123c',
                          background: '#ffe4e6',
                          border: '1px solid #fecdd3',
                          borderRadius: 6,
                          padding: '3px 10px',
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
                  <td style={{ padding: '8px 12px', fontWeight: 700, fontSize: 12, color: '#334155' }}>TOTAL</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, fontSize: 13, color: '#be123c' }}>{itemsPlanificacion.length}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#be123c' }}>100%</td>
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
// REPORTE 1 — Por VP del Área Solicitante
// ---------------------------------------------------------------------------
function ReporteVP({
  iniciativas, onNavigate, macro,
}: {
  iniciativas: Iniciativa[];
  onNavigate: NavigateFn;
  macro: MacroFilters;
}) {
  const [sortField, setSortField] = useState<'total' | 'vp'>('total');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const data = useMemo(() => {
    const byVP: Record<string, { total: number; byEtapa: Record<EtapaPipeline, number> }> = {};
    iniciativas.forEach(i => {
      const vp = normalize(i.vp_solicitante);
      if (!byVP[vp]) byVP[vp] = { total: 0, byEtapa: {} as Record<EtapaPipeline, number> };
      byVP[vp].total++;
      byVP[vp].byEtapa[i.etapa_actual] = (byVP[vp].byEtapa[i.etapa_actual] || 0) + 1;
    });
    const total = iniciativas.length || 1;
    return Object.entries(byVP).map(([vp, s]) => ({
      vp, total: s.total, pct: Math.round((s.total / total) * 100), byEtapa: s.byEtapa,
    }));
  }, [iniciativas]);

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const cmp = sortField === 'total'
        ? a.total - b.total
        : optLabel(a.vp).localeCompare(optLabel(b.vp), 'es');
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
    sorted.slice(0, 15).map(d => {
      const row: Record<string, string | number> = {
        name: optLabel(d.vp).length > 28 ? optLabel(d.vp).slice(0, 26) + '…' : optLabel(d.vp),
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
        <p style={{ fontSize: 10, color: '#94a3b8', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Distribución por VP (top 15)</p>
        <ResponsiveContainer width="100%" height={Math.max(220, sorted.slice(0, 15).length * 36 + 40)}>
          <BarChart data={stackedData} layout="vertical" margin={{ top: 0, right: 50, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f4f8" />
            <XAxis type="number" style={{ fontSize: 10 }} allowDecimals={false} />
            <YAxis dataKey="name" type="category" width={180} style={{ fontSize: 11 }} tick={{ fill: '#475569' }} />
            <Tooltip content={<ReportTooltip />} />
            {topEtapas.map(e => (
              <Bar key={e.id} dataKey={e.label} stackId="a" fill={e.color} radius={[0, 2, 2, 0]}>
                <LabelList dataKey={e.label} position="right" style={{ fontSize: 9, fill: '#94a3b8' }} formatter={(v: number) => v > 0 ? v : ''} />
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
              <th onClick={() => toggleSort('vp')} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>VP del Área Solicitante <SortIcon field="vp" /></span>
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
              const base = buildNavFilters(macro, { vp_solicitantes: [row.vp] });
              return (
                <tr key={row.vp} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 12px' }}>
                    <ClickableCell label={optLabel(row.vp)} onClick={() => onNavigate(base)} title={`Ver iniciativas de: ${optLabel(row.vp)}`} />
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
        <BarChart data={data.map(d => ({ name: d.label, value: d.total, color: d.color }))} layout="vertical" margin={{ top: 0, right: 60, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f4f8" />
          <XAxis type="number" style={{ fontSize: 10 }} allowDecimals={false} />
          <YAxis dataKey="name" type="category" width={170} style={{ fontSize: 11 }} tick={{ fill: '#475569' }} />
          <Tooltip content={<ReportTooltip />} />
          <Bar dataKey="value" name="Iniciativas" radius={[0, 6, 6, 0]}>
            {data.map((e, i) => <Cell key={i} fill={e.color} />)}
            <LabelList dataKey="value" position="right" style={{ fontSize: 11, fontWeight: 700, fill: '#475569' }} />
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
          <BarChart data={stackedData} layout="vertical" margin={{ top: 0, right: 50, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f4f8" />
            <XAxis type="number" style={{ fontSize: 10 }} allowDecimals={false} />
            <YAxis dataKey="name" type="category" width={160} style={{ fontSize: 11 }} tick={{ fill: '#475569' }} />
            <Tooltip content={<ReportTooltip />} />
            {topEtapas.map(e => (
              <Bar key={e.id} dataKey={e.label} stackId="a" fill={e.color} radius={[0, 2, 2, 0]}>
                <LabelList dataKey={e.label} position="right" style={{ fontSize: 9, fill: '#94a3b8' }} formatter={(v: number) => v > 0 ? v : ''} />
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

  // ---- Estado del popup de iniciativas standard ----
  const [popupFilters, setPopupFilters] = useState<Partial<FilterState> | null>(null);

  // ---- Estado del popup de iniciativas custom (fechas) ----
  const [popupCustomData, setPopupCustomData] = useState<PopupCustomData | null>(null);
  const [hiddenModalCols, setHiddenModalCols] = useState<Set<string>>(new Set());
  const [showModalColPicker, setShowModalColPicker] = useState(false);

  const MODAL_OUT_OF_DATE_COLS = [
    { id: 'id', label: 'ID' },
    { id: 'titulo', label: 'Título de la Iniciativa' },
    { id: 'it_bp', label: 'IT BP' },
    { id: 'vp_solicitante', label: 'VP Área Solicitante' },
    { id: 'solicitante', label: 'Solicitante' },
    { id: 'lider_dominio', label: 'Líder de Dominio' },
    { id: 'etapa_actual', label: 'Etapa Pipeline' },
    { id: 'fechas', label: 'Fechas de Etapa' },
    { id: 'motivo', label: 'Diagnóstico' },
    { id: 'desfase', label: 'Desfase vs HOY' },
  ];

  const toggleModalCol = (id: string) => {
    setHiddenModalCols(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (MODAL_OUT_OF_DATE_COLS.length - next.size > 1) {
          next.add(id);
        }
      }
      return next;
    });
  };

  const showAllModalCols = () => {
    setHiddenModalCols(new Set());
  };

  // ---- Estado de ordenamiento del modal popup custom (fechas) ----
  type ModalSortField =
    | 'id'
    | 'titulo'
    | 'it_bp'
    | 'vp_solicitante'
    | 'solicitante'
    | 'lider_dominio'
    | 'etapa_actual'
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
    if (!popupCustomData) return [];
    return [...popupCustomData.items].sort((a, b) => {
      const tA = a.iniciativa;
      const tB = b.iniciativa;

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
        case 'motivo':
          cmp = (a.reason || '').localeCompare(b.reason || '', 'es');
          break;
        case 'desfase':
          cmp = a.delayDays - b.delayDays;
          break;
        case 'fecha_inicio': {
          const dateA =
            a.category === 'estimacion'
              ? tA.fecha_inicio_estimacion
              : a.category === 'reestimacion'
              ? tA.fecha_inicio_reestimacion
              : a.category === 'planificacion'
              ? tA.fecha_inicio_planificada
              : tA.fecha_inicio_planificada || tA.fecha_inicio_estimacion;
          const dateB =
            b.category === 'estimacion'
              ? tB.fecha_inicio_estimacion
              : b.category === 'reestimacion'
              ? tB.fecha_inicio_reestimacion
              : b.category === 'planificacion'
              ? tB.fecha_inicio_planificada
              : tB.fecha_inicio_planificada || tB.fecha_inicio_estimacion;
          if (!dateA && !dateB) cmp = 0;
          else if (!dateA) cmp = 1;
          else if (!dateB) cmp = -1;
          else cmp = new Date(dateA).getTime() - new Date(dateB).getTime();
          break;
        }
        case 'fecha_fin': {
          const dateA =
            a.category === 'estimacion'
              ? tA.fecha_fin_estimacion
              : a.category === 'reestimacion'
              ? tA.fecha_fin_reestimacion
              : a.category === 'planificacion'
              ? tA.fecha_fin_planificada
              : tA.fecha_fin_planificada || tA.fecha_fin_estimacion;
          const dateB =
            b.category === 'estimacion'
              ? tB.fecha_fin_estimacion
              : b.category === 'reestimacion'
              ? tB.fecha_fin_reestimacion
              : b.category === 'planificacion'
              ? tB.fecha_fin_planificada
              : tB.fecha_fin_planificada || tB.fecha_fin_estimacion;
          if (!dateA && !dateB) cmp = 0;
          else if (!dateA) cmp = 1;
          else if (!dateB) cmp = -1;
          else cmp = new Date(dateA).getTime() - new Date(dateB).getTime();
          break;
        }
        default:
          cmp = 0;
      }
      return modalSortDir === 'asc' ? cmp : -cmp;
    });
  }, [popupCustomData, modalSortField, modalSortDir]);

  // ---- Estado para ver detalle completo de la iniciativa (modal) ----
  const [detailModalIniciativa, setDetailModalIniciativa] = useState<Iniciativa | null>(null);

  // ---- Estado del reporte activo (null = Catálogo inicial de opciones) ----
  type ReportId = 'fuera_fecha' | 'vp' | 'estados' | 'it_bp';
  const [selectedReport, setSelectedReport] = useState<ReportId | null>(null);

  // ---- Opciones (de todo el dataset) ----
  const opts = useMemo(() => ({
    instituciones: buildMacroOptions(iniciativas, i => i.institucion),
    itBPs:         buildMacroOptions(iniciativas, i => i.it_bp),
    vps:           buildMacroOptions(iniciativas, i => i.vp_solicitante),
    etapas:        Array.from(new Set(iniciativas.map(i => i.etapa_actual))),
    lideres:       buildMacroOptions(iniciativas, i => i.lider_dominio),
  }), [iniciativas]);

  // ---- Label para etapas en el dropdown ----
  const etapaLabel = (v: string) => ETAPAS_MAP.get(v as EtapaPipeline)?.label || ETAPAS_PLANIFICADAS_MAP.get(v as EtapaPipeline)?.label || v;

  // ---- Aplicar filtros macro ----
  const filtered = useMemo(() => {
    return iniciativas.filter(i => {
      if (macroInstituciones.length && !macroInstituciones.includes(normalize(i.institucion))) return false;
      if (macroSPO.length           && !macroSPO.includes(normalize(i.proyecto_spo)))          return false;
      if (macroITBPs.length         && !macroITBPs.includes(normalize(i.it_bp)))               return false;
      if (macroVPs.length           && !macroVPs.includes(normalize(i.vp_solicitante)))         return false;
      if (macroEtapas.length        && !macroEtapas.includes(i.etapa_actual))                  return false;
      if (macroLideres.length       && !macroLideres.includes(normalize(i.lider_dominio)))      return false;
      return true;
    });
  }, [iniciativas, macroInstituciones, macroSPO, macroITBPs, macroVPs, macroEtapas, macroLideres]);

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
  ], [mode, fueraFechaMetrics, vpsCount, etapasCount, itbpsCount]);

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
    macroEtapas.length + macroLideres.length;

  const clearAll = () => {
    setMacroInstituciones([]);
    setMacroSPO([]);
    setMacroITBPs([]);
    setMacroVPs([]);
    setMacroEtapas([]);
    setMacroLideres([]);
  };

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
              onClick={() => setSelectedReport(null)}
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
                    onClick={() => setSelectedReport(opt.id)}
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
              PANEL STICKY DE FILTROS (DISEÑO LIGHT Y ELEGANTE)
          ================================================================ */}
          <div
            style={{
              position: 'sticky',
              top: 64,           /* justo debajo del header fijo (h-16 = 64px) */
              zIndex: 18,
              borderRadius: 14,
              background: '#ffffff',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.05)',
              border: '1px solid #e2e8f0',
              overflow: 'visible',
            }}
          >
            {/* Cabecera del panel */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 18px 8px',
                borderBottom: '1px solid #f1f5f9',
                background: 'linear-gradient(to right, #f8fafc, #ffffff)',
                borderRadius: '14px 14px 0 0',
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
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Resumen de iniciativas */}
                <span style={{ fontSize: 11, color: '#64748b' }}>
                  <strong style={{ color: '#0f172a' }}>{filtered.length}</strong>
                  <span style={{ opacity: 0.8 }}> / {iniciativas.length}</span>
                  <span style={{ marginLeft: 4 }}>iniciativas</span>
                </span>
                {totalActive > 0 && (
                  <button
                    onClick={clearAll}
                    style={{
                      fontSize: 10, color: '#ef4444', fontWeight: 700,
                      background: '#fff1f2',
                      border: '1px solid #fecaca',
                      borderRadius: 7, padding: '3px 10px', cursor: 'pointer',
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

            {/* Grid de filtros */}
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

              {/* Proyecto SPO */}
              <SpoToggle selected={macroSPO} onChange={setMacroSPO} />
            </div>
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
                onClick={() => setSelectedReport(opt.id)}
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

      {/* REPORTE 2: POR VP DEL ÁREA SOLICITANTE */}
      {selectedReport === 'vp' && (
        <ReportCard title="Reporte por VP del Área Solicitante" icon={<Users size={18} />}>
          <ReporteVP iniciativas={filtered} onNavigate={setPopupFilters} macro={macro} />
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
                  {popupCustomData.subtitle} ({popupCustomData.items.length} iniciativas)
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
                    title="Ocultar / Mostrar columnas del modal"
                  >
                    <Columns3 size={13} style={{ color: hiddenModalCols.size > 0 ? '#2563eb' : '#64748b' }} />
                    <span>Columnas ({MODAL_OUT_OF_DATE_COLS.length - hiddenModalCols.size}/{MODAL_OUT_OF_DATE_COLS.length})</span>
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
                          width: 230,
                          background: '#fff',
                          border: '1px solid #e2e8f0',
                          borderRadius: 10,
                          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.1)',
                          zIndex: 10001,
                          padding: 10,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 6, marginBottom: 6, borderBottom: '1px solid #f1f5f9' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#1e293b' }}>Columnas Visibles</span>
                          {hiddenModalCols.size > 0 && (
                            <button
                              type="button"
                              onClick={showAllModalCols}
                              style={{ fontSize: 10, color: '#2563eb', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                            >
                              Mostrar todas
                            </button>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
                          {MODAL_OUT_OF_DATE_COLS.map(col => {
                            const isVis = !hiddenModalCols.has(col.id);
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
                                    onChange={() => toggleModalCol(col.id)}
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
                          <span>{hiddenModalCols.size} columna(s) oculta(s)</span>
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
            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px' }}>
              {sortedModalCustomItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                  No se encontraron iniciativas con desfase para esta selección.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #f1f5f9', textAlign: 'left', color: '#475569', background: '#f8fafc' }}>
                        <th style={{ padding: '10px 8px', width: 36, textAlign: 'center' }} title="Ver detalle completo en modal">
                          <Eye size={13} style={{ color: '#94a3b8', margin: '0 auto' }} />
                        </th>
                        {!hiddenModalCols.has('id') && (
                          <th
                            onClick={() => toggleModalSort('id')}
                            style={{ padding: '10px 12px', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                            title="Ordenar por ID"
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              ID
                              {modalSortField === 'id' ? (
                                modalSortDir === 'asc' ? <ChevronUp size={12} style={{ color: '#2563eb' }} /> : <ChevronDown size={12} style={{ color: '#2563eb' }} />
                              ) : (
                                <ChevronRight size={11} style={{ opacity: 0.3, transform: 'rotate(90deg)' }} />
                              )}
                            </span>
                          </th>
                        )}
                        {!hiddenModalCols.has('titulo') && (
                          <th
                            onClick={() => toggleModalSort('titulo')}
                            style={{ padding: '10px 12px', fontWeight: 600, minWidth: 240, cursor: 'pointer', userSelect: 'none' }}
                            title="Ordenar por Título"
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              Título de la Iniciativa
                              {modalSortField === 'titulo' ? (
                                modalSortDir === 'asc' ? <ChevronUp size={12} style={{ color: '#2563eb' }} /> : <ChevronDown size={12} style={{ color: '#2563eb' }} />
                              ) : (
                                <ChevronRight size={11} style={{ opacity: 0.3, transform: 'rotate(90deg)' }} />
                              )}
                            </span>
                          </th>
                        )}
                        {!hiddenModalCols.has('it_bp') && (
                          <th
                            onClick={() => toggleModalSort('it_bp')}
                            style={{ padding: '10px 12px', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                            title="Ordenar por IT BP"
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              IT BP
                              {modalSortField === 'it_bp' ? (
                                modalSortDir === 'asc' ? <ChevronUp size={12} style={{ color: '#2563eb' }} /> : <ChevronDown size={12} style={{ color: '#2563eb' }} />
                              ) : (
                                <ChevronRight size={11} style={{ opacity: 0.3, transform: 'rotate(90deg)' }} />
                              )}
                            </span>
                          </th>
                        )}
                        {!hiddenModalCols.has('vp_solicitante') && (
                          <th
                            onClick={() => toggleModalSort('vp_solicitante')}
                            style={{ padding: '10px 12px', fontWeight: 600, minWidth: 160, cursor: 'pointer', userSelect: 'none' }}
                            title="Ordenar por VP Área Solicitante"
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              VP Área Solicitante
                              {modalSortField === 'vp_solicitante' ? (
                                modalSortDir === 'asc' ? <ChevronUp size={12} style={{ color: '#2563eb' }} /> : <ChevronDown size={12} style={{ color: '#2563eb' }} />
                              ) : (
                                <ChevronRight size={11} style={{ opacity: 0.3, transform: 'rotate(90deg)' }} />
                              )}
                            </span>
                          </th>
                        )}
                        {!hiddenModalCols.has('solicitante') && (
                          <th
                            onClick={() => toggleModalSort('solicitante')}
                            style={{ padding: '10px 12px', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                            title="Ordenar por Solicitante"
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              Solicitante
                              {modalSortField === 'solicitante' ? (
                                modalSortDir === 'asc' ? <ChevronUp size={12} style={{ color: '#2563eb' }} /> : <ChevronDown size={12} style={{ color: '#2563eb' }} />
                              ) : (
                                <ChevronRight size={11} style={{ opacity: 0.3, transform: 'rotate(90deg)' }} />
                              )}
                            </span>
                          </th>
                        )}
                        {!hiddenModalCols.has('lider_dominio') && (
                          <th
                            onClick={() => toggleModalSort('lider_dominio')}
                            style={{ padding: '10px 12px', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                            title="Ordenar por Líder de Dominio"
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              Líder de Dominio
                              {modalSortField === 'lider_dominio' ? (
                                modalSortDir === 'asc' ? <ChevronUp size={12} style={{ color: '#2563eb' }} /> : <ChevronDown size={12} style={{ color: '#2563eb' }} />
                              ) : (
                                <ChevronRight size={11} style={{ opacity: 0.3, transform: 'rotate(90deg)' }} />
                              )}
                            </span>
                          </th>
                        )}
                        {!hiddenModalCols.has('etapa_actual') && (
                          <th
                            onClick={() => toggleModalSort('etapa_actual')}
                            style={{ padding: '10px 12px', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                            title="Ordenar por Etapa Pipeline"
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              Etapa Pipeline
                              {modalSortField === 'etapa_actual' ? (
                                modalSortDir === 'asc' ? <ChevronUp size={12} style={{ color: '#2563eb' }} /> : <ChevronDown size={12} style={{ color: '#2563eb' }} />
                              ) : (
                                <ChevronRight size={11} style={{ opacity: 0.3, transform: 'rotate(90deg)' }} />
                              )}
                            </span>
                          </th>
                        )}
                        {!hiddenModalCols.has('fechas') && (
                          <th style={{ padding: '8px 12px', fontWeight: 600, whiteSpace: 'nowrap', userSelect: 'none' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                              <span style={{ fontSize: 11 }}>
                                {popupCustomData.category === 'estimacion'
                                  ? 'F. Inicio / Fin Estimación'
                                  : popupCustomData.category === 'reestimacion'
                                  ? 'F. Inicio / Fin Re-estimación'
                                  : popupCustomData.category === 'planificacion'
                                  ? 'F. Inicio / Fin Planificada'
                                  : 'Fechas del Hito'}
                              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <button
                                  type="button"
                                  onClick={() => toggleModalSort('fecha_inicio')}
                                  style={{
                                    fontSize: 10,
                                    padding: '2px 7px',
                                    borderRadius: 4,
                                    fontWeight: modalSortField === 'fecha_inicio' ? 700 : 500,
                                    color: modalSortField === 'fecha_inicio' ? '#1d4ed8' : '#475569',
                                    background: modalSortField === 'fecha_inicio' ? '#dbeafe' : '#f1f5f9',
                                    border: modalSortField === 'fecha_inicio' ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 2,
                                  }}
                                  title="Ordenar por Fecha de Inicio"
                                >
                                  Ini {modalSortField === 'fecha_inicio' ? (modalSortDir === 'asc' ? '↑' : '↓') : '↕'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleModalSort('fecha_fin')}
                                  style={{
                                    fontSize: 10,
                                    padding: '2px 7px',
                                    borderRadius: 4,
                                    fontWeight: modalSortField === 'fecha_fin' ? 700 : 500,
                                    color: modalSortField === 'fecha_fin' ? '#1d4ed8' : '#475569',
                                    background: modalSortField === 'fecha_fin' ? '#dbeafe' : '#f1f5f9',
                                    border: modalSortField === 'fecha_fin' ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 2,
                                  }}
                                  title="Ordenar por Fecha de Fin"
                                >
                                  Fin {modalSortField === 'fecha_fin' ? (modalSortDir === 'asc' ? '↑' : '↓') : '↕'}
                                </button>
                              </div>
                            </div>
                          </th>
                        )}
                        {!hiddenModalCols.has('motivo') && (
                          <th
                            onClick={() => toggleModalSort('motivo')}
                            style={{ padding: '10px 12px', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                            title="Ordenar por Diagnóstico / Motivo"
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              Diagnóstico / Motivo
                              {modalSortField === 'motivo' ? (
                                modalSortDir === 'asc' ? <ChevronUp size={12} style={{ color: '#2563eb' }} /> : <ChevronDown size={12} style={{ color: '#2563eb' }} />
                              ) : (
                                <ChevronRight size={11} style={{ opacity: 0.3, transform: 'rotate(90deg)' }} />
                              )}
                            </span>
                          </th>
                        )}
                        {!hiddenModalCols.has('desfase') && (
                          <th
                            onClick={() => toggleModalSort('desfase')}
                            style={{ padding: '10px 12px', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                            title="Ordenar por Desfase a fecha de HOY"
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                              Desfase a fecha de HOY
                              {modalSortField === 'desfase' ? (
                                modalSortDir === 'asc' ? <ChevronUp size={12} style={{ color: '#2563eb' }} /> : <ChevronDown size={12} style={{ color: '#2563eb' }} />
                              ) : (
                                <ChevronRight size={11} style={{ opacity: 0.3, transform: 'rotate(90deg)' }} />
                              )}
                            </span>
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedModalCustomItems.map((item, idx) => {
                        const t = item.iniciativa;
                        const idStr = String(t.id).padStart(4, '0');
                        const cfg = ETAPAS_MAP.get(t.etapa_actual);

                        let datesText = '—';
                        if (item.category === 'estimacion') {
                          datesText = `${fmtDateShort(t.fecha_inicio_estimacion)} → ${fmtDateShort(t.fecha_fin_estimacion)}`;
                        } else if (item.category === 'reestimacion') {
                          datesText = `${fmtDateShort(t.fecha_inicio_reestimacion)} → ${fmtDateShort(t.fecha_fin_reestimacion)}`;
                        } else if (item.category === 'planificacion') {
                          datesText = `${fmtDateShort(t.fecha_inicio_planificada)} → ${fmtDateShort(t.fecha_fin_planificada)}`;
                        } else {
                          datesText = `${fmtDateShort(t.fecha_inicio_planificada || t.fecha_inicio_estimacion)} → ${fmtDateShort(t.fecha_fin_planificada || t.fecha_fin_estimacion)}`;
                        }

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
                            {!hiddenModalCols.has('id') && (
                              <td style={{ padding: '12px 12px', fontWeight: 700, color: '#3b82f6', whiteSpace: 'nowrap' }}>
                                {idStr}
                              </td>
                            )}
                            {!hiddenModalCols.has('titulo') && (
                              <td style={{ padding: '12px 12px', fontWeight: 600, color: '#1e293b', minWidth: 240, lineHeight: 1.45, wordBreak: 'break-word' }}>
                                {t.titulo}
                              </td>
                            )}
                            {!hiddenModalCols.has('it_bp') && (
                              <td style={{ padding: '12px 12px', color: '#475569', fontSize: 11, whiteSpace: 'nowrap' }}>
                                {t.it_bp || '—'}
                              </td>
                            )}
                            {!hiddenModalCols.has('vp_solicitante') && (
                              <td style={{ padding: '12px 12px', color: '#475569', fontSize: 11, minWidth: 160 }}>
                                {t.vp_solicitante || '—'}
                              </td>
                            )}
                            {!hiddenModalCols.has('solicitante') && (
                              <td style={{ padding: '12px 12px', color: '#475569', fontSize: 11, whiteSpace: 'nowrap' }}>
                                {t.usuario_negocio || '—'}
                              </td>
                            )}
                            {!hiddenModalCols.has('lider_dominio') && (
                              <td style={{ padding: '12px 12px', color: '#0f172a', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                {t.lider_dominio || '(Sin asignar)'}
                              </td>
                            )}
                            {!hiddenModalCols.has('etapa_actual') && (
                              <td style={{ padding: '12px 12px' }}>
                                {cfg ? (
                                  <span
                                    style={{
                                      fontSize: 10,
                                      padding: '2px 8px',
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
                                  <span style={{ fontSize: 10, color: '#64748b' }}>{t.etapa_actual}</span>
                                )}
                              </td>
                            )}
                            {!hiddenModalCols.has('fechas') && (
                              <td style={{ padding: '12px 12px', color: '#475569', fontSize: 11, whiteSpace: 'nowrap' }}>
                                {datesText}
                              </td>
                            )}
                            {!hiddenModalCols.has('motivo') && (
                              <td style={{ padding: '12px 12px', fontSize: 11 }}>
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    color: item.category === 'estimacion' ? '#b45309' : item.category === 'reestimacion' ? '#6d28d9' : '#be123c',
                                    fontWeight: 500,
                                  }}
                                >
                                  {item.reason}
                                </span>
                              </td>
                            )}
                            {!hiddenModalCols.has('desfase') && (
                              <td style={{ padding: '12px 12px', textAlign: 'right' }}>
                                {item.delayDays > 0 ? (
                                  <span
                                    style={{
                                      display: 'inline-block',
                                      fontSize: 10,
                                      fontWeight: 700,
                                      padding: '2px 8px',
                                      borderRadius: 20,
                                      background: '#fef2f2',
                                      color: '#ef4444',
                                      border: '1px solid #fecaca',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    +{item.delayDays} días
                                  </span>
                                ) : (
                                  <span style={{ color: '#94a3b8', fontSize: 11 }}>—</span>
                                )}
                              </td>
                            )}
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
