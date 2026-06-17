/**
 * Etapas del pipeline de gestión de la demanda TI.
 * El orden refleja el flujo esperado de progresión de una iniciativa.
 */
export type EtapaPipeline =
  | 'registro_incompleto'
  | 'por_estimar'
  | 'por_aprobar_estimacion'
  | 'por_reestimar'
  | 'por_habilitar_presupuesto'
  | 'por_planificar'
  | 'aprobar_planificacion'
  | 'planificadas'
  | 'eliminadas';


export interface Iniciativa {
  id: number;
  /** Etapa actual en el pipeline. Siempre debe ser un valor válido de EtapaPipeline. */
  etapa_actual: EtapaPipeline;
  /** Fecha de registro en formato ISO 8601. */
  fecha_registro: string;
  titulo: string;
  objetivo: string;
  institucion: string;
  vp_solicitante: string;
  usuario_negocio: string;
  it_bp: string;
  fecha_entrega_requerida: string | null;
  proyecto_spo: string;
  tipo_iniciativa: string;
  pilar_estrategico: string;
  estabilizacion_sis: string;
  usuarios_beneficiados: string;
  beneficio_cuantitativo: string;
  complejidad: string;
  lider_dominio: string;
  asignado_por: string | null;
  fecha_asignacion: string | null;
  duracion_meses: number | null;
  /** Costo en dólares. null = sin costo asignado (distinto de 0). */
  costo_usd: number | null;
  /** Costo en soles. null = sin costo asignado (distinto de 0). */
  costo_soles: number | null;
  tipo_recurso: string | null;
  proyecto_o_req: string | null;
  funcionalidad_nueva: string | null;
  estatus_estimacion: string | null;
  accion_brm: string | null;
  prioridad_brm: string | null;
  fecha_inicio_planificada: string | null;
  fecha_fin_planificada: string | null;
  impacto_sox: 'SI' | 'NO' | null;
  aprobar_estimacion: string | null;
  presupuesto_habilitado: string | null;
  planificacion_aprobada: string | null;
}

export interface DashboardData {
  /** Última actualización de la fuente de datos (ISO 8601). */
  ultima_actualizacion: string;
  /** Tipo de cambio PEN/USD vigente. */
  tipo_de_cambio: number;
  resumen: {
    total_iniciativas: number;
    por_etapa: Record<string, number>;
  };
  iniciativas: Iniciativa[];
}

/**
 * Estado de los filtros del dashboard.
 * Cada campo es un array de valores seleccionados.
 * Array vacío = sin filtro activo para ese campo.
 * La lógica de filtrado aplica OR dentro del mismo campo, AND entre campos distintos.
 */
export interface FilterState {
  etapas: EtapaPipeline[];
  instituciones: string[];
  pilares: string[];
  complejidades: string[];
  it_bps: string[];
  vp_solicitantes: string[];
  lideres_dominio: string[];
  tipos_recurso: string[];
  prioridades_brm: string[];
  impacto_sox: string[];
  proyecto_spo: string[];
  estabilizacion_sis: string[];
  aprobar_estimacion: string[];
  presupuesto_habilitado: string[];
  planificacion_aprobada: string[];
  busqueda: string;
}
