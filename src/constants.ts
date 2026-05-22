import { EtapaPipeline, FilterState } from './types';

/** Mapeo de nombres de hoja Excel → etapa del pipeline. */
export const HOJAS_OPERATIVAS: Record<string, EtapaPipeline> = {
  'Registro incompleto':      'registro_incompleto',
  'Por estimar':              'por_estimar',
  'Por aprobar estimacion':   'por_aprobar_estimacion',
  'Por habilitar presup.':    'por_habilitar_presupuesto',
  'Por planificar':           'por_planificar',
  'Aprobar Planificación':    'aprobar_planificacion',
  'Planificadas':             'planificadas',
  'Eliminados':               'eliminadas',
};


export interface EtapaConfig {
  id: EtapaPipeline;
  /** Etiqueta corta para el pipeline y badges. */
  label: string;
  /** Color primario hex para gráficos y estilos inline. */
  color: string;
  /** Color de fondo suave (hex) para badges. */
  bgColor: string;
  /** Color de texto (hex) para badges. */
  textColor: string;
  /** Si es true, la etapa es terminal y no forma parte del flujo normal. */
  isTerminal?: boolean;
}

/**
 * Configuración visual y de negocio de cada etapa.
 * El orden de este array refleja el flujo de progresión del pipeline.
 */
export const ETAPAS_CONFIG: EtapaConfig[] = [
  { id: 'registro_incompleto',       label: 'Registro Incompleto', color: '#94a3b8', bgColor: '#f1f5f9', textColor: '#475569' },
  { id: 'por_estimar',               label: 'Por Estimar',         color: '#eab308', bgColor: '#fefce8', textColor: '#a16207' },
  { id: 'por_aprobar_estimacion',    label: 'Por Aprobar Est.',    color: '#8b5cf6', bgColor: '#f5f3ff', textColor: '#6d28d9' },
  { id: 'por_habilitar_presupuesto', label: 'Hab. Presup.',        color: '#06b6d4', bgColor: '#ecfeff', textColor: '#0e7490' },
  { id: 'por_planificar',            label: 'Por Planificar',      color: '#10b981', bgColor: '#ecfdf5', textColor: '#047857' },
  { id: 'aprobar_planificacion',     label: 'Aprobar Plan.',       color: '#059669', bgColor: '#d1fae5', textColor: '#065f46' },
  { id: 'planificadas',              label: 'Planificadas',        color: '#16a34a', bgColor: '#bbf7d0', textColor: '#14532d' },
  { id: 'eliminadas',                label: 'Eliminadas',          color: '#ef4444', bgColor: '#fef2f2', textColor: '#b91c1c', isTerminal: true },
];


/** Mapa id → EtapaConfig para acceso en O(1). */
export const ETAPAS_MAP = new Map<EtapaPipeline, EtapaConfig>(
  ETAPAS_CONFIG.map(e => [e.id, e])
);

/**
 * Valor centinela que representa campos vacíos, nulos o en blanco en los filtros.
 * Permite al usuario filtrar explícitamente por iniciativas sin ese campo asignado.
 */
export const EMPTY_SENTINEL = '__SIN_ASIGNAR__';

/** Etiqueta visible para el centinela vacío. */
export const EMPTY_LABEL = '(Sin asignar)';

/** Estado inicial de filtros: todos los arrays vacíos (sin filtro). */
export const INITIAL_FILTERS: FilterState = {
  etapas:           [],
  instituciones:    [],
  pilares:          [],
  complejidades:    [],
  it_bps:           [],
  lideres_dominio:  [],
  tipos_recurso:    [],
  prioridades_brm:  [],
  impacto_sox: [],
  proyecto_spo: [],
  estabilizacion_sis: [],
  aprobar_estimacion: [],
  presupuesto_habilitado: [],
  planificacion_aprobada: [],
};
