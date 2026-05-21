import { Iniciativa, DashboardData, EtapaPipeline } from './types';
import { subDays, addDays } from 'date-fns';

const instituciones = ['UPC', 'UPN', 'CIB', 'CORPORATIVO', 'LAUREATE'];
const pilares = ['Excelencia Operativa', 'Transformación Digital', 'Experiencia', 'Calidad Académica', 'Seguridad'];
const prioridades_brm = ['A', 'B', 'C'];
const etapas: EtapaPipeline[] = [
  'registro_incompleto', 'por_confirmar', 'por_estimar',
  'por_aprobar_estimacion', 'priorizacion_brm', 'por_habilitar_presupuesto',
  'por_planificar', 'aprobar_planificacion', 'planificadas', 'eliminadas'
];
const recursos = ['Internos', 'Externos', 'Ambos'];
const it_bps = ['Luis Almeyda', 'Carlos Vargas', 'Ana Ramos', 'Jose Perez'];
const lideres = ['Johnny Rodriguez', 'Pedro Castillo', 'Martha Gomez', 'Sofia Lopez'];
const booleanos = ['SI', 'NO'];

export function generateMockData(): DashboardData {
  const iniciativas: Iniciativa[] = [];
  const today = new Date();
  
  const resumenPorEtapa: Record<string, number> = {};
  etapas.forEach(e => resumenPorEtapa[e] = 0);

  for (let i = 1; i <= 150; i++) {
    const etapa = etapas[Math.floor(Math.random() * etapas.length)];
    resumenPorEtapa[etapa]++;
    
    const daysAgo = Math.floor(Math.random() * 180);
    const created = subDays(today, daysAgo);
    const entrega = addDays(created, Math.floor(Math.random() * 90) + 30);
    
    // Simulate cost
    const costo_usd = Math.random() > 0.5 ? Math.floor(Math.random() * 50000) + 5000 : 0;
    const costo_soles = costo_usd * 3.75; // mocked exchange rate

    iniciativas.push({
      id: i,
      etapa_actual: etapa,
      fecha_registro: created.toISOString(),
      titulo: `Iniciativa Estratégica TI ${i}`,
      objetivo: `Objetivo de la iniciativa ${i} para la mejora continua`,
      institucion: instituciones[Math.floor(Math.random() * instituciones.length)],
      vp_solicitante: `Director TI Area ${Math.floor(Math.random() * 5)}`,
      usuario_negocio: `Gerente Negocio ${Math.floor(Math.random() * 10)}`,
      it_bp: it_bps[Math.floor(Math.random() * it_bps.length)],
      fecha_entrega_requerida: entrega.toISOString(),
      proyecto_spo: booleanos[Math.floor(Math.random() * 2)],
      tipo_iniciativa: 'Proyecto Core',
      pilar_estrategico: pilares[Math.floor(Math.random() * pilares.length)],
      estabilizacion_sis: booleanos[Math.floor(Math.random() * 2)],
      usuarios_beneficiados: 'Todos',
      beneficio_cuantitativo: `Ahorro estimado $${Math.floor(Math.random() * 100)}k`,
      complejidad: ['Alta', 'Media', 'Baja'][Math.floor(Math.random() * 3)],
      lider_dominio: lideres[Math.floor(Math.random() * lideres.length)],
      asignado_por: 'PMO',
      fecha_asignacion: null,
      duracion_meses: Math.floor(Math.random() * 6) + 1,
      costo_usd,
      costo_soles,
      tipo_recurso: recursos[Math.floor(Math.random() * recursos.length)],
      proyecto_o_req: 'Proyecto',
      funcionalidad_nueva: booleanos[Math.floor(Math.random() * 2)],
      estatus_estimacion: etapa === 'por_estimar' ? 'Pendiente' : 'Finalizada',
      accion_brm: 'Atender',
      prioridad_brm: prioridades_brm[Math.floor(Math.random() * prioridades_brm.length)],
      fecha_inicio_planificada: null,
      fecha_fin_planificada: null,
      impacto_sox: booleanos[Math.floor(Math.random() * 2)]
    });
  }

  return {
    ultima_actualizacion: new Date().toISOString(),
    tipo_de_cambio: 3.75,
    resumen: {
      total_iniciativas: 150,
      por_etapa: resumenPorEtapa
    },
    iniciativas: iniciativas.sort((a,b) => new Date(b.fecha_registro).getTime() - new Date(a.fecha_registro).getTime())
  };
}
