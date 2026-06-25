/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Iniciativa, EtapaPipeline, FilterState } from '../types';
import { ETAPAS_CONFIG, ETAPAS_MAP, ETAPAS_PLANIFICADAS_CONFIG, ETAPAS_PLANIFICADAS_MAP, EMPTY_SENTINEL, EMPTY_LABEL } from '../constants';
import { format, parseISO } from 'date-fns';
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
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type NavigateFn = (partialFilters: Partial<FilterState>) => void;

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

function normalize(v: string | null | undefined): string {
  const s = (v ?? '').trim();
  return s === '' ? EMPTY_SENTINEL : s;
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
  items.forEach(i => set.add(normalize(getter(i))));
  return Array.from(set).sort((a, b) => {
    if (a === EMPTY_SENTINEL) return 1;
    if (b === EMPTY_SENTINEL) return -1;
    return a.localeCompare(b, 'es');
  });
}

function fmtDatePopup(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return format(parseISO(d), 'dd MMM yyyy', { locale: es });
  } catch {
    return '—';
  }
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
          gap: 4,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.5)',
          marginBottom: 5,
        }}
      >
        {icon}
        {label}
        {options.length > 0 && (
          <span style={{ color: 'rgba(255,255,255,0.25)', fontWeight: 400 }}>({options.length})</span>
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
          border: hasSelection
            ? '1.5px solid rgba(147,197,253,0.8)'
            : '1.5px solid rgba(255,255,255,0.15)',
          background: hasSelection
            ? 'rgba(59,130,246,0.25)'
            : 'rgba(255,255,255,0.07)',
          color: hasSelection ? '#93c5fd' : 'rgba(255,255,255,0.55)',
          fontWeight: hasSelection ? 700 : 400,
          padding: '6px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 4,
          cursor: options.length === 0 ? 'not-allowed' : 'pointer',
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
          size={11}
          style={{
            flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'none',
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
                gap: 3,
                fontSize: 9,
                padding: '2px 6px',
                borderRadius: 20,
                background: 'rgba(59,130,246,0.3)',
                color: '#bfdbfe',
                fontWeight: 600,
                border: '1px solid rgba(147,197,253,0.4)',
              }}
            >
              <span style={{ maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayLabel(v)}
              </span>
              <button
                onClick={e => { e.stopPropagation(); toggle(v); }}
                style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#93c5fd', opacity: 0.7 }}
              >
                <X size={8} />
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
            background: '#1e293b',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10,
            boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
            minWidth: 210,
            maxHeight: 260,
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
                padding: '7px 12px',
                fontSize: 11,
                color: '#f87171',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                cursor: 'pointer',
                fontWeight: 600,
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
                  color: opt === EMPTY_SENTINEL
                    ? '#fbbf24'
                    : isSelected
                    ? '#93c5fd'
                    : 'rgba(255,255,255,0.75)',
                  cursor: 'pointer',
                  fontStyle: opt === EMPTY_SENTINEL ? 'italic' : 'normal',
                  background: isSelected ? 'rgba(59,130,246,0.15)' : 'transparent',
                  transition: 'background 0.1s',
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(opt)}
                  style={{ width: 12, height: 12, accentColor: '#3b82f6', flexShrink: 0 }}
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
    { val: 'SI', label: 'SI', activeBg: 'rgba(52,211,153,0.25)', activeBorder: '#34d399', activeColor: '#6ee7b7' },
    { val: 'NO', label: 'NO', activeBg: 'rgba(148,163,184,0.20)', activeBorder: '#94a3b8', activeColor: '#cbd5e1' },
    { val: EMPTY_SENTINEL, label: '—', activeBg: 'rgba(251,191,36,0.20)', activeBorder: '#fbbf24', activeColor: '#fde68a' },
  ];
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);

  return (
    <div>
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.5)',
          marginBottom: 5,
        }}
      >
        Proyecto SPO
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
                padding: '5px 10px',
                borderRadius: 7,
                border: `1.5px solid ${active ? o.activeBorder : 'rgba(255,255,255,0.15)'}`,
                background: active ? o.activeBg : 'rgba(255,255,255,0.07)',
                color: active ? o.activeColor : 'rgba(255,255,255,0.4)',
                cursor: 'pointer',
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
function ReportCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10, background: '#f8fafc' }}>
        <span style={{ color: '#3b82f6', display: 'flex' }}>{icon}</span>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', letterSpacing: '-0.01em' }}>{title}</h3>
        <span style={{ marginLeft: 6, fontSize: 10, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 3 }}>
          <ExternalLink size={10} /> Haz clic en filas o badges para ver detalle en Resumen
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

  // ---- Estado del popup de iniciativas ----
  const [popupFilters, setPopupFilters] = useState<Partial<FilterState> | null>(null);

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

  // ---- Filtrar iniciativas del popup ----
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
          PANEL STICKY DE FILTROS
      ================================================================ */}
      <div
        style={{
          position: 'sticky',
          top: 64,           /* justo debajo del header fijo (h-16 = 64px) */
          zIndex: 18,
          borderRadius: 14,
          background: 'linear-gradient(135deg, #0f2444 0%, #1e3a8a 60%, #1e40af 100%)',
          boxShadow: '0 6px 28px rgba(15,36,68,0.45)',
          border: '1px solid rgba(255,255,255,0.10)',
          backdropFilter: 'blur(12px)',
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
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Filter size={14} style={{ color: '#60a5fa' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>Filtros de Reportes</span>
            {totalActive > 0 && (
              <span style={{
                background: '#3b82f6', color: '#fff',
                fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
              }}>
                {totalActive} activo{totalActive !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Resumen de iniciativas */}
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
              <strong style={{ color: '#fff' }}>{filtered.length}</strong>
              <span style={{ opacity: 0.5 }}> / {iniciativas.length}</span>
              <span style={{ marginLeft: 4, opacity: 0.5 }}>iniciativas</span>
            </span>
            {totalActive > 0 && (
              <button
                onClick={clearAll}
                style={{
                  fontSize: 10, color: '#93c5fd', fontWeight: 600,
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  borderRadius: 7, padding: '3px 10px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s',
                }}
              >
                <X size={10} /> Limpiar todo
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
            icon={<Building2 size={9} />}
          />

          {/* IT BP */}
          <MacroMultiSelect
            label="IT BP"
            options={opts.itBPs}
            selected={macroITBPs}
            onChange={setMacroITBPs}
            icon={<UserCog size={9} />}
          />

          {/* VP Solicitante */}
          <MacroMultiSelect
            label="VP Solicitante"
            options={opts.vps}
            selected={macroVPs}
            onChange={setMacroVPs}
            icon={<UserCheck size={9} />}
          />

          {/* Estado (Etapa) */}
          <MacroMultiSelect
            label="Estado"
            options={opts.etapas}
            selected={macroEtapas}
            onChange={setMacroEtapas}
            labelFn={etapaLabel}
            icon={<GitBranch size={9} />}
          />

          {/* Líder de Dominio */}
          <MacroMultiSelect
            label="Líder de Dominio"
            options={opts.lideres}
            selected={macroLideres}
            onChange={setMacroLideres}
            icon={<Users size={9} />}
          />

          {/* Proyecto SPO */}
          <SpoToggle selected={macroSPO} onChange={setMacroSPO} />
        </div>
      </div>
      {/* ================================================================
          REPORTES
      ================================================================ */}
      <ReportCard title="Reporte por VP del Área Solicitante" icon={<Users size={18} />}>
        <ReporteVP iniciativas={filtered} onNavigate={setPopupFilters} macro={macro} />
      </ReportCard>

      <ReportCard title="Reporte por Estado (Etapa del Pipeline)" icon={<Layers size={18} />}>
        <ReporteEstados iniciativas={filtered} onNavigate={setPopupFilters} macro={macro} />
      </ReportCard>

      <ReportCard title="Reporte por IT BP" icon={<BarChart2 size={18} />}>
        <ReporteITBP iniciativas={filtered} onNavigate={setPopupFilters} macro={macro} />
      </ReportCard>

      {/* Popup/Modal overlay */}
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
              width: '100%',
              maxWidth: 950,
              maxHeight: '85vh',
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
                      <tr style={{ borderBottom: '2px solid #f1f5f9', textAlign: 'left', color: '#475569' }}>
                        <th style={{ padding: '10px 12px', fontWeight: 600 }}>ID</th>
                        <th style={{ padding: '10px 12px', fontWeight: 600 }}>Título</th>
                        <th style={{ padding: '10px 12px', fontWeight: 600 }}>VP Área Solicitante</th>
                        <th style={{ padding: '10px 12px', fontWeight: 600 }}>IT BP</th>
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
                            <td style={{ padding: '12px 12px', fontWeight: 700, color: '#3b82f6' }}>
                              {idStr}
                            </td>
                            <td style={{ padding: '12px 12px', fontWeight: 500, color: '#1e293b', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.titulo}>
                              {t.titulo}
                            </td>
                            <td style={{ padding: '12px 12px', color: '#475569' }}>
                              {t.vp_solicitante || '—'}
                            </td>
                            <td style={{ padding: '12px 12px', color: '#475569' }}>
                              {t.it_bp || '—'}
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
    </div>
  );
}
