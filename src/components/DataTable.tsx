import React, { useMemo, useState, useEffect } from 'react';
import { Iniciativa } from '../types';
import { ETAPAS_MAP, ETAPAS_PLANIFICADAS_MAP } from '../constants';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ChevronDown,
  ChevronRight,
  FileDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Mail,
  ExternalLink,
  Copy,
  Check,
  Search,
  Maximize2,
  X,
  Eye,
  FileText,
  Layers,
  Calendar,
  DollarSign,
  User,
  Shield,
  Info,
  Link as LinkIcon,
  CheckCircle2,
} from 'lucide-react';
import { escapeCsvField } from '../lib/utils';

interface DataTableProps {
  iniciativas: Iniciativa[];
  expandedId?: number | null;
  onExpandedIdChange?: (id: number | null) => void;
  mode?: 'demanda' | 'planificadas';
}

interface ColumnDef {
  id: string;
  label: string;
  render: (t: Iniciativa) => React.ReactNode;
  sortKey?: keyof Iniciativa;
  className?: string;
}

const ITEMS_PER_PAGE = 25;

// ---------------------------------------------------------------------------
// Helpers de formato
// ---------------------------------------------------------------------------
function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return format(parseISO(d), 'dd MMM yyyy', { locale: es });
  } catch {
    return '—';
  }
}

function fmtDateTime(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return format(parseISO(d), 'dd MMM yyyy HH:mm', { locale: es });
  } catch {
    return '—';
  }
}

function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `S/ ${v.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`;
}

function fmtUSD(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `$ ${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

// ---------------------------------------------------------------------------
// Auto-link detector & formatter para URLs y Correos
// ---------------------------------------------------------------------------
export function AutoLinkText({ text }: { text: string }) {
  if (!text) return <span className="text-gray-300 italic">—</span>;

  // Regex para detectar URLs completas (http, https, www) y correos electrónicos
  const urlRegex = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;

  const matches = text.match(urlRegex);
  if (!matches) {
    return <span className="whitespace-pre-line break-words">{text}</span>;
  }

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  text.replace(urlRegex, (match, offset) => {
    if (offset > lastIndex) {
      parts.push(text.substring(lastIndex, offset));
    }

    const isHttp = /^https?:\/\//i.test(match);
    const isWww = /^www\./i.test(match);
    const isEmail = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/i.test(match);

    const href = isHttp ? match : isWww ? `https://${match}` : isEmail ? `mailto:${match}` : match;

    parts.push(
      <a
        key={offset}
        href={href}
        target={isEmail ? '_self' : '_blank'}
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-800 underline decoration-blue-300 hover:decoration-blue-600 break-all transition-colors bg-blue-50/80 hover:bg-blue-100 px-1.5 py-0.5 rounded text-xs mx-0.5"
        title={isEmail ? `Enviar correo a ${match}` : `Abrir enlace: ${match}`}
      >
        <span>{match}</span>
        {isEmail ? (
          <Mail size={11} className="inline shrink-0 opacity-80" />
        ) : (
          <ExternalLink size={11} className="inline shrink-0 opacity-80" />
        )}
      </a>
    );

    lastIndex = offset + match.length;
    return match;
  });

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return <span className="whitespace-pre-line break-words leading-relaxed">{parts}</span>;
}

