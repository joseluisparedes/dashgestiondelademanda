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
  Columns3,
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
  subSort?: {
    inicioKey: keyof Iniciativa;
    finKey: keyof Iniciativa;
  };
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
      if (t.estatus_estimacion) map.set('Estatus Estimación', t.estatus_estimacion);
      if (t.fecha_inicio_estimacion) map.set('Fecha Inicio Estimación', fmtDate(t.fecha_inicio_estimacion));
      if (t.fecha_fin_estimacion) map.set('Fecha Fin Estimación', fmtDate(t.fecha_fin_estimacion));
      if (t.fecha_inicio_reestimacion) map.set('Fecha Inicio Reestimación', fmtDate(t.fecha_inicio_reestimacion));
      if (t.fecha_fin_reestimacion) map.set('Fecha Fin Reestimación', fmtDate(t.fecha_fin_reestimacion));
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

  // Helper para buscar valor en raw_fields por varias posibles claves (coincidencia exacta)
  const getRawVal = (...keys: string[]): unknown => {
    if (!t.raw_fields) return null;
    for (const key of keys) {
      const normSearch = key.toLowerCase().replace(/[\r\n\s]+/g, ' ').trim();
      const found = Object.keys(t.raw_fields).find(k => {
        const normK = k.toLowerCase().replace(/[\r\n\s]+/g, ' ').trim();
        return normK === normSearch;
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
  // Pipeline de estados para el stepper visual (modo demanda).
  // 'registro_incompleto' y 'por_reestimar' NO están en el flujo lineal:
  // son estados laterales/excepcionales. La iniciativa vuelve al flujo normal al subsanar/actualizar sus datos.
  const PIPELINE_STEPS = [
    { key: 'por_estimar',               label: 'Por Estimar',      short: 'Estimar'     },
    { key: 'por_aprobar_estimacion',    label: 'Ap. Estimación',   short: 'Ap. Est.'    },
    { key: 'por_habilitar_presupuesto', label: 'Hab. Presupuesto', short: 'Presup.'     },
    { key: 'por_planificar',            label: 'Por Planificar',   short: 'Planificar'  },
    { key: 'aprobar_planificacion',     label: 'Ap. Planificación',short: 'Ap. Plan.'   },
    { key: 'planificadas',              label: 'Planificadas',     short: 'Planificada' },
  ] as const;

  const isRegistroIncompleto = t.etapa_actual === 'registro_incompleto';
  const isPorReestimar = t.etapa_actual === 'por_reestimar';
  const isLateralStage = isRegistroIncompleto || isPorReestimar;
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
    // DEMANDA: Secciones alineadas a la secuencia lógica de estados
    // Flujo regular numerado: 1. Registro -> 2. Estimación -> 3. Ap. Estimación
    //   -> 4. Hab. Presupuesto -> 5. Planificación -> 6. Ap. Planificación
    // Estados laterales/excepcionales: Registro Incompleto, Reestimación
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

      // ── REGISTRO INCOMPLETO (motivo en col AP) ────────────────────────────
      // Solo se muestra si la iniciativa está efectivamente en la pestaña 'Registro incompleto'
      ...(t.etapa_actual === 'registro_incompleto' ? [{
        etapaKey: 'registro_incompleto',
        title: 'Observación · Registro Incompleto',
        icon: <AlertTriangle size={15} className="text-red-500" />,
        fields: [
          { label: 'Motivo de Registro Incompleto', value: getRawVal('Completar información', 'Motivo', 'STRING') },
          { label: 'Asignado por', value: t.asignado_por },
          { label: 'Fecha de Asignación', value: fmtDate(t.fecha_asignacion) },
          { label: 'Líder de Dominio Asignado', value: t.lider_dominio },
        ],
      }] : []),

      // ── 2. ESTIMACIÓN (Cols AB–AP) ────────────────────────────────────────────
      {
        etapaKey: 'por_estimar',
        title: '2 · Estimación',
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
          { label: 'Fecha Inicio Estimación', value: fmtDate(t.fecha_inicio_estimacion) },
          { label: 'Fecha Fin Estimación', value: fmtDate(t.fecha_fin_estimacion) },
          { label: 'Estatus Estimación', value: t.estatus_estimacion },
          { label: 'Acción BRM', value: t.accion_brm },
          { label: 'Prioridad BRM', value: t.prioridad_brm },
        ],
      },

      // ── REESTIMACIÓN (Cols AQ–BA) ─────────────────────────────────────────
      // Solo se muestra si la iniciativa está efectivamente en 'por_reestimar'
      ...(t.etapa_actual === 'por_reestimar' ? [{
        etapaKey: 'por_reestimar',
        title: 'Ajuste · Reestimación',
        icon: <RefreshCw size={15} className="text-orange-500" />,
        fields: [
          { label: 'Motivo de Reestimación', value: getRawVal('Motivo de Reestimación', 'Motivo de Reestimacion', 'Reestimación') },
          { label: 'Complejidad Reestimada', value: getRawVal('Complejidad_1', 'Complejidad reestimación') },
          { label: 'Duración Reestimada (meses)', value: getRawVal('Tiempo estimado\r\n(meses)_1', 'Tiempo estimado (meses)_1') },
          { label: 'Costo Total USD Reestimación', value: getRawVal('Costo total dolares') ? fmtUSD(Number(getRawVal('Costo total dolares'))) : null },
          { label: 'Costo Total Soles Reestimación', value: getRawVal('Costo total Soles') ? fmtMoney(Number(getRawVal('Costo total Soles'))) : null },
          { label: 'Fecha Inicio Reestimación', value: fmtDate(t.fecha_inicio_reestimacion) },
          { label: 'Fecha Fin Reestimación', value: fmtDate(t.fecha_fin_reestimacion) },
          { label: 'Estatus Reestimación', value: getRawVal('Estatus Reestimación', 'Estatus Reestimacion') },
        ],
      }] : []),

      // ── 3. POR APROBAR ESTIMACIÓN (Cols BB–BC) ───────────────────────────────
      {
        etapaKey: 'por_aprobar_estimacion',
        title: '3 · Aprobación de Estimación',
        icon: <ClipboardCheck size={15} className="text-violet-500" />,
        fields: [
          { label: 'Estado Aprobación Estimación', value: t.aprobar_estimacion ?? getRawVal('Aprobar estimación', 'Aprobar estimacion', 'Aprobación de estimación') ?? '—' },
          { label: 'Fecha Máxima de Estimación', value: fmtDate(getRawVal('Fecha máxima de estimación', 'Fecha maxima estimacion') as string) },
        ],
      },

      // ── 4. POR APROBAR PRESUPUESTO (Cols BD–BE) ──────────────────────────────
      {
        etapaKey: 'por_habilitar_presupuesto',
        title: '4 · Habilitación de Presupuesto',
        icon: <Banknote size={15} className="text-cyan-600" />,
        fields: [
          { label: 'Presupuesto Habilitado', value: t.presupuesto_habilitado ?? getRawVal('Presupuesto Habilitado', 'Presupuesto habilitado', 'Habilitación de presupuesto', 'Presupuesto') ?? '—' },
        ],
      },

      // ── 5. POR PLANIFICAR (Cols BF–BG) ──────────────────────────────────────
      {
        etapaKey: 'por_planificar',
        title: '5 · Planificación',
        icon: <Calendar size={15} className="text-emerald-500" />,
        fields: [
          { label: 'Fecha Inicio Planificada', value: fmtDate(t.fecha_inicio_planificada) },
          { label: 'Fecha Fin Planificada', value: fmtDate(t.fecha_fin_planificada) },
        ],
      },

      // ── 6. APROBAR PLANIFICACIÓN (Cols BH–BI) ───────────────────────────────
      {
        etapaKey: 'aprobar_planificacion',
        title: '6 · Aprobación de Planificación',
        icon: <CalendarCheck size={15} className="text-green-600" />,
        fields: [
          { label: 'Planificación Aprobada', value: t.planificacion_aprobada ?? getRawVal('Planificación aprobada', 'Planificacion aprobada', 'Aprobar planificación') ?? '—' },
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

            {/* Badge lateral: estado Por Reestimar (fuera del flujo lineal) */}
            {isPorReestimar && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold mr-2 shrink-0">
                <RefreshCw size={11} />
                <span>Por Reestimar</span>
                <span className="text-amber-600 font-normal">— Requiere ajuste en estimación</span>
              </div>
            )}

            {/* Pasos del pipeline lineal */}
            <div className="flex items-center min-w-max gap-0">
              {PIPELINE_STEPS.map((step, idx) => {
                const isDone = !isLateralStage && idx < currentPipelineIndex;
                const isCurrent = !isLateralStage && idx === currentPipelineIndex;
                return (
                  <React.Fragment key={step.key}>
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-all ${
                          isDone
                            ? 'bg-emerald-500 text-white'
                            : isCurrent
                            ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-200 scale-110'
                            : isLateralStage
                            ? 'bg-slate-100 text-slate-300'
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
                    2 · Estimación (Recursos, Costos & Planificación Inicial)
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

                // Las secciones laterales/excepcionales (Incompleto / Reestimación) solo se muestran si tienen datos
                if (validFields.length === 0 && (sec.etapaKey === 'registro_incompleto' || sec.etapaKey === 'por_reestimar')) {
                  return null;
                }

                // Para las secciones fijas del pipeline regular (3, 4, 5, 6), siempre se muestran sus campos
                const displayFields = validFields.length > 0 ? validFields : sec.fields;

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
                        {displayFields.length}
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
                        {displayFields.map(f => (
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
      <div className="relative bg-white w-full max-w-6xl max-h-[92vh] rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col z-10 animate-in zoom-in-95 duration-150">
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
// Celda estilizada para rango de fechas por etapa (Inicio / Fin)
// ---------------------------------------------------------------------------
function StageDateCell({
  inicio,
  fin,
  accent = 'blue',
}: {
  inicio: string | null | undefined;
  fin: string | null | undefined;
  accent?: 'blue' | 'purple' | 'amber' | 'emerald';
}) {
  const hasIni = Boolean(inicio);
  const hasFin = Boolean(fin);

  if (!hasIni && !hasFin) {
    return <span className="text-slate-300 font-mono text-xs text-center block">—</span>;
  }

  const borderBg = {
    blue: 'border-blue-100 bg-blue-50/50',
    purple: 'border-purple-100 bg-purple-50/50',
    amber: 'border-amber-100 bg-amber-50/50',
    emerald: 'border-emerald-100 bg-emerald-50/50',
  }[accent];

  const tagColor = {
    blue: 'text-blue-700 font-bold',
    purple: 'text-purple-700 font-bold',
    amber: 'text-amber-800 font-bold',
    emerald: 'text-emerald-800 font-bold',
  }[accent];

  return (
    <div className={`flex flex-col gap-1 py-1.5 px-2.5 rounded-lg border ${borderBg} min-w-[130px] shadow-2xs`}>
      <div className="flex items-center justify-between gap-2 text-[11px] font-mono leading-tight">
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Inicio</span>
        <span className={hasIni ? 'text-slate-700 font-medium' : 'text-slate-300 italic'}>
          {fmtDate(inicio)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px] font-mono leading-tight border-t border-slate-200/60 pt-1">
        <span className={`text-[9px] font-extrabold uppercase tracking-wider ${tagColor}`}>Fin</span>
        <span className={`font-bold ${hasFin ? 'text-slate-900' : 'text-slate-300 italic'}`}>
          {fmtDate(fin)}
        </span>
      </div>
    </div>
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
          id: 'complejidad',
          label: 'Complejidad',
          sortKey: 'complejidad',
          render: t => {
            if (!t.complejidad) return '—';
            const c = t.complejidad.toLowerCase();
            let colorClass = 'bg-slate-100 text-slate-700 border-slate-200';
            if (c.includes('alta') || c.includes('muy alta')) colorClass = 'bg-rose-50 text-rose-700 border-rose-200';
            else if (c.includes('media')) colorClass = 'bg-amber-50 text-amber-700 border-amber-200';
            else if (c.includes('baja')) colorClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
            return (
              <span className={`inline-flex px-2 py-0.5 text-[10px] font-bold rounded-full border ${colorClass} whitespace-nowrap`}>
                {t.complejidad}
              </span>
            );
          },
          className: 'whitespace-nowrap',
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
          id: 'fechas_planificadas',
          label: 'Planificación',
          subSort: {
            inicioKey: 'fecha_inicio_planificada',
            finKey: 'fecha_fin_planificada',
          },
          render: t => <StageDateCell inicio={t.fecha_inicio_planificada} fin={t.fecha_fin_planificada} accent="amber" />,
        },
        {
          id: 'fechas_reales',
          label: 'Real',
          subSort: {
            inicioKey: 'fecha_inicio_real' as any,
            finKey: 'fecha_fin_real' as any,
          },
          render: t => <StageDateCell inicio={t.fecha_inicio_real ?? null} fin={t.fecha_fin_real ?? null} accent="emerald" />,
        },
        {
          id: 'id_jira',
          label: 'ID Jira',
          sortKey: 'id_jira' as any,
          render: t => (t.id_jira ? <AutoLinkText text={t.id_jira} /> : '—'),
          className: 'whitespace-nowrap text-xs text-slate-600',
        },
        {
          id: 'costo_soles',
          label: 'Costo Soles',
          sortKey: 'costo_soles',
          render: t => fmtMoney(t.costo_soles),
          className: 'text-right font-mono text-slate-700 whitespace-nowrap font-semibold',
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
        className: 'min-w-[260px]',
      },
      {
        id: 'etapa_actual',
        label: 'Etapa',
        sortKey: 'etapa_actual',
        render: t => <EtapaBadge etapa={t.etapa_actual} mode={mode} />,
      },
      {
        id: 'complejidad',
        label: 'Complejidad',
        sortKey: 'complejidad',
        render: t => {
          if (!t.complejidad) return '—';
          const c = t.complejidad.toLowerCase();
          let colorClass = 'bg-slate-100 text-slate-700 border-slate-200';
          if (c.includes('alta') || c.includes('muy alta')) colorClass = 'bg-rose-50 text-rose-700 border-rose-200';
          else if (c.includes('media')) colorClass = 'bg-amber-50 text-amber-700 border-amber-200';
          else if (c.includes('baja')) colorClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
          return (
            <span className={`inline-flex px-2 py-0.5 text-[10px] font-bold rounded-full border ${colorClass} whitespace-nowrap`}>
              {t.complejidad}
            </span>
          );
        },
        className: 'whitespace-nowrap',
      },
      {
        id: 'lider_dominio',
        label: 'Líder de Dominio',
        sortKey: 'lider_dominio',
        render: t => t.lider_dominio || '—',
        className: 'whitespace-nowrap text-slate-700 min-w-[140px]',
      },
      {
        id: 'it_bp',
        label: 'IT BP',
        sortKey: 'it_bp',
        render: t => t.it_bp || '—',
        className: 'whitespace-nowrap text-slate-600',
      },
      {
        id: 'fechas_estimacion',
        label: 'Estimación',
        subSort: {
          inicioKey: 'fecha_inicio_estimacion' as any,
          finKey: 'fecha_fin_estimacion' as any,
        },
        render: t => (
          <StageDateCell
            inicio={t.fecha_inicio_estimacion}
            fin={t.fecha_fin_estimacion}
            accent="blue"
          />
        ),
      },
      {
        id: 'fechas_reestimacion',
        label: 'Re-estimación',
        subSort: {
          inicioKey: 'fecha_inicio_reestimacion' as any,
          finKey: 'fecha_fin_reestimacion' as any,
        },
        render: t => (
          <StageDateCell
            inicio={t.fecha_inicio_reestimacion}
            fin={t.fecha_fin_reestimacion}
            accent="purple"
          />
        ),
      },
      {
        id: 'fechas_planificacion',
        label: 'Planificación',
        subSort: {
          inicioKey: 'fecha_inicio_planificada',
          finKey: 'fecha_fin_planificada',
        },
        render: t => (
          <StageDateCell
            inicio={t.fecha_inicio_planificada}
            fin={t.fecha_fin_planificada}
            accent="amber"
          />
        ),
      },
      {
        id: 'duracion_meses',
        label: 'Duración',
        sortKey: 'duracion_meses',
        render: t => (t.duracion_meses !== null && t.duracion_meses !== undefined ? `${t.duracion_meses} m` : '—'),
        className: 'text-center font-mono text-slate-600 whitespace-nowrap',
      },
      {
        id: 'costo_usd',
        label: 'Costo USD',
        sortKey: 'costo_usd',
        render: t => fmtUSD(t.costo_usd),
        className: 'text-right font-mono text-slate-600 whitespace-nowrap font-medium',
      },
      {
        id: 'costo_soles',
        label: 'Costo Soles',
        sortKey: 'costo_soles',
        render: t => fmtMoney(t.costo_soles),
        className: 'text-right font-mono text-slate-700 whitespace-nowrap font-semibold',
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
  const [hiddenColumnIds, setHiddenColumnIds] = useState<Set<string>>(new Set());
  const [showColumnPicker, setShowColumnPicker] = useState(false);

  const orderedColumns = columnOrder.map(id => COLUMNS.find(c => c.id === id)!).filter(Boolean) as ColumnDef[];
  const visibleColumns = useMemo(() => {
    return orderedColumns.filter(c => !hiddenColumnIds.has(c.id));
  }, [orderedColumns, hiddenColumnIds]);

  const toggleColumnVisibility = (id: string) => {
    setHiddenColumnIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (COLUMNS.length - next.size > 1) {
          next.add(id);
        }
      }
      return next;
    });
  };

  const showAllColumns = () => {
    setHiddenColumnIds(new Set());
  };

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
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        const aEmpty = aValue === null || aValue === undefined || aValue === '';
        const bEmpty = bValue === null || bValue === undefined || bValue === '';

        if (aEmpty && bEmpty) return 0;
        if (aEmpty) return 1;
        if (bEmpty) return -1;

        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
        }

        const aStr = String(aValue).toLowerCase();
        const bStr = String(bValue).toLowerCase();

        if (aStr < bStr) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aStr > bStr) {
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
      <ArrowUp size={13} className="inline-block ml-1 text-blue-600 font-bold" />
    ) : (
      <ArrowDown size={13} className="inline-block ml-1 text-blue-600 font-bold" />
    );
  };

  const downloadCSV = () => {
    const headers = orderedColumns.map(c => c.label);

    const rows = sortedIniciativas.map(t =>
      orderedColumns.map(col => {
        const key = col.sortKey || col.subSort?.finKey;
        const val = key ? t[key as keyof Iniciativa] : '';
        if (val === null || val === undefined) return '';
        if (
          key === 'fecha_inicio_planificada' ||
          key === 'fecha_fin_planificada' ||
          key === 'fecha_registro' ||
          key === 'fecha_inicio_estimacion' ||
          key === 'fecha_fin_estimacion'
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
      <div className="p-4 border-b border-gray-100 flex flex-wrap justify-between items-center gap-3 bg-gray-50/50">
        <div>
          <h3 className="font-semibold text-gray-800">Detalle de Iniciativas</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {iniciativas.length} resultado{iniciativas.length !== 1 ? 's' : ''}
            {totalPages > 1 && ` · Página ${page} de ${totalPages}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Selector rápido de ordenamiento por fechas u otros campos */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs shadow-2xs">
            <ArrowUpDown size={12} className="text-slate-400 shrink-0" />
            <span className="text-[11px] font-semibold text-slate-500 hidden sm:inline">Ordenar por:</span>
            <select
              value={sortConfig?.key || ''}
              onChange={e => {
                const val = e.target.value as keyof Iniciativa;
                if (!val) {
                  setSortConfig(null);
                } else {
                  setSortConfig({ key: val, direction: sortConfig?.direction || 'asc' });
                }
              }}
              className="text-xs bg-transparent border-none text-slate-800 font-semibold focus:outline-none cursor-pointer pr-1"
            >
              <option value="">(Orden por defecto)</option>
              {!isPlanificadas && (
                <>
                  <optgroup label="Fechas de Planificación">
                    <option value="fecha_fin_planificada">Planificación · Fecha Fin (Límite)</option>
                    <option value="fecha_inicio_planificada">Planificación · Fecha Inicio</option>
                  </optgroup>
                  <optgroup label="Fechas de Estimación">
                    <option value="fecha_fin_estimacion">Estimación · Fecha Fin (Límite)</option>
                    <option value="fecha_inicio_estimacion">Estimación · Fecha Inicio</option>
                  </optgroup>
                  <optgroup label="Fechas de Re-estimación">
                    <option value="fecha_fin_reestimacion">Re-estimación · Fecha Fin (Límite)</option>
                    <option value="fecha_inicio_reestimacion">Re-estimación · Fecha Inicio</option>
                  </optgroup>
                </>
              )}
              {isPlanificadas && (
                <>
                  <optgroup label="Fechas Planificadas / Reales">
                    <option value="fecha_fin_planificada">Planificación · Fecha Fin</option>
                    <option value="fecha_inicio_planificada">Planificación · Fecha Inicio</option>
                    <option value="fecha_fin_real">Real · Fecha Fin</option>
                    <option value="fecha_inicio_real">Real · Fecha Inicio</option>
                  </optgroup>
                </>
              )}
              <optgroup label="Otros Campos">
                <option value="id">ID</option>
                <option value="institucion">Institución</option>
                <option value="titulo">Título</option>
                <option value="complejidad">Complejidad</option>
                <option value="lider_dominio">Líder de Dominio</option>
                <option value="it_bp">IT BP</option>
                <option value="costo_soles">Costo Soles</option>
                {!isPlanificadas && <option value="costo_usd">Costo USD</option>}
              </optgroup>
            </select>

            {sortConfig && (
              <button
                type="button"
                onClick={() => setSortConfig(prev => prev ? { ...prev, direction: prev.direction === 'asc' ? 'desc' : 'asc' } : null)}
                className="px-1.5 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 font-mono text-[10px] font-bold transition-colors cursor-pointer border border-blue-200"
                title={`Cambiar dirección a ${sortConfig.direction === 'asc' ? 'Descendente' : 'Ascendente'}`}
              >
                {sortConfig.direction === 'asc' ? '↑ ASC' : '↓ DESC'}
              </button>
            )}

            {sortConfig && (
              <button
                type="button"
                onClick={() => setSortConfig(null)}
                className="text-slate-400 hover:text-red-500 transition-colors p-0.5 cursor-pointer"
                title="Quitar ordenamiento"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {selectedIds.size > 0 && (
            <button
              onClick={handleSendEmail}
              className="text-sm px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-xs rounded-lg flex items-center gap-2 font-semibold transition-all active:scale-95 animate-in fade-in slide-in-from-right-4 duration-200"
            >
              <Mail size={15} />
              Enviar mail ({selectedIds.size})
            </button>
          )}

          {/* Selector de Columnas Visibles */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowColumnPicker(prev => !prev)}
              className={`text-xs px-2.5 py-1.5 rounded-lg border shadow-2xs flex items-center gap-1.5 font-medium transition-colors cursor-pointer ${
                hiddenColumnIds.size > 0
                  ? 'bg-blue-50 border-blue-200 text-blue-700 font-semibold'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
              title="Ocultar / Mostrar columnas"
            >
              <Columns3 size={13} className={hiddenColumnIds.size > 0 ? 'text-blue-600' : 'text-slate-400'} />
              <span>Columnas</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 font-mono">
                {COLUMNS.length - hiddenColumnIds.size}/{COLUMNS.length}
              </span>
              <ChevronDown size={11} className="text-slate-400" />
            </button>

            {showColumnPicker && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowColumnPicker(false)} />
                <div className="absolute right-0 mt-1.5 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-2.5 animate-in fade-in zoom-in-95 duration-100">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-800">Visibilidad de Columnas</span>
                    {hiddenColumnIds.size > 0 && (
                      <button
                        type="button"
                        onClick={showAllColumns}
                        className="text-[11px] text-blue-600 hover:underline font-semibold cursor-pointer"
                      >
                        Mostrar todas
                      </button>
                    )}
                  </div>
                  <div className="max-h-60 overflow-y-auto flex flex-col gap-1 pr-1">
                    {COLUMNS.map(col => {
                      const isVisible = !hiddenColumnIds.has(col.id);
                      return (
                        <label
                          key={col.id}
                          className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-50 text-xs text-slate-700 cursor-pointer select-none transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isVisible}
                              onChange={() => toggleColumnVisibility(col.id)}
                              className="w-3.5 h-3.5 accent-blue-600 rounded cursor-pointer"
                            />
                            <span className={isVisible ? 'font-medium text-slate-800' : 'text-slate-400 line-through'}>
                              {col.label}
                            </span>
                          </div>
                          {!isVisible && (
                            <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-1 rounded">Oculta</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                  <div className="pt-2 mt-2 border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-400">
                    <span>{hiddenColumnIds.size} columna(s) oculta(s)</span>
                    <button
                      type="button"
                      onClick={() => setShowColumnPicker(false)}
                      className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium hover:bg-slate-200 cursor-pointer"
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

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
              {visibleColumns.map(col => (
                <th
                  key={col.id}
                  draggable
                  onDragStart={e => handleDragStart(e, col.id)}
                  onDragOver={handleDragOver}
                  onDrop={e => handleDrop(e, col.id)}
                  className={`px-3 py-2.5 whitespace-nowrap cursor-move select-none hover:bg-gray-200/80 transition-colors group ${
                    draggedCol === col.id ? 'opacity-50 bg-gray-200' : ''
                  }`}
                  title="Arrastra para mover la columna"
                >
                  {col.subSort ? (
                    <div className="flex flex-col gap-1 py-0.5">
                      <span className="font-bold text-slate-700">{col.label}</span>
                      <div className="flex items-center gap-1 font-mono text-[9px]" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleSort(col.subSort!.inicioKey)}
                          className={`px-1.5 py-0.5 rounded border transition-all flex items-center gap-0.5 cursor-pointer ${
                            sortConfig?.key === col.subSort!.inicioKey
                              ? 'bg-blue-600 text-white border-blue-600 font-extrabold shadow-2xs'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-900'
                          }`}
                          title={`Ordenar por Inicio (${col.label})`}
                        >
                          <span>Ini</span>
                          {sortConfig?.key === col.subSort!.inicioKey ? (
                            sortConfig.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />
                          ) : (
                            <ArrowUpDown size={9} className="opacity-40" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSort(col.subSort!.finKey)}
                          className={`px-1.5 py-0.5 rounded border transition-all flex items-center gap-0.5 cursor-pointer ${
                            sortConfig?.key === col.subSort!.finKey
                              ? 'bg-blue-600 text-white border-blue-600 font-extrabold shadow-2xs'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-900'
                          }`}
                          title={`Ordenar por Fin (${col.label})`}
                        >
                          <span>Fin</span>
                          {sortConfig?.key === col.subSort!.finKey ? (
                            sortConfig.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />
                          ) : (
                            <ArrowUpDown size={9} className="opacity-40" />
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="flex items-center gap-1 cursor-pointer py-1"
                      onClick={() => col.sortKey && handleSort(col.sortKey)}
                    >
                      <span className="font-bold text-slate-700">{col.label}</span>
                      {col.sortKey && renderSortIcon(col.sortKey)}
                    </div>
                  )}
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
                  {visibleColumns.map(col => (
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
                    colSpan={visibleColumns.length + 3}
                    onOpenModal={() => setModalIniciativa(t)}
                  />
                )}
              </React.Fragment>
            ))}

            {paginated.length === 0 && (
              <tr>
                <td colSpan={visibleColumns.length + 3} className="px-4 py-12 text-center text-gray-400 text-sm">
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
