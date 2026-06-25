import { Iniciativa, DashboardData, EtapaPipeline } from './types';
import { subDays, addDays } from 'date-fns';

const instituciones = ['UPC', 'UPN', 'CIB', 'CORPORATIVO', 'LAUREATE'];
const pilares = [
  'Excelencia Operativa',
  'Transformación Digital',
  'Experiencia del Estudiante',
  'Calidad Académica',
  'Ciberseguridad',
];
const prioridades_brm = ['A', 'B', 'C'];
const etapas: EtapaPipeline[] = [
  'registro_incompleto',
  'por_estimar',
  'por_aprobar_estimacion',
  'por_habilitar_presupuesto',
  'por_planificar',
  'aprobar_planificacion',
  'planificadas',
  'eliminadas',
];

const recursos = ['Internos', 'Externos', 'Ambos'];
const it_bps = ['Luis Almeyda', 'Carlos Vargas', 'Ana Ramos', 'Jose Perez'];
const lideres = [
  'Johnny Rodriguez',
  'Pedro Castillo',
  'Martha Gomez',
  'Sofia Lopez',
  'Miguel Torres',
];
const complejidades = ['Alta', 'Media', 'Baja'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateMockData(): DashboardData {
  const iniciativas: Iniciativa[] = [];
  const today = new Date();

  const resumenPorEtapa: Record<string, number> = {};
  etapas.forEach(e => (resumenPorEtapa[e] = 0));

  for (let i = 1; i <= 150; i++) {
    const etapa = pick(etapas);
    resumenPorEtapa[etapa]++;

    const daysAgo = Math.floor(Math.random() * 180);
    const created = subDays(today, daysAgo);
    const entrega = addDays(created, Math.floor(Math.random() * 90) + 30);

    // null = sin costo asignado; distinto semánticamente de costo = 0
    const hasCost = Math.random() > 0.45;
    const costo_usd = hasCost ? Math.floor(Math.random() * 50000) + 5000 : null;
    const costo_soles = costo_usd !== null ? Math.round(costo_usd * 3.75) : null;

    iniciativas.push({
      id: i,
      etapa_actual: etapa,
      fecha_registro: created.toISOString(),
      titulo: `Iniciativa Estratégica TI ${String(i).padStart(3, '0')} — ${pick(pilares)}`,
      objetivo: `Mejorar la capacidad de ${pick(['atención', 'procesamiento', 'integración', 'monitoreo'])} del área solicitante mediante solución tecnológica.`,
      institucion: pick(instituciones),
      vp_solicitante: `VP Área ${Math.floor(Math.random() * 5) + 1}`,
      usuario_negocio: `Gerente Negocio ${Math.floor(Math.random() * 10) + 1}`,
      it_bp: pick(it_bps),
      fecha_entrega_requerida: entrega.toISOString(),
      proyecto_spo: pick(['SI', 'NO']),
      tipo_iniciativa: pick(['Proyecto Core', 'Requerimiento', 'Mejora Continua', 'Soporte']),
      pilar_estrategico: pick(pilares),
      estabilizacion_sis: pick(['SI', 'NO']),
      usuarios_beneficiados: pick(['Todos', 'Estudiantes', 'Docentes', 'Administrativos']),
      beneficio_cuantitativo: hasCost
        ? `Ahorro estimado S/ ${Math.floor(Math.random() * 200 + 20)}k`
        : 'Por cuantificar',
      complejidad: pick(complejidades),
      lider_dominio: pick(lideres),
      asignado_por: Math.random() > 0.3 ? 'PMO' : null,
      fecha_asignacion: null,
      duracion_meses: Math.floor(Math.random() * 6) + 1,
      costo_usd,
      costo_soles,
      tipo_recurso: pick(recursos),
      proyecto_o_req: pick(['Proyecto', 'Requerimiento']),
      funcionalidad_nueva: pick(['SI', 'NO']),
      estatus_estimacion: etapa === 'por_estimar' ? 'Pendiente' : 'Finalizada',
      accion_brm: null,
      prioridad_brm: pick(prioridades_brm),
      fecha_inicio_planificada:
        etapa === 'planificadas' ? addDays(today, 10).toISOString() : null,
      fecha_fin_planificada:
        etapa === 'planificadas' ? addDays(today, 120).toISOString() : null,
      impacto_sox: pick(['SI', 'NO', null] as Array<'SI' | 'NO' | null>),
      aprobar_estimacion: null,
      presupuesto_habilitado: null,
      planificacion_aprobada: null,
    });
  }

  return {
    ultima_actualizacion: new Date().toISOString(),
    tipo_de_cambio: 3.75,
    resumen: {
      total_iniciativas: iniciativas.length, // dinámico, no hardcodeado
      por_etapa: resumenPorEtapa,
    },
    iniciativas: iniciativas.sort(
      (a, b) => new Date(b.fecha_registro).getTime() - new Date(a.fecha_registro).getTime()
    ),
    mode: 'demanda',
  };
}