// ---------------------------------------------------------------------------
// Formateador genérico de campos
// ---------------------------------------------------------------------------
export function FormattedFieldValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-gray-300 italic font-mono text-xs">—</span>;
  }

  if (typeof value === 'boolean') {
    return (
      <span
        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
          value ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
        }`}
      >
        {value ? 'SÍ' : 'NO'}
      </span>
    );
  }

  if (typeof value === 'number') {
    return <span className="font-mono text-slate-800 font-medium">{value.toLocaleString('es-PE')}</span>;
  }

  const str = String(value).trim();

  // Fecha ISO
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(str)) {
    try {
      const dt = parseISO(str);
      return (
        <span className="font-mono text-slate-700 text-xs">
          {format(dt, 'dd MMM yyyy HH:mm', { locale: es })}
        </span>
      );
    } catch {
      // ignore
    }
  }

  if (str === 'SI' || str === 'SÍ') {
    return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">SI</span>;
  }
  if (str === 'NO') {
    return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">NO</span>;
  }

  return <AutoLinkText text={str} />;
}

// ---------------------------------------------------------------------------
// Badge de etapa con colores de ETAPAS_MAP
// ---------------------------------------------------------------------------
function EtapaBadge({ etapa, mode = 'demanda' }: { etapa: string; mode?: 'demanda' | 'planificadas' }) {
  const isPlanificadas = mode === 'planificadas';
  const config = isPlanificadas
    ? ETAPAS_PLANIFICADAS_MAP.get(etapa as Parameters<typeof ETAPAS_PLANIFICADAS_MAP.get>[0])
    : ETAPAS_MAP.get(etapa as Parameters<typeof ETAPAS_MAP.get>[0]);

  if (!config) {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium whitespace-nowrap">
        {etapa.replace(/_/g, ' ')}
      </span>
    );
  }
  return (
    <span
      className="text-[10px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap shadow-xs"
      style={{ backgroundColor: config.bgColor, color: config.textColor }}
    >
      {config.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Componente de Vista Detallada Completa de una Iniciativa
// Muestra ABSOLUTAMENTE TODOS los campos del registro y renderiza URLs
// ---------------------------------------------------------------------------
interface IniciativaDetailProps {
  t: Iniciativa;
  mode?: 'demanda' | 'planificadas';
  onOpenModal?: () => void;
  isModal?: boolean;
}

export function IniciativaDetail({ t, mode = 'demanda', onOpenModal, isModal = false }: IniciativaDetailProps) {
  const isPlanificadas = mode === 'planificadas';
  const [activeTab, setActiveTab] = useState<'secciones' | 'todos'>('secciones');
  const [fieldSearch, setFieldSearch] = useState('');
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Recolectar todos los campos existentes de la iniciativa y su raw_fields
  const allRawEntries = useMemo(() => {
    const map = new Map<string, unknown>();

    // 1. Añadir todas las propiedades mapeadas de la Iniciativa
    if (isPlanificadas) {
      if (t.id) map.set('ID Demanda', t.id);
      if (t.titulo) map.set('Título de la Iniciativa', t.titulo);
      if (t.frente) map.set('Frente', t.frente);
      if (t.etapa_actual) map.set('Estado', t.etapa_actual);
      if (t.sub_estado) map.set('Sub Estado', t.sub_estado);
      if (t.institucion) map.set('Institución', t.institucion);
      if (t.vp_solicitante) map.set('VP Solicitante', t.vp_solicitante);
      if (t.nombre_vp) map.set('Nombre VP', t.nombre_vp);
      if (t.usuario_negocio) map.set('Solicitante', t.usuario_negocio);
      if (t.it_bp) map.set('IT BP', t.it_bp);
      if (t.lider_dominio) map.set('Líder de Dominio', t.lider_dominio);
      if (t.costo_soles !== null) map.set('Costo Soles', fmtMoney(t.costo_soles));
      if (t.fecha_inicio_planificada) map.set('Fecha Inicio Planificada', fmtDate(t.fecha_inicio_planificada));
      if (t.fecha_fin_planificada) map.set('Fecha Fin Planificada', fmtDate(t.fecha_fin_planificada));
      if (t.fecha_inicio_real) map.set('Fecha Inicio Real', fmtDate(t.fecha_inicio_real));
      if (t.fecha_fin_real) map.set('Fecha Fin Real', fmtDate(t.fecha_fin_real));
      if (t.desviacion_pct !== null && t.desviacion_pct !== undefined) map.set('% Desviación', `${t.desviacion_pct}%`);
      if (t.aviso_negocio_cambio_fecha) map.set('Se avisó a Negocio cambio de fecha?', t.aviso_negocio_cambio_fecha);
      if (t.ticket_sn_rit) map.set('Ticket SN (RIT)', t.ticket_sn_rit);
      if (t.id_jira) map.set('ID Jira', t.id_jira);
      if (t.motivo_replanificacion) map.set('Motivo de Replanificación', t.motivo_replanificacion);
    } else {
      if (t.id) map.set('ID', t.id);
      if (t.titulo) map.set('Título de la Iniciativa', t.titulo);
      if (t.etapa_actual) map.set('Etapa Actual', t.etapa_actual);
      if (t.objetivo) map.set('Objetivo', t.objetivo);
      if (t.institucion) map.set('Institución', t.institucion);
      if (t.vp_solicitante) map.set('VP del Área Solicitante', t.vp_solicitante);
      if (t.usuario_negocio) map.set('Usuario Solicitante del Negocio', t.usuario_negocio);
      if (t.it_bp) map.set('IT BP', t.it_bp);
      if (t.fecha_registro) map.set('Fecha de Registro', fmtDateTime(t.fecha_registro));
      if (t.fecha_entrega_requerida) map.set('Fecha Entrega Requerida', fmtDate(t.fecha_entrega_requerida));
      if (t.proyecto_spo) map.set('Proyecto SPO', t.proyecto_spo);
      if (t.tipo_iniciativa) map.set('Tipo de Iniciativa', t.tipo_iniciativa);
      if (t.pilar_estrategico) map.set('Pilar Estratégico', t.pilar_estrategico);
      if (t.estabilizacion_sis) map.set('Estabilización SIS', t.estabilizacion_sis);
      if (t.usuarios_beneficiados) map.set('Usuarios Beneficiados', t.usuarios_beneficiados);
      if (t.beneficio_cuantitativo) map.set('Beneficio Cuantitativo', t.beneficio_cuantitativo);
      if (t.complejidad) map.set('Complejidad', t.complejidad);
      if (t.lider_dominio) map.set('Líder de Dominio', t.lider_dominio);
      if (t.asignado_por) map.set('Asignado por', t.asignado_por);
      if (t.fecha_asignacion) map.set('Fecha Asignación', fmtDate(t.fecha_asignacion));
      if (t.duracion_meses !== null) map.set('Tiempo Estimado (meses)', t.duracion_meses);
      if (t.costo_usd !== null) map.set('Costo en Dólares (USD)', fmtUSD(t.costo_usd));
      if (t.costo_soles !== null) map.set('Costo en Soles (PEN)', fmtMoney(t.costo_soles));
      if (t.tipo_recurso) map.set('Tipo de Recurso', t.tipo_recurso);
      if (t.proyecto_o_req) map.set('Proyecto o Requerimiento', t.proyecto_o_req);
      if (t.funcionalidad_nueva) map.set('Funcionalidad Nueva', t.funcionalidad_nueva);
      if (t.estatus_estimacion) map.set('Estatus Estimación', t.estatus_estimacion);
      if (t.accion_brm) map.set('Acción BRM', t.accion_brm);
      if (t.prioridad_brm) map.set('Prioridad BRM', t.prioridad_brm);
      if (t.fecha_inicio_planificada) map.set('Fecha Inicio Planificada', fmtDate(t.fecha_inicio_planificada));
      if (t.fecha_fin_planificada) map.set('Fecha Fin Planificada', fmtDate(t.fecha_fin_planificada));
      if (t.impacto_sox) map.set('Impacto SOX', t.impacto_sox);
      if (t.aprobar_estimacion) map.set('Aprobar Estimación', t.aprobar_estimacion);
      if (t.presupuesto_habilitado) map.set('Presupuesto Habilitado', t.presupuesto_habilitado);
      if (t.planificacion_aprobada) map.set('Planificación Aprobada', t.planificacion_aprobada);
    }

    // 2. Fusionar ABSOLUTAMENTE TODOS los campos de raw_fields provenientes del Excel
    if (t.raw_fields) {
      for (const [k, v] of Object.entries(t.raw_fields)) {
        if (v !== undefined && v !== null && v !== '') {
          map.set(k, v);
        }
      }
    }

    return Array.from(map.entries()).map(([key, value]) => ({ key, value }));
  }, [t, isPlanificadas]);

  // Filtrado interno en el buscador de campos del detalle
  const filteredRawEntries = useMemo(() => {
    if (!fieldSearch.trim()) return allRawEntries;
    const term = fieldSearch.toLowerCase().trim();
    return allRawEntries.filter(
      item =>
        item.key.toLowerCase().includes(term) ||
        String(item.value ?? '').toLowerCase().includes(term)
    );
  }, [allRawEntries, fieldSearch]);

  const handleCopyField = (key: string, val: unknown) => {
    const text = String(val ?? '');
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleCopyAll = () => {
    const lines = allRawEntries.map(e => `${e.key}: ${String(e.value ?? '—')}`);
    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  // Helper para buscar valor en raw_fields por varias posibles claves
  const getRawVal = (...keys: string[]): unknown => {
    if (!t.raw_fields) return null;
    for (const key of keys) {
      const found = Object.keys(t.raw_fields).find(k => {
        const normK = k.toLowerCase().replace(/[\r\n\s]+/g, ' ').trim();
        const normSearch = key.toLowerCase().replace(/[\r\n\s]+/g, ' ').trim();
        return normK === normSearch || normK.includes(normSearch);
      });
      if (found !== undefined && t.raw_fields[found] !== undefined && t.raw_fields[found] !== '') {
        return t.raw_fields[found];
      }
    }
    return null;
  };

  // Secciones estructuradas
  const sections = useMemo(() => {
    if (isPlanificadas) {
      return [
        {
          title: 'Información General y Solicitante',
          icon: <User size={15} className="text-blue-500" />,
          fields: [
            { label: 'ID Demanda', value: String(t.id).padStart(4, '0') },
            { label: 'Frente', value: t.frente },
            { label: 'Institución', value: t.institucion },
            { label: 'VP / Área Solicitante', value: t.vp_solicitante || t.nombre_vp },
            { label: 'Solicitante', value: t.usuario_negocio },
            { label: 'IT BP', value: t.it_bp },
            { label: 'Líder de Dominio', value: t.lider_dominio },
          ],
        },
        {
          title: 'Seguimiento y Fechas',
          icon: <Calendar size={15} className="text-emerald-500" />,
          fields: [
            { label: 'Estado', value: <EtapaBadge etapa={t.etapa_actual} mode={mode} /> },
            { label: 'Sub Estado', value: t.sub_estado },
            { label: 'Fecha Inicio Planificada', value: fmtDate(t.fecha_inicio_planificada) },
            { label: 'Fecha Fin Planificada', value: fmtDate(t.fecha_fin_planificada) },
            { label: 'Fecha Inicio Real', value: fmtDate(t.fecha_inicio_real ?? null) },
            { label: 'Fecha Fin Real', value: fmtDate(t.fecha_fin_real ?? null) },
            {
              label: '% Desviación',
              value: t.desviacion_pct !== null && t.desviacion_pct !== undefined ? `${t.desviacion_pct}%` : null,
            },
            { label: 'Aviso a Negocio cambio de fecha', value: t.aviso_negocio_cambio_fecha },
            { label: 'Motivo de Replanificación', value: t.motivo_replanificacion },
          ],
        },
        {
          title: 'Costos, Tickets e Integraciones',
          icon: <DollarSign size={15} className="text-purple-500" />,
          fields: [
            { label: 'Costo Soles', value: fmtMoney(t.costo_soles) },
            { label: 'ID SPO', value: getRawVal('ID SPO') ?? (t.proyecto_spo === 'SI' ? 'Sí' : null) },
            { label: 'Ticket SN (RIT)', value: t.ticket_sn_rit },
            { label: 'ID Jira', value: t.id_jira },
          ],
        },
      ];
    }

    // DEMANDA
    return [
      {
        title: 'Información General & Solicitante',
        icon: <User size={15} className="text-blue-500" />,
        fields: [
          { label: 'ID Iniciativa', value: String(t.id).padStart(4, '0') },
          { label: 'Institución', value: t.institucion },
          { label: 'VP Solicitante', value: t.vp_solicitante },
          { label: 'Usuario Solicitante del Negocio', value: t.usuario_negocio },
          { label: 'Correo Solicitante', value: getRawVal('Correo electrónico', 'Email', 'Correo') },
          { label: 'Nombre Solicitante', value: getRawVal('Nombre') },
          { label: 'IT BP Responsable', value: t.it_bp },
          { label: 'Líder de Dominio', value: t.lider_dominio },
          { label: 'Asignado por', value: t.asignado_por },
          { label: 'Fecha de Asignación', value: fmtDate(t.fecha_asignacion) },
          { label: 'Fecha de Registro', value: fmtDateTime(t.fecha_registro) },
          { label: 'Fecha Entrega Requerida', value: fmtDate(t.fecha_entrega_requerida) },
        ],
      },
      {
        title: 'Clasificación Estratégica y Alcance',
        icon: <Layers size={15} className="text-emerald-500" />,
        fields: [
          { label: 'Tipo de Iniciativa', value: t.tipo_iniciativa },
          { label: 'Pilar Estratégico', value: t.pilar_estrategico },
          { label: 'Proyecto o Requerimiento', value: t.proyecto_o_req },
          { label: 'Funcionalidad Nueva', value: t.funcionalidad_nueva },
          { label: 'Proyecto SPO', value: t.proyecto_spo },
          { label: 'Workstream SPO', value: getRawVal('Workstream del proyecto SPO', 'Workstream') },
          { label: 'ID SPO', value: getRawVal('ID SPO') },
          { label: 'Estabilización de Procesos SIS', value: t.estabilizacion_sis },
          { label: 'Impacto SOX', value: t.impacto_sox },
          { label: 'Puntaje Sugerido', value: getRawVal('Puntaje Sugerido', 'Puntaje sugerido', 'Puntaje') },
          { label: 'Usuarios Beneficiados / Afectados', value: t.usuarios_beneficiados },
          { label: 'Beneficio Cuantitativo', value: t.beneficio_cuantitativo },
          { label: 'Beneficios Cualitativos', value: getRawVal('Beneficios cualitativos') },
        ],
      },
      {
        title: 'Estimación, Recursos y Costos',
        icon: <DollarSign size={15} className="text-purple-500" />,
        fields: [
          { label: 'Complejidad Estimada', value: t.complejidad },
          { label: 'Duración Estimada (meses)', value: t.duracion_meses },
          { label: 'Costo Dólares (USD)', value: fmtUSD(t.costo_usd) },
          { label: 'Costo Soles (PEN)', value: fmtMoney(t.costo_soles) },
          { label: 'Tipo de Recurso', value: t.tipo_recurso },
          { label: 'Estatus Estimación', value: t.estatus_estimacion },
          { label: 'Fecha Inicio Estimación', value: fmtDate(getRawVal('Fecha inicio  (estimación)', 'Fecha inicio') as string) },
          { label: 'Fecha Fin Estimación', value: fmtDate(getRawVal('Fecha fin (estimación)', 'Fecha fin') as string) },
        ],
      },
      {
        title: 'Reestimación (si aplica)',
        icon: <Info size={15} className="text-amber-500" />,
        fields: [
          { label: 'Motivo de Reestimación', value: getRawVal('Motivo de Reestimación', 'Reestimación') },
          { label: 'Complejidad Reestimación', value: getRawVal('Complejidad_1', 'Complejidad reestimación') },
          { label: 'Fecha Inicio Reestimación', value: fmtDate(getRawVal('Fecha de inicio reestimación') as string) },
          { label: 'Fecha Fin Reestimación', value: fmtDate(getRawVal('Fecha fin reestimación') as string) },
          { label: 'Tiempo Reestimado (meses)', value: getRawVal('Tiempo estimado\r\n(meses)_1', 'Tiempo estimado (meses)_1') },
          { label: 'Costo Total Soles Reestimación', value: getRawVal('Costo total Soles') ? fmtMoney(Number(getRawVal('Costo total Soles'))) : null },
          { label: 'Estatus Reestimación', value: getRawVal('Estatus Reestimación', 'Estatus Reestimacion') },
        ],
      },
      {
        title: 'Planificación, Aprobaciones y Evidencias',
        icon: <Shield size={15} className="text-indigo-500" />,
        fields: [
          { label: 'Acción BRM', value: t.accion_brm },
          { label: 'Prioridad BRM', value: t.prioridad_brm },
          { label: 'Fecha Inicio Planificada', value: fmtDate(t.fecha_inicio_planificada) },
          { label: 'Fecha Fin Planificada', value: fmtDate(t.fecha_fin_planificada) },
          { label: 'Aprobar Estimación', value: t.aprobar_estimacion },
          { label: 'Presupuesto Habilitado', value: t.presupuesto_habilitado },
          { label: 'Planificación Aprobada', value: t.planificacion_aprobada },
          {
            label: 'Evidencia de Aprobación VP / Director',
            value: getRawVal('Evidencia de la aprobación del VP o Director', 'Evidencia de la aprobación', 'Aprobación'),
          },
          { label: 'Adjuntos / Documentación', value: getRawVal('Adjuntos', 'Adjuntar') },
        ],
      },
    ];
  }, [t, mode, isPlanificadas]);

  // Bloques de texto largo (Objetivo, Descripción, Situación deseada, etc.)
  const narrativeFields = useMemo(() => {
    const list: Array<{ label: string; value: unknown }> = [];

    if (t.objetivo) {
      list.push({ label: 'Objetivo de la Iniciativa', value: t.objetivo });
    }

    const descProb = getRawVal('Descripción del problema o desafío', 'Descripción del problema', 'Descripcion');
    if (descProb) {
      list.push({ label: 'Descripción del Problema o Desafío', value: descProb });
    }

    const sitDes = getRawVal('Situación deseada', 'Situacion deseada');
    if (sitDes) {
      list.push({ label: 'Situación Deseada', value: sitDes });
    }

    const procImp = getRawVal('Procesos y áreas impactadas', 'Procesos impactados');
    if (procImp) {
      list.push({ label: 'Procesos y Áreas Impactadas', value: procImp });
    }

    const asunc = getRawVal('Asunciones', 'Supuestos');
    if (asunc) {
      list.push({ label: 'Asunciones y Supuestos', value: asunc });
    }

    const coments = getRawVal('Comentarios', 'Comentarios_1', 'Comentarios_2', 'Comentarios_3');
    if (coments) {
      list.push({ label: 'Comentarios Adicionales', value: coments });
    }

    return list;
  }, [t]);

  return (
    <div className="bg-slate-50/90 rounded-xl p-5 border border-slate-200/80 shadow-xs space-y-5 text-left">
      {/* Cabecera del detalle */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-start gap-3">
          <div className="bg-blue-600 text-white font-mono text-xs font-bold px-2.5 py-1 rounded-lg shadow-xs shrink-0 mt-0.5">
            ID: {String(t.id).padStart(4, '0')}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-base text-slate-800 leading-snug">{t.titulo}</h3>
              <EtapaBadge etapa={t.etapa_actual} mode={mode} />
            </div>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-3 flex-wrap">
              <span>
                Institución: <strong className="text-slate-700">{t.institucion || '—'}</strong>
              </span>
              <span>•</span>
              <span>
                Solicitante: <strong className="text-slate-700">{t.usuario_negocio || '—'}</strong>
              </span>
              <span>•</span>
              <span>
                IT BP: <strong className="text-slate-700">{t.it_bp || '—'}</strong>
              </span>
              <span>•</span>
              <span>
                Líder Dominio: <strong className="text-slate-700">{t.lider_dominio || '—'}</strong>
              </span>
            </p>
          </div>
        </div>

        {/* Acciones superiores */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleCopyAll}
            className="text-xs px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs transition-all active:scale-95"
            title="Copiar todos los campos del registro"
          >
            {copiedAll ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            <span>{copiedAll ? '¡Copiado!' : 'Copiar todo'}</span>
          </button>

          {!isModal && onOpenModal && (
            <button
              onClick={onOpenModal}
              className="text-xs px-3 py-1.5 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs transition-all active:scale-95"
              title="Abrir en pantalla completa / Modal"
            >
              <Maximize2 size={14} />
              <span>Pantalla Completa</span>
            </button>
          )}
        </div>
      </div>

      {/* Selector de Pestañas y Buscador interno */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2.5 rounded-lg border border-slate-200">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveTab('secciones')}
            className={`text-xs px-3.5 py-1.5 rounded-md font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'secciones'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Layers size={13} />
            <span>Vista Estructurada por Secciones</span>
          </button>
          <button
            onClick={() => setActiveTab('todos')}
            className={`text-xs px-3.5 py-1.5 rounded-md font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'todos'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <FileText size={13} />
            <span>Todos los Campos del Registro ({allRawEntries.length})</span>
          </button>
        </div>

        {/* Buscador de campos */}
        <div className="relative min-w-[240px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Filtrar campos o valores…"
            value={fieldSearch}
            onChange={e => setFieldSearch(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-700"
          />
          {fieldSearch && (
            <button
              onClick={() => setFieldSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* CONTENIDO: TAB 1 (Secciones Estructuradas) */}
      {activeTab === 'secciones' && !fieldSearch && (
        <div className="space-y-4">
          {/* Bloques de texto largo (Objetivo, Descripción del problema, etc.) */}
          {narrativeFields.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {narrativeFields.map((nf, idx) => (
                <div
                  key={idx}
                  className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs flex flex-col justify-between"
                >
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                      {nf.label}
                    </span>
                    <div className="text-xs text-slate-800 leading-relaxed max-h-48 overflow-y-auto pr-1">
                      <FormattedFieldValue value={nf.value} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Secciones en rejilla */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {sections.map(sec => {
              // Filtrar campos que tengan valor
              const validFields = sec.fields.filter(
                f => f.value !== null && f.value !== undefined && f.value !== '' && f.value !== '—'
              );
              if (validFields.length === 0) return null;

              return (
                <div
                  key={sec.title}
                  className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs flex flex-col"
                >
                  <div className="flex items-center gap-2 pb-2.5 mb-3 border-b border-slate-100">
                    {sec.icon}
                    <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wide">
                      {sec.title}
                    </h4>
                  </div>
                  <div className="space-y-2 text-xs divide-y divide-slate-50">
                    {validFields.map(f => (
                      <div key={f.label} className="pt-2 first:pt-0 flex flex-col">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">
                          {f.label}
                        </span>
                        <div className="text-slate-800 font-medium leading-relaxed">
                          <FormattedFieldValue value={f.value} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CONTENIDO: TAB 2 O BÚSQUEDA ACTIVA (Lista Exhaustiva de 100% de los campos) */}
      {(activeTab === 'todos' || fieldSearch) && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center text-xs text-slate-600">
            <span className="font-semibold">
              Mostrando {filteredRawEntries.length} de {allRawEntries.length} campos del registro
            </span>
            {fieldSearch && (
              <span className="text-blue-600 font-medium">
                Filtrado por: "{fieldSearch}"
              </span>
            )}
          </div>
          <div className="max-h-[480px] overflow-y-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-100/70 text-[10px] uppercase font-bold text-slate-500 sticky top-0 z-10 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 w-1/3">Nombre del Campo / Columna</th>
                  <th className="px-4 py-2.5 w-2/3">Valor Registrado</th>
                  <th className="px-3 py-2.5 w-10 text-center">Copiar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRawEntries.map(({ key, value }) => {
                  const isCopied = copiedKey === key;
                  return (
                    <tr key={key} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-4 py-2.5 font-semibold text-slate-700 align-top break-words">
                        {key}
                      </td>
                      <td className="px-4 py-2.5 text-slate-800 align-top leading-relaxed break-words">
                        <FormattedFieldValue value={value} />
                      </td>
                      <td className="px-3 py-2.5 text-center align-top">
                        <button
                          onClick={() => handleCopyField(key, value)}
                          className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Copiar valor"
                        >
                          {isCopied ? (
                            <Check size={13} className="text-emerald-600" />
                          ) : (
                            <Copy size={13} />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filteredRawEntries.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                      No se encontraron campos que coincidan con "{fieldSearch}".
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal de Detalle de Iniciativa en Pantalla Completa
// ---------------------------------------------------------------------------
interface IniciativaDetailModalProps {
  iniciativa: Iniciativa | null;
  onClose: () => void;
  mode?: 'demanda' | 'planificadas';
}

export function IniciativaDetailModal({ iniciativa, onClose, mode = 'demanda' }: IniciativaDetailModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (iniciativa) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [iniciativa, onClose]);

  if (!iniciativa) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-label="Cerrar modal"
      />
      <div className="relative bg-white w-full max-w-5xl max-h-[92vh] rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col z-10 animate-in zoom-in-95 duration-150">
        {/* Cabecera del modal */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
              TI
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">
                Detalle Completo de la Iniciativa
              </h2>
              <p className="text-[11px] text-slate-400">
                Todos los campos, registros y enlaces del archivo Excel
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Cuerpo con scroll */}
        <div className="flex-1 overflow-y-auto p-6">
          <IniciativaDetail t={iniciativa} mode={mode} isModal={true} />
        </div>

        {/* Pie del modal */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fila expandible de la tabla
// ---------------------------------------------------------------------------
function ExpandedRow({
  t,
  mode = 'demanda',
  colSpan = 12,
  onOpenModal,
}: {
  t: Iniciativa;
  mode?: 'demanda' | 'planificadas';
  colSpan?: number;
  onOpenModal: () => void;
}) {
  return (
    <tr className="bg-slate-50/60 border-b border-slate-200/80 animate-in fade-in duration-150">
      <td colSpan={colSpan} className="px-4 sm:px-6 py-4">
        <IniciativaDetail t={t} mode={mode} onOpenModal={onOpenModal} isModal={false} />
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Componente principal DataTable
// ---------------------------------------------------------------------------
export function DataTable({
  iniciativas,
  expandedId: propExpandedId,
  onExpandedIdChange,
  mode = 'demanda',
}: DataTableProps) {
  const isPlanificadas = mode === 'planificadas';
  const [modalIniciativa, setModalIniciativa] = useState<Iniciativa | null>(null);

  const COLUMNS: ColumnDef[] = useMemo(() => {
    if (isPlanificadas) {
      return [
        {
          id: 'id',
          label: 'ID Demanda',
          sortKey: 'id',
          render: t => String(t.id).padStart(4, '0'),
          className: 'font-mono text-slate-500 text-xs whitespace-nowrap',
        },
        {
          id: 'frente',
          label: 'Frente',
          sortKey: 'frente' as any,
          render: t => t.frente || '—',
          className: 'whitespace-nowrap font-medium text-slate-700',
        },
        {
          id: 'titulo',
          label: 'Título de la Iniciativa',
          sortKey: 'titulo',
          render: t => (
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-slate-800 leading-snug">{t.titulo}</span>
            </div>
          ),
          className: 'min-w-[280px]',
        },
        {
          id: 'etapa_actual',
          label: 'Estado',
          sortKey: 'etapa_actual',
          render: t => <EtapaBadge etapa={t.etapa_actual} mode={mode} />,
        },
        {
          id: 'sub_estado',
          label: 'Sub Estado',
          sortKey: 'sub_estado' as any,
          render: t => t.sub_estado || '—',
          className: 'whitespace-nowrap text-slate-600',
        },
        {
          id: 'lider_dominio',
          label: 'Líder de Dominio',
          sortKey: 'lider_dominio',
          render: t => t.lider_dominio || '—',
          className: 'whitespace-nowrap text-slate-700 min-w-[150px]',
        },
        {
          id: 'it_bp',
          label: 'IT BP',
          sortKey: 'it_bp',
          render: t => t.it_bp || '—',
          className: 'whitespace-nowrap text-slate-600',
        },
        {
          id: 'costo_soles',
          label: 'Costo Soles',
          sortKey: 'costo_soles',
          render: t => fmtMoney(t.costo_soles),
          className: 'text-right font-mono text-slate-600 whitespace-nowrap',
        },
        {
          id: 'fecha_inicio_planificada',
          label: 'F. Inicio Planificada',
          sortKey: 'fecha_inicio_planificada',
          render: t => fmtDate(t.fecha_inicio_planificada),
          className: 'whitespace-nowrap text-xs text-slate-600',
        },
        {
          id: 'fecha_fin_planificada',
          label: 'F. Fin Planificada',
          sortKey: 'fecha_fin_planificada',
          render: t => fmtDate(t.fecha_fin_planificada),
          className: 'whitespace-nowrap text-xs text-slate-600',
        },
        {
          id: 'fecha_inicio_real',
          label: 'F. Inicio Real',
          sortKey: 'fecha_inicio_real' as any,
          render: t => fmtDate(t.fecha_inicio_real ?? null),
          className: 'whitespace-nowrap text-xs text-slate-600',
        },
        {
          id: 'fecha_fin_real',
          label: 'F. Fin Real',
          sortKey: 'fecha_fin_real' as any,
          render: t => fmtDate(t.fecha_fin_real ?? null),
          className: 'whitespace-nowrap text-xs text-slate-600',
        },
        {
          id: 'id_jira',
          label: 'ID Jira',
          sortKey: 'id_jira' as any,
          render: t => (t.id_jira ? <AutoLinkText text={t.id_jira} /> : '—'),
          className: 'whitespace-nowrap text-xs text-slate-600',
        },
      ];
    }

    return [
      {
        id: 'id',
        label: 'ID',
        sortKey: 'id',
        render: t => String(t.id).padStart(4, '0'),
        className: 'font-mono text-slate-500 text-xs whitespace-nowrap',
      },
      {
        id: 'institucion',
        label: 'Institución',
        sortKey: 'institucion',
        render: t => t.institucion || '—',
        className: 'whitespace-nowrap font-medium text-slate-700',
      },
      {
        id: 'titulo',
        label: 'Título de la Iniciativa',
        sortKey: 'titulo',
        render: t => (
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-slate-800 leading-snug">{t.titulo}</span>
          </div>
        ),
        className: 'min-w-[280px]',
      },
      {
        id: 'etapa_actual',
        label: 'Etapa',
        sortKey: 'etapa_actual',
        render: t => <EtapaBadge etapa={t.etapa_actual} mode={mode} />,
      },
      {
        id: 'lider_dominio',
        label: 'Líder de Dominio',
        sortKey: 'lider_dominio',
        render: t => t.lider_dominio || '—',
        className: 'whitespace-nowrap text-slate-700 min-w-[150px]',
      },
      {
        id: 'it_bp',
        label: 'IT BP',
        sortKey: 'it_bp',
        render: t => t.it_bp || '—',
        className: 'whitespace-nowrap text-slate-600',
      },
      {
        id: 'duracion_meses',
        label: 'Tiempo estimado (meses)',
        sortKey: 'duracion_meses',
        render: t => t.duracion_meses ?? '—',
        className: 'text-center font-mono text-slate-600',
      },
      {
        id: 'costo_usd',
        label: 'Costo en dólares',
        sortKey: 'costo_usd',
        render: t => (t.costo_usd ? `$ ${t.costo_usd.toLocaleString('en-US')}` : '—'),
        className: 'text-right font-mono text-slate-600 whitespace-nowrap',
      },
      {
        id: 'costo_soles',
        label: 'Costo Soles',
        sortKey: 'costo_soles',
        render: t => fmtMoney(t.costo_soles),
        className: 'text-right font-mono text-slate-600 whitespace-nowrap',
      },
      {
        id: 'fecha_inicio_planificada',
        label: 'Fecha Inicio (planificada)',
        sortKey: 'fecha_inicio_planificada',
        render: t => fmtDate(t.fecha_inicio_planificada),
        className: 'whitespace-nowrap text-xs text-slate-600',
      },
      {
        id: 'fecha_fin_planificada',
        label: 'Fecha fin (planificada)',
        sortKey: 'fecha_fin_planificada',
        render: t => fmtDate(t.fecha_fin_planificada),
        className: 'whitespace-nowrap text-xs text-slate-600',
      },
    ];
  }, [isPlanificadas, mode]);

  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [localExpandedId, setLocalExpandedId] = useState<number | null>(null);

  const expandedId = propExpandedId !== undefined ? propExpandedId : localExpandedId;
  const setExpandedId = (id: number | null) => {
    if (onExpandedIdChange) {
      onExpandedIdChange(id);
    } else {
      setLocalExpandedId(id);
    }
  };

  const [sortConfig, setSortConfig] = useState<{ key: keyof Iniciativa; direction: 'asc' | 'desc' } | null>(null);
  const [columnOrder, setColumnOrder] = useState<string[]>(COLUMNS.map(c => c.id));
  const [draggedCol, setDraggedCol] = useState<string | null>(null);

  const orderedColumns = columnOrder.map(id => COLUMNS.find(c => c.id === id)!).filter(Boolean) as ColumnDef[];

  useEffect(() => {
    setColumnOrder(COLUMNS.map(c => c.id));
  }, [mode, COLUMNS]);

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
    if (expandedId !== null && !iniciativas.some(t => t.id === expandedId)) {
      setExpandedId(null);
    }
  }, [iniciativas]);

  const handleSort = (key: keyof Iniciativa) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleDragStart = (e: React.DragEvent, colId: string) => {
    setDraggedCol(colId);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };
  const handleDrop = (e: React.DragEvent, targetColId: string) => {
    e.preventDefault();
    if (!draggedCol || draggedCol === targetColId) return;
    const newOrder = [...columnOrder];
    const fromIndex = newOrder.indexOf(draggedCol);
    const toIndex = newOrder.indexOf(targetColId);
    newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, draggedCol);
    setColumnOrder(newOrder);
    setDraggedCol(null);
  };

  const handleToggleSelectAll = () => {
    const allSelected = paginated.length > 0 && paginated.every(t => selectedIds.has(t.id));
    const next = new Set(selectedIds);
    if (allSelected) {
      paginated.forEach(t => next.delete(t.id));
    } else {
      paginated.forEach(t => next.add(t.id));
    }
    setSelectedIds(next);
  };

  const handleToggleSelectRow = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleSendEmail = async () => {
    if (selectedIds.size === 0) return;

    const selectedRows = iniciativas.filter(t => selectedIds.has(t.id));

    let plainText = `Hola\n\n`;
    if (isPlanificadas) {
      plainText += `ID\tTítulo\tVP Área Solicitante\tIT BP\tEstado\tF. Inicio Planificada\tF. Fin Planificada\tF. Inicio Real\tF. Fin Real\tID Jira\n`;
    } else {
      plainText += `ID\tTítulo\tVP Área Solicitante\tIT BP\tEstado\tF. Inicio Planificada\tF. Fin Planificada\n`;
    }
    plainText += `----------------------------------------------------------------------------------------------------\n`;
    selectedRows.forEach(t => {
      const idStr = String(t.id).padStart(4, '0');
      const stageCfg = isPlanificadas
        ? ETAPAS_PLANIFICADAS_MAP.get(t.etapa_actual)
        : ETAPAS_MAP.get(t.etapa_actual);
      const estado = stageCfg ? stageCfg.label : t.etapa_actual;

      if (isPlanificadas) {
        plainText += `${idStr}\t${t.titulo}\t${t.vp_solicitante || '—'}\t${t.it_bp || '—'}\t${estado}\t${fmtDate(
          t.fecha_inicio_planificada
        )}\t${fmtDate(t.fecha_fin_planificada)}\t${fmtDate(t.fecha_inicio_real ?? null)}\t${fmtDate(
          t.fecha_fin_real ?? null
        )}\t${t.id_jira || '—'}\n`;
      } else {
        plainText += `${idStr}\t${t.titulo}\t${t.vp_solicitante || '—'}\t${t.it_bp || '—'}\t${estado}\t${fmtDate(
          t.fecha_inicio_planificada
        )}\t${fmtDate(t.fecha_fin_planificada)}\n`;
      }
    });

    let htmlString = `<table border="1" style="border-collapse: collapse; font-family: Calibri, Arial, sans-serif; font-size: 11pt; border: 1px solid #cbd5e1; width: 100%;">`;
    htmlString += `<thead><tr style="background-color: #f8fafc; text-align: left; font-weight: bold;">`;
    htmlString += `<th style="padding: 8px; border: 1px solid #cbd5e1;">ID</th>`;
    htmlString += `<th style="padding: 8px; border: 1px solid #cbd5e1;">Título</th>`;
    htmlString += `<th style="padding: 8px; border: 1px solid #cbd5e1;">VP Área Solicitante</th>`;
    htmlString += `<th style="padding: 8px; border: 1px solid #cbd5e1;">IT BP</th>`;
    htmlString += `<th style="padding: 8px; border: 1px solid #cbd5e1;">Estado</th>`;
    htmlString += `<th style="padding: 8px; border: 1px solid #cbd5e1;">F. Inicio Planificada</th>`;
    htmlString += `<th style="padding: 8px; border: 1px solid #cbd5e1;">F. Fin Planificada</th>`;
    if (isPlanificadas) {
      htmlString += `<th style="padding: 8px; border: 1px solid #cbd5e1;">F. Inicio Real</th>`;
      htmlString += `<th style="padding: 8px; border: 1px solid #cbd5e1;">F. Fin Real</th>`;
      htmlString += `<th style="padding: 8px; border: 1px solid #cbd5e1;">ID Jira</th>`;
    }
    htmlString += `</tr></thead><tbody>`;

    selectedRows.forEach(t => {
      const idStr = String(t.id).padStart(4, '0');
      const stageCfg = isPlanificadas
        ? ETAPAS_PLANIFICADAS_MAP.get(t.etapa_actual)
        : ETAPAS_MAP.get(t.etapa_actual);
      const estado = stageCfg ? stageCfg.label : t.etapa_actual;

      htmlString += `<tr>`;
      htmlString += `<td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold; color: #2563eb; font-family: monospace;">${idStr}</td>`;
      htmlString += `<td style="padding: 8px; border: 1px solid #cbd5e1;">${t.titulo}</td>`;
      htmlString += `<td style="padding: 8px; border: 1px solid #cbd5e1;">${t.vp_solicitante || '—'}</td>`;
      htmlString += `<td style="padding: 8px; border: 1px solid #cbd5e1;">${t.it_bp || '—'}</td>`;
      htmlString += `<td style="padding: 8px; border: 1px solid #cbd5e1;">${estado}</td>`;
      htmlString += `<td style="padding: 8px; border: 1px solid #cbd5e1;">${fmtDate(t.fecha_inicio_planificada)}</td>`;
      htmlString += `<td style="padding: 8px; border: 1px solid #cbd5e1;">${fmtDate(t.fecha_fin_planificada)}</td>`;
      if (isPlanificadas) {
        htmlString += `<td style="padding: 8px; border: 1px solid #cbd5e1;">${fmtDate(t.fecha_inicio_real ?? null)}</td>`;
        htmlString += `<td style="padding: 8px; border: 1px solid #cbd5e1;">${fmtDate(t.fecha_fin_real ?? null)}</td>`;
        htmlString += `<td style="padding: 8px; border: 1px solid #cbd5e1;">${t.id_jira || '—'}</td>`;
      }
      htmlString += `</tr>`;
    });
    htmlString += `</tbody></table>`;

    try {
      const blobHtml = new Blob([`<p>Hola</p><br/>` + htmlString], { type: 'text/html' });
      const blobText = new Blob([plainText], { type: 'text/plain' });
      const dataItems = [new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })];
      await navigator.clipboard.write(dataItems);
    } catch {
      // Ignore copy error
    }

    const emlContent = [
      'Subject: Iniciativas TI',
      'X-Unsent: 1',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<!DOCTYPE html>',
      '<html>',
      '  <head>',
      '    <meta charset="utf-8">',
      '  </head>',
      '  <body style="font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1e293b;">',
      '    <p>Hola</p>',
      '    <br/>',
      htmlString,
      '  </body>',
      '</html>',
    ].join('\r\n');

    const blob = new Blob([emlContent], { type: 'message/rfc822' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `iniciativa_email_${format(new Date(), 'yyyyMMdd_HHmmss')}.eml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const sortedIniciativas = useMemo(() => {
    let sortableItems = [...iniciativas];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        if (aValue === null || aValue === undefined) aValue = '';
        if (bValue === null || bValue === undefined) bValue = '';

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [iniciativas, sortConfig]);

  const totalPages = Math.ceil(sortedIniciativas.length / ITEMS_PER_PAGE);

  const paginated = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return sortedIniciativas.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedIniciativas, page]);

  const renderSortIcon = (key: keyof Iniciativa) => {
    if (!sortConfig || sortConfig.key !== key) {
      return (
        <ArrowUpDown
          size={13}
          className="inline-block ml-1 opacity-40 group-hover:opacity-100 transition-opacity"
        />
      );
    }
    return sortConfig.direction === 'asc' ? (
      <ArrowUp size={13} className="inline-block ml-1 text-blue-600" />
    ) : (
      <ArrowDown size={13} className="inline-block ml-1 text-blue-600" />
    );
  };

  const downloadCSV = () => {
    const headers = orderedColumns.map(c => c.label);

    const rows = sortedIniciativas.map(t =>
      orderedColumns.map(col => {
        const val = t[col.sortKey as keyof Iniciativa];
        if (val === null || val === undefined) return '';
        if (
          col.sortKey === 'fecha_inicio_planificada' ||
          col.sortKey === 'fecha_fin_planificada' ||
          col.sortKey === 'fecha_registro' ||
          col.sortKey === 'fecha_entrega_requerida'
        ) {
          return escapeCsvField(fmtDate(val as string));
        }
        return escapeCsvField(String(val));
      })
    );

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const bom = '\uFEFF';
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `iniciativas_ti_${format(new Date(), 'yyyyMMdd')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-xl shadow-xs border border-gray-100 overflow-hidden">
      {/* Cabecera de la tabla */}
      <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
        <div>
          <h3 className="font-semibold text-gray-800">Detalle de Iniciativas</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {iniciativas.length} resultado{iniciativas.length !== 1 ? 's' : ''}
            {totalPages > 1 && ` · Página ${page} de ${totalPages}`}
          </p>
        </div>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <button
              onClick={handleSendEmail}
              className="text-sm px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-xs rounded-lg flex items-center gap-2 font-semibold transition-all active:scale-95 animate-in fade-in slide-in-from-right-4 duration-200"
            >
              <Mail size={15} />
              Enviar mail ({selectedIds.size})
            </button>
          )}
          <button
            onClick={downloadCSV}
            className="text-sm px-3 py-1.5 bg-white border border-gray-200 shadow-xs rounded-lg hover:bg-gray-50 flex items-center gap-2 text-gray-700 font-medium transition-colors"
          >
            <FileDown size={15} />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] text-left text-gray-600">
          <thead className="text-[11px] text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-3 py-3 w-8" />
              <th className="px-2 py-3 w-8 text-center" title="Ver detalle en modal">
                <Eye size={13} className="text-gray-400 mx-auto" />
              </th>
              <th className="px-3 py-3 w-8 text-center">
                <input
                  type="checkbox"
                  checked={paginated.length > 0 && paginated.every(t => selectedIds.has(t.id))}
                  onChange={handleToggleSelectAll}
                  className="w-3.5 h-3.5 accent-blue-600 rounded cursor-pointer"
                  title="Seleccionar todos los visibles"
                />
              </th>
              {orderedColumns.map(col => (
                <th
                  key={col.id}
                  draggable
                  onDragStart={e => handleDragStart(e, col.id)}
                  onDragOver={handleDragOver}
                  onDrop={e => handleDrop(e, col.id)}
                  className={`px-3 py-3 whitespace-nowrap cursor-move select-none hover:bg-gray-200 transition-colors group ${
                    draggedCol === col.id ? 'opacity-50 bg-gray-200' : ''
                  }`}
                  onClick={() => col.sortKey && handleSort(col.sortKey)}
                  title="Arrastra para mover la columna"
                >
                  <div className="flex items-center gap-1 cursor-pointer">
                    <span>{col.label}</span>
                    {col.sortKey && renderSortIcon(col.sortKey)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.map(t => (
              <React.Fragment key={t.id}>
                <tr className="bg-white border-b border-gray-50 hover:bg-slate-50/70 transition-colors">
                  {/* Botón de expandir fila */}
                  <td className="px-3 py-2">
                    <button
                      onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                      className="text-gray-400 hover:text-blue-500 transition-colors"
                      aria-label={expandedId === t.id ? 'Contraer' : 'Expandir'}
                    >
                      {expandedId === t.id ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </button>
                  </td>
                  {/* Botón de modal rápido */}
                  <td className="px-2 py-2 text-center">
                    <button
                      onClick={() => setModalIniciativa(t)}
                      className="text-gray-400 hover:text-blue-600 hover:bg-blue-50 p-1 rounded transition-all"
                      title="Abrir detalle completo en pantalla modal"
                    >
                      <Eye size={14} />
                    </button>
                  </td>
                  {/* Checkbox selector */}
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(t.id)}
                      onChange={() => handleToggleSelectRow(t.id)}
                      className="w-3.5 h-3.5 accent-blue-600 rounded cursor-pointer"
                    />
                  </td>
                  {/* Celdas dinámicas */}
                  {orderedColumns.map(col => (
                    <td key={col.id} className={`px-3 py-2 ${col.className || ''}`}>
                      {col.render(t)}
                    </td>
                  ))}
                </tr>

                {/* Fila de detalle expandible */}
                {expandedId === t.id && (
                  <ExpandedRow
                    t={t}
                    mode={mode}
                    colSpan={orderedColumns.length + 3}
                    onOpenModal={() => setModalIniciativa(t)}
                  />
                )}
              </React.Fragment>
            ))}

            {paginated.length === 0 && (
              <tr>
                <td colSpan={orderedColumns.length + 3} className="px-4 py-12 text-center text-gray-400 text-sm">
                  No hay iniciativas que coincidan con los filtros activos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="p-4 flex justify-between items-center text-sm text-gray-500 border-t border-gray-100">
          <span className="text-xs">
            Mostrando {(page - 1) * ITEMS_PER_PAGE + 1}–
            {Math.min(page * ITEMS_PER_PAGE, iniciativas.length)} de {iniciativas.length}
          </span>
          <div className="flex gap-1">
            <button
              disabled={page === 1}
              onClick={() => setPage(1)}
              className="px-2 py-1 rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-50 text-xs"
              aria-label="Primera página"
            >
              «
            </button>
            <button
              disabled={page === 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="px-3 py-1 rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-50 shadow-xs"
            >
              Anterior
            </button>
            <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded border border-blue-200 font-semibold text-xs">
              {page}
            </span>
            <button
              disabled={page === totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="px-3 py-1 rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-50 shadow-xs"
            >
              Siguiente
            </button>
            <button
              disabled={page === totalPages}
              onClick={() => setPage(totalPages)}
              className="px-2 py-1 rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-50 text-xs"
              aria-label="Última página"
            >
              »
            </button>
          </div>
        </div>
      )}

      {/* Modal de Detalle */}
      <IniciativaDetailModal
        iniciativa={modalIniciativa}
        onClose={() => setModalIniciativa(null)}
        mode={mode}
      />
    </div>
  );
}
