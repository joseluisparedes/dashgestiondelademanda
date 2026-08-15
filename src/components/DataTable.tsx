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
  AlertTriangle,
  ClipboardCheck,
  RefreshCw,
  Banknote,
  CalendarCheck,
  ClipboardList,
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
// Helpers para etiquetas amigables de URLs
// ---------------------------------------------------------------------------
function getFriendlyUrlLabel(rawUrl: string): string {
  try {
    const urlObj = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);

    // 1. Buscar si tiene parámetro 'file' o 'filename' en query params (SharePoint / OneDrive / GDrive)
    const fileParam = urlObj.searchParams.get('file') || urlObj.searchParams.get('filename') || urlObj.searchParams.get('name');
    if (fileParam) {
      try {
        return decodeURIComponent(fileParam);
      } catch {
        return fileParam;
      }
    }

    // 2. Buscar si el pathname termina en un archivo (ej: /docs/archivo.pdf)
    const pathSegments = urlObj.pathname.split('/').filter(Boolean);
    if (pathSegments.length > 0) {
      const lastSegment = pathSegments[pathSegments.length - 1];
      if (/\.[a-zA-Z0-9]{2,5}$/.test(lastSegment) && !lastSegment.includes('aspx') && !lastSegment.includes('php')) {
        try {
          return decodeURIComponent(lastSegment);
        } catch {
          return lastSegment;
        }
      }
    }

    // 3. Casos según dominio
    const host = urlObj.hostname.toLowerCase();
    if (host.includes('sharepoint.com') || host.includes('onedrive')) {
      return 'Ver documento en SharePoint';
    }
    if (host.includes('jira') || host.includes('atlassian')) {
      return 'Ver ticket en Jira';
    }
    if (host.includes('servicenow') || host.includes('service-now')) {
      return 'Ver en ServiceNow';
    }
    if (host.includes('teams.microsoft.com')) {
      return 'Ver en Microsoft Teams';
    }

    // 4. Si la URL es larga, mostrar el dominio simplificado
    if (rawUrl.length > 35) {
      const cleanHost = urlObj.hostname.replace(/^www\./, '');
      return `Abrir enlace (${cleanHost})`;
    }

    return rawUrl;
  } catch {
    if (rawUrl.length > 35) {
      return 'Abrir enlace externo';
    }
    return rawUrl;
  }
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
    const label = isEmail ? match : getFriendlyUrlLabel(match);

    parts.push(
      <a
        key={offset}
        href={href}
        target={isEmail ? '_self' : '_blank'}
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        className="inline-flex items-center gap-1.5 font-medium text-blue-600 hover:text-blue-800 underline decoration-blue-300 hover:decoration-blue-600 transition-colors bg-blue-50/90 hover:bg-blue-100 border border-blue-200/60 px-2.5 py-1 rounded text-xs mx-0.5 max-w-full shadow-2xs"
        title={isEmail ? `Enviar correo a ${match}` : `Abrir enlace: ${match}`}
      >
        <span className="break-words whitespace-normal leading-snug">{label}</span>
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
  const [narrativeOpen, setNarrativeOpen] = useState(false);
  const [registroOpen, setRegistroOpen] = useState(false);
  const [estimacionOpen, setEstimacionOpen] = useState(true);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
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

  // Pipeline de estados para el stepper visual (modo demanda).
  // 'registro_incompleto' NO está en el flujo lineal: es un estado lateral
  // de observación. La iniciativa vuelve al flujo normal al subsanar sus datos.
  const PIPELINE_STEPS = [
    { key: 'por_estimar',               label: 'Por Estimar',      short: 'Por Estimar' },
    { key: 'por_reestimar',             label: 'Por Reestimar',    short: 'Reestimar'   },
    { key: 'por_aprobar_estimacion',    label: 'Ap. Estimación',   short: 'Ap. Est.'    },
    { key: 'por_habilitar_presupuesto', label: 'Hab. Presupuesto', short: 'Presup.'     },
    { key: 'por_planificar',            label: 'Por Planificar',   short: 'Planificar'  },
    { key: 'aprobar_planificacion',     label: 'Ap. Planificación',short: 'Ap. Plan.'   },
    { key: 'planificadas',              label: 'Planificadas',     short: 'Planificada' },
  ] as const;

  const isRegistroIncompleto = t.etapa_actual === 'registro_incompleto';
  const currentPipelineIndex = PIPELINE_STEPS.findIndex(s => s.key === t.etapa_actual);

  // Secciones estructuradas
  const sections = useMemo(() => {
    if (isPlanificadas) {
      return [
        {
          title: 'Información General y Solicitante',
          icon: <User size={15} className="text-blue-500" />,
          etapaKey: null as string | null,
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
          etapaKey: null as string | null,
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
          etapaKey: null as string | null,
          fields: [
            { label: 'Costo Soles', value: fmtMoney(t.costo_soles) },
            { label: 'ID SPO', value: getRawVal('ID SPO') ?? (t.proyecto_spo === 'SI' ? 'Sí' : null) },
            { label: 'Ticket SN (RIT)', value: t.ticket_sn_rit },
            { label: 'ID Jira', value: t.id_jira },
          ],
        },
      ];
    }

    // -------------------------------------------------------------------------
    // DEMANDA: Secciones alineadas a la secuencia de estados del pipeline
    // Columnas del Excel:
    //   Registro (A–AA) | Incompleto (motivo: AP) | Estimación (AB–AP)
    //   Reestimación (AQ–BA) | Ap. Estimación (BB–BC) | Ap. Presupuesto (BD–BE)
    //   Por Planificar (BF–BG) | Ap. Planificación (BH–BI)
    // -------------------------------------------------------------------------
    return [
      // ── 1. REGISTRO DE LA INICIATIVA (Cols A–AA) ────────────────────────────
      {
        etapaKey: 'registro',
        title: '1 · Registro de la Iniciativa',
        icon: <ClipboardList size={15} className="text-blue-500" />,
        fields: [
          { label: 'ID Iniciativa', value: String(t.id).padStart(4, '0') },
          { label: 'Fecha de Registro', value: fmtDateTime(t.fecha_registro) },
          { label: 'Institución', value: t.institucion },
          { label: 'VP Solicitante', value: t.vp_solicitante },
          { label: 'Usuario / Gerencia Solicitante', value: t.usuario_negocio },
          { label: 'Correo Solicitante', value: getRawVal('Correo electrónico', 'Email', 'Correo') },
          { label: 'Nombre Solicitante', value: getRawVal('Nombre') },
          { label: 'IT BP Responsable', value: t.it_bp },
          { label: 'Fecha Entrega Requerida', value: fmtDate(t.fecha_entrega_requerida) },
          { label: 'Tipo de Iniciativa', value: t.tipo_iniciativa },
          { label: 'Pilar Estratégico', value: t.pilar_estrategico },
          { label: 'Proyecto o Requerimiento (No BAU)', value: t.proyecto_o_req },
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
          { label: 'Evidencia de Aprobación VP / Director', value: getRawVal('Evidencia de la aprobación del VP o Director', 'Evidencia de la aprobación', 'Aprobación') },
          { label: 'Adjuntos / Documentación', value: getRawVal('Adjuntos', 'Adjuntar') },
        ],
      },

      // ── 2. REGISTRO INCOMPLETO (motivo en col AP) ────────────────────────────
      // Solo se muestra si la iniciativa está efectivamente en la pestaña 'Registro incompleto'
      ...(t.etapa_actual === 'registro_incompleto' ? [{
        etapaKey: 'registro_incompleto',
        title: '2 · Registro Incompleto',
        icon: <AlertTriangle size={15} className="text-red-500" />,
        fields: [
          { label: 'Motivo de Registro Incompleto', value: getRawVal('Completar información', 'Motivo', 'STRING') },
          { label: 'Asignado por', value: t.asignado_por },
          { label: 'Fecha de Asignación', value: fmtDate(t.fecha_asignacion) },
          { label: 'Líder de Dominio Asignado', value: t.lider_dominio },
        ],
      }] : []),

      // ── 3. ESTIMACIÓN (Cols AB–AP) ────────────────────────────────────────────
      {
        etapaKey: 'por_estimar',
        title: '3 · Estimación',
        icon: <DollarSign size={15} className="text-amber-500" />,
        fields: [
          { label: 'Líder de Dominio', value: t.lider_dominio },
          { label: 'Asignado por', value: t.asignado_por },
          { label: 'Fecha de Asignación al LD', value: fmtDate(t.fecha_asignacion) },
          { label: 'Complejidad Estimada', value: t.complejidad },
          { label: 'Duración Estimada (meses)', value: t.duracion_meses },
          { label: 'Tipo de Recurso', value: t.tipo_recurso },
          { label: 'Costo Dólares (USD)', value: fmtUSD(t.costo_usd) },
          { label: 'Costo Soles (PEN)', value: fmtMoney(t.costo_soles) },
          { label: 'Fecha Inicio Estimación', value: fmtDate(getRawVal('Fecha inicio  (estimación)', 'Fecha inicio (estimación)', 'Fecha inicio') as string) },
          { label: 'Fecha Fin Estimación', value: fmtDate(getRawVal('Fecha fin (estimación)', 'Fecha fin') as string) },
          { label: 'Estatus Estimación', value: t.estatus_estimacion },
          { label: 'Acción BRM', value: t.accion_brm },
          { label: 'Prioridad BRM', value: t.prioridad_brm },
        ],
      },

      // ── 4. REESTIMACIÓN (Cols AQ–BA) ─────────────────────────────────────────
      {
        etapaKey: 'por_reestimar',
        title: '4 · Reestimación',
        icon: <RefreshCw size={15} className="text-orange-500" />,
        fields: [
          { label: 'Motivo de Reestimación', value: getRawVal('Motivo de Reestimación', 'Motivo de Reestimacion', 'Reestimación') },
          { label: 'Complejidad Reestimada', value: getRawVal('Complejidad_1', 'Complejidad reestimación') },
          { label: 'Duración Reestimada (meses)', value: getRawVal('Tiempo estimado\r\n(meses)_1', 'Tiempo estimado (meses)_1') },
          { label: 'Costo Total USD Reestimación', value: getRawVal('Costo total dolares') ? fmtUSD(Number(getRawVal('Costo total dolares'))) : null },
          { label: 'Costo Total Soles Reestimación', value: getRawVal('Costo total Soles') ? fmtMoney(Number(getRawVal('Costo total Soles'))) : null },
          { label: 'Fecha Inicio Reestimación', value: fmtDate(getRawVal('Fecha de inicio reestimación', 'Fecha inicio reestimación') as string) },
          { label: 'Fecha Fin Reestimación', value: fmtDate(getRawVal('Fecha fin reestimación') as string) },
          { label: 'Estatus Reestimación', value: getRawVal('Estatus Reestimación', 'Estatus Reestimacion') },
        ],
      },

      // ── 5. POR APROBAR ESTIMACIÓN (Cols BB–BC) ───────────────────────────────
      {
        etapaKey: 'por_aprobar_estimacion',
        title: '5 · Aprobación de Estimación',
        icon: <ClipboardCheck size={15} className="text-violet-500" />,
        fields: [
          { label: 'Estado Aprobación Estimación', value: t.aprobar_estimacion },
          { label: 'Fecha Máxima de Estimación', value: fmtDate(getRawVal('Fecha máxima de estimación', 'Fecha maxima estimacion') as string) },
        ],
      },

      // ── 6. POR APROBAR PRESUPUESTO (Cols BD–BE) ──────────────────────────────
      {
        etapaKey: 'por_habilitar_presupuesto',
        title: '6 · Habilitación de Presupuesto',
        icon: <Banknote size={15} className="text-cyan-600" />,
        fields: [
          { label: 'Presupuesto Habilitado', value: t.presupuesto_habilitado },
        ],
      },

      // ── 7. POR PLANIFICAR (Cols BF–BG) ──────────────────────────────────────
      {
        etapaKey: 'por_planificar',
        title: '7 · Planificación',
        icon: <Calendar size={15} className="text-emerald-500" />,
        fields: [
          { label: 'Fecha Inicio Planificada', value: fmtDate(t.fecha_inicio_planificada) },
          { label: 'Fecha Fin Planificada', value: fmtDate(t.fecha_fin_planificada) },
        ],
      },

      // ── 8. APROBAR PLANIFICACIÓN (Cols BH–BI) ───────────────────────────────
      {
        etapaKey: 'aprobar_planificacion',
        title: '8 · Aprobación de Planificación',
        icon: <CalendarCheck size={15} className="text-green-600" />,
        fields: [
          { label: 'Planificación Aprobada', value: t.planificacion_aprobada },
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

      {/* Stepper visual del pipeline (solo modo demanda) */}
      {!isPlanificadas && (
        <div className="overflow-x-auto pb-1">
          <div className="flex items-center gap-1">
            {/* Badge lateral: estado Registro Incompleto (fuera del flujo lineal) */}
            {isRegistroIncompleto && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[10px] font-bold mr-2 shrink-0">
                <AlertTriangle size={11} />
                <span>Registro Incompleto</span>
                <span className="text-red-400 font-normal">— Subsanar para retomar flujo</span>
              </div>
            )}

            {/* Pasos del pipeline lineal */}
            <div className="flex items-center min-w-max gap-0">
              {PIPELINE_STEPS.map((step, idx) => {
                const isDone = !isRegistroIncompleto && idx < currentPipelineIndex;
                const isCurrent = !isRegistroIncompleto && idx === currentPipelineIndex;
                return (
                  <React.Fragment key={step.key}>
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-all ${
                          isDone
                            ? 'bg-emerald-500 text-white'
                            : isCurrent
                            ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-200 scale-110'
                            : isRegistroIncompleto
                            ? 'bg-red-100 text-red-300'
                            : 'bg-slate-200 text-slate-400'
                        }`}
                      >
                        {isDone ? <Check size={9} /> : idx + 1}
                      </div>
                      <span
                        className={`mt-0.5 text-[9px] font-semibold whitespace-nowrap ${
                          isCurrent
                            ? 'text-blue-600'
                            : isDone
                            ? 'text-emerald-600'
                            : 'text-slate-400'
                        }`}
                      >
                        {step.short}
                      </span>
                    </div>
                    {idx < PIPELINE_STEPS.length - 1 && (
                      <div
                        className={`h-[2px] w-6 mx-0.5 mt-[-9px] rounded-full ${
                          isDone ? 'bg-emerald-400' : 'bg-slate-200'
                        }`}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>
      )}

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

      {/* CONTENIDO: TAB 1 (Secciones por Etapa del Pipeline) */}
      {activeTab === 'secciones' && !fieldSearch && (
        <div className="space-y-3">
          {/* Sección colapsable 1: campos narrativos (Objetivo, Descripción, etc. - ancho completo, minimizado por defecto) */}
          {narrativeFields.length > 0 && (
            <div className="rounded-xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
              {/* Header toggle */}
              <button
                onClick={() => setNarrativeOpen(o => !o)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 transition-colors group"
              >
                <div className={`transition-transform duration-200 text-slate-400 group-hover:text-slate-600 ${
                  narrativeOpen ? 'rotate-90' : ''
                }`}>
                  <ChevronRight size={13} />
                </div>
                <FileText size={13} className="text-indigo-500" />
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-600 group-hover:text-slate-800 flex-1">
                  Descripción y Contexto de la Iniciativa
                </span>
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400">
                  {narrativeFields.length} campo{narrativeFields.length !== 1 ? 's' : ''}
                </span>
              </button>

              {/* Contenido expandible */}
              {narrativeOpen && (
                <div className="border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-0 divide-x divide-y divide-slate-100 bg-slate-50/20">
                  {narrativeFields.map((nf, idx) => (
                    <div key={idx} className="p-3 flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                        {nf.label}
                      </span>
                      <div className="text-xs text-slate-800 leading-relaxed max-h-48 overflow-y-auto pr-1">
                        <FormattedFieldValue value={nf.value} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Sección colapsable 2: Registro de la Iniciativa (Cols A a AA - ancho completo, minimizado por defecto) */}
          {(() => {
            const registroSec = !isPlanificadas ? sections.find(s => s.etapaKey === 'registro') : null;
            if (!registroSec) return null;
            const validFields = registroSec.fields.filter(
              f => f.value !== null && f.value !== undefined && f.value !== '' && f.value !== '—'
            );
            if (validFields.length === 0) return null;

            return (
              <div className="rounded-xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
                <button
                  onClick={() => setRegistroOpen(o => !o)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 transition-colors group"
                >
                  <div className={`transition-transform duration-200 text-slate-400 group-hover:text-slate-600 ${
                    registroOpen ? 'rotate-90' : ''
                  }`}>
                    <ChevronRight size={13} />
                  </div>
                  <ClipboardList size={13} className="text-blue-500" />
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-600 group-hover:text-slate-800 flex-1">
                    1 · Registro de la Iniciativa (Datos Generales & Clasificación)
                  </span>
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400">
                    {validFields.length} campos
                  </span>
                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 whitespace-nowrap">
                    ✓ Completado
                  </span>
                </button>

                {registroOpen && (
                  <div className="border-t border-slate-100 p-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5 bg-slate-50/40">
                    {validFields.map(f => {
                      const isWideField =
                        f.label.toLowerCase().includes('adjunt') ||
                        f.label.toLowerCase().includes('documentac') ||
                        f.label.toLowerCase().includes('evidencia') ||
                        f.label.toLowerCase().includes('beneficios cualitativos');

                      return (
                        <div
                          key={f.label}
                          className={`bg-white p-2.5 rounded-lg border border-slate-100 shadow-2xs flex flex-col justify-start ${
                            isWideField ? 'col-span-full' : ''
                          }`}
                        >
                          <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">
                            {f.label}
                          </span>
                          <div className="text-xs text-slate-800 font-medium leading-relaxed break-words">
                            <FormattedFieldValue value={f.value} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Sección colapsable 3: Estimación (Cols AB a AP - ancho completo) */}
          {(() => {
            const estimacionSec = !isPlanificadas ? sections.find(s => s.etapaKey === 'por_estimar') : null;
            if (!estimacionSec) return null;
            const validFields = estimacionSec.fields.filter(
              f => f.value !== null && f.value !== undefined && f.value !== '' && f.value !== '—'
            );
            if (validFields.length === 0) return null;

            const isCurrentStage = !isPlanificadas && t.etapa_actual === 'por_estimar';
            const secPipelineIdx = PIPELINE_STEPS.findIndex(s => s.key === 'por_estimar');
            const isCompletedStage = secPipelineIdx !== -1 && secPipelineIdx < currentPipelineIndex;

            return (
              <div className="rounded-xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
                <button
                  onClick={() => setEstimacionOpen(o => !o)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 transition-colors group"
                >
                  <div className={`transition-transform duration-200 text-slate-400 group-hover:text-slate-600 ${
                    estimacionOpen ? 'rotate-90' : ''
                  }`}>
                    <ChevronRight size={13} />
                  </div>
                  <DollarSign size={13} className="text-amber-500" />
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-600 group-hover:text-slate-800 flex-1">
                    3 · Estimación (Recursos, Costos & Planificación Inicial)
                  </span>
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400">
                    {validFields.length} campos
                  </span>
                  {isCurrentStage && (
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 whitespace-nowrap">
                      ◉ EN CURSO
                    </span>
                  )}
                  {isCompletedStage && !isCurrentStage && (
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 whitespace-nowrap">
                      ✓ Completado
                    </span>
                  )}
                </button>

                {estimacionOpen && (
                  <div className="border-t border-slate-100 p-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5 bg-slate-50/40">
                    {validFields.map(f => (
                      <div
                        key={f.label}
                        className="bg-white p-2.5 rounded-lg border border-slate-100 shadow-2xs flex flex-col justify-start"
                      >
                        <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">
                          {f.label}
                        </span>
                        <div className="text-xs text-slate-800 font-medium leading-relaxed break-words">
                          <FormattedFieldValue value={f.value} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Secciones del pipeline en rejilla: ABIERTAS por defecto */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {sections
              .filter(sec => isPlanificadas || (sec.etapaKey !== 'registro' && sec.etapaKey !== 'por_estimar'))
              .map(sec => {
                // Filtrar campos que tengan valor
                const validFields = sec.fields.filter(
                  f => f.value !== null && f.value !== undefined && f.value !== '' && f.value !== '—'
                );
                if (validFields.length === 0) return null;

                const isCurrentStage = !isPlanificadas && sec.etapaKey === t.etapa_actual;
                const secPipelineIdx = !isPlanificadas
                  ? PIPELINE_STEPS.findIndex(s => s.key === sec.etapaKey)
                  : -1;
                const isCompletedStage = secPipelineIdx !== -1 && secPipelineIdx < currentPipelineIndex;
                const isRegistroSection = sec.etapaKey === 'registro';

                // ABIERTO POR DEFECTO: Si no está en openSections, vale true (abierto)
                const isOpen = openSections[sec.title] !== undefined
                  ? openSections[sec.title]
                  : true;
                const toggle = () => setOpenSections(prev => ({ ...prev, [sec.title]: !isOpen }));

                return (
                  <div
                    key={sec.title}
                    className={`bg-white rounded-xl border shadow-2xs overflow-hidden transition-all ${
                      isCurrentStage
                        ? 'border-blue-300 ring-2 ring-blue-100 shadow-blue-100/60'
                        : isCompletedStage || isRegistroSection
                        ? 'border-emerald-200/70'
                        : 'border-slate-200/80'
                    }`}
                  >
                    {/* Header clicable */}
                    <button
                      onClick={toggle}
                      className={`w-full flex items-center gap-1.5 px-3 py-2 text-left transition-colors group ${
                        isCurrentStage
                          ? 'hover:bg-blue-50/40 bg-blue-50/20'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className={`transition-transform duration-200 shrink-0 ${
                        isOpen ? 'rotate-90' : ''
                      } ${
                        isCurrentStage ? 'text-blue-500' : 'text-slate-400 group-hover:text-slate-600'
                      }`}>
                        <ChevronRight size={12} />
                      </div>
                      {React.cloneElement(sec.icon as React.ReactElement<{ size?: number }>, { size: 12 })}
                      <span className="font-bold text-[10px] text-slate-600 uppercase tracking-wide flex-1 leading-none">
                        {sec.title}
                      </span>
                      {/* Conteo de campos */}
                      <span className="text-[8px] font-semibold px-1 py-0.5 rounded-full bg-slate-100 text-slate-400 shrink-0">
                        {validFields.length}
                      </span>
                      {/* Badge de estado */}
                      {isCurrentStage && (
                        <span className="text-[8px] font-bold px-1 py-0.5 rounded-full bg-blue-100 text-blue-700 whitespace-nowrap shrink-0">
                          ◉ EN CURSO
                        </span>
                      )}
                      {(isCompletedStage || isRegistroSection) && !isCurrentStage && (
                        <span className="text-[8px] font-bold px-1 py-0.5 rounded-full bg-emerald-50 text-emerald-600 whitespace-nowrap shrink-0">
                          ✓
                        </span>
                      )}
                      {!isCurrentStage && !isCompletedStage && !isRegistroSection && sec.etapaKey && sec.etapaKey !== 'registro' && (
                        <span className="text-[8px] font-bold px-1 py-0.5 rounded-full bg-slate-100 text-slate-400 whitespace-nowrap shrink-0">
                          —
                        </span>
                      )}
                    </button>

                    {/* Body expandible */}
                    {isOpen && (
                      <div className="border-t border-slate-100 px-3 pb-3 pt-2 space-y-2 text-xs divide-y divide-slate-50">
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
                    )}
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
