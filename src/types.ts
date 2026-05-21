export type EtapaPipeline = 
  | 'registro_incompleto'
  | 'por_confirmar'
  | 'por_estimar'
  | 'por_aprobar_estimacion'
  | 'priorizacion_brm'
  | 'por_habilitar_presupuesto'
  | 'por_planificar'
  | 'aprobar_planificacion'
  | 'planificadas'
  | 'eliminadas';

export interface Iniciativa {
  id: number;
  etapa_actual: EtapaPipeline | string;
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
  costo_usd: number | null;
  costo_soles: number | null;
  tipo_recurso: string | null;
  proyecto_o_req: string | null;
  funcionalidad_nueva: string | null;
  estatus_estimacion: string | null;
  accion_brm: string | null;
  prioridad_brm: string | null;
  fecha_inicio_planificada: string | null;
  fecha_fin_planificada: string | null;
  impacto_sox: string | null;
}

export interface DashboardData {
  ultima_actualizacion: string;
  tipo_de_cambio: number;
  resumen: {
    total_iniciativas: number;
    por_etapa: Record<string, number>;
  };
  iniciativas: Iniciativa[];
}
